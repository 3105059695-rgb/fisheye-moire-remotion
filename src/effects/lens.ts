/** All animation inputs are explicit so seeking a Remotion frame is deterministic. */
export type LensParams = {
  strength?: number;
  /** Positive perspective makes the left side larger and the right side smaller. */
  tilt?: number;
  /** Clockwise screen rotation, in radians. */
  rotate?: number;
  /** Camera translation in output pixels, positive right/down. */
  panX?: number;
  panY?: number;
  zoom?: number;
  scanline?: number;
  moire?: number;
  vignette?: number;
  time?: number;
};

const vertexSource = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_screen;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Both screen UVs and the uploaded canvas use top-to-bottom Y coordinates.
  v_screen = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
}
`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_outputSize;
uniform vec2 u_sourceSize;
uniform vec2 u_pan;
uniform float u_strength;
uniform float u_tilt;
uniform float u_rotate;
uniform float u_zoom;
uniform float u_scanline;
uniform float u_moire;
uniform float u_vignette;
uniform float u_time;
in vec2 v_screen;
out vec4 outColor;

const float TAU = 6.283185307179586;

void main() {
  // Preserve circular optical geometry when the output is not exactly square.
  float radius = 0.5 * min(u_outputSize.x, u_outputSize.y);
  vec2 center = u_outputSize * 0.5;
  vec2 screenPoint = (v_screen * u_outputSize - center) / radius;
  vec2 cameraPoint = (v_screen * u_outputSize - center - u_pan) / radius;
  float c = cos(u_rotate);
  float s = sin(u_rotate);
  cameraPoint = vec2(c * cameraPoint.x + s * cameraPoint.y,
                   -s * cameraPoint.x + c * cameraPoint.y) / u_zoom;

  // Inverse of x' = x/(1 + tilt*x), y' = y/(1 + tilt*x).
  // This is a projective transform, not a horizontal scale approximation.
  float perspective = 1.0 - u_tilt * cameraPoint.x;
  if (perspective < 0.08) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 lensPoint = cameraPoint / perspective;

  // Inverse barrel mapping: source pixels at the periphery are compressed
  // toward the optical center. Horizontal baselines become curved arcs.
  float r2 = dot(lensPoint, lensPoint);
  vec2 sourcePoint = lensPoint * (1.0 + u_strength * r2);
  vec2 sourceUV = (center + sourcePoint * radius + (u_sourceSize - u_outputSize) * 0.5) / u_sourceSize;
  if (any(lessThan(sourceUV, vec2(0.0))) ||
      any(greaterThan(sourceUV, vec2(1.0)))) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 sampled = texture(u_source, sourceUV);
  vec3 color = sampled.rgb * sampled.a;
  vec2 sourcePixel = sourceUV * u_sourceSize;

  // Two near-frequency source-space gratings create a quiet interference
  // pattern. Because they precede the lens, the lines follow the same curves
  // as the text and chat bubbles rather than sitting flat on the final image.
  float primaryPhase = sourcePixel.y / 2.75;
  float secondaryPhase = (sourcePixel.y + sourcePixel.x * 0.010) / 2.81;
  float resolvable = 1.0 - smoothstep(0.40, 1.05, fwidth(primaryPhase));
  float primary = 0.5 + 0.5 * cos(TAU * primaryPhase);
  float secondary = 0.5 + 0.5 * cos(TAU * secondaryPhase + u_time * 0.12);
  float fineLines = mix(0.50, pow(primary, 4.0), resolvable);
  float interference = 0.5 + 0.5 * cos(TAU * (primaryPhase - secondaryPhase));
  float mesh = pow(primary * secondary, 2.0);
  color *= 1.0 - u_scanline * 0.22 * fineLines;
  color *= 1.0 - u_moire * (0.035 * interference + 0.055 * mesh * resolvable);

  // The lens housing stays fixed in screen space while the image moves.
  float corner = smoothstep(0.14, 1.85,
                           dot(screenPoint * vec2(0.94, 1.0), screenPoint * vec2(0.94, 1.0)));
  color *= 1.0 - u_vignette * 0.78 * corner;
  outColor = vec4(color, 1.0);
}
`;

const finite = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

const unit = (value: number | undefined, fallback: number): number =>
  Math.max(0, Math.min(1, finite(value, fallback)));

export const createLensRenderer = (
  target: HTMLCanvasElement,
): {
  render: (source: HTMLCanvasElement, params: LensParams) => void;
  dispose: () => void;
} => {
  const gl = target.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error("Fisheye lens: WebGL2 is unavailable in this browser.");
  }

  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let vertices: WebGLBuffer | null = null;
  let vertexArray: WebGLVertexArrayObject | null = null;
  let texture: WebGLTexture | null = null;
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (texture) gl.deleteTexture(texture);
    if (vertices) gl.deleteBuffer(vertices);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  };

  const compile = (
    type: number,
    source: string,
    label: string,
  ): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader)
      throw new Error(`Fisheye lens: could not create ${label} shader.`);
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        `Fisheye lens: ${label} shader compilation failed. ${gl.getShaderInfoLog(shader) ?? "No compiler diagnostics."}`,
      );
    }
    return shader;
  };

  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource, "vertex");
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource, "fragment");
    program = gl.createProgram();
    if (!program)
      throw new Error("Fisheye lens: could not create shader program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Fisheye lens: shader linking failed. ${gl.getProgramInfoLog(program) ?? "No linker diagnostics."}`,
      );
    }

    vertices = gl.createBuffer();
    vertexArray = gl.createVertexArray();
    texture = gl.createTexture();
    if (!vertices || !vertexArray || !texture) {
      throw new Error("Fisheye lens: could not allocate rendering resources.");
    }
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_position");
    if (position < 0)
      throw new Error("Fisheye lens: missing position attribute.");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 1);

    const uniform = (name: string): WebGLUniformLocation => {
      const location = gl.getUniformLocation(program as WebGLProgram, name);
      if (location === null)
        throw new Error(`Fisheye lens: missing uniform ${name}.`);
      return location;
    };
    const uniforms = {
      source: uniform("u_source"),
      outputSize: uniform("u_outputSize"),
      sourceSize: uniform("u_sourceSize"),
      pan: uniform("u_pan"),
      strength: uniform("u_strength"),
      tilt: uniform("u_tilt"),
      rotate: uniform("u_rotate"),
      zoom: uniform("u_zoom"),
      scanline: uniform("u_scanline"),
      moire: uniform("u_moire"),
      vignette: uniform("u_vignette"),
      time: uniform("u_time"),
    };

    return {
      render(source, params) {
        if (disposed)
          throw new Error("Fisheye lens: renderer has been disposed.");
        if (gl.isContextLost())
          throw new Error("Fisheye lens: WebGL context was lost.");
        if (
          !source.width ||
          !source.height ||
          !target.width ||
          !target.height
        ) {
          throw new Error(
            "Fisheye lens: source and target canvases must have nonzero dimensions.",
          );
        }
        gl.viewport(0, 0, target.width, target.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        );
        gl.uniform1i(uniforms.source, 0);
        gl.uniform2f(uniforms.outputSize, target.width, target.height);
        gl.uniform2f(uniforms.sourceSize, source.width, source.height);
        gl.uniform2f(
          uniforms.pan,
          finite(params.panX, 0),
          finite(params.panY, 0),
        );
        gl.uniform1f(
          uniforms.strength,
          Math.max(-0.15, Math.min(0.75, finite(params.strength, 0.23))),
        );
        gl.uniform1f(
          uniforms.tilt,
          Math.max(-0.5, Math.min(0.5, finite(params.tilt, 0))),
        );
        gl.uniform1f(uniforms.rotate, finite(params.rotate, 0));
        gl.uniform1f(uniforms.zoom, Math.max(0.05, finite(params.zoom, 1)));
        gl.uniform1f(uniforms.scanline, unit(params.scanline, 0.55));
        gl.uniform1f(uniforms.moire, unit(params.moire, 0.35));
        gl.uniform1f(uniforms.vignette, unit(params.vignette, 0.55));
        gl.uniform1f(uniforms.time, finite(params.time, 0));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        // Flush queued work without introducing a clock, RAF, or async callback.
        gl.flush();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
