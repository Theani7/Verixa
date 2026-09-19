/* Normalizes citations from models or streams:
   - Converts native brackets 【1】 to [1]
   - Groups consecutive citations [1] [2] -> [1][2]
   - Removes floating space before punctuation: [1] . -> [1].
   NOTE: literal <br> tags are NOT rewritten here (a raw newline would break
   Markdown table rows). They are rendered as real breaks in renderInline.
*/
export function normalizeCitations(text: string): string {
  let cleaned = text
    .replace(/【(\d+)(?:[†‡][^】]*)?】/g, '[$1]')
    .replace(/【\d+(?:[†‡][^】]*)?$/, '')
  // Remove space between adjacent citation markers
  cleaned = cleaned.replace(/(\[\d+\])\s+(?=\[\d+\])/g, '$1')
  // Remove space before punctuation immediately following citations
  cleaned = cleaned.replace(/(\[\d+\])\s+([.,;:!?])/g, '$1$2')
  return cleaned
}
