# ESM hot module replacement

**Requires Node >= 22.15** (`module.registerHooks`).

```bash
node --enable-source-maps --import hot-module-replacement/register ./app.mjs
```

Use normal static imports; the loader rewrites them to mutable bindings:

```js
// you write:
import routes from './routes.js';

if (import.meta.hot) {
  import.meta.hot.accept('./routes.js');
}
```

```js
// effectively becomes (same line count when one import per line):
import * as __hmr_0 from './routes.js'; let routes=__hmr_0.default; __hmrBind(...);
import.meta.hot.accept('./routes.js', async () => { await __hmrRefreshSpecifier(...) });
```

## Source maps

Every transformed module carries an inline source map covering the import rewrite and the preamble added above it. Run Node with `--enable-source-maps` so stack traces point at your original source lines.

When another loader runs beneath this one — a JSX or TypeScript transform, or a build that wrote `.map` files — the map the module arrived with (an inline `data:` URL, or a file named by its `sourceMappingURL`) is composed into this one, so a stack resolves to the file that loader read rather than to the code it handed over.

## Limitations

- **Default and namespace imports** are rewritten to mutable `let` bindings
- **Named imports** use `let` + `queueMicrotask` for the initial read (avoids TDZ in circular graphs). Do not rely on a named binding in top-level code that runs synchronously right after the import — use it inside functions or after await
- Side-effect-only imports (`import './polyfill.js'`) are not rewritten
- Custom accept callbacks run after automatic binding refresh; use them for side effects (`main()`, logging)
- Run with `--enable-source-maps` so stack traces map to original lines
- For webpack-grade live bindings on all import forms, use [dynohot](https://github.com/laverdet/dynohot)
