import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';

// Follow production entrypoints, not imports from tests or disconnected modules.
// Literal dynamic imports count as edges; computed imports are reported for review.
export function moduleImports(source) {
  const imports = [];
  const computed = [];
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const add = node => {
    if (typeof node?.value === 'string') imports.push(node.value);
    else computed.push(node?.loc?.start.line || 0);
  };
  simple(ast, {
    ImportDeclaration: node => add(node.source),
    ExportNamedDeclaration: node => { if (node.source) add(node.source); },
    ExportAllDeclaration: node => add(node.source),
    ImportExpression: node => add(node.source),
    CallExpression: node => {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') add(node.arguments[0]);
    },
  });
  return { imports: [...new Set(imports)], computed };
}

export function productionReachability(root, entrypoints = ['index.js']) {
  const reachable = new Set();
  const parents = new Map();
  const computed = [];
  const pending = entrypoints.map(entry => path.resolve(root, entry));
  while (pending.length) {
    const file = pending.shift();
    if (reachable.has(file)) continue;
    reachable.add(file);
    if (!/\.[cm]?js$/.test(file)) continue;
    const parsed = moduleImports(fs.readFileSync(file, 'utf8'));
    for (const line of parsed.computed) computed.push({ file: path.relative(root, file), line });
    for (const specifier of parsed.imports) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!fs.existsSync(resolved)) throw new Error(`Unresolved import: ${file} -> ${specifier}`);
      if (!parents.has(resolved)) parents.set(resolved, file);
      pending.push(resolved);
    }
  }
  const directory = path.join(root, 'lib/clementine');
  const modules = fs.readdirSync(directory, { recursive: true })
    .filter(name => /\.[cm]?js$/.test(name) && fs.statSync(path.join(directory, name)).isFile()).sort();
  return {
    modules: modules.map(name => {
      const file = path.join(directory, name);
      return { name, reachable: reachable.has(file), importedBy: parents.has(file) ? path.relative(root, parents.get(file)) : null };
    }),
    computed,
  };
}
