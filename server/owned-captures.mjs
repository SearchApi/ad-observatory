import {collectionAd} from './ad-collections.mjs';
import {accessError} from './access-utils.mjs';
export async function retainOwnedCapture(db,owner,snapshot,provenance='search'){
 await db.prepare('INSERT INTO owned_captures (owner,id,page_id,captured_at,value,provenance) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING').bind(owner,snapshot.id,snapshot.config.query?'':snapshot.config.watchlist[0].pageId,snapshot.capturedAt,JSON.stringify(snapshot),provenance).run();
 await db.prepare('DELETE FROM owned_captures WHERE owner=? AND id NOT IN (SELECT id FROM owned_captures WHERE owner=? ORDER BY captured_at DESC,id DESC LIMIT 100)').bind(owner,owner).run();
}
export async function ownedCaptures(db,owner){
 const {results}=await db.prepare('SELECT value,provenance FROM owned_captures WHERE owner=? ORDER BY captured_at,id').bind(owner).all();
 return results.map(r=>({...JSON.parse(r.value),provenance:r.provenance}));
}
export async function ownedCapture(db,owner,id){
 const row=await db.prepare('SELECT value,provenance FROM owned_captures WHERE owner=? AND id=?').bind(owner,id).first();
 return row?{...JSON.parse(row.value),provenance:row.provenance}:null;
}
export function importedCapture(s){
 const page=s?.config?.watchlist?.[0],c=s?.config;
 if(c?.query!==undefined){
  if(typeof c.query!=='string'||!c.query.trim()||c.query.length>200||!s||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(s.id||'')||!Number.isFinite(Date.parse(s.capturedAt))||!Array.isArray(s.ads)||s.ads.length>200||!Array.isArray(c.watchlist)||!Array.isArray(s.coverage)||!['ready','partial'].includes(s.status))throw accessError('Invalid keyword capture.');
  if(!['US','ALL','GB','CA','AU','BR','DE','FR','IN'].includes(c.country)||!['all','both','facebook','instagram'].includes(c.adPlatform)||!['active','inactive','all'].includes(c.activeStatus)||c.maxPages!==2)throw accessError('Unsupported keyword capture scope.');
  const ads=s.ads.map(collectionAd);if(ads.some(a=>!/^\d{5,30}$/.test(a.pageId)))throw accessError('Invalid advertiser in keyword capture.');
  const coverage=s.coverage.slice(0,1).map(v=>({pageId:'',name:c.query,status:['complete','bounded','partial'].includes(v?.status)?v.status:'partial',...Object.fromEntries(['pages','returned','duplicates','skipped','filtered','unique'].map(k=>[k,Number.isSafeInteger(v?.[k])&&v[k]>=0?v[k]:0]))}));
  if(!coverage.length)throw accessError('Capture coverage is missing.');
  const config={watchlist:[...new Map(ads.map(a=>[a.pageId,{pageId:a.pageId,name:a.advertiser}])).values()],query:c.query,country:c.country,adPlatform:c.adPlatform,activeStatus:c.activeStatus,maxPages:2};
  return {id:s.id,mode:'live',engine:'meta_ad_library',capturedAt:s.capturedAt,finishedAt:s.capturedAt,pageUrl:'',ads,coverage,status:s.status,config,scopeKey:JSON.stringify(['meta',['keyword',c.query],c.country,c.activeStatus,c.adPlatform,2])};
 }
 if(!s||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(s.id||'')||!Number.isFinite(Date.parse(s.capturedAt))||!Array.isArray(s.ads)||s.ads.length>200||c?.watchlist?.length!==1||!/^\d{5,30}$/.test(page?.pageId||'')||typeof page.name!=='string'||!Array.isArray(s.coverage)||!['ready','partial'].includes(s.status))throw accessError('Invalid saved capture.');
 const adPlatform=c.adPlatform||'unknown';
 if(!['US','ALL','GB','CA','AU','BR','DE','FR','IN'].includes(c.country)||!['all','both','facebook','instagram','unknown'].includes(adPlatform)||!['active','inactive','all'].includes(c.activeStatus)||c.maxPages!==2)throw accessError('Unsupported saved capture scope.');
 const ads=s.ads.map(collectionAd);if(ads.some(a=>a.pageId!==page.pageId))throw accessError('Saved ads do not match this advertiser.');
 const pageUrl=typeof s.pageUrl==='string'?s.pageUrl:'';if(!/^https:\/\/(www\.)?(instagram|facebook)\.com\//.test(pageUrl))throw accessError('Unsupported advertiser link.');
 const coverage=s.coverage.filter(v=>v&&v.pageId===page.pageId).slice(0,1).map(v=>({pageId:page.pageId,name:page.name.slice(0,160),status:['complete','bounded','partial'].includes(v.status)?v.status:'partial',...Object.fromEntries(['pages','returned','duplicates','skipped','filtered','unique'].map(k=>[k,Number.isSafeInteger(v[k])&&v[k]>=0?v[k]:0]))}));
 if(!coverage.length)throw accessError('Capture coverage is missing.');
 return {id:s.id,mode:'live',engine:'meta_ad_library',capturedAt:s.capturedAt,finishedAt:typeof s.finishedAt==='string'&&Number.isFinite(Date.parse(s.finishedAt))?s.finishedAt:s.capturedAt,pageUrl,ads,coverage,status:s.status,config:{watchlist:[{pageId:page.pageId,name:page.name.slice(0,160)}],country:c.country,adPlatform,activeStatus:c.activeStatus,maxPages:2},scopeKey:adPlatform==='unknown'?JSON.stringify(['meta-legacy-unverified',s.id]):JSON.stringify(['meta',page.pageId,c.country,c.activeStatus,adPlatform,2])};
}
