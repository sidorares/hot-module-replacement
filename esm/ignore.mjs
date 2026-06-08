import { opts } from './state.mjs';
import { canonicalizeToPath } from './url-utils.mjs';

const ESM_RUNTIME_DIR = new URL('.', import.meta.url).pathname;

export function ignoreUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'node:') {
    return true;
  }
  if (parsed.protocol !== 'file:') {
    return true;
  }
  const path = canonicalizeToPath(url);
  if (!path) {
    return true;
  }
  if (path.includes(`${ESM_RUNTIME_DIR}`) || path.includes('/hot-module-replacement/esm/')) {
    return true;
  }
  if (typeof opts.ignore === 'function') {
    return opts.ignore(path);
  }
  if (opts.ignore instanceof RegExp) {
    return opts.ignore.test(path);
  }
  return false;
}
