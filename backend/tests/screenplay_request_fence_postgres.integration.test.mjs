import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { apiRequest, startBackend } from './helpers/backend_test_server.mjs';

const runtimeURL = process.env.THEM_FENCE_RUNTIME_DATABASE_URL || '';
const adminURL = process.env.THEM_FENCE_ADMIN_DATABASE_URL || '';

test('authenticated PostgreSQL fence blocks legacy replay and permits a fresh request', { skip: !runtimeURL || !adminURL, timeout: 60000 }, async () => {
  for (const url of [runtimeURL, adminURL]) {
    const target = new URL(url);
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(target.hostname) && target.pathname === '/them_t1368f',
      'This test mutates a trigger and may only use its task-owned local database.');
  }
  const admin = new pg.Client({ connectionString: adminURL }); await admin.connect();
  const runtime = new pg.Client({ connectionString: runtimeURL }); await runtime.connect();
  let server;
  try {
    server = await startBackend({ env: { DATABASE_URL: runtimeURL, REQUIRE_USER_AUTH: '1' }, unsetEnv: ['REDIS_URL'] });
    const signup = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
      email: `fence-${randomUUID()}@example.test`, password: `Fence-${randomUUID()}-aA1!`,
    } });
    assert.equal(signup.status, 201);
    const headers = { Authorization: `Bearer ${signup.json.access_token}` };
    const create = await apiRequest(server, '/screenplay/projects', { method: 'POST', headers,
      json: { title: 'Fence test', project_id: `project-${randomUUID()}` } });
    assert.equal(create.status, 201);
    const project = create.json.project_id, path = `/screenplay/projects/${project}/version`;
    const save = json => apiRequest(server, path, { method: 'POST', headers, json });
    const first = await save({ draft: 'Original', client_request_id: 'original', source: 'studio_manual' });
    assert.equal(first.status, 201);
    const competing = await save({ draft: 'New head', base_version_id: first.json.version_id,
      client_request_id: 'competing', source: 'studio_manual' });
    assert.equal(competing.status, 201);
    const request = { draft: 'Writer exact words', phase: 'scene_draft', source: 'studio_custody_selected',
      title: 'Fence test', notes: '', base_version_id: first.json.version_id, client_request_id: 'held-request',
      conflict_strategy: 'reject_if_stale', local_request_digest: 'a'.repeat(64) };
    const proof = await apiRequest(server, `${path}/fence`, { method: 'POST', headers, json: request });
    assert.equal(proof.status, 200, JSON.stringify(proof.json));
    assert.equal(proof.json.stage, 'screenplay_version_fence');
    assert.equal(proof.json.status, 'future_delivery_blocked');
    assert.equal(proof.json.proof, 'pg_request_fence_v1');
    assert.equal(proof.json.local_request_digest, request.local_request_digest);
    assert.equal(proof.json.head_version_id_at_fence, competing.json.version_id);
    assert.match(proof.json.request_hash, /^[a-f0-9]{64}$/);
    const retry = await save({ ...request, conflict_strategy: 'allow' });
    assert.notEqual(retry.status, 201, 'An old-style allow write cannot deliver the fenced ID');
    const fresh = await save({ draft: request.draft, phase: request.phase, source: 'studio_manual',
      title: request.title, base_version_id: competing.json.version_id, client_request_id: 'fresh-request' });
    assert.equal(fresh.status, 201);
    const already = { ...request, client_request_id: 'already-saved', base_version_id: fresh.json.version_id };
    const saved = await save(already); assert.equal(saved.status, 201);
    const savedProof = await apiRequest(server, `${path}/fence`, { method: 'POST', headers, json: already });
    assert.equal(savedProof.status, 200); assert.equal(savedProof.json.status, 'already_saved');
    assert.equal(savedProof.json.proof, 'full_request_hash_v1');
    assert.equal(savedProof.json.version.id, saved.json.version_id);
    await assert.rejects(runtime.query('DELETE FROM public.screenplay_request_fence'));
    await assert.rejects(admin.query('SELECT public.screenplay_block_request($1,$2,$3,$4,$5)',
      [`user:unsafe`, project, 'unsafe', 'a'.repeat(64), 'b'.repeat(64)]), /screenplay_fence_unsafe_role/);
    const keyResult = await admin.query('SELECT key FROM public.persistence_screenplay WHERE value->\'projects\' @> $1::jsonb', [JSON.stringify([{ id: project }])]);
    assert.equal(keyResult.rowCount, 1);
    const ownerKey = keyResult.rows[0].key;
    // A temporary lookalike catalog cannot spoof the real trigger attestation.
    await runtime.query('CREATE TEMP TABLE pg_trigger(tgrelid oid,tgname text,tgfoid oid,tgenabled text,tgtype integer,tgattr text,tgqual text,tgnargs integer,tgisinternal boolean)');
    await admin.query('ALTER TABLE public.persistence_screenplay DISABLE TRIGGER screenplay_request_fence_guard');
    await assert.rejects(runtime.query('SELECT public.screenplay_block_request($1,$2,$3,$4,$5)',
      [ownerKey, project, 'temp-spoof', 'a'.repeat(64), 'b'.repeat(64)]), /screenplay_fence_guard_missing/);
    const unavailable = await apiRequest(server, `${path}/fence`, { method: 'POST', headers,
      json: { ...request, client_request_id: 'no-guard-request' } });
    assert.equal(unavailable.status, 503);
    assert.notEqual(unavailable.json.proof, 'pg_request_fence_v1');
    await admin.query('ALTER TABLE public.persistence_screenplay ENABLE ALWAYS TRIGGER screenplay_request_fence_guard');
    // A corrupted embedded owner cannot redirect privileged fencing to another owner.
    await admin.query("UPDATE public.persistence_screenplay SET value=jsonb_set(value,'{ownerKey}',to_jsonb($2::text)) WHERE key=$1", [ownerKey,'user:other-owner']);
    const corrupted = await apiRequest(server, `${path}/fence`, { method: 'POST', headers, json: { ...request, client_request_id: 'corrupt-owner' } });
    assert.equal(corrupted.status, 503); assert.notEqual(corrupted.json.proof, 'pg_request_fence_v1');
    await admin.query("UPDATE public.persistence_screenplay SET value=jsonb_set(value,'{ownerKey}',to_jsonb($1::text)) WHERE key=$1", [ownerKey]);
    const recovered = await apiRequest(server, `${path}/fence`, { method: 'POST', headers, json: { ...request, client_request_id: 'corrupt-owner' } });
    assert.equal(recovered.status, 200); assert.equal(recovered.json.status, 'future_delivery_blocked');
  } finally {
    await admin.query('ALTER TABLE public.persistence_screenplay ENABLE ALWAYS TRIGGER screenplay_request_fence_guard');
    if (server) await server.stop();
    await runtime.end(); await admin.end();
  }
});


test('PostgreSQL guard serializes legacy writers and fails closed on stale isolation', { skip: !runtimeURL || !adminURL, timeout: 30000 }, async () => {
  for (const url of [runtimeURL, adminURL]) { const u = new URL(url); assert.ok(['127.0.0.1','localhost','::1'].includes(u.hostname) && u.pathname === '/them_t1368f'); }
  const a = new pg.Client({ connectionString: runtimeURL }), b = new pg.Client({ connectionString: runtimeURL });
  await a.connect(); await b.connect();
  try {
    const owner = `test:${randomUUID()}`, project = `project-${randomUUID()}`, id = `request-${randomUUID()}`;
    const before = { ownerKey: owner, activeProjectId: project, projects: [{ id: project, activeVersionId: 'head', versions: [{ id: 'head', clientRequestId: 'seed' }, { id: 'legacy', draft: 'old no ID' }] }, { id: 'unfenced-project', versions: [] }] };
    const after = { ...before, projects: [{ ...before.projects[0], versions: [...before.projects[0].versions, { id: 'new', client_request_id: id }] }, before.projects[1]] };
    await a.query('INSERT INTO public.persistence_screenplay(key,value) VALUES($1,$2)', [owner,before]);
    await a.query('BEGIN');
    const receipt = await a.query('SELECT public.screenplay_block_request($1,$2,$3,$4,$5) r', [owner,project,id,'a'.repeat(64),'b'.repeat(64)]);
    assert.equal(receipt.rows[0].r.kind, 'blocked');
    const pending = b.query('INSERT INTO public.persistence_screenplay(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [owner,after]);
    await new Promise(resolve => setTimeout(resolve, 100));
    await a.query('COMMIT');
    await assert.rejects(pending, /screenplay_request_fenced/);
    await a.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,before]); // unchanged legacy no-ID is retained
    const noID = { ...before, projects: [{ ...before.projects[0], versions: [...before.projects[0].versions, { id:'new-no-id', draft:'new' }] }, before.projects[1]] };
    await assert.rejects(a.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,noID]), /screenplay_fence_missing_request/);
    const otherProject = { ...before, projects: [before.projects[0], { id:'unfenced-project', versions:[{ id:'unrelated', draft:'legacy' }] }] };
    await a.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,otherProject]);
    const tombstone = { screenplayOwnerTombstone: true, version: 1, deletedAt: 1 };
    await a.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,tombstone]);
    const afterPurge = { ...before, projects: [{ ...before.projects[0], versions: [{ id: 'new', client_request_id: id }] }, before.projects[1]] };
    await assert.rejects(a.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,afterPurge]), /screenplay_request_fenced/);
    await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await assert.rejects(b.query('UPDATE public.persistence_screenplay SET value=$2 WHERE key=$1', [owner,tombstone]), /screenplay_fence_unsupported_isolation/);
    await b.query('ROLLBACK');
  } finally { await a.end(); await b.end(); }
});


test('JSON persistence cannot issue a database fence proof', { timeout: 30000 }, async () => {
  const server = await startBackend({ env: { REQUIRE_USER_AUTH: '1' }, unsetEnv: ['DATABASE_URL', 'REDIS_URL'] });
  try {
    const signup = await apiRequest(server, '/auth/signup', { method:'POST', json:{ email:`json-fence-${randomUUID()}@example.test`,password:`Fence-${randomUUID()}-aA1!` } });
    assert.equal(signup.status,201);
    const headers={ Authorization:`Bearer ${signup.json.access_token}` };
    const project=await apiRequest(server,'/screenplay/projects',{method:'POST',headers,json:{title:'JSON project'}});
    assert.equal(project.status,201);
    const response=await apiRequest(server,`/screenplay/projects/${project.json.project_id}/version/fence`,{method:'POST',headers,json:{}});
    assert.equal(response.status,503); assert.notEqual(response.json.proof,'pg_request_fence_v1');
  } finally { await server.stop(); }
});
