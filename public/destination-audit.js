import {escapeHtml as esc,safeUrl} from './model.js';
export function createDestinationAudit({ensureCapture}){
 const dialog=document.createElement('dialog');dialog.className='audit-dialog';dialog.setAttribute('aria-label','Destination checks');document.body.append(dialog);
 let running=false;
 function frame(content){dialog.innerHTML=`<header class="dialog-head"><div><h2>Destination checks</h2><p>Titles, HTTP errors and possible soft 404s</p></div><button data-close aria-label="Close destination checks">×</button></header><div class="audit-body">${content}</div>`;dialog.querySelector('[data-close]').onclick=()=>dialog.close();}
 async function open(capture,ads){
  if(running)return;
  if(!capture)return;
  const selected=ads.slice(0,50),count=new Set(selected.map(a=>a.landingUrl).filter(Boolean)).size;
  const intro=`<p>Check up to 10 destination URLs from ${selected.length} ad${selected.length===1?'':'s'} in this capture. This visits the advertised websites and uses no SearchApi credits.</p><p class="detail-note">Reads up to 500 KB per page. No full-site crawl or JavaScript rendering. Duplicate titles are compared only across checked URLs. Soft 404s are clues from the page title and main heading, and need human review. Checks are cached for one hour.</p>`;
  frame(intro+`<p>${count} destination${count===1?'':'s'} found${ads.length>50?' in the first 50 ads':''}.</p><button data-run class="primary" ${count?'':'disabled'}>Check destinations</button><div data-results role="status"></div>`);if(!dialog.open)dialog.showModal();
  dialog.querySelector('[data-run]').onclick=async()=>{
   running=true;const b=dialog.querySelector('[data-run]'),results=dialog.querySelector('[data-results]');b.disabled=true;results.textContent='Checking destinations… This can take a few minutes.';
   try{
    await ensureCapture(capture.id);
    const response=await fetch('/api/ad-audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({captureId:capture.id,adIds:selected.map(a=>a.id)}),signal:AbortSignal.timeout(300000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Checks unavailable.');
    results.innerHTML=`<p>${data.pages.length} URL${data.pages.length===1?'':'s'} checked · ${esc(new Date(data.checkedAt).toLocaleString())}${data.cached?' · Cached':''}${data.skipped?' · '+data.skipped+' additional URLs not checked':''}</p>${data.pages.map(p=>`<article class="audit-result"><strong>${esc(p.title||'Title unavailable')}</strong><p>${safeUrl(p.url)?`<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>`:esc(p.url)}</p>${p.finalUrl&&p.finalUrl!==p.url?`<small>Final URL: ${esc(p.finalUrl)}</small>`:''}<p>${p.error?esc(p.error):`HTTP ${p.status} · ${p.flags.length?p.flags.map(esc).join(' · '):'No issue detected by these checks'}`}</p></article>`).join('')}`;
   }catch(e){results.textContent=e.name==='TimeoutError'?'The check timed out. Try fewer destinations.':e.message;}finally{running=false;b.disabled=false;}
  };
 }
 return {open};
}
