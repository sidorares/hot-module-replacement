import routes, { a } from './routes.js';

const main = () => {
  process.send?.({ message: 'values', a, hasRoutes: typeof routes === 'function' });
};

queueMicrotask(() => {
  process.send?.({ message: 'start' });
  main();
});

setInterval(() => {}, 1000);

process.on('message', () => {
  process.exit(0);
});

if (import.meta.hot) {
  import.meta.hot.accept('./routes.js', () => {
    process.send?.({ message: 'call from accept handler' });
    main();
  });
}
