import watch from 'node-watch';
import { watching, opts } from './state.mjs';
import { canonicalizeToPath, pathToCanonicalUrl } from './url-utils.mjs';
import { ignoreUrl } from './ignore.mjs';
import { performHotReload } from './reload.mjs';

/**
 * @param {string} url file URL (may include hmr query)
 */
export function startWatching(url) {
  if (ignoreUrl(url)) {
    return;
  }
  const path = canonicalizeToPath(url);
  if (!path) {
    return;
  }
  if (watching[path]) {
    return;
  }

  watching[path] = watch(path, { persistent: false }, () => {
    const canonical = pathToCanonicalUrl(path);
    void performHotReload(canonical);
  });
}
