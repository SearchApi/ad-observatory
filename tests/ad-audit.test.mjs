import test from 'node:test';
import assert from 'node:assert/strict';
import {auditUrl,publicIPv4,pageSignals,inspectDestination,markDuplicateTitles,handleAdAudit} from '../server/ad-audit.mjs';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
import {libraryOwner} from '../server/ad-collections.mjs';
import {retainOwnedCapture} from '../server/owned-captures.mjs';
const html=(text,status=200)=>new Response(text,{status,headers:{'Content-Type':'text/html'}});
const resolveHost=async()=>['93.184.215.14'];

test('destination parser and resolved addresses block local, special, encoded IPs and unresolved functional templates',()=>{
 for(const value of ['http://localhost/a','http://127.0.0.1/a','http://2130706433','http://0x7f000001','http://[::1]/','https://a.local/x','https://a.com:444','file:///tmp/x','https://user:pass@a.com','https://a.com/?product={{id}}'])assert.throws(()=>auditUrl(value));
 for(const value of ['127.0.0.1','10.0.0.1','172.31.0.1','169.254.169.254','192.168.1.1','100.64.0.1','0.0.0.0','198.18.0.1','224.0.0.1','::1','999.1.1.1'])assert.equal(publicIPv4(value),false,value);
 assert.equal(publicIPv4('93.184.215.14'),true);assert.equal(auditUrl('https://example.com/a?utm_campaign={{id}}').href,'https://example.com/a');
});

test('soft 404 is a review clue in title/h1, while HTTP and duplicate-title signals stay separate',()=>{
 assert.deepEqual(pageSignals('<title>Página não encontrada</title>',200).flags,['Possible soft 404']);
 assert.deepEqual(pageSignals('<title>Learn about HTTP</title><p>A 404 tutorial</p>',200).flags,[]);
 assert.deepEqual(pageSignals('<title>Missing</title>',404).flags,['Page unavailable']);
 const pages=markDuplicateTitles([{title:'Same title',finalUrl:'https://x.com/a',status:200,flags:[]},{title:'same title',finalUrl:'https://x.com/b',status:200,flags:[]},{title:'Other',finalUrl:'https://x.com/c',status:200,flags:[]}]);assert.ok(pages[0].flags.includes('Duplicate title'));assert.deepEqual(pages[2].flags,[]);
 assert.deepEqual(markDuplicateTitles([{title:'X',finalUrl:'https://x.com/a',status:200,flags:[]},{title:'X',finalUrl:'https://x.com/a',status:200,flags:[]}])[0].flags,[]);
});

test('each redirect revalidates destination and DNS; non-HTML, oversized and network failures stay explicit',async()=>{
 let calls=0;await assert.rejects(()=>inspectDestination('https://public.example.com',{resolveHost,upstream:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});}}));assert.equal(calls,1);
 calls=0;await assert.rejects(()=>inspectDestination('https://public.example.com',{resolveHost:async()=>['127.0.0.1'],upstream:async()=>{calls++;return html('unsafe');}}));assert.equal(calls,0);
 const r=await inspectDestination('https://public.example.com',{resolveHost,upstream:async()=>new Response('pdf',{headers:{'Content-Type':'application/pdf'}})});assert.deepEqual(r.flags,['Not an HTML page']);
 const partial=await inspectDestination('https://public.example.com',{resolveHost,upstream:async()=>html('<title>Large page</title>'+'a'.repeat(512001))});assert.equal(partial.title,'Large page');assert.ok(partial.flags.some(f=>f.includes('Partial HTML')));
});

test('checks require owned captures, cap requests at ten destinations, cache results and do not send credentials',async()=>{
 const db=previewDatabase(),env={DB:db};try{
 const cookie='ad-observatory-library='+'a'.repeat(64),request=(body,identity=cookie)=>new Request('https://site.test/api/ad-audit',{method:'POST',headers:{Origin:'https://site.test',Cookie:identity,'Content-Type':'application/json'},body:JSON.stringify(body)}),owner=await libraryOwner(request({}));
 const ads=Array.from({length:12},(_,i)=>({id:String(i),landingUrl:'https://public.example.com/'+i}));await retainOwnedCapture(db,owner,{id:'capture',capturedAt:'2026-09-28',ads,config:{watchlist:[{pageId:'12345'}]}});
 let calls=0;const options={resolveHost,upstream:async(_,opts)=>{calls++;assert.equal(opts.headers.Cookie,undefined);assert.equal(opts.headers.Authorization,undefined);return html('<title>Same</title>');}};
 const body={captureId:'capture',adIds:ads.map(a=>a.id)};
 assert.equal((await handleAdAudit(request(body,'ad-observatory-library='+'b'.repeat(64)),env,options)).status,404);assert.equal(calls,0);
 const data=await (await handleAdAudit(request(body),env,options)).json();assert.equal(data.pages.length,10);assert.equal(data.skipped,2);assert.equal(calls,10);
 assert.equal((await (await handleAdAudit(request(body),env,options)).json()).cached,true);assert.equal(calls,10);
 assert.equal((await handleAdAudit(request({...body,adIds:['unknown']}),env,options)).status,404);
 }finally{db.close();}
});
