import { peer } from './b.js';

const loadTimeTs = process.hrtime();

function fromA() {
  process.send?.({ message: 'call from a', param: loadTimeTs, peer: typeof peer });
}

export default fromA;
export { fromA };
