import {escapeHtml as esc,groupAds,filterAds} from './model.js';
const bookmark='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M6 4h12v17l-6-4-6 4z"/></svg>';
export function createCollections({renderCard,openAd,bindMedia,bindCards,onChange}){
 let collections=[],memberships=[],items=[],active='',error='',loaded=false,loadPromise,query='';
 const dialog=document.createElement('dialog');dialog.id='collection-picker';dialog.setAttribute('aria-label','Save to collection');document.body.append(dialog);
 const toast=document.createElement('div');toast.className='collection-toast';toast.setAttribute('role','status');document.body.append(toast);let toastTimer;
 function announce(message){toast.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.textContent='',5000);}
 async function api(body,params=''){
  const r=await fetch('/api/ad-collections'+params,{cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  let data;try{data=await r.json();}catch{throw Error('Collections are unavailable. Please try again.');}
  if(!r.ok)throw Error(data.error||'Could not update collections.');return data;
 }
 async function load(){
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{try{const data=await api();collections=data.collections;memberships=data.memberships;loaded=true;error='';}catch(e){error=e.message;}finally{loadPromise=null;}})();return loadPromise;
 }
 function isSaved(ad){return memberships.some(m=>m.ad_id===ad.id);}
 function button(ad,full=false){return `<button class="save-ad ${isSaved(ad)?'is-saved':''}" data-save-ad="${esc(ad.id)}" title="Save to collection" aria-label="${isSaved(ad)?'Manage saved':'Save'} ${esc(ad.advertiser)} ad in collections">${bookmark}${full?`<span>${isSaved(ad)?'Saved to collections':'Save to collection'}</span>`:''}</button>`;}
 function sync(){document.querySelectorAll('[data-save-ad]').forEach(b=>{const saved=memberships.some(m=>m.ad_id===b.dataset.saveAd);b.classList.toggle('is-saved',saved);b.setAttribute('aria-label',saved?'Manage saved ad in collections':'Save ad in collections');const label=b.querySelector('span');if(label)label.textContent=saved?'Saved to collections':'Save to collection';});onChange?.();}
 function bind(root,ads){root.querySelectorAll('[data-save-ad]').forEach(b=>b.onclick=()=>{const ad=ads.find(a=>a.id===b.dataset.saveAd);if(ad)picker(ad);});}
 async function picker(ad){
  dialog.innerHTML=`<header class="dialog-head"><div><h2>Save to collection</h2><p>${esc(ad.advertiser)} · Ad ${esc(ad.id)}</p></div><button data-dismiss aria-label="Close collections">×</button></header><div class="collection-dialog-body"><p>Loading collections…</p></div>`;
  dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();await load();if(!dialog.open)return;drawPicker(ad);
 }
 function drawPicker(ad){
  const body=dialog.querySelector('.collection-dialog-body');
  body.innerHTML=`<p class="collection-scope">Your collections are private to this browser. Clearing its cookies removes access.</p>${error?`<p class="notice error" role="alert">${esc(error)}</p><button data-retry>Try again</button>`:`<div class="collection-choices">${collections.length?collections.map(c=>{const saved=memberships.some(m=>m.ad_id===ad.id&&m.collection_id===c.id);return `<button data-pick="${esc(c.id)}" aria-pressed="${saved}"><span><strong>${esc(c.name)}</strong><small>${c.count} saved ad${c.count===1?'':'s'}</small></span><span>${saved?'✓ Saved':'+ Save'}</span></button>`;}).join(''):'<p class="collection-empty-note">Create your first collection to keep ideas for your next campaign.</p>'}</div>`}<form class="collection-create"><label for="new-collection-name">New collection</label><div><input id="new-collection-name" name="name" required maxlength="80" placeholder="e.g. Next campaign" autocomplete="off"><button class="primary" ${error?'disabled':''}>Create & save</button></div></form><p class="collection-form-error" role="alert"></p>`;
  body.querySelector('[data-retry]')?.addEventListener('click',()=>picker(ad));
  body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{
   body.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const saved=memberships.some(m=>m.ad_id===ad.id&&m.collection_id===b.dataset.pick);await api({action:saved?'remove':'save',collection:b.dataset.pick,ad,adId:ad.id});await load();sync();drawPicker(ad);if(document.querySelector('[data-tab="collections"][aria-selected="true"]'))render(document.querySelector('#view'));announce(saved?'Ad removed from collection.':'Ad saved to collection.');}catch(e){body.querySelector('.collection-form-error').textContent=e.message;body.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
  let createdId;
  body.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const form=event.currentTarget,name=form.elements.name.value.trim();if(!name){form.elements.name.focus();return;}body.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{if(!createdId)createdId=(await api({action:'create',name})).id;else await api({action:'rename',collection:createdId,name});await api({action:'save',collection:createdId,ad});await load();sync();drawPicker(ad);if(document.querySelector('[data-tab="collections"][aria-selected="true"]'))render(document.querySelector('#view'));announce(`Saved to ${name}.`);}catch(e){body.querySelector('.collection-form-error').textContent=e.message;body.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
 }
 async function nameDialog(collection){
  dialog.innerHTML=`<header class="dialog-head"><h2>${collection?'Rename collection':'New collection'}</h2><button data-dismiss aria-label="Close collections">×</button></header><form class="collection-dialog-body"><label for="collection-name">Collection name</label><input id="collection-name" name="name" required maxlength="80" value="${esc(collection?.name||'')}" placeholder="e.g. Next campaign" autocomplete="off"><p class="collection-form-error" role="alert"></p><button class="primary">${collection?'Save name':'Create collection'}</button></form>`;
  dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();dialog.querySelector('input').focus();
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,name=form.elements.name.value.trim();if(!name)return;form.querySelector('button').disabled=true;try{const r=await api({action:collection?'rename':'create',collection:collection?.id,name});active=collection?.id||r.id;await load();dialog.close();await render(document.querySelector('#view'));}catch(e){form.querySelector('.collection-form-error').textContent=e.message;form.querySelector('button').disabled=false;}};
 }
 async function render(root){
  if(!root||!document.querySelector('[data-tab="collections"][aria-selected="true"]'))return;
  const requestId=++renderRequest;
  root.innerHTML='<div class="empty" role="status">Loading your collections…</div>';await load();
  if(requestId!==renderRequest||!document.querySelector('[data-tab="collections"][aria-selected="true"]'))return;
  if(error){root.innerHTML=`<div class="empty"><h2>Collections unavailable</h2><p>${esc(error)}</p><button data-library-retry>Try again</button></div>`;root.querySelector('button').onclick=()=>render(root);return;}
  if(!collections.some(c=>c.id===active))active=collections[0]?.id||'';
  items=[];
  if(active)try{const data=await api(null,'?collection='+encodeURIComponent(active));items=data.items.map(i=>({...i.ad,_savedCollection:active,_savedAt:i.savedAt,_observation:i.observation}));}catch(e){error=e.message;}
  if(requestId!==renderRequest||!document.querySelector('[data-tab="collections"][aria-selected="true"]'))return;
  const selected=collections.find(c=>c.id===active);
  root.innerHTML=`<section class="collections-heading"><div><h2>My collections</h2><p>Keep creative ideas together. Refresh a competitor with “Active + inactive” to update observations.</p><small>Private to this browser · Saved ads stay here when an advertiser stops them. Status follows your newer captures; media may expire.</small></div><button class="primary" data-new-collection>+ New collection</button></section><div class="collections-layout"><aside class="collection-list">${collections.map(c=>`<button data-collection="${esc(c.id)}" aria-pressed="${c.id===active}"><span>${esc(c.name)}</span><small>${c.count}</small></button>`).join('')}</aside><section class="collection-content">${selected?`<header class="collection-title"><div><h3>${esc(selected.name)}</h3><p>${selected.count} saved ad${selected.count===1?'':'s'}</p></div><button class="tiny" data-rename>Rename</button></header><label class="collection-search">Search saved ads<input type="search" placeholder="Advertiser, text or ad ID" value="${esc(query)}"></label>`:''}${error?`<p class="notice error" role="alert">${esc(error)}</p><button data-library-retry>Try again</button>`:''}<div class="collection-items"></div><div class="collection-feedback" role="status"></div></section></div>`;
  root.querySelector('[data-new-collection]').onclick=()=>nameDialog();root.querySelector('[data-rename]')?.addEventListener('click',()=>nameDialog(selected));root.querySelector('[data-library-retry]')?.addEventListener('click',()=>render(root));
  root.querySelectorAll('[data-collection]').forEach(b=>b.onclick=()=>{active=b.dataset.collection;query='';render(root);});
  root.querySelector('input[type="search"]')?.addEventListener('input',e=>{query=e.target.value;drawItems(root);});drawItems(root);
 }
 let renderRequest=0;
 function drawItems(root){
  const list=root.querySelector('.collection-items'),filtered=filterAds(items,{query});
  list.innerHTML=items.length?(filtered.length?`<div class="gallery">${filtered.map(ad=>{const group=groupAds([ad],'ads')[0];return `<div class="saved-ad-wrapper">${renderCard(group)}<button class="remove-saved" data-remove-ad="${esc(ad.id)}">Remove from collection</button></div>`;}).join('')}</div>`:'<div class="empty"><p>No saved ads match your search.</p></div>'):`<div class="empty"><h2>${active?'Your campaign starts here.':'A home for your next idea.'}</h2><p>${active?'Save ads from the creative gallery to see them here.':'Create a collection, give it a name, then save ads as you explore.'}</p><button data-browse>Explore ads →</button></div>`;
  list.querySelector('[data-browse]')?.addEventListener('click',()=>document.querySelector('[data-tab="gallery"]').click());
  const groups=filtered.map(ad=>groupAds([ad],'ads')[0]);bindCards(list,groups,openAd);
  bind(list,filtered);bindMedia();
  list.querySelectorAll('[data-remove-ad]').forEach(b=>b.onclick=async()=>{
   const ad=items.find(a=>a.id===b.dataset.removeAd),collection=active;b.disabled=true;
   try{await api({action:'remove',collection,adId:ad.id});await render(root);const feedback=root.querySelector('.collection-feedback');if(!feedback)return;feedback.innerHTML='Ad removed. <button class="tiny" data-undo>Undo</button>';feedback.querySelector('button').onclick=async e=>{e.currentTarget.disabled=true;try{await api({action:'save',collection,ad});await render(root);announce('Ad restored.');}catch(error){feedback.textContent=error.message;}};sync();}catch(e){root.querySelector('.collection-feedback').textContent=e.message;b.disabled=false;}
  });
 }
 return {button,bind,picker,render,load,get count(){return collections.length;},get loaded(){return loaded;}};
}
