import {libraryOwner} from './ad-collections.mjs';
import {ownedCapture} from './owned-captures.mjs';
import {accessError,readBody,privateReply,requireSameOrigin} from './access-utils.mjs';

export async function handleCompetitors(request,env){
 try{
  requireSameOrigin(request);
  const owner=await libraryOwner(request);
  if(!owner)throw accessError('Enable cookies and reopen Ad Observatory.',401);
  if(!env.DB)throw accessError('Saved competitors are unavailable.',503);
  if(request.method==='POST'){
   const body=await readBody(request);
   if(body.action==='remove'){
    await env.DB.prepare('DELETE FROM saved_competitors WHERE owner=? AND page_id=?').bind(owner,String(body.pageId||'')).run();
   }else if(body.action==='save'){
    const capture=await ownedCapture(env.DB,owner,String(body.captureId||''));
    const page=capture?.config.watchlist.find(p=>p.pageId===body.pageId);
    if(!page)throw accessError('Open one of your saved captures before saving this competitor.',404);
    const saved=await env.DB.prepare('INSERT INTO saved_competitors (owner,page_id,name,page_url,country,saved_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM saved_competitors WHERE owner=?)<100 OR EXISTS(SELECT 1 FROM saved_competitors WHERE owner=? AND page_id=?) ON CONFLICT(owner,page_id) DO UPDATE SET name=excluded.name,page_url=excluded.page_url,country=excluded.country RETURNING page_id').bind(owner,page.pageId,page.name,'https://www.facebook.com/'+page.pageId,capture.config.country,new Date().toISOString(),owner,owner,page.pageId).first();
    if(!saved)throw accessError('You can save up to 100 competitors.',409);
   }else throw accessError('Unknown competitor action.');
  }else if(request.method!=='GET')throw accessError('Method not allowed.',405);
  const {results}=await env.DB.prepare('SELECT page_id AS pageId,name,page_url AS pageUrl,country,saved_at AS savedAt FROM saved_competitors WHERE owner=? ORDER BY name,page_id').bind(owner).all();
  return privateReply({competitors:results});
 }catch(error){return privateReply({error:error.status?error.message:'Saved competitors could not be loaded or updated. Try again.'},error.status||503);}
}
