import express from 'express';
import http from 'node:http';
import routes, { a } from './routes.js';

const app = express();
app.use('/', (req, res, next) => {
  console.log('a =', a);
  return routes(req, res, next);
});

const port = 3000;
http.createServer(app).listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
  console.log('Edit routes.js and save — no server restart needed.');
});

if (import.meta.hot) {
  import.meta.hot.accept('./routes.js');
}
