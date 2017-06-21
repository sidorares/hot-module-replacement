const loadTimeTs = process.hrtime();
const ns = loadTimeTs[0] * 1e9 + loadTimeTs[1];

const dep2 = require('./dependency-level2');

module.exports = function() {
  process.send &&
    process.send({ message: 'call from dependency 1', param: loadTimeTs });
  return '1-' + dep2();
};
