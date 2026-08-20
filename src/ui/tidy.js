// Conservative source tidying for the live editor.
//
// This is intentionally an indenter, not a code rewriter. It changes leading and
// trailing whitespace only, leaving expressions, comments, and shader/template text
// untouched. That makes it safe to use in the middle of a performance without a
// formatter dependency or a build step.

import { tokenizeLines } from './highlight.js';

const OPENERS = new Set(['{', '[', '(']);
const CLOSERS = new Set(['}', ']', ')']);

/**
 * Re-indent JavaScript-like source with two spaces per delimiter level.
 * Multiline strings and block-comment interiors retain their authored whitespace.
 */
export function tidySource(source, indent = '  ') {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const tokenLines = tokenizeLines(normalized);
  let depth = 0;

  const tidied = lines.map((line, index) => {
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd.trim() === '') return '';

    const tokens = tokenLines[index] ?? [];
    const structure = tokens.map(({ kind, text }) =>
      kind === 'comment' || kind === 'string' ? text.replace(/[^\t ]/g, ' ') : text,
    ).join('');
    const structuralText = structure.trim();

    // Do not alter shader bodies, template strings, or the interior alignment of
    // block comments. A line comment is ordinary source structure and can be aligned.
    if (structuralText === '') {
      const content = trimmedEnd.trimStart();
      return content.startsWith('//') ? `${indent.repeat(depth)}${content}` : trimmedEnd;
    }

    const leadingClosers = structuralText.match(/^[}\])]+/)?.[0].length ?? 0;
    const lineDepth = Math.max(0, depth - leadingClosers);
    const result = `${indent.repeat(lineDepth)}${trimmedEnd.trimStart()}`;

    for (const ch of structure) {
      if (OPENERS.has(ch)) depth++;
      else if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1);
    }
    return result;
  });

  return tidied.join(eol);
}
