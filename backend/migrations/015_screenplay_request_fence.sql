-- Permanent request fences. Migration owner must be distinct from runtime login.
-- Never remove the guard or ledger after a proof has been issued.
BEGIN;
CREATE TABLE IF NOT EXISTS public.screenplay_request_fence (
 owner_key text NOT NULL, project_id text NOT NULL, request_id text NOT NULL,
 local_digest text NOT NULL, request_hash text NOT NULL,
 head_at_fence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_key, project_id, request_id)
);
REVOKE ALL ON public.screenplay_request_fence FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.screenplay_request_fence_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE p jsonb; v jsonb; pid text; rid text; vid text; old_count integer; new_count integer;
BEGIN
 -- A repeatable snapshot can miss a newer fence after owner deletion/recreation.
 IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'screenplay_fence_unsupported_isolation'; END IF;
 IF TG_OP='UPDATE' AND NEW.key IS DISTINCT FROM OLD.key THEN RAISE EXCEPTION 'screenplay_owner_key_immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.screenplay_request_fence WHERE owner_key=NEW.key) THEN RETURN NEW; END IF;
 -- Account purge keeps only the existing content-free owner tombstone; the
 -- independent request ledger is deliberately not cascaded or removed.
 IF jsonb_typeof(NEW.value)='object' AND NEW.value->'screenplayOwnerTombstone'='true'::jsonb
    AND jsonb_typeof(NEW.value->'version')='number' AND jsonb_typeof(NEW.value->'deletedAt')='number'
    AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.value) k WHERE k NOT IN ('screenplayOwnerTombstone','version','deletedAt')) THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.value->'projects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'screenplay_fence_invalid_projects'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.value->'projects') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'screenplay_fence_duplicate_projects'; END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(NEW.value->'projects') LOOP
  pid:=p->>'id';
  IF jsonb_typeof(p) <> 'object' OR pid IS NULL OR pid !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN RAISE EXCEPTION 'screenplay_fence_invalid_project'; END IF;
  IF EXISTS(SELECT 1 FROM public.screenplay_request_fence f WHERE f.owner_key=NEW.key AND f.project_id=pid) THEN
   IF jsonb_typeof(p->'versions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'screenplay_fence_invalid_versions'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'versions') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'screenplay_fence_duplicate_versions'; END IF;
   FOR v IN SELECT * FROM jsonb_array_elements(p->'versions') LOOP
    vid:=v->>'id';
    IF jsonb_typeof(v) <> 'object' OR vid IS NULL OR vid !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN RAISE EXCEPTION 'screenplay_fence_invalid_version'; END IF;
    IF v ? 'clientRequestId' AND v ? 'client_request_id' AND (v->>'clientRequestId') IS DISTINCT FROM (v->>'client_request_id') THEN RAISE EXCEPTION 'screenplay_fence_ambiguous_request'; END IF;
    rid:=COALESCE(NULLIF(v->>'clientRequestId',''),NULLIF(v->>'client_request_id',''));
    IF rid IS NULL OR rid !~ '^[A-Za-z0-9_.:-]{1,96}$' THEN
     IF TG_OP <> 'UPDATE' OR jsonb_typeof(OLD.value->'projects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'screenplay_fence_missing_request'; END IF;
     SELECT count(*) INTO old_count FROM jsonb_array_elements(OLD.value->'projects') op CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(op->'versions')='array' THEN op->'versions' ELSE '[]'::jsonb END) ov WHERE op->>'id'=pid AND ov=v;
     SELECT count(*) INTO new_count FROM jsonb_array_elements(p->'versions') nv WHERE nv=v;
     IF old_count=0 OR new_count>old_count THEN RAISE EXCEPTION 'screenplay_fence_missing_request'; END IF;
    ELSIF EXISTS(SELECT 1 FROM public.screenplay_request_fence f WHERE f.owner_key=NEW.key AND f.project_id=pid AND f.request_id=rid) THEN
     RAISE EXCEPTION 'screenplay_request_fenced';
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.screenplay_request_fence_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS screenplay_request_fence_guard ON public.persistence_screenplay;
CREATE TRIGGER screenplay_request_fence_guard BEFORE INSERT OR UPDATE ON public.persistence_screenplay FOR EACH ROW EXECUTE FUNCTION public.screenplay_request_fence_guard();
ALTER TABLE public.persistence_screenplay ENABLE ALWAYS TRIGGER screenplay_request_fence_guard;

-- Single statement/transaction: owner-row change forces pre-fence RR/SERIALIZABLE
-- snapshots to abort. The caller must be a restricted runtime login, never owner.
CREATE OR REPLACE FUNCTION public.screenplay_block_request(p_owner text,p_project text,p_request text,p_local_digest text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE owner_value jsonb; project jsonb; versions jsonb; version jsonb; found_count integer; head text; existing public.screenplay_request_fence%ROWTYPE; owner_role oid; guard_oid oid;
BEGIN
 IF p_owner IS NULL OR length(p_owner)>160 OR p_project IS NULL OR p_request IS NULL OR p_local_digest IS NULL OR p_request_hash IS NULL OR p_project !~ '^[A-Za-z0-9_.:-]{1,64}$' OR p_request !~ '^[A-Za-z0-9_.:-]{1,96}$' OR p_local_digest !~ '^[a-f0-9]{64}$' OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'screenplay_fence_invalid_input'; END IF;
 LOCK TABLE public.persistence_screenplay IN ROW EXCLUSIVE MODE;
 SELECT relowner INTO owner_role FROM pg_catalog.pg_class WHERE oid='public.persistence_screenplay'::regclass;
 IF (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) OR pg_has_role(session_user,owner_role,'MEMBER') OR has_table_privilege(session_user,'public.persistence_screenplay','TRIGGER') OR has_table_privilege(session_user,'public.screenplay_request_fence','INSERT,UPDATE,DELETE,TRUNCATE') OR has_schema_privilege(session_user,'public','CREATE') OR pg_has_role(session_user,(SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.screenplay_request_fence'::regclass),'MEMBER') OR pg_has_role(session_user,(SELECT proowner FROM pg_catalog.pg_proc WHERE oid='public.screenplay_request_fence_guard()'::regprocedure),'MEMBER') OR pg_has_role(session_user,(SELECT proowner FROM pg_catalog.pg_proc WHERE oid='public.screenplay_block_request(text,text,text,text,text)'::regprocedure),'MEMBER') OR current_setting('role') NOT IN ('none',session_user) THEN RAISE EXCEPTION 'screenplay_fence_unsafe_role'; END IF;
 guard_oid:='public.screenplay_request_fence_guard()'::regprocedure;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=guard_oid AND md5(prosrc)='47186deb528b61e739abf9988feb2c00' AND provolatile='v' AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN RAISE EXCEPTION 'screenplay_fence_guard_invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.persistence_screenplay'::regclass AND tgname='screenplay_request_fence_guard' AND tgfoid=guard_oid AND tgenabled='A' AND tgtype=23 AND tgattr::text='' AND tgqual IS NULL AND tgnargs=0 AND NOT tgisinternal) THEN RAISE EXCEPTION 'screenplay_fence_guard_missing'; END IF;
 -- Another BEFORE INSERT/UPDATE trigger could mutate NEW after the guard.
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.persistence_screenplay'::regclass AND NOT tgisinternal AND tgname<>'screenplay_request_fence_guard' AND (tgtype::integer & 2)=2 AND (tgtype::integer & 20)<>0) THEN RAISE EXCEPTION 'screenplay_fence_competing_trigger'; END IF;
 SELECT value INTO owner_value FROM public.persistence_screenplay WHERE key=p_owner FOR UPDATE;
 IF NOT FOUND OR owner_value->>'ownerKey' IS DISTINCT FROM p_owner OR jsonb_typeof(owner_value->'projects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'screenplay_fence_owner_missing'; END IF;
 SELECT count(*) INTO found_count FROM jsonb_array_elements(owner_value->'projects') x WHERE x->>'id'=p_project;
 IF found_count<>1 THEN RAISE EXCEPTION 'screenplay_fence_project_missing'; END IF;
 SELECT x INTO project FROM jsonb_array_elements(owner_value->'projects') x WHERE x->>'id'=p_project;
 versions:=project->'versions'; IF jsonb_typeof(versions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'screenplay_fence_invalid_versions'; END IF;
 head:=COALESCE(NULLIF(project->>'activeVersionId',''),NULLIF(project->>'lastVersionId',''),'');
 SELECT count(*) INTO found_count FROM jsonb_array_elements(versions) v WHERE COALESCE(NULLIF(v->>'clientRequestId',''),NULLIF(v->>'client_request_id',''))=p_request;
 IF found_count>1 THEN RAISE EXCEPTION 'screenplay_fence_ambiguous_saved'; END IF;
 IF found_count=1 THEN
  SELECT v INTO version FROM jsonb_array_elements(versions) v WHERE COALESCE(NULLIF(v->>'clientRequestId',''),NULLIF(v->>'client_request_id',''))=p_request;
  IF COALESCE(version->>'saveRequestHash',version->>'save_request_hash','')<>p_request_hash THEN RAISE EXCEPTION 'screenplay_fence_request_reused'; END IF;
  RETURN jsonb_build_object('kind','already_saved','project',project,'version',version,'head',head);
 END IF;
 SELECT * INTO existing FROM public.screenplay_request_fence WHERE owner_key=p_owner AND project_id=p_project AND request_id=p_request;
 IF FOUND THEN
  IF existing.local_digest<>p_local_digest OR existing.request_hash<>p_request_hash THEN RAISE EXCEPTION 'screenplay_fence_request_reused'; END IF;
  RETURN jsonb_build_object('kind','blocked','head',existing.head_at_fence);
 END IF;
 IF (SELECT count(*) FROM public.screenplay_request_fence WHERE owner_key=p_owner)>=4096 THEN RAISE EXCEPTION 'screenplay_fence_capacity'; END IF;
 INSERT INTO public.screenplay_request_fence(owner_key,project_id,request_id,local_digest,request_hash,head_at_fence) VALUES(p_owner,p_project,p_request,p_local_digest,p_request_hash,head);
 -- Trigger sees our tentative fence and validates the current owner before
 -- commit. The actual row update also invalidates stale RR snapshots.
 UPDATE public.persistence_screenplay SET value=value WHERE key=p_owner;
 RETURN jsonb_build_object('kind','blocked','head',head);
END $$;
REVOKE ALL ON FUNCTION public.screenplay_block_request(text,text,text,text,text) FROM PUBLIC;
COMMIT;
