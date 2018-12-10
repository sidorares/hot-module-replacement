# hot-module-replacement
Hot module replacement for node.js

This module tries to mimic [webpack HMR](https://webpack.js.org/api/hot-module-replacement/) API

## Installation
```js
  npm install --save-dev hot-module-replacement
```

## Usage

Put this code somewhere in your code to initialise hot reload

```js
require('hot-module-replacement')({
  // options are optional
  ignore: /node_modules/  // regexp to decide if module should be ignored; also can be a function accepting string and returning true/false
})
```

You need to explicitly mark any subtree as 'hot reloadable' by calling `hot.accept()`

```js
  let foo = require('./util/foo.js');

  if (module.hot) { 
    module.hot.accept('./util/foo', () => {
      // if foo.js or any files that foo.js depend on are modified this callback is invoked
      foo = require('./util/foo.js'); // by this time module cache entry for 'foo' already cleaned and module reloaded, requiring again is the easiest way of geting reference to new module. We need to assign it to local foo variable to make our local code in this file aware of it.
    })
  }
```

## Similar projects:

- https://github.com/yyrdl/dload ( forces you to use own module api for replaceables modules )
- https://github.com/rlindskog/solit ( transpiles all files on start )
- https://github.com/fgnass/node-dev

### webpack hmr on the server
- https://github.com/palmerhq/backpack
- https://hackernoon.com/hot-reload-all-the-things-ec0fed8ab0
- https://github.com/jaredpalmer/razzle
- https://github.com/jlongster/backend-with-webpack ( and http://jlongster.com/Backend-Apps-with-Webpack--Part-III )
