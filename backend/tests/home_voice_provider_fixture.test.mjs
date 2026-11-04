import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../evals/home_voice_provider_fixture.mjs', import.meta.url));
function run(source, overrides = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: {...process.env, NODE_ENV:'test', HOST:'127.0.0.1', THEM_HOME_VOICE_PROVIDER_FIXTURE:'1', ...overrides},
  });
}
test('Home voice fixture refuses non-test, non-loopback and implicit use', () => {
  for (const overrides of [{NODE_ENV:'production'}, {HOST:'0.0.0.0'}, {THEM_HOME_VOICE_PROVIDER_FIXTURE:''}]) {
    const result = run(`await import(${JSON.stringify(fixture)});`, overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /restricted to an explicit loopback test process/);
  }
});
test('Home voice fixture blocks external requests and supplies both stream formats', () => {
  const source = `
    import assert from 'node:assert/strict';
    await import(${JSON.stringify(fixture)});
    await assert.rejects(fetch('https://example.com/private'), /External network blocked/);
    for (const route of ['responses', 'chat/completions']) {
      const response = await fetch('https://api.openai.com/v1/' + route, {body:JSON.stringify({stream:true})});
      assert.equal(response.headers.get('content-type'), 'text/event-stream');
      assert.match(await response.text(), /HOME VOICE HANDOFF/);
      const json = await fetch('https://api.openai.com/v1/' + route, {body:JSON.stringify({stream:false})});
      assert.ok(await json.json());
    }
    const audio = await fetch('https://api.openai.com/v1/audio/speech', {body:'{}'});
    assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await audio.arrayBuffer()).byteLength, 672);
  `;
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
});
test('Home voice synthetic scene passes the unchanged feature-opening quality gate', () => {
  const gate = fileURLToPath(new URL('../lib/studio_screenplay_quality_gate.js', import.meta.url));
  const source = `
    import assert from 'node:assert/strict';
    const {draft,story} = await import(${JSON.stringify(fixture)});
    const {evaluateStudioScreenplayReply} = await import(${JSON.stringify(gate)});
    const quality = evaluateStudioScreenplayReply({reply:draft,transcript:story,body:{
      screenplay_act:'Act I',
      screenplay_feature_obligation:'Plant the emotional question the ending must answer.'
    }});
    assert.equal(quality.ok,true,quality.reason);
  `;
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
});
