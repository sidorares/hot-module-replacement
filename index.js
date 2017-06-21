const fs = require('fs');
const Module = require('module');
const isBuiltinModule = require('is-builtin-module');

// https://github.com/webpack/webpack/blob/0257f6c6e41255cf26230c099fb90140f1f0e0bb/lib/HotModuleReplacement.runtime.js#L77
// https://github.com/masotime/require-watch/blob/master/src/index.js

// module is changed, who wants to be reloaded and who wants to be notified?
function collectDependencies(module) {
  const visited = {};
  const paths = [];
  function pathsToAcceptingModules(path, root) {
    console.log('pathsToAcceptingModules', path);
    const requiredMe = parents[root.filename];
    if (!requiredMe) {
      console.log('No parent for', root.filename);
      path.pop();
      return;
    }

    console.log('REQUIRED ME:', Object.keys(requiredMe));

    for (let next in requiredMe) {
      let hot = requiredMe[next].hot;
      if (hot) {
        if (hot._acceptedDependencies[root.filename] || hot._selfAccepted) {
          console.log('Accepted everything in ', path, ' by ', next);
          path.pop();
          continue;
        }
        if (hot._declinedDependencies[root.filename] || hot._selfDecline) {
          console.log('declined by ', next);
          continue;
        }
      }

      // go next level
      path.push(root.filename);
      pathsToAcceptingModules(path, requiredMe[next]);
    }
  }
  pathsToAcceptingModules([], module);
}

function enableModuleReplacement(opts) {
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
    watching[path] = fs.watch(path, function(eventType, filename) {
      const oldModule = require.cache[path];

      //collectDependencies(oldModule);

      const parent = oldModule.parent;
      if (parent.hot && parent.hot._acceptedDependencies[path]) {
        if (oldModule.hot && oldModule.hot._disposeHandlers) {
          oldModule.hot._disposeHandlers.forEach(cb => cb());
        }
        const newModule = new Module(path, parent);
        addHMRHooks(newModule);
        try {
          newModule.load(path);
          require.cache[path] = newModule;
          parent.hot._acceptedDependencies[path](path);
        } catch (e) {
          console.log(e);
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

  Module.prototype._compile = function(content, filename) {
    addHMRHooks(this);
    return originalCompile.call(this, content, filename);
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
            hot._acceptedDependencies[resolve(dep[i])] =
              callback || function() {};
        else
          hot._acceptedDependencies[resolve(dep)] = callback || function() {};
      },
      decline: function(dep) {
        if (typeof dep === 'undefined') hot._selfDeclined = true;
        else if (typeof dep === 'object')
          for (var i = 0; i < dep.length; i++)
            hot._declinedDependencies[resolve(dep[i])] = true;
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
