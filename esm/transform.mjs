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
 * Transform static imports to mutable `let` bindings and auto-inject accept callbacks.
 *
 * Line numbers: each import is replaced one-for-one on the same line when the source
 * used one line per import; otherwise MagicString + inline source map preserves stacks
 * when Node is run with --enable-source-maps.
 *
 * @param {string} source
 * @param {string} filename
 * @returns {{ code: string, map: object | null }}
 */
export function transformModuleSource(source, filename) {
  bindingCounter = 0;

  let ast;
  try {
    ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true
    });
  } catch {
    return { code: source, map: null };
  }

  /** @type {{ start: number, end: number, replacement: string }[]} */
  const edits = [];

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

  if (edits.length === 0) {
    return { code: source, map: null };
  }

  edits.sort((a, b) => b.start - a.start);

  const magic = new MagicString(source, { filename });
  for (const { start, end, replacement } of edits) {
    magic.overwrite(start, end, replacement, { contentOnly: true });
  }

  const map = magic.generateMap({
    source: filename,
    file: filename,
    hires: true,
    includeContent: true
  });

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
