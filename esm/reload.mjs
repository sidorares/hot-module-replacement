import { parents, hotContexts, versions } from './state.mjs';
import { canonicalizeUrl, bustUrl } from './url-utils.mjs';
import { refreshBindingsForDep } from './bindings-runtime.mjs';

/**
 * Find paths from a changed module up to modules that accept the update.
 * Each path is an array of canonical URLs ending at an accepting module.
 *
 * @param {string} changedCanonical
 * @returns {string[][]}
 */
export function collectDependencies(changedCanonical) {
  const paths = [];
  const changedHot = hotContexts[changedCanonical];

  function pathsToAcceptingModules(path, rootCanonical) {
    if (path.includes(rootCanonical)) {
      return;
    }
    const requiredMe = parents[rootCanonical];
    const moduleHot = hotContexts[rootCanonical];

    if (moduleHot?._selfAccepted) {
      paths.push(path.concat(rootCanonical));
      return;
    }
    if (moduleHot?._selfDeclined) {
      return;
    }
    if (!requiredMe) {
      return;
    }

    for (const parentCanonical of Object.keys(requiredMe)) {
      const parentHot = hotContexts[parentCanonical];
      if (!parentHot) {
        continue;
      }
      if (parentHot._acceptedDependencies[rootCanonical]) {
        paths.push(path.concat(rootCanonical));
        continue;
      }
      if (parentHot._declinedDependencies[rootCanonical]) {
        continue;
      }
      pathsToAcceptingModules(path.concat(rootCanonical), parentCanonical);
    }
  }

  pathsToAcceptingModules([], changedCanonical);
  if (paths.length === 0 && changedHot?._selfAccepted) {
    paths.push([changedCanonical]);
  }
  return paths;
}

/**
 * @param {string} canonicalUrl
 */
async function reloadOne(canonicalUrl) {
  const hot = hotContexts[canonicalUrl];
  if (hot?._disposeHandlers?.length) {
    for (const handler of hot._disposeHandlers) {
      handler();
    }
  }

  const nextVersion = (versions[canonicalUrl] || 0) + 1;
  versions[canonicalUrl] = nextVersion;
  const target = bustUrl(canonicalUrl, nextVersion);

  try {
    await import(target);
  } catch (err) {
    console.error(err);
  }
}

/**
 * @param {string} changedCanonical
 */
export async function performHotReload(changedCanonical) {
  const deps = collectDependencies(changedCanonical);
  const reloaded = Object.create(null);

  for (let d = 0; d < deps.length; d++) {
    for (let l = 0; l < deps[d].length; l++) {
      const canonical = deps[d][l];
      if (reloaded[canonical]) {
        continue;
      }
      reloaded[canonical] = true;
      await reloadOne(canonical);

      const parentMap = parents[canonical];
      if (!parentMap) {
        continue;
      }
      for (const parentCanonical of Object.keys(parentMap)) {
        const parentHot = hotContexts[parentCanonical];
        const acceptHandler = parentHot?._acceptedDependencies[canonical];
        if (acceptHandler) {
          try {
            await refreshBindingsForDep(parentCanonical, canonical);
            const result = acceptHandler(canonical);
            if (result && typeof result.then === 'function') {
              await result;
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  }
}

/**
 * @param {string} childCanonical
 * @param {string} parentCanonical
 */
export function trackDependency(childCanonical, parentCanonical) {
  if (!parents[childCanonical]) {
    parents[childCanonical] = Object.create(null);
  }
  parents[childCanonical][parentCanonical] = true;
}
