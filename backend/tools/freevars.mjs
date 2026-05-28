// Deterministic free-variable analyzer (dev/test tooling only — NOT runtime
// app behavior). Uses acorn for parsing. Computes the exact set of
// identifiers a function references but does not bind in any enclosing
// scope inside itself: i.e. the lexical closure it needs from outside.
//
// Used by the Phase 7b extraction to derive the createTalkHandler
// dependency boundary deterministically, and by
// backend/tests/talk_handler_closure.test.mjs to prove that boundary is
// complete (zero unaccounted free variables).
//
// Correctness notes:
//  - var / function declarations hoist to the nearest function scope.
//  - let / const / class are block-scoped.
//  - params (incl. destructuring / defaults / rest) bind in the function.
//  - catch binding (optional) is block-scoped to the handler.
//  - for / for-in / for-of loop bindings are scoped to the loop.
//  - member `.prop`, non-shorthand/non-computed object keys, method/class
//    keys, labels, and declaration ids are NOT references.

import * as acorn from "acorn";

const JS_GLOBALS = new Set([
  // ECMAScript
  "Object", "Array", "String", "Number", "Boolean", "BigInt", "Symbol",
  "Math", "JSON", "Date", "RegExp", "Map", "Set", "WeakMap", "WeakSet",
  "Promise", "Proxy", "Reflect", "Error", "EvalError", "RangeError",
  "ReferenceError", "SyntaxError", "TypeError", "URIError", "AggregateError",
  "Function", "Infinity", "NaN", "undefined", "globalThis", "parseInt",
  "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI", "escape", "unescape",
  "Intl", "ArrayBuffer", "SharedArrayBuffer", "DataView", "Atomics",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array",
  "Uint16Array", "Int32Array", "Uint32Array", "Float32Array",
  "Float64Array", "BigInt64Array", "BigUint64Array", "WeakRef",
  "FinalizationRegistry", "eval", "arguments", "this",
  // Node / web platform globals available without import
  "process", "Buffer", "console", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "setImmediate", "clearImmediate",
  "queueMicrotask", "structuredClone", "fetch", "Headers", "Request",
  "Response", "FormData", "Blob", "AbortController", "AbortSignal",
  "TextEncoder", "TextDecoder", "URL", "URLSearchParams", "performance",
  "crypto", "btoa", "atob", "MessageChannel", "MessagePort", "Event",
  "EventTarget", "ReadableStream", "WritableStream", "TransformStream",
  "CompressionStream", "DecompressionStream", "__dirname", "__filename",
  "module", "require", "exports", "import",
]);

function declarePatternNames(node, add) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": add(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) {
        if (p.type === "RestElement") declarePatternNames(p.argument, add);
        else declarePatternNames(p.value, add);
      }
      break;
    case "ArrayPattern":
      for (const el of node.elements) if (el) declarePatternNames(el, add);
      break;
    case "AssignmentPattern": declarePatternNames(node.left, add); break;
    case "RestElement": declarePatternNames(node.argument, add); break;
    default: break;
  }
}

// Collect var + function-declaration names hoisted into a function scope,
// descending through blocks but NOT into nested functions.
function collectHoisted(body, addVar) {
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "VariableDeclaration":
        if (node.kind === "var") {
          for (const d of node.declarations) declarePatternNames(d.id, addVar);
        }
        break;
      case "FunctionDeclaration":
        if (node.id) addVar(node.id.name);
        return; // do not descend into the function body
      case "FunctionExpression":
      case "ArrowFunctionExpression":
      case "ClassDeclaration":
      case "ClassExpression":
        return; // nested scopes handled elsewhere
      default: break;
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && visit(c));
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  body.forEach(visit);
}

// Returns the sorted array of free identifier names referenced by the
// first function (FunctionDeclaration/Expression/Arrow) found in `code`.
export function freeIdentifiers(code, { ecmaVersion = "latest" } = {}) {
  const program = acorn.parse(code, {
    ecmaVersion,
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
  });

  let fn = null;
  (function find(n) {
    if (fn || !n || typeof n.type !== "string") return;
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") { fn = n; return; }
    for (const k of Object.keys(n)) {
      if (k === "type") continue;
      const c = n[k];
      if (Array.isArray(c)) c.forEach((x) => x && typeof x.type === "string" && find(x));
      else if (c && typeof c.type === "string") find(c);
    }
  })(program);
  if (!fn) throw new Error("freeIdentifiers: no function found in code");

  const free = new Set();

  // scope: { vars:Set, parent, isFunction:boolean }
  function makeScope(parent, isFunction) {
    return { vars: new Set(), parent, isFunction };
  }
  function resolve(name, scope) {
    for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return true;
    return false;
  }

  // Walk an expression/statement subtree with a given scope chain.
  function walk(node, scope, fnScope) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "Identifier": {
        const n = node.name;
        if (!resolve(n, scope) && !JS_GLOBALS.has(n)) free.add(n);
        return;
      }
      case "MemberExpression":
        walk(node.object, scope, fnScope);
        if (node.computed) walk(node.property, scope, fnScope);
        return;
      case "Property":
        if (node.computed) walk(node.key, scope, fnScope);
        // shorthand -> value === key Identifier IS a reference
        walk(node.value, scope, fnScope);
        return;
      case "MethodDefinition":
      case "PropertyDefinition":
        if (node.computed) walk(node.key, scope, fnScope);
        if (node.value) walk(node.value, scope, fnScope);
        return;
      case "LabeledStatement":
        walk(node.body, scope, fnScope);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return; // label identifiers are not references
      case "VariableDeclaration": {
        const block = node.kind === "var" ? fnScope : scope;
        for (const d of node.declarations) {
          if (d.init) walk(d.init, scope, fnScope);
          declarePatternNames(d.id, (x) => block.vars.add(x));
          // walk computed keys / defaults inside the pattern
          walkPattern(d.id, scope, fnScope);
        }
        return;
      }
      case "FunctionDeclaration": {
        // name already hoisted by caller; analyze its body in a new scope
        analyzeFunction(node, scope);
        return;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        analyzeFunction(node, scope);
        return;
      }
      case "ClassDeclaration":
      case "ClassExpression": {
        const cs = makeScope(scope, false);
        if (node.id) cs.vars.add(node.id.name);
        if (node.superClass) walk(node.superClass, scope, fnScope);
        if (node.body) for (const el of node.body.body) walk(el, cs, fnScope);
        return;
      }
      case "BlockStatement": {
        const bs = makeScope(scope, false);
        hoistBlockDecls(node.body, bs);
        for (const s of node.body) walk(s, bs, fnScope);
        return;
      }
      case "ForStatement": {
        const fs = makeScope(scope, false);
        if (node.init) {
          if (node.init.type === "VariableDeclaration") walk(node.init, fs, fnScope);
          else walk(node.init, fs, fnScope);
        }
        if (node.test) walk(node.test, fs, fnScope);
        if (node.update) walk(node.update, fs, fnScope);
        walk(node.body, fs, fnScope);
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const fs = makeScope(scope, false);
        if (node.left.type === "VariableDeclaration") {
          const block = node.left.kind === "var" ? fnScope : fs;
          for (const d of node.left.declarations) declarePatternNames(d.id, (x) => block.vars.add(x));
        } else {
          walk(node.left, fs, fnScope);
        }
        walk(node.right, scope, fnScope);
        walk(node.body, fs, fnScope);
        return;
      }
      case "CatchClause": {
        const cs = makeScope(scope, false);
        if (node.param) declarePatternNames(node.param, (x) => cs.vars.add(x));
        walk(node.body, cs, fnScope);
        return;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
          const child = node[key];
          if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && walk(c, scope, fnScope));
          else if (child && typeof child.type === "string") walk(child, scope, fnScope);
        }
      }
    }
  }

  // Walk default-value/computed-key expressions embedded in a binding pattern.
  function walkPattern(pat, scope, fnScope) {
    if (!pat) return;
    if (pat.type === "AssignmentPattern") walk(pat.right, scope, fnScope);
    else if (pat.type === "ObjectPattern") {
      for (const p of pat.properties) {
        if (p.type === "RestElement") walkPattern(p.argument, scope, fnScope);
        else { if (p.computed) walk(p.key, scope, fnScope); walkPattern(p.value, scope, fnScope); }
      }
    } else if (pat.type === "ArrayPattern") {
      for (const el of pat.elements) if (el) walkPattern(el, scope, fnScope);
    } else if (pat.type === "RestElement") walkPattern(pat.argument, scope, fnScope);
  }

  function hoistBlockDecls(stmts, blockScope) {
    for (const s of stmts) {
      if (s.type === "VariableDeclaration" && s.kind !== "var") {
        for (const d of s.declarations) declarePatternNames(d.id, (x) => blockScope.vars.add(x));
      } else if (s.type === "ClassDeclaration" && s.id) {
        blockScope.vars.add(s.id.name);
      } else if (s.type === "FunctionDeclaration" && s.id) {
        blockScope.vars.add(s.id.name);
      }
    }
  }

  function analyzeFunction(node, parentScope) {
    const fscope = makeScope(parentScope, true);
    if ((node.type === "FunctionExpression" || node.type === "FunctionDeclaration") && node.id) {
      // named function expression: name visible inside itself
      fscope.vars.add(node.id.name);
    }
    if (node.type !== "ArrowFunctionExpression") fscope.vars.add("arguments");
    for (const p of node.params) {
      declarePatternNames(p, (x) => fscope.vars.add(x));
    }
    // default param expressions evaluate in the function scope
    for (const p of node.params) walkPattern(p, fscope, fscope);
    if (node.body.type === "BlockStatement") {
      collectHoisted(node.body.body, (x) => fscope.vars.add(x));
      hoistBlockDecls(node.body.body, fscope);
      for (const s of node.body.body) walk(s, fscope, fscope);
    } else {
      walk(node.body, fscope, fscope); // concise arrow body
    }
  }

  analyzeFunction(fn, makeScope(null, false));
  return [...free].sort();
}
