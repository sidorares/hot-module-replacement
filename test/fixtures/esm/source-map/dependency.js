// nothing here to rewrite: only the preamble moves its lines
export default function made() {
  return new Error('made on line 3').stack;
}
