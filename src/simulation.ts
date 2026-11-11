export type Point = { x: number; y: number };
export type Station = Point & { id: string; name: string; subtitle: string; color: string; kind: 'food' | 'registration'; counters: number; seconds: number; weight: number };
export type Config = { name: string; stations: Station[]; entrance: Point };
export type Settings = { rate: number; duration: number; serviceSpeed: number; seed: number };
export type Arrival = { id: number; at: number; destination: string; serviceFactor: number };
export type Visit = Arrival & { queueAt: number; start: number; end: number; exitAt: number; counter: number; distance: number };
export type Run = { config: Config; settings: Settings; visits: Visit[]; arrivals: Arrival[] };
export const DEFAULT_SETTINGS: Settings = { rate: 24, duration: 10, serviceSpeed: 1, seed: 2026 };
export const BASE: Config = { name: 'Campus Fest Rush', entrance: { x: 95, y: 455 }, stations: [
  { id: 'tacos', name: 'Taco Town', subtitle: 'Tacos & good times', kind: 'food', color: '#db805f', x: 220, y: 175, counters: 1, seconds: 18, weight: 0.32 },
  { id: 'pizza', name: 'Slice Society', subtitle: 'Fresh from the oven', kind: 'food', color: '#9c91bc', x: 540, y: 155, counters: 1, seconds: 24, weight: 0.30 },
  { id: 'drinks', name: 'The Cool Club', subtitle: 'Sip, chill, repeat', kind: 'food', color: '#72a693', x: 720, y: 345, counters: 1, seconds: 20, weight: 0.22 },
  { id: 'registration', name: 'Registration', subtitle: 'Your fest starts here', kind: 'registration', color: '#6b92b6', x: 270, y: 390, counters: 1, seconds: 12, weight: 0.16 },
] };
export const IMPROVED: Config = { name: 'A little more flow', entrance: { x: 95, y: 455 }, stations: BASE.stations.map(s => ({ ...s, counters: s.id === 'tacos' || s.id === 'pizza' ? 2 : 1, x: s.id === 'pizza' ? 520 : s.x, y: s.id === 'tacos' ? 215 : s.y })) };
export const cloneConfig = (config: Config): Config => JSON.parse(JSON.stringify(config));
export function random(seed: number) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Independent seeded stream: geometry, counters and service speed never alter demand. */
export function generateArrivals(settings: Settings): Arrival[] {
  const rng = random(settings.seed), arrivals: Arrival[] = []; let at = 0;
  if (settings.rate <= 0) return arrivals;
  while (true) {
    at += -Math.log(1 - rng()) * 60 / settings.rate;
    if (at > settings.duration * 60) break;
    const choice = rng(); let cumulative = 0;
    const station = BASE.stations.find(s => { cumulative += s.weight; return choice < cumulative; }) ?? BASE.stations[3];
    arrivals.push({ id: arrivals.length, at, destination: station.id, serviceFactor: 0.8 + rng() * 0.4 });
  }
  return arrivals;
}
export function simulate(config: Config, settings: Settings, arrivals = generateArrivals(settings)): Run {
  const visits: Visit[] = [];
  for (const station of config.stations) {
    const distance = Math.hypot(station.x - config.entrance.x, station.y - config.entrance.y) * 0.2;
    const walkingSeconds = distance / 1.25;
    const available = Array.from({ length: station.counters }, () => 0);
    const waiting = arrivals.filter(a => a.destination === station.id).map(a => ({ ...a, queueAt: a.at + walkingSeconds })).sort((a,b) => a.queueAt - b.queueAt || a.id - b.id);
    for (const arrival of waiting) {
      const counter = available.indexOf(Math.min(...available));
      const start = Math.max(arrival.queueAt, available[counter]);
      const end = start + station.seconds * arrival.serviceFactor / settings.serviceSpeed;
      available[counter] = end;
      visits.push({ ...arrival, start, end, exitAt: end + walkingSeconds, counter, distance });
    }
  }
  return { config, settings, arrivals, visits: visits.sort((a,b) => a.id - b.id) };
}
export function snapshot(run: Run, time: number) {
  const t = Math.max(0, Math.min(time, run.settings.duration * 60));
  const served = run.visits.filter(v => v.end <= t);
  const entered = run.visits.filter(v => v.at <= t).length;
  const stations = run.config.stations.map(s => {
    const visits = run.visits.filter(v => v.destination === s.id);
    const completed = visits.filter(v => v.end <= t);
    const queued = visits.filter(v => v.queueAt <= t && v.start > t);
    const events = visits.flatMap(v => v.start > v.queueAt ? [{ at: v.queueAt, delta: 1 }, { at: v.start, delta: -1 }] : []).filter(e => e.at <= t).sort((a,b) => a.at - b.at || a.delta - b.delta);
    let current = 0, longest = 0;
    for (const event of events) { current += event.delta; longest = Math.max(current, longest); }
    const busySeconds = visits.reduce((total,v) => total + Math.max(0, Math.min(v.end,t) - Math.min(v.start,t)), 0);
    return { ...s, served: completed.length, queued: queued.length, longest, wait: completed.length ? completed.reduce((a,v) => a + v.start - v.queueAt,0) / completed.length : 0, utilization: t ? busySeconds / (s.counters * t) : 0 };
  });
  const busiest = [...stations].sort((a,b) => b.utilization - a.utilization)[0];
  return { served: served.length, entered, active: run.visits.filter(v => v.at <= t && v.exitAt > t).length, waiting: stations.reduce((a,s) => a+s.queued,0), averageWait: served.length ? served.reduce((a,v) => a+v.start-v.queueAt,0)/served.length : 0, longest: Math.max(0,...stations.map(s=>s.longest)), busiest: busiest && busiest.utilization > 0 ? busiest : undefined, stations, meanWalk: entered ? run.visits.filter(v=>v.at<=t).reduce((a,v)=>a+v.distance,0)/entered : 0, unfinished: entered-served.length };
}
export function visitorPosition(visit: Visit, run: Run, time: number, queueIndex?: number): (Point & { state: 'walking'|'queued'|'serving'|'leaving' }) | null {
  if (time < visit.at || time >= visit.exitAt) return null;
  const station = run.config.stations.find(s => s.id === visit.destination)!;
  const entrance = run.config.entrance;
  if (time < visit.queueAt) { const ratio = (time-visit.at)/(visit.queueAt-visit.at); return { x: entrance.x+(station.x-entrance.x)*ratio, y: entrance.y+(station.y+36-entrance.y)*ratio, state: 'walking' }; }
  if (time < visit.start) {
    const ahead = queueIndex ?? run.visits.filter(v => v.destination === visit.destination && v.queueAt <= time && v.start > time && (v.queueAt < visit.queueAt || v.queueAt === visit.queueAt && v.id < visit.id)).length;
    return { x: station.x-20+(ahead%5)*10, y: station.y+49+Math.floor(ahead/5)*11, state:'queued' };
  }
  if (time < visit.end) return { x: station.x+(visit.counter-(station.counters-1)/2)*18, y: station.y+32, state:'serving' };
  const ratio = (time-visit.end)/(visit.exitAt-visit.end);
  return { x: station.x+(entrance.x-station.x)*ratio, y: station.y+36+(entrance.y-station.y-36)*ratio, state:'leaving' };
}
export function formatTime(seconds: number) { return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`; }
export function formatWait(seconds: number) { return seconds < 60 ? `${Math.round(seconds)}s` : `${(seconds/60).toFixed(1)}m`; }
export function isConfig(value: unknown): value is Config {
  if (!value || typeof value !== 'object') return false;
  const c=value as Config;
  return typeof c.name==='string' && c.name.length<=60 && !!c.entrance && Number.isFinite(c.entrance.x) && c.entrance.x>=65 && c.entrance.x<=855 && Number.isFinite(c.entrance.y) && c.entrance.y>=100 && c.entrance.y<=460 && Array.isArray(c.stations) && c.stations.length===4 && BASE.stations.every(base=>c.stations.filter(s=>s.id===base.id).length===1) && c.stations.every(s=>typeof s.name==='string' && typeof s.color==='string' && Number.isFinite(s.x) && s.x>=65 && s.x<=855 && Number.isFinite(s.y) && s.y>=100 && s.y<=460 && Number.isInteger(s.counters) && s.counters>=1 && s.counters<=5 && s.seconds>0 && s.seconds<=120);
}
