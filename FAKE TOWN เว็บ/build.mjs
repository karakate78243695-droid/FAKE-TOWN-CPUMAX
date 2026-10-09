import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist/server', {recursive:true});
const assets = {};
for (const name of ['logo.png','city.png']) assets['/assets/'+name] = readFileSync('public/'+name).toString('base64');
const source = readFileSync('src/worker.mjs','utf8');
const html = readFileSync('src/index.html','utf8');
writeFileSync('dist/server/index.js', 'const PAGE = '+JSON.stringify(html)+';\nconst ASSETS = '+JSON.stringify(assets)+';\n'+source);
console.log('FAKE TOWN website built.');
