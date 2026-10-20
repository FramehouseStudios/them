import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionReachability } from './module_reachability.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = productionReachability(root);
console.log(JSON.stringify(report, null, 2));
// Deliberately strict: an inventory is not an exception or a production wire.
if (report.computed.length || report.modules.some(module => !module.reachable)) process.exitCode = 1;
