/** Guards for user text and URLs at input/import boundaries. */

const EXECUTABLE_PATTERNS: readonly RegExp[] = [
  /<\s*\/?\s*(script|iframe|object|embed|frame|frameset|applet|base|meta|link|style|svg|math|form|template)\b/i,
  /<[^>]*\s(on[a-z]+|formaction|srcdoc)\s*=/i,
  /(javascript|vbscript|livescript)\s*:/i,
  /data\s*:\s*(text\/html|image\/svg|application\/(x-)?javascript)/i,
];

/**
 * True when text contains constructs that could execute if ever interpreted as markup.
 * All user text is escaped on render regardless; this rejects hostile imports and keeps
 * form input and import validation consistent.
 */
export function containsExecutableMarkup(text: string): boolean {
  return EXECUTABLE_PATTERNS.some((re) => re.test(text));
}

/** Only absolute HTTP(S) URLs are accepted as source links. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML/SVG element content and attribute values. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
