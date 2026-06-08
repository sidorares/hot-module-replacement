import { hotContexts } from './state.mjs';
import { canonicalizeUrl } from './url-utils.mjs';

/**
 * @param {string} moduleUrl
 * @param {(specifier: string) => string} resolveFromModule
 */
export function __registerModuleHot(moduleUrl, resolveFromModule) {
  const canonical = canonicalizeUrl(moduleUrl);
  if (hotContexts[canonical]) {
    return hotContexts[canonical];
  }

  const resolve = name => {
    if (name.startsWith('file://')) {
      return canonicalizeUrl(name);
    }
    return canonicalizeUrl(resolveFromModule(name));
  };

  const hot = {
    _acceptedDependencies: Object.create(null),
    _declinedDependencies: Object.create(null),
    _selfAccepted: false,
    _selfDeclined: false,
    _disposeHandlers: [],
    active: true,
    accept(dep, callback) {
      if (typeof dep === 'undefined') {
        hot._selfAccepted = true;
      } else if (typeof dep === 'function') {
        hot._selfAccepted = dep;
      } else if (typeof dep === 'object') {
        for (let i = 0; i < dep.length; i++) {
          hot._acceptedDependencies[resolve(dep[i])] = callback || function () {};
        }
      } else {
        hot._acceptedDependencies[resolve(dep)] = callback || function () {};
      }
    },
    decline(dep) {
      if (typeof dep === 'undefined') {
        hot._selfDeclined = true;
      } else if (typeof dep === 'object') {
        for (let i = 0; i < dep.length; i++) {
          hot._declinedDependencies[resolve(dep[i])] = true;
        }
      } else {
        hot._declinedDependencies[resolve(dep)] = true;
      }
    },
    dispose(callback) {
      hot._disposeHandlers.push(callback);
    },
    addDisposeHandler(callback) {
      hot._disposeHandlers.push(callback);
    },
    removeDisposeHandler(callback) {
      const idx = hot._disposeHandlers.indexOf(callback);
      if (idx >= 0) {
        hot._disposeHandlers.splice(idx, 1);
      }
    }
  };

  hotContexts[canonical] = hot;
  return hot;
}
