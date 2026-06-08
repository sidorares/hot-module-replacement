import dep from './dependency.js';

const main = () => {
  dep();
};

process.send?.({ message: 'start' });
main();

setInterval(() => {}, 1000);

process.on('message', () => {
  process.exit(0);
});

if (import.meta.hot) {
  import.meta.hot.accept('./dependency.js', () => {
    process.send?.({ message: 'call from accept handler' });
    main();
  });
}
