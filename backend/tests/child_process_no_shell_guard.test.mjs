// Security regression guard for backend child-process usage.
//
// Shell-interpreted execution is forbidden. The backend may use spawn or
// execFile families, but production's one reviewed execFile call must remain
// a literal `osascript` invocation with a separate argument array.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import { simple as walk } from "acorn-walk";

const guardFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(guardFile), "..");
const forbiddenMethods = new Set(["exec", "execSync"]);

function isChildProcessSpecifier(value) {
  return value === "child_process" || value === "node:child_process";
}

function staticPropertyName(node) {
  if (!node) return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal") return String(node.property.value);
  return null;
}

function unwrapAwait(node) {
  return node?.type === "AwaitExpression" ? node.argument : node;
}

function isChildProcessLoader(node) {
  const value = unwrapAwait(node);
  if (value?.type === "ImportExpression") return isChildProcessSpecifier(value.source?.value);
  return value?.type === "CallExpression"
    && value.callee?.type === "Identifier"
    && value.callee.name === "require"
    && value.arguments.length === 1
    && isChildProcessSpecifier(value.arguments[0]?.value);
}

function location(file, node, message) {
  return `${file}:${node.loc.start.line}:${node.loc.start.column + 1}: ${message}`;
}

function auditSource(file, source) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
  });
  const offenders = [];
  const childProcessNamespaces = new Set();

  walk(ast, {
    ImportDeclaration(node) {
      if (!isChildProcessSpecifier(node.source.value)) return;
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportSpecifier" && forbiddenMethods.has(specifier.imported.name)) {
          offenders.push(location(file, specifier, `imports forbidden ${specifier.imported.name}`));
        }
        if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
          childProcessNamespaces.add(specifier.local.name);
        }
      }
    },
    VariableDeclarator(node) {
      if (!isChildProcessLoader(node.init)) return;
      if (node.id.type === "Identifier") {
        childProcessNamespaces.add(node.id.name);
        return;
      }
      if (node.id.type !== "ObjectPattern") return;
      for (const property of node.id.properties) {
        const importedName = property.key?.name ?? property.key?.value;
        if (forbiddenMethods.has(importedName)) {
          offenders.push(location(file, property, `destructures forbidden ${importedName}`));
        }
      }
    },
  });

  walk(ast, {
    VariableDeclarator(node) {
      if (node.id.type !== "ObjectPattern"
        || node.init?.type !== "Identifier"
        || !childProcessNamespaces.has(node.init.name)) return;
      for (const property of node.id.properties) {
        const importedName = property.key?.name ?? property.key?.value;
        if (forbiddenMethods.has(importedName)) {
          offenders.push(location(file, property, `destructures forbidden ${importedName} from child_process namespace`));
        }
      }
    },
    MemberExpression(node) {
      const method = staticPropertyName(node);
      if (!forbiddenMethods.has(method)) return;
      const directLoader = isChildProcessLoader(node.object);
      const namespace = node.object?.type === "Identifier" && childProcessNamespaces.has(node.object.name);
      if (directLoader || namespace) {
        offenders.push(location(file, node, `accesses forbidden child_process.${method}`));
      }
    },
    Property(node) {
      const key = node.computed ? node.key?.value : node.key?.name ?? node.key?.value;
      if (key === "shell" && node.value?.type === "Literal" && node.value.value === true) {
        offenders.push(location(file, node, "sets shell: true"));
      }
    },
  });

  return offenders;
}

function listBackendSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listBackendSourceFiles(absolute));
    else if (/\.(?:c|m)?js$/.test(entry.name) && absolute !== guardFile) files.push(absolute);
  }
  return files;
}

test("[child-process] every backend JavaScript source avoids shell execution", () => {
  const offenders = [];
  for (const file of listBackendSourceFiles(backendRoot)) {
    const relative = path.relative(backendRoot, file);
    offenders.push(...auditSource(relative, fs.readFileSync(file, "utf8")));
  }
  assert.deepEqual(offenders, [], `unsafe child-process usage:\n${offenders.join("\n")}`);
});

test("[child-process] guard rejects ESM, CommonJS, namespace, and shell forms", () => {
  const unsafeSources = [
    `import { exec } from "node:child_process"; exec("whoami");`,
    `const { execSync: run } = require("child_process"); run("whoami");`,
    `import * as childProcess from "node:child_process"; childProcess.exec("whoami");`,
    `import * as childProcess from "node:child_process"; const { exec } = childProcess;`,
    `const childProcess = require("child_process"); childProcess["execSync"]("whoami");`,
    `require("node:child_process").exec("whoami");`,
    `const childProcess = await import("node:child_process"); childProcess.exec("whoami");`,
    `spawn("tool", [], { shell: true });`,
  ];
  for (const [index, source] of unsafeSources.entries()) {
    assert.notDeepEqual(auditSource(`fixture-${index}.mjs`, source), [], source);
  }
});

test("[child-process] production keeps one literal osascript execFile call", () => {
  const source = fs.readFileSync(path.join(backendRoot, "index.js"), "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const execFileCalls = [];
  walk(ast, {
    CallExpression(node) {
      if (node.callee?.type === "Identifier" && node.callee.name === "execFile") {
        execFileCalls.push(node);
      }
    },
  });
  assert.equal(execFileCalls.length, 1, "production must have exactly one reviewed execFile call");
  const [program, args] = execFileCalls[0].arguments;
  assert.equal(program?.type, "Literal", "execFile program must be a string literal");
  assert.equal(program?.value, "osascript", "only the reviewed osascript program is allowed");
  assert.equal(args?.type, "ArrayExpression", "execFile arguments must be passed as an array");
});
