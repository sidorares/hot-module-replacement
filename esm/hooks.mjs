import * as moduleApi from 'node:module';

const { registerHooks } = moduleApi;

if (typeof registerHooks !== 'function') {
  throw new Error(
    'ESM hot module replacement requires Node.js >= 22.15 (module.registerHooks)'
  );
}
import { pathToFileURL, fileURLToPath } from 'node:url';
import { versions, setOpts } from './state.mjs';
import { canonicalizeUrl, bustUrl } from './url-utils.mjs';
import { ignoreUrl } from './ignore.mjs';
import { trackDependency } from './reload.mjs';
import { startWatching } from './watch.mjs';
import { transformModuleSource, appendSourceMap } from './transform.mjs';

const hotContextUrl = pathToFileURL(
  fileURLToPath(new URL('./hot-context.mjs', import.meta.url))
).href;

const bindingsRuntimeUrl = pathToFileURL(
  fileURLToPath(new URL('./bindings-runtime.mjs', import.meta.url))
).href;

const preamble = [
  `import { __registerModuleHot } from ${JSON.stringify(hotContextUrl)};`,
  `import { __hmrBind, __hmrRefreshSpecifier, __hmrRefreshSpecifiers } from ${JSON.stringify(bindingsRuntimeUrl)};`,
  `const __hmr_hot = __registerModuleHot(import.meta.url, (s) => import.meta.resolve(s));`,
  `try {
  if (typeof import.meta.hot === 'undefined') {
    Object.defineProperty(import.meta, 'hot', {
      value: __hmr_hot,
      writable: true,
      configurable: true,
      enumerable: true
    });
  }
} catch {}`
].join('\n');

/**
 * @param {import('./types.js').HmrOptions} [options]
 * @returns {{ deregister: () => void }}
 */
export function enableModuleReplacement(options) {
  if (options) {
    setOpts(options);
  }

  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      const resolvedUrl = result.url;

      if (context.parentURL && !ignoreUrl(resolvedUrl)) {
        const childCanonical = canonicalizeUrl(resolvedUrl);
        const parentCanonical = canonicalizeUrl(context.parentURL);
        trackDependency(childCanonical, parentCanonical);
        startWatching(childCanonical);
      }

      if (ignoreUrl(resolvedUrl)) {
        return result;
      }

      const canonical = canonicalizeUrl(resolvedUrl);
      const version = versions[canonical] || 0;
      if (version > 0 && !resolvedUrl.includes('hmr=')) {
        return {
          ...result,
          url: bustUrl(canonical, version)
        };
      }

      return result;
    },

    load(url, context, nextLoad) {
      const result = nextLoad(url, context);

      if (ignoreUrl(url)) {
        return result;
      }

      const format = result.format;
      if (format !== 'module' && format !== 'module-typescript') {
        return result;
      }

      let source =
        typeof result.source === 'string'
          ? result.source
          : Buffer.from(result.source).toString('utf8');

      if (source.includes('__registerModuleHot')) {
        return result;
      }

      const filename = fileURLToPath(url);
      const { code, map } = transformModuleSource(source, filename);
      const withMap = appendSourceMap(code, map);

      return {
        ...result,
        source: `${preamble}\n${withMap}`
      };
    }
  });
}

export default enableModuleReplacement;
