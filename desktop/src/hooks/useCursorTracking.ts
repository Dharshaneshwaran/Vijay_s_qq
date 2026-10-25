import { useEffect, type RefObject } from 'react';
import type { Expression } from '../types/electron';
export function useCursorTracking(ref:RefObject<SVGGElement|null>,expression:Expression,intensity:number,enabled:boolean) {
 useEffect(()=>{
  const element=ref.current;
  if(!element)return;
  const follow=['idle','happy','curious'].includes(expression)?1:['focused','thinking','excited','charging'].includes(expression)?.3:expression==='sleepy'?.12:0;
  const set=(x:number,y:number)=>{element.style.setProperty('--gaze-x',`${x}px`);element.style.setProperty('--gaze-y',`${y}px`);};
  set(0,0);
  if(!enabled||location.hash!=='#widget'||!window.qbit)return;
  return window.qbit.onCursor(({x,y})=>{const factor=Math.min(1.16,intensity)*follow;set(x*factor,y*factor);});
 },[ref,expression,intensity,enabled]);
}
