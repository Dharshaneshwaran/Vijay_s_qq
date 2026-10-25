import { useRef, type CSSProperties } from 'react';
import { useCursorTracking } from '../hooks/useCursorTracking';
import type { Expression } from '../types/electron';
import '../styles/expressions.css';
export default function QbitFace({ expression, onClick, intensity=1, paused=false, cursorTracking=true }: { expression: Expression; onClick: () => void; intensity?: number; paused?: boolean; cursorTracking?: boolean }) {
 const gaze=useRef<SVGGElement|null>(null);
 useCursorTracking(gaze,expression,intensity,cursorTracking&&!paused);
 return <button className={`face ${expression}${paused?' animations-paused':''}`} style={{'--intensity':intensity} as CSSProperties} onClick={onClick} aria-label={`QBIT is ${expression}. Click to play.`}>
  <svg className="eye-art" viewBox="0 0 140 100" aria-hidden="true"><g className="gaze" ref={gaze}><g className="blinking"><path className="eye left-eye" d="M18 35 C18 21 42 21 42 35 C42 40 42 50 42 55 C42 69 18 69 18 55 C18 50 18 40 18 35 Z"/><g transform="translate(60 0)"><path className="eye right-eye" d="M18 35 C18 21 42 21 42 35 C42 40 42 50 42 55 C42 69 18 69 18 55 C18 50 18 40 18 35 Z"/></g></g></g><path className="sweat" d="M121 59 Q134 78 121 79 Q108 78 121 59Z"/><path className="energy" d="M66 15 L61 24 L69 24 L64 33"/></svg><span className="mouth"/>
 </button>;
}

