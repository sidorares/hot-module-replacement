import made from './dependency.js';

function fail() {
  throw new Error('thrown on line 4');
}

try {
  fail();
} catch (err) {
  process.send?.({ message: 'stacks', thrown: err.stack, made: made() });
}

setInterval(() => {}, 1000);

process.on('message', () => {
  process.exit(0);
});
