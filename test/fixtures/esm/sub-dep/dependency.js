const loadTimeTs = process.hrtime();
import dep1 from './dependency-level1.js';

export default function dependency() {
  process.send?.({ message: 'call from dependency', param: loadTimeTs });
  return '0' + dep1();
}
