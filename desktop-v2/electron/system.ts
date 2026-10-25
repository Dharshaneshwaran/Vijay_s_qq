import os from 'node:os';
import si from 'systeminformation';
import type { Battery, GPU, Stats } from './types.js';

let battery: Battery | null = null;

export function normalizeBattery(data: Awaited<ReturnType<typeof si.battery>>): Battery | null {
 if (!data.hasBattery || !Number.isFinite(data.percent) || data.percent < 0 || data.percent > 100 || typeof data.isCharging !== 'boolean' || typeof data.acConnected !== 'boolean') return null;
 return { percent: data.percent, isCharging: data.isCharging, acConnected: data.acConnected,
  timeRemaining: !data.isCharging && !data.acConnected && Number.isFinite(data.timeRemaining) && data.timeRemaining > 0 ? data.timeRemaining : null };
}

// One main-process poller, independent of renderer/window visibility.
export function monitorBattery(onUpdate: () => void): () => void {
 let stopped = false, pending = false;
 const refresh = async () => {
  if (pending || stopped) return;
  pending = true;
  let next: Battery | null = null;
  try { next = normalizeBattery(await si.battery()); } catch { /* Missing hardware or OS telemetry. */ }
  pending = false;
  if (!stopped) { battery = next; onUpdate(); }
 };
 void refresh();
 const timer = setInterval(() => { void refresh(); }, 10000);
 return () => { stopped = true; clearInterval(timer); };
}
const metrics: Omit<Stats, 'battery' | 'time'> = { cpu: null, cpuName: 'Unavailable', logicalProcessors: null, used: 0, total: 0, available: 0, ramPercent: null, gpus: [], platform: `${os.type()} ${os.release()}` };
const percent = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const memory = (value: unknown, allowZero = true): number | null => typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null;
export function normalizeGraphics(data: Awaited<ReturnType<typeof si.graphics>>): GPU[] {
 return data.controllers.map((gpu, index) => ({
  id: `${gpu.vendor}:${gpu.model}:${gpu.bus}:${gpu.pciBus || index}`,
  model: gpu.model || 'Unknown GPU', vendor: gpu.vendor || 'Unknown vendor',
  type: gpu.vramDynamic === true || /\b(UHD|Iris|Intel.*Graphics)\b/i.test(gpu.model) ? 'Integrated' : /\b(GeForce|Quadro|RTX|Radeon.*RX)\b/i.test(gpu.model) ? 'Dedicated' : 'Unknown',
  // Processing utilization is never inferred from occupied VRAM.
  utilization: percent(gpu.utilizationGpu), memoryUsed: memory(gpu.memoryUsed),
  memoryTotal: memory(gpu.memoryTotal, false) ?? memory(gpu.vram, false)
 }));
}
export function systemStats(): Stats { return { ...metrics, battery, time: Date.now() }; }
export function monitorHardware(onUpdate: () => void): () => void {
 let stopped = false;
 const timers: ReturnType<typeof setInterval>[] = [];
 const poll = (milliseconds: number, task: () => Promise<void>) => {
  let pending = false;
  const run = async () => { if (pending || stopped) return; pending = true;
   try { await task(); } finally { pending = false; if (!stopped) onUpdate(); }
  };
  void run(); timers.push(setInterval(() => { void run(); }, milliseconds));
 };
 void si.cpu().then(cpu => { if (!stopped) { metrics.cpuName = `${cpu.manufacturer} ${cpu.brand}`.trim() || 'Unavailable'; metrics.logicalProcessors = cpu.cores > 0 ? cpu.cores : null; onUpdate(); } }).catch(() => {});
 poll(2000, async () => {
  try { const load = await si.currentLoad(); if (!stopped) metrics.cpu = percent(load.currentLoad); }
  catch { if (!stopped) metrics.cpu = null; }
 });
 poll(2000, async () => {
  const [ram] = await Promise.allSettled([si.mem()]);
  if (stopped) return;
  if (ram.status === 'fulfilled' && ram.value.total > 0) {
   metrics.total = ram.value.total; metrics.available = ram.value.available;
   metrics.used = Math.max(0, ram.value.total - ram.value.available);
   metrics.ramPercent = percent(metrics.used / metrics.total * 100);
  } else { metrics.total = 0; metrics.available = 0; metrics.used = 0; metrics.ramPercent = null; }
 });
 poll(3000, async () => {
  try { const graphics = await si.graphics(); if (!stopped) metrics.gpus = normalizeGraphics(graphics); }
  catch { if (!stopped) metrics.gpus = metrics.gpus.map(gpu => ({ ...gpu, utilization: null, memoryUsed: null })); }
 });
 return () => { stopped = true; timers.forEach(clearInterval); };
}
