//if (process.env.NODE_ENV === 'development') {
require('hot-module-replacement')({
  ignore: /node_modules/
});
//}

const express = require('express');
const app = express();

let router = require('./routes');
app.use('/', function(req, res, next) {
  router(req, res, next);
});

require('http').createServer(app).listen(3000);

if (module.hot) {
  module.hot.accept('./routes', () => {
    router = require('./routes');
  });
}
