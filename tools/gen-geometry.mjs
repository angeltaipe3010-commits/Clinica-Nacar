// Genera toda la geometría 3D sin modelos externos:
// define cada pieza como un campo de distancia (SDF), la poligoniza con Surface Nets
// y guarda binarios compactos en src/assets/*.bin (se incrustan en el HTML al compilar).
import { writeFileSync } from 'node:fs';

/* ---------- utilidades SDF ---------- */
const len = (x, y, z) => Math.hypot(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smin = (a, b, k) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const sphere = (x, y, z, c, r) => len(x - c[0], y - c[1], z - c[2]) - r;
const ellipsoid = (x, y, z, c, r) => {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = len(px / r[0], py / r[1], pz / r[2]);
  const k1 = len(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
};
const roundBox = (x, y, z, c, b, r) => {
  const qx = Math.abs(x - c[0]) - b[0] + r, qy = Math.abs(y - c[1]) - b[1] + r, qz = Math.abs(z - c[2]) - b[2] + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
// Cono redondeado aproximado (capsula con radio interpolado)
const cone = (x, y, z, a, b, ra, rb) => {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
};

/* ---------- molar ---------- */
const roots = [
  [[-.34, .05, .1], [-.40, -.7, .13], [-.30, -1.48, .05], .25, .15, .045],
  [[.34, .05, .1], [.42, -.7, .12], [.30, -1.42, .03], .25, .15, .045],
  [[0, .05, -.22], [.02, -.72, -.32], [-.04, -1.36, -.26], .24, .14, .045],
];
function crownOnly(x, y, z) {
  let d = roundBox(x, y, z, [0, .42, 0], [.63, .46, .56], .34);
  d = smin(d, ellipsoid(x, y, z, [0, .36, 0], [.72, .46, .64]), .14);
  for (const [cx, cz, h] of [[-.34, .29, .93], [.33, .30, .96], [-.33, -.29, .96], [.34, -.28, .92]])
    d = smin(d, sphere(x, y, z, [cx, h, cz], .29), .2);
  // fisuras oclusales
  const fis = Math.min(
    cone(x, y, z, [-.62, 1.2, .02], [.62, 1.2, -.02], .065, .065),
    cone(x, y, z, [.02, 1.2, -.55], [-.02, 1.2, .55], .06, .06),
  );
  d = smax(d, -fis, .11);
  d = smax(d, -sphere(x, y, z, [0, 1.17, 0], .13), .12);
  return d + .004 * Math.sin(x * 5 + 1) * Math.sin(y * 4) * Math.sin(z * 5);
}
function molar(x, y, z) {
  let d = crownOnly(x, y, z);
  d = smin(d, ellipsoid(x, y, z, [0, -.04, 0], [.56, .26, .46]), .16);
  for (const [a, m, b, ra, rm, rb] of roots) {
    const r = Math.min(cone(x, y, z, a, m, ra, rm), cone(x, y, z, m, b, rm, rb));
    d = smin(d, r, .2);
  }
  return d;
}
function pulp(x, y, z) {
  let d = ellipsoid(x, y, z, [0, .42, 0], [.36, .24, .28]);
  for (const [cx, cz] of [[-.25, .2], [.25, .2], [-.24, -.18], [.24, -.18]])
    d = smin(d, sphere(x, y, z, [cx, .62, cz], .1), .1);
  for (const [a, m, b] of roots) {
    const r = Math.min(cone(x, y, z, [a[0] * .8, .3, a[2] * .8], m, .085, .05), cone(x, y, z, m, b, .05, .02));
    d = smin(d, r, .12);
  }
  return d;
}
const molarCrown = (x, y, z) => smax(molar(x, y, z), -.02 - y, .08);

/* ---------- coronas de la arcada (borde incisal abajo, cervical arriba) ---------- */
function incisor(x, y, z) {
  const t = clamp((y + .58) / 1.16, 0, 1);
  const w = 1 - .3 * t * t;
  const bow = .1 * (1 - (x * x) / .3) - .12 * (y * y);
  let d = roundBox(x / w, y, z - bow, [0, 0, 0], [.4, .58, .15 - .03 * Math.abs(y)], .13) * .8;
  d = smin(d, ellipsoid(x, y, z, [0, .3, -.02], [.3, .28, .2]), .12);
  return d;
}
function canine(x, y, z) {
  // canino natural: como un incisivo más robusto, con la punta apenas insinuada
  const t = clamp((y + .6) / 1.2, 0, 1);
  const w = 1 - .24 * t * t;
  const bow = .13 * (1 - (x * x) / .26) - .1 * (y * y);
  let d = roundBox(x / w, y, z - bow, [0, 0, 0], [.4, .6, .19], .15) * .8;
  d = smin(d, ellipsoid(x, y, z, [0, .3, 0], [.32, .3, .24]), .12);
  return smax(d, -y - .6 + Math.abs(x) * .34 - .03, .07);
}
function premolar(x, y, z) {
  let d = roundBox(x, y, z, [0, .1, 0], [.34, .42, .34], .26);
  d = smin(d, sphere(x, y, z, [0, -.34, .17], .22), .16);
  d = smin(d, sphere(x, y, z, [0, -.34, -.17], .22), .16);
  d = smax(d, -cone(x, y, z, [-.5, -.58, 0], [.5, -.58, 0], .08, .08), .1);
  return d;
}

/* ---------- busto para la secuencia facial ---------- */
function head(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, [0, .36, -.12], [.72, .8, .88]);
  d = smin(d, ellipsoid(x, y, z, [0, -.2, .2], [.56, .72, .6]), .22);
  d = smin(d, sphere(ax, y, z, [0, -.74, .44], .17), .2);                 // mentón
  d = smin(d, sphere(ax, y, z, [.4, -.5, .02], .2), .25);                 // ángulo mandibular
  d = smin(d, sphere(ax, y, z, [.4, -.08, .42], .17), .2);                // pómulo
  d = smin(d, cone(ax, y, z, [0, .2, .71], [.3, .22, .65], .075, .06), .1); // ceja
  d = smax(d, -sphere(ax, y, z, [.27, .05, .88], .16), .1);               // órbita
  d = smin(d, ellipsoid(ax, y, z, [.27, .05, .68], [.125, .07, .1]), .03); // párpado
  d = smin(d, cone(x, y, z, [0, .12, .78], [0, -.26, .98], .05, .1), .08); // nariz
  d = smin(d, sphere(ax, y, z, [.095, -.31, .86], .07), .05);             // aleta
  d = smin(d, ellipsoid(x, y, z, [0, -.49, .79], [.19, .045, .09]), .05); // labio sup.
  d = smin(d, ellipsoid(x, y, z, [0, -.57, .77], [.16, .055, .09]), .05); // labio inf.
  d = smax(d, -ellipsoid(x, y, z, [0, -.525, .86], [.2, .008, .06]), .02);
  d = smin(d, ellipsoid(ax, y, z, [.73, -.02, -.1], [.05, .2, .12]), .05); // oreja
  d = smin(d, cone(x, y, z, [0, -.6, -.2], [0, -1.7, -.32], .36, .42), .2); // cuello
  d = smin(d, ellipsoid(x, y, z, [0, -1.95, -.3], [1.2, .36, .62]), .3);  // hombros
  return smax(d, -1.95 - y, .05);
}

/* ---------- Surface Nets ---------- */
function polygonize(f, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell), ny = Math.ceil((max[1] - min[1]) / cell), nz = Math.ceil((max[2] - min[2]) / cell);
  const sx = nx + 1, sy = ny + 1;
  const g = new Float32Array(sx * sy * (nz + 1));
  const I = (i, j, k) => i + j * sx + k * sx * sy;
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
    g[I(i, j, k)] = f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
  const vid = new Int32Array(g.length).fill(-1), P = [], Q = [];
  const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = []; for (let c = 0; c < 8; c++) v.push(g[I(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]);
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of edges) if ((v[a] < 0) !== (v[b] < 0)) {
      const t = v[a] / (v[a] - v[b]);
      px += (a & 1) + ((b & 1) - (a & 1)) * t; py += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; pz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
    }
    if (!n) continue;
    vid[I(i, j, k)] = P.length / 3;
    P.push(min[0] + (i + px / n) * cell, min[1] + (j + py / n) * cell, min[2] + (k + pz / n) * cell);
  }
  const quad = (a, b, c, d, flip) => flip ? Q.push(a, c, b, a, d, c) : Q.push(a, b, c, a, c, d);
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const s = g[I(i, j, k)] < 0;
    if (s !== (g[I(i + 1, j, k)] < 0)) quad(vid[I(i, j - 1, k - 1)], vid[I(i, j, k - 1)], vid[I(i, j, k)], vid[I(i, j - 1, k)], !s);
    if (s !== (g[I(i, j + 1, k)] < 0)) quad(vid[I(i - 1, j, k - 1)], vid[I(i - 1, j, k)], vid[I(i, j, k)], vid[I(i, j, k - 1)], !s);
    if (s !== (g[I(i, j, k + 1)] < 0)) quad(vid[I(i - 1, j - 1, k)], vid[I(i, j - 1, k)], vid[I(i, j, k)], vid[I(i - 1, j, k)], !s);
  }
  // normales desde el gradiente del campo: mucho más suaves que promediar caras
  const N = new Float32Array(P.length), e = cell * .5;
  for (let i = 0; i < P.length; i += 3) {
    const [x, y, z] = [P[i], P[i + 1], P[i + 2]];
    const nxv = f(x + e, y, z) - f(x - e, y, z), nyv = f(x, y + e, z) - f(x, y - e, z), nzv = f(x, y, z + e) - f(x, y, z - e);
    const l = len(nxv, nyv, nzv) || 1; N[i] = nxv / l; N[i + 1] = nyv / l; N[i + 2] = nzv / l;
  }
  return { P: new Float32Array(P), N, Q: new Uint32Array(Q) };
}

function write(name, m) {
  const nV = m.P.length / 3, nI = m.Q.length;
  if (nV > 65535) throw new Error(name + ' demasiados vértices');
  const scale = Math.max(...m.P.map(Math.abs)) * 1.001;
  const buf = new ArrayBuffer(12 + nV * 12 + nI * 2);
  const h = new DataView(buf); h.setUint32(0, nV, true); h.setUint32(4, nI, true); h.setFloat32(8, scale, true);
  const pos = new Int16Array(buf, 12, nV * 3), nor = new Int16Array(buf, 12 + nV * 6, nV * 3), idx = new Uint16Array(buf, 12 + nV * 12, nI);
  for (let i = 0; i < nV * 3; i++) { pos[i] = Math.round(m.P[i] / scale * 32767); nor[i] = Math.round(m.N[i] * 32767); }
  idx.set(m.Q);
  writeFileSync(`src/assets/${name}.bin`, new Uint8Array(buf));
  console.log(name.padEnd(10), String(nV).padStart(6), 'v', String(nI / 3).padStart(6), 't', (buf.byteLength / 1024).toFixed(0) + 'KB');
}

/* ---------- muestreo de superficie para partículas (pos + normal) ---------- */
function samplePoints(name, m, count, weight = () => 1) {
  let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tri = m.Q.length / 3, cum = new Float32Array(tri); let total = 0;
  const v = i => [m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]];
  for (let t = 0; t < tri; t++) {
    const [a, b, c] = [v(m.Q[t * 3]), v(m.Q[t * 3 + 1]), v(m.Q[t * 3 + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    total += .5 * len(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) * weight(a);
    cum[t] = total;
  }
  const out = new Int16Array(count * 6), S = 3;
  for (let i = 0; i < count; i++) {
    const r = R() * total; let lo = 0, hi = tri - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; cum[mid] < r ? lo = mid + 1 : hi = mid; }
    const [ia, ib, ic] = [m.Q[lo * 3], m.Q[lo * 3 + 1], m.Q[lo * 3 + 2]];
    let u = R(), w = R(); if (u + w > 1) { u = 1 - u; w = 1 - w; }
    const t = 1 - u - w;
    for (let k = 0; k < 3; k++) {
      out[i * 6 + k] = (m.P[ia * 3 + k] * t + m.P[ib * 3 + k] * u + m.P[ic * 3 + k] * w) / S * 32767;
      out[i * 6 + 3 + k] = (m.N[ia * 3 + k] * t + m.N[ib * 3 + k] * u + m.N[ic * 3 + k] * w) * 32767;
    }
  }
  writeFileSync(`src/assets/${name}.bin`, new Uint8Array(out.buffer));
  console.log(name.padEnd(10), count, 'pts', (out.byteLength / 1024).toFixed(0) + 'KB');
}

const b = [-1.1, -1.75, -1], B = [1.1, 1.45, 1];
const mol = polygonize(molar, b, B, .036);
write('molar', mol);
write('crown', polygonize(molarCrown, [-1.1, -.3, -1], B, .05));
write('pulp', polygonize(pulp, b, B, .05));
write('incisor', polygonize(incisor, [-.7, -.85, -.5], [.7, .85, .5], .04));
write('canine', polygonize(canine, [-.7, -.9, -.55], [.7, .9, .55], .045));
write('premolar', polygonize(premolar, [-.65, -.8, -.6], [.65, .8, .6], .05));
const hd = polygonize(head, [-1.5, -2.45, -1.2], [1.5, 1.3, 1.25], .025);
samplePoints('head', hd, 15000, ([x, y, z]) => (y < -1.1 ? .35 : z > .2 && y > -1 && y < .5 ? 3.2 : 1));
