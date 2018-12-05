require('../../../index.js')();

let dep = require('./dependency.json');

const main = () => {
  process.send && process.send({ message: 'call from main', value: dep.value });
};

process.send && process.send({ message: 'start' });
main();

const interval = setInterval(() => {
  // nothing, just to have something in the event loop
}, 1000);

process.on('message', function(msg) {
  process.exit(0);
});

if (module.hot) {
  module.hot.accept('./dependency', function(updatedDep) {
    dep = require('./dependency');
    process.send &&
      process.send({
        message: 'call from accept handler',
        value: dep.value
      });
  });
}
