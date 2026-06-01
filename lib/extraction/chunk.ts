/**
 * Text chunking for the Oria ingestion pipeline.
 *
 * Strategy: paragraph-aware splitting with a 1 500-char max chunk size
 * and ~150-char overlap.  Keeps sentences intact where possible.
 */

const MAX_CHUNK_CHARS = 1_500;
const OVERLAP_CHARS = 150;

/**
 * Split text into overlapping chunks.
 * Returns an array of chunk strings.
 */
export function splitIntoChunks(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  // Normalise line endings
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split on double newlines (paragraphs) first
  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // If the paragraph itself is too long, split it on sentence boundaries
    const pieces = para.length > MAX_CHUNK_CHARS ? splitBySentence(para) : [para];

    for (const piece of pieces) {
      if (current.length + piece.length + 2 <= MAX_CHUNK_CHARS) {
        current = current ? `${current}\n\n${piece}` : piece;
      } else {
        if (current) {
          chunks.push(current.trim());
          // Carry over last OVERLAP_CHARS worth of the current chunk
          const overlap = current.slice(-OVERLAP_CHARS);
          current = overlap + "\n\n" + piece;
        } else {
          // piece alone exceeds limit. hard-split
          chunks.push(...hardSplit(piece));
          current = "";
        }
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 20); // drop trivially short chunks
}

export type ChunkWithMeta = { content: string; meta: Record<string, unknown> };

// Segment markers the extractors emit: the Excel sidecar prefixes each sheet
// with "## Sheet: <name>"; the PDF path emits "## Page <n>". We split on these
// so each chunk is tagged with the sheet/page it came from, which lets the
// retriever cite "the Expenses sheet" or "page 3".
const SEGMENT_MARKER = /^##\s*(Sheet|Page)\s*:?\s*(.*)$/i;

/**
 * Like splitIntoChunks, but segment-aware: when the text carries sheet/page
 * markers, each resulting chunk is tagged with { sheet_name, sheet_index } or
 * { page_number }. Text with no markers behaves exactly like splitIntoChunks
 * with empty per-chunk metadata.
 */
export function splitIntoChunksWithMeta(text: string): ChunkWithMeta[] {
  if (!text || text.trim().length === 0) return [];
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n");

  type Segment = { meta: Record<string, unknown>; lines: string[] };
  const segments: Segment[] = [];
  let current: Segment = { meta: {}, lines: [] };
  let sheetIndex = -1;
  let sawMarker = false;

  for (const line of lines) {
    const m = line.match(SEGMENT_MARKER);
    if (m) {
      sawMarker = true;
      if (current.lines.length > 0) segments.push(current);
      const kind = m[1].toLowerCase();
      const label = m[2].trim();
      if (kind === "sheet") {
        sheetIndex += 1;
        current = { meta: { sheet_name: label, sheet_index: sheetIndex }, lines: [] };
      } else {
        const n = parseInt(label, 10);
        current = { meta: { page_number: Number.isFinite(n) ? n : label }, lines: [] };
      }
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) segments.push(current);

  if (!sawMarker) {
    return splitIntoChunks(text).map((content) => ({ content, meta: {} }));
  }

  const out: ChunkWithMeta[] = [];
  for (const seg of segments) {
    for (const content of splitIntoChunks(seg.lines.join("\n"))) {
      out.push({ content, meta: seg.meta });
    }
  }
  return out;
}

/** Rough sentence boundary split. */
function splitBySentence(text: string): string[] {
  // Split on ". ", "! ", "? " followed by capital letter or end of string
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÀ-ɏЀ-ӿ])/);
  const pieces: string[] = [];
  let current = "";

  for (const s of sentences) {
    if (current.length + s.length + 1 <= MAX_CHUNK_CHARS) {
      current = current ? `${current} ${s}` : s;
    } else {
      if (current) pieces.push(current.trim());
      current = s;
    }
  }
  if (current) pieces.push(current.trim());

  return pieces;
}

/** Hard-split by character count (last resort). */
function hardSplit(text: string): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS - OVERLAP_CHARS) {
    pieces.push(text.slice(i, i + MAX_CHUNK_CHARS).trim());
  }
  return pieces;
}

/** Rough token estimate: ~4 chars per token (GPT/Claude convention). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
