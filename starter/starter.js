// The deliberately minimal AlgoLab starter project.
//
// Plasma is the one installed patch. Everything else begins in the Patch Library, so
// Available, Installed, Active, and Running remain distinct ideas from the first load.

export const STARTER_SOURCE = `// %% patch plasma
// ALGOLAB — starter scene
//
// A patch is an ordinary function, object, or class instance that can draw.
// A scene is an array of patches, drawn from first to last.
//
// Plasma is installed and active below. Open the Patch Library to install another
// patch, add it to the scene source, then press Cmd/Ctrl+Enter in that scene cell.

// plasma — a live post-processing shader implemented as a real class instance.
//
// Put post-processors LAST in a scene. Plasma captures everything earlier patches
// drew, sends that image and the audio into a fragment shader, then replaces the
// canvas with the warped result. GPU resources stay on the object, not in saved state.
class Plasma {
  #output = null;
  #program = null;

  // An arrow function can be a live parameter too. It receives the same changing
  // draw context as the patch, then turns the audio into one shader value.
  // Try doubling 0.006, or replace audio.bass with audio.treble.
  intensity = ({ audio }) => 0.0038 + audio.bass * 0.006 + audio.mid * 0.002;

  #vertexSource = \`
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
  \`;

  #fragmentSource = \`
    precision highp float;

    varying vec2 vTexCoord;
    uniform sampler2D uScene;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec3 uAudio;
    uniform float uIntensity;

    float softBlob(vec2 point, vec2 center, float radius) {
      vec2 delta = (point - center) / radius;
      return exp(-dot(delta, delta) * 1.7);
    }

    void main() {
      vec2 uv = vTexCoord;
      vec2 centered = uv * 2.0 - 1.0;
      centered.x *= uResolution.x / uResolution.y;

      float bass = uAudio.x;
      float mid = uAudio.y;
      float treble = uAudio.z;
      float drift = uTime * 0.075;
      vec2 flow = vec2(
        sin(centered.y * 2.2 + drift),
        cos(centered.x * 2.0 - drift * 0.83)
      );
      float warp = 0.0012 + bass * 0.005;
      vec2 sampleUv = clamp(uv + flow * warp, 0.002, 0.998);

      vec2 split = flow * (0.00025 + treble * 0.0014);
      float red = texture2D(uScene, clamp(sampleUv + split, 0.002, 0.998)).r;
      float green = texture2D(uScene, sampleUv).g;
      float blue = texture2D(uScene, clamp(sampleUv - split, 0.002, 0.998)).b;
      // A slow feedback decay keeps preceding patches visible without allowing this
      // ambient layer to accumulate into the bright bands of the original Plasma.
      vec3 scene = vec3(red, green, blue) * 0.94;

      vec2 pinkCenter = vec2(
        -0.58 + sin(drift * 0.71) * 0.16,
        -0.12 + cos(drift * 0.53) * 0.14
      );
      vec2 purpleCenter = vec2(
        0.58 + cos(drift * 0.47) * 0.14,
        -0.46 + sin(drift * 0.61) * 0.12
      );
      vec2 orangeCenter = vec2(
        -0.48 + cos(drift * 0.39) * 0.12,
        0.62 + sin(drift * 0.44) * 0.10
      );
      vec2 cyanCenter = vec2(
        0.52 + sin(drift * 0.58) * 0.13,
        0.54 + cos(drift * 0.42) * 0.12
      );

      float pink = softBlob(centered, pinkCenter, 0.82);
      float purple = softBlob(centered, purpleCenter, 0.90);
      float orange = softBlob(centered, orangeCenter, 0.76);
      float cyan = softBlob(centered, cyanCenter, 0.88);

      vec3 ambient =
        vec3(0.93, 0.16, 0.47) * pink +
        vec3(0.45, 0.33, 0.64) * purple +
        vec3(0.97, 0.56, 0.15) * orange +
        vec3(0.06, 0.48, 0.62) * cyan;
      ambient *= uIntensity;

      float radius = length(centered);
      float vignette = 1.0 - smoothstep(0.34, 1.55, radius);
      vec3 colour = scene + ambient;
      colour *= 0.94 + vignette * 0.06;

      gl_FragColor = vec4(colour, 1.0);
    }
  \`;

  #ensureShader() {
    if (!this.#output) {
      this.#output = createGraphics(width, height, WEBGL);
      this.#output.pixelDensity(1);
      this.#output.noStroke();
      this.#program = this.#output.createShader(this.#vertexSource, this.#fragmentSource);
    } else if (this.#output.width !== width || this.#output.height !== height) {
      this.#output.resizeCanvas(width, height);
    }
  }

  draw({ audio, time, canvas }) {
    this.#ensureShader();
    this.#output.clear();
    this.#output.shader(this.#program);
    this.#program.setUniform("uScene", canvas);
    this.#program.setUniform("uResolution", [width, height]);
    this.#program.setUniform("uTime", time);
    this.#program.setUniform("uAudio", [audio.bass, audio.mid, audio.treble]);
    this.#program.setUniform("uIntensity", this.intensity({ audio, time }));
    this.#output.rect(0, 0, width, height);
    image(this.#output, 0, 0, width, height);
  }

  dispose() {
    this.#output?.remove();
    this.#output = null;
    this.#program = null;
  }
}

const plasma = new Plasma();

// %% scene scene
// Array order is layer order. Keep plasma last when you add another patch.
const scene = [plasma];
go(scene);
`;

/**
 * Upgrade only the untouched original Plasma fragment shader inside a saved project.
 * Patch configuration, installed library patches, and scene order remain source-owned.
 * If a performer already changed the old shader's identifying lines, it is treated as
 * their version and left alone.
 */
export function upgradeLegacyPlasma(source) {
  const legacySignatures = [
    'float warp = 0.008 + bass * 0.035;',
    'float bands = 0.5 + 0.5 * cos(',
    'vec3 plasmaColour = mix(',
  ];
  let upgraded = source;

  const startToken = '  #fragmentSource = `';
  const endToken = '\n  `;\n\n  #ensureShader()';
  const range = (text) => {
    const start = text.indexOf(startToken);
    const end = start === -1 ? -1 : text.indexOf(endToken, start);
    return start === -1 || end === -1
      ? null
      : { start, end: end + '\n  `;'.length };
  };
  if (legacySignatures.every((signature) => upgraded.includes(signature))) {
    const oldRange = range(upgraded);
    const newRange = range(STARTER_SOURCE);
    if (oldRange && newRange) {
      const replacement = STARTER_SOURCE.slice(newRange.start, newRange.end);
      upgraded = `${upgraded.slice(0, oldRange.start)}${replacement}${upgraded.slice(oldRange.end)}`;
    }
  }

  // Add the arrow-function control to the immediately previous subtle Plasma.
  // Exact signatures keep custom shader mappings untouched.
  const previousSubtleSignatures = [
    'class Plasma {\n  #output = null;\n  #program = null;',
    'uniform vec3 uAudio;\n\n    float softBlob',
    'ambient *= 0.0038 + bass * 0.006 + mid * 0.002;',
    'this.#program.setUniform("uAudio", [audio.bass, audio.mid, audio.treble]);',
  ];
  if (
    !upgraded.includes('intensity = ({ audio }) =>') &&
    previousSubtleSignatures.every((signature) => upgraded.includes(signature))
  ) {
    upgraded = upgraded
      .replace(
        '  #program = null;\n',
        `  #program = null;\n\n  // An arrow function can be a live parameter too. It receives the same changing\n  // draw context as the patch, then turns the audio into one shader value.\n  // Try doubling 0.006, or replace audio.bass with audio.treble.\n  intensity = ({ audio }) => 0.0038 + audio.bass * 0.006 + audio.mid * 0.002;\n`,
      )
      .replace('    uniform vec3 uAudio;\n', '    uniform vec3 uAudio;\n    uniform float uIntensity;\n')
      .replace('ambient *= 0.0038 + bass * 0.006 + mid * 0.002;', 'ambient *= uIntensity;')
      .replace(
        '    this.#program.setUniform("uAudio", [audio.bass, audio.mid, audio.treble]);\n',
        '    this.#program.setUniform("uAudio", [audio.bass, audio.mid, audio.treble]);\n    this.#program.setUniform("uIntensity", this.intensity({ audio, time }));\n',
      );
  }

  return upgraded;
}
