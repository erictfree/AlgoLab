import { describe, expect, it } from 'vitest';
import {
  ShaderChain,
  SHADER_COLOR_OPERATORS,
  SHADER_TRANSFORM_OPERATORS,
  compileShaderOperations,
  resolveShaderUniform,
} from '../../src/shaders/shaderChain.js';
import { createTestHost } from './helpers.js';

describe('ShaderChain', () => {
  it('is a fluent first-class patch with the documented single-input operators', () => {
    const chain = new ShaderChain();

    for (const name of [...SHADER_TRANSFORM_OPERATORS, ...SHADER_COLOR_OPERATORS]) {
      expect(chain[name]()).toBe(chain);
    }

    expect(typeof chain.draw).toBe('function');
    expect(typeof chain.dispose).toBe('function');
    expect(chain.operations.map(({ name }) => name)).toEqual([
      ...SHADER_TRANSFORM_OPERATORS,
      ...SHADER_COLOR_OPERATORS,
    ]);
  });

  it('compiles transforms before sampling and colours after sampling in one pass', () => {
    const chain = new ShaderChain()
      .rotate(0.2, 0.1)
      .pixelate(24, 16)
      .hue(0.3)
      .contrast(1.2);
    const compiled = compileShaderOperations(chain.operations);

    expect(compiled.fragmentSource).toContain('uniform float u_0_angle;');
    expect(compiled.fragmentSource).toContain('uniform float u_1_pixelX;');
    expect(compiled.fragmentSource).toContain('vec4 colour = texture2D(uScene, fract(uv));');
    expect(compiled.fragmentSource.indexOf('vec2 centered = uv')).toBeLessThan(
      compiled.fragmentSource.indexOf('vec4 colour = texture2D'),
    );
    expect(compiled.fragmentSource.indexOf('vec3 hsv2')).toBeGreaterThan(
      compiled.fragmentSource.indexOf('vec4 colour = texture2D'),
    );
    expect(compiled.uniforms).toHaveLength(6);
  });

  it('resolves literal and higher-order parameters from the current draw context', () => {
    const context = { time: 4, audio: { bass: 0.5 } };
    const literal = { type: 'float', value: 1.25, operator: 'scale', argument: 'amount' };
    const dynamic = {
      type: 'float',
      value: ({ time, audio }) => time * audio.bass,
      operator: 'rotate',
      argument: 'angle',
    };
    const vector = {
      type: 'vec4',
      value: ({ audio }) => [audio.bass, 1, 1, 1],
      operator: 'sum',
      argument: 'scale',
    };

    expect(resolveShaderUniform(literal, context)).toBe(1.25);
    expect(resolveShaderUniform(dynamic, context)).toBe(2);
    expect(resolveShaderUniform(vector, context)).toEqual([0.5, 1, 1, 1]);
  });

  it('rejects invalid live values before they reach WebGL', () => {
    expect(() => resolveShaderUniform(
      { type: 'float', value: () => NaN, operator: 'hue', argument: 'amount' },
      {},
    )).toThrow('finite number');
    expect(() => resolveShaderUniform(
      { type: 'vec4', value: [1, 2], operator: 'sum', argument: 'scale' },
      {},
    )).toThrow('four numbers');
  });

  it('is available to ordinary evaluated live code without a registration wrapper', () => {
    const h = createTestHost();
    const result = h.evaluator.evaluate(`// %% patch flow
const flow = new ShaderChain()
  .rotate(({ time }) => time * 0.1)
  .scale(({ audio }) => 1 + audio.bass * 0.2)
  .hue(0.1);`);
    h.frame(2);

    expect(result.ok).toBe(true);
    expect(h.registry.hasStrategy('flow')).toBe(true);
    expect(h.evaluator.binding('flow')).toBeInstanceOf(ShaderChain);
    expect(h.evaluator.binding('flow').operations.map(({ name }) => name))
      .toEqual(['rotate', 'scale', 'hue']);
  });
});
