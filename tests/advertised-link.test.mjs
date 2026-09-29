import test from 'node:test';
import assert from 'node:assert/strict';
import {advertisedLink} from '../public/advertised-link.js';
test('dynamic tracking is removed without losing the destination or concrete parameters',()=>{
 const source='https://loja.slik.com.br/products/desk?utm_source={{site_source_name}}&utm_medium=cpc&utm_campaign={{ad.name}}&utm_content=banner_setup130&variant=42#details';
 const link=advertisedLink(source),url=new URL(link.href);
 assert.equal(link.label,'loja.slik.com.br');assert.equal(url.pathname,'/products/desk');assert.equal(url.searchParams.has('utm_source'),false);assert.equal(url.searchParams.has('utm_campaign'),false);assert.equal(url.searchParams.get('utm_medium'),'cpc');assert.equal(url.searchParams.get('variant'),'42');assert.equal(url.hash,'#details');assert.ok(source.includes('{{ad.name}}'));
});
test('encoded templates are removed, concrete URLs remain usable, unsafe or incomplete destinations are not guessed',()=>{
 assert.equal(advertisedLink('https://example.com/?utm_source=%7B%7Bsource%7D%7D').href,'https://example.com/');
 assert.equal(advertisedLink('https://example.com/?utm_source=%257B%257Bsource%257D%257D').href,'https://example.com/');
 assert.equal(new URL(advertisedLink('https://example.com/?utm_source=real&utm_source={{source}}').href).searchParams.get('utm_source'),'real');
 assert.equal(advertisedLink('https://example.com/path?item=12').href,'https://example.com/path?item=12');
 for(const value of ['javascript:alert(1)','https://user:pass@example.com/','https://example.com/{{product.id}}','https://example.com/?product={{product.id}}','https://example.com/#{{anchor}}','invalid',''])assert.equal(advertisedLink(value),null);
});
