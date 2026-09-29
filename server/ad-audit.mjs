import {libraryOwner} from './ad-collections.mjs';
import {ownedCapture} from './owned-captures.mjs';
import {accessError,readBody,privateReply,requireSameOrigin,digest} from './access-utils.mjs';
import {createAdStore} from './ad-loader.mjs';
import {advertisedLink} from '../public/advertised-link.js';

// No arbitrary URL input: only destinations belonging to the visitor's capture.
// DNS is checked for every redirect; the Node preview additionally pins this
// checked address at connection time (see public-fetch.mjs).
export function publicIPv4(ip){
 if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))return false;
 const [a,b,c,d]=ip.split('.').map(Number);
 return [a,b,c,d].every(n=>n<=255)&&a>0&&a<224&&![10,127].includes(a)&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2||b===88&&c===99))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
}
export function auditUrl(value){
 const link=advertisedLink(value);if(!link)throw accessError('Destination unavailable or incomplete.');
 const u=new URL(link.href);
 if(!['http:','https:'].includes(u.protocol)||u.port||!u.hostname.includes('.')||u.hostname.endsWith('.')||u.hostname.includes(':')||/^\d+(\.\d+)*$/.test(u.hostname)||/\.(local|localhost|internal|test|invalid|example|onion)$/i.test(u.hostname))throw accessError('Only public website destinations can be checked.');
 u.hash='';return u;
}
async function resolvePublic(host,upstream){
 const response=await upstream('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type:'A'}),{headers:{Accept:'application/dns-json'},redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('DNS lookup unavailable.');
 const data=await response.json(),addresses=(data.Answer||[]).filter(a=>a.type===1).map(a=>a.data);
 if(data.Status!==0||!addresses.length||!addresses.every(publicIPv4))throw Error('Destination is not a supported public website.');
 return addresses;
}
async function htmlText(response){
 const reader=response.body?.getReader();if(!reader)return {html:'',truncated:false};
 const decoder=new TextDecoder();let html='',size=0;
 while(true){const {done,value}=await reader.read();if(done)break;const remaining=512000-size;size+=value.byteLength;if(size>512000){html+=decoder.decode(value.subarray(0,remaining));await reader.cancel();return {html,truncated:true};}html+=decoder.decode(value,{stream:true});}
 return {html:html+decoder.decode(),truncated:false};
}
function plain(value){return value.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g,m=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[m])).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/\s+/g,' ').trim();}
export function pageSignals(html,status){
 const title=plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,300);
 const headings=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>plain(m[1])).join(' ').slice(0,1000);
 const missing=/(\b404\b|page (?:was )?not found|p[aá]gina n[aã]o encontrada|p[aá]gina (?:n[aã]o existe|indispon[ií]vel)|couldn.t find (?:this|that|the) page)/i;
 const flags=[];
 if(status>=400)flags.push(status===404||status===410?'Page unavailable':'HTTP error');
 if(status>=200&&status<300&&missing.test(title+' '+headings))flags.push('Possible soft 404');
 if(!title)flags.push('Missing title');
 return {title,flags};
}
export async function inspectDestination(value,{upstream=fetch,resolveHost,transport}={}){
 let url=auditUrl(value);const original=url.href;
 for(let i=0;i<4;i++){
  const addresses=await (resolveHost||((host)=>resolvePublic(host,upstream)))(url.hostname);
  if(!addresses.length||!addresses.every(publicIPv4))throw Error('Destination is not a supported public website.');
  const options={redirect:'manual',headers:{Accept:'text/html','User-Agent':'AdObservatory-DestinationCheck/1.0'},signal:AbortSignal.timeout(10000)};
  const r=await (transport?transport(url,addresses,options):upstream(url.href,options));
  if(r.status>=300&&r.status<400){await r.body?.cancel();const location=r.headers.get('Location');if(!location)throw Error('Redirect without a destination.');url=auditUrl(new URL(location,url).href);continue;}
  if(!(r.headers.get('Content-Type')||'').toLowerCase().includes('text/html')){await r.body?.cancel();return {url:original,finalUrl:url.href,status:r.status,title:'',flags:[r.status>=400?'HTTP error':'Not an HTML page']};}
  const {html,truncated}=await htmlText(r),signals=pageSignals(html,r.status);
  if(truncated)signals.flags.push('Partial HTML · first 500 KB');
  return {url:original,finalUrl:url.href,status:r.status,...signals};
 }
 throw Error('Too many redirects (maximum 3).');
}
export function markDuplicateTitles(pages){
 const groups=new Map();
 for(const p of pages){if(p.error||!p.title||p.status>=400)continue;const key=p.title.toLocaleLowerCase().replace(/\s+/g,' ').trim();const urls=groups.get(key)||new Set();urls.add(p.finalUrl);groups.set(key,urls);}
 return pages.map(p=>({...p,flags:[...(p.flags||[]),...(p.title&&groups.get(p.title.toLocaleLowerCase().replace(/\s+/g,' ').trim())?.size>1?['Duplicate title']:[])]}));
}
export async function handleAdAudit(request,env,{upstream=fetch,resolveHost,transport=env.AUDIT_TRANSPORT}={}){
 try{
  requireSameOrigin(request);if(request.method!=='POST')throw accessError('Use POST.',405);
  const owner=await libraryOwner(request);if(!owner)throw accessError('Reopen Ad Observatory first.',401);
  if(!env.DB)throw accessError('Destination checks are unavailable.',503);
  const body=await readBody(request),capture=await ownedCapture(env.DB,owner,String(body.captureId||''));
  if(!capture)throw accessError('Capture not found. Sync older captures in Connections first.',404);
  if(!Array.isArray(body.adIds)||!body.adIds.length||body.adIds.length>50||body.adIds.some(id=>typeof id!=='string'))throw accessError('Select up to 50 ads to check (10 unique destinations).');
  const ads=body.adIds.map(id=>capture.ads.find(a=>a.id===id));if(ads.some(a=>!a))throw accessError('Ad not found in this capture.',404);
  const destinations=[...new Set(ads.map(a=>a.landingUrl).filter(Boolean))];
  const store=createAdStore(env.DB),key='audit:v2:'+owner+':'+await digest(JSON.stringify([capture.id,destinations]));
  const cached=await store.get(key);if(cached)return privateReply({...cached,cached:true});
  if(!await store.reserve(new Date().toISOString().slice(0,13)+':audit:'+owner,6))throw accessError('Destination check limit reached. Try again in an hour.',429);
  const pages=[];
  // Two concurrent checks keep this bounded even when destinations time out.
  for(let i=0;i<Math.min(destinations.length,10);i+=2){
   pages.push(...await Promise.all(destinations.slice(i,Math.min(i+2,10)).map(async value=>{try{return await inspectDestination(value,{upstream,resolveHost,transport});}catch(e){return {url:value,status:null,title:'',flags:[],error:e.name==='TimeoutError'?'Page timed out.':e.message};}})));
  }
  const result={checkedAt:new Date().toISOString(),pages:markDuplicateTitles(pages),totalDestinations:destinations.length,skipped:Math.max(0,destinations.length-10),withoutDestination:ads.filter(a=>!a.landingUrl).length};
  await store.put(key,result,3600);return privateReply({...result,cached:false});
 }catch(error){return privateReply({error:error.status?error.message:'Destination checks could not be completed. Try again.'},error.status||503);}
}
