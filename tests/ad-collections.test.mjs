import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
import {handleAdCollections,savedCollectionAd} from '../server/ad-collections.mjs';
import {handleAdDownload} from '../server/ad-download.mjs';
const ad={id:'123',advertiser:'Test advertiser',pageId:'999',body:'Campaign idea',startDate:'2026-09-01',capturedAt:'2026-09-22T00:00:00Z',isActive:true,platforms:['instagram'],media:[{type:'video',url:'https://video.fbcdn.net/ad.mp4',preview:'https://image.fbcdn.net/cover.jpg'}]};
const req=(cookie,body,query='')=>new Request('https://site.test/api/ad-collections'+query,{method:body?'POST':'GET',headers:{Cookie:cookie||'',Origin:'https://site.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function setup(env){const response=await handleAdCollections(req(),env);assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/HttpOnly; SameSite=Lax/);assert.match(response.headers.get('Set-Cookie'),/Secure/);return response.headers.get('Set-Cookie').split(';')[0];}
async function create(env,cookie,name='Next campaign'){const response=await handleAdCollections(req(cookie,{action:'create',name}),env);assert.equal(response.status,201);return (await response.json()).id;}
test('named collection saves an independent copy, deduplicates ads and supports rename/remove/restore',async()=>{
 const db=previewDatabase(),env={DB:db};try{
 const cookie=await setup(env),id=await create(env,cookie,'Próxima campanha');
 for(let i=0;i<2;i++)assert.equal((await handleAdCollections(req(cookie,{action:'save',collection:id,ad:{...ad,privateKey:'never store'}}),env)).status,200);
 let data=await (await handleAdCollections(req(cookie,null,'?collection='+id),env)).json();assert.equal(data.name,'Próxima campanha');assert.equal(data.items.length,1);assert.equal(data.items[0].ad.body,'Campaign idea');assert.equal(data.items[0].ad.privateKey,undefined);
 await handleAdCollections(req(cookie,{action:'rename',collection:id,name:'Summer launch'}),env);
 data=await (await handleAdCollections(req(cookie),env)).json();assert.equal(data.collections[0].name,'Summer launch');assert.equal(data.collections[0].count,1);
 await handleAdCollections(req(cookie,{action:'remove',collection:id,adId:ad.id}),env);
 assert.equal((await (await handleAdCollections(req(cookie,null,'?collection='+id),env)).json()).items.length,0);
 await handleAdCollections(req(cookie,{action:'save',collection:id,ad}),env);
 assert.equal((await (await handleAdCollections(req(cookie,null,'?collection='+id),env)).json()).items.length,1);
 }finally{db.close();}
});
test('collections and saved media are isolated between visitors, including guessed IDs',async()=>{
 const db=previewDatabase(),env={DB:db,ASSETS:{fetch:async()=>Response.json({snapshots:[]})}};try{
 const a=await setup(env),b=await setup(env),id=await create(env,a);await handleAdCollections(req(a,{action:'save',collection:id,ad}),env);
 assert.equal((await (await handleAdCollections(req(b),env)).json()).collections.length,0);
 assert.equal((await handleAdCollections(req(b,null,'?collection='+id),env)).status,404);
 for(const action of ['rename','save','remove'])assert.equal((await handleAdCollections(req(b,{action,collection:id,name:'stolen',ad,adId:ad.id}),env)).status,404);
 assert.equal(await savedCollectionAd(req(b),env,id,ad.id),null);
 for(const [cookie,expected] of [[a,200],[b,404]]){let calls=0;const request=new Request('https://site.test/api/ad-download?collection='+id+'&ad=123&asset=0',{headers:{Cookie:cookie}});const response=await handleAdDownload(request,env,{upstream:async()=>{calls++;return new Response('video',{headers:{'Content-Type':'video/mp4'}});}});assert.equal(response.status,expected);if(expected===200)assert.equal(await response.text(),'video');assert.equal(calls,expected===200?1:0);}
 }finally{db.close();}
});
test('private collections persist across preview restarts with the same visitor cookie',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ad-library-')),path=join(dir,'db.sqlite');let db=previewDatabase(path);try{
 let env={DB:db};const cookie=await setup(env),id=await create(env,cookie);await handleAdCollections(req(cookie,{action:'save',collection:id,ad}),env);db.close();db=previewDatabase(path);env={DB:db};const data=await (await handleAdCollections(req(cookie,null,'?collection='+id),env)).json();assert.equal(data.items[0].ad.id,'123');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid names, missing sessions, cross-site writes and oversized data are rejected',async()=>{
 const db=previewDatabase(),env={DB:db};try{
 const cookie=await setup(env);for(const name of ['', ' '.repeat(4),'a'.repeat(81)])assert.equal((await handleAdCollections(req(cookie,{action:'create',name}),env)).status,400);
 assert.equal((await handleAdCollections(req('',{action:'create',name:'x'}),env)).status,401);
 const foreign=req(cookie,{action:'create',name:'x'});foreign.headers.set('Origin','https://elsewhere.test');assert.equal((await handleAdCollections(foreign,env)).status,403);
 assert.equal((await handleAdCollections(req(cookie,{action:'create',name:'x'.repeat(110000)}),env)).status,413);
 const id=await create(env,cookie);assert.equal((await handleAdCollections(req(cookie,{action:'save',collection:id,ad:{id:'bad'}}),env)).status,400);
 }finally{db.close();}
});
