import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, CloudRain, Sun, Droplets, Wind, Thermometer, RefreshCw } from 'lucide-react';
import type { Settings } from '../types/electron';

// WMO weather codes -> short description. Rain-ish codes drive the monsoon push.
const WMO: Record<number, string> = {
 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
 45: 'Fog', 48: 'Depositing rime fog',
 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
 56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
 66: 'Freezing rain', 67: 'Heavy freezing rain',
 71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
 80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
 85: 'Snow showers', 86: 'Heavy snow showers',
 95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm w/ hail'
};
const RAIN_CODES = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]);

interface GeoResult { name: string; country: string; latitude: number; longitude: number; admin1?: string }
interface Daily { date: string; code: number; max: number; min: number; precipProb: number }
interface Current { temperature: number | null; apparent: number | null; humidity: number | null; precipitation: number | null; code: number | null; wind: number | null }

export default function WeatherPanel({ settings }: { settings: Settings }) {
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<GeoResult[]>([]);
 const [current, setCurrent] = useState<Current | null>(null);
 const [daily, setDaily] = useState<Daily[]>([]);
 const [label, setLabel] = useState(settings.weatherLabel);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const refresh = useRef<ReturnType<typeof setInterval>>(undefined);

 const fetchForecast = useCallback(async (lat: number, lon: number, name: string) => {
  setLoading(true); setError('');
  try {
   const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;
   const res = await fetch(url);
   if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
   const data = await res.json();
   const c: Current = {
    temperature: data.current?.temperature_2m ?? null,
    apparent: data.current?.apparent_temperature ?? null,
    humidity: data.current?.relative_humidity_2m ?? null,
    precipitation: data.current?.precipitation ?? null,
    code: data.current?.weather_code ?? null,
    wind: data.current?.wind_speed_10m ?? null
   };
   setCurrent(c);
   const d: Daily[] = (data.daily?.time ?? []).map((date: string, i: number) => ({
    date, code: data.daily.weather_code[i], max: data.daily.temperature_2m_max[i],
    min: data.daily.temperature_2m_min[i], precipProb: data.daily.precipitation_probability_max?.[i] ?? 0
   }));
   setDaily(d);
   const nextRain = (c.code !== null && RAIN_CODES.has(c.code)) || (c.precipitation ?? 0) > 0 || (d[0]?.precipProb ?? 0) >= 60;
   // Report a snapshot to the main process so the device bridge can push W1/W2 + R1/R0.
   void window.qbit?.reportWeather({
    label: name, temperature: c.temperature, apparent: c.apparent, humidity: c.humidity,
    precipitation: c.precipitation, weatherCode: c.code, windSpeed: c.wind, isRaining: nextRain, time: Date.now()
   });
  } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  finally { setLoading(false); }
 }, []);

 const search = async () => {
  if (!query.trim()) return;
  setError(''); setResults([]);
  try {
   const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5`);
   if (!res.ok) throw new Error(`Geocoding returned ${res.status}`);
   const data = await res.json();
   setResults(data.results ?? []);
   if (!data.results?.length) setError('No matching place found.');
  } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
 };

 const choose = async (g: GeoResult) => {
  const name = [g.name, g.admin1, g.country].filter(Boolean).join(', ');
  setLabel(name); setResults([]); setQuery('');
  await window.qbit?.setSettings({ weatherLatitude: g.latitude, weatherLongitude: g.longitude, weatherLabel: name });
  await fetchForecast(g.latitude, g.longitude, name);
 };

 // Load saved location on mount and refresh every 10 minutes.
 useEffect(() => {
  if (settings.weatherLatitude !== null && settings.weatherLongitude !== null) {
   void fetchForecast(settings.weatherLatitude, settings.weatherLongitude, settings.weatherLabel);
   refresh.current = setInterval(() => { void fetchForecast(settings.weatherLatitude!, settings.weatherLongitude!, settings.weatherLabel); }, 600000);
  }
  return () => clearInterval(refresh.current);
 }, [settings.weatherLatitude, settings.weatherLongitude, settings.weatherLabel, fetchForecast]);

 const raining = current?.code !== null && current?.code !== undefined && RAIN_CODES.has(current.code);

 return <div className="weather-grid">
  <article className="card weather-search">
   <h3>Weather</h3>
   <div className="weather-form">
    <input placeholder="Search a city..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }}/>
    <button className="primary" onClick={() => void search()}><Search size={14}/> Search</button>
    {label && <button onClick={() => { if (settings.weatherLatitude !== null && settings.weatherLongitude !== null) void fetchForecast(settings.weatherLatitude, settings.weatherLongitude, label); }} title="Refresh"><RefreshCw size={14}/></button>}
   </div>
   {results.length > 0 && <div className="geo-results">{results.map((g, i) => <button key={i} onClick={() => void choose(g)}>{[g.name, g.admin1, g.country].filter(Boolean).join(', ')}</button>)}</div>}
   {error && <p role="alert" className="error">{error}</p>}
   {!label && !error && <p className="muted-note">Search for a city to see current conditions and a 5-day forecast. Uses Open-Meteo (no API key).</p>}
  </article>

  {label && current && <>
   <article className={`card weather-now ${raining ? 'rainy' : 'clear'}`}>
    <span className="eyebrow">{label}</span>
    <div className="weather-temp">{current.temperature !== null ? `${Math.round(current.temperature)}\u00b0` : '--'}</div>
    <div className="weather-desc">{raining ? <CloudRain size={18}/> : <Sun size={18}/>} {current.code !== null ? (WMO[current.code] ?? 'Unknown') : 'Unknown'}</div>
    <div className="weather-metrics">
     <span><Thermometer size={14}/> Feels {current.apparent !== null ? `${Math.round(current.apparent)}\u00b0` : '--'}</span>
     <span><Droplets size={14}/> {current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'} humidity</span>
     <span><Wind size={14}/> {current.wind !== null ? `${Math.round(current.wind)} km/h` : '--'}</span>
     <span><CloudRain size={14}/> {current.precipitation !== null ? `${current.precipitation} mm` : '--'}</span>
    </div>
    {raining && <div className="rain-alert"><CloudRain size={14}/> Rain alert - mirrored to the device as monsoon.</div>}
    {loading && <p className="muted-note">Updating...</p>}
   </article>

   <article className="card weather-forecast">
    <h3>5-day forecast</h3>
    <div className="forecast-row">{daily.map(d => <div className="forecast-cell" key={d.date}>
     <strong>{new Date(d.date).toLocaleDateString([], { weekday: 'short' })}</strong>
     {RAIN_CODES.has(d.code) ? <CloudRain size={18}/> : <Sun size={18}/>}
     <span className="f-max">{Math.round(d.max)}{'\u00b0'}</span>
     <span className="f-min">{Math.round(d.min)}{'\u00b0'}</span>
     <small><Droplets size={11}/> {d.precipProb}%</small>
    </div>)}</div>
   </article>
  </>}
 </div>;
}
