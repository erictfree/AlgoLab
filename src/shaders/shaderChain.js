// A composable, single-input post-processing patch.
//
// The public method vocabulary follows the familiar coordinate and colour operator
// groups used by Hydra, while the implementation is native to p5js live's p5 scene
// model. A chain is an ordinary object with draw() and dispose(), so it participates
// in evaluation, rollback, scene ordering, and resource cleanup like every other patch.

const VERTEX_SOURCE = `
  precision highp float;

  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aTexCoord;
    vec4 position = vec4(aPosition, 1.0);
    position.xy = position.xy * 2.0 - 1.0;
    gl_Position = position;
  }
`;

const GLSL_HELPERS = `
  float luminance(vec3 colour) {
    return dot(colour, vec3(0.2125, 0.7154, 0.0721));
  }

  vec3 rgbToHsv(vec3 colour) {
    vec4 k = vec4(0.0, -0.3333333333, 0.6666666667, -1.0);
    vec4 p = mix(vec4(colour.bg, k.wz), vec4(colour.gb, k.xy), step(colour.b, colour.g));
    vec4 q = mix(vec4(p.xyw, colour.r), vec4(colour.r, p.yzx), step(p.x, colour.r));
    float delta = q.x - min(q.w, q.y);
    float epsilon = 0.0000000001;
    return vec3(
      abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)),
      delta / (q.x + epsilon),
      q.x
    );
  }

  vec3 hsvToRgb(vec3 colour) {
    vec3 p = abs(fract(colour.xxx + vec3(0.0, 0.6666666667, 0.3333333333)) * 6.0 - 3.0);
    return colour.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), colour.y);
  }
`;

const SPECS = Object.freeze({
  rotate: {
    kind: 'coord',
    args: [['angle', 'float', 10], ['speed', 'float', 0]],
    glsl: ([angle, speed]) => `
      vec2 centered = uv - vec2(0.5);
      float turn = ${angle} + ${speed} * uTime;
      centered = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * centered;
      uv = centered + vec2(0.5);
    `,
  },
  scale: {
    kind: 'coord',
    args: [
      ['amount', 'float', 1.5],
      ['xMult', 'float', 1],
      ['yMult', 'float', 1],
      ['offsetX', 'float', 0.5],
      ['offsetY', 'float', 0.5],
    ],
    glsl: ([amount, xMult, yMult, offsetX, offsetY]) => `
      vec2 scaleCenter = vec2(${offsetX}, ${offsetY});
      vec2 scaleAmount = max(abs(vec2(${amount} * ${xMult}, ${amount} * ${yMult})), vec2(0.00001));
      uv = (uv - scaleCenter) / scaleAmount + scaleCenter;
    `,
  },
  pixelate: {
    kind: 'coord',
    args: [['pixelX', 'float', 20], ['pixelY', 'float', 20]],
    glsl: ([pixelX, pixelY]) => `
      vec2 pixels = max(abs(vec2(${pixelX}, ${pixelY})), vec2(1.0));
      uv = (floor(uv * pixels) + 0.5) / pixels;
    `,
  },
  repeat: {
    kind: 'coord',
    args: [
      ['repeatX', 'float', 3],
      ['repeatY', 'float', 3],
      ['offsetX', 'float', 0],
      ['offsetY', 'float', 0],
    ],
    glsl: ([repeatX, repeatY, offsetX, offsetY]) => `
      vec2 repeated = uv * max(abs(vec2(${repeatX}, ${repeatY})), vec2(1.0));
      repeated.x += step(1.0, mod(repeated.y, 2.0)) * ${offsetX};
      repeated.y += step(1.0, mod(repeated.x, 2.0)) * ${offsetY};
      uv = fract(repeated);
    `,
  },
  repeatX: {
    kind: 'coord',
    args: [['reps', 'float', 3], ['offset', 'float', 0]],
    glsl: ([reps, offset]) => `
      vec2 repeatedX = uv * vec2(max(abs(${reps}), 1.0), 1.0);
      repeatedX.y += step(1.0, mod(repeatedX.x, 2.0)) * ${offset};
      uv = fract(repeatedX);
    `,
  },
  repeatY: {
    kind: 'coord',
    args: [['reps', 'float', 3], ['offset', 'float', 0]],
    glsl: ([reps, offset]) => `
      vec2 repeatedY = uv * vec2(1.0, max(abs(${reps}), 1.0));
      repeatedY.x += step(1.0, mod(repeatedY.y, 2.0)) * ${offset};
      uv = fract(repeatedY);
    `,
  },
  kaleid: {
    kind: 'coord',
    args: [['sides', 'float', 4]],
    glsl: ([sides]) => `
      vec2 kaleidPoint = uv - 0.5;
      float kaleidRadius = length(kaleidPoint);
      float kaleidSides = max(abs(${sides}), 1.0);
      float kaleidSector = 6.28318530718 / kaleidSides;
      float kaleidAngle = mod(atan(kaleidPoint.y, kaleidPoint.x), kaleidSector);
      kaleidAngle = abs(kaleidAngle - kaleidSector * 0.5);
      uv = vec2(0.5) + kaleidRadius * vec2(cos(kaleidAngle), sin(kaleidAngle));
    `,
  },
  scroll: {
    kind: 'coord',
    args: [
      ['x', 'float', 0.5],
      ['y', 'float', 0.5],
      ['speedX', 'float', 0],
      ['speedY', 'float', 0],
    ],
    glsl: ([x, y, speedX, speedY]) => `
      uv = fract(uv + vec2(${x} + uTime * ${speedX}, ${y} + uTime * ${speedY}));
    `,
  },
  scrollX: {
    kind: 'coord',
    args: [['x', 'float', 0.5], ['speed', 'float', 0]],
    glsl: ([x, speed]) => `uv.x = fract(uv.x + ${x} + uTime * ${speed});`,
  },
  scrollY: {
    kind: 'coord',
    args: [['y', 'float', 0.5], ['speed', 'float', 0]],
    glsl: ([y, speed]) => `uv.y = fract(uv.y + ${y} + uTime * ${speed});`,
  },
  posterize: {
    kind: 'color',
    args: [['bins', 'float', 3], ['gamma', 'float', 0.6]],
    glsl: ([bins, gamma], index) => `
      float bins${index} = max(abs(${bins}), 1.0);
      float gamma${index} = max(abs(${gamma}), 0.00001);
      vec3 poster${index} = pow(max(colour.rgb, vec3(0.0)), vec3(gamma${index}));
      poster${index} = floor(poster${index} * bins${index}) / bins${index};
      colour.rgb = pow(poster${index}, vec3(1.0 / gamma${index}));
    `,
  },
  shift: {
    kind: 'color',
    args: [['r', 'float', 0.5], ['g', 'float', 0], ['b', 'float', 0], ['a', 'float', 0]],
    glsl: ([r, g, b, a]) => `colour += fract(vec4(${r}, ${g}, ${b}, ${a}));`,
  },
  invert: {
    kind: 'color',
    args: [['amount', 'float', 1]],
    glsl: ([amount]) => `colour.rgb = mix(colour.rgb, 1.0 - colour.rgb, ${amount});`,
  },
  contrast: {
    kind: 'color',
    args: [['amount', 'float', 1.6]],
    glsl: ([amount]) => `colour.rgb = (colour.rgb - 0.5) * ${amount} + 0.5;`,
  },
  brightness: {
    kind: 'color',
    args: [['amount', 'float', 0.4]],
    glsl: ([amount]) => `colour.rgb += vec3(${amount});`,
  },
  luma: {
    kind: 'color',
    args: [['threshold', 'float', 0.5], ['tolerance', 'float', 0.1]],
    glsl: ([threshold, tolerance], index) => `
      float luma${index} = smoothstep(
        ${threshold} - (abs(${tolerance}) + 0.0000001),
        ${threshold} + (abs(${tolerance}) + 0.0000001),
        luminance(colour.rgb)
      );
      colour = vec4(colour.rgb * luma${index}, luma${index});
    `,
  },
  thresh: {
    kind: 'color',
    args: [['threshold', 'float', 0.5], ['tolerance', 'float', 0.04]],
    glsl: ([threshold, tolerance], index) => `
      float threshold${index} = smoothstep(
        ${threshold} - (abs(${tolerance}) + 0.0000001),
        ${threshold} + (abs(${tolerance}) + 0.0000001),
        luminance(colour.rgb)
      );
      colour.rgb = vec3(threshold${index});
    `,
  },
  color: {
    kind: 'color',
    args: [['r', 'float', 1], ['g', 'float', 1], ['b', 'float', 1], ['a', 'float', 1]],
    glsl: ([r, g, b, a], index) => `
      vec4 tint${index} = vec4(${r}, ${g}, ${b}, ${a});
      vec4 positive${index} = step(0.0, tint${index});
      colour = mix((1.0 - colour) * abs(tint${index}), tint${index} * colour, positive${index});
    `,
  },
  saturate: {
    kind: 'color',
    args: [['amount', 'float', 2]],
    glsl: ([amount]) => `colour.rgb = mix(vec3(luminance(colour.rgb)), colour.rgb, ${amount});`,
  },
  hue: {
    kind: 'color',
    args: [['amount', 'float', 0.4]],
    glsl: ([amount], index) => `
      vec3 hsv${index} = rgbToHsv(colour.rgb);
      hsv${index}.x += ${amount};
      colour.rgb = hsvToRgb(hsv${index});
    `,
  },
  colorama: {
    kind: 'color',
    args: [['amount', 'float', 0.005]],
    glsl: ([amount], index) => `
      vec3 colorama${index} = rgbToHsv(colour.rgb) + vec3(${amount});
      colour.rgb = fract(hsvToRgb(colorama${index}));
    `,
  },
  sum: {
    kind: 'color',
    args: [['scale', 'vec4', [1, 1, 1, 1]]],
    glsl: ([scale], index) => `
      vec4 sumChannels${index} = colour * ${scale};
      colour.rgb = vec3(
        sumChannels${index}.r + sumChannels${index}.g + sumChannels${index}.b + sumChannels${index}.a
      );
    `,
  },
  rgba: {
    kind: 'color',
    args: [['r', 'float', 1], ['g', 'float', 1], ['b', 'float', 1], ['a', 'float', 1]],
    glsl: ([r, g, b, a]) => `colour *= vec4(${r}, ${g}, ${b}, ${a});`,
  },
});

export const SHADER_TRANSFORM_OPERATORS = Object.freeze([
  'rotate', 'scale', 'pixelate', 'repeat', 'repeatX', 'repeatY',
  'kaleid', 'scroll', 'scrollX', 'scrollY',
]);

export const SHADER_COLOR_OPERATORS = Object.freeze([
  'posterize', 'shift', 'invert', 'contrast', 'brightness', 'luma', 'thresh',
  'color', 'saturate', 'hue', 'colorama', 'sum', 'rgba',
]);

function operation(name, supplied) {
  const spec = SPECS[name];
  if (!spec) throw new TypeError(`Unknown shader operator "${name}"`);
  return {
    name,
    args: spec.args.map(([, , fallback], index) => supplied[index] ?? fallback),
  };
}

/** Compile a method list into one fragment shader and a uniform evaluation plan. */
export function compileShaderOperations(operations) {
  const uniforms = [];
  const coord = [];
  const color = [];

  operations.forEach((entry, operationIndex) => {
    const spec = SPECS[entry.name];
    if (!spec) throw new TypeError(`Unknown shader operator "${entry.name}"`);
    const names = spec.args.map(([argName, type, fallback], argIndex) => {
      const name = `u_${operationIndex}_${argName}`;
      uniforms.push({
        name,
        type,
        value: entry.args[argIndex] ?? fallback,
        operator: entry.name,
        argument: argName,
      });
      return name;
    });
    (spec.kind === 'coord' ? coord : color).push(spec.glsl(names, operationIndex));
  });

  const declarations = uniforms.map(({ type, name }) => `uniform ${type} ${name};`).join('\n');
  const fragmentSource = `
    precision highp float;

    varying vec2 vTexCoord;
    uniform sampler2D uScene;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec3 uAudio;
    ${declarations}

    ${GLSL_HELPERS}

    void main() {
      vec2 uv = vTexCoord;
      ${coord.join('\n')}
      vec4 colour = texture2D(uScene, fract(uv));
      ${color.join('\n')}
      gl_FragColor = clamp(colour, 0.0, 1.0);
    }
  `;

  return { fragmentSource, uniforms };
}

/** Resolve a literal or a higher-order live parameter for a p5 shader uniform. */
export function resolveShaderUniform(uniform, context) {
  const candidate = typeof uniform.value === 'function'
    ? uniform.value(context)
    : uniform.value;

  if (uniform.type === 'vec4') {
    if (!Array.isArray(candidate) || candidate.length !== 4) {
      throw new TypeError(`${uniform.operator}.${uniform.argument} must resolve to four numbers`);
    }
    const values = candidate.map(Number);
    if (!values.every(Number.isFinite)) {
      throw new TypeError(`${uniform.operator}.${uniform.argument} must resolve to four finite numbers`);
    }
    return values;
  }

  const value = Number(candidate);
  if (!Number.isFinite(value)) {
    throw new TypeError(`${uniform.operator}.${uniform.argument} must resolve to a finite number`);
  }
  return value;
}

export class ShaderChain {
  #operations = [];
  #output = null;
  #program = null;
  #compiled = null;
  #signature = '';

  constructor(operations = []) {
    this.#operations = operations.map(({ name, args }) => operation(name, args));
  }

  get operations() {
    return this.#operations.map(({ name, args }) => ({ name, args: [...args] }));
  }

  clone() {
    return new ShaderChain(this.#operations);
  }

  clear() {
    this.#operations.length = 0;
    this.#invalidate();
    return this;
  }

  #append(name, args) {
    this.#operations.push(operation(name, args));
    this.#invalidate();
    return this;
  }

  #invalidate() {
    this.#signature = '';
    this.#program = null;
    this.#compiled = null;
  }

  rotate(angle, speed) { return this.#append('rotate', [angle, speed]); }
  scale(amount, xMult, yMult, offsetX, offsetY) {
    return this.#append('scale', [amount, xMult, yMult, offsetX, offsetY]);
  }
  pixelate(pixelX, pixelY) { return this.#append('pixelate', [pixelX, pixelY]); }
  repeat(repeatX, repeatY, offsetX, offsetY) {
    return this.#append('repeat', [repeatX, repeatY, offsetX, offsetY]);
  }
  repeatX(reps, offset) { return this.#append('repeatX', [reps, offset]); }
  repeatY(reps, offset) { return this.#append('repeatY', [reps, offset]); }
  kaleid(sides) { return this.#append('kaleid', [sides]); }
  scroll(x, y, speedX, speedY) { return this.#append('scroll', [x, y, speedX, speedY]); }
  scrollX(x, speed) { return this.#append('scrollX', [x, speed]); }
  scrollY(y, speed) { return this.#append('scrollY', [y, speed]); }

  posterize(bins, gamma) { return this.#append('posterize', [bins, gamma]); }
  shift(r, g, b, a) { return this.#append('shift', [r, g, b, a]); }
  invert(amount) { return this.#append('invert', [amount]); }
  contrast(amount) { return this.#append('contrast', [amount]); }
  brightness(amount) { return this.#append('brightness', [amount]); }
  luma(threshold, tolerance) { return this.#append('luma', [threshold, tolerance]); }
  thresh(threshold, tolerance) { return this.#append('thresh', [threshold, tolerance]); }
  color(r, g, b, a) { return this.#append('color', [r, g, b, a]); }
  saturate(amount) { return this.#append('saturate', [amount]); }
  hue(amount) { return this.#append('hue', [amount]); }
  colorama(amount) { return this.#append('colorama', [amount]); }
  sum(scale) { return this.#append('sum', [scale]); }
  rgba(r, g, b, a) { return this.#append('rgba', [r, g, b, a]); }

  #ensureShader() {
    if (!this.#output) {
      this.#output = createGraphics(width, height, WEBGL);
      this.#output.pixelDensity(1);
      this.#output.noStroke();
    } else if (this.#output.width !== width || this.#output.height !== height) {
      this.#output.resizeCanvas(width, height);
    }

    const signature = this.#operations.map(({ name }) => name).join('|');
    if (this.#program && signature === this.#signature) return;
    this.#compiled = compileShaderOperations(this.#operations);
    this.#program = this.#output.createShader(VERTEX_SOURCE, this.#compiled.fragmentSource);
    this.#signature = signature;
  }

  draw(context) {
    this.#ensureShader();
    this.#output.clear();
    this.#output.shader(this.#program);
    this.#program.setUniform('uScene', context.canvas);
    this.#program.setUniform('uResolution', [width, height]);
    this.#program.setUniform('uTime', context.time);
    this.#program.setUniform('uAudio', [
      context.audio.bass,
      context.audio.mid,
      context.audio.treble,
    ]);
    for (const uniform of this.#compiled.uniforms) {
      this.#program.setUniform(uniform.name, resolveShaderUniform(uniform, context));
    }
    this.#output.rect(0, 0, width, height);
    image(this.#output, 0, 0, width, height);
  }

  dispose() {
    this.#output?.remove();
    this.#output = null;
    this.#program = null;
    this.#compiled = null;
    this.#signature = '';
  }
}
