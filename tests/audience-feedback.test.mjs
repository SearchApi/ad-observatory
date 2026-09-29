import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
import {handleAdLoader,collectPage,parsePageUrl} from '../server/ad-loader.mjs';
import {handleCompetitors} from '../server/ad-competitors.mjs';
import {handleAdCollections,libraryOwner} from '../server/ad-collections.mjs';
import {importedCapture,retainOwnedCapture,ownedCaptures} from '../server/owned-captures.mjs';
import {collectionObservation} from '../public/observations.js';
import {competitorSnapshots,retainCaptures} from '../public/workspace.js';
const cookie='ad-observatory-library='+'a'.repeat(64);
const req=(body,path='/api/ad-loader',identity=cookie)=>new Request('https://site.test'+path,{method:body?'POST':'GET',headers:{Cookie:identity,Origin:'https://site.test','Content-Type':'application/json','X-SearchApi-Key':'fixture-private-key'},...(body?{body:JSON.stringify(body)}:{})});
const row=(id,page='12345',active=true)=>({ad_archive_id:id,page_id:page,page_name:'Fixture advertiser '+page,is_active:active,publisher_platform:['FACEBOOK'],snapshot:{body:{text:'Fixture café'},link_url:'https://shop.example.com/a'}});
async function capture(){return (await collectPage(parsePageUrl('facebook.com/12345'),'BR',async()=>({ads:[row('1')]}))).snapshot;}

test('keyword searches use q, keep multiple advertisers, retain empty results and isolate status caches',async()=>{
 const db=previewDatabase(),calls=[];try{
 const upstream=async(_,opts)=>{const p=JSON.parse(opts.body);calls.push(p);return Response.json({search_metadata:{status:'Success'},ads:p.q==='empty'?[]:[row('1'),row('2','67890',false)]});};
 const snapshots=[];
 for(const activeStatus of ['active','all','inactive']){
  const r=await handleAdLoader(req({query:'café',country:'BR',activeStatus}),{DB:db},{upstream});assert.equal(r.status,200);const {snapshot}=await r.json();snapshots.push(snapshot);
  assert.equal(snapshot.config.watchlist.length,2);assert.equal(snapshot.config.query,'café');assert.equal(importedCapture(snapshot).scopeKey,snapshot.scopeKey);
 }
 assert.deepEqual(calls.map(p=>p.active_status),['active','all','inactive']);assert.ok(calls.every(p=>p.q==='café'&&!p.page_id));assert.equal(new Set(snapshots.map(s=>s.scopeKey)).size,3);
 assert.equal((await (await handleAdLoader(req({query:'café',country:'BR'}),{DB:db},{upstream})).json()).cached,true);assert.equal(calls.length,3);
 const empty=await (await handleAdLoader(req({query:'empty',country:'BR'}),{DB:db},{upstream})).json();assert.equal(empty.snapshot.ads.length,0);assert.equal(importedCapture(empty.snapshot).config.query,'empty');
 assert.equal(retainCaptures([...snapshots,empty.snapshot]).length,4);assert.equal(competitorSnapshots(snapshots).length,0);
 assert.equal((await ownedCaptures(db,await libraryOwner(req()))).length,4);
 for(const body of [{query:''},{query:'x'.repeat(201)},{query:'x',url:'facebook.com/12345'},{query:'x',activeStatus:'maybe'}])assert.equal((await handleAdLoader(req(body),{DB:db},{upstream})).status,400);
 }finally{db.close();}
});

test('saved competitors deduplicate, preserve country, isolate visitors, and outlive captures',async()=>{
 const db=previewDatabase(),env={DB:db};try{
 const owner=await libraryOwner(req()),s=await capture();await retainOwnedCapture(db,owner,s);
 for(let i=0;i<2;i++){const r=await handleCompetitors(req({action:'save',captureId:s.id,pageId:'12345'},'/api/ad-competitors'),env);assert.equal(r.status,200);const d=await r.json();assert.equal(d.competitors.length,1);assert.equal(d.competitors[0].country,'BR');}
 assert.equal((await handleCompetitors(req({action:'save',captureId:s.id,pageId:'12345'},'/api/ad-competitors','ad-observatory-library='+'b'.repeat(64)),env)).status,404);
 await db.prepare('DELETE FROM owned_captures WHERE owner=?').bind(owner).run();
 assert.equal((await (await handleCompetitors(req(null,'/api/ad-competitors'),env)).json()).competitors.length,1);
 await handleCompetitors(req({action:'remove',pageId:'12345'},'/api/ad-competitors'),env);
 assert.equal((await (await handleCompetitors(req(null,'/api/ad-competitors'),env)).json()).competitors.length,0);
 }finally{db.close();}
});

test('saved collection keeps original metadata when later source reports inactive',async()=>{
 const db=previewDatabase(),env={DB:db};try{
 const owner=await libraryOwner(req()),s=await capture();s.capturedAt='2026-09-20T00:00:00Z';s.ads[0].capturedAt=s.capturedAt;await retainOwnedCapture(db,owner,s);
 const id=(await (await handleAdCollections(req({action:'create',name:'Fixture collection'},'/api/ad-collections'),env)).json()).id;
 await handleAdCollections(req({action:'save',collection:id,ad:s.ads[0]},'/api/ad-collections'),env);
 const next={...s,id:'later',capturedAt:'2026-09-28T00:00:00Z',ads:[{...s.ads[0],isActive:false,body:'Changed copy'}]};await retainOwnedCapture(db,owner,next);
 const r=await handleAdCollections(req(null,'/api/ad-collections?collection='+id),env),item=(await r.json()).items[0];assert.equal(item.ad.isActive,true);assert.equal(item.ad.body,'Fixture café');assert.equal(item.observation.state,'inactive');
 }finally{db.close();}
});

test('absence is never inactivity, incompatible scopes ignored and retained evidence survives origin eviction',()=>{
 const ad={id:'1',pageId:'12345',capturedAt:'2026-09-20T00:00:00Z',observationScope:'BR-all'};
 const next={capturedAt:'2026-09-28T00:00:00Z',scopeKey:'BR-all',status:'partial',ads:[]};
 assert.equal(collectionObservation(ad,[next]).state,'missing');assert.match(collectionObservation(ad,[next]).detail,/incomplete/);
 assert.equal(collectionObservation(ad,[{...next,scopeKey:'US-all'}]).state,'saved');
 assert.equal(collectionObservation(ad,[{...next,ads:[{id:'1',pageId:'67890',isActive:false}]}]).state,'missing');
 assert.equal(collectionObservation(ad,[{...next,scopeKey:'other',ads:[{id:'1',pageId:'12345',isActive:false}]}]).state,'inactive');
});

test('legacy captures without placement scope stay explicitly unknown and cannot imply disappearance',async()=>{
 const old=await capture();delete old.config.adPlatform;const imported=importedCapture(old);assert.equal(imported.config.adPlatform,'unknown');assert.match(imported.scopeKey,/meta-legacy-unverified/);
 const next=importedCapture({...old,id:'next',capturedAt:'2099-01-01',ads:[]});assert.notEqual(imported.scopeKey,next.scopeKey);
 assert.equal(collectionObservation({...old.ads[0],observationScope:imported.scopeKey},[next]).state,'saved');
});
