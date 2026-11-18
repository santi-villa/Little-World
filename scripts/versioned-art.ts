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
   Object.assign(manifest.assets, JSON.parse(readFileSync(resolve('src/data/illustrated-assets.json'), 'utf8')));
   for(const entry of Object.values(manifest.assets) as {file:string;file2x?:string}[]){
    // Also version the 2x cursor images.
    for(const key of ['file','file2x'] as const){
     const file=entry[key];if(!file)continue;
     const source=readFileSync(resolve(root,file));const digest=createHash('sha256').update(source).digest('hex').slice(0,20);
     if(production){const fileName=`art/${digest}-${basename(file)}`;this.emitFile({type:'asset',fileName,source});entry[key]=fileName;}
     else entry[key]=`assets/${file}?v=${digest}`;
    }
   }
   return `export default ${JSON.stringify(manifest.assets)};`;
  }
 };
}
