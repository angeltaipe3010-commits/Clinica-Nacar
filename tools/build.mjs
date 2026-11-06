// Compila todo a un único index.html autocontenido (se abre con doble clic, sin servidor).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const js = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, write: false, format: 'iife', target: 'es2020',
  loader: { '.bin': 'binary' }, legalComments: 'none',
});
const css = await build({ entryPoints: ['src/styles.css'], minify: true, write: false, target: ['chrome100', 'safari15'] });

let html = readFileSync('src/index.html', 'utf8');
html = html.replace(/__IMG_(\w+)__/g, (_, n) => `data:image/jpeg;base64,${readFileSync(`src/assets/${n}.jpg`).toString('base64')}`);
html = html.replace('/*__CSS__*/', () => css.outputFiles[0].text);
html = html.replace('/*__JS__*/', () => js.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));
writeFileSync('index.html', html);
console.log('index.html', (Buffer.byteLength(html) / 1048576).toFixed(2) + ' MB');
