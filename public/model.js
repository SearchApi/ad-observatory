export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(value,media=false){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';if(media&&(u.protocol!=='https:'||!['fbcdn.net','cdninstagram.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))))return '';return u.href;}catch{return '';}}
export function compareSnapshots(before,after){
 if(!before||!after)return {available:false,reason:'Save a second snapshot to compare observations.'};
 if(before.id===after.id||Date.parse(before.capturedAt)>=Date.parse(after.capturedAt))return {available:false,reason:'Choose an earlier baseline and a later snapshot.'};
 if(before.scopeKey!==after.scopeKey)return {available:false,reason:'These snapshots use different watchlists or collection settings. Choose matching scopes.'};
 if(before.status!=='ready'||after.status!=='ready')return {available:false,reason:'One capture is incomplete because of errors or skipped records. Choose two successful captures.'};
 const old=new Set(before.ads.map(a=>a.id)),current=new Set(after.ads.map(a=>a.id));
 return {available:true,added:after.ads.filter(a=>!old.has(a.id)),retained:after.ads.filter(a=>old.has(a.id)),missing:before.ads.filter(a=>!current.has(a.id)),bounded:[...before.coverage,...after.coverage].some(c=>c.status==='bounded')};
}
export function filterAds(ads,{query='',brand='',format='',platform='',sort='recent'}={}){
 const q=query.trim().toLowerCase(),brands=Array.isArray(brand)?brand:brand?[brand]:[];
 return ads.filter(a=>(!q||[a.body,a.title,a.advertiser,a.id,a.cta].join(' ').toLowerCase().includes(q))&&(!brands.length||brands.includes(a.pageId))&&(!format||a.format===format)&&(!platform||a.platforms.includes(platform))).sort((a,b)=>sort==='brand'?a.advertiser.localeCompare(b.advertiser):(Date.parse(b.startDate)||0)-(Date.parse(a.startDate)||0));
}
export function adsCsv(ads){
 const fields=['id','advertiser','pageId','body','format','isActive','startDate','capturedAt','sourceUrl'];
 const cell=v=>{let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/u.test(s.normalize('NFKC')))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\ufeff'+[fields.join(','),...ads.map(a=>fields.map(k=>cell(a[k])).join(','))].join('\r\n');
}

const normalizedCopy=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
function mediaIdentity(media){
 const url=safeUrl(media?.url,true);
 if(!url||!['video','image'].includes(media?.type))return null;
 // Meta's CDN hosts and signed query strings can change for the same source asset.
 return [media.type,new URL(url).pathname];
}
export function creativeKey(ad){
 const media=Array.isArray(ad.media)?ad.media:[];
 const identities=media.map(mediaIdentity);
 if(!media.length||identities.some(value=>!value))return JSON.stringify(['unmatched',ad.pageId,ad.id]);
 return JSON.stringify(['creative',ad.pageId,normalizedCopy(ad.body),normalizedCopy(ad.title),normalizedCopy(ad.cta),media.map((m,i)=>[...identities[i],normalizedCopy(m.body),normalizedCopy(m.title)])]);
}
export function groupAds(ads,mode='creative'){
 const groups=new Map();
 for(const ad of ads){
  const copy=normalizedCopy(ad.body);
  const key=mode==='ads'?JSON.stringify(['ad',ad.pageId,ad.id]):mode==='message'&&copy.length>=20?JSON.stringify(['message',ad.pageId,copy]):creativeKey(ad);
  if(!groups.has(key))groups.set(key,{id:ad.id,representative:ad,ads:[],matchKind:mode==='message'&&copy.length>=20?'message':mode==='ads'?'ad':'creative'});
  groups.get(key).ads.push(ad);
 }
 return [...groups.values()].map(group=>{
  const activities=new Set(group.ads.map(ad=>ad.isActive));
  const startDates=[...new Set(group.ads.map(ad=>ad.startDate).filter(d=>Number.isFinite(Date.parse(d))))].sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {...group,creativeCount:new Set(group.ads.map(creativeKey)).size,platforms:[...new Set(group.ads.flatMap(ad=>ad.platforms||[]))],startDates,activity:activities.size>1?'Mixed activity':activities.has(true)?'Active':activities.has(false)?'Inactive':'Unknown'};
 });
}
export function groupedAdsCsv(groups){
 const fields=['creative_group','grouping','ads_in_group','creative_variants','id','advertiser','pageId','body','format','isActive','startDate','capturedAt','sourceUrl'];
 const cell=value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/u.test(s.normalize('NFKC')))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=groups.flatMap((g,i)=>g.ads.map(ad=>({...ad,creative_group:i+1,grouping:g.matchKind,ads_in_group:g.ads.length,creative_variants:g.creativeCount})));
 return '\ufeff'+[fields.join(','),...rows.map(ad=>fields.map(key=>cell(ad[key])).join(','))].join('\r\n');
}

// Duration is anchored to each saved observation, never today's date.
export function runningDays(ad){
 if(ad.isActive!==true)return null;
 const start=Date.parse(ad.startDate),captured=Date.parse(ad.capturedAt);
 if(!Number.isFinite(start)||!Number.isFinite(captured)||start>captured)return null;
 return Math.floor((captured-start)/86400000);
}
export function groupRunningDays(group){
 const days=group.ads.map(runningDays).filter(value=>value!==null);
 return days.length?Math.max(...days):null;
}
export function sortByLongevity(groups){
 return [...groups].sort((a,b)=>(groupRunningDays(b)??-1)-(groupRunningDays(a)??-1));
}
