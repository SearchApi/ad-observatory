import {agentOwner} from './ad-access.mjs';
import {accessError,readBody,privateReply} from './access-utils.mjs';
import {ownedCapture,ownedCaptures} from './owned-captures.mjs';
import {handleAdCollections} from './ad-collections.mjs';
import {handleAdLoader,createAdStore} from './ad-loader.mjs';
import {compareSnapshots,filterAds,runningDays} from '../public/model.js';
import {competitorSnapshots,workspaceAds} from '../public/workspace.js';
function page(items,url){
 const number=(key,fallback,max)=>{const raw=url.searchParams.get(key);if(raw===null)return fallback;if(!/^\d+$/.test(raw)||Number(raw)>max)throw accessError('Invalid '+key+'.');return Number(raw);};
 const offset=number('offset',0,100000),limit=number('limit',50,200);if(!limit)throw accessError('Limit must be at least 1.');
 return {items:items.slice(offset,offset+limit),total:items.length,offset,limit,nextOffset:offset+limit<items.length?offset+limit:null};
}
export async function handleAdApi(request,env,{upstream=fetch}={}){
 try{
  const url=new URL(request.url),owner=await agentOwner(request,env),route=url.pathname.slice('/api/v1/'.length);
  if([...url.searchParams.keys()].some(k=>/token|key|secret/i.test(k)))throw accessError('Send credentials in headers, never in URLs.');
  if(!await createAdStore(env.DB).reserve(new Date().toISOString().slice(0,16)+':agent:'+owner,120))throw accessError('Agent request limit reached. Try again in a minute.',429);
  if(route==='search'&&request.method==='POST')return handleAdLoader(request,env,{upstream,agentOwner:owner});
  const collections=route.match(/^collections(?:\/([a-zA-Z0-9-]+)(\/items)?)?$/);
  if(collections&&['GET','POST'].includes(request.method)){
   if(request.method==='GET'){
    if(collections[2])throw accessError('Use GET /collections/:id.',404);
    const target=new URL('/api/ad-collections',url);if(collections[1])target.searchParams.set('collection',collections[1]);
    const response=await handleAdCollections(new Request(target),env,{owner});
    // Keep the agent representation compact and independent of UI membership data.
    const data=await response.json();if(!collections[1])delete data.memberships;
    return privateReply(data,response.status);
   }
   const body=await readBody(request);let payload;
   if(!collections[1])payload={action:'create',name:body.name};
   else if(collections[2]){
    const capture=await ownedCapture(env.DB,owner,String(body.captureId||''));
    const ad=capture?.ads.find(a=>a.id===body.adId);if(!ad)throw accessError('Ad not found in your saved capture.',404);
    payload={action:'save',collection:collections[1],ad};
   }else throw accessError('Use POST /collections/:id/items to save an ad.',405);
   return handleAdCollections(new Request(new URL('/api/ad-collections',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),env,{owner});
  }
  if(request.method!=='GET')throw accessError('Method not allowed.',405);
  const captures=await ownedCaptures(env.DB,owner);
  if(route==='captures')return privateReply(page([...captures].reverse().map(s=>({id:s.id,capturedAt:s.capturedAt,advertiser:s.config.watchlist[0],adCount:s.ads.length,status:s.status,scopeKey:s.scopeKey,provenance:s.provenance,coverage:s.coverage})),url));
  if(route.startsWith('captures/')){const capture=captures.find(s=>s.id===decodeURIComponent(route.slice(9)));if(!capture)throw accessError('Capture not found.',404);return privateReply(capture);}
  if(route==='compare'){
   const before=captures.find(s=>s.id===url.searchParams.get('before')),after=captures.find(s=>s.id===url.searchParams.get('after'));
   if(!before||!after)throw accessError('Choose two of your saved captures.',404);
   return privateReply({...compareSnapshots(before,after),before:before.id,after:after.id});
  }
  if(route==='ads'){
   const captureId=url.searchParams.get('capture');let source;
   if(captureId){const c=captures.find(s=>s.id===captureId);if(!c)throw accessError('Capture not found.',404);source=c.ads;}
   else source=workspaceAds(competitorSnapshots(captures));
   const observations=new Map();for(const s of captures)for(const a of s.ads){const key=a.pageId+':'+a.id;const seen=observations.get(key)||new Set();seen.add(s.capturedAt);observations.set(key,seen);}
   const ads=filterAds(source,{query:url.searchParams.get('q')||'',brand:url.searchParams.get('pageId')||'',format:url.searchParams.get('format')||'',platform:url.searchParams.get('platform')||''});
   return privateReply({...page(ads.map(a=>{const times=[...observations.get(a.pageId+':'+a.id)||[]].sort();return {...a,derived:{runningDays:runningDays(a),assetCount:a.media.length,firstObserved:times[0]||null,lastObserved:times.at(-1)||null,observationCount:times.length}};}),url),basis:'Latest capture per advertiser unless capture is specified. Derived fields describe saved observations, not performance or continuous delivery.'});
  }
  throw accessError('Endpoint not found.',404);
 }catch(error){return privateReply({error:error.status?error.message:'The agent request could not be completed.'},error.status||503);}
}
