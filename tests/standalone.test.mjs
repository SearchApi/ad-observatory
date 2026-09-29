import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {previewDatabase} from '../scripts/sqlite-store.mjs';

test('standalone serves its root and excludes Content Machine routes and private files',async()=>{
 const paths=[];const env={ASSETS:{fetch:async r=>{paths.push(new URL(r.url).pathname);return new Response('app');}}};
 assert.equal(await (await worker.fetch(new Request('http://127.0.0.1:5190/'),env)).text(),'app');
 for(const path of ['/api/meta-tracker','/api/content-state','/api/state','/.env','/.data/ad-observatory.sqlite','/%2egit/config'])assert.equal((await worker.fetch(new Request('http://127.0.0.1:5190'+path),env)).status,404);
 assert.deepEqual(paths,['/']);
 assert.equal((await worker.fetch(new Request('http://127.0.0.1:5190/',{method:'POST'}),env)).status,405);
});
test('first visit creates an empty workspace and unauthenticated searches cannot call the provider',async()=>{
 const DB=previewDatabase();const env={DB};try{
  const response=await worker.fetch(new Request('http://127.0.0.1:5190/api/ad-collections'),env);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).collections,[]);
  const cookie=response.headers.get('Set-Cookie').split(';')[0];
  const competitors=await worker.fetch(new Request('http://127.0.0.1:5190/api/ad-competitors',{headers:{Cookie:cookie}}),env);
  assert.deepEqual((await competitors.json()).competitors,[]);
  const search=await worker.fetch(new Request('http://127.0.0.1:5190/api/ad-loader',{method:'POST',headers:{Origin:'http://127.0.0.1:5190',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({url:'https://www.facebook.com/shopify',country:'US',activeStatus:'active',adPlatform:'all'})}),env);
  assert.equal(search.status,401);
 }finally{DB.close();}
});
