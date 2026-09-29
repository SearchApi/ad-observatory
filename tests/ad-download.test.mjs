import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {handleAdDownload} from '../server/ad-download.mjs';
import {retainOwnedCapture} from '../server/owned-captures.mjs';
import {libraryOwner} from '../server/ad-collections.mjs';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
const snapshot={id:'capture-1',ads:[{id:'123',advertiser:'Brand / Test',media:[{type:'video',url:'https://video.fbcdn.net/asset.mp4'},{type:'image',url:'https://image.cdninstagram.com/asset.jpg'}]}]};
const databases=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
const cookie='ad-observatory-library='+'a'.repeat(64);
async function fixture(value=snapshot){const DB=previewDatabase();databases.push(DB);const owner=await libraryOwner(new Request('https://example.test',{headers:{Cookie:cookie}}));await retainOwnedCapture(DB,owner,{...value,config:{watchlist:[{pageId:'12345'}]},capturedAt:'2026-01-01T00:00:00Z'});return {DB};}
const request=(query='capture=capture-1&ad=123&asset=0',options={})=>new Request('https://example.test/api/ad-download?'+query,{...options,headers:{Cookie:cookie,...options.headers}});
test('downloads selected original asset with a safe name and no provider credential',async()=>{
 const env=await fixture();let target;
 const response=await handleAdDownload(request(),env,{upstream:async(url,options)=>{target=url;assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);return new Response('video-content',{headers:{'Content-Type':'video/mp4'}});}});
 assert.equal(target,snapshot.ads[0].media[0].url);assert.equal(await response.text(),'video-content');assert.equal(response.headers.get('Content-Disposition'),'attachment; filename="Brand-Test-123-1.mp4"');
 const image=await handleAdDownload(request('capture=capture-1&ad=123&asset=1'),env,{upstream:async()=>new Response('image',{headers:{'Content-Type':'image/jpeg'}})});
 assert.match(image.headers.get('Content-Disposition'),/-2.jpg/);assert.equal(await image.text(),'image');
});
test('rejects cross-site, malformed, unknown and unsafe assets before fetching media',async()=>{
 const env=await fixture();let calls=0;const upstream=async()=>{calls++;throw Error('unexpected');};
 for(const [req,status] of [[request('',{method:'POST'}),405],[request(undefined,{headers:{'Sec-Fetch-Site':'cross-site'}}),403],[request('capture=x&ad=123&asset=-1'),400],[request('capture=capture-1&ad=999&asset=0'),404],[request('capture=capture-1&ad=123&asset=2'),404]])assert.equal((await handleAdDownload(req,env,{upstream})).status,status);
 for(const url of ['http://video.fbcdn.net/a','https://fbcdn.net.evil.test/a','https://user:pass@video.fbcdn.net/a','https://video.fbcdn.net:444/a','https://127.0.0.1/a']){
  const unsafe=structuredClone(snapshot);unsafe.ads[0].media[0].url=url;
  assert.equal((await handleAdDownload(request(),await fixture(unsafe),{upstream})).status,422);
 }
 assert.equal(calls,0);
});
test('expired media, redirects, incorrect types and oversized responses return useful errors',async()=>{
 const env=await fixture();
 for(const [upstream,status] of [[async()=>new Response('',{status:403}),502],[async()=>new Response('',{status:302,headers:{Location:'https://evil.test'}}),502],[async()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}}),502],[async()=>new Response('large',{headers:{'Content-Type':'video/mp4','Content-Length':'101'}}),413]]){
  const r=await handleAdDownload(request(),env,{upstream,maxBytes:100});assert.equal(r.status,status);assert.match((await r.json()).error,/original ad/);
 }
 const streamed=await handleAdDownload(request(),env,{upstream:async()=>new Response('123456',{headers:{'Content-Type':'video/mp4'}}),maxBytes:3});await assert.rejects(()=>streamed.arrayBuffer(),/interrupted/);
});
test('live captures resolve from server storage and downloads enforce the hourly allowance',async()=>{
 const live=await fixture();
 const env=await fixture();let calls=0;const upstream=async()=>{calls++;return new Response('ok',{headers:{'Content-Type':'video/mp4'}});};
 for(let i=0;i<40;i++){const r=await handleAdDownload(request(),live,{upstream});assert.equal(r.status,200);await r.text();}
 assert.equal((await handleAdDownload(request(),live,{upstream})).status,429);assert.equal(calls,40);
});
test('thumbnail uses the saved preview and enforces image type and source restrictions',async()=>{
 const copy=structuredClone(snapshot);copy.ads[0].media[0].preview='https://image.fbcdn.net/poster.jpg';
 const local=await fixture(copy);
 const req=request('capture=capture-1&ad=123&asset=0&kind=thumbnail');
 const response=await handleAdDownload(req,local,{upstream:async(url)=>{assert.equal(url,copy.ads[0].media[0].preview);return new Response('poster',{headers:{'Content-Type':'image/jpeg'}});}});
 assert.equal(await response.text(),'poster');assert.match(response.headers.get('Content-Disposition'),/-thumbnail.jpg/);
 assert.equal((await handleAdDownload(req,local,{upstream:async()=>new Response('video',{headers:{'Content-Type':'video/mp4'}})})).status,502);
 copy.ads[0].media[0].preview='https://example.org/poster.jpg';
 assert.equal((await handleAdDownload(req,await fixture(copy),{upstream:()=>{throw Error('Must not fetch');}})).status,422);
});
