// Dependency-free by design: no Supabase, no app services, nothing that
// only runs in a browser. This lets it be imported both by
// documentAiService.ts (the real app) and by scripts/document-ai-evaluate.ts
// (a bare Node script run via `node --experimental-strip-types`, which
// can't resolve documentAiService.ts's own extensionless local imports or
// tolerate pulling in its full app-service dependency graph).

export type OcrWord = {
  text: string;
  confidence?: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type LayoutLine = {
  text: string;
  words: OcrWord[];
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

function average(values: number[]) {
  const cleanValues = values.filter((value) => Number.isFinite(value));

  if (cleanValues.length === 0) {
    return 0;
  }

  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

// Attaches a real bbox to each of Tesseract's own plain-text lines,
// instead of re-deriving lines from word positions the way buildLayoutLines
// does. This exists because every regex/heuristic in
// invoiceCandidateEngine.ts was tuned against the exact line boundaries
// Tesseract's plain .text output produces -- re-deriving lines from word
// bboxes (even correctly) changes those boundaries just enough to
// measurably hurt real-invoice accuracy (confirmed empirically: 89.1% ->
// 86.2% even with resolution-aware, Tesseract-line-index-preserving
// reconstruction). This keeps the exact same text and line count/order as
// a plain text.split(/\r?\n/), and only adds bbox as metadata alongside it
// -- so it cannot change which value gets extracted, only what geometric
// data is available once it has been.
//
// Alignment strategy: words[] and the lines of `text` come from the same
// single OCR pass, in the same reading order, with Tesseract's plain-text
// renderer joining each recognized word with a single space and each line
// with a newline -- so a line's word count (whitespace-split token count)
// reliably tells us how many of the next not-yet-consumed words belong to
// it. If that ever drifts (a word recognized differently between the two
// representations), the affected line(s) simply get no bbox, exactly the
// same as before this function existed -- never a wrong value, only
// possibly missing metadata.
//
// IMPORTANT for callers: this also computes a real per-line `confidence`
// (average word confidence) as part of LayoutLine's required shape, but
// do NOT forward that into CandidateLine.confidence. Confirmed
// empirically: doing so alone reproduces the exact same regression as the
// line-boundary-changing attempts above (89.1% -> 86.2%), because every
// line in the untouched baseline has confidence=undefined (contributing 0
// to lineConfidenceBonus uniformly across the whole engine) -- suddenly
// giving every line a real, varying confidence reshuffles close-call
// rankings the existing heuristics were never tuned against. Use only
// `.text` and `.bbox` from this function's output when building
// CandidateLine[]; leave `confidence` off entirely.
export function attachBboxToTextLines(text: string, words: OcrWord[]): LayoutLine[] {
  const positionedWords = words.filter((word) => word.bbox);
  let wordIndex = 0;

  return text.split(/\r?\n/).map((rawLine) => {
    const tokenCount = rawLine.trim() ? rawLine.trim().split(/\s+/).length : 0;
    const consumed = positionedWords.slice(wordIndex, wordIndex + tokenCount);
    wordIndex += tokenCount;

    if (consumed.length === 0) {
      return { text: rawLine, words: [], confidence: 0.55 };
    }

    const xValues = consumed.flatMap((word) =>
      word.bbox ? [word.bbox.x, word.bbox.x + word.bbox.width] : [],
    );
    const yValues = consumed.flatMap((word) =>
      word.bbox ? [word.bbox.y, word.bbox.y + word.bbox.height] : [],
    );
    if (xValues.length === 0) {
      return { text: rawLine, words: consumed, confidence: 0.55 };
    }

    return {
      text: rawLine,
      words: consumed,
      confidence: average(consumed.map((word) => word.confidence ?? 0.55)),
      bbox: {
        x: Math.min(...xValues),
        y: Math.min(...yValues),
        width: Math.max(...xValues) - Math.min(...xValues),
        height: Math.max(...yValues) - Math.min(...yValues),
      },
    };
  });
}

// Groups OCR words into visual lines by y-coordinate proximity (not text
// order), computing a real bounding box per line from its constituent
// words. This is what makes CandidateLine.bbox non-null in production --
// without it, every candidate falls back to blind text-order heuristics.
export function buildLayoutLines(words: OcrWord[], fallbackText: string): LayoutLine[] {
  const positionedWords = words.filter((word) => word.bbox);

  if (positionedWords.length === 0) {
    return fallbackText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        text: line,
        words: [],
        confidence: 0.55,
      }));
  }

  const sortedWords = [...positionedWords].sort((a, b) => {
    const yDiff = (a.bbox?.y ?? 0) - (b.bbox?.y ?? 0);

    return Math.abs(yDiff) > 8 ? yDiff : (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0);
  });
  const groups: OcrWord[][] = [];

  sortedWords.forEach((word) => {
    const wordY = word.bbox?.y ?? 0;
    const lastGroup = groups[groups.length - 1];
    const lastGroupY = average(lastGroup?.map((item) => item.bbox?.y ?? 0) ?? []);

    if (!lastGroup || Math.abs(wordY - lastGroupY) > 12) {
      groups.push([word]);
      return;
    }

    lastGroup.push(word);
  });

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0));
    const xValues = ordered.flatMap((word) =>
      word.bbox ? [word.bbox.x, word.bbox.x + word.bbox.width] : [],
    );
    const yValues = ordered.flatMap((word) =>
      word.bbox ? [word.bbox.y, word.bbox.y + word.bbox.height] : [],
    );
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);
    const maxX = Math.max(...xValues);
    const maxY = Math.max(...yValues);

    return {
      text: ordered.map((word) => word.text).join(" "),
      words: ordered,
      confidence: average(ordered.map((word) => word.confidence ?? 0.55)),
      bbox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  });
}
