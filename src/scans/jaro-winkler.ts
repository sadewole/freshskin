/**
 * Jaro-Winkler similarity, used to match OCR output against INCI names.
 *
 * Implemented here rather than pulled in because the matching threshold (§13.4: 0.90) is a
 * domain decision and the algorithm is small enough to test exhaustively.
 */

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] === true || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (aMatched[i] !== true) continue;
    while (bMatched[k] !== true) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const transpositionsHalf = transpositions / 2;
  return (
    (matches / a.length + matches / b.length + (matches - transpositionsHalf) / matches) / 3
  );
}

export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  if (base < 0.7) return base;

  let prefix = 0;
  const limit = Math.min(4, a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix += 1;

  return base + prefix * 0.1 * (1 - base);
}
