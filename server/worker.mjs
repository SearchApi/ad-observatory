import {handleAdApi} from './ad-api.mjs';
import {handleCompetitors} from './ad-competitors.mjs';
import {handleAdAudit} from './ad-audit.mjs';
import {handleAdCredentials,handleAdAccess} from './ad-access.mjs';
import {handleAdCollections} from './ad-collections.mjs';
import {handleAdLanding} from './ad-landing.mjs';
import {handleAdLoader,createAdStore} from './ad-loader.mjs';
import {handleAdDownload} from './ad-download.mjs';
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/ad-competitors')return handleCompetitors(request,env);
 if(url.pathname==='/api/ad-audit')return handleAdAudit(request,env);
 if(url.pathname==='/api/ad-collections')return handleAdCollections(request,env);
 if(url.pathname==='/api/ad-landing')return handleAdLanding(request,env);
 if(url.pathname==='/api/ad-download')return handleAdDownload(request,env);
 if(url.pathname==='/api/ad-loader')return handleAdLoader(request,env);
 if(url.pathname==='/api/ad-credentials')return handleAdCredentials(request,env);
 if(url.pathname==='/api/ad-access')return handleAdAccess(request,env);
 if(url.pathname.startsWith('/api/v1/'))return handleAdApi(request,env);
 const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed.'},{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 if(url.pathname.startsWith('/api/'))return Response.json({error:'Endpoint not found.'},{status:404,headers});
 let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return new Response('Not found',{status:404,headers});}
 if(decoded.split('/').some(p=>p.startsWith('.')))return new Response('Not found',{status:404,headers});
 const response=await env.ASSETS.fetch(new Request(url,request));
 const result=new Response(response.body,response);
 for(const [name,value] of Object.entries(headers))result.headers.set(name,value);
 return result;
}};
