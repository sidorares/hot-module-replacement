import { canonicalizeUrl, bustUrl } from './url-utils.mjs';
import { versions } from './state.mjs';

/** parent canonical URL -> child canonical URL -> setter list */
const setters = new Map();

/**
 * @param {string} parentUrl
 * @param {string} specifier
 * @param {(spec: string) => string} resolveFromModule
 * @param {'default' | 'namespace' | string} exportKind
 * @param {(value: unknown) => void} setter
 */
export function __hmrBind(
  parentUrl,
  specifier,
  resolveFromModule,
  exportKind,
  setter
) {
  const parent = canonicalizeUrl(parentUrl);
  const child = canonicalizeUrl(resolveFromModule(specifier));
  if (!setters.has(parent)) {
    setters.set(parent, new Map());
  }
  const byChild = setters.get(parent);
  if (!byChild.has(child)) {
    byChild.set(child, []);
  }
  byChild.get(child).push({ exportKind, setter });
}

/**
 * @param {string} parentUrl
 * @param {string} depCanonical canonical URL of an updated dependency
 */
export async function refreshBindingsForDep(parentUrl, depCanonical) {
  const parent = canonicalizeUrl(parentUrl);
  const byChild = setters.get(parent);
  if (!byChild?.has(depCanonical)) {
    return;
  }
  const version = versions[depCanonical] ?? 0;
  const url = version > 0 ? bustUrl(depCanonical, version) : depCanonical;
  const mod = await import(url);
  for (const { exportKind, setter } of byChild.get(depCanonical)) {
    if (exportKind === 'default') {
      setter(mod.default);
    } else if (exportKind === 'namespace') {
      setter(mod);
    } else {
      setter(mod[exportKind]);
    }
  }
}

/**
 * @param {string} parentUrl
 * @param {(spec: string) => string} resolveFromModule
 * @param {string} specifier
 */
export async function __hmrRefreshSpecifier(parentUrl, resolveFromModule, specifier) {
  const child = canonicalizeUrl(resolveFromModule(specifier));
  await refreshBindingsForDep(parentUrl, child);
}

/**
 * @param {string} parentUrl
 * @param {(spec: string) => string} resolveFromModule
 * @param {string[]} specifiers
 */
export async function __hmrRefreshSpecifiers(parentUrl, resolveFromModule, specifiers) {
  for (const specifier of specifiers) {
    await __hmrRefreshSpecifier(parentUrl, resolveFromModule, specifier);
  }
}
