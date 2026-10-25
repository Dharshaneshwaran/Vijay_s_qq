import type { Expression, Settings, Stats } from './types.js';
const bands: Expression[] = ['sleepy','curious','happy','focused','stressed','exhausted'];
const boundaries = [15,35,60,80,95];
export function activityScore(stats: Stats, preferredGpu = ''): number | null {
 if (stats.cpu === null || stats.ramPercent === null) return null;
 const candidates = preferredGpu ? stats.gpus.filter(g => g.id === preferredGpu) : stats.gpus;
 const available = candidates.map(g => g.utilization).filter((v): v is number => v !== null);
 const gpu = available.length ? Math.max(...available) : null;
 return (stats.cpu * .45 + stats.ramPercent * .25 + (gpu ?? 0) * .30) / (gpu === null ? .70 : 1);
}
export class ExpressionEngine {
 private stats: Stats | null = null;
 private samples: number[] = [];
 private lastSample = -Infinity;
 private band = -1;
 private changedAt = -Infinity;
 private previousCharging: boolean | undefined;
 private events = new Map<'reminder'|'click'|'charging', number>();
 update(stats: Stats, settings: Settings, now = Date.now()) {
  this.stats = stats;
  if (stats.battery) {
   if (this.previousCharging === false && stats.battery.isCharging) this.events.set('charging', now + 4000);
   this.previousCharging = stats.battery.isCharging;
  }
  if (now - this.lastSample < 1500) return;
  this.lastSample = now;
  const score = activityScore(stats, settings.preferredGpu);
  if (score === null) return;
  this.samples.push(score); if (this.samples.length > 5) this.samples.shift();
  const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
  let next = boundaries.filter(b => average >= b).length;
  if (this.band < 0) { this.band = next; this.changedAt = now; return; }
  if (now - this.changedAt < 8000) return;
  // Four percentage points of hysteresis on either side of a boundary.
  if (next > this.band && average < boundaries[this.band] + 4) next = this.band;
  if (next < this.band && average > boundaries[this.band - 1] - 4) next = this.band;
  if (next !== this.band) { this.band = next; this.changedAt = now; }
 }
 trigger(event: 'reminder'|'click', now = Date.now()) { this.events.set(event, now + (event === 'reminder' ? 12000 : 3000)); }
 expression(settings: Settings, now = Date.now()): Expression {
  const battery = this.stats?.battery;
  const discharging = battery && !battery.isCharging && !battery.acConnected;
  if (discharging && battery.percent <= 5) return 'exhausted';
  for (const [event, expression] of [['reminder','alert'],['click','playful'],['charging','charging']] as const) {
   if ((this.events.get(event) ?? 0) > now) return expression;
   this.events.delete(event);
  }
  if (discharging && battery.percent <= 20) return 'worried';
  return settings.adaptiveExpressions && this.band >= 0 && this.stats?.cpu !== null && this.stats?.ramPercent !== null ? bands[this.band] : settings.expression;
 }
}
