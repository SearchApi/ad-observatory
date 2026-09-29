import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
import {handleAdAccess,handleAdCredentials} from '../server/ad-access.mjs';
import {handleAdApi} from '../server/ad-api.mjs';
import {handleAdLoader} from '../server/ad-loader.mjs';
import {libraryOwner} from '../server/ad-collections.mjs';
import {retainOwnedCapture} from '../server/owned-captures.mjs';
import {handleAdDownload} from '../server/ad-download.mjs';
const origin='https://example.test';
const cookie=visitor=>'ad-observatory-library='+visitor.repeat(64);
const browser=(body,visitor='a',route='/api/ad-access',headers={})=>new Request(origin+route,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie(visitor),Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const agent=(token,path='',body,key)=>new Request(origin+'/api/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(key?{'X-SearchApi-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const mint=async(env,visitor='a')=>(await (await handleAdAccess(browser({action:'create'},visitor),env)).json()).token;
const fixture=(id='capture-one',date='2026-09-01T12:00:00Z')=>({id,engine:'meta_ad_library',status:'ready',pageUrl:'https://www.facebook.com/12345',capturedAt:date,config:{watchlist:[{pageId:'12345',name:'Brand'}],country:'ALL',activeStatus:'active',adPlatform:'all',maxPages:2},scopeKey:JSON.stringify(['meta','12345','ALL','active','all',2]),coverage:[{pageId:'12345',name:'Brand',status:'bounded',unique:1,pages:2}],ads:[{id:'123',pageId:'12345',advertiser:'Brand',isActive:true,startDate:'2026-08-01',capturedAt:date,format:'video',platforms:['instagram'],media:[{type:'video',url:'https://video.fbcdn.net/creative.mp4'}],body:'Message'}]});
const envFor=()=>({DB:previewDatabase(),SEARCHAPI_API_KEY:'owner-secret-not-to-use',ASSETS:{fetch:async()=>new Response(null,{status:404})}});

test('tokens are hashed, browser-only, scoped, rotated, expired and revoked',async()=>{
 const env=envFor();try{
  assert.equal((await handleAdAccess(browser({action:'create'},'a','/api/ad-access',{Origin:'https://evil.test'}),env)).status,403);
  const first=await mint(env),secondOwner=await mint(env,'b');assert.match(first,/^ao_[a-f0-9]{64}$/);
  const rows=(await env.DB.prepare('SELECT * FROM agent_tokens').all()).results;assert.ok(!JSON.stringify(rows).includes(first));
  assert.equal((await handleAdApi(agent(first,'captures'),env)).status,200);
  const second=await mint(env);assert.equal((await handleAdApi(agent(first,'captures'),env)).status,401);
  assert.equal((await handleAdApi(agent(secondOwner,'captures'),env)).status,200);
  await handleAdAccess(browser({action:'revoke'}),env);assert.equal((await handleAdApi(agent(second,'captures'),env)).status,401);
  await env.DB.prepare("UPDATE agent_tokens SET expires_at='2000-01-01T00:00:00Z'").run();assert.equal((await handleAdApi(agent(secondOwner,'captures'),env)).status,401);
  assert.equal((await handleAdApi(browser(undefined,'a','/api/v1/captures'),env)).status,401);
 }finally{env.DB.close();}
});

test('agent access cannot guess captures or save another visitor’s ads/collections',async()=>{
 const env=envFor();try{
  const a=await mint(env),b=await mint(env,'b'),owner=await libraryOwner(browser());await retainOwnedCapture(env.DB,owner,fixture());
  const own=await (await handleAdApi(agent(a,'captures'),env)).json();assert.equal(own.total,1);
  assert.equal((await (await handleAdApi(agent(b,'captures'),env)).json()).total,0);
  for(const path of ['captures/capture-one','ads?capture=capture-one','compare?before=capture-one&after=capture-one'])assert.equal((await handleAdApi(agent(b,path),env)).status,404);
  const collection=await (await handleAdApi(agent(a,'collections',{name:'Next campaign'}),env)).json();
  assert.equal((await handleAdApi(agent(a,`collections/${collection.id}/items`,{captureId:'capture-one',adId:'123'}),env)).status,200);
  assert.equal((await handleAdApi(agent(b,`collections/${collection.id}`),env)).status,404);
  await retainOwnedCapture(env.DB,await libraryOwner(browser(undefined,'b')),fixture());
  assert.equal((await handleAdApi(agent(b,`collections/${collection.id}/items`,{captureId:'capture-one',adId:'123'}),env)).status,404);
  const saved=await (await handleAdApi(agent(a,`collections/${collection.id}`),env)).json();assert.equal(saved.items[0].ad.id,'123');
 }finally{env.DB.close();}
});

test('agent ads use latest advertiser capture; observations and comparison derive only from retained samples',async()=>{
 const env=envFor();try{
  const token=await mint(env),owner=await libraryOwner(browser());const before=fixture(),after=fixture('capture-two','2026-09-03T12:00:00Z');after.ads.push({...after.ads[0],id:'456'});
  await retainOwnedCapture(env.DB,owner,before);await retainOwnedCapture(env.DB,owner,after);
  const data=await (await handleAdApi(agent(token,'ads?limit=1'),env)).json();assert.equal(data.total,2);assert.equal(data.nextOffset,1);assert.equal(data.items[0].derived.observationCount,2);assert.equal(data.items[0].derived.runningDays,33);
  const comparison=await (await handleAdApi(agent(token,'compare?before=capture-one&after=capture-two'),env)).json();assert.equal(comparison.added[0].id,'456');assert.equal(comparison.bounded,true);
  assert.equal((await handleAdApi(agent(token,'ads?limit=0'),env)).status,400);
  assert.equal((await handleAdApi(agent(token,'ads?api_key=bad'),env)).status,400);
 }finally{env.DB.close();}
});

test('imports preserve provenance, deduplicate and enforce advertiser scope',async()=>{
 const env=envFor();try{
  const snapshot=fixture();assert.equal((await handleAdAccess(browser({action:'import',snapshot}),env)).status,200);
  await handleAdAccess(browser({action:'import',snapshot}),env);
  const stored=await (await handleAdAccess(browser(undefined,'a','/api/ad-access?view=captures'),env)).json();assert.equal(stored.captures.length,1);assert.equal(stored.captures[0].provenance,'browser-import');
  snapshot.ads[0].pageId='99999';assert.equal((await handleAdAccess(browser({action:'import',snapshot}),env)).status,400);
  assert.equal((await handleAdAccess(browser({action:'import',snapshot:null}),env)).status,400);
 }finally{env.DB.close();}
});

test('loader never falls back to deployment owner key and isolates cache by user and key',async()=>{
 const env=envFor();let calls=0;try{
  const body={url:'https://www.facebook.com/12345'},upstream=async(url,options)=>{calls++;assert.notEqual(options.headers.Authorization,'Bearer '+env.SEARCHAPI_API_KEY);return Response.json({search_metadata:{status:'Success'},ads:[]});};
  assert.equal((await handleAdLoader(browser(body,'a','/api/ad-loader'),env,{upstream})).status,401);assert.equal(calls,0);
  for(const [visitor,key] of [['a','test-key-one'],['a','test-key-one'],['b','test-key-one'],['a','test-key-two']])assert.equal((await handleAdLoader(browser(body,visitor,'/api/ad-loader',{'X-SearchApi-Key':key}),env,{upstream})).status,200);
  assert.equal(calls,3);
  const token=await mint(env);assert.equal((await handleAdApi(agent(token,'search',body),env,{upstream})).status,401);
  assert.equal((await handleAdApi(agent(token,'search',body,'test-key-two'),env,{upstream})).status,200);assert.equal(calls,3);
 }finally{env.DB.close();}
});

test('key verification sends only bearer header and returns only numeric account quota',async()=>{
 const env=envFor(),key='test-secret-key';try{
  const request=()=>browser({},'a','/api/ad-credentials',{'X-SearchApi-Key':key});
  const response=await handleAdCredentials(request(),env,{upstream:async(url,options)=>{assert.equal(url,'https://www.searchapi.io/api/v1/me');assert.equal(options.headers.Authorization,'Bearer '+key);assert.equal(options.redirect,'manual');return Response.json({account:{remaining_credits:42,email:'private@example.test'},secret:key});}});
  assert.deepEqual(await response.json(),{connected:true,remainingCredits:42});
  const bad=await handleAdCredentials(request(),env,{upstream:async()=>new Response(key,{status:401})});assert.equal(bad.status,401);assert.ok(!(await bad.text()).includes(key));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM ad_cache').first()).n,0);
 }finally{env.DB.close();}
});

test('owned media downloads cannot be accessed using another visitor’s cookie',async()=>{
 const env=envFor();try{
  await retainOwnedCapture(env.DB,await libraryOwner(browser()),fixture());let calls=0;
  const upstream=async()=>{calls++;return new Response('video',{headers:{'Content-Type':'video/mp4'}});};
  const path='/api/ad-download?capture=capture-one&ad=123&asset=0&kind=original';
  assert.equal((await handleAdDownload(browser(undefined,'b',path),env,{upstream})).status,404);assert.equal(calls,0);
  const download=await handleAdDownload(browser(undefined,'a',path),env,{upstream});assert.equal(download.status,200);await download.arrayBuffer();assert.equal(calls,1);
 }finally{env.DB.close();}
});
