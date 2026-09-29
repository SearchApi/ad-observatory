import {escapeHtml as esc} from './model.js';
export function createSavedCompetitors({onLoad,onChange,ensureCapture}){
 let items=[],error='';
 async function api(body){
  const r=await fetch('/api/ad-competitors',{cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Saved competitors are unavailable.');items=data.competitors;error='';
 }
 async function load(){try{await api();}catch(e){error=e.message;}}
 function button(pageId,captureId){const saved=items.some(p=>p.pageId===pageId);return `<button class="tiny" data-save-competitor="${esc(pageId)}" data-capture="${esc(captureId)}" ${saved?'disabled':''}>${saved?'✓ Competitor saved':'☆ Save competitor'}</button>`;}
 function render(){return `<details class="saved-competitors"><summary>Saved competitors <span>${items.length}</span></summary><p>Private to this browser. Reopen saved captures for free; refresh uses your connected SearchApi key.</p>${error?`<p role="alert">${esc(error)}</p><button data-retry-competitors>Try again</button>`:''}<div class="saved-competitor-list">${items.map(p=>`<div><strong>${esc(p.name)}</strong><span>${esc(p.country)}</span><button class="tiny" data-open-saved="${esc(p.pageId)}">Open</button><button class="tiny" data-refresh-saved="${esc(p.pageId)}">Refresh</button><button class="tiny secondary" data-unsave="${esc(p.pageId)}" aria-label="Unsave ${esc(p.name)}">Unsave</button></div>`).join('')||'<p>Use “Save competitor” on a loaded brand or an ad’s details.</p>'}</div><p data-competitor-feedback role="status"></p></details>`;}
 function bind(root){
  root.querySelectorAll('[data-save-competitor]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await ensureCapture(b.dataset.capture);await api({action:'save',pageId:b.dataset.saveCompetitor,captureId:b.dataset.capture});b.textContent='✓ Competitor saved';onChange?.();}catch(e){b.disabled=false;b.textContent='Retry saving competitor';let note=b.nextElementSibling;if(!note?.matches('[data-save-error]')){note=document.createElement('span');note.dataset.saveError='';note.setAttribute('role','alert');b.after(note);}note.textContent=e.message;}});
  root.querySelector('[data-retry-competitors]')?.addEventListener('click',async()=>{await load();onChange?.();});
  for(const action of ['open','refresh'])root.querySelectorAll(`[data-${action}-saved]`).forEach(b=>b.onclick=()=>onLoad(items.find(p=>p.pageId===b.dataset[action+'Saved']),action==='refresh'));
  root.querySelectorAll('[data-unsave]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api({action:'remove',pageId:b.dataset.unsave});onChange?.();}catch(e){root.querySelector('[data-competitor-feedback]').textContent=e.message;b.disabled=false;}});
 }
 return {load,button,render,bind};
}
