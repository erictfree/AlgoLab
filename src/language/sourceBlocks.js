// Source structure — pure, DOM-free scanning for evaluation cells and statements.
//
// This is language/application infrastructure rather than editor rendering. Both the
// evaluator and the textarea view consume it without depending on one another.

/**
 * @typedef {{ start: number, end: number, text: string }} Block
 */

/**
 * Split source into top-level statements.
 * @param {string} source
 * @returns {Block[]}
 */
export function findStatements(source) {
  /** @type {Block[]} */
  const blocks = [];
  let depth = 0;
  let start = -1;
  let i = 0;
  const n = source.length;

  /** Last significant character, used to tell division from a regex literal. */
  let prev = '';

  const push = (end) => {
    if (start === -1) return;
    const text = source.slice(start, end);
    if (text.trim() !== '') blocks.push({ start, end, text });
    start = -1;
  };

  while (i < n) {
    const ch = source[i];

    // --- comments -------------------------------------------------------------
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // --- strings and template literals ----------------------------------------
    if (ch === '"' || ch === "'") {
      if (start === -1) start = i;
      i = skipString(source, i, ch);
      prev = ch;
      continue;
    }
    if (ch === '`') {
      if (start === -1) start = i;
      i = skipTemplate(source, i);
      prev = ch;
      continue;
    }

    // --- regex literals -------------------------------------------------------
    if (ch === '/' && regexCanStartAfter(prev)) {
      if (start === -1) start = i;
      const after = skipRegex(source, i);
      if (after !== -1) {
        i = after;
        prev = '/';
        continue;
      }
    }

    // --- structure ------------------------------------------------------------
    if (ch === '{' || ch === '(' || ch === '[') {
      if (start === -1) start = i;
      depth++;
      prev = ch;
      i++;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      if (depth > 0) depth--;
      prev = ch;
      i++;
      continue;
    }

    if (ch === ';' && depth === 0) {
      if (start === -1) start = i;
      push(i + 1);
      prev = ';';
      i++;
      continue;
    }

    if (ch === '\n') {
      // Newline ends a top-level statement only when everything is balanced —
      // the "automatic semicolon" case: `go(scene)` on its own line.
      if (depth === 0 && start !== -1 && endsStatement(prev)) push(i + 1);
      i++;
      continue;
    }

    if (!/\s/.test(ch)) {
      if (start === -1) start = i;
      prev = ch;
    }
    i++;
  }

  push(n);
  return blocks;
}

/**
 * Explicit multi-statement live-coding cells. A marker labels everything through the
 * next marker, so a class/factory and the instance it constructs refresh together.
 * Markers intentionally begin at column zero: that keeps `// %%` text inside an
 * indented example or shader string from unexpectedly splitting the program.
 *
 * @param {string} source
 * @returns {Array<Block & {label: string}>}
 */
export function findCells(source) {
  const markers = [...source.matchAll(/^\/\/\s*%%\s*([^\n]*)$/gm)];
  return markers.map((marker, index) => {
    const start = marker.index;
    const end = markers[index + 1]?.index ?? source.length;
    return {
      start,
      end,
      text: source.slice(start, end),
      label: marker[1].trim(),
    };
  });
}

/**
 * Rename the original demo's default `tunnel` scene without touching patches or a
 * deliberately named scene in another project. The exact marked cell makes this a
 * narrow source migration rather than a global identifier replacement.
 *
 * @param {string} source
 * @returns {string}
 */
export function renameLegacyStarterScene(source) {
  if (/\b(?:const|let|var)\s+scene\b/.test(source)) return source;
  const legacy = findCells(source).find((cell) => cell.label === 'scene tunnel');
  if (!legacy || !/\b(?:const|let|var)\s+tunnel\s*=\s*\[/.test(legacy.text)) return source;

  const renamed = legacy.text
    .replace(/^\/\/\s*%%\s*scene\s+tunnel\s*$/m, '// %% scene scene')
    .replace(/\b(const|let|var)\s+tunnel\s*=/, '$1 scene =')
    .replace(
      /\b(const|let|var)\s+scene\s*=\s*\[\s*plasma\s*,?\s*\]\s*;?/,
      '$1 scene = [\n  plasma,\n];',
    )
    .replace(/\bgo\s*\(\s*tunnel\s*\)/, 'go(scene)');
  return `${source.slice(0, legacy.start)}${renamed}${source.slice(legacy.end)}`;
}

/**
 * Put explicit scene cells after every patch cell.
 *
 * Library patches can be installed after a project already has a scene. Ordinary
 * JavaScript still evaluates top to bottom, so a scene such as `[checkerZoom, plasma]`
 * cannot appear before the cell that declares `laserFan`. Only marked cells move;
 * their contents and relative order within the patch/scene groups stay unchanged.
 *
 * @param {string} source
 * @returns {string}
 */
export function moveSceneCellsLast(source) {
  const cells = findCells(source);
  if (cells.length === 0) return source;
  const isScene = (cell) => /^scene\s+/.test(cell.label);
  const firstScene = cells.findIndex(isScene);
  const prefix = source.slice(0, cells[0].start).trimEnd();
  const sceneNeedsMoving = firstScene !== -1 && cells.slice(firstScene + 1).some((cell) => !isScene(cell));
  if (!prefix && !sceneNeedsMoving) return source;

  const ordered = sceneNeedsMoving
    ? [...cells.filter((cell) => !isScene(cell)), ...cells.filter(isScene)]
    : cells;
  const texts = ordered.map((cell) => cell.text.trim());

  // Comments before the first marker were invisible in structured mode, so a saved
  // project could appear to begin at line 9 or 18. A marker is only a comment; moving
  // that first marker above the preamble preserves JavaScript behavior while making
  // the first visible/editable cell honestly begin on line 1.
  if (prefix) {
    const first = texts[0];
    const markerEnd = first.indexOf('\n');
    const marker = markerEnd === -1 ? first : first.slice(0, markerEnd);
    const body = markerEnd === -1 ? '' : first.slice(markerEnd + 1).trimStart();
    texts[0] = [marker, prefix, body].filter(Boolean).join('\n');
  }

  const chunks = texts.filter(Boolean);
  return `${chunks.join('\n\n')}\n`;
}

/**
 * Evaluation blocks are explicit cells plus ordinary statements outside those cells.
 * @param {string} source
 * @returns {Block[]}
 */
export function findBlocks(source) {
  const cells = findCells(source);
  if (cells.length === 0) return findStatements(source);

  const outside = findStatements(source).filter(
    (statement) =>
      !cells.some((cell) => statement.start >= cell.start && statement.end <= cell.end),
  );
  return [...outside, ...cells]
    .filter((block) => block.text.trim() !== '')
    .sort((a, b) => a.start - b.start);
}

/** A statement can end on a newline after these; not after an operator or a comma. */
function endsStatement(prev) {
  return prev !== '' && !'+-*/%<>=&|^,.?:!~('.includes(prev);
}

function regexCanStartAfter(prev) {
  return prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev);
}

function skipString(source, i, quote) {
  i++;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote || ch === '\n') return i + 1;
    i++;
  }
  return i;
}

function skipTemplate(source, i) {
  i++;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return i + 1;
    if (ch === '$' && source[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        else if (source[i] === '`') i = skipTemplate(source, i) - 1;
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

/** Returns the index after the regex literal, or -1 if this `/` was division. */
function skipRegex(source, i) {
  let j = i + 1;
  let inClass = false;
  while (j < source.length) {
    const ch = source[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '\n') return -1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      j++;
      while (j < source.length && /[a-z]/i.test(source[j])) j++;
      return j;
    }
    j++;
  }
  return -1;
}

/**
 * The block containing `cursor`, or null if the cursor sits outside every block
 * (in which case the caller evaluates the whole buffer — §10.3's "smallest complete
 * program" fallback).
 * @param {string} source
 * @param {number} cursor
 */
export function blockAt(source, cursor) {
  const blocks = findBlocks(source);
  for (const block of blocks) {
    if (cursor >= block.start && cursor <= block.end) return block;
  }
  // Cursor past the last character, or in trailing whitespace: use the last block.
  if (blocks.length && cursor >= blocks[blocks.length - 1].end) return blocks[blocks.length - 1];
  return null;
}

/** Readable name for a declaration or command block. */
export function describeBlock(text) {
  const cell = /^\/\/\s*%%\s*([^\n]*)/m.exec(text);
  if (cell?.[1].trim()) return cell[1].trim();

  const declaration = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\[|\{|new\b)/.exec(text);
  if (declaration) return `${declaration[2] === '[' ? 'scene' : 'strategy'} ${declaration[1]}`;

  const classDeclaration = /\bclass\s+([A-Za-z_$][\w$]*)/.exec(text);
  if (classDeclaration) return `class ${classDeclaration[1]}`;

  const goCommand = /\bgo\s*\(\s*([A-Za-z_$][\w$]*)/.exec(text);
  if (goCommand) return `go ${goCommand[1]}`;

  const namedCommand = /\bparam\s*\(\s*["'`]([^"'`]+)["'`]/.exec(text);
  if (namedCommand) return `param ${namedCommand[1]}`;

  const objectCommand = /\breset\s*\(\s*([A-Za-z_$][\w$]*)/.exec(text);
  if (objectCommand) return `reset ${objectCommand[1]}`;
  return 'block';
}
