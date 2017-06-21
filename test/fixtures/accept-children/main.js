require('../../../index.js')();

let dep = require('./dependency.js');

const main = () => {
  dep();
};

process.send && process.send({ message: 'start' });
main();

if (module.hot) {
  module.hot.accept('./dependency', function(updatedDep) {
    process.send &&
      process.send({
        message: 'call from accept handler'
      });
    dep = require('./dependency');
    main();
  });
}
