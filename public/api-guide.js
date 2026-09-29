const toggle=document.querySelector('#guide-theme');
function theme(value){document.documentElement.dataset.theme=value;toggle.textContent=value==='dark'?'☀ Light mode':'☾ Dark mode';}
theme(document.documentElement.dataset.theme||'light');
toggle.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';theme(next);try{localStorage.setItem('ad-observatory-theme',next);}catch{}};
let timer;
for(const button of document.querySelectorAll('[data-copy]'))button.onclick=async()=>{
 const code=document.getElementById(button.dataset.copy),status=document.querySelector('.guide-copy-status');
 try{await navigator.clipboard.writeText(code.textContent);status.textContent='Example copied. Replace placeholders in your private configuration.';button.textContent='Copied';}
 catch{const range=document.createRange();range.selectNodeContents(code);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Select and copy the highlighted example.';}
 clearTimeout(timer);timer=setTimeout(()=>{status.textContent='';for(const b of document.querySelectorAll('[data-copy]'))b.textContent='Copy example';},5000);
};
