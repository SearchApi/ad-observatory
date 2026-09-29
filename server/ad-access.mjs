import {libraryOwner} from './ad-collections.mjs';
import {createAdStore} from './ad-loader.mjs';
import {accessError,digest,requireSameOrigin,ownKey,readBody,privateReply} from './access-utils.mjs';
import {ownedCaptures,retainOwnedCapture,importedCapture} from './owned-captures.mjs';
export async function handleAdCredentials(request,env,{upstream=fetch}={}){
 try{
  if(request.method!=='POST')throw accessError('Method not allowed.',405);
  requireSameOrigin(request);const owner=await libraryOwner(request);if(!owner)throw accessError('Enable cookies and reload Ad Observatory.',401);
  const key=ownKey(request);if(!env.DB)throw accessError('Connections are temporarily unavailable.',503);
  if(!await createAdStore(env.DB).reserve(new Date().toISOString().slice(0,13)+':credentials:'+owner,20))throw accessError('Too many connection attempts. Try again later.',429);
  const response=await upstream('https://www.searchapi.io/api/v1/me',{headers:{Authorization:'Bearer '+key},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw accessError(response.status===401||response.status===403?'SearchApi rejected this key. Check the key in your account.':'SearchApi could not verify this key. Try again later.',response.status===401||response.status===403?401:502);
  let data;try{data=await response.json();}catch{throw accessError('SearchApi could not verify this key.',502);}
  if(!data.account||typeof data.account!=='object')throw accessError('SearchApi could not verify this key.',502);
  // Return only numeric quota information. Never echo provider response bodies or credentials.
  const remaining=data.account.remaining_credits;
  return privateReply({connected:true,remainingCredits:typeof remaining==='number'&&Number.isFinite(remaining)&&remaining>=0?remaining:null});
 }catch(error){return privateReply({error:error.status?error.message:'Could not connect to SearchApi. Try again.'},error.status||502);}
}
export async function handleAdAccess(request,env){
 try{
  if(!['GET','POST'].includes(request.method))throw accessError('Method not allowed.',405);
  requireSameOrigin(request);if(!env.DB)throw accessError('Connections are temporarily unavailable.',503);
  const owner=await libraryOwner(request);if(!owner)throw accessError('Enable cookies and reload Ad Observatory.',401);
  if(request.method==='GET'){
   if(new URL(request.url).searchParams.get('view')==='captures')return privateReply({captures:await ownedCaptures(env.DB,owner)});
   const token=await env.DB.prepare('SELECT created_at,expires_at FROM agent_tokens WHERE owner=? AND expires_at>?').bind(owner,new Date().toISOString()).first();
   return privateReply({token:token?{createdAt:token.created_at,expiresAt:token.expires_at}:null});
  }
  const body=await readBody(request,2000000);
  if(body.action==='import'){
   const snapshot=importedCapture(body.snapshot);await retainOwnedCapture(env.DB,owner,snapshot,'browser-import');return privateReply({id:snapshot.id});
  }
  if(body.action==='revoke'){await env.DB.prepare('DELETE FROM agent_tokens WHERE owner=?').bind(owner).run();return privateReply({revoked:true});}
  if(body.action!=='create')throw accessError('Unknown connection action.');
  const token='ao_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+30*86400000).toISOString();
  await env.DB.prepare('INSERT INTO agent_tokens(owner,token_hash,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at').bind(owner,await digest(token),createdAt,expiresAt).run();
  return privateReply({token,createdAt,expiresAt},201);
 }catch(error){return privateReply({error:error.status?error.message:'Connections could not be updated. Try again.'},error.status||503);}
}
export async function agentOwner(request,env){
 const token=request.headers.get('Authorization')?.match(/^Bearer (ao_[a-f0-9]{64})$/)?.[1];
 if(!token||!env.DB)throw accessError('Use a valid Ad Observatory agent token.',401);
 const row=await env.DB.prepare('SELECT owner FROM agent_tokens WHERE token_hash=? AND expires_at>?').bind(await digest(token),new Date().toISOString()).first();
 if(!row)throw accessError('Agent token expired or revoked.',401);
 return row.owner;
}
