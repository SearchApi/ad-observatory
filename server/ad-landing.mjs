import {ownedCapture} from './owned-captures.mjs';
import {libraryOwner} from './ad-collections.mjs';
import {savedCollectionAd} from './ad-collections.mjs';
const metaHosts=new Set(['fb.me','www.fb.me','l.facebook.com','lm.facebook.com','facebook.com','www.facebook.com']);
function webUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;return u;}catch{return null;}}
export async function resolveLanding(value,upstream=fetch){
 let current=webUrl(value);if(!current)return null;
 for(let i=0;i<5;i++){
  if(!metaHosts.has(current.hostname))return current.href;
  if(current.port)return null;
  if(['facebook.com','www.facebook.com'].includes(current.hostname)&&!['/ads/redirect/','/l.php'].includes(current.pathname))return null;
  const wrapped=current.searchParams.get('u');
  if(wrapped&&['l.facebook.com','lm.facebook.com','facebook.com','www.facebook.com'].includes(current.hostname)){current=webUrl(wrapped);if(!current)return null;continue;}
  const response=await upstream(current.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000)});
  await response.body?.cancel();
  const location=response.headers.get('location');
  if(response.status<300||response.status>=400||!location)return null;
  current=webUrl(new URL(location,current).href);if(!current)return null;
 }
 return current&&!metaHosts.has(current.hostname)?current.href:null;
}
export async function handleAdLanding(request,env,{upstream=fetch}={}){
 const url=new URL(request.url),headers={'Cache-Control':'no-store'};
 if(request.method!=='GET')return Response.json({error:'Use GET.'},{status:405,headers});
 if(request.headers.get('Sec-Fetch-Site')==='cross-site')return Response.json({error:'Open the ad detail first.'},{status:403,headers});
 const collection=url.searchParams.get('collection'),capture=url.searchParams.get('capture')||'saved',id=url.searchParams.get('ad')||'';
 if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(capture)||!/^\d{1,40}$/.test(id))return Response.json({error:'Invalid ad.'},{status:400,headers});
 try{
  const owner=await libraryOwner(request);
  let snapshot=owner&&env.DB?await ownedCapture(env.DB,owner,capture):null;
  const original=(collection?await savedCollectionAd(request,env,collection,id):snapshot?.ads?.find(a=>a.id===id))?.landingUrl;
  if(!original)return Response.json({url:null,resolved:false},{headers});
  const key='landing:'+(collection||capture)+':'+id;
  const cached=env.DB?await env.DB.prepare('SELECT value FROM ad_cache WHERE key = ? AND expires_at > ?').bind(key,Date.now()).first():null;
  if(cached)return Response.json(JSON.parse(cached.value),{headers});
  let target;try{target=await resolveLanding(original,upstream);}catch{}
  const result={url:target||original,original,resolved:!!target&&target!==original};
  if(env.DB)await env.DB.prepare('INSERT INTO ad_cache (key,value,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at').bind(key,JSON.stringify(result),Date.now()+(target?86400000:300000)).run();
  return Response.json(result,{headers});
 }catch{return Response.json({url:null,resolved:false},{headers});}
}
