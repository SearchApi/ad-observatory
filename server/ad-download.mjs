import {ownedCapture} from './owned-captures.mjs';
import {libraryOwner} from './ad-collections.mjs';
import {savedCollectionAd} from './ad-collections.mjs';
const DOWNLOAD_LIMIT=100*1024*1024;
const downloadTypes={'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
export async function handleAdDownload(request,env,{upstream=fetch,maxBytes=DOWNLOAD_LIMIT,timeoutMs=45000}={}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 const fail=(error,status)=>Response.json({error},{status,headers});
 if(request.method!=='GET')return fail('Use GET to download an asset.',405);
 const url=new URL(request.url);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin))return fail('Open this download from Ad Observatory.',403);
 const collection=url.searchParams.get('collection'),capture=url.searchParams.get('capture')||'saved',id=url.searchParams.get('ad')||'',index=url.searchParams.get('asset')||'';
 if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(capture)||!/^\d{1,40}$/.test(id)||!/^\d{1,3}$/.test(index))return fail('Choose an asset from an ad.',400);
 try{
  const owner=await libraryOwner(request);
  let snapshot=owner&&env.DB?await ownedCapture(env.DB,owner,capture):null;
  const kind=url.searchParams.get('kind')||'original';
  if(!['original','thumbnail'].includes(kind))return fail('Unknown asset variant.',400);
  const ad=collection?await savedCollectionAd(request,env,collection,id):snapshot?.ads?.find(a=>a.id===id),media=ad?.media?.[Number(index)];
  if(!media)return fail('This saved capture is no longer available for download. Load the advertiser again or open the original ad.',404);
  const expectedType=kind==='thumbnail'?'image':media.type;
  let source;try{source=new URL(kind==='thumbnail'?media.preview:media.url);}catch{return fail('This asset has no downloadable media. Open the original ad.',422);}
  if(source.protocol!=='https:'||source.username||source.password||source.port||!['fbcdn.net','cdninstagram.com'].some(host=>source.hostname===host||source.hostname.endsWith('.'+host)))return fail('This media source is not supported. Open the original ad.',422);
  if(env.DB){
   const visitor=request.headers.get('CF-Connecting-IP')||'local';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(visitor));
   const key=new Date().toISOString().slice(0,13)+':download:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   if(!await env.DB.prepare('INSERT INTO ad_budget (key,used) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used').bind(key,40).first())return fail('Download limit reached. Try again next hour.',429);
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{response=await upstream(source.href,{redirect:'manual',signal:controller.signal,headers:{Accept:expectedType==='video'?'video/*':'image/*'}});}catch{clearTimeout(timer);return fail('The media could not be downloaded. Its source link may have expired. Open the original ad.',502);}
  const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok||!response.body||!downloadTypes[type]||!type.startsWith(expectedType+'/')){clearTimeout(timer);controller.abort();return fail('The media is unavailable or has expired. Open the original ad.',502);}
  if(Number(response.headers.get('Content-Length'))>maxBytes){clearTimeout(timer);controller.abort();return fail('This asset exceeds the 100 MB download limit. Open the original ad.',413);}
  const reader=response.body.getReader();let bytes=0;
  const stream=new ReadableStream({async pull(out){try{const result=await reader.read();if(result.done){clearTimeout(timer);out.close();return;}bytes+=result.value.byteLength;if(bytes>maxBytes)throw Error('Asset exceeds download limit');out.enqueue(result.value);}catch{clearTimeout(timer);controller.abort();reader.cancel().catch(()=>{});out.error(Error('Download interrupted. Try the original ad.'));}},cancel(){clearTimeout(timer);controller.abort();return reader.cancel();}});
  const brand=(ad.advertiser||'advertiser').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'advertiser';
  return new Response(stream,{headers:{...headers,'Content-Type':type,'Content-Disposition':`attachment; filename="${brand}-${id}-${Number(index)+1}${kind==='thumbnail'?'-thumbnail':''}.${downloadTypes[type]}"`}});
 }catch{return fail('Download unavailable. Try again or open the original ad.',502);}
}
