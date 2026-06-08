const loadTimeTs = process.hrtime();

export default function dependencyLevel2() {
  process.send?.({ message: 'call from dependency 2', param: loadTimeTs });
  return '=2';
}
