import { screen, type BrowserWindow } from 'electron';
import type { CursorOffset, Settings } from './types.js';
export function cursorOffset(point: { x:number; y:number }, bounds: { x:number; y:number; width:number; height:number }): CursorOffset {
 // Both APIs return desktop DIP coordinates, including negative monitor origins.
 const dx=point.x-(bounds.x+bounds.width/2), dy=point.y-(bounds.y+bounds.height/2);
 const divisor=Math.max(160,Math.hypot(dx,dy));
 return {x:dx/divisor*6,y:dy/divisor*6};
}
export function monitorCursor(win:BrowserWindow,settings:()=>Settings,onVisibility:(visible:boolean)=>void) {
 let timer:ReturnType<typeof setInterval>|undefined, previous:CursorOffset|null=null;
 const send=(offset:CursorOffset)=>{if(!win.isDestroyed())win.webContents.send('cursor',offset);};
 const tick=()=>{
  if(win.isDestroyed()||!win.isVisible()||win.isMinimized())return;
  const next=cursorOffset(screen.getCursorScreenPoint(),win.getBounds());
  if(previous&&Math.abs(previous.x-next.x)<.05&&Math.abs(previous.y-next.y)<.05)return;
  previous=next;send(next);
 };
 const reconcile=()=>{
  clearInterval(timer);timer=undefined;previous=null;
  const visible=!win.isDestroyed()&&win.isVisible()&&!win.isMinimized();onVisibility(visible);
  const s=settings();
  if(visible&&s.cursorTracking&&!s.animationsPaused){tick();timer=setInterval(tick,75);}
  else send({x:0,y:0});
 };
 win.on('show',reconcile);win.on('hide',reconcile);win.on('minimize',reconcile);win.on('restore',reconcile);
 const stop=()=>{clearInterval(timer);win.removeListener('show',reconcile);win.removeListener('hide',reconcile);win.removeListener('minimize',reconcile);win.removeListener('restore',reconcile);};
 win.once('closed',stop);reconcile();return{reconcile,stop};
}
