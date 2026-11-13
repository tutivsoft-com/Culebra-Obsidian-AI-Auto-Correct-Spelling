export interface ReviewPart { kind: "same" | "removed" | "inserted"; text: string; }

/** Word comparison with bounded work. Large replacements fall back to one exact changed passage. */
export function correctionDiff(before: string, after: string): ReviewPart[] {
  const tokenize = (text: string): string[] => text.match(/\s+|[A-Za-z0-9_\u0080-\uffff]+|[^\s]/g) ?? [];
  const a = tokenize(before), b = tokenize(after);
  const parts: ReviewPart[] = [];
  let budget = 1000000;
  const append = (kind: ReviewPart["kind"], text: string): void => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  const compare = (left: string[], right: string[], depth = 0): void => {
    let start = 0, endA = left.length, endB = right.length;
    while (start < endA && start < endB && left[start] === right[start]) start++;
    append("same", left.slice(0, start).join(""));
    while (endA > start && endB > start && left[endA - 1] === right[endB - 1]) { endA--; endB--; }
    const x = left.slice(start, endA), y = right.slice(start, endB);
    const cost = x.length * y.length;
    if (!x.length || !y.length) {
      append("removed", x.join("")); append("inserted", y.join(""));
    } else if (cost <= Math.min(budget, 100000)) {
      budget -= cost;
      const width = y.length + 1;
      const table = new Uint32Array((x.length + 1) * width);
      for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) {
        table[i * width + j] = x[i] === y[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
      let i = 0, j = 0;
      while (i < x.length || j < y.length) {
        if (i < x.length && j < y.length && x[i] === y[j]) { append("same", x[i++]); j++; }
        else if (i < x.length && (j === y.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) append("removed", x[i++]);
        else append("inserted", y[j++]);
      }
    } else if (depth < 20 && budget > x.length + y.length) {
      budget -= x.length + y.length;
      // Unique words provide stable anchors in long notes without a quadratic table.
      const positions = (words: string[]): Map<string, number> => {
        const map = new Map<string, number>();
        words.forEach((word, index) => map.set(word, map.has(word) ? -1 : index));
        return map;
      };
      const px = positions(x), py = positions(y);
      const candidates: Array<[number, number]> = [];
      x.forEach((word, index) => { const match = py.get(word); if (px.get(word) === index && match !== undefined && match >= 0) candidates.push([index, match]); });
      const tails: number[] = [], previous: number[] = [];
      candidates.forEach((pair, index) => {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (candidates[tails[mid]][1] < pair[1]) lo = mid + 1; else hi = mid; }
        previous[index] = lo ? tails[lo - 1] : -1;
        tails[lo] = index;
      });
      const anchors: Array<[number, number]> = [];
      for (let index = tails.length ? tails[tails.length - 1] : -1; index >= 0; index = previous[index]) anchors.push(candidates[index]);
      anchors.reverse();
      let i = 0, j = 0;
      for (const [nextI, nextJ] of anchors) {
        compare(x.slice(i, nextI), y.slice(j, nextJ), depth + 1);
        append("same", x[nextI]); i = nextI + 1; j = nextJ + 1;
      }
      if (anchors.length) compare(x.slice(i), y.slice(j), depth + 1);
      else { append("removed", x.join("")); append("inserted", y.join("")); }
    } else { append("removed", x.join("")); append("inserted", y.join("")); }
    append("same", left.slice(endA).join(""));
  };
  compare(a, b);
  return parts;
}
