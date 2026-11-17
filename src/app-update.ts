import texts from './data/texts.es.json';
/** PWA updates affect only app files. IndexedDB saves are never cleared. */
let saveBeforeUpdate:()=>Promise<void>=async()=>{};
export function beforeAppUpdate(save:()=>Promise<void>):void {saveBeforeUpdate=save;}
let reloading=false;
export async function repairApp():Promise<void>{
 if(!navigator.onLine)throw new Error(texts.appUpdate.offline);
 const response=await fetch(`${import.meta.env.BASE_URL}?repairProbe=${Date.now()}`,{cache:'no-store'});
 if(!response.ok || !(await response.text()).includes('<html'))throw new Error(texts.appUpdate.downloadError);
 await saveBeforeUpdate();
 const scope=new URL(import.meta.env.BASE_URL,location.origin).href;
 if('serviceWorker'in navigator){for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope===scope)await registration.unregister();}
 if('caches'in window)for(const name of await caches.keys()){
  const cache=await caches.open(name);
  for(const request of await cache.keys())if(request.url.startsWith(scope))await cache.delete(request);
 }
 location.replace(`${import.meta.env.BASE_URL}?actualizar=${Date.now()}`);
}
export function startAppUpdates():void{
 const button=document.createElement('button');button.className='repair-app';button.textContent=texts.appUpdate.label;button.title=texts.appUpdate.title;
 button.addEventListener('click',()=>{button.disabled=true;void repairApp().catch(error=>{button.disabled=false;button.textContent=String(error instanceof Error?error.message:error);});});
 document.body.append(button);
 if(!import.meta.env.PROD||!('serviceWorker'in navigator))return;
 let controllerSeen=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!controllerSeen){controllerSeen=true;return;}
  if(reloading)return;
  reloading=true;
  void saveBeforeUpdate().then(()=>location.reload()).catch(()=>{reloading=false;button.textContent=texts.appUpdate.saveError;});
 });
 const register=async()=>{
  const registration=await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:'none'});
  const check=()=>void registration.update().catch(()=>{});
  check();window.setInterval(check,30*60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 };
 void register().catch(()=>{});
}
