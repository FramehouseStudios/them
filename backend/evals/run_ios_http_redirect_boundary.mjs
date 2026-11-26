import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {copyFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

assert.equal(process.platform, 'darwin', 'This probe requires native Apple Foundation, not Linux URLSession behavior.');
const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = mkdtempSync(path.join(tmpdir(), 'them-http-redirect-'));
copyFileSync(path.join(root, 'backend/tests/fixtures/http_redirect_probe.swift'), path.join(evidence, 'main.swift'));
const binary = path.join(evidence, 'probe');
const compile = spawnSync('/usr/bin/swiftc', [path.join(root, 'them/BackendHTTPRedirectGuard.swift'),
  path.join(evidence, 'main.swift'), '-o', binary], {encoding:'utf8', maxBuffer:2*1024*1024});
assert.equal(compile.status, 0, compile.stderr);
console.log('native_probe_evidence=' + evidence);
const foreign = [], same = [];
const capture = async req => {
  let bodyBytes = 0;
  for await (const chunk of req) bodyBytes += chunk.length;
  return {method:req.method, app:!!req.headers['x-app-token'], client:!!req.headers['x-client-token'],
    byok:!!req.headers['xi-api-key'], auth:!!req.headers.authorization, bodyBytes};
};
const target = http.createServer(async (req,res) => {
  foreign.push(await capture(req)); res.writeHead(200); res.end('{}');
});
const source = http.createServer(async (req,res) => {
  if (req.url === '/final') { same.push(await capture(req)); res.writeHead(200); res.end('{}'); return; }
  await capture(req);
  const [,transport,kind,rawCode] = req.url.split('/');
  if (!['data','bytes'].includes(transport) || !['cross','same'].includes(kind) || !['302','307'].includes(rawCode)) {
    res.writeHead(400); res.end(); return;
  }
  const location = kind === 'same' ? '/final' : `http://localhost:${target.address().port}/final`;
  res.writeHead(Number(rawCode),{Location:location}); res.end('{}');
});
try {
  target.listen(0,'127.0.0.1'); await once(target,'listening');
  source.listen(0,'127.0.0.1'); await once(source,'listening');
  const child = spawn(binary,[`http://127.0.0.1:${source.address().port}`],{stdio:['ignore','pipe','pipe']});
  let output = '', error = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { error += b; });
  const [status] = await once(child,'exit');
  console.log(JSON.stringify({status,cases:output.trim().split('\n'),foreignRequests:foreign.length,same},null,2));
  assert.equal(status,0,error);
  assert.equal(foreign.length,0,'A foreign origin received a redirected request');
  assert.equal(same.length,4);
  for (const [i,r] of same.entries()) {
    assert.equal(r.app && r.client && r.byok && r.auth,true);
    assert.equal(r.method,i % 2 ? 'POST' : 'GET');
    assert.equal(r.bodyBytes,i % 2 ? Buffer.byteLength('synthetic-only') : 0);
  }
} finally { source.closeAllConnections();target.closeAllConnections();source.close();target.close(); }
