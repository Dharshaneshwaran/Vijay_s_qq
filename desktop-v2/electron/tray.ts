import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron';
import type { Expression, Settings, Stats } from './types.js';
import { state } from './store.js';
export let tray: Tray;
export let trayMenu: Menu;
let menuCallbacks: { open: () => void; toggle: () => void; pause: () => void };
let latestStats: Stats | null = null;
let animation: ReturnType<typeof setInterval> | undefined;
let iconKey = '', frame = 0;
const icons = new Map<string, NativeImage>();
function icon(expression: Expression, blink: boolean): NativeImage {
 const key = `${expression}:${blink}`;
 const cached = icons.get(key); if (cached) return cached;
 const size = 32, pixels = Buffer.alloc(size*size*4);
 for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
  if (Math.hypot(Math.max(4-x,0,x-27),Math.max(4-y,0,y-27)) > 4) continue;
  const side = x<16 ? 0 : 1, local = x-(side ? 19 : 6);
  let eye = local>=0 && local<7 && y>=10 && y<23;
  if (blink || expression==='sleepy' || expression==='exhausted') eye=local>=0 && local<9 && y>=18 && y<=20;
  else if (expression==='happy'||expression==='charging'||expression==='excited') eye=local>=0 && local<9 && Math.abs(y-(12+(local-4)**2*.35))<2;
  else if (expression==='stressed'||expression==='focused') eye=local>=0 && local<9 && y>=12+(side ? 8-local : local)*.45 && y<21;
  else if (expression==='playful' && side===1) eye=local>=0 && local<9 && y>=17 && y<=19;
  else if (expression==='worried') eye=local>=0 && local<8 && y>=12+Math.abs(local-4)*.5 && y<22;
  else if (expression==='curious' && side===1) eye=local>=0 && local<7 && y>=8 && y<20;
  const sweat=expression==='stressed' && x>=26 && x<=29 && y>=22 && y<=27 && Math.abs(x-27.5)<(y-21)*.4;
  const color=expression==='alert'?[243,205,131]:sweat?[87,199,246]:[113,219,215];
  const i=(y*size+x)*4;
  pixels[i]=eye||sweat?color[2]:32; pixels[i+1]=eye||sweat?color[1]:24; pixels[i+2]=eye||sweat?color[0]:16; pixels[i+3]=255;
 }
 const image=nativeImage.createFromBitmap(pixels,{width:size,height:size}); icons.set(key,image); return image;
}
export function refreshTraySettings() {
 if (!tray || tray.isDestroyed()) return;
 trayMenu=Menu.buildFromTemplate([
  {label:'Show / Hide QBIT',click:menuCallbacks.toggle}, {label:'Open Control Center',click:menuCallbacks.open}, {type:'separator'},
  {label:'CPU: N/A | RAM: N/A | GPU: N/A',enabled:false},
  {label:'Pause animations',type:'checkbox',checked:state().settings.animationsPaused,click:menuCallbacks.pause},
  {type:'separator'},{label:'Quit QBIT',click:()=>app.quit()}
 ]);
 tray.setContextMenu(trayMenu); if(latestStats) updateTrayStats(latestStats);
}
export function createTray(open:()=>void,toggle:()=>void,pause:()=>void) {
 menuCallbacks={open,toggle,pause}; tray=new Tray(icon('idle',false));
 tray.setToolTip('QBIT - Your little desktop companion'); refreshTraySettings(); tray.on('click',toggle);
 app.once('before-quit',()=>{clearInterval(animation);tray.destroy();});
}
export function updateTrayStats(stats:Stats) {
 latestStats=stats; if(!tray||tray.isDestroyed())return;
 const gpus=stats.gpus.filter(g=>!state().settings.preferredGpu || g.id===state().settings.preferredGpu).map(g=>g.utilization).filter((n):n is number=>n!==null);
 const label=`CPU: ${stats.cpu===null?'N/A':Math.round(stats.cpu)+'%'} | RAM: ${stats.ramPercent===null?'N/A':Math.round(stats.ramPercent)+'%'} | GPU: ${gpus.length?Math.round(Math.max(...gpus))+'%':'N/A'}`;
 trayMenu.items[3].label=label; tray.setToolTip(`QBIT - ${label}`);
}
export function updateTrayMood(expression:Expression,settings:Settings) {
 if(!tray||tray.isDestroyed())return;
 const animate=settings.trayAnimation&&!settings.animationsPaused, key=`${expression}:${animate}`;
 if(iconKey===key)return; iconKey=key; frame=0; clearInterval(animation); tray.setImage(icon(expression,false));
 if(animate)animation=setInterval(()=>{ frame=(frame+1)%12; if(frame===0||frame===1)tray.setImage(icon(expression,frame===0)); },400);
}
