/** Depth-parallax constants from the cover prototype. S and HB are tuning knobs. */
export const WOLF_PARALLAX_EYES = [
  [0.451, 0.311],
  [0.548, 0.310],
] as const;

/** Overall UV shift strength. */
export const WOLF_PARALLAX_S = 0.022;

/** Extra yaw on the head-turn mask (depth texture green channel). */
export const WOLF_PARALLAX_HB = 1.6;

/** Pointer smoothing, matching the prototype lerp. */
export const WOLF_PARALLAX_LERP = 0.1;

export const WOLF_PARALLAX_MAX_DPR = 2;
export const WOLF_PARALLAX_MAX_WIDTH = 2048;

export const WOLF_PARALLAX_VERTEX = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0,1);}`;

export const WOLF_PARALLAX_FRAGMENT = `precision mediump float;varying vec2 uv;uniform sampler2D img,dep;uniform vec2 m;uniform float S,HB;
void main(){vec2 u=uv;for(int i=0;i<3;i++){vec4 d=texture2D(dep,u);u=uv-m*S*((d.r-.35)+HB*d.g*(d.r-.2));}
gl_FragColor=texture2D(img,clamp(u,0.,1.));}`;

export type DepthPixels = {
  w: number;
  h: number;
  d: Uint8ClampedArray;
};

/** Same shift the shader applies at one texel: mouse * S * ((r-.35) + HB*g*(r-.2)). */
export function eyeDepthShift(
  depth: DepthPixels,
  ex: number,
  ey: number,
  lookX: number,
  lookY: number,
): [number, number] {
  const x = Math.min(depth.w - 1, Math.max(0, Math.round(ex * depth.w)));
  const y = Math.min(depth.h - 1, Math.max(0, Math.round(ey * depth.h)));
  const i = (y * depth.w + x) * 4;
  const r = (depth.d[i] ?? 0) / 255;
  const g = (depth.d[i + 1] ?? 0) / 255;
  const k = WOLF_PARALLAX_S * ((r - 0.35) + WOLF_PARALLAX_HB * g * (r - 0.2));
  return [lookX * k, lookY * k];
}

export function canvasBackingSize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), WOLF_PARALLAX_MAX_DPR);
  let width = Math.max(1, Math.round(cssWidth * dpr));
  let height = Math.max(1, Math.round(cssHeight * dpr));
  if (width > WOLF_PARALLAX_MAX_WIDTH) {
    const scale = WOLF_PARALLAX_MAX_WIDTH / width;
    width = WOLF_PARALLAX_MAX_WIDTH;
    height = Math.max(1, Math.round(height * scale));
  }
  return { width, height };
}

export type WolfHeadRenderer = {
  depth: DepthPixels;
  draw: (x: number, y: number) => void;
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number) => void;
  dispose: () => void;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`texture failed: ${src}`));
    image.src = src;
  });
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function uploadTexture(gl: WebGLRenderingContext, unit: number, image: HTMLImageElement, uniform: WebGLUniformLocation | null) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  const texture = gl.createTexture();
  if (!texture) throw new Error("texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uniform, unit);
  return texture;
}

function readDepth(image: HTMLImageElement): DepthPixels {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("depth readback unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  return { w: image.width, h: image.height, d: pixels.data };
}

export async function createWolfHeadRenderer(
  canvas: HTMLCanvasElement,
  imageSrc: string,
  depthSrc: string,
): Promise<WolfHeadRenderer> {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("webgl unavailable");

  const lose = () => {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  try {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, WOLF_PARALLAX_VERTEX);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, WOLF_PARALLAX_FRAGMENT);
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "program link failed");
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const [image, depthImage] = await Promise.all([loadImage(imageSrc), loadImage(depthSrc)]);
    if (gl.isContextLost()) throw new Error("webgl context lost");

    const imageTexture = uploadTexture(gl, 0, image, gl.getUniformLocation(program, "img"));
    const depthTexture = uploadTexture(gl, 1, depthImage, gl.getUniformLocation(program, "dep"));
    const depth = readDepth(depthImage);
    const mouse = gl.getUniformLocation(program, "m");
    gl.uniform1f(gl.getUniformLocation(program, "S"), WOLF_PARALLAX_S);
    gl.uniform1f(gl.getUniformLocation(program, "HB"), WOLF_PARALLAX_HB);

    return {
      depth,
      draw(x: number, y: number) {
        if (gl.isContextLost()) return;
        gl.uniform2f(mouse, x, y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      resize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
        const next = canvasBackingSize(cssWidth, cssHeight, devicePixelRatio);
        if (canvas.width !== next.width || canvas.height !== next.height) {
          canvas.width = next.width;
          canvas.height = next.height;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      dispose() {
        gl.deleteTexture(imageTexture);
        gl.deleteTexture(depthTexture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        lose();
      },
    };
  } catch (error) {
    lose();
    throw error;
  }
}
