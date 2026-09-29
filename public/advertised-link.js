// Display links independently of the raw source record retained in exports.
export function advertisedLink(value){
 try{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  const dynamic=value=>{let decoded=value;for(let i=0;i<3;i++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}return /\{\{[^]*?\}\}/.test(decoded);};
  if(dynamic(url.hostname)||dynamic(url.pathname))return null;
  const kept=[];let changed=false;
  for(const [key,value] of url.searchParams){
   if(!dynamic(key)&&!dynamic(value)){kept.push([key,value]);continue;}
   // Never drop a dynamic product ID or other potentially functional parameter.
   if(/^utm_[a-z_]+$/i.test(key)&&!dynamic(key))changed=true;
   else return null;
  }
  if(changed)url.search=new URLSearchParams(kept).toString();
  if(dynamic(url.hash))return null;
  return {href:url.href,label:url.host};
 }catch{return null;}
}
