// Fourfold as a small world, in plain WebGL (no libraries), the way Lype's place is drawn: a continent shaped by the
// map, a watchtower and banner on every territory, soldiers standing for its troops, ships on the sea lanes, volleys
// flying when a house attacks, and speech bubbles over a house when it talks. The sun moves as the rounds go by.
// Borrowed models are Kenney's (kenney.nl, CC0), packed as Lype packs them.

const SCALE = 100; // map pixels per world unit
const STEP = 0.05; // terrain grid
const BOUNDS = { x0: -6.4, x1: 6.4, z0: -4.8, z1: 4.8 };
const BIOME = {
  rime: { ground: '#dfe7ee', bump: 0.07, decor: [['holiday/tree-snow-a', 0.3, 5], ['nature/tree_pineRoundA', 0.26, 3], ['holiday/rocks-small', 0.08, 2], ['holiday/snow-pile', 0.04, 2]] },
  thorn: { ground: '#4f7d45', bump: 0.03, decor: [['nature/tree_oak_dark', 0.3, 4], ['nature/tree_detailed_dark', 0.28, 4], ['nature/tree_default_dark', 0.3, 3], ['nature/mushroom_redGroup', 0.06, 2]] },
  salt: { ground: '#dccb98', bump: 0.012, decor: [['nature/tree_palm', 0.3, 4], ['nature/tree_palmShort', 0.24, 3], ['nature/tree_palmBend', 0.28, 2], ['nature/rock_largeA', 0.06, 2]] },
  ember: { ground: '#c98650', bump: 0.04, decor: [['nature/cactus_tall', 0.18, 4], ['nature/cactus_short', 0.13, 4], ['nature/rock_tallG', 0.14, 2], ['nature/rock_largeF', 0.07, 2]] },
  hollow: { ground: '#8db35b', bump: 0.02, decor: [['town/tree', 0.3, 4], ['nature/tree_default_fall', 0.26, 2], ['nature/plant_bushDetailed', 0.07, 3]] },
  shards: { ground: '#8e918b', bump: 0.08, decor: [['nature/rock_tallA', 0.16, 2], ['holiday/rocks-medium', 0.1, 2], ['graveyard/pine', 0.26, 2]] },
};
const LANDMARK = { crownheart: ['harbour/tower-complete-large', 0.62], lanternfold: ['town/windmill', 0.0], greywatch: ['nature/statue_obelisk', 0.0] };
const SAND = hex('#d8c58e');
const DEEP = hex('#1d4a63');
const NEUTRAL = '#9a9488';

// ---------- small math ----------
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const M = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  ortho(r, near, far) {
    const nf = 1 / (near - far);
    return [1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, 2 * nf, 0, 0, 0, (far + near) * nf, 1];
  },
  lookAt(eye, at, up = [0, 1, 0]) {
    const z = norm(sub(eye, at));
    const x = norm(cross(up, z));
    const y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  },
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  // translate · rotateY(yaw) · rotateX(pitch) · scale
  model([tx, ty, tz], yaw = 0, [sx, sy, sz] = [1, 1, 1], pitch = 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    return [c * sx, 0, -s * sx, 0, s * sp * sy, cp * sy, c * sp * sy, 0, s * cp * sz, -sp * sz, c * cp * sz, 0, tx, ty, tz, 1];
  },
  apply(m, [x, y, z]) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
  },
};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const wave = (x, z) => Math.sin(x * 1.7 + z * 2.3) * 0.5 + Math.sin(x * 3.1 - z * 1.9) * 0.3 + Math.sin(x * 7.3 + z * 5.1) * 0.2;
const segDist = (px, pz, a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
};

// ---------- shaders ----------
const VS = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aColor; attribute vec4 aEmit;
uniform mat4 uVP, uModel, uLightVP; uniform float uTime, uWave; uniform vec4 uPulse;
varying vec3 vN, vC, vW, vEmit; varying vec4 vL;
void main() {
  vec3 p = aPos;
  if (uWave > 0.0) p.z += sin(uTime * 7.0 - p.x * 9.0) * 0.6 * p.x;
  vec4 w = uModel * vec4(p, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNorm; vC = aColor; vL = uLightVP * w;
  // aEmit.a is the owning house's seat (0-3), or -1: its land breathes while that house is thinking
  vec4 seat = vec4(equal(vec4(aEmit.a), vec4(0.0, 1.0, 2.0, 3.0)));
  vEmit = aEmit.rgb * (1.0 + dot(uPulse, seat));
  gl_Position = uVP * w;
}`;
const FS = `
precision highp float;
uniform vec3 uTint, uSun, uSunColor, uSky, uGround, uFog, uEye;
uniform float uGlow, uAlpha, uWater, uTime, uFogNear, uFogFar, uShadowOn;
uniform sampler2D uShadow;
varying vec3 vN, vC, vW, vEmit; varying vec4 vL;
float unpack(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float sunlit() {
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || uShadowOn < 0.5) return 1.0;
  float lit = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    lit += p.z - 0.002 > unpack(texture2D(uShadow, p.xy + vec2(float(x), float(y)) / 2048.0)) ? 0.0 : 1.0;
  return lit / 9.0;
}
void main() {
  vec3 n = normalize(vN);
  vec3 base = vC * uTint;
  float a = uAlpha;
  if (uWater > 0.5) {
    n = normalize(vec3(sin(vW.x * 9.0 + uTime * 1.1) * 0.06 + sin(vW.z * 17.0 - uTime * 1.7) * 0.03, 1.0, cos(vW.z * 11.0 + uTime * 1.3) * 0.06));
    vec3 v = normalize(uEye - vW);
    float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 60.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    base = mix(base, uSky, fres * 0.6) + uSunColor * spec * 0.8;
    a = mix(0.72, 0.95, fres);
  }
  float ndl = max(dot(n, uSun), 0.0);
  float sh = sunlit();
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 lit = uWater > 0.5 ? base * (amb * 0.6 + uSunColor * 0.5) : base * (amb + uSunColor * ndl * (0.35 + 0.65 * sh));
  lit = mix(lit, base * 1.6 + 0.15, uGlow);
  lit += vEmit;
  float f = clamp((distance(vW, uEye) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(lit, uFog, f * 0.85), a);
}`;
const DEPTH_VS = `
attribute vec3 aPos; uniform mat4 uModel, uLightVP; uniform float uTime, uWave; varying float vZ;
void main() { vec3 p = aPos; if (uWave > 0.0) p.z += sin(uTime * 7.0 - p.x * 9.0) * 0.6 * p.x;
  gl_Position = uLightVP * uModel * vec4(p, 1.0); vZ = gl_Position.z * 0.5 + 0.5; }`;
const DEPTH_FS = `
precision highp float; varying float vZ;
void main() { vec4 c = fract(vZ * vec4(1.0, 255.0, 65025.0, 16581375.0)); gl_FragColor = c - c.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0); }`;

function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u, aPos: gl.getAttribLocation(p, 'aPos'), aNorm: gl.getAttribLocation(p, 'aNorm'), aColor: gl.getAttribLocation(p, 'aColor'), aEmit: gl.getAttribLocation(p, 'aEmit') };
}

// ---------- shapes: interleaved position, normal, colour ----------
function boxData() {
  const v = [];
  const f = (n, corners) => [0, 1, 2, 0, 2, 3].forEach((i) => v.push(...corners[i], ...n, 1, 1, 1));
  f([0, 1, 0], [[-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5]]);
  f([0, -1, 0], [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]]);
  f([0, 0, 1], [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]]);
  f([0, 0, -1], [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]]);
  f([1, 0, 0], [[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]]);
  f([-1, 0, 0], [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]]);
  return v;
}
function cylinderData(sides = 14, top = 0.5) {
  const v = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const n0 = [Math.cos(a0), 0.2, Math.sin(a0)];
    const n1 = [Math.cos(a1), 0.2, Math.sin(a1)];
    const quad = [[p(a0, 0.5, 0), n0], [p(a1, 0.5, 0), n1], [p(a1, top, 1), n1], [p(a0, 0.5, 0), n0], [p(a1, top, 1), n1], [p(a0, top, 1), n0]];
    for (const [pos, n] of quad) v.push(...pos, ...n, 1, 1, 1);
    for (const pos of [[0, 1, 0], p(a1, top, 1), p(a0, top, 1)]) v.push(...pos, 0, 1, 0, 1, 1, 1);
  }
  return v;
}
function sphereData(seg = 10) {
  const v = [];
  const pt = (i, j) => {
    const th = (i / seg) * Math.PI;
    const ph = (j / seg) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5 + 0.5, Math.sin(th) * Math.sin(ph) * 0.5];
  };
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < seg; j++)
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
        const p = pt(a, b);
        v.push(...p, ...norm([p[0], p[1] - 0.5, p[2]]), 1, 1, 1);
      }
  return v;
}
// A soldier: a cone of a body and a round head.
function pawnData() {
  const body = cylinderData(10, 0.18).map((x, i) => (i % 9 === 1 ? x * 0.7 : i % 9 === 0 || i % 9 === 2 ? x * 0.9 : x));
  const head = sphereData(8).map((x, i) => (i % 9 === 1 ? x * 0.42 + 0.62 : i % 9 === 0 || i % 9 === 2 ? x * 0.42 : x));
  return [...body, ...head];
}
const flagData = () => boxData().map((x, i) => (i % 9 === 0 ? x + 0.5 : i % 9 === 2 ? x * 0.06 : x));

/** A Kenney model as Lype packs it ("LYM1"): unit-box corners, normals, colours, triangles. */
function unpackModel(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'LYM1') throw new Error('not a model');
  const n = dv.getUint32(4, true);
  const ni = dv.getUint32(8, true);
  const P = 24;
  const N = P + n * 6;
  const C = N + n * 4;
  const I = C + n * 4;
  const wide = n > 65535;
  const v = new Float32Array(ni * 9);
  for (let t = 0; t < ni; t++) {
    const i = wide ? dv.getUint32(I + t * 4, true) : dv.getUint16(I + t * 2, true);
    const o = t * 9;
    v[o] = dv.getUint16(P + i * 6, true) / 65535 - 0.5;
    v[o + 1] = dv.getUint16(P + i * 6 + 2, true) / 65535;
    v[o + 2] = dv.getUint16(P + i * 6 + 4, true) / 65535 - 0.5;
    for (let k = 0; k < 3; k++) v[o + 3 + k] = dv.getInt8(N + i * 4 + k) / 127;
    for (let k = 0; k < 3; k++) v[o + 6 + k] = dv.getUint8(C + i * 4 + k) / 255;
  }
  return v;
}

// ---------- the world ----------
export async function createWorld(canvas, overlay, map, { onPick } = {}) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) throw new Error('no WebGL');
  const prog = program(gl, VS, FS);
  const depth = program(gl, DEPTH_VS, DEPTH_FS);
  gl.enable(gl.DEPTH_TEST);

  const T = map.territories;
  const ids = Object.keys(T);
  const pos = Object.fromEntries(ids.map((id) => [id, [(T[id].x - 500) / SCALE, (T[id].y - 360) / SCALE]]));
  const landEdges = map.edges.filter(([a, b]) => T[a].region !== 'shards' && T[b].region !== 'shards');
  const seaEdges = map.edges.filter(([a, b]) => T[a].region === 'shards' || T[b].region === 'shards');
  const seatColor = Object.fromEntries(map.seats.map((s) => [s.id, s.color]));

  // Ground: every point belongs to the nearest territory if it is close enough, or lies along a land border.
  function sample(x, z) {
    let d1 = 1e9;
    let d2 = 1e9;
    let t1 = null;
    let t2 = null;
    for (const id of ids) {
      const d = Math.hypot(x - pos[id][0], z - pos[id][1]);
      if (d < d1) [d2, t2, d1, t1] = [d1, t1, d, id];
      else if (d < d2) [d2, t2] = [d, id];
    }
    const R = (T[t1].region === 'shards' ? 0.56 : 0.86) + wave(x * 2.1, z * 2.1) * 0.06;
    let w = smooth(R, R - 0.3, d1);
    for (const [a, b] of landEdges) w = Math.max(w, smooth(0.42, 0.16, segDist(x, z, pos[a], pos[b])));
    const gap = Math.hypot(pos[t1][0] - pos[t2][0], pos[t1][1] - pos[t2][1]);
    const toBorder = (d2 * d2 - d1 * d1) / (2 * gap);
    const border = smooth(0.035, 0.0, toBorder) * smooth(0.5, 0.8, w);
    const bump = BIOME[T[t1].region].bump * (wave(x * 1.3, z * 1.3) + 1) * w;
    const h = -0.24 + w * 0.34 + bump - border * 0.02;
    const front = smooth(0.11, 0.0, toBorder) * smooth(0.5, 0.8, w); // a wider band, for the glow along frontiers
    return { t: t1, t2, w, border, front, h };
  }
  const groundAt = (x, z) => Math.max(sample(x, z).h, 0);

  // ----- terrain mesh -----
  const nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / STEP) + 1;
  const nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / STEP) + 1;
  const info = new Array(nx * nz);
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const s = sample(BOUNDS.x0 + i * STEP, BOUNDS.z0 + j * STEP);
      s.jit = wave(i * 0.9, j * 1.1) * 0.03;
      info[j * nx + i] = s;
      heights[j * nx + i] = s.h;
    }
  const geo = new Float32Array(nx * nz * 6);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const hl = heights[j * nx + Math.max(0, i - 1)];
      const hr = heights[j * nx + Math.min(nx - 1, i + 1)];
      const hd = heights[Math.max(0, j - 1) * nx + i];
      const hu = heights[Math.min(nz - 1, j + 1) * nx + i];
      const n = norm([hl - hr, 2 * STEP, hd - hu]);
      geo.set([BOUNDS.x0 + i * STEP, heights[k], BOUNDS.z0 + j * STEP, ...n], k * 6);
    }
  const idx = new Uint16Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.set([a, a + nx, a + 1, a + 1, a + nx, a + nx + 1], q);
      q += 6;
    }
  const terrain = { buf: gl.createBuffer(), colorBuf: gl.createBuffer(), emitBuf: gl.createBuffer(), index: gl.createBuffer(), count: idx.length, stride: 24 };
  gl.bindBuffer(gl.ARRAY_BUFFER, terrain.buf);
  gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrain.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const colors = new Float32Array(nx * nz * 3);
  const emits = new Float32Array(nx * nz * 4);
  const seatIndex = Object.fromEntries(map.seats.map((x, i) => [x.id, i]));
  const biomeRGB = Object.fromEntries(Object.entries(BIOME).map(([k, b]) => [k, hex(b.ground)]));
  function paintGround(owners) {
    for (let k = 0; k < info.length; k++) {
      const s = info[k];
      let c;
      if (s.h < 0.005) c = mix3(SAND, DEEP, smooth(-0.005, -0.2, s.h));
      else {
        c = biomeRGB[T[s.t].region];
        const o = owners[s.t];
        c = mix3(c, hex(o ? seatColor[o] : NEUTRAL), o ? 0.5 : 0.12);
        c = mix3(c, SAND, smooth(0.04, 0.0, s.h) * 0.8);
        c = c.map((v) => v * (1 + s.jit) * (1 - s.border * 0.45));
      }
      colors.set(c, k * 3);
      // Held land glows in its owner's colour, brightest along a frontier with someone else's.
      const o = s.h >= 0.005 ? owners[s.t] : null;
      if (o) {
        const front = owners[s.t2] !== o ? s.front * s.front : 0;
        const oc = mix3(hex(seatColor[o]), [1, 1, 1], front * 0.35);
        const k2 = 0.11 + front * 0.55;
        emits.set([oc[0] * k2, oc[1] * k2, oc[2] * k2, seatIndex[o]], k * 4);
      } else emits.set([0, 0, 0, -1], k * 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, terrain.emitBuf);
    gl.bufferData(gl.ARRAY_BUFFER, emits, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrain.colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  }
  paintGround({});

  const upload = (data) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
    return { buf, count: (data.length / 9) | 0, stride: 36 };
  };
  const water = upload((() => {
    const v = [];
    const [x0, x1, z0, z1] = [-30, 30, -30, 30];
    for (const p of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) v.push(p[0], 0, p[1], 0, 1, 0, ...hex('#2f7896'));
    return v;
  })());
  const seabed = upload((() => {
    const v = [];
    for (const p of [[-30, -30], [-30, 30], [30, 30], [-30, -30], [30, 30], [30, -30]]) v.push(p[0], -0.23, p[1], 0, 1, 0, ...DEEP);
    return v;
  })());
  const box = upload(boxData());
  const pawn = upload(pawnData());
  const flag = upload(flagData());
  const ball = upload(sphereData(8));
  const disc = upload(cylinderData(28, 0.5));

  // Borrowed models: fetched in the background; anything not yet here is simply not drawn.
  const catalogue = await fetch('models/models.json').then((r) => r.json());
  const meshes = {};
  for (const id of Object.keys(catalogue.models))
    fetch(`models/${id}.bin`)
      .then((r) => r.arrayBuffer())
      .then((b) => (meshes[id] = upload(unpackModel(b))))
      .catch(() => {});
  const placeModel = (id, x, z, height, yaw = 0, y = null) => {
    const d = catalogue.models[id];
    const s = height / d[1];
    // Kenney's greens lean teal; warmed a little so soldiers (Salt's are teal) stand out from the trees.
    const tint = /tower|windmill|statue/.test(id) ? [1.04, 1.0, 0.9] : [0.92, 1.0, 0.7];
    return { id, m: M.model([x, y ?? groundAt(x, z), z], yaw, [d[0] * s, d[1] * s, d[2] * s]), tint };
  };

  // Roads along land borders, laid on the ground.
  const road = upload((() => {
    const v = [];
    const col = hex('#a08a66');
    for (const [a, b] of landEdges) {
      const A = pos[a];
      const B = pos[b];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const nX = -(B[1] - A[1]) / len;
      const nZ = (B[0] - A[0]) / len;
      const steps = Math.ceil(len / 0.06);
      for (let s = 0; s < steps; s++) {
        const p = [0, 1].map((k) => {
          const t = (s + k) / steps;
          const x = lerp(A[0], B[0], t);
          const z = lerp(A[1], B[1], t);
          return [x, z, groundAt(x, z) + 0.006];
        });
        const w = 0.022;
        const c = (pt, side) => [pt[0] + nX * w * side, pt[2], pt[1] + nZ * w * side];
        for (const [pt, side] of [[p[0], -1], [p[1], -1], [p[1], 1], [p[0], -1], [p[1], 1], [p[0], 1]]) v.push(...c(pt, side), 0, 1, 0, ...col);
      }
    }
    return v;
  })());

  // ----- what stands on each territory -----
  const scenery = [];
  const site = {};
  ids.forEach((id, n) => {
    const [x, z] = pos[id];
    const g = groundAt(x, z);
    const big = id === 'crownheart';
    site[id] = { x, z, g, top: g + (big ? 0.62 : 0.3) };
    scenery.push(big ? placeModel(...LANDMARK.crownheart, x, z) : placeModel('harbour/tower-watch', x, z, 0.3, n * 0.7));
    if (LANDMARK[id] && !big) {
      const lm = id === 'lanternfold' ? placeModel('town/windmill', x - 0.42, z - 0.12, 0.42, 1.2) : placeModel('nature/statue_obelisk', x + 0.36, z - 0.22, 0.2);
      scenery.push(lm);
    }
    const r = rng(n * 977 + 13);
    for (const [model, size, count] of BIOME[T[id].region].decor) {
      let placed = 0;
      for (let tries = 0; tries < 30 && placed < count; tries++) {
        const a = r() * Math.PI * 2;
        const d = 0.36 + r() * 0.3;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        const s = sample(px, pz);
        if (s.t !== id || s.h < 0.03 || s.border > 0.2) continue;
        if (landEdges.some(([e1, e2]) => (e1 === id || e2 === id) && segDist(px, pz, pos[e1], pos[e2]) < 0.07)) continue;
        scenery.push(placeModel(model, px, pz, size * (0.8 + r() * 0.4), r() * 6.28));
        placed++;
      }
    }
  });
  const ships = seaEdges.map(([a, b], i) => ({ a: pos[a], b: pos[b], phase: i * 1.7 }));

  // ----- labels over territories -----
  overlay.innerHTML = '';
  const labels = {};
  for (const id of ids) {
    const el = document.createElement('div');
    el.className = 'tlabel';
    el.innerHTML = `<b></b><span>${T[id].name}</span>`;
    overlay.appendChild(el);
    labels[id] = el;
  }

  // ----- state shown (it lags the game a little while events play out) -----
  let shown = {};
  let houses = {};
  let active = null;
  let round = 1;
  let seat = 0;
  const effects = [];
  const queue = [];
  let playing = null;
  const bubbles = [];

  function sync(snap) {
    if (!snap) return;
    houses = snap.houses;
    round = snap.round;
    seat = Math.max(0, map.seats.findIndex((s) => s.id === snap.current));
    active = snap.status === 'running' ? snap.current : null;
    if (!queue.length && !playing) {
      shown = JSON.parse(JSON.stringify(snap.territories));
      refresh();
    }
    pending = snap;
    dirty = true;
  }
  let pending = null;
  let dirty = false; // a newer state has arrived that the board hasn't caught up with
  function refresh() {
    paintGround(Object.fromEntries(ids.map((id) => [id, shown[id]?.owner])));
    for (const id of ids) {
      const t = shown[id];
      const b = labels[id].firstChild;
      b.textContent = t.troops;
      b.style.background = t.owner ? seatColor[t.owner] : '#4a4f5c';
      b.style.color = t.owner ? '#0b0d12' : '#e9edf5';
    }
  }

  // ----- camera -----
  const HOME = 10.2;
  const cam = { yaw: 0, pitch: 1.12, dist: HOME, at: [0, 0, 0.3], goalAt: [0, 0, 0.3], goalDist: HOME, sway: 0 };
  let userUntil = 0;
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    userUntil = performance.now() + 25000;
    if (drag.pan) {
      const c = Math.cos(cam.yaw);
      const s = Math.sin(cam.yaw);
      const k = cam.dist * 0.0018;
      cam.goalAt = [cam.goalAt[0] - (dx * c + dy * s) * k, 0, cam.goalAt[2] - (-dx * s + dy * c) * k];
      cam.at = cam.goalAt.slice();
    } else {
      cam.yaw -= dx * 0.006;
      cam.pitch = clamp(cam.pitch + dy * 0.004, 0.25, 1.45);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 6) pick(e);
    drag = null;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.goalDist = clamp(cam.goalDist * Math.exp(e.deltaY * 0.0012), 2.2, 16);
    userUntil = performance.now() + 25000;
  }, { passive: false });
  function overview() {
    cam.goalAt = [0, 0, 0.3];
    cam.goalDist = HOME;
    cam.yaw = cam.sway;
    userUntil = 0;
  }
  function focus(x, z, dist = 6) {
    if (performance.now() < userUntil) return;
    cam.goalAt = [x * 0.6, 0, z * 0.6 + 0.1];
    cam.goalDist = dist;
  }

  let view = { vp: null, eye: [0, 0, 0], w: 1, h: 1 };
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = null;
    let bd = 40;
    for (const id of ids) {
      const s = site[id];
      const p = M.apply(view.vp, [s.x, s.g + 0.15, s.z]);
      const sx = (p[0] * 0.5 + 0.5) * r.width;
      const sy = (0.5 - p[1] * 0.5) * r.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd) [bd, best] = [d, id];
    }
    if (best) onPick?.(best, shown[best]?.owner);
  }

  // ----- events, played one after another -----
  function play(events) {
    for (const e of events) if (['battle', 'place', 'move', 'say', 'eliminated'].includes(e.type)) queue.push(e);
    if (queue.length > 60) {
      queue.length = 0; // far behind (a tab left in the background): catch up at once
      if (pending) shown = JSON.parse(JSON.stringify(pending.territories));
      refresh();
    }
  }
  const DUR = { battle: 1500, place: 450, move: 900, say: 350, eliminated: 1600 };
  function step(now) {
    if (playing && now - playing.t0 >= DUR[playing.e.type]) {
      finish(playing.e);
      playing = null;
    }
    if (!playing && queue.length) {
      const e = queue.shift();
      playing = { e, t0: now };
      begin(e, now);
    }
    if (!playing && !queue.length && dirty && pending) {
      dirty = false;
      shown = JSON.parse(JSON.stringify(pending.territories));
      refresh();
    }
  }
  function begin(e, now) {
    if (e.type === 'battle') {
      const a = site[e.from];
      const b = site[e.to];
      focus((a.x + b.x) / 2, (a.z + b.z) / 2, 7.4);
      const n = Math.min(14, Math.max(3, e.sent));
      for (let i = 0; i < n; i++) effects.push({ kind: 'shot', a, b, color: hex(seatColor[e.house]), t0: now + i * (700 / n), dur: 650, lift: 0.35 + (i % 3) * 0.08 });
      effects.push({ kind: 'burst', at: b, color: hex(e.won ? seatColor[e.house] : '#e05a4a'), t0: now + 900, dur: 700 });
      shown[e.from].troops = Math.max(1, shown[e.from].troops - e.sent);
      refresh();
    } else if (e.type === 'place') {
      const s = site[e.to];
      effects.push({ kind: 'rise', at: s, color: hex(seatColor[e.house]), t0: now, dur: 600 });
    } else if (e.type === 'move') {
      const a = site[e.from];
      const b = site[e.to];
      effects.push({ kind: 'march', a, b, color: hex(seatColor[e.house]), t0: now, dur: 850 });
    } else if (e.type === 'say') {
      speak(e);
    } else if (e.type === 'eliminated') {
      for (const id of ids) if (shown[id].owner === e.house) shown[id].owner = null;
    }
  }
  function finish(e) {
    const T2 = shown;
    if (e.type === 'battle') {
      if (e.won) T2[e.to] = { owner: e.house, troops: e.survivors };
      else T2[e.to].troops = e.survivors;
    } else if (e.type === 'place') T2[e.to].troops += e.n;
    else if (e.type === 'move') {
      T2[e.from].troops -= e.n;
      T2[e.to].troops += e.n;
    }
    refresh();
  }
  function speak(e) {
    // Over the speaker's strongest territory.
    const mine = ids.filter((id) => shown[id]?.owner === e.house).sort((a, b) => shown[b].troops - shown[a].troops);
    const where = mine[0];
    if (!where) return;
    const el = document.createElement('div');
    el.className = `bubble${e.to ? ' private' : ''}`;
    el.style.setProperty('--c', seatColor[e.house]);
    const who = houses[e.house]?.house || e.house;
    el.innerHTML = `<i>${who}${e.to ? ` → ${houses[e.to]?.house || e.to} · private` : ''}</i>${String(e.text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}`;
    overlay.appendChild(el);
    bubbles.forEach((b) => b.house === e.house && (b.lift += 1));
    bubbles.push({ el, at: site[where], t0: performance.now(), house: e.house, lift: 0 });
  }

  // ----- shadows -----
  const SHADOW = 2048;
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW, SHADOW, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const shadowFb = gl.createFramebuffer();
  const shadowDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, shadowDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW, SHADOW);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ----- drawing -----
  function bindMesh(p, m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.enableVertexAttribArray(p.aPos);
    gl.vertexAttribPointer(p.aPos, 3, gl.FLOAT, false, m.stride, 0);
    if (p.aNorm >= 0) {
      gl.enableVertexAttribArray(p.aNorm);
      gl.vertexAttribPointer(p.aNorm, 3, gl.FLOAT, false, m.stride, 12);
    }
    if (p.aColor >= 0) {
      gl.enableVertexAttribArray(p.aColor);
      if (m.colorBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.colorBuf);
        gl.vertexAttribPointer(p.aColor, 3, gl.FLOAT, false, 12, 0);
      } else gl.vertexAttribPointer(p.aColor, 3, gl.FLOAT, false, m.stride, 24);
    }
    if (p.aEmit >= 0) {
      if (m.emitBuf) {
        gl.enableVertexAttribArray(p.aEmit);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.emitBuf);
        gl.vertexAttribPointer(p.aEmit, 4, gl.FLOAT, false, 16, 0);
      } else {
        gl.disableVertexAttribArray(p.aEmit);
        gl.vertexAttrib4f(p.aEmit, 0, 0, 0, -1);
      }
    }
  }
  function draw(p, m, model, { tint = [1, 1, 1], glow = 0, alpha = 1, waterOn = 0, waveOn = 0 } = {}) {
    if (!m) return;
    bindMesh(p, m);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    if (p.u.uTint) gl.uniform3fv(p.u.uTint, tint);
    if (p.u.uGlow) gl.uniform1f(p.u.uGlow, glow);
    if (p.u.uAlpha) gl.uniform1f(p.u.uAlpha, alpha);
    if (p.u.uWater) gl.uniform1f(p.u.uWater, waterOn);
    gl.uniform1f(p.u.uWave, waveOn);
    if (m.index) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.index);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    } else gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }
  const I = M.model([0, 0, 0]);

  // Everything that stands, as [mesh, matrix, options], rebuilt each frame (it is small).
  function standing(now) {
    const out = [];
    const time = now / 1000;
    out.push([seabed, I, {}], [terrain, I, {}], [road, I, {}]);
    for (const s of scenery) out.push([meshes[s.id], s.m, { tint: s.tint || [1, 1, 1] }]);
    for (const id of ids) {
      const t = shown[id];
      const s = site[id];
      if (!t) continue;
      const color = t.owner ? hex(seatColor[t.owner]) : hex(NEUTRAL);
      const glow = t.owner && t.owner === active ? 0.25 + 0.2 * Math.sin(time * 4) : 0;
      // the banner on its tower
      out.push([box, M.model([s.x, s.top, s.z], 0, [0.012, 0.2, 0.012]), { tint: [0.35, 0.3, 0.26] }]);
      if (t.owner) out.push([flag, M.model([s.x, s.top + 0.12, s.z], 0.6 + id.length, [0.16, 0.08, 0.1]), { tint: color, glow, waveOn: 1 }]);
      // its soldiers, in a ring round the tower (one for each troop, up to twelve; the number says the rest)
      const n = Math.min(12, t.troops);
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(n, 6)) * Math.PI * 2 + 0.4;
        const r = 0.24 + (i % 2) * 0.05;
        const px = s.x + Math.cos(a) * r;
        const pz = s.z + Math.sin(a) * r;
        out.push([pawn, M.model([px, groundAt(px, pz), pz], -a, [0.05, 0.07, 0.05]), { tint: color, glow }]);
      }
    }
    for (const sh of ships) {
      const u = Math.sin(time * 0.12 + sh.phase) * 0.5 + 0.5;
      const t = 0.3 + 0.4 * u;
      const x = lerp(sh.a[0], sh.b[0], t);
      const z = lerp(sh.a[1], sh.b[1], t);
      const back = Math.cos(time * 0.12 + sh.phase) < 0;
      const yaw = Math.atan2(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]) + (back ? Math.PI : 0);
      const d = catalogue.models['harbour/ship-small'];
      const k = 0.22 / d[1];
      out.push([meshes['harbour/ship-small'], M.model([x, -0.03 + Math.sin(time * 1.5 + sh.phase) * 0.008, z], yaw, [d[0] * k, d[1] * k, d[2] * k]), {}]);
    }
    return out;
  }

  function effectsNow(now) {
    const out = [];
    for (let i = effects.length - 1; i >= 0; i--) {
      const f = effects[i];
      const t = (now - f.t0) / f.dur;
      if (t > 1) {
        effects.splice(i, 1);
        continue;
      }
      if (t < 0) continue;
      if (f.kind === 'shot') {
        const x = lerp(f.a.x, f.b.x, t);
        const z = lerp(f.a.z, f.b.z, t);
        const y = lerp(f.a.g + 0.15, f.b.g + 0.1, t) + Math.sin(t * Math.PI) * f.lift;
        out.push([ball, M.model([x, y, z], 0, [0.045, 0.045, 0.045]), { tint: f.color, glow: 0.9 }]);
      } else if (f.kind === 'burst') {
        const r = 0.15 + t * 0.6;
        out.push([disc, M.model([f.at.x, f.at.g + 0.02, f.at.z], 0, [r, 0.02, r]), { tint: f.color, glow: 0.8, alpha: 1 - t }]);
      } else if (f.kind === 'rise') {
        out.push([disc, M.model([f.at.x, f.at.g + t * 0.5, f.at.z], 0, [0.5, 0.012, 0.5]), { tint: f.color, glow: 0.8, alpha: 1 - t }]);
      } else if (f.kind === 'march') {
        for (let k = 0; k < 3; k++) {
          const u = clamp(t - k * 0.1);
          const x = lerp(f.a.x, f.b.x, u);
          const z = lerp(f.a.z, f.b.z, u);
          out.push([pawn, M.model([x, groundAt(x, z), z], 0, [0.05, 0.07, 0.05]), { tint: f.color }]);
        }
      }
    }
    return out;
  }

  // The sun goes round once every eight rounds; it is never quite night.
  function sky() {
    const t = ((round - 1) * 4 + seat) / 32 + 0.2;
    const az = t * Math.PI * 2;
    const elev = 0.55 + 0.35 * Math.sin(az);
    const sun = norm([Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.6 + 0.4]);
    const warm = smooth(0.5, 0.25, elev);
    const night = smooth(0.35, 0.2, elev);
    return {
      sun,
      sunColor: mix3(mix3([1.0, 0.96, 0.88], [1.0, 0.7, 0.45], warm), [0.6, 0.66, 0.85], night),
      skyCol: mix3(mix3([0.55, 0.72, 0.9], [0.85, 0.6, 0.5], warm), [0.3, 0.36, 0.55], night),
      ground: mix3([0.36, 0.33, 0.28], [0.2, 0.21, 0.28], night),
      fog: mix3(mix3([0.62, 0.74, 0.84], [0.8, 0.62, 0.55], warm), [0.2, 0.24, 0.36], night),
    };
  }

  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    step(now);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    // camera: drift slowly when nobody is steering; ease towards what is happening
    // Left alone, it sways gently about the south view and drifts back to the whole world between battles.
    if (now > userUntil) {
      cam.sway = Math.sin(now / 26000) * 0.3;
      cam.yaw = lerp(cam.yaw, cam.sway, 0.01);
      if (!playing && !queue.length) {
        cam.goalAt = mix3(cam.goalAt, [0, 0, 0.3], 0.01);
        cam.goalDist = lerp(cam.goalDist, HOME, 0.01);
      }
    }
    cam.at = mix3(cam.at, cam.goalAt, 0.05);
    cam.dist = lerp(cam.dist, cam.goalDist, 0.05);
    const eye = [cam.at[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.at[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist];
    const vp = M.mul(M.perspective(0.75, w / h, 0.1, 60), M.lookAt(eye, cam.at));
    view = { vp, eye, w, h };
    const env = sky();
    const lightVP = M.mul(M.ortho(7.2, 1, 40), M.lookAt(env.sun.map((v) => v * 18), [0, 0, 0], [0, 1, 0.001]));
    const time = now / 1000;
    const things = standing(now);

    // 1. the sun's view, for shadows
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
    gl.viewport(0, 0, SHADOW, SHADOW);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depth.p);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3); // the ground's glow stream: the depth pass reads only positions
    gl.uniformMatrix4fv(depth.u.uLightVP, false, lightVP);
    gl.uniform1f(depth.u.uTime, time);
    for (const [m, mm, o] of things) if (m && m !== terrain && m !== road && m !== seabed) draw(depth, m, mm, o);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2. the world
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...env.fog, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog.p);
    const u = prog.u;
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniformMatrix4fv(u.uLightVP, false, lightVP);
    gl.uniform3fv(u.uSun, env.sun);
    gl.uniform3fv(u.uSunColor, env.sunColor);
    gl.uniform3fv(u.uSky, env.skyCol);
    gl.uniform3fv(u.uGround, env.ground);
    gl.uniform3fv(u.uFog, env.fog);
    gl.uniform3fv(u.uEye, eye);
    gl.uniform1f(u.uFogNear, cam.dist * 0.9);
    gl.uniform1f(u.uFogFar, cam.dist * 3.2);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uShadowOn, 1);
    const pulse = [0, 0, 0, 0];
    const ai = map.seats.findIndex((x) => x.id === active);
    if (ai >= 0) pulse[ai] = 0.9 + 0.9 * Math.sin(time * 2.4);
    gl.uniform4fv(u.uPulse, pulse);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(u.uShadow, 0);
    for (const [m, mm, o] of things) draw(prog, m, mm, o);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    draw(prog, water, I, { waterOn: 1 });
    gl.depthMask(false);
    for (const [m, mm, o] of effectsNow(now)) draw(prog, m, mm, o);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // 3. labels and bubbles, laid over the canvas
    const project = (x, y, z) => {
      const p = M.apply(vp, [x, y, z]);
      return { x: (p[0] * 0.5 + 0.5) * w, y: (0.5 - p[1] * 0.5) * h, behind: p[3] < 0, depth: p[3] };
    };
    for (const id of ids) {
      const s = site[id];
      const p = project(s.x, s.top + 0.32, s.z);
      const el = labels[id];
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${clamp(8 / p.depth, 0.6, 1.25)})`;
      el.style.display = p.behind ? 'none' : '';
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const age = (now - b.t0) / 1000;
      if (age > 9 || b.lift > 2) {
        b.el.remove();
        bubbles.splice(i, 1);
        continue;
      }
      const p = project(b.at.x, b.at.top + 0.55, b.at.z);
      b.el.style.transform = `translate(${p.x}px, ${p.y - b.lift * 46}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(clamp((9 - age) / 1.5) * clamp(age / 0.3));
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    sync,
    play,
    /** Puts the board back to a given state, dropping anything still playing. */
    reset(territories) {
      queue.length = 0;
      playing = null;
      effects.length = 0;
      bubbles.splice(0).forEach((b) => b.el.remove());
      shown = JSON.parse(JSON.stringify(territories));
      dirty = false;
      refresh();
    },
    busy: () => Boolean(playing || queue.length),
    overview,
    destroy() {
      cancelAnimationFrame(raf);
      overlay.innerHTML = '';
    },
  };
}
