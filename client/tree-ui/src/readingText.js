// Pure body-text segmentation shared by rendering and existing tests.
//
// CLI bodies may concatenate bracketed section labels without blank lines.
// Splitting only on line breaks would collapse those sections into one paragraph.
// Insert breaks before labels, split paragraphs, then distinguish labeled and plain lines.
// Return structured blocks without a React dependency.

/** @param {string} content Raw memory body. @returns {Array<{marked:boolean, lines:Array<{tag:string|null, text:string}>}>} Empty means no body; marked blocks receive section labels. */
export function splitReadingBlocks(content) {
  const raw = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  // Insert breaks before bracketed labels while preserving inline context.
  const text = raw.replace(/(?<!\n)(【[^】]{1,12}】)/g, '\n$1').trim();
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          const m = line.trim().match(/^【(.+?)】\s*(.*)$/);
          return m ? { tag: m[1], text: m[2] } : { tag: null, text: line };
        });
      return { marked: lines.length > 1 && lines.some((l) => l.tag), lines };
    });
}
