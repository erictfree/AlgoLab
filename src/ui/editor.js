// Editor — a textarea, plus the one thing a live-coding editor actually needs:
// knowing which block the cursor is in.
//
// PRD §10.3: "The editor determines blocks from top-level patch(...), scene(...), and
// command expressions. If block detection is uncertain, it selects the smallest
// complete JavaScript program containing the cursor."
//
// The scanner below finds top-level statements by tracking bracket depth while
// skipping the places where brackets do not count — strings, template literals,
// comments, and regex literals. It is not a JavaScript parser and does not need to be:
// a wrong guess costs an over-large evaluation, never a broken registry, because the
// evaluator rejects anything that does not compile.

/**
 * @typedef {{ start: number, end: number, text: string }} Block
 */

/**
 * Split source into top-level statements.
 * @param {string} source
 * @returns {Block[]}
 */
export function findBlocks(source) {
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
      // the "automatic semicolon" case: `go("tunnel")` on its own line.
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

/** Name of the patch/scene a block registers, for readable status messages. */
export function describeBlock(text) {
  const match = /\b(patch|scene|go|resetPatch|param)\s*\(\s*["'`]([^"'`]+)["'`]/.exec(text);
  return match ? `${match[1]} ${match[2]}` : 'block';
}

/**
 * Wire a textarea up as the live-coding surface.
 * @param {HTMLTextAreaElement} textarea
 * @param {{ onEvaluate: (source: string, label: string) => {ok: boolean}, onChange?: (source: string) => void, onEscape?: () => void }} handlers
 */
export function createEditor(textarea, handlers) {
  function flash(ok) {
    textarea.classList.remove('flash-ok', 'flash-bad');
    // Force a reflow so the class re-applies when evaluating twice in quick succession.
    void textarea.offsetWidth;
    textarea.classList.add(ok ? 'flash-ok' : 'flash-bad');
    setTimeout(() => textarea.classList.remove('flash-ok', 'flash-bad'), 240);
  }

  function evaluateCursorBlock() {
    const source = textarea.value;
    const block = blockAt(source, textarea.selectionStart);
    const text = block ? block.text : source;
    const label = block ? describeBlock(block.text) : 'buffer';
    flash(handlers.onEvaluate(text, label).ok);
  }

  function evaluateBuffer() {
    flash(handlers.onEvaluate(textarea.value, 'buffer').ok);
  }

  textarea.addEventListener('keydown', (event) => {
    const accel = event.metaKey || event.ctrlKey;

    if (event.key === 'Enter' && accel) {
      event.preventDefault();
      // Focus stays exactly where it was — §10.4.
      if (event.shiftKey) evaluateBuffer();
      else evaluateCursorBlock();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      textarea.blur();
      handlers.onEscape?.();
      return;
    }

    // A code surface where Tab moves focus is unusable; indent instead.
    if (event.key === 'Tab') {
      event.preventDefault();
      const { selectionStart: from, selectionEnd: to, value } = textarea;
      textarea.value = `${value.slice(0, from)}  ${value.slice(to)}`;
      textarea.selectionStart = textarea.selectionEnd = from + 2;
      handlers.onChange?.(textarea.value);
    }
  });

  textarea.addEventListener('input', () => handlers.onChange?.(textarea.value));

  return {
    get value() {
      return textarea.value;
    },
    set value(next) {
      textarea.value = next;
      handlers.onChange?.(next);
    },
    focus: () => textarea.focus(),
    evaluateCursorBlock,
    evaluateBuffer,
    /** Put a stored version back in the editor when the performer reverts (§10.4). */
    replaceBlockFor(name, source) {
      const blocks = findBlocks(textarea.value);
      const target = blocks.find((b) => describeBlock(b.text) === `patch ${name}`);
      if (!target) {
        textarea.value = `${textarea.value.trimEnd()}\n\n${source}\n`;
      } else {
        textarea.value =
          textarea.value.slice(0, target.start) + source + textarea.value.slice(target.end);
      }
      handlers.onChange?.(textarea.value);
    },
  };
}
