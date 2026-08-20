import { describe, expect, it } from 'vitest';
import { tidySource } from '../../src/ui/tidy.js';

describe('tidySource', () => {
  it('indents nested objects, methods, conditions, and arrays', () => {
    const source = `const rings = {
draw({ audio }) {
if (audio.beat) {
circle(width / 2, height / 2, 80);
}
},
};

const scene = [
rings,
];`;

    expect(tidySource(source)).toBe(`const rings = {
  draw({ audio }) {
    if (audio.beat) {
      circle(width / 2, height / 2, 80);
    }
  },
};

const scene = [
  rings,
];`);
  });

  it('ignores delimiters in comments and strings', () => {
    const source = `const patch = {
// a misleading } ] ) comment
draw() {
text("}])", 10, 10);
}
};`;

    expect(tidySource(source)).toBe(`const patch = {
  // a misleading } ] ) comment
  draw() {
    text("}])", 10, 10);
  }
};`);
  });

  it('preserves authored template and shader indentation', () => {
    const source = `const fragment = \`
  void main() {
vec3 colour = vec3(1.0);
  }
\`;`;

    expect(tidySource(source)).toBe(source);
  });
});
