import { readFileSync } from 'node:fs';
import path from 'node:path';
import remapping from '@jridgewell/remapping';
import { parse } from 'acorn';
import MagicString from 'magic-string';

let bindingCounter = 0;

function nextNsName() {
  return `__hmr_${bindingCounter++}`;
}

/**
 * @param {import('acorn').Node} node
 */
function isImportMetaHotAccept(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  let current = node.callee;
  if (
    current.type !== 'MemberExpression' ||
    current.property.type !== 'Identifier' ||
    current.property.name !== 'accept'
  ) {
    return false;
  }
  current = current.object;
  if (
    current.type !== 'MemberExpression' ||
    current.property.type !== 'Identifier' ||
    current.property.name !== 'hot'
  ) {
    return false;
  }
  current = current.object;
  if (current.type === 'MetaProperty') {
    return (
      current.meta.type === 'Identifier' &&
      current.meta.name === 'import' &&
      current.property.type === 'Identifier' &&
      current.property.name === 'meta'
    );
  }
  return false;
}

/**
 * @param {import('acorn').ImportDeclaration} node
 * @param {string} source
 */
function rewriteImport(node, source) {
  if (node.specifiers.length === 0) {
    return null;
  }
  if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
    return null;
  }

  const hasDefault = node.specifiers.some(s => s.type === 'ImportDefaultSpecifier');
  const hasNamed = node.specifiers.some(s => s.type === 'ImportSpecifier');
  const hasNamespace = node.specifiers.some(s => s.type === 'ImportNamespaceSpecifier');

  if (hasDefault && hasNamespace) {
    return null;
  }
  if (!hasDefault && !hasNamed && !hasNamespace) {
    return null;
  }

  const nsName = nextNsName();
  const specifierRaw = source.slice(node.source.start, node.source.end);
  const moduleSpecifier = node.source.value;

  const lets = [];
  const binds = [];
  const namedInits = [];

  for (const spec of node.specifiers) {
    if (spec.type === 'ImportDefaultSpecifier') {
      const name = spec.local.name;
      lets.push(`let ${name}=${nsName}.default`);
      binds.push(
        `__hmrBind(import.meta.url,${JSON.stringify(moduleSpecifier)},(s)=>import.meta.resolve(s),'default',(v)=>{${name}=v})`
      );
    } else if (spec.type === 'ImportSpecifier') {
      const local = spec.local.name;
      const imported =
        spec.imported.type === 'Identifier'
          ? spec.imported.name
          : spec.imported.value;
      lets.push(`let ${local}`);
      binds.push(
        `__hmrBind(import.meta.url,${JSON.stringify(moduleSpecifier)},(s)=>import.meta.resolve(s),${JSON.stringify(imported)},(v)=>{${local}=v})`
      );
      namedInits.push(`${local}=${nsName}.${imported}`);
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      const name = spec.local.name;
      lets.push(`let ${name}=${nsName}`);
      binds.push(
        `__hmrBind(import.meta.url,${JSON.stringify(moduleSpecifier)},(s)=>import.meta.resolve(s),'namespace',(v)=>{${name}=v})`
      );
    }
  }

  const importNs = `import * as ${nsName} from ${specifierRaw}`;
  const namedInit =
    namedInits.length > 0
      ? `;queueMicrotask(()=>{${namedInits.join(';')}})`
      : '';
  // Trailing semicolon: the replacement swallows the original statement's
  // terminator (node.end includes it), so without one the next statement
  // only survives via ASI — which single-line sources (minified output,
  // injected preludes, a statement after the import on the same line)
  // don't get.
  const replacement = `${importNs}; ${lets.join('; ')}; ${binds.join('; ')}${namedInit};`;
  return { start: node.start, end: node.end, replacement };
}

/**
 * @param {import('acorn').CallExpression} node
 * @param {string} source
 */
function rewriteAccept(node, source) {
  const args = node.arguments;
  if (args.length === 0 || args.length >= 2) {
    return null;
  }

  const first = args[0];
  const arg0Source = source.slice(first.start, first.end);
  let callback;

  if (first.type === 'Literal' && typeof first.value === 'string') {
    callback = `async()=>{await __hmrRefreshSpecifier(import.meta.url,(s)=>import.meta.resolve(s),${arg0Source})}`;
  } else if (first.type === 'ArrayExpression') {
    const specs = first.elements.filter(
      el => el?.type === 'Literal' && typeof el.value === 'string'
    );
    if (specs.length === 0) {
      return null;
    }
    callback = `async()=>{await __hmrRefreshSpecifiers(import.meta.url,(s)=>import.meta.resolve(s),${arg0Source})}`;
  } else if (
    first.type === 'FunctionExpression' ||
    first.type === 'ArrowFunctionExpression'
  ) {
    return null;
  } else {
    return null;
  }

  const calleeSource = source.slice(node.start, node.callee.end);
  const replacement = `${calleeSource}(${arg0Source},${callback})`;
  return { start: node.start, end: node.end, replacement };
}

/**
 * The source map a module arrived with, when the loader below this one (a
 * TypeScript or JSX transform, or a build that wrote `.map` files) left one:
 * the last `sourceMappingURL` comment, which is the one Node reads. An inline
 * `data:` URL is decoded; any other URL is read relative to the module.
 * Null when there is none, or it cannot be read or parsed.
 *
 * @param {string} source
 * @param {string} filename
 * @returns {{ map: object, start: number, end: number } | null}
 */
function incomingSourceMap(source, filename) {
  const comment = /\/\/[#@][ \t]+sourceMappingURL=([^\s'"]+)[ \t]*/g;
  let last = null;
  for (let match; (match = comment.exec(source)); ) {
    last = match;
  }
  if (!last) {
    return null;
  }
  const url = last[1];
  try {
    let json;
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      const meta = url.slice(5, comma);
      const data = url.slice(comma + 1);
      json = meta.endsWith(';base64')
        ? Buffer.from(data, 'base64').toString('utf8')
        : decodeURIComponent(data);
    } else {
      json = readFileSync(
        path.resolve(path.dirname(filename), decodeURI(url)),
        'utf8'
      );
    }
    return {
      map: JSON.parse(json),
      start: last.index,
      end: last.index + last[0].length
    };
  } catch {
    return null;
  }
}

/**
 * Transform static imports to mutable `let` bindings and auto-inject accept callbacks.
 *
 * Line numbers: each import is replaced one-for-one on the same line when the source
 * used one line per import; otherwise MagicString + inline source map preserves stacks
 * when Node is run with --enable-source-maps.
 *
 * `options.preamble` is prepended on lines of its own, and the map accounts for
 * them. A map the source arrived with is composed into the one returned, so a
 * position resolves to the file a loader below this one read rather than to
 * the code it handed over.
 *
 * @param {string} source
 * @param {string} filename
 * @param {{ preamble?: string }} [options]
 * @returns {{ code: string, map: object | null }}
 */
export function transformModuleSource(source, filename, options = {}) {
  const { preamble = '' } = options;
  bindingCounter = 0;

  /** @type {{ start: number, end: number, replacement: string }[]} */
  const edits = [];

  let ast = null;
  try {
    ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true
    });
  } catch {
    // left for Node to report; the preamble still goes on, and is mapped
  }

  if (ast) {
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        const edit = rewriteImport(node, source);
        if (edit) {
          edits.push(edit);
        }
      }
    }

    walk(ast, {
      CallExpression(node) {
        if (isImportMetaHotAccept(node)) {
          const edit = rewriteAccept(node, source);
          if (edit) {
            edits.push(edit);
          }
        }
      }
    });
  }

  // Untouched, the source keeps its own sourceMappingURL, which still holds.
  if (edits.length === 0 && !preamble) {
    return { code: source, map: null };
  }

  edits.sort((a, b) => b.start - a.start);

  const magic = new MagicString(source, { filename });
  for (const { start, end, replacement } of edits) {
    magic.overwrite(start, end, replacement, { contentOnly: true });
  }

  // The map returned replaces the incoming one, so its comment goes: the
  // line stays, empty, so nothing below it moves.
  const incoming = incomingSourceMap(source, filename);
  if (incoming && !edits.some(e => e.start < incoming.end && incoming.start < e.end)) {
    magic.remove(incoming.start, incoming.end);
  }

  if (preamble) {
    magic.prepend(`${preamble}\n`);
  }

  const own = magic.generateMap({
    source: filename,
    file: filename,
    hires: true,
    includeContent: true
  });

  const map = incoming
    ? JSON.parse(remapping([own, incoming.map], () => null).toString())
    : own;

  return { code: magic.toString(), map };
}

/**
 * @param {import('acorn').Node} node
 * @param {Record<string, (node: import('acorn').Node) => void>} visitors
 */
function walk(node, visitors) {
  if (!node || typeof node !== 'object') {
    return;
  }
  const visitor = visitors[node.type];
  if (visitor) {
    visitor(node);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        walk(item, visitors);
      }
    } else if (child && typeof child === 'object') {
      walk(child, visitors);
    }
  }
}

/**
 * @param {string} code
 * @param {object | null} map
 */
export function appendSourceMap(code, map) {
  if (!map) {
    return code;
  }
  const payload = Buffer.from(JSON.stringify(map)).toString('base64');
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${payload}\n`;
}
