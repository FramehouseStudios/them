import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { productionReachability } from '../tools/module_reachability.mjs';

test('Clementine modules must be production reachable or deleted', () => {
  const report = productionReachability(fileURLToPath(new URL('../', import.meta.url)));
  assert.deepEqual(report.computed, [], 'Review computed imports before trusting the graph');
  const orphans = report.modules.filter(module => !module.reachable).map(module => module.name);
  assert.deepEqual(orphans, [], `Wire or delete these modules; tests and dummy imports are not product wiring:\n${orphans.join('\n')}`);
});
