import type { Stats } from '../types/electron';
const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
export default function SystemStats({ stats }: { stats: Stats | null }) {
 const battery = stats?.battery;
 return <div className="stat-grid">
  <div className="resource-grid">
   <article className="card"><span className="eyebrow">CPU USAGE</span><h2>{stats?.cpu != null ? `${Math.round(stats.cpu)}%` : 'N/A'}</h2><progress aria-label="CPU usage" max={100} value={stats?.cpu ?? 0}/><p>{stats?.cpuName ?? 'Connecting...'}<br/>{stats?.logicalProcessors != null ? `${stats.logicalProcessors} logical processors` : 'Processor count unavailable'} - Every 2 seconds</p></article>
   <article className="card"><span className="eyebrow">MEMORY</span><h2>{stats?.ramPercent != null ? `${Math.round(stats.ramPercent)}%` : 'N/A'}</h2><progress aria-label="RAM usage" max={100} value={stats?.ramPercent ?? 0}/><p>{stats?.total ? `${gb(stats.used)} / ${gb(stats.total)} GB used` : 'Waiting for system metrics'}<br/>{stats?.total ? `${gb(stats.available)} GB available` : 'Available memory unknown'}</p></article>
   <article className="card"><span className="eyebrow">GPU</span>{stats?.gpus?.length ? stats.gpus.map(gpu => <div className="gpu-reading" key={gpu.id}><h2>{gpu.utilization === null ? 'N/A' : `${Math.round(gpu.utilization)}%`}</h2>{gpu.utilization !== null && <progress aria-label={`${gpu.model} utilization`} max={100} value={gpu.utilization}/>}<p>{gpu.model}<br/>{gpu.type !== 'Unknown' ? gpu.type : gpu.vendor}<br/>{gpu.utilization === null ? 'Utilization unavailable' : 'Processing utilization'}{gpu.memoryTotal !== null && <><br/>VRAM: {gpu.memoryUsed !== null ? `${Math.round(gpu.memoryUsed)} / ` : ''}{Math.round(gpu.memoryTotal)} MB</>}</p></div>) : <><h2>N/A</h2><p>GPU information unavailable</p></>}</article>
  </div>
  <article className="card"><span className="eyebrow">BATTERY</span><h2>{battery ? `${Math.round(battery.percent)}%` : 'Battery unavailable'}</h2>{battery && <><p>{battery.isCharging ? 'Charging' : 'Not charging'} - {battery.acConnected ? 'AC connected' : 'AC disconnected'}</p><p>{battery.timeRemaining === null ? 'Remaining time unavailable' : `${Math.floor(Math.round(battery.timeRemaining) / 60)}h ${Math.round(battery.timeRemaining) % 60}m remaining`}</p></>}</article>
  <article className="card"><span className="eyebrow">YOUR SYSTEM</span><h3>{stats?.platform ?? 'Connecting...'}</h3><p>Light on resources. Here for you.</p></article>
 </div>;
}
