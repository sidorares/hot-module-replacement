require('../../../index.js')();

let dep = require('./dependency.js');
let dep2 = require('./dependency-level2');

const main = () => {
  console.log('Dep:', dep());
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
  module.hot.accept(['./dependency'], function(updatedDep) {
    console.log('Accept handler!', updatedDep);
    process.send &&
      process.send({
        message: 'call from accept handler'
      });
    dep = require('./dependency');
    main();
  });
}
