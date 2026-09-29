import http from 'node:http';
import {readFile,stat,mkdir,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Readable} from 'node:stream';
import worker from '../server/worker.mjs';
import {publicFetch} from './public-fetch.mjs';
import {previewDatabase} from './sqlite-store.mjs';

const port=Number(process.env.PORT||5190);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be between 1 and 65535.');
const origin=`http://127.0.0.1:${port}`;
const dataDir=new URL('../.data/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const DB=previewDatabase(new URL('ad-observatory.sqlite',dataDir).pathname);
const root=resolve(import.meta.dirname,'../public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
const ASSETS={async fetch(request){
 try{
  let file=resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));
  if(file!==root&&!file.startsWith(root+sep))return new Response('Not found',{status:404});
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  file=await realpath(file);
  if(!file.startsWith(root+sep))return new Response('Not found',{status:404});
  const data=await readFile(file);
  return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}});
 }catch{return new Response('Not found',{status:404});}
}};
const server=http.createServer(async(req,res)=>{
 try{
  // Local-only host validation also prevents browser DNS-rebinding requests.
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end(`Open ${origin}`);return;}
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  const result=await worker.fetch(request,{ASSETS,DB,AUDIT_TRANSPORT:publicFetch});
  res.writeHead(result.status,Object.fromEntries(result.headers));
  if(result.body){const stream=Readable.fromWeb(result.body);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}else res.end();
 }catch{if(!res.headersSent)res.writeHead(500);res.end('Request failed. Please try again.');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Stop the other app or set PORT to another port.`:'Could not start the local server.');DB.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Ad Observatory: ${origin}\nConnect your SearchApi key in Connections to search. Press Ctrl+C to stop.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>{DB.close();process.exit(0);});server.closeAllConnections();});
