import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeText,creativeCopyExport} from '../public/creative-text.js';
test('unresolved catalog tokens never appear as readable card or detail copy',()=>{
 for(const body of ['{{product.brand}}','{{ product.name }}','Buy {{product.name}} for {{product.price}}','{{product.\nbrand}}']){
  const ad={title:'A real headline',body};const text=creativeText(ad);
  assert.equal(text.body,'');assert.equal(text.dynamicBody,true);assert.equal(text.title,ad.title);
  assert.ok(!creativeCopyExport(ad).includes('{{'));assert.ok(creativeCopyExport(ad).includes('not supplied'));
  assert.equal(ad.body,body);
 }
});
test('concrete copy stays verbatim, including single braces, newlines and currency',()=>{
 const ad={title:'A {different} headline',body:'Save $20!\nTerms & conditions apply.'};
 assert.deepEqual(creativeText(ad),{...ad,dynamicTitle:false,dynamicBody:false});
 assert.equal(creativeCopyExport(ad),ad.title+'\n\n'+ad.body);
});
test('missing text and dynamic headlines are handled independently',()=>{
 assert.deepEqual(creativeText({}),{title:'',body:'',dynamicTitle:false,dynamicBody:false});
 const text=creativeText({title:'{{product.name}}',body:'Concrete body'});
 assert.equal(text.title,'');assert.equal(text.body,'Concrete body');assert.equal(text.dynamicTitle,true);
});
