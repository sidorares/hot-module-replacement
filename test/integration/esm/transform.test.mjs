import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'acorn';
import MagicString from 'magic-string';
import { transformModuleSource } from '../../../esm/transform.mjs';

/**
 * Where `map` says the first `needle` in `code` came from: Node's own reading
 * of the map, which is the one a stack trace goes through. Lines 1-based.
 */
function originOf(code, map, needle) {
  const before = code.slice(0, code.indexOf(needle)).split('\n');
  const entry = new SourceMap(map).findEntry(
    before.length - 1,
    before[before.length - 1].length
  );
  return {
    source: path.basename(entry.originalSource),
    line: entry.originalLine + 1
  };
}

/** `code` as a loader below would hand it over, its map inline. */
function withInlineMap(code, map) {
  const payload = Buffer.from(JSON.stringify(map)).toString('base64');
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${payload}\n`;
}

const assertParses = code =>
  assert.doesNotThrow(() =>
    parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
  );

describe('ESM import transform', () => {
  it('rewrites default import and accept on one line each', () => {
    const input = `import routes from './routes.js';\nif (import.meta.hot) import.meta.hot.accept('./routes.js');\n`;
    const { code } = transformModuleSource(input, 'server.mjs');

    assert.match(code, /import \* as __hmr_0 from '\.\/routes\.js'/);
    assert.match(code, /let routes=__hmr_0\.default/);
    assert.match(code, /__hmrBind\(import\.meta\.url,"\.\/routes\.js"/);
    assert.match(code, /import\.meta\.hot\.accept\('\.\/routes\.js',async\(\)=>/);
    assert.match(code, /__hmrRefreshSpecifier/);
  });

  it('rewrites named imports with deferred init', () => {
    const input = `import { foo, bar as baz } from './util.js';\n`;
    const { code } = transformModuleSource(input, 'x.mjs');

    assert.match(code, /let foo; let baz;/);
    assert.match(code, /queueMicrotask\(\(\)=>\{foo=__hmr_0\.foo;baz=__hmr_0\.bar\}\)/);
  });

  it('rewrites combined default and named import', () => {
    const input = `import routes, { a } from './routes.js';\n`;
    const { code } = transformModuleSource(input, 'server.mjs');

    assert.match(code, /let routes=__hmr_0\.default/);
    assert.match(code, /let a;/);
    assert.match(code, /queueMicrotask\(\(\)=>\{a=__hmr_0\.a\}\)/);
  });

  it('stays valid when a statement follows a named import on one line', () => {
    // No newline after the import: the replacement must supply its own
    // terminator — ASI can't. This is the shape of minified/one-line
    // transpiler output (e.g. tsx) and of injected preludes.
    const input = `import { a } from './x.js'; const b = () => a();\n`;
    const { code } = transformModuleSource(input, 'oneline.mjs');
    assertParses(code);
  });

  it('stays valid when a statement follows a default import on one line', () => {
    // Default-only imports end the replacement with a __hmrBind call
    // rather than queueMicrotask — same missing-terminator hazard.
    const input = `import x from './x.js'; const b = 1;\n`;
    const { code } = transformModuleSource(input, 'oneline-default.mjs');
    assertParses(code);
  });

  it('stays valid with two imports on one line', () => {
    // e.g. a JSX transform appending its runtime import to the last
    // import's line.
    const input = `import { a } from './a.js'; import b from './b.js';\n`;
    const { code } = transformModuleSource(input, 'two-imports.mjs');
    assertParses(code);
  });

  it('leaves side-effect imports unchanged', () => {
    const input = `import './side-effect.js';\n`;
    const { code, map } = transformModuleSource(input, 'x.mjs');
    assert.equal(code, input);
    assert.equal(map, null);
  });

  it('emits a source map when edits are applied', () => {
    const input = `import x from './x.js';\nthrow new Error('line 2');\n`;
    const { map } = transformModuleSource(input, 'fail.mjs');
    assert.ok(map);
    assert.equal(map.sources[0], 'fail.mjs');
  });
});

describe('ESM transform source maps', () => {
  const preamble = 'const a = 1;\nconst b = 2;\nconst c = 3;';

  it('maps positions through the preamble', () => {
    const input = `import x from './x.js';\nfunction f() {\n  throw new Error('line 3');\n}\n`;
    const { code, map } = transformModuleSource(input, 'fail.mjs', { preamble });
    assert.ok(code.startsWith(`${preamble}\n`));
    assert.deepEqual(originOf(code, map, 'throw'), { source: 'fail.mjs', line: 3 });
  });

  it('maps a module with nothing to rewrite once the preamble goes on', () => {
    const input = `function f() {\n  throw new Error('line 2');\n}\n`;
    const { code, map } = transformModuleSource(input, 'plain.mjs', { preamble });
    assert.ok(map, 'a preamble alone moves every line');
    assert.deepEqual(originOf(code, map, 'throw'), { source: 'plain.mjs', line: 2 });
  });

  it('composes the inline map the module arrived with', () => {
    // a loader below this one: two lines of its own on top of the file
    const original = `function f() {\n  throw new Error('line 2');\n}\n`;
    const below = new MagicString(original);
    below.prepend(`import y from './y.js';\n// from the loader below\n`);
    const input = withInlineMap(
      below.toString(),
      below.generateMap({ source: 'original.jsx', hires: true, includeContent: true })
    );

    const { code, map } = transformModuleSource(input, 'loaded.mjs', { preamble });
    assert.deepEqual(originOf(code, map, 'throw'), { source: 'original.jsx', line: 2 });
    assert.deepEqual(map.sourcesContent, [original]);
    // the incoming comment is gone, so the map appended for this is the one read
    assert.doesNotMatch(code, /sourceMappingURL/);
    assertParses(code);
  });

  it('composes a map file next to the module', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hmr-map-'));
    try {
      const original = `import y from './y.js';\nfunction f() {\n  throw new Error('line 3');\n}\n`;
      const below = new MagicString(original);
      below.prepend('// one line from a build\n');
      writeFileSync(
        path.join(dir, 'built.js.map'),
        below.generateMap({ source: 'src.ts', hires: true }).toString()
      );
      const input = `${below}\n//# sourceMappingURL=built.js.map\n`;
      const { code, map } = transformModuleSource(input, path.join(dir, 'built.js'));
      assert.deepEqual(originOf(code, map, 'throw'), { source: 'src.ts', line: 3 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves a module it does not touch with the map it came with', () => {
    const input = withInlineMap('const x = 1;', { version: 3, sources: ['x.ts'], names: [], mappings: 'AAAA' });
    const { code, map } = transformModuleSource(input, 'x.mjs');
    assert.equal(code, input);
    assert.equal(map, null);
  });
});
