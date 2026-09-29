export function accessError(message,status=400){return Object.assign(new Error(message),{status});}
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function requireSameOrigin(request){
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin))throw accessError('Open this action from Ad Observatory.',403);
}
export function ownKey(request){
 const key=request.headers.get('X-SearchApi-Key')||'';
 if(!/^[A-Za-z0-9_\-]{12,256}$/.test(key))throw accessError('Connect your own SearchApi key to search for ads.',401);
 return key;
}
export async function readBody(request,max=4096){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw accessError('Send JSON.',415);
 if(Number(request.headers.get('Content-Length'))>max)throw accessError('Request too large.',413);
 const reader=request.body?.getReader();let chunks='',size=0;const decoder=new TextDecoder();
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw accessError('Request too large.',413);}chunks+=decoder.decode(value,{stream:true});}
 try{const body=JSON.parse(chunks+decoder.decode());if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw accessError('Invalid JSON request.');}
}
export function privateReply(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
