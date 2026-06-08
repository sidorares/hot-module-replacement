const loadTimeTs = process.hrtime();
import dep2 from './dependency-level2.js';

export default function dependencyLevel1() {
  process.send?.({ message: 'call from dependency 1', param: loadTimeTs });
  return dep2();
}
