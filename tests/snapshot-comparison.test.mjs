import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSnapshots} from '../public/model.js';

const makeAd=(id,body='Test body',title='Test title',cta='Learn More')=>({id,pageId:'123',advertiser:'Test Brand',body,title,cta,format:'image',media:[],platforms:['facebook'],isActive:true,startDate:'2026-01-01',capturedAt:'2026-01-15T10:00:00Z'});
const makeSnapshot=(id,ads,capturedAt,scopeKey='["meta","123","ALL","active","all",2]')=>({id,capturedAt,ads,status:'ready',scopeKey,config:{watchlist:[{pageId:'123',name:'Test Brand'}],country:'ALL',activeStatus:'active',adPlatform:'all',maxPages:2},coverage:[{pageId:'123',name:'Test Brand',status:'complete',pages:1,returned:ads.length,duplicates:0,skipped:0,filtered:0,unique:ads.length}]});

test('compareSnapshots rejects invalid inputs',()=>{
  const before=makeSnapshot('snap1',[makeAd('1')],'2026-01-01T10:00:00Z');
  const after=makeSnapshot('snap2',[makeAd('2')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(null,after).available,false);
  assert.equal(compareSnapshots(before,null).available,false);
  assert.equal(compareSnapshots(before,before).available,false);
  assert.equal(compareSnapshots(after,before).available,false);
  assert.equal(compareSnapshots(before,{...after,scopeKey:'different'}).available,false);
  assert.equal(compareSnapshots(before,{...after,status:'partial'}).available,false);
});

test('compareSnapshots identifies added, retained, and missing ads by stable ad ID',()=>{
  const before=makeSnapshot('snap1',[makeAd('1'),makeAd('2'),makeAd('3')],'2026-01-01T10:00:00Z');
  const after=makeSnapshot('snap2',[makeAd('2'),makeAd('3'),makeAd('4')],'2026-01-02T10:00:00Z');
  const result=compareSnapshots(before,after);
  assert.equal(result.available,true);
  assert.equal(result.added.length,1);
  assert.equal(result.added[0].id,'4');
  assert.equal(result.retained.length,2);
  assert.ok(result.retained.some(a=>a.id==='2'));
  assert.ok(result.retained.some(a=>a.id==='3'));
  assert.equal(result.missing.length,1);
  assert.equal(result.missing[0].id,'1');
  assert.equal(result.bounded,false);
});

test('compareSnapshots flags bounded samples when either capture is bounded',()=>{
  const before=makeSnapshot('snap1',[makeAd('1')],'2026-01-01T10:00:00Z');
  before.coverage[0].status='bounded';
  const after=makeSnapshot('snap2',[makeAd('1')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,after).bounded,true);
  before.coverage[0].status='complete';
  after.coverage[0].status='bounded';
  assert.equal(compareSnapshots(before,after).bounded,true);
});

test('compareSnapshots detects edited copy when body, title, or CTA changes',()=>{
  const before=makeSnapshot('snap1',[makeAd('1','Original body','Original title','Buy Now')],'2026-01-01T10:00:00Z');
  const after=makeSnapshot('snap2',[makeAd('1','Updated body','Original title','Buy Now')],'2026-01-02T10:00:00Z');
  const result=compareSnapshots(before,after);
  assert.equal(result.retained.length,1);
  assert.equal(result.retained[0]._copyEdited,true);
  assert.equal(result.retained[0]._previousCopy.body,'Original body');
  assert.equal(result.retained[0]._previousCopy.title,'Original title');
  assert.equal(result.retained[0]._previousCopy.cta,'Buy Now');
});

test('compareSnapshots detects title and CTA changes',()=>{
  const before=makeSnapshot('snap1',[makeAd('1','Same body','Old title','Old CTA')],'2026-01-01T10:00:00Z');
  const afterTitle=makeSnapshot('snap2',[makeAd('1','Same body','New title','Old CTA')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,afterTitle).retained[0]._copyEdited,true);
  const afterCta=makeSnapshot('snap2',[makeAd('1','Same body','Old title','New CTA')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,afterCta).retained[0]._copyEdited,true);
});

test('compareSnapshots normalizes whitespace and case when detecting copy changes',()=>{
  const before=makeSnapshot('snap1',[makeAd('1','Original  Body','Title','CTA')],'2026-01-01T10:00:00Z');
  const after1=makeSnapshot('snap2',[makeAd('1','Original Body','Title','CTA')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,after1).retained[0]._copyEdited,undefined);
  const after2=makeSnapshot('snap2',[makeAd('1','ORIGINAL BODY','Title','CTA')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,after2).retained[0]._copyEdited,undefined);
  const after3=makeSnapshot('snap2',[makeAd('1','Original\n\nBody','Title','CTA')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before,after3).retained[0]._copyEdited,undefined);
});

test('compareSnapshots does not flag copy edits when text is unchanged',()=>{
  const before=makeSnapshot('snap1',[makeAd('1')],'2026-01-01T10:00:00Z');
  const after=makeSnapshot('snap2',[makeAd('1')],'2026-01-02T10:00:00Z');
  const result=compareSnapshots(before,after);
  assert.equal(result.retained.length,1);
  assert.equal(result.retained[0]._copyEdited,undefined);
  assert.equal(result.retained[0]._previousCopy,undefined);
});

test('compareSnapshots handles empty text fields correctly',()=>{
  const before=makeSnapshot('snap1',[makeAd('1','','','')],'2026-01-01T10:00:00Z');
  const after=makeSnapshot('snap2',[makeAd('1','New body','','')],'2026-01-02T10:00:00Z');
  const result=compareSnapshots(before,after);
  assert.equal(result.retained[0]._copyEdited,true);
  const before2=makeSnapshot('snap1',[makeAd('1','Body','','')],'2026-01-01T10:00:00Z');
  const after2=makeSnapshot('snap2',[makeAd('1','Body','','')],'2026-01-02T10:00:00Z');
  assert.equal(compareSnapshots(before2,after2).retained[0]._copyEdited,undefined);
});

test('compareSnapshots comparison works with multiple advertisers in same scope',()=>{
  const ad1a={...makeAd('1')};
  const ad2a={...makeAd('2'),pageId:'456',advertiser:'Other Brand'};
  const ad3a={...makeAd('3')};
  const ad2b={...makeAd('2'),pageId:'456',advertiser:'Other Brand',body:'Changed'};
  const ad4a={...makeAd('4'),pageId:'456',advertiser:'Other Brand'};
  const before=makeSnapshot('snap1',[ad1a,ad2a,ad3a],'2026-01-01T10:00:00Z','["meta",["keyword","test"],"ALL","active","all",2]');
  before.config.query='test';
  before.config.watchlist=[{pageId:'123',name:'Test Brand'},{pageId:'456',name:'Other Brand'}];
  const after=makeSnapshot('snap2',[ad2b,ad3a,ad4a],'2026-01-02T10:00:00Z','["meta",["keyword","test"],"ALL","active","all",2]');
  after.config.query='test';
  after.config.watchlist=[{pageId:'123',name:'Test Brand'},{pageId:'456',name:'Other Brand'}];
  const result=compareSnapshots(before,after);
  assert.equal(result.available,true);
  assert.equal(result.added.length,1);
  assert.equal(result.added[0].id,'4');
  assert.equal(result.missing.length,1);
  assert.equal(result.missing[0].id,'1');
  assert.equal(result.retained.length,2);
  const ad2=result.retained.find(a=>a.id==='2');
  assert.equal(ad2._copyEdited,true);
  const ad3=result.retained.find(a=>a.id==='3');
  assert.equal(ad3._copyEdited,undefined);
});
