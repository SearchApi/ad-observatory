import {escapeHtml as esc} from './model.js';
export function createConnections({getCaptures}){
 // Credentials intentionally stay in this module's memory, never Web Storage.
 let key='',remaining=null,status=null,pending=false;
 const dialog=document.createElement('dialog');dialog.className='connections-dialog';dialog.setAttribute('aria-label','SearchApi and agent connections');document.body.append(dialog);
 const button=document.querySelector('#connections');
 async function api(path,options={}){const response=await fetch(path,options);let data;try{data=await response.json();}catch{throw Error('The connection service could not respond. Try again.');}if(!response.ok)throw Error(data.error||'Could not complete this action.');return data;}
 const post=body=>api('/api/ad-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 function message(text,error=false){const box=dialog.querySelector('[data-feedback]');if(box){box.textContent=text;box.classList.toggle('error',error);}}
 function render(){
  dialog.innerHTML=`<header class="dialog-head"><div><h2>Your connections</h2><p>Search with your account. Give your agent access to your research.</p></div><button data-close aria-label="Close connections">×</button></header><div class="connections-body"><section><h3>SearchApi</h3><p>New searches and refreshes use your SearchApi credits. Browsing saved ads does not.</p>${key?`<div class="connection-state">Connected for this tab${remaining!==null?` · ${esc(remaining.toLocaleString())} credits at connection`:''}</div><button data-disconnect class="secondary">Disconnect key</button>`:`<form data-key-form><label class="field">Your SearchApi API key<input type="password" name="apiKey" autocomplete="off" spellcheck="false" required maxlength="256" placeholder="Paste your API key"></label><button type="submit">Connect SearchApi</button></form>`}<p class="detail-note">Your key is sent securely to SearchApi through this app and stays only in this open tab. Reconnect after reloading. <a href="https://www.searchapi.io/dashboard" target="_blank" rel="noopener noreferrer">Get your key ↗</a></p></section><section><h3>Agent access</h3><p>A token lets your agent read your captures and collections, compare observations, create collections, and save ads. Searches also require your SearchApi key.</p><p class="detail-note">This workspace belongs to this browser. Clearing its cookies loses access to its server-saved data. There is no account login or cross-device recovery.</p><div class="connection-state">${status?`Token active · expires ${esc(new Date(status.expiresAt).toLocaleDateString())}`:'No active agent token'}</div><div class="connection-actions"><button data-create>${status?'Replace agent token':'Create agent token'}</button>${status?'<button data-revoke class="secondary">Revoke token</button>':''}</div><div data-token-output></div><p class="detail-note">Tokens expire after 30 days. Replacing or revoking a token immediately disables the previous one. Copy a new token before closing this panel.</p><a href="./api-guide.html" target="_blank" rel="noopener">Agent API guide ↗</a> · <a href="./openapi.json" target="_blank" rel="noopener">OpenAPI ↗</a></section><section><h3>Existing captures</h3><p>New searches are available to your agent automatically. Sync older captures saved in this browser to include them too.</p><button data-sync class="secondary">Sync saved captures</button><p class="detail-note">The server keeps your latest 100 captures. Collections keep their own saved copies. Imported captures are labeled as browser imports.</p></section><p data-feedback role="status" aria-live="polite"></p></div>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-key-form]')?.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
   const input=dialog.querySelector('[name="apiKey"]'),candidate=input.value.trim();input.value='';
   const result=await api('/api/ad-credentials',{method:'POST',headers:{'X-SearchApi-Key':candidate}});
   key=candidate;remaining=result.remainingCredits;button.textContent='Connections · connected';render();message('Connected. You can now add or refresh a competitor.');
  });});
  dialog.querySelector('[data-disconnect]')?.addEventListener('click',()=>{key='';remaining=null;button.textContent='Connections';render();message('SearchApi key removed from this tab.');});
  dialog.querySelector('[data-create]').onclick=()=>run(async()=>{
   const result=await post({action:'create'});status=result;render();
   const box=dialog.querySelector('[data-token-output]');box.innerHTML='<label class="field">Copy this token now<input readonly aria-label="New agent token" autocomplete="off" spellcheck="false"></label><button data-copy-token class="tiny">Copy token</button>';
   box.querySelector('input').value=result.token;status={createdAt:result.createdAt,expiresAt:result.expiresAt};
   box.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(box.querySelector('input').value);message('Token copied. Store it privately in your agent configuration.');}catch{box.querySelector('input').select();message('Select and copy the token above.');}};
   message('Token created. It will only be shown here once.');
  });
  dialog.querySelector('[data-revoke]')?.addEventListener('click',()=>run(async()=>{await post({action:'revoke'});status=null;render();message('Token revoked. The agent no longer has access.');}));
  dialog.querySelector('[data-sync]').onclick=()=>run(async()=>{const captures=getCaptures();if(!captures.length){message('No saved captures to sync yet.');return;}let count=0;for(const snapshot of captures){await post({action:'import',snapshot});count++;message(`Synced ${count} of ${captures.length} captures…`);}message(`${count} captures synced. Your agent can now read them.`);});
 }
 async function run(action){if(pending)return;pending=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Working…');try{await action();}catch(error){message(error.message,true);}finally{pending=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 async function open(){if(dialog.open)return;render();dialog.showModal();await run(async()=>{status=(await api('/api/ad-access')).token;render();});}
 button.onclick=open;
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 dialog.addEventListener('close',()=>{dialog.innerHTML='';});
 return {open,async syncCapture(snapshot){await post({action:'import',snapshot});},get connected(){return !!key;},headers:()=>key?{'X-SearchApi-Key':key}:{},async captures(){return (await api('/api/ad-access?view=captures')).captures;}};
}
