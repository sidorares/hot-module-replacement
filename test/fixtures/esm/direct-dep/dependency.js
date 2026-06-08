const loadTimeTs = process.hrtime();

export default function dependency() {
  process.send?.({ message: 'call from dependency', param: loadTimeTs });
}
