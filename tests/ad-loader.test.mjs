import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePageUrl,createAdStore,handleAdLoader,collectPage,normalizeMetaAd} from '../server/ad-loader.mjs';
import {previewDatabase} from '../scripts/sqlite-store.mjs';
import {safeUrl,groupAds} from '../public/model.js';

const metaRow=(id='1',page='20409006880')=>({ad_archive_id:id,page_id:page,page_name:'Shopify',is_active:true,snapshot:{body:{text:'A useful message from Shopify'},videos:[{video_hd_url:'https://video.fbcdn.net/creative.mp4?x=1',video_preview_image_url:'https://image.fbcdn.net/preview.jpg'}]},publisher_platform:['FACEBOOK']});
const input={url:'https://www.facebook.com/20409006880',country:'US'};
const request=(body=input,options={})=>new Request('https://example.test/api/ad-loader',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:'ad-observatory-library='+('a'.repeat(64)),'X-SearchApi-Key':'test-private-key',...options.headers},body:JSON.stringify(body)});

test('page URL parsing canonicalizes supported pages and rejects host spoofing and non-page links',()=>{
  assert.equal(parsePageUrl('facebook.com/Shopify/?ref=test').url,'https://www.facebook.com/shopify');
  assert.equal(parsePageUrl('https://m.facebook.com/profile.php?id=20409006880').pageId,'20409006880');
  assert.equal(parsePageUrl('https://www.facebook.com/ads/library/?view_all_page_id=20409006880').pageId,'20409006880');
  assert.equal(parsePageUrl('https://www.instagram.com/SlikDesk/?igsh=example').url,'https://www.instagram.com/slikdesk/');
  assert.equal(parsePageUrl('instagram.com/a.brand_/reels/').alias,'a.brand_');
  for(const url of ['https://facebook.com.evil.test/shopify','https://facebook.com@evil.test/a','https://me@facebook.com/shopify','https://facebook.com:444/shopify','https://linkedin.com/in/person','https://linkedin.com/company/shopify','https://instagram.com.evil.test/slikdesk','https://instagram.com/p/12345','https://instagram.com/reel/12345','https://instagram.com/stories/slikdesk','https://instagram.com/slikdesk/post/123','https://facebook.com/groups/12345','https://facebook.com/shopify/posts/123','http://127.0.0.1/a','javascript:alert(1)','https://facebook.com/%73hopify'])assert.throws(()=>parsePageUrl(url));
});

test('D1-compatible budget reservations and leases are atomic and cache expiry is enforced',async()=>{
  const db=previewDatabase(),store=createAdStore(db);
  assert.equal((await Promise.all(Array.from({length:8},()=>store.reserve('today',3)))).filter(Boolean).length,3);
  assert.equal((await Promise.all([store.lock('capture'),store.lock('capture')])).filter(Boolean).length,1);
  await store.unlock('capture');assert.equal(await store.lock('capture'),true);
  await store.put('fresh',{saved:true});assert.deepEqual(await store.get('fresh'),{saved:true});
  await store.put('stale',{saved:true},-1);assert.equal(await store.get('stale'),null);db.close();
});

test('Facebook collection keeps exact page IDs, deduplicates, and stops repeated tokens',async()=>{
  let calls=0;
  const result=await collectPage(parsePageUrl(input.url),'US',async p=>{calls++;assert.equal(p.page_id,'20409006880');return {ads:[metaRow(),metaRow(),metaRow('2','99999')],pagination:{next_page_token:'same'}};});
  assert.equal(calls,2);assert.equal(result.snapshot.ads.length,1);assert.equal(result.snapshot.ads[0].format,'video');
  assert.equal(result.snapshot.coverage[0].duplicates,3);assert.equal(result.snapshot.coverage[0].skipped,2);assert.equal(result.snapshot.status,'partial');
});

test('normalized ads retain the advertiser logo returned by Meta Ad Library',()=>{
  const row=metaRow();row.snapshot.page_profile_picture_url='https://image.fbcdn.net/shopify-logo.jpg';
  assert.equal(normalizeMetaAd(row,{pageId:'20409006880',name:'Shopify',profileUrl:'https://facebook.com/shopify'},'2026-09-22T12:00:00Z').logoUrl,'https://image.fbcdn.net/shopify-logo.jpg');
});

test('Facebook alias resolves exact identity and preserves a successful first page on later error',async()=>{
  let requests=[];
  const result=await collectPage(parsePageUrl('facebook.com/shopify'),'US',async p=>{
    requests.push(p);if(p.engine==='meta_ad_library_page_search')return {page_results:[{page_alias:'shopify',page_id:'20409006880',name:'Shopify'}]};
    if(p.next_page_token)throw Error('Second page unavailable');
    return {ads:[metaRow()],pagination:{next_page_token:'next'}};
  });
  assert.equal(requests.length,3);assert.equal(result.snapshot.ads.length,1);assert.equal(result.snapshot.status,'partial');
});

test('Instagram resolves the exact handle and includes all Meta placements by default',async()=>{
  const calls=[];
  const result=await collectPage(parsePageUrl('instagram.com/slikdesk'),'ALL',async p=>{
    calls.push(p);
    if(p.engine==='meta_ad_library_page_search')return {page_results:[{page_id:'999999',name:'SlikDesk',page_alias:'slikdesk',ig_username:'other_brand'},{page_id:'1619003745014895',name:'SlikDesk',ig_username:'slikdesk'}]};
    return {ads:[{...metaRow('1','1619003745014895'),publisher_platform:['INSTAGRAM','FACEBOOK']},{...metaRow('2','1619003745014895'),publisher_platform:['MESSENGER','THREADS']},{...metaRow('3','999999'),publisher_platform:['INSTAGRAM']}]};
  });
  assert.equal(calls[1].platforms,undefined);assert.equal(calls[1].page_id,'1619003745014895');
  assert.equal(result.snapshot.ads.length,2);assert.equal(result.snapshot.config.adPlatform,'all');assert.equal(result.snapshot.matchMethod,'instagram-handle');
  assert.equal(result.snapshot.coverage[0].filtered,0);assert.equal(result.snapshot.coverage[0].skipped,1);
});

test('Instagram never treats a similar Facebook page alias as proof of identity',async()=>{
  await assert.rejects(()=>collectPage(parsePageUrl('instagram.com/slikdesk'),'ALL',async()=>({page_results:[{page_id:'999999',page_alias:'slikdesk',name:'SlikDesk'}]})),/couldn’t find a Meta advertiser linked/);
});

test('ambiguous exact Instagram matches require a valid advertiser selection',async()=>{
  const api=async p=>p.engine==='meta_ad_library_page_search'?{page_results:[{page_id:'11111',ig_username:'slikdesk',name:'SlikDesk A'},{page_id:'22222',ig_username:'slikdesk',name:'SlikDesk B'}]}:{ads:[]};
  const input=parsePageUrl('instagram.com/slikdesk');
  assert.equal((await collectPage(input,'ALL',api)).candidates.length,2);
  assert.equal((await collectPage(input,'ALL',api,'instagram','22222')).snapshot.config.watchlist[0].pageId,'22222');
  await assert.rejects(()=>collectPage(input,'ALL',api,'instagram','99999'));
});

test('explicit platform choices reach the API and keep comparison scopes separate',async()=>{
  const calls=[];const api=async p=>{calls.push(p);return {ads:[]};};const parsed=parsePageUrl(input.url);
  const fb=await collectPage(parsed,'ALL',api,'facebook'),ig=await collectPage(parsed,'ALL',api,'instagram'),both=await collectPage(parsed,'ALL',api,'both');
  assert.deepEqual(calls.map(p=>p.platforms),['facebook','instagram','facebook,instagram']);
  assert.equal(new Set([fb,ig,both].map(r=>r.snapshot.scopeKey)).size,3);
  assert.equal(both.snapshot.ads.length,0);assert.equal(both.snapshot.coverage[0].status,'complete');
});

test('public loader rejects cross-origin, oversized, and invalid requests before spending quota',async()=>{
  const env={SEARCHAPI_API_KEY:'test-private-key'},upstream=()=>{throw Error('must not call');};
  for(const [req,status] of [[request(input,{headers:{Origin:'https://evil.test'}}),403],[request({url:'https://evil.test/a'}),400],[request({...input,country:'ZZ'}),400],[request({...input,adPlatform:'linkedin'}),400],[request({url:'x'.repeat(5000)}),413]])assert.equal((await handleAdLoader(req,env,{upstream})).status,status);
});

test('capture cache prevents repeated API calls; daily limit works across new captures',async()=>{
  const db=previewDatabase(),env={DB:db,SEARCHAPI_API_KEY:'test-private-key',AD_DAILY_LIMIT:'1'};let calls=0;
  const upstream=async(url,options)=>{calls++;assert.equal(url,'https://www.searchapi.io/api/v1/search');assert.equal(options.headers.Authorization,'Bearer test-private-key');assert.equal(options.redirect,'manual');return Response.json({search_metadata:{status:'Success'},ads:[metaRow()]});};
  const first=await handleAdLoader(request(),env,{upstream});assert.equal(first.status,200);const body=await first.json();assert.equal(body.snapshot.ads.length,1);
  const cached=await (await handleAdLoader(request(),env,{upstream})).json();assert.equal(cached.cached,true);assert.equal(cached.snapshot.id,body.snapshot.id);assert.equal(calls,1);
  const blocked=await handleAdLoader(request({...input,country:'ALL'}),env,{upstream});assert.equal(blocked.status,429);assert.equal(calls,1);db.close();
});

test('provider failure and credential-bearing output cannot leak into a public response',async()=>{
  for(const upstream of [async()=>new Response(null,{status:302,headers:{Location:'https://other.test/'}}),async()=>Response.json({error:'test-private-key'},{status:500}),async()=>Response.json({search_metadata:{status:'Success'},secret:'test-private-key',ads:[]})]){
    const db=previewDatabase();const r=await handleAdLoader(request(),{DB:db,SEARCHAPI_API_KEY:'test-private-key'},{upstream});assert.equal(r.status,502);assert.ok(!(await r.text()).includes('test-private-key'));db.close();
  }
});

test('platform-specific caches do not reuse results from a different placement filter',async()=>{
  const db=previewDatabase(),env={DB:db,SEARCHAPI_API_KEY:'test-private-key'},calls=[];
  const upstream=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({search_metadata:{status:'Success'},ads:[]});};
  for(const adPlatform of ['facebook','instagram','both'])assert.equal((await handleAdLoader(request({...input,adPlatform}),env,{upstream})).status,200);
  assert.deepEqual(calls.map(p=>p.platforms),['facebook','instagram','facebook,instagram']);db.close();
});

test('the source’s explicit no-results response becomes an empty capture',async()=>{
  const db=previewDatabase();const r=await handleAdLoader(request(),{DB:db,SEARCHAPI_API_KEY:'test-private-key'},{upstream:async()=>Response.json({error:"Meta Ad Library didn't return any results."})});
  assert.equal(r.status,200);assert.equal((await r.json()).snapshot.ads.length,0);db.close();
});
