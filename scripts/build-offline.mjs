import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
let html=readFileSync(resolve(root,'dist/index.html'),'utf8');
html=html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,(_,path)=>`<script type="module">${readFileSync(resolve(root,'dist',path.replace(/^\//,'')),'utf8').replace(/<\/script/gi,'<\\/script')}</script>`);
html=html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_,path)=>`<style>${readFileSync(resolve(root,'dist',path.replace(/^\//,'')),'utf8')}</style>`);
const output=resolve(root,'..','FestFlow.html');
writeFileSync(output,html);
console.log(`Offline app written to ${output}`);
