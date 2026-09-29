import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLanding} from '../server/ad-landing.mjs';
test('resolves Meta redirect without requesting advertiser destination',async()=>{
 let calls=0;assert.equal(await resolveLanding('https://fb.me/ad',async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://shop.example/product'}});}),'https://shop.example/product');assert.equal(calls,1);
});
test('unwraps Meta link shim and rejects unsafe destinations',async()=>{
 assert.equal(await resolveLanding('https://l.facebook.com/l.php?u=https%3A%2F%2Fshop.example%2F'), 'https://shop.example/');
 assert.equal(await resolveLanding('https://fb.me/a',async()=>new Response(null,{status:302,headers:{location:'javascript:alert(1)'}})),null);
 assert.equal(await resolveLanding('https://fb.me/a',async()=>new Response('unavailable')),null);
});
