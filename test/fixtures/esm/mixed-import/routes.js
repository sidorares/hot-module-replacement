const loadTimeTs = process.hrtime();
export const a = loadTimeTs[0] * 1e9 + loadTimeTs[1];

export default function routes() {
  return a;
}
