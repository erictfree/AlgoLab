// Conservative source tidying for the live editor.
//
// This is intentionally an indenter, not a code rewriter. It changes leading and
// trailing whitespace only, leaving expressions and comments untouched. Recognized
// GLSL template literals get the same delimiter-based indentation as JavaScript;
// ordinary template text remains byte-for-byte unchanged.

import { tokenize, tokenizeLines } from './highlight.js';

const OPENERS = new Set(['{', '[', '(']);
const CLOSERS = new Set(['}', ']', ')']);

function looksLikeGlsl(source) {
  return /\bvoid\s+main\s*\(/.test(source) && (
    /\b(?:uniform|varying|attribute)\s+/.test(source) ||
    /\bgl_(?:Position|FragColor)\b/.test(source) ||
    /\btexture2D\s*\(/.test(source)
  );
}

/** Indent one GLSL template body without rewriting any shader expression. */
function tidyGlslBody(source, baseIndent, indent) {
  const lines = source.split('\n');
  const tokenLines = tokenizeLines(source);
  let depth = 0;
  let continuation = false;

  return lines.map((line, index) => {
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd.trim() === '') return '';

    const structure = (tokenLines[index] ?? []).map(({ kind, text }) =>
      kind === 'comment' || kind === 'string' ? text.replace(/[^\t ]/g, ' ') : text,
    ).join('');
    const structuralText = structure.trim();
    const leadingClosers = structuralText.match(/^[}\])]+/)?.[0].length ?? 0;
    const lineDepth = Math.max(0, depth - leadingClosers) + (continuation ? 1 : 0);
    const result = `${baseIndent}${indent.repeat(lineDepth)}${trimmedEnd.trimStart()}`;

    for (const ch of structure) {
      if (OPENERS.has(ch)) depth++;
      else if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1);
    }
    // Delimiters already express continuation inside calls. This extra level is for
    // GLSL's common top-level multiline assignments and additive colour formulas.
    continuation = depth === 0 && /(?:[=+\-*/?:]|&&|\|\|)\s*$/.test(structuralText);
    return result;
  }).join('\n');
}

/**
 * Tidy only block-style shader templates (` followed by a newline). The strict GLSL
 * signature prevents prose, HTML, and interpolation-heavy JavaScript templates from
 * being reformatted accidentally.
 */
function tidyGlslTemplates(source, indent) {
  let cursor = 0;
  let searchFrom = 0;
  let result = '';

  for (const token of tokenize(source)) {
    const start = source.indexOf(token.text, searchFrom);
    if (start === -1) continue;
    searchFrom = start + token.text.length;
    if (
      token.kind !== 'string' ||
      !token.text.startsWith('`') ||
      !token.text.endsWith('`')
    ) continue;

    const end = start + token.text.length - 1;
    const body = token.text.slice(1, -1);
    const firstNewline = body.indexOf('\n');
    const lastNewline = body.lastIndexOf('\n');
    const isBlock = firstNewline >= 0 && lastNewline > firstNewline &&
      body.slice(0, firstNewline).trim() === '' &&
      body.slice(lastNewline + 1).trim() === '';
    const canTidy = isBlock && !body.includes('${') && looksLikeGlsl(body);

    result += source.slice(cursor, start);
    if (!canTidy) {
      result += source.slice(start, end + 1);
      cursor = end + 1;
      continue;
    }

    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const openingIndent = source.slice(lineStart, start).match(/^[\t ]*/)?.[0] ?? '';
    const shader = body.slice(firstNewline + 1, lastNewline);
    result += `\`\n${tidyGlslBody(shader, openingIndent + indent, indent)}\n${openingIndent}\``;
    cursor = end + 1;
  }

  return result + source.slice(cursor);
}

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

  const result = tidyGlslTemplates(tidied.join('\n'), indent);
  return eol === '\n' ? result : result.replace(/\n/g, eol);
}
