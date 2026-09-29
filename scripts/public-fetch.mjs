import https from 'node:https';
import http from 'node:http';
import {Readable} from 'node:stream';
// Pin the DNS-validated public address, retaining the hostname for TLS/SNI.
export function publicFetch(url,addresses,options){
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',headers:options.headers,signal:options.signal,lookup:(_host,opts,callback)=>opts.all?callback(null,addresses.map(address=>({address,family:4}))):callback(null,addresses[0],4)},res=>{
   const empty=[204,205,304].includes(res.statusCode);
   if(empty)res.resume();
   resolve(new Response(empty?null:Readable.toWeb(res),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([,v])=>typeof v==='string'))}));
  });req.on('error',reject);req.end();
 });
}
