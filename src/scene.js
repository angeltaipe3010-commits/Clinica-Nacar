// Escena 3D: una sola pieza de porcelana que recorre todos los tratamientos.
// `update(s)` recibe un número de "línea de tiempo":
//   s ∈ [-1, 0)  héroe → manifiesto      s ∈ [0, 7]  capítulos 0..6 del recorrido
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import molarBin from './assets/molar.bin';
import crownBin from './assets/crown.bin';
import pulpBin from './assets/pulp.bin';
import incisorBin from './assets/incisor.bin';
import canineBin from './assets/canine.bin';
import premolarBin from './assets/premolar.bin';
import headBin from './assets/head.bin';

const clamp01 = v => Math.min(1, Math.max(0, v));
const seg = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const raw = hex => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace); // sin conversión: para shaders propios

function decode(bin) {
  const b = bin.slice().buffer, h = new DataView(b);
  const nV = h.getUint32(0, true), nI = h.getUint32(4, true), scale = h.getFloat32(8, true);
  const g = new THREE.BufferGeometry();
  const P = new Int16Array(b, 12, nV * 3), N = new Int16Array(b, 12 + nV * 6, nV * 3);
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3);
  for (let i = 0; i < nV * 3; i++) { pos[i] = P[i] / 32767 * scale; nor[i] = N[i] / 32767; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(b, 12 + nV * 12, nI), 1));
  return g;
}

const NOISE = /* glsl */`
  float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float fbm(vec3 p){return .55*vn(p)+.3*vn(p*2.1)+.15*vn(p*4.3);}`;

function makeEnamel({ rootTone = true, side = THREE.FrontSide, shared = null } = {}) {
  const u = shared || {
    uShade: { value: new THREE.Color(0xfbf8f0) }, uStain: { value: 0 }, uFront: { value: -2 },
    uClip: { value: -9 }, uRootOn: { value: rootTone ? 1 : 0 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .26, metalness: 0, clearcoat: 1, clearcoatRoughness: .14,
    ior: 1.62, envMapIntensity: 1.05, side,
  });
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP=position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vP; uniform vec3 uShade; uniform float uStain,uFront,uClip,uRootOn; float gTartar=0.,gEdge=0.,gCut=0.; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if(vP.y<uClip) discard;
        vec3 col=mix(mix(vec3(.74,.57,.33),uShade,smoothstep(-.2,.08,vP.y)),uShade,1.-uRootOn);
        float nz=fbm(vP*vec3(2.6,4.2,2.6));
        if(uStain>.001){
          float band=smoothstep(.55,.0,abs(vP.y-.1));
          float top=smoothstep(.85,1.2,vP.y);
          float mask=smoothstep(.34,.56,nz*.72+band*.5+top*.4);
          float q=vP.y-uFront+(nz-.5)*.45;
          gTartar=mask*smoothstep(-.04,.08,q)*uStain;
          col=mix(col,vec3(.2,.12,.04),gTartar*.94);
          gEdge=exp(-q*q*160.)*uStain;
        }
        if(uClip>-3.) gCut=exp(-(vP.y-uClip)*26.);
        diffuseColor.rgb*=col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.9,gTartar);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat*=1.-gTartar;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance+=vec3(1.,.72,.26)*(gEdge*1.8+gCut*1.5);`);
  };
  return m;
}

function petalGeometry(len, wid, bend) {
  const nu = 10, nv = 18, P = [], I = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const t = j / nv, a = i / nu * 2 - 1;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, .72)), .8) * .5 + .012;
    P.push(bend * t * t * len - .22 * wid * (1 - a * a) * Math.sin(t * Math.PI), t * len, a * w);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

function screwGeometry() {
  const nu = 170, nv = 30, L = 1.2, turns = 7, P = [], I = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = i / nu, v = j / nv, a = v * Math.PI * 2;
    const taper = 1 - .55 * seg(u, .62, .97);
    const ph = (u * turns - v + 8) % 1, th = Math.pow(1 - Math.abs(ph * 2 - 1), 1.4) * seg(u, .02, .1);
    const r = (.15 + .062 * th) * taper * (i === nu ? 0 : 1) * (i === 0 ? 0 : 1) + (i === 0 ? 0 : 0);
    P.push(Math.cos(a) * r, -u * L, Math.sin(a) * r);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1; I.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

class Tube {
  constructor(segs, radial, r, material) {
    Object.assign(this, { segs, radial, r });
    const n = (segs + 1) * radial, I = [];
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial; I.push(a, c, b, b, c, d);
    }
    this.g = new THREE.BufferGeometry();
    this.g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.g.setIndex(I);
    this.mesh = new THREE.Mesh(this.g, material); this.mesh.frustumCulled = false;
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  }
  update(points) {
    this.curve.points = points;
    const p = this.g.attributes.position.array, n = this.g.attributes.normal.array;
    const c = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), w = new THREE.Vector3();
    const { segs, radial, r } = this;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs; this.curve.getPoint(u, c); this.curve.getTangent(u, t);
      s.crossVectors(t, up).normalize(); w.crossVectors(s, t);
      for (let j = 0; j < radial; j++) {
        const a = j / radial * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (i * radial + j) * 3;
        const nx = s.x * ca + w.x * sa, ny = s.y * ca + w.y * sa, nz = s.z * ca + w.z * sa;
        p[k] = c.x + nx * r; p[k + 1] = c.y + ny * r; p[k + 2] = c.z + nz * r; n[k] = nx; n[k + 1] = ny; n[k + 2] = nz;
      }
    }
    this.g.attributes.position.needsUpdate = this.g.attributes.normal.needsUpdate = true;
  }
  reveal(v) { this.g.setDrawRange(0, Math.floor(this.segs * v) * this.radial * 6); this.mesh.visible = v > .004; }
}

export function createScene(canvas, { mobile, reduced, show }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.6 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0xf7f5ef, 1);

  const scene = new THREE.Scene();
  const FOV = 28, CAM_Z = 9.5;
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 40);
  camera.position.set(0, .25, CAM_Z);

  /* entorno de estudio: tres softboxes, uno dorado, reflejados en porcelana y metal */
  {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x0b1442);
    const panel = (color, k, w, h, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
    };
    panel(0xffffff, 11, 9, 5, [0, 9, 3]);
    panel(0xffffff, 6, 3, 9, [-9, 1, 4]);
    panel(0xffc463, 9, 3, 8, [9, -1, 2]);
    panel(0x4c6cff, 4, 12, 3, [0, -8, 3]);
    panel(0xffffff, 3, 5, 4, [2, 2, 10]);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, .03).texture;
    pm.dispose();
  }
  const key = new THREE.DirectionalLight(0xfff3df, 1.6); key.position.set(-2, 4, 6); scene.add(key);
  const rimL = new THREE.DirectionalLight(0xffbe55, 1.5); rimL.position.set(5, 1, -4); scene.add(rimL);

  /* fondo: degradado + halo dorado que sigue a la pieza */
  const bgU = {
    uA: { value: raw(0xf7f5ef) }, uB: { value: raw(0xc4d0f5) }, uGlow: { value: raw(0xf9dfa6) },
    uC: { value: new THREE.Vector2() }, uG: { value: .3 }, uAspect: { value: 1 }, uT: { value: 0 },
  };
  const bg = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)),
    new THREE.ShaderMaterial({
      uniforms: bgU, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vU;void main(){vU=position.xy;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vU;uniform vec3 uA,uB,uGlow;uniform vec2 uC;uniform float uG,uAspect,uT;
        float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){vec2 q=(vU-uC)*vec2(uAspect,1.);float r=length(q);
          vec3 c=mix(uA,uB,exp(-r*r*1.5));c=mix(c,uGlow,min(uG,.85)*exp(-r*r*2.6));
          c+=(h(gl_FragCoord.xy+uT)-.5)*.012;gl_FragColor=vec4(c,1.);}`,
    }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  const rig = new THREE.Group(); scene.add(rig);

  /* ---------- pieza principal ---------- */
  const toothG = new THREE.Group(); rig.add(toothG);
  const molarGeo = decode(molarBin);
  const enamel = makeEnamel();
  const enamelCut = makeEnamel({ side: THREE.DoubleSide, shared: enamel.userData.u }); // solo mientras se corta la raíz
  const tooth = new THREE.Mesh(molarGeo, enamel); toothG.add(tooth);
  const cutProbe = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), enamelCut); cutProbe.visible = false; toothG.add(cutProbe);

  const xrayU = { uX: { value: 0 } };
  const xray = new THREE.Mesh(molarGeo, new THREE.ShaderMaterial({
    uniforms: xrayU, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec3 vN,vV;varying float vY;void main(){vec4 m=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-m.xyz);vY=position.y;gl_Position=projectionMatrix*m;}',
    fragmentShader: `varying vec3 vN,vV;varying float vY;uniform float uX;
      void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.7);
        vec3 c=mix(vec3(.2,.32,.8),vec3(.05,.09,.38),f);gl_FragColor=vec4(c,(f*.92+.05)*uX);}`,
  }));
  xray.visible = false; toothG.add(xray);

  const pulpU = { uFill: { value: 0 }, uX: { value: 0 }, uT: { value: 0 } };
  const pulpMesh = new THREE.Mesh(decode(pulpBin), new THREE.ShaderMaterial({
    uniforms: pulpU, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec3 vN,vV;varying float vY;void main(){vec4 m=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-m.xyz);vY=position.y;gl_Position=projectionMatrix*m;}',
    fragmentShader: `varying vec3 vN,vV;varying float vY;uniform float uFill,uX,uT;
      void main(){float f=max(dot(normalize(vN),normalize(vV)),0.);
        float top=mix(-1.6,.95,uFill);float m=smoothstep(.05,-.05,vY-top);
        vec3 ember=vec3(1.,.2,.12)*(.7+.3*sin(uT*3.+vY*5.));
        vec3 gold=vec3(1.,.76,.3);
        vec3 c=mix(ember,gold,m)*(.55+.6*f)+vec3(1.,.9,.6)*exp(-pow((vY-top)*11.,2.))*step(.002,uFill)*step(uFill,.995);
        gl_FragColor=vec4(c,uX);}`,
  }));
  pulpMesh.visible = false; toothG.add(pulpMesh);

  // partículas de sarro que se desprenden al pasar el frente de limpieza
  const fleckCount = mobile ? 260 : 520;
  const fleckU = { uFront: { value: -2 }, uStain: { value: 0 }, uPx: { value: 1 } };
  const flecks = (() => {
    const P = new Float32Array(fleckCount * 3), N = new Float32Array(fleckCount * 3), R = new Float32Array(fleckCount);
    const mp = molarGeo.attributes.position, mn = molarGeo.attributes.normal;
    for (let i = 0; i < fleckCount; i++) {
      let k; do { k = Math.floor(Math.random() * mp.count); } while (mp.getY(k) < -.15);
      P.set([mp.getX(k), mp.getY(k), mp.getZ(k)], i * 3); N.set([mn.getX(k), mn.getY(k), mn.getZ(k)], i * 3); R[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 1));
    const p = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: fleckU, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute float aR;uniform float uFront,uStain,uPx;varying float vA;
        void main(){float a=clamp((uFront-position.y)*1.4-aR*.25,0.,1.);
          vec3 p=position+normal*a*(1.+aR*1.4)+vec3(aR-.5,-.3,.5-aR)*a*a*1.6;
          vA=smoothstep(0.,.08,a)*(1.-a)*uStain;vec4 m=modelViewMatrix*vec4(p,1.);
          gl_PointSize=uPx*(1.+aR*2.)*16./-m.z;gl_Position=projectionMatrix*m;}`,
      fragmentShader: 'varying float vA;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.5,.34,.1,vA*smoothstep(.5,.1,d));}',
    }));
    p.frustumCulled = false; p.visible = false; return p;
  })();
  toothG.add(flecks);

  /* ---------- flor del héroe ---------- */
  const flower = new THREE.Group(); rig.add(flower);
  const rings = [
    { n: 7, r: .34, y: -.98, a0: .22, a1: .52, off: 0, s: .92, kind: 'p' },
    { n: 9, r: .4, y: -1.04, a0: .48, a1: .86, off: .35, s: 1.0, kind: 'm' },
    { n: 12, r: .46, y: -1.1, a0: .76, a1: 1.18, off: .1, s: 1.1, kind: 'b' },
  ];
  const petalGeo = petalGeometry(1.5, .78, .42);
  const countOf = k => rings.filter(r => r.kind === k).reduce((a, r) => a + r.n, 0);
  const pPor = new THREE.InstancedMesh(petalGeo, new THREE.MeshPhysicalMaterial({ color: 0xf8f2e6, roughness: .32, clearcoat: .8, clearcoatRoughness: .2, side: THREE.DoubleSide, envMapIntensity: 1.1 }), countOf('p'));
  const pGold = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: .34, side: THREE.DoubleSide, envMapIntensity: 1.7 }), countOf('m'));
  const pBlue = new THREE.InstancedMesh(petalGeo, new THREE.MeshPhysicalMaterial({ color: 0xaebdf2, metalness: .15, roughness: .34, clearcoat: 1, clearcoatRoughness: .25, side: THREE.DoubleSide }), countOf('b'));
  [pPor, pGold, pBlue].forEach(m => { m.frustumCulled = false; flower.add(m); });
  const petals = [];
  { const c = { p: 0, m: 0, b: 0 };
    rings.forEach((r, ri) => { for (let i = 0; i < r.n; i++) petals.push({ ...r, ri, i, mesh: { p: pPor, m: pGold, b: pBlue }[r.kind], id: c[r.kind]++, a: i / r.n * Math.PI * 2 + r.off, rnd: Math.random() }); }); }
  const O = new THREE.Object3D();

  /* ---------- implante ---------- */
  const implant = new THREE.Group(); implant.visible = false; rig.add(implant);
  const crownEnamel = makeEnamel({ rootTone: false });
  const crown = new THREE.Mesh(decode(crownBin), crownEnamel); implant.add(crown);
  const titanium = new THREE.MeshStandardMaterial({ color: 0xd2d6e2, metalness: 1, roughness: .28, envMapIntensity: 1.2 });
  const goldMetal = new THREE.MeshStandardMaterial({ color: 0xe9bb5c, metalness: 1, roughness: .24, envMapIntensity: 1.2 });
  const screw = new THREE.Mesh(screwGeometry(), titanium); implant.add(screw);
  const abut = new THREE.Mesh(new THREE.LatheGeometry([[0, -.02], [.17, -.02], [.17, .06], [.25, .12], [.2, .2], [.15, .26], [.135, .62], [.1, .68], [0, .68]].map(p => new THREE.Vector2(...p)), 40), goldMetal);
  abut.geometry.computeVertexNormals(); implant.add(abut);

  /* ---------- arcada: coronas, brackets, alambre, carillas ---------- */
  const rowG = new THREE.Group(); rowG.visible = false; rig.add(rowG);
  const geos = { i: decode(incisorBin), c: decode(canineBin), p: decode(premolarBin) };
  const rowEnamel = makeEnamel({ rootTone: false });
  rowEnamel.side = THREE.FrontSide;
  const veneerMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .1, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: .95, side: THREE.FrontSide });
  veneerMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <color_fragment>', '#include <color_fragment>\nif(vP.z<.02) discard;');
  };
  const LAYOUT = [['p', .84, .84, .58], ['p', .88, .88, .62], ['c', .92, .98, .72], ['i', .8, .9, .66], ['i', 1, 1, .82], ['i', 1, 1, .82], ['i', .8, .9, .66], ['c', .92, .98, .72], ['p', .88, .88, .62], ['p', .84, .84, .58]];
  const MIS = [[.09, .1, .1, -.3], [-.1, -.12, -.16, .34], [.16, .2, .12, .5], [-.08, -.2, .22, -.5], [.05, .14, -.13, .24], [-.1, -.14, .16, -.32], [.1, .24, -.2, .5], [-.12, -.16, -.1, -.44], [.08, .12, .16, .3], [-.06, -.08, -.1, -.26]];
  const K = .115, FRONT = { i: .25, c: .3, p: .38 };
  const teeth = []; { let x = -LAYOUT.reduce((a, l) => a + l[3], 0) / 2;
    const cnt = { i: 0, c: 0, p: 0 };
    LAYOUT.forEach((l, i) => { const w = l[3], cx = x + w / 2; x += w;
      teeth.push({ i, type: l[0], sx: l[1], sy: l[2], x: cx, z: -K * cx * cx, ry: Math.atan(2 * K * cx), y: .6 * (1 - l[2]), mis: MIS[i], id: cnt[l[0]]++ }); }); }
  const countT = t => teeth.filter(e => e.type === t).length;
  const insts = {}, veneers = {};
  for (const t of ['i', 'c', 'p']) {
    insts[t] = new THREE.InstancedMesh(geos[t], rowEnamel, countT(t)); insts[t].frustumCulled = false; rowG.add(insts[t]);
    veneers[t] = new THREE.InstancedMesh(geos[t], veneerMat, countT(t)); veneers[t].frustumCulled = false; rowG.add(veneers[t]);
  }
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0xe9c376, metalness: 1, roughness: .26, envMapIntensity: 1.4 });
  const brackets = new THREE.InstancedMesh(new RoundedBoxGeometry(.19, .17, .06, 3, .02), bracketMat, teeth.length);
  brackets.frustumCulled = false; rowG.add(brackets);
  const wire = new Tube(mobile ? 70 : 110, 5, .014, new THREE.MeshStandardMaterial({ color: 0xf1f2f6, metalness: 1, roughness: .2 }));
  rowG.add(wire.mesh);
  const arc = new Tube(70, 5, .012, new THREE.MeshBasicMaterial({ color: 0xc98a22, toneMapped: false }));
  arc.update(teeth.map(t => new THREE.Vector3(t.x, -.76 + .1 * t.x * t.x / 11, t.z + .3)));
  arc.reveal(0); rowG.add(arc.mesh);

  /* ---------- rostro de partículas ---------- */
  const N_PTS = mobile ? 8000 : 15000;
  const ptsU = { uMix: { value: 0 }, uPx: { value: 1 }, uRowS: { value: 1 }, uHeadS: { value: 1 }, uHeadY: { value: 0 }, uHeadRot: { value: new THREE.Matrix3() }, uBust: { value: 1 }, uLine: { value: 0 }, uSpot: { value: 0 }, uHydra: { value: 0 }, uHydraOn: { value: 0 }, uT: { value: 0 }, uA: { value: 0 } };
  const pts = (() => {
    const h = new Int16Array(headBin.slice().buffer);
    const A = new Float32Array(N_PTS * 3), B = new Float32Array(N_PTS * 3), Nn = new Float32Array(N_PTS * 3), R = new Float32Array(N_PTS * 3);
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < N_PTS; i++) {
      const t = teeth[i % teeth.length], gp = geos[t.type].attributes.position, k = Math.floor(Math.random() * gp.count);
      e.set(0, t.ry, 0); q.setFromEuler(e); m.compose(tmp.set(t.x, t.y, t.z), q, s.set(t.sx, t.sy, t.sx));
      v.fromBufferAttribute(gp, k).applyMatrix4(m); A.set([v.x, v.y, v.z], i * 3);
      for (let c = 0; c < 3; c++) { B[i * 3 + c] = h[i * 6 + c] / 32767 * 3; Nn[i * 3 + c] = h[i * 6 + 3 + c] / 32767; R[i * 3 + c] = Math.random(); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A, 3)); g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    g.setAttribute('aN', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 3));
    const p = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: ptsU, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute vec3 aB,aN,aR;uniform float uMix,uPx,uRowS,uHeadS,uHeadY,uT,uLine,uSpot,uHydra,uHydraOn,uBust;uniform mat3 uHeadRot;varying float vF,vK,vG,vL,vS,vH,vB;
        void main(){vG=step(.86,aR.y);float d=aR.x*.42;float e=clamp((uMix-d)/(1.-.42),0.,1.);e=e*e*(3.-2.*e);
          vec3 q=aB;vB=1.-uBust*(1.-smoothstep(-1.05,-.72,q.y));
          float fore=smoothstep(.42,.54,q.y)*(1.-smoothstep(.76,.9,q.y))*smoothstep(.2,.45,q.z);
          float wr=sin(q.y*46.+sin(q.x*3.)*1.2);vL=fore*uLine*(wr*.5+.5);
          float face=smoothstep(.1,.4,q.z)*smoothstep(-.95,-.7,q.y)*(1.-smoothstep(.7,.95,q.y));
          float sp=sin(q.x*9.+1.)*sin(q.y*11.+2.)*sin(q.z*7.);vS=smoothstep(.12,.42,sp)*face*uSpot;
          float fr=uHydra*2.5-1.3;vH=(1.-smoothstep(fr-.14,fr+.06,q.y))*uHydraOn*step(.001,uHydra)*(.7+.3*sin(uT*2.+aR.x*30.));
          vec3 a=position*uRowS;vec3 b=uHeadRot*aB*uHeadS+vec3(0.,uHeadY,0.);vec3 n=normalize(uHeadRot*aN);
          float arcH=sin(e*3.14159);
          vec3 p=mix(a,b,e)+vec3(sin(aR.y*6.3+uT*.5),cos(aR.z*6.3+uT*.4),sin(aR.x*9.+uT*.3))*arcH*(.55+aR.y*.75);
          p+=n*sin(uT*1.1+aR.x*20.)*.012*e;p-=n*.03*fore*uLine*wr;
          vec4 m=modelViewMatrix*vec4(p,1.);vec3 vd=normalize(-m.xyz);vec3 nv=normalize(normalMatrix*n);
          float nd=dot(nv,vd);float lit=pow(max(dot(nv,normalize(vec3(-.55,.5,.67))),0.),2.2);vF=clamp(pow(1.-abs(nd),2.2)*step(0.,nd+.1)+(1.-lit)*(1.-lit)*.7,0.,1.);vF*=smoothstep(-.25,.05,nd);vK=e;
          float size=(1.1+aR.z*1.2)*(1.+vF*1.1)*mix(1.4,1.,e)*(1.+vS*.9+vL*.9);
          gl_PointSize=uPx*size*11./-m.z;gl_Position=projectionMatrix*m;}`,
      fragmentShader: `varying float vF,vK,vG,vL,vS,vH,vB;uniform float uA;
        void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.12,d);
          vec3 c=mix(vec3(.07,.11,.46),vec3(.78,.53,.1),vG);
          c=mix(c,vec3(.55,.27,.13),vS);c=mix(c,vec3(.86,.6,.12),vH*.9);
          float k=min(1.,mix(.6,.1+vF*.9,vK)+vS*.75+vH*.3+vL*1.1);gl_FragColor=vec4(c,a*k*uA*vB);}`,
    }));
    p.frustumCulled = false; p.visible = false; return p;
  })();
  rig.add(pts);

  const thirds = (() => {
    const yy = [.78, .2, -.34, -.92], v = [];
    yy.forEach(y => v.push(-1.15, y, 0, 1.15, y, 0));
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1d2f9e, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  })();
  thirds.visible = false; rig.add(thirds);

  /* polvo dorado ambiental */
  const dustN = mobile ? 70 : 160, dustU = { uT: { value: 0 }, uPx: { value: 1 } };
  { const P = new Float32Array(dustN * 3), R = new Float32Array(dustN);
    for (let i = 0; i < dustN; i++) { P.set([(Math.random() - .5) * 12, (Math.random() - .5) * 8, (Math.random() - .5) * 5 - 1], i * 3); R[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 1));
    const d = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: dustU, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute float aR;uniform float uT,uPx;varying float vA;
        void main(){vec3 p=position;p.y=mod(p.y+uT*(.05+aR*.1)+4.,8.)-4.;p.x+=sin(uT*.2+aR*9.)*.3;
          vA=(.2+.5*aR)*(.6+.4*sin(uT*.8+aR*30.));vec4 m=modelViewMatrix*vec4(p,1.);
          gl_PointSize=uPx*(1.+aR*2.2)*20./-m.z;gl_Position=projectionMatrix*m;}`,
      fragmentShader: 'varying float vA;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.8,.58,.2,vA*.7*smoothstep(.5,.0,d));}',
    }));
    d.frustumCulled = false; scene.add(d);
  }

  /* ---------- estado ---------- */
  const shadeHero = new THREE.Color(0xfbf8f0), shadeA3 = new THREE.Color(0xe2c07e), shadeBright = new THREE.Color(0xffffff), shadeTmp = new THREE.Color();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let safe = { story: [0, 0], hero: [0, 0] };
  let W = 1, H = 1, aspect = 1, viewH = 1, viewW = 1, portrait = false;
  const projV = new THREE.Vector3();
  let tagEls = [], frames = 0, acc = 0;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    W = w; H = h; renderer.setSize(w, h, false);
    aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix();
    viewH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2)); viewW = viewH * aspect;
    portrait = aspect < .85; bgU.uAspect.value = aspect;
    const px = H * renderer.getPixelRatio() / 900;
    fleckU.uPx.value = ptsU.uPx.value = dustU.uPx.value = px * 1.5;
  }

  const mT = new THREE.Matrix4(), qT = new THREE.Quaternion(), eT = new THREE.Euler(), vP = new THREE.Vector3(), vS = new THREE.Vector3(), mOff = new THREE.Matrix4();
  const wirePts = teeth.map(() => new THREE.Vector3());
  const wireAll = [new THREE.Vector3(), ...wirePts, new THREE.Vector3()];

  function update(s, time, intro, dt) {
    /* layout común */
    const h = seg(s, -.95, -.84);
    // en vertical el 3D se encaja en el hueco real que deja el texto (medido en el DOM)
    const fit = ([y1, y2], tall, wide, c, max) => {
      const u = viewH / H, sc = Math.min(max, (y2 - y1) * u / tall, viewW / wide);
      return [0, .25 + (H / 2 - (y1 + y2) / 2) * u - c * sc, sc];
    };
    const off = portrait ? fit(safe.story, 3.25, 2, 0, .8) : [viewW * .17, 0, 1];
    const heroOff = portrait ? fit(safe.hero, 3.2, 3.1, .38, 1) : [0, -.1, .92];
    rig.position.x = lerp(heroOff[0], off[0], h);
    rig.position.y = lerp(heroOff[1], off[1], h);
    const rs = lerp(heroOff[2], off[2], h);
    rig.scale.setScalar(rs);
    pointer.sx += (pointer.x - pointer.sx) * .06; pointer.sy += (pointer.y - pointer.sy) * .06;
    rig.rotation.y = pointer.sx * .22; rig.rotation.x = pointer.sy * .12;

    /* halo: sigue a la pieza en coordenadas de pantalla */
    bgU.uC.value.set(rig.position.x / (viewW / 2), (rig.position.y + .25) / (viewH / 2));
    const whiten = seg(s, 1.1, 1.85), xr = show.endodoncia ? seg(s, 2.06, 2.24) * (1 - seg(s, 2.9, 3.04)) : 0;
    const hG = 1 - seg(s, -.95, -.84), whG = whiten * (1 - seg(s, 2, 2.2));
    bgU.uG.value = .9 * whG + .18 * seg(s, 5.5, 6) + .25 * hG * seg(intro, .3, 1) + .7 * seg(s, -.48, -.38) * (1 - seg(s, -.33, -.26));
    bgU.uT.value = (time * 60 | 0) % 97;

    /* flor */
    const fall = seg(s, -.96, -.84);
    flower.visible = fall < .999;
    if (flower.visible) {
      const baseY = .28;
      flower.rotation.y = time * .07 + s * 1.2;
      for (const p of petals) {
        const open = seg(intro, .05 + p.ri * .11 + p.rnd * .1, .62 + p.ri * .13 + p.rnd * .1);
        const f = seg(fall, p.rnd * .4, .6 + p.rnd * .4);
        const breathe = Math.sin(time * .7 + p.a * 2) * .018;
        const tilt = lerp(p.a0 * .35, p.a1, open) + breathe + f * (1.5 + p.rnd);
        const c = Math.cos(p.a), sn = Math.sin(p.a), R = p.r * lerp(.55, 1, open) + f * (2.2 + p.rnd * 2);
        O.position.set(c * R, p.y + baseY - f * (1.8 + p.rnd * 2.4), sn * R);
        O.rotation.set(0, -p.a, -tilt - f * p.rnd * 2, 'YXZ');
        O.scale.setScalar(p.s * seg(open, 0, .4) * (1 - f * f));
        O.updateMatrix(); p.mesh.setMatrixAt(p.id, O.matrix);
      }
      pPor.instanceMatrix.needsUpdate = pGold.instanceMatrix.needsUpdate = pBlue.instanceMatrix.needsUpdate = true;
    }

    /* pieza */
    const stainIn = seg(s, -.14, -.02);
    const front = lerp(-.7, 1.6, seg(s, .14, .84));
    const clip = seg(s, 3.04, 3.26), solo = s > -.22 && s < 3.26;
    toothG.visible = solo;
    if (solo) {
      toothG.position.y = .12;
      toothG.scale.setScalar(Math.max(.001, 1.08 * seg(s, -.15, -.02)));
      toothG.rotation.set(.1 + .07 * Math.sin(time * .4), time * .16 + s * 1.5 - .5, Math.sin(time * .3) * .03);
      enamel.userData.u.uStain.value = stainIn;
      enamel.userData.u.uFront.value = front;
      enamel.userData.u.uClip.value = clip > .001 ? lerp(-1.75, -.02, clip) : -9;
      const toA3 = shadeTmp.copy(shadeHero).lerp(shadeA3, stainIn).lerp(shadeBright, whiten);
      enamel.userData.u.uShade.value.copy(toA3);
      enamel.emissive.setScalar(.09 * whG).multiply(new THREE.Color(0xfff2d0));
      tooth.material = clip > .001 ? enamelCut : enamel;
      enamel.opacity = 1 - xr; enamel.transparent = xr > .001; enamel.depthWrite = xr < .5; tooth.visible = xr < .995;
      xray.visible = pulpMesh.visible = xr > .001;
      xrayU.uX.value = pulpU.uX.value = xr; pulpU.uFill.value = seg(s, 2.3, 2.85); pulpU.uT.value = time;
      flecks.visible = stainIn > .01 && s < 1.1 && s > .05;
      fleckU.uFront.value = front; fleckU.uStain.value = stainIn;
    }

    /* implante */
    const enter = seg(s, 3.1, 3.34), expl = seg(s, 3.36, 3.6), close = seg(s, 3.8, 3.93), exit = seg(s, 3.9, 4.1);
    implant.visible = (s > 3.08 && exit < .999);
    let e = expl * (1 - close);
    if (implant.visible) {
      implant.position.set(lerp(0, -3.5, exit * exit), .12 - e * .22 + exit * .6, 0);
      implant.scale.setScalar((1.08 - e * (portrait ? .36 : .2)) * (1 - exit * .6));
      implant.rotation.set(.1, time * .16 + s * 1.5 - .5, 0);
      crown.visible = clip >= .999;
      crown.position.y = .02 + e * .78;
      abut.position.y = -.2 + e * .1 + (1 - enter) * -3;
      screw.position.y = -.22 - e * .42 + (1 - enter) * -3;
      crownEnamel.userData.u.uShade.value.copy(shadeBright);
      goldMetal.opacity = titanium.opacity = 1;
    }

    /* etiquetas del implante en HTML */
    const tagA = expl * (1 - seg(s, 3.78, 3.84));
    for (const t of tagEls) {
      if (tagA < .01) { if (t.on) { t.el.style.opacity = 0; t.on = false; } continue; }
      projV.set(.05, t.mesh.position.y + t.dy, 0); implant.localToWorld(projV); projV.project(camera);
      const x = (projV.x + 1) / 2 * innerWidth, y = (1 - projV.y) / 2 * H;
      t.el.style.opacity = tagA; t.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-100%,-50%)`; t.on = true;
    }

    /* arcada */
    const rowIn = s > 3.9 && s < 6.2;
    rowG.visible = rowIn;
    const rowS = portrait ? viewW * 1.12 / (6.8 * rs) : Math.min(.8, viewW * .5 / 6.8);
    if (rowIn) {
      rowG.scale.setScalar(rowS); rowG.position.z = .4;
      rowG.rotation.set(.04, Math.sin(time * .35) * .05 + (1 - seg(s, 4, 4.4)) * .5, 0);
      const o = show.ortodoncia, align = o ? seg(s, 4.42, 4.9) : 1, brIn = o ? seg(s, 4.08, 4.28) : 0, wireIn = o ? seg(s, 4.2, 4.42) : 0, brOut = seg(s, 4.95, 5.08);
      const shade = shadeTmp.copy(shadeA3).lerp(shadeHero, .45).lerp(shadeBright, seg(s, 5.35, 5.8));
      rowEnamel.userData.u.uShade.value.copy(shade);
      teeth.forEach((t, i) => {
        const inT = seg(s, 3.96 + Math.abs(i - 4.5) * .018, 4.14 + Math.abs(i - 4.5) * .018);
        const a = 1 - align, [dy, dz, rz, ry] = t.mis;
        const px = t.x + (1 - inT) * (t.x > 0 ? 5 : -5), py = t.y + dy * a * .9, pz = t.z + dz * a;
        const lift = (1 - seg(s, 6.02, 6.1));
        eT.set(0, t.ry + ry * a + (1 - inT) * 1.4, rz * a * .85);
        qT.setFromEuler(eT); vP.set(px, py, pz); vS.set(t.sx * inT * lift, t.sy * inT * lift, t.sx * inT * lift);
        mT.compose(vP, qT, vS);
        insts[t.type].setMatrixAt(t.id, mT);
        // bracket
        const bs = seg(brIn, i * .04, .55 + i * .04) * (1 - brOut);
        mOff.makeTranslation(0, -.06, FRONT[t.type] + .03);
        const mB = mT.clone().multiply(mOff);
        const d = new THREE.Vector3().setFromMatrixPosition(mB);
        O.position.copy(d); O.quaternion.copy(qT); O.scale.setScalar(Math.max(bs, .0001)); O.updateMatrix();
        brackets.setMatrixAt(i, O.matrix);
        wirePts[i].copy(d); wirePts[i].z += .035;
        // carilla
        const v = seg(s, 5.12 + Math.abs(i - 4.5) * .05, 5.34 + Math.abs(i - 4.5) * .05);
        vP.set(px, py, pz + (1 - v) * 3.2); vP.y += (1 - v) * (i - 4.5) * .05;
        eT.set((1 - v) * -.5, t.ry, (1 - v) * (i - 4.5) * .08); qT.setFromEuler(eT);
        const vk = 1.022 * (v > .002 ? 1 : 0) * lift;
        vS.set(t.sx * vk, t.sy * vk, t.sx * vk * 1.12); mT.compose(vP, qT, vS);
        veneers[t.type].setMatrixAt(t.id, mT);
      });
      for (const k in insts) { insts[k].instanceMatrix.needsUpdate = true; veneers[k].instanceMatrix.needsUpdate = true; veneers[k].visible = s > 5.08; }
      brackets.instanceMatrix.needsUpdate = true; brackets.visible = brIn > .01 && brOut < .99;
      if (wireIn > .001 && brOut < .99) {
        wireAll[0].copy(wirePts[0]).add({ x: -.28, y: 0, z: -.12 });
        wireAll[11].copy(wirePts[9]).add({ x: .28, y: 0, z: -.12 });
        wire.update(wireAll);
        wire.reveal(wireIn * (1 - brOut));
      } else wire.mesh.visible = false;
      arc.reveal(seg(s, 5.62, 5.92) * (1 - seg(s, 5.98, 6.04)));
    }

    /* rostro: protagonista de la portada y de los capítulos faciales */
    pts.visible = s < -.03;
    if (pts.visible) {
      ptsU.uMix.value = seg(intro, .08, .85) * (1 - .5 * seg(s, -.2, -.08));
      ptsU.uA.value = seg(intro, .02, .2) * (1 - seg(s, -.17, -.08));
      ptsU.uRowS.value = rowS; ptsU.uT.value = time;
      ptsU.uHeadS.value = lerp(1, portrait ? 1 : 1.12, h);
      ptsU.uHeadY.value = lerp(.8, .38, h);
      ptsU.uBust.value = 1 - h;
      ptsU.uLine.value = seg(s, -.84, -.8) * (1 - seg(s, -.76, -.68));
      ptsU.uSpot.value = seg(s, -.66, -.62) * (1 - seg(s, -.6, -.52));
      ptsU.uHydra.value = seg(s, -.48, -.38);
      ptsU.uHydraOn.value = 1 - seg(s, -.33, -.27);
      const yaw = lerp(-.7, -.95, h) + .55 * seg(s, -.82, -.22) + Math.sin(time * .35) * .05;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      ptsU.uHeadRot.value.set(c, 0, sn, 0, 1, 0, -sn, 0, c);
      const g = seg(s, -.33, -.28) * (1 - seg(s, -.22, -.19));
      thirds.visible = g > .01; thirds.material.opacity = g * .32;
      thirds.position.y = ptsU.uHeadY.value; thirds.scale.set(g * ptsU.uHeadS.value, ptsU.uHeadS.value, 1);
    } else thirds.visible = false;

    renderer.render(scene, camera);
    dustU.uT.value = time;

    /* resolución adaptativa: si el equipo no sostiene ~40 fps, baja la densidad de píxeles */
    if (dt) {
      frames++; acc += dt;
      if (frames === 45) {
        if (acc / frames > .026 && pixelRatio > .85) { pixelRatio = Math.max(.85, pixelRatio * .84); renderer.setPixelRatio(pixelRatio); resize(); }
        frames = 0; acc = 0;
      }
    }
  }

  function setTags(map) {
    tagEls = [
      { el: map.corona, mesh: crown, dy: .55 }, { el: map.pilar, mesh: abut, dy: .3 }, { el: map.tornillo, mesh: screw, dy: -.5 },
    ].filter(t => t.el);
  }

  resize();
  // precompila en segundo plano los materiales de capítulos posteriores: evita tirones al llegar a ellos
  async function warm() {
    const objs = [rowG, implant, pts, xray, pulpMesh, flecks, cutProbe];
    const prev = objs.map(o => o.visible);
    objs.forEach(o => { o.visible = true; });
    const done = renderer.compileAsync(scene, camera);
    objs.forEach((o, i) => { o.visible = prev[i]; });
    await done;
  }

  return { update, resize, pointer, setTags, reduced, warm, setSafe: v => { safe = v; } };

}
