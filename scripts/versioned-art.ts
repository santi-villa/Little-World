import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { Plugin } from 'vite';
/** Bundle the manifest with JS and address each image by its actual content. */
export function versionedArt():Plugin {
 let production=false;
 return {name:'versioned-art',configResolved(config){production=config.command==='build';},
  resolveId(id){if(id==='virtual:versioned-art')return '\0versioned-art';},
  load(id){
   if(id!=='\0versioned-art')return;
   const root=resolve('public/assets'),manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
   for(const entry of Object.values(manifest.assets) as {file:string}[]){
    const source=readFileSync(resolve(root,entry.file));const digest=createHash('sha256').update(source).digest('hex').slice(0,20);
    if(production){const fileName=`art/${digest}-${basename(entry.file)}`;this.emitFile({type:'asset',fileName,source});entry.file=fileName;}
    else entry.file=`assets/${entry.file}?v=${digest}`;
   }
   return `export default ${JSON.stringify(manifest.assets)};`;
  }
 };
}
