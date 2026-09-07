import test from "node:test"; import assert from "node:assert/strict";
import { applyCollabEdits } from "../lib/clementine/collab_edit.js";
import { buildCommentary } from "../lib/clementine/director_commentary.js";
import { exportAndShare } from "../lib/clementine/export_share.js";
test("collab 2 writers", ()=>{ const d="INT. A\n\nJohn\nhello\n\nJane\nhi"; const r=applyCollabEdits(d,[{page:1,line:2,character:"John",newText:"John\nhey"}]); assert.ok(r.includes("hey")); });
test("commentary", ()=>{ const c=buildCommentary({ project:{characterContexts:[{name:"John"}]}, draft:"INT.", page:1 }); assert.ok(c.xCommentary); });
test("export share", ()=>{ const e=exportAndShare({ project:{id:"p1"}, draft:"INT. A", format:"fdx" }); assert.ok(e.link.includes("p1")); assert.ok(e.fdx.includes("FinalDraft")); });
