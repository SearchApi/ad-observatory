import {collectionObservation} from '../public/observations.js';
const cookieName='ad-observatory-library';
export async function libraryOwner(request){
 const token=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!/^[a-f0-9]{64}$/.test(token||''))return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
const collectionName=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,81):'';
export function collectionAd(value){
 if(!value||typeof value.id!=='string'||!/^\d{1,40}$/.test(value.id||'')||typeof value.advertiser!=='string'||!Array.isArray(value.media))throw Error('Choose an ad to save.');
 const ad={};for(const key of ['id','pageId','brand','advertiser','body','title','cta','startDate','endDate','capturedAt'])ad[key]=typeof value[key]==='string'?value[key].slice(0,key==='body'?16000:1000):null;
 const url=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 for(const key of ['landingUrl','sourceUrl','profileUrl','logoUrl'])ad[key]=url(value[key]);
 ad.isActive=typeof value.isActive==='boolean'?value.isActive:null;
 ad.platforms=Array.isArray(value.platforms)?value.platforms.filter(p=>typeof p==='string').slice(0,12).map(p=>p.slice(0,40)):[];
 ad.media=value.media.slice(0,20).filter(m=>m&&['image','video'].includes(m.type)).map(m=>({type:m.type,url:url(m.url),preview:url(m.preview)}));
 ad.format=ad.media.some(m=>m.type==='video')?'video':ad.media.length?'image':'text';
 return ad;
}
export async function savedCollectionAd(request,env,collection,id){
 const owner=await libraryOwner(request);if(!owner||!env.DB)return null;
 const row=await env.DB.prepare('SELECT i.value FROM ad_collection_items i JOIN ad_collections c ON c.id=i.collection_id WHERE c.id=? AND c.owner=? AND c.archived=0 AND i.ad_id=? AND i.removed=0').bind(collection,owner,id).first();
 return row?JSON.parse(row.value):null;
}
export async function handleAdCollections(request,env,{owner:trustedOwner=null}={}){
 const headers={'Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
 const reply=(data,status=200)=>Response.json(data,{status,headers});
 if(!env.DB)return reply({error:'Collections are temporarily unavailable. Please try again.'},503);
 const url=new URL(request.url);
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
 if(!trustedOwner&&(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.method==='POST'&&request.headers.get('Origin')!==url.origin)))return reply({error:'Open collections from Ad Observatory.'},403);
 try{
  let owner=trustedOwner||await libraryOwner(request);
  if(!owner){
   if(request.method!=='GET')return reply({error:'Enable cookies and reopen Collections before saving.'},401);
   const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
   headers['Set-Cookie']=`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`;
   const copy=new Request(request);copy.headers.set('Cookie',cookieName+'='+token);owner=await libraryOwner(copy);
  }
  if(request.method==='POST'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Use JSON.'},415);
   // Bound input before parsing or storing ad data.
   if(Number(request.headers.get('Content-Length'))>100000)return reply({error:'This ad is too large to save.'},413);
   const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder();
   if(reader)while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>100000){await reader.cancel();return reply({error:'This ad is too large to save.'},413);}text+=decoder.decode(r.value,{stream:true});}
   let body;try{body=JSON.parse(text+decoder.decode());}catch{return reply({error:'Invalid collection request.'},400);}
   if(!body||typeof body!=='object')return reply({error:'Invalid collection request.'},400);
   const now=new Date().toISOString();
   if(body.action==='create'){
    const name=collectionName(body.name);if(!name||name.length>80)return reply({error:'Give the collection a name of up to 80 characters.'},400);
    const id=crypto.randomUUID();
    const result=await env.DB.prepare('INSERT INTO ad_collections (id,owner,name,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM ad_collections WHERE owner=? AND archived=0)<50 RETURNING id').bind(id,owner,name,now,now,owner).first();
    if(!result)return reply({error:'You can keep up to 50 collections.'},409);
    return reply({id},201);
   }
   const collection=typeof body.collection==='string'?body.collection:'';
   const row=await env.DB.prepare('SELECT id FROM ad_collections WHERE id=? AND owner=? AND archived=0').bind(collection,owner).first();
   if(!row)return reply({error:'Collection not found.'},404);
   if(body.action==='rename'){
    const name=collectionName(body.name);if(!name||name.length>80)return reply({error:'Give the collection a name of up to 80 characters.'},400);
    await env.DB.prepare('UPDATE ad_collections SET name=?,updated_at=? WHERE id=? AND owner=?').bind(name,now,collection,owner).run();
   }else if(body.action==='save'){
    let ad;try{ad=collectionAd(body.ad);}catch(error){return reply({error:error.message},400);}
    const captures=await env.DB.prepare('SELECT value FROM owned_captures WHERE owner=?').bind(owner).all();
    const origin=captures.results.map(r=>JSON.parse(r.value)).find(s=>s.capturedAt===ad.capturedAt&&s.ads.some(a=>a.id===ad.id&&a.pageId===ad.pageId));
    if(origin)ad.observationScope=origin.scopeKey;
    const saved=await env.DB.prepare('INSERT INTO ad_collection_items (collection_id,ad_id,value,saved_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ad_collection_items WHERE collection_id=? AND removed=0)<200 OR EXISTS(SELECT 1 FROM ad_collection_items WHERE collection_id=? AND ad_id=? AND removed=0) ON CONFLICT(collection_id,ad_id) DO UPDATE SET value=excluded.value,removed=0 RETURNING ad_id').bind(collection,ad.id,JSON.stringify(ad),now,collection,collection,ad.id).first();
    if(!saved)return reply({error:'This collection is full (200 ads). Create another collection.'},409);
    await env.DB.prepare('UPDATE ad_collections SET updated_at=? WHERE id=? AND owner=?').bind(now,collection,owner).run();
   }else if(body.action==='remove'){
    await env.DB.prepare('UPDATE ad_collection_items SET removed=1 WHERE collection_id=? AND ad_id=?').bind(collection,String(body.adId||'')).run();
   }else return reply({error:'Unknown collection action.'},400);
   return reply({ok:true});
  }
  const collection=url.searchParams.get('collection');
  if(collection){
   const row=await env.DB.prepare('SELECT id,name FROM ad_collections WHERE id=? AND owner=? AND archived=0').bind(collection,owner).first();
   if(!row)return reply({error:'Collection not found.'},404);
   const {results}=await env.DB.prepare('SELECT value,saved_at FROM ad_collection_items WHERE collection_id=? AND removed=0 ORDER BY saved_at DESC,ad_id').bind(collection).all();
   const captures=await env.DB.prepare('SELECT value FROM owned_captures WHERE owner=?').bind(owner).all();
   const observations=captures.results.map(r=>JSON.parse(r.value));
   return reply({...row,items:results.map(item=>{const ad=JSON.parse(item.value);return {ad,savedAt:item.saved_at,observation:collectionObservation(ad,observations)};})});
  }
  const {results}=await env.DB.prepare('SELECT c.id,c.name,c.created_at,c.updated_at,COUNT(i.ad_id) AS count FROM ad_collections c LEFT JOIN ad_collection_items i ON i.collection_id=c.id AND i.removed=0 WHERE c.owner=? AND c.archived=0 GROUP BY c.id ORDER BY c.updated_at DESC,c.id').bind(owner).all();
  const memberships=await env.DB.prepare('SELECT i.ad_id,i.collection_id FROM ad_collection_items i JOIN ad_collections c ON c.id=i.collection_id WHERE c.owner=? AND c.archived=0 AND i.removed=0').bind(owner).all();
  return reply({collections:results,memberships:memberships.results});
 }catch{console.warn('collection_request_failed');return reply({error:'Collections could not be saved or loaded. Please try again.'},503);}
}
