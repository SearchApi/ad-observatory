import {libraryOwner} from './ad-collections.mjs';
import {ownKey} from './access-utils.mjs';
import {retainOwnedCapture} from './owned-captures.mjs';
const AD_COUNTRIES = new Set(['US','ALL','GB','CA','AU','BR','DE','FR','IN']);
const CACHE_SECONDS = 3600;
const cleanText = value => typeof value === 'string' ? value.slice(0,12000).trim() : '';
const loaderError = (message,status=400) => Object.assign(new Error(message),{status});
const webUrl = value => {try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};

export function parsePageUrl(value) {
  if(typeof value!=='string'||value.length>1000||/[\x00-\x20]/.test(value.trim()))throw loaderError('Paste an Instagram profile or Facebook Page link.');
  let url;try{url=new URL(/^https?:\/\//i.test(value.trim())?value.trim():'https://'+value.trim());}catch{throw loaderError('That page link is not valid.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw loaderError('Use a normal Instagram or Facebook page link.');
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  if(['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com','mbasic.facebook.com'].includes(host)){
    let id='';
    if(parts[0]==='profile.php')id=url.searchParams.get('id')||'';
    else if(parts[0]==='ads'&&parts[1]==='library')id=url.searchParams.get('view_all_page_id')||'';
    else if(['people','pages'].includes(parts[0])&&parts.length===3)id=parts[2];
    else if(parts.length===1&&/^\d+$/.test(parts[0]))id=parts[0];
    if(id&&/^\d{5,30}$/.test(id))return {platform:'facebook',pageId:id,alias:'',url:'https://www.facebook.com/'+id};
    const alias=parts[0]||'';
    const reserved=['profile.php','ads','people','pages','groups','watch','reel','reels','share','story.php','photo.php','permalink.php','login','marketplace','events','gaming'];
    if(!reserved.includes(alias.toLowerCase())&&/^[a-z\d.\-_]{2,100}$/i.test(alias)&&(parts.length===1||(parts.length===2&&['about','photos','videos'].includes(parts[1]))))return {platform:'facebook',pageId:'',alias:alias.toLowerCase(),url:'https://www.facebook.com/'+alias.toLowerCase()};
    throw loaderError('Use the Facebook Page link, rather than a post, group, or share link.');
  }
  if(['instagram.com','www.instagram.com','m.instagram.com'].includes(host)){
    const alias=(parts[0]||'').toLowerCase();
    const reserved=['p','reel','reels','stories','explore','accounts','direct','about','developer','developers','tv'];
    if(reserved.includes(alias)||!/^[a-z\d_](?:[a-z\d_.]{0,28}[a-z\d_])?$/i.test(alias)||alias.includes('..')||parts.length>2||(parts.length===2&&!['reels','tagged'].includes(parts[1])))throw loaderError('Use the Instagram profile link, such as instagram.com/slikdesk, rather than a post or reel.');
    return {platform:'instagram',alias,pageId:'',url:'https://www.instagram.com/'+alias+'/'};
  }
  throw loaderError('This link must be an Instagram profile or Facebook Page.');
}

async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createAdStore(db){
  return {
    async get(key){const row=await db.prepare('SELECT value FROM ad_cache WHERE key = ? AND expires_at > ?').bind(key,Date.now()).first();return row?JSON.parse(row.value):null;},
    async put(key,value,seconds=CACHE_SECONDS){await db.prepare('INSERT INTO ad_cache (key,value,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at').bind(key,JSON.stringify(value),Date.now()+seconds*1000).run();},
    async reserve(key,limit){return Boolean(await db.prepare('INSERT INTO ad_budget (key,used) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used').bind(key,limit).first());},
    async lock(key){return Boolean(await db.prepare('INSERT INTO ad_locks (key,expires_at) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE expires_at < ? RETURNING key').bind(key,Date.now()+300000,Date.now()).first());},
    async unlock(key){await db.prepare('DELETE FROM ad_locks WHERE key = ?').bind(key).run();},
    async prune(){await db.batch([db.prepare('DELETE FROM ad_cache WHERE expires_at < ?').bind(Date.now()),db.prepare('DELETE FROM ad_budget WHERE key < ?').bind(new Date(Date.now()-3*86400000).toISOString().slice(0,10)),db.prepare('DELETE FROM ad_locks WHERE expires_at < ?').bind(Date.now())]);}
  };
}

function apiClient(env,store,request=fetch){
  return async params=>{
    const cacheKey='api:'+env.CACHE_NAMESPACE+':'+await hash(JSON.stringify(params));
    const cached=await store.get(cacheKey);if(cached)return cached;
    const dailyLimit=Math.min(200,Math.max(1,Number(env.AD_DAILY_LIMIT)||100));
    if(!await store.reserve(new Date().toISOString().slice(0,10)+':api:'+env.KEY_NAMESPACE,dailyLimit))throw loaderError('Today’s live-search allowance has been reached. Saved results are still available; try again tomorrow.',429);
    let response;try{response=await request('https://www.searchapi.io/api/v1/search',{method:'POST',headers:{Authorization:`Bearer ${env.SEARCHAPI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(params),redirect:'manual',signal:AbortSignal.timeout(65000)});}catch(error){
      console.warn('ad_source_request_failed',String(error.name),String(error.message).replaceAll(env.SEARCHAPI_API_KEY,'[redacted]').slice(0,240));
      throw loaderError('The ad service could not be reached. Your previous captures are safe; try again shortly.',502);
    }
    if([401,403].includes(response.status))throw loaderError('Your SearchApi key was rejected. Reconnect with a valid key.',401);
    if([402,429].includes(response.status))throw loaderError('Your SearchApi account has reached a credit or rate limit.',429);
    if(!response.ok)throw loaderError('The ad service is temporarily unavailable. Please try again shortly.',502);
    let data;try{data=await response.json();}catch{throw loaderError('The ad service returned an unreadable response. Please try again.',502);}
    if(params.engine==='meta_ad_library'&&data.error==="Meta Ad Library didn't return any results.")return {ads:[]};
    if(params.engine==='meta_ad_library_page_search'&&data.error==="Meta Ad Library Page Search API didn't return any results.")return {page_results:[]};
    if(data.error||String(data.search_metadata?.status).toLowerCase()!=='success')throw loaderError('The ad service could not complete this search. Try another page or try again later.',502);
    // Never return provider request metadata or credential-bearing URLs to visitors.
    if(JSON.stringify(data).includes(env.SEARCHAPI_API_KEY))throw loaderError('The ad service response could not be safely saved.',502);
    const {search_metadata,search_parameters,...results}=data;
    await store.put(cacheKey,results);return results;
  };
}

function metaMedia(snapshot){
  const result=[];
  for(const item of [...(snapshot.videos||[]),...(snapshot.images||[]),...(snapshot.cards||[])]){
    const video=webUrl(item.video_hd_url||item.video_sd_url),image=webUrl(item.original_image_url||item.resized_image_url||item.image_url);
    const preview=webUrl(item.video_preview_image_url)||image;
    if(video||image)result.push({type:video?'video':'image',url:video||image,preview,title:cleanText(item.title),body:cleanText(item.body?.text||item.body)});
  }
  return result;
}
export function normalizeMetaAd(row,page,capturedAt){
  if(String(row.page_id)!==page.pageId||!/^\d+$/.test(String(row.ad_archive_id)))return null;
  const s=row.snapshot||{},media=metaMedia(s),id=String(row.ad_archive_id);
  return {id,pageId:page.pageId,brand:page.name,advertiser:cleanText(row.page_name)||page.name,logoUrl:webUrl(s.page_profile_picture_url),body:cleanText(s.body?.text||s.body),title:cleanText(s.title),cta:cleanText(s.cta_text),landingUrl:webUrl(s.link_url),sourceUrl:'https://www.facebook.com/ads/library/?id='+id,profileUrl:page.profileUrl,isActive:typeof row.is_active==='boolean'?row.is_active:null,startDate:row.start_date||null,endDate:row.end_date||null,platforms:Array.isArray(row.publisher_platform)?row.publisher_platform.map(v=>String(v).toLowerCase()):[],media,format:media.some(m=>m.type==='video')?'video':media.length?'image':'text',capturedAt};
}
async function resolveFacebook(input,api){
  if(input.pageId)return {pageId:input.pageId,name:'Facebook Page '+input.pageId,profileUrl:input.url};
  const data=await api({engine:'meta_ad_library_page_search',q:input.alias,country:'ALL'});
  const exact=(data.page_results||[]).filter(p=>cleanText(p.page_alias).toLowerCase()===input.alias);
  if(exact.length===1)return {pageId:String(exact[0].page_id),name:cleanText(exact[0].name),profileUrl:input.url};
  const resolved=await api({engine:'facebook_business_page',url:input.url});
  const page=resolved.page;
  if(!page?.id||!/^\d+$/.test(String(page.id)))throw loaderError('That Facebook Page could not be found. Try its numeric Page link from the Meta Ad Library.',404);
  return {pageId:String(page.id),name:cleanText(page.name)||input.alias,profileUrl:webUrl(page.link)||input.url};
}

async function resolveInstagram(input,api,selection){
  const data=await api({engine:'meta_ad_library_page_search',q:input.alias,country:'ALL'});
  const exact=[...new Map((data.page_results||[]).filter(p=>cleanText(p.ig_username).replace(/^@/,'').toLowerCase()===input.alias&&/^\d{5,30}$/.test(String(p.page_id))).map(p=>[String(p.page_id),p])).values()];
  if(!exact.length)throw loaderError('We couldn’t find a Meta advertiser linked to @'+input.alias+'. Try the advertiser’s Facebook Page link instead.',404);
  if(selection&&!exact.some(p=>String(p.page_id)===selection))throw loaderError('That advertiser selection no longer matches this Instagram profile. Load the link again.');
  if(exact.length>1&&!selection)return {candidates:exact.map(p=>({pageId:String(p.page_id),name:cleanText(p.name),profileUrl:'https://www.facebook.com/'+p.page_id})),message:'This Instagram handle is linked to more than one advertiser page. Choose the page you want to track.'};
  const p=selection?exact.find(p=>String(p.page_id)===selection):exact[0];
  return {pageId:String(p.page_id),name:cleanText(p.name)||input.alias,profileUrl:'https://www.facebook.com/'+p.page_id,instagramUrl:input.url};
}

function makeSnapshot(input,country,page,ads,coverage,adPlatform,capturedAt,activeStatus){
  const watchlist=input.query?[...new Map(ads.map(a=>[a.pageId,{pageId:a.pageId,name:a.advertiser}])).values()]:[{pageId:page.pageId,name:page.name}];
  const config={watchlist,country,maxPages:2,activeStatus,adType:'all',sortBy:'most_recent',platform:input.platform,adPlatform,...(input.query?{query:input.query}:{})};
  return {id:crypto.randomUUID(),mode:'live',engine:'meta_ad_library',capturedAt,finishedAt:new Date().toISOString(),config,scopeKey:JSON.stringify(['meta',input.query?['keyword',input.query]:page.pageId,country,activeStatus,adPlatform,2]),coverage:[coverage],ads,status:coverage.status==='partial'?'partial':'ready',pageUrl:input.url||'',advertiserUrl:page.profileUrl,matchMethod:input.query?'keyword':input.platform==='instagram'?'instagram-handle':'page-id'};
}

export async function collectPage(input,country,api,adPlatform='all',selection='',activeStatus='active'){
  if(!['active','inactive','all'].includes(activeStatus))throw loaderError('Choose a supported ad status.');
  if(!['facebook','instagram','both','auto','all'].includes(adPlatform))throw loaderError('Choose Instagram, Facebook, or both for the ads shown on filter.');
  adPlatform=adPlatform==='auto'?input.platform:adPlatform;
  const platforms=adPlatform==='both'?['facebook','instagram']:[adPlatform];
  const capturedAt=new Date().toISOString();
  const page=input.query?{pageId:'',name:input.query,profileUrl:''}:input.platform==='instagram'?await resolveInstagram(input,api,selection):await resolveFacebook(input,api);
  if(page.candidates)return page;
  const ads=new Map(),coverage={pageId:page.pageId,name:page.name,pages:0,returned:0,duplicates:0,skipped:0,filtered:0,unique:0,status:'complete'};
  let token='';const tokens=new Set();
  for(let i=0;i<2;i++){
    let data;try{data=await api({engine:'meta_ad_library',...(input.query?{q:input.query}:{page_id:page.pageId}),country,active_status:activeStatus,ad_type:'all',sort_by:'most_recent',...(adPlatform==='all'?{}:{platforms:platforms.join(',')}),...(token?{next_page_token:token}:{})});}catch(error){if(!coverage.pages)throw error;coverage.status='partial';coverage.error=error.message;break;}
    if(data.ads===undefined)data.ads=[];
    if(!Array.isArray(data.ads))throw loaderError('The ad library did not return a valid ad collection. Try again later.',502);
    coverage.pages++;coverage.returned+=data.ads.length;
    for(const row of data.ads){
      const advertiser=input.query&&/^\d{5,30}$/.test(String(row.page_id))?{pageId:String(row.page_id),name:cleanText(row.page_name)||'Meta advertiser',profileUrl:'https://www.facebook.com/'+row.page_id}:page;
      const ad=normalizeMetaAd(row,advertiser,capturedAt);
      if(!ad||!ad.platforms.length){coverage.skipped++;continue;}
      if(adPlatform!=='all'&&!platforms.some(p=>ad.platforms.includes(p))){coverage.filtered++;continue;}
      if(ads.has(ad.id))coverage.duplicates++;else ads.set(ad.id,ad);
    }
    token=data.pagination?.next_page_token;
    if(!token)break;
    coverage.status='bounded';if(tokens.has(token))break;tokens.add(token);
  }
  if(!token&&coverage.status!=='partial')coverage.status='complete';
  if(coverage.skipped)coverage.status='partial';coverage.unique=ads.size;
  if(ads.size&&page.name.startsWith('Facebook Page ')){page.name=ads.values().next().value.advertiser;coverage.name=page.name;}
  return {snapshot:makeSnapshot(input,country,page,[...ads.values()],coverage,adPlatform,capturedAt,activeStatus)};
}

export async function handleAdLoader(request,env,{store=env.DB&&createAdStore(env.DB),upstream=fetch,agentOwner=null}={}){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const json=(data,status=200)=>Response.json(data,{status,headers});
  try{
    if(request.method!=='POST')return json({error:'Use the page-link form to load ads.'},405);
    if(!agentOwner&&(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))throw loaderError('Load ads from this site’s page-link form.',403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw loaderError('Send a JSON page-link request.',415);
    if(Number(request.headers.get('Content-Length'))>4096)throw loaderError('That request is too large.',413);
    const reader=request.body?.getReader();let raw='',bytes=0;const decoder=new TextDecoder();
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw loaderError('That request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
    let body;try{body=JSON.parse(raw+decoder.decode());}catch{throw loaderError('That request could not be read.');}
    const query=body.query===undefined?'':typeof body.query==='string'?body.query.trim():null;
    if(query===null||query.length>200||(body.query!==undefined&&!query)||query&&body.url)throw loaderError('Enter a keyword of up to 200 characters, or a profile link.');
    const input=query?{query,platform:'keyword'}:parsePageUrl(body.url),country=body.country||'ALL',selection=body.pageId||'',adPlatform=body.adPlatform||'all',activeStatus=body.activeStatus||'active';
    if(!['active','inactive','all'].includes(activeStatus)||(query&&adPlatform==='auto'))throw loaderError('Choose a supported search scope.');
    if(!AD_COUNTRIES.has(country)||typeof selection!=='string'||(selection&&!/^\d{5,30}$/.test(selection))||!['auto','facebook','instagram','both','all'].includes(adPlatform))throw loaderError('Choose a supported country and advertiser.');
    const owner=agentOwner||await libraryOwner(request);if(!owner)throw loaderError('Enable cookies and reopen the app before searching.',401);
    const keyValue=ownKey(request);if(!store||!env.DB)throw loaderError('Search storage is unavailable.',503);
    const keyNamespace=await hash(keyValue);env={...env,SEARCHAPI_API_KEY:keyValue,KEY_NAMESPACE:keyNamespace,CACHE_NAMESPACE:owner+':'+keyNamespace};
    const key='capture:meta-v4:'+env.CACHE_NAMESPACE+':'+await hash(JSON.stringify([input.url||['keyword',query],country,adPlatform==='auto'?input.platform:adPlatform,selection,activeStatus]));
    const cached=await store.get(key);if(cached){if(cached.snapshot)await retainOwnedCapture(env.DB,owner,cached.snapshot);return json({...cached,cached:true});}
    if(!await store.lock(key))throw loaderError('This page is already loading. Please try again in a moment.',409);
    try{
      const ip=owner;
      const bucket=new Date().toISOString().slice(0,13)+':visitor:'+await hash(ip);
      if(!await store.reserve(bucket,20))throw loaderError('You’ve loaded several pages recently. Please wait an hour before starting another search.',429);
      await store.prune();
      const result=await collectPage(input,country,apiClient(env,store,upstream),adPlatform,selection,activeStatus);
      const value={...result,cacheUntil:new Date(Date.now()+CACHE_SECONDS*1000).toISOString()};
      if(result.snapshot)await retainOwnedCapture(env.DB,owner,result.snapshot);
      await store.put(key,value,result.snapshot?.status==='partial'?60:CACHE_SECONDS);
      return json({...value,cached:false});
    }finally{await store.unlock(key);}
  }catch(error){return json({error:error.status?error.message:'The page could not be loaded. Your saved captures are safe; please try again.'},error.status||500);}
}
