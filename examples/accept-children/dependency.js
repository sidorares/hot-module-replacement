const loadTimeTs = process.hrtime();
const ns = loadTimeTs[0] * 1e9 + loadTimeTs[1];

module.exports = function() {
  process.send &&
    process.send({ message: 'call from dependency', param: loadTimeTs });
  return '';
};
