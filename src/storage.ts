import { BASE, IMPROVED, cloneConfig, isConfig } from './simulation';
import type { Config } from './simulation';
export const STORAGE_KEY = 'festflow.configurations.v1';
export type Slots = [Config, Config];
export function readSlots(storage?: Pick<Storage,'getItem'>): { slots: Slots; warning: string } {
  try { const raw = (storage ?? localStorage).getItem(STORAGE_KEY); if (!raw) return { slots:[cloneConfig(BASE),cloneConfig(IMPROVED)], warning:'' }; const data: unknown = JSON.parse(raw); if (Array.isArray(data) && data.length===2 && data.every(isConfig)) return {slots:data as Slots,warning:''}; throw new Error('Invalid data'); }
  catch { return { slots:[cloneConfig(BASE),cloneConfig(IMPROVED)], warning:'Saved layouts could not be read. Sample layouts are available; save again to replace damaged data.' }; }
}
export function writeSlots(slots: Slots, storage?: Pick<Storage,'setItem'>): boolean { try { (storage ?? localStorage).setItem(STORAGE_KEY,JSON.stringify(slots)); return true; } catch { return false; } }
