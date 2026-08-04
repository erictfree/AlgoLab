// PRD §10.3 — "the editor determines blocks from top-level patch(...), scene(...),
// and command expressions."
//
// The scanner does not need to be a parser. It needs to never mistake a brace inside
// a string or a comment for structure, because that is what produces an evaluation
// range that cuts a patch in half.

import { describe, it, expect } from 'vitest';
import { findBlocks, blockAt, describeBlock } from '../../src/ui/editor.js';

const SOURCE = `// a comment with a brace {
patch("wash", ({ audio }) => {
  fill(0, 0, 0, 20);
  rect(0, 0, width, height);
});

patch("rings", ({ audio }) => {
  const label = "a string with ; and } in it";
  text(label, 10, 10);
});

scene("tunnel", ["wash", "rings"]);
go("tunnel")
`;

describe('findBlocks', () => {
  it('finds each top-level statement', () => {
    const blocks = findBlocks(SOURCE);
    expect(blocks.map((b) => describeBlock(b.text))).toEqual([
      'patch wash',
      'patch rings',
      'scene tunnel',
      'go tunnel',
    ]);
  });

  it('is not fooled by braces or semicolons inside strings', () => {
    const blocks = findBlocks(SOURCE);
    const rings = blocks.find((b) => describeBlock(b.text) === 'patch rings');
    expect(rings.text).toContain('a string with ; and } in it');
    expect(rings.text.trimEnd().endsWith('});')).toBe(true);
  });

  it('ends a statement at a newline when brackets are balanced', () => {
    const blocks = findBlocks(SOURCE);
    expect(blocks.at(-1).text.trim()).toBe('go("tunnel")');
  });

  it('handles template literals, regexes, and block comments', () => {
    const source = [
      'patch("a", () => { const s = `x ${ { y: 1 } } z`; });',
      'const r = /}\\/;{/g;',
      '/* } ; } */',
      'go("a")',
    ].join('\n');
    const blocks = findBlocks(source);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].text).toContain('${ { y: 1 } }');
    expect(blocks.at(-1).text.trim()).toBe('go("a")');
  });

  it('returns nothing for an empty or comment-only buffer', () => {
    expect(findBlocks('')).toEqual([]);
    expect(findBlocks('// nothing here\n/* or here */')).toEqual([]);
  });
});

describe('blockAt', () => {
  it('finds the block containing the cursor', () => {
    const cursor = SOURCE.indexOf('rect(0, 0');
    expect(describeBlock(blockAt(SOURCE, cursor).text)).toBe('patch wash');
  });

  it('finds the block when the cursor sits on its closing line', () => {
    const cursor = SOURCE.indexOf('text(label');
    expect(describeBlock(blockAt(SOURCE, cursor).text)).toBe('patch rings');
  });

  it('falls back to the last block past the end of the buffer', () => {
    expect(describeBlock(blockAt(SOURCE, SOURCE.length).text)).toBe('go tunnel');
  });

  it('returns null when there is nothing to evaluate', () => {
    expect(blockAt('   \n  ', 2)).toBe(null);
  });
});
