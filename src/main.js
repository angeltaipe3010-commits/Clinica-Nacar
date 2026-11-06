import Lenis from 'lenis';
import { createScene } from './scene.js';
import { REVIEWS } from './reviews.js';
import { MOSTRAR } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const seg = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || innerWidth < 760;

/* enlaces de WhatsApp con mensaje según el contexto */
let avisoT;
$$('a[href="#demo"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); e.stopImmediatePropagation();
  const t = $('#demoAviso'); t.classList.add('on');
  clearTimeout(avisoT); avisoT = setTimeout(() => t.classList.remove('on'), 2600);
}));

/* scroll suave solo en puntero fino: en móvil se respeta el scroll nativo */
let lenis = null;
if (!reduced && !coarse) {
  lenis = new Lenis({ lerp: .09, wheelMultiplier: .9 });
}
const goTo = (target, opts) => (lenis ? lenis.scrollTo(target, { offset: 0, ...opts }) : (typeof target === 'number' ? scrollTo({ top: target, behavior: 'smooth' }) : target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })));
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const el = $(a.getAttribute('href')); if (!el) return;
  e.preventDefault(); closeSheet(); goTo(el);
}));

/* reseñas: la sección solo aparece si hay reseñas reales cargadas */
if (REVIEWS.length) {
  const track = $('#reviewTrack');
  REVIEWS.forEach(r => {
    const card = document.createElement('figure');
    card.className = 'review';
    const quote = document.createElement('blockquote'); quote.textContent = `“${r.texto}”`;
    const by = document.createElement('figcaption');
    const name = document.createElement('strong'); name.textContent = r.nombre;
    const meta = document.createElement('span'); meta.textContent = [r.tratamiento, r.fuente].filter(Boolean).join(' · ');
    by.append(name, meta); card.append(quote, by); track.append(card);
  });
  $('#resenas').hidden = false;
}

/* menú */
const burger = $('#burger'), sheet = $('#sheet');
function closeSheet() { sheet.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; lenis?.start(); }
burger.addEventListener('click', () => {
  const open = sheet.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : ''; open ? lenis?.stop() : lenis?.start();
});

/* manifiesto palabra por palabra */
const KEYS = ['piel,', 'sonrisa', 'rostro.'];
const mt = $('#manifestText');
mt.innerHTML = mt.textContent.split(' ').map(w => `<span class="w${KEYS.includes(w) ? ' key' : ''}">${w}</span>`).join(' ');
const words = $$('.w', mt);

/* la escena se crea tras el primer pintado: el texto del héroe nunca espera al 3D */
const canvas = $('#gl');
let gl = null;

/* medidas */
const story = $('#tratamientos'), hero = $('#hero'), manifest = $('#manifiesto');
const smile = $('#sonrisa'), smileMask = $('#smileMask'), smileCopy = $('#smileCopy');
const chapters = $$('.ch'), railBtns = $$('#rail button'), railbar = $('#railbar'), shade = $('#shade');
let M = {};

/* servicios apagados: se ocultan y el recorrido 3D pasa rápido por sus escenas */
$$('[data-srv]').forEach(el => { if (!MOSTRAR[el.dataset.srv]) el.hidden = true; });
// línea de tiempo: [s de la escena al terminar el tramo, peso en el scroll]
const TRAMOS = [[-.82, 0], [-.66, 1], [-.5, 1], [-.34, 1], [-.2, 1], [0, .25], [1, .7], [2, .7],
  [3, MOSTRAR.endodoncia ? .8 : .08], [4, .8], [5, MOSTRAR.ortodoncia ? .8 : .3], [5.97, .8]];
let acum = 0;
const NUDOS = TRAMOS.map(([e, w]) => [e, acum += w]);
const toS = p => { const t = p * acum; for (let i = 1; i < NUDOS.length; i++) if (t <= NUDOS[i][1]) return NUDOS[i - 1][0] + (NUDOS[i][0] - NUDOS[i - 1][0]) * (t - NUDOS[i - 1][1]) / (NUDOS[i][1] - NUDOS[i - 1][1]); return 5.97; };
const toP = v => { for (let i = 1; i < NUDOS.length; i++) if (v <= NUDOS[i][0]) return (NUDOS[i - 1][1] + (NUDOS[i][1] - NUDOS[i - 1][1]) * (v - NUDOS[i - 1][0]) / (NUDOS[i][0] - NUDOS[i - 1][0])) / acum; return 1; };
chapters.filter(c => !c.hidden).forEach((c, i) => { $('.ch-n', c).firstChild.nodeValue = `0${i + 1} `; });
function measure() {
  const vh = innerHeight;
  const top = el => el.getBoundingClientRect().top + scrollY;
  M = {
    vh, storyTop: top(story), storyLen: story.offsetHeight - vh,
    manifestTop: top(manifest), manifestLen: manifest.offsetHeight - vh * .4,
    coverTop: top(story) + story.offsetHeight, smileTop: top(smile), smileLen: smile.offsetHeight - vh,
  };
  gl?.resize();
  // hueco libre para el 3D en vertical: lo que dejan el texto y la barra de navegación
  const panel = Math.max(...chapters.map(c => c.offsetHeight)) - 76;
  document.documentElement.style.setProperty('--panel', panel + 'px');
  const h1b = $('.ln2').getBoundingClientRect().bottom + scrollY, ctaT = $('.hero-foot').getBoundingClientRect().top + scrollY;
  gl?.setSafe({ story: [88, vh - panel], hero: [h1b + 4, ctaT - 8] });
}
function timeline(y) {
  if (y < M.storyTop) return -1 + y / M.storyTop * .18;
  return toS(clamp01((y - M.storyTop) / M.storyLen));
}
// entra al inicio del capítulo para que la animación se vea completa al seguir bajando
$$('[data-go]').forEach(b => b.addEventListener('click', () => { const c = chapters[+b.dataset.go], f = +c.dataset.from; goTo(M.storyTop + M.storyLen * toP(f + (+c.dataset.to - f) * .1), { duration: 2.2 }); }));

/* capítulos: entrada y salida de texto ligadas al recorrido */
let activeRail = -1;
function renderChapters(s) {
  chapters.forEach((c, i) => {
    if (c.hidden) return;
    const f = +c.dataset.from, w = +c.dataset.to - f;
    const inA = seg(s, f - .03 * w, f + .08 * w), outA = i === chapters.length - 1 ? 0 : seg(s, f + .86 * w, f + .94 * w);
    const a = inA * (1 - outA);
    const on = a > .005;
    if (on !== c._on) { c.classList.toggle('on', on); c._on = on; }
    if (on) {
      c.style.opacity = a.toFixed(3);
      const dy = (1 - inA) * 34 - outA * 34;
      c.style.transform = mobile && innerWidth < 760 ? `translate3d(0,${dy}px,0)` : `translate3d(0,calc(-50% + ${dy}px),0)`;
    }
  });
  let r = 0; chapters.forEach((c, i) => { if (s >= +c.dataset.from - .004) r = i; });
  if (r !== activeRail) { railBtns[activeRail]?.classList.remove('on'); railBtns[r]?.classList.add('on'); activeRail = r; }
  railbar.style.transform = `scaleX(${toP(Math.max(s, -.82)).toFixed(4)})`;
  shade.style.setProperty('--p', seg(s, 1.1, 1.85).toFixed(3));
}

/* barra de navegación y dock */
const dock = $('#dock'), parallax = $('[data-px]');
function renderChrome(y) {
  const pastHero = y > M.vh * .7;
  const r = $('#reserva').getBoundingClientRect(), f = $('#final').getBoundingClientRect();
  const smile2 = y > M.smileTop + M.smileLen * .6 && y < M.smileTop + M.smileLen + M.vh * .6;
  const covered = smile2 || (r.top < M.vh * .7 && r.bottom > M.vh * .3) || f.top < M.vh;
  dock.classList.toggle('show', pastHero && !covered);
}

let time = 0, last = performance.now(), sCur = -1, intro = reduced ? 1 : 0, introStart = Infinity;
let pX = 0;

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  lenis?.raf(now);
  const y = scrollY;
  const target = timeline(y);
  sCur += (target - sCur) * (reduced ? 1 : 1 - Math.exp(-dt * (lenis ? 12 : 8)));
  if (Math.abs(target - sCur) < .0004) sCur = target;
  if (!reduced) { time += dt; intro = clamp01((now - introStart) / 2600); }

  // manifiesto
  const mp = clamp01((y - M.manifestTop + M.vh * .5) / M.manifestLen);
  const lit = Math.floor(mp * words.length * 1.1);
  if (lit !== pX) { words.forEach((w, i) => w.classList.toggle('on', i < lit)); pX = lit; }

  renderChapters(sCur);
  renderChrome(y);

  // máscara de la sonrisa
  const smP = clamp01((y - M.smileTop) / M.smileLen);
  if (y > M.smileTop - M.vh && y < M.smileTop + M.smileLen + M.vh) {
    const m = 1 - seg(smP, .04, .7);
    smileMask.style.setProperty('--m', m.toFixed(4));
    const c = seg(smP, .66, .9);
    smileCopy.style.opacity = c.toFixed(3);
    smileCopy.style.transform = `translate3d(0,${((1 - c) * 24).toFixed(1)}px,0)`;
    smileCopy.style.pointerEvents = c > .5 ? 'auto' : 'none';
  }
  // paralaje de foto
  if (parallax && !reduced) {
    const b = parallax.parentElement.getBoundingClientRect();
    if (b.bottom > 0 && b.top < M.vh) parallax.style.transform = `translate3d(0,${(-(b.top + b.height / 2 - M.vh / 2) / (M.vh + b.height) * 12 - 7).toFixed(2)}%,0)`;
  }

  // el canvas queda tapado por las secciones claras: no se dibuja para ahorrar batería
  if (gl && y < M.coverTop + 60) {
    canvas.style.visibility = '';
    gl.update(sCur, time, intro, dt);
  } else if (gl) canvas.style.visibility = 'hidden';

  requestAnimationFrame(frame);
}

/* puntero: la pieza mira levemente hacia el cursor */
if (!coarse && !reduced) addEventListener('pointermove', e => {
  if (!gl) return;
  gl.pointer.x = e.clientX / innerWidth * 2 - 1;
  gl.pointer.y = e.clientY / innerHeight * 2 - 1;
}, { passive: true });

/* botones magnéticos */
if (!coarse && !reduced) $$('.btn-gold,.btn-line').forEach(b => {
  b.addEventListener('pointermove', e => {
    const r = b.getBoundingClientRect();
    b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * .16).toFixed(1)}px,${((e.clientY - r.top - r.height / 2) * .28).toFixed(1)}px)`;
  });
  b.addEventListener('pointerleave', () => { b.style.transform = ''; });
});

/* revelados y contadores */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); io.unobserve(e.target);
  const num = e.target.querySelector?.('[data-count]');
  if (num) countUp(num);
}), { threshold: .16, rootMargin: '0px 0px -6% 0px' });
$$('.rv,.rv-clip').forEach(el => io.observe(el));
function countUp(el) {
  const to = +el.dataset.count, dec = +(el.dataset.dec || 0);
  if (reduced) return;
  const t0 = performance.now();
  (function tick(n) {
    const p = clamp01((n - t0) / 1500), e = 1 - Math.pow(1 - p, 4);
    el.textContent = (to * e).toFixed(dec).replace('.', ',');
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* armador de cita */
const form = $('#bookForm'), bubble = $('#bubble'), send = $('#bookSend'), nombre = $('#nombre');
function compose(pop) {
  const d = new FormData(form), n = nombre.value.trim();
  const hi = n ? `Hola Nácar, soy ${n}.` : 'Hola Nácar.';
  const t = d.get('trat');
  const need = t.startsWith('una') ? `Tengo ${t}` : `Quiero una cita para ${t}`;
  const msg = `${hi} ${need}, de preferencia ${d.get('dia')} ${d.get('turno')}. ¿Qué horarios tienen disponibles?`;
  bubble.textContent = msg;
  if (pop && !reduced) { bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
}
form.addEventListener('change', () => compose(true));
form.addEventListener('submit', e => e.preventDefault());
nombre.addEventListener('input', () => compose(false));
compose(false);

/* estado de atención en vivo, según la hora local */
(function status() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const open = p.weekday !== 'Sun' && +p.hour >= 9 && +p.hour < 19;
  const text = open ? 'Abierto ahora · hasta las 19:00'
    : p.weekday === 'Sat' && +p.hour >= 19 ? 'Cerrado · abrimos el lunes a las 9:00'
    : p.weekday === 'Sun' ? 'Cerrado hoy · abrimos el lunes a las 9:00'
    : +p.hour < 9 ? 'Cerrado · abrimos hoy a las 9:00' : 'Cerrado · abrimos mañana a las 9:00';
  $$('[data-status]').forEach(el => { el.classList.toggle('open', open); $('span', el).textContent = text; });
})();

/* preguntas */
$$('#faq .q').forEach(q => {
  const b = $('button', q);
  b.addEventListener('click', () => {
    const open = q.classList.toggle('open'); b.setAttribute('aria-expanded', open);
    $$('#faq .q.open').forEach(o => { if (o !== q) { o.classList.remove('open'); $('button', o).setAttribute('aria-expanded', 'false'); } });
  });
});

measure();
addEventListener('load', measure);
document.fonts?.ready.then(measure);
new ResizeObserver(() => measure()).observe(document.body);
sCur = timeline(scrollY);
setTimeout(() => hero.classList.add('in'), 40);
requestAnimationFrame(frame);

function boot() {
  try {
    gl = createScene(canvas, { mobile, reduced, show: MOSTRAR });
    gl.setTags({ corona: $('#tagCorona'), pilar: $('#tagPilar'), tornillo: $('#tagTornillo') });
    measure();
    gl.update(sCur, 0, reduced ? 1 : 0, 0);        // primer cuadro completo antes del fundido
    canvas.classList.add('ready');
    introStart = performance.now() + 120;
    setTimeout(() => gl.warm(), 900);
  } catch (err) {
    console.warn('WebGL no disponible, se usa la versión sin 3D', err);
    gl = null;
    document.documentElement.classList.add('no-gl');
  }
}
setTimeout(boot, 90);
