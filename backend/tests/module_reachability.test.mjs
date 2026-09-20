import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { moduleImports, productionReachability } from '../tools/module_reachability.mjs';

test('reachability parses static, re-export, and literal dynamic imports', () => {
  const result = moduleImports(`
    import x from './a.js'; export { x } from './b.js';
    export * from './c.js'; await import('./d.js');
    const y = require('./e.js');
    // import './not-an-import.js';
    const text = "import './also-not-an-import.js'";
  `);
  assert.deepEqual(result.imports, ['./a.js', './b.js', './c.js', './d.js', './e.js']);
  assert.deepEqual(result.computed, []);
});

test('computed imports require explicit review, not a false clean graph', () => {
  assert.deepEqual(moduleImports('await import(providerPath);').computed, [1]);
});

test('disconnected import cycles and test imports do not make a module production reachable', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'them-module-graph-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'lib/clementine'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'index.js'), "import './lib/clementine/live.js';");
  fs.writeFileSync(path.join(root, 'lib/clementine/live.js'), "await import('./leaf.js');");
  fs.writeFileSync(path.join(root, 'lib/clementine/leaf.js'), "export const value = 1;");
  fs.writeFileSync(path.join(root, 'lib/clementine/orphan.js'), "import './island.js';");
  fs.writeFileSync(path.join(root, 'lib/clementine/island.js'), "import './orphan.js';");
  fs.writeFileSync(path.join(root, 'tests/orphan.test.js'), "import '../lib/clementine/orphan.js';");
  const report = productionReachability(root);
  assert.deepEqual(report.modules.filter(m => m.reachable).map(m => m.name), ['leaf.js', 'live.js']);
  assert.deepEqual(report.modules.filter(m => !m.reachable).map(m => m.name), ['island.js', 'orphan.js']);
  assert.deepEqual(report.computed, []);
  fs.mkdirSync(path.join(root, 'lib/clementine/nested'));
  fs.writeFileSync(path.join(root, 'lib/clementine/nested/orphan.mjs'), 'export const value = 2;');
  assert.ok(productionReachability(root).modules.some(m => m.name === 'nested/orphan.mjs' && !m.reachable));
  fs.writeFileSync(path.join(root, 'index.js'), "import './missing.js';");
  assert.throws(() => productionReachability(root), /Unresolved import/);
});
