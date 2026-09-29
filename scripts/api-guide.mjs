import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/',import.meta.url);
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The guide uses a deliberately small Markdown subset: headings, lists, code and paragraphs.
function inline(value){return value.split(/(`[^`]+`)/g).map(part=>part.startsWith('`')?'<code>'+escape(part.slice(1,-1))+'</code>':escape(part).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')).join('');}
export async function buildApiGuide(){
 const lines=(await readFile(new URL('API.md',root),'utf8')).split('\n');let output='',paragraph=[],list='',code=null,index=0;const sections=[];
 const flush=()=>{if(paragraph.length){output+='<p>'+inline(paragraph.join(' '))+'</p>\n';paragraph=[];}if(list){output+='</'+list+'>\n';list='';}};
 for(const line of lines){
  if(line.startsWith('```')){flush();if(code!==null){output+=`<div class="guide-code"><div><span>Terminal</span><button type="button" data-copy="example-${index}">Copy example</button></div><pre><code id="example-${index++}">${escape(code.join('\n'))}</code></pre></div>`;code=null;}else code=[];continue;}
  if(code!==null){code.push(line);continue;}
  const heading=line.match(/^(#{1,3}) (.+)$/);
  if(heading){flush();const level=heading[1].length,id=heading[2].toLowerCase().replace(/[^a-z0-9]+/g,'-');if(level===2)sections.push({id,label:heading[2]});output+=`<h${level} id="${id}">${inline(heading[2])}</h${level}>`;continue;}
  if(!line.trim()){flush();continue;}
  const item=line.match(/^(?:- |\d+\. )(.+)$/);
  if(item){if(paragraph.length)flush();const kind=line.startsWith('- ')?'ul':'ol';if(list!==kind){flush();list=kind;output+='<'+kind+'>';}output+='<li>'+inline(item[1])+'</li>';continue;}
  if(list)flush();paragraph.push(line);
 }
 flush();if(code!==null)throw Error('Unclosed code fence in API.md');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Agent API guide · Ad Observatory</title><script>try{const t=localStorage.getItem('ad-observatory-theme');document.documentElement.dataset.theme=['light','dark'].includes(t)?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{}</script><link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./api-guide.css"></head><body><header class="top"><a class="wordmark" href="./"><span class="logo" aria-hidden="true">◒</span><span>Ad Observatory<small>AGENT API GUIDE</small></span></a><div class="top-actions"><a href="./">Back to app</a><button id="guide-theme" type="button">Change theme</button></div></header><main class="guide-layout"><aside><nav aria-label="Guide sections">${sections.map(s=>`<a href="#${s.id}">${escape(s.label)}</a>`).join('')}</nav><div class="guide-files"><a href="./openapi.json" download>Download OpenAPI ↓</a><a href="./API.md" download>Download Markdown ↓</a></div></aside><article>${output}<p class="guide-copy-status" role="status" aria-live="polite"></p></article></main><script type="module" src="./api-guide.js"></script></body></html>`;
 await writeFile(new URL('api-guide.html',root),html);
}
await buildApiGuide();
