import test from 'node:test';
import assert from 'node:assert/strict';
import {competitorSnapshots,workspaceAds,retainCaptures} from '../public/workspace.js';
import {filterAds} from '../public/model.js';
const capture=(id,pageId,day,ads=['1'],extra={})=>({id,pageUrl:'https://www.facebook.com/'+pageId,capturedAt:`2026-09-${String(day).padStart(2,'0')}T12:00:00Z`,config:{watchlist:[{pageId,name:pageId}],country:'ALL'},ads:ads.map(ad=>({id:ad,pageId,capturedAt:`2026-09-${String(day).padStart(2,'0')}T12:00:00Z`})),...extra});
test('gallery uses one latest capture per page across profile aliases; refresh does not remove other brands',()=>{
 const a=capture('old','a',1,['1','2']),b=capture('other','b',2,['3']),refresh=capture('new','a',3,['2'],{pageUrl:'https://www.instagram.com/a'});
 const selected=competitorSnapshots([refresh,b,a]);
 assert.deepEqual(selected.map(s=>s.id),['new','other']);
 assert.deepEqual(workspaceAds(selected).map(a=>a.id),['2','3']);
 assert.equal(selected[0].ads[0].capturedAt,refresh.ads[0].capturedAt);
 assert.equal(a.ads.length,2);
});
test('empty latest capture replaces old results; removing a competitor is reversible without deleting history',()=>{
 const snapshots=[capture('old','a',1),capture('b','b',2),capture('empty','a',3,[])];
 assert.deepEqual(workspaceAds(competitorSnapshots(snapshots)).map(a=>a.pageId),['b']);
 assert.deepEqual(competitorSnapshots(snapshots,['a']).map(s=>s.id),['b']);
 assert.equal(competitorSnapshots(snapshots,[]).length,2);assert.equal(snapshots.length,3);
});
test('retention keeps latest capture of every competitor even after repeated refreshes of another',()=>{
 const snapshots=[capture('b','b',1),...Array.from({length:28},(_,i)=>capture('a'+i,'a',i+1))];
 const kept=retainCaptures(snapshots);
 assert.equal(kept.length,25);assert.equal(kept[0].id,'b');assert.equal(kept.at(-1).id,'a27');
});
test('mixed historical baselines do not become an extra competitor and page-scoped IDs stay separate',()=>{
 const snapshots=[capture('a','a',1),capture('b','b',1),capture('baseline','x',1,['7'],{pageUrl:null})];
 assert.equal(competitorSnapshots(snapshots).length,2);
 assert.equal(workspaceAds(competitorSnapshots(snapshots)).length,2);
 assert.equal(retainCaptures(snapshots).length,2);
});
test('advertiser filtering accepts several selected companies and keeps the single-company API shape',()=>{
 const ads=[{id:'1',pageId:'a',advertiser:'A',platforms:[]},{id:'2',pageId:'b',advertiser:'B',platforms:[]},{id:'3',pageId:'c',advertiser:'C',platforms:[]}];
 assert.deepEqual(filterAds(ads,{brand:['a','c']}).map(ad=>ad.id),['1','3']);
 assert.deepEqual(filterAds(ads,{brand:'b'}).map(ad=>ad.id),['2']);
 assert.equal(filterAds(ads,{brand:[]}).length,3);
});
