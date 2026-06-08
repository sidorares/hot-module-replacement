import fromA from './a.js';

process.send?.({ message: 'start' });
fromA();

setInterval(() => {}, 1000);

process.on('message', () => {
  process.exit(0);
});

if (import.meta.hot) {
  import.meta.hot.accept('./a.js', () => {
    process.send?.({ message: 'call from accept handler' });
    fromA();
  });
}
