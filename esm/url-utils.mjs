import { fileURLToPath, pathToFileURL } from 'node:url';

const HMR_QUERY = 'hmr';

/** Strip hmr query param; keep other query/fragment if present. */
export function canonicalizeUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'file:') {
    return parsed.href;
  }
  parsed.searchParams.delete(HMR_QUERY);
  const search = parsed.searchParams.toString();
  parsed.search = search ? `?${search}` : '';
  return parsed.href;
}

export function canonicalizeToPath(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'file:') {
    return null;
  }
  parsed.searchParams.delete(HMR_QUERY);
  parsed.search = '';
  parsed.hash = '';
  return fileURLToPath(parsed);
}

export function bustUrl(canonicalUrl, version) {
  const parsed = new URL(canonicalUrl);
  parsed.searchParams.set(HMR_QUERY, String(version));
  return parsed.href;
}

export function pathToCanonicalUrl(path) {
  return pathToFileURL(path).href;
}
