const watch = require('node-watch');
const Module = require('module');
const isBuiltinModule = require('is-builtin-module');

// https://github.com/webpack/webpack/blob/0257f6c6e41255cf26230c099fb90140f1f0e0bb/lib/HotModuleReplacement.runtime.js#L77
// https://github.com/masotime/require-watch/blob/master/src/index.js

function enableModuleReplacement(opts) {
  // TODO: use proxy here instead of just monkey-patching so all furure extensions are tracked automatically
  const savedExtensions = Module._extensions;
  const _extensions = {};
  Object.keys(savedExtensions).forEach(extension => {
    _extensions[extension] = function(module, filename) {
      addHMRHooks(module);
      savedExtensions[extension](module, filename);
    };
  });

  Module._extensions = _extensions;

  // module is changed, which dependency needs to be reloaded?
  function collectDependencies(module) {
    let paths = [];
    function pathsToAcceptingModules(path, root) {
      const requiredMe = parents[root.filename];
      if (module.hot._selfAccepted) {
        paths.push(path.concat(root.filename));
        return;
      }
      if (module.hot._selfDeclined) {
        return;
      }
      for (let next in requiredMe) {
        let parentHotRuntime = requiredMe[next].hot;
        if (parentHotRuntime._acceptedDependencies[root.filename]) {
          paths.push(path.concat(root.filename));
          continue;
        }
        if (parentHotRuntime._declinedDependencies[root.filename]) {
          continue;
        }
        pathsToAcceptingModules(path.concat(root.filename), requiredMe[next]);
      }
    }
    pathsToAcceptingModules([], module);
    return paths;
  }

  opts = opts || {};
  function ignore(path) {
    if (isBuiltinModule(path)) {
      return true;
    }
    if (typeof opts.ignore === 'function') {
      return opts.ignore(path);
    }
    if (opts.ignore instanceof RegExp) {
      return !!opts.ignore.exec(path);
    }
  }

  const watching = {};
  function startWatching(path) {
    if (ignore(path)) {
      return;
    }
    if (watching[path]) {
      return;
    }
    watching[path] = watch(path, { persistent: false }, function(eventType, filename) {
      const oldModule = require.cache[path];

      const deps = oldModule ? collectDependencies(oldModule) : [];
      const reloaded = {};

      for (let d = 0; d < deps.length; ++d) {
        for (let l = 0; l < deps[d].length; ++l) {
          const path = deps[d][l];
          if (reloaded[path]) {
            continue;
          }
          reloaded[path] = true;
          const oldModule = require.cache[path];
          if (oldModule.hot._disposeHandlers) {
            oldModule.hot._disposeHandlers.forEach(h => h());
          }
          const newModule = new Module(path, oldModule.parent);
          addHMRHooks(newModule);
          try {
            newModule.load(path);
            require.cache[path] = newModule;
            const ps = parents[path];
            for (parentPath in ps) {
              let parent = require.cache[parentPath];
              if (parent.hot._acceptedDependencies[path]) {
                // TODO: try/catch here?
                parent.hot._acceptedDependencies[path](path);
              }
            }
          } catch (e) {
            console.log(e);
          }
        }
      }
    });
  }

  // monkey-patch require
  const originalRequire = Module.prototype.require;
  const originalLoad = Module._load;
  const originalCompile = Module.prototype._compile;

  const parents = {};
  Module._load = function(request, parent, isMain) {
    const requirePath = Module._resolveFilename(request, parent);
    if (ignore(requirePath)) {
      return originalLoad(request, parent, isMain);
    }

    startWatching(requirePath);
    const parentPath = parent && parent.filename;
    const myParents = parents[requirePath];
    if (parentPath) {
      if (!myParents) {
        var p = {};
        p[parentPath] = parent;
        parents[requirePath] = p;
      } else {
        myParents[parentPath] = parent;
      }
    }
    return originalLoad(request, parent, isMain);
  };

  if (module.parent) {
    if (!module.parent.hot) {
      addHMRHooks(module.parent);
    }
  }

  function addHMRHooks(module) {
    const resolve = name => {
      return Module._resolveFilename(name, module);
    };
    // copied directly from webpack HMR
    // https://github.com/webpack/webpack/blob/0257f6c6e41255cf26230c099fb90140f1f0e0bb/lib/HotModuleReplacement.runtime.js#L77
    var hot = {
      // private stuff
      _acceptedDependencies: {},
      _declinedDependencies: {},
      _selfAccepted: false,
      _selfDeclined: false,
      _disposeHandlers: [],
      // _main: hotCurrentChildModule !== moduleId,

      // Module API
      active: true,
      accept: function(dep, callback) {
        if (typeof dep === 'undefined') hot._selfAccepted = true;
        else if (typeof dep === 'function') hot._selfAccepted = dep;
        else if (typeof dep === 'object')
          for (var i = 0; i < dep.length; i++)
            hot._acceptedDependencies[resolve(dep[i])] = callback || function() {};
        else hot._acceptedDependencies[resolve(dep)] = callback || function() {};
      },
      decline: function(dep) {
        if (typeof dep === 'undefined') hot._selfDeclined = true;
        else if (typeof dep === 'object')
          for (var i = 0; i < dep.length; i++) hot._declinedDependencies[resolve(dep[i])] = true;
        else hot._declinedDependencies[resolve(dep)] = true;
      },
      dispose: function(callback) {
        hot._disposeHandlers.push(callback);
      },
      addDisposeHandler: function(callback) {
        hot._disposeHandlers.push(callback);
      },
      removeDisposeHandler: function(callback) {
        var idx = hot._disposeHandlers.indexOf(callback);
        if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
      }
      /*
      // TODO: Management API
      check: hotCheck,
      apply: hotApply,

      status: function(l) {
        if (!l) return hotStatus;
        hotStatusHandlers.push(l);
      },
      addStatusHandler: function(l) {
        hotStatusHandlers.push(l);
      },
      removeStatusHandler: function(l) {
        var idx = hotStatusHandlers.indexOf(l);
        if (idx >= 0) hotStatusHandlers.splice(idx, 1);
      }

      //inherit from previous dispose call
      data: hotCurrentModuleData[moduleId]
    */
    };
    module.hot = hot;
  }
}

module.exports = enableModuleReplacement;
