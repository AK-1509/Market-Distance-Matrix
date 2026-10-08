import { textWidth } from './scene';

/** Greedy word wrap by estimated width. */
export function wrapText(text: string, size: number, maxWidth: number, weight = 400): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (textWidth(candidate, size, weight) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}
