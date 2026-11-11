import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, IMPROVED, DEFAULT_SETTINGS, cloneConfig, generateArrivals, simulate, snapshot, visitorPosition, isConfig } from './simulation';
import type { Arrival } from './simulation';
import { readSlots, writeSlots, STORAGE_KEY } from './storage';

function fixture(counters=1) { const c=cloneConfig(BASE);c.stations[0]={...c.stations[0],...c.entrance,counters,seconds:10};return c; }
const arrivals: Arrival[] = [0,1,2].map((at,id)=>({id,at,destination:'tacos',serviceFactor:1}));
test('single counter serves FIFO with exact start/end times and waiting statistics',()=>{
  const run=simulate(fixture(),DEFAULT_SETTINGS,arrivals);
  assert.deepEqual(run.visits.map(v=>[v.start,v.end]),[[0,10],[10,20],[20,30]]);
  const stats=snapshot(run,30);assert.equal(stats.served,3);assert.equal(stats.averageWait,9);assert.equal(stats.longest,2);assert.equal(stats.waiting,0);assert.equal(stats.stations[0].utilization,1);
});
test('parallel counters provide actual service capacity without double booking',()=>{
  const run=simulate(fixture(2),DEFAULT_SETTINGS,arrivals);
  assert.deepEqual(run.visits.map(v=>[v.start,v.end,v.counter]),[[0,10,0],[1,11,1],[10,20,0]]);
  assert.equal(snapshot(run,20).averageWait,8/3);assert.equal(snapshot(run,10).served,1);
  for(const c of [BASE,IMPROVED]){const r=simulate(c,DEFAULT_SETTINGS);for(const s of c.stations)for(let n=0;n<s.counters;n++){const vs=r.visits.filter(v=>v.destination===s.id&&v.counter===n);for(let i=1;i<vs.length;i++)assert.ok(vs[i].start>=vs[i-1].end);}}
});
test('moving a stall or entrance changes walking distance and queue arrival',()=>{
  const near=fixture(),far=cloneConfig(near);far.stations[0].x+=125;
  const a=simulate(near,DEFAULT_SETTINGS,arrivals),b=simulate(far,DEFAULT_SETTINGS,arrivals);
  assert.equal(b.visits[0].distance-a.visits[0].distance,25);assert.equal(b.visits[0].queueAt-a.visits[0].queueAt,20);assert.equal(b.visits[0].end-a.visits[0].end,20);
  const moved=cloneConfig(near);moved.entrance.x+=125;assert.equal(simulate(moved,DEFAULT_SETTINGS,arrivals).visits[0].queueAt,20);
});
test('service speed changes service duration, not walking or generated demand',()=>{
  const a=simulate(fixture(),DEFAULT_SETTINGS,arrivals),b=simulate(fixture(),{...DEFAULT_SETTINGS,serviceSpeed:2},arrivals);
  assert.equal(b.visits[0].end,5);assert.equal(a.visits[0].queueAt,b.visits[0].queueAt);assert.equal(snapshot(b,15).served,3);
  assert.deepEqual(generateArrivals(DEFAULT_SETTINGS),generateArrivals({...DEFAULT_SETTINGS,serviceSpeed:2}));
});
test('comparisons reuse the identical seeded arrivals, destinations, and service factors',()=>{
  const shared=generateArrivals(DEFAULT_SETTINGS);const a=simulate(BASE,DEFAULT_SETTINGS,shared),b=simulate(IMPROVED,DEFAULT_SETTINGS,shared);
  assert.equal(a.arrivals,b.arrivals);assert.deepEqual(a.visits.map(v=>[v.id,v.at,v.destination,v.serviceFactor]),b.visits.map(v=>[v.id,v.at,v.destination,v.serviceFactor]));assert.deepEqual(simulate(BASE,DEFAULT_SETTINGS),simulate(BASE,DEFAULT_SETTINGS));
  assert.ok(snapshot(b,600).served>snapshot(a,600).served);assert.ok(snapshot(b,600).averageWait<snapshot(a,600).averageWait);
  assert.notDeepEqual(shared,generateArrivals({...DEFAULT_SETTINGS,seed:7}));
});
test('cutoff counts only completed service; peak queue is historical, not dashboard randomness',()=>{
  const r=simulate(fixture(),DEFAULT_SETTINGS,arrivals);const atTwo=snapshot(r,2);
  assert.equal(atTwo.served,0);assert.equal(atTwo.waiting,2);assert.equal(atTwo.averageWait,0);assert.equal(atTwo.unfinished,3);
  assert.equal(snapshot(r,15).longest,2);assert.equal(snapshot(r,15).waiting,1);assert.equal(snapshot(r,15).averageWait,0);
  assert.deepEqual(snapshot(r,10000),snapshot(r,600));assert.equal(snapshot(r,0).busiest,undefined);assert.equal(snapshot(r,1).busiest?.id,'tacos');
});
test('animated visitor states correspond to event boundaries and exiting',()=>{
  const c=fixture();c.stations[0].x+=125;const r=simulate(c,DEFAULT_SETTINGS,arrivals),v=r.visits[1];
  assert.equal(visitorPosition(v,r,.5),null);assert.equal(visitorPosition(v,r,5)?.state,'walking');assert.equal(visitorPosition(v,r,22)?.state,'queued');assert.equal(visitorPosition(v,r,32)?.state,'serving');assert.equal(visitorPosition(v,r,42)?.state,'leaving');assert.equal(visitorPosition(v,r,61),null);
});
test('empty demand produces zero statistics without NaN',()=>{const r=simulate(BASE,{...DEFAULT_SETTINGS,rate:0});const s=snapshot(r,600);assert.equal(s.served,0);assert.equal(s.averageWait,0);assert.equal(s.longest,0);assert.equal(s.busiest,undefined);assert.equal(s.meanWalk,0);});
test('two browser slots round-trip, remain independent, and recover damaged/unavailable storage',()=>{
  const db=new Map<string,string>();const storage={getItem:(key:string)=>db.get(key)??null,setItem:(key:string,value:string)=>{db.set(key,value);}};
  const {slots}=readSlots(storage);assert.equal(slots.length,2);slots[0].name='Saved campus';assert.equal(writeSlots(slots,storage),true);assert.deepEqual(readSlots(storage).slots,slots);slots[0].stations[0].counters=5;assert.equal(readSlots(storage).slots[0].stations[0].counters,1);
  db.set(STORAGE_KEY,'broken');assert.ok(readSlots(storage).warning);assert.deepEqual(readSlots(storage).slots,[BASE,IMPROVED]);
  db.set(STORAGE_KEY,JSON.stringify([{...BASE,stations:[]},IMPROVED]));assert.ok(readSlots(storage).warning);
  assert.equal(writeSlots(slots,{setItem(){throw new Error('quota');}}),false);assert.ok(readSlots({getItem(){throw new Error('blocked');}}).warning);
  const invalid=cloneConfig(BASE);invalid.stations[0].counters=0;assert.equal(isConfig(invalid),false);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});
  try {assert.ok(readSlots().warning);assert.equal(writeSlots(slots),false);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
