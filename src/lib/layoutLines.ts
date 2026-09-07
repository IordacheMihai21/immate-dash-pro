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
