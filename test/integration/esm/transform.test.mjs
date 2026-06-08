import assert from 'node:assert/strict';
import { transformModuleSource } from '../../../esm/transform.mjs';

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
