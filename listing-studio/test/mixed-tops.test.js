import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inventoryGarment,attributeErrors,description,exportErrors,listingRow} from '../public/core.js';
import {listingSchema} from '../src/listing-quality.js';
const tax=JSON.parse(fs.readFileSync(new URL('../public/taxonomy.json',import.meta.url)));
const hoodie=tax.categories.find(c=>c.startsWith('Men >> Tops >> Hoodies '));
const crewneck=tax.categories.find(c=>c.startsWith('Men >> Tops >> Sweatshirts '));
test('Mixed designer batch classifies each inventory item independently',()=>{
 const cases=[['AJ1016','Crewneck','Vintage Jean Paul Gaultier Sweatshirt 2000s','Sweatshirts'],['AJ1017','Hoodies','Light brown Diesel Hoodie','Hoodies'],['AJ1022','Hoodies','Tommy Hilfiger Navy Zip Up Hoodie','Hoodies'],['AJ1025','Hoodies','COMME des GARÇONS SHIRT x KAWS Print Popover Hoodie','Hoodies']];
 for(const [sku,Category,name,expected] of cases){
  const source={Category,'Item Name':name};assert.equal(inventoryGarment(source),expected,sku);
  const category=expected==='Hoodies'?hoodie:crewneck;
  assert.deepEqual(attributeErrors({source,analysis:{category}},tax),[]);
  assert.ok(attributeErrors({source,analysis:{category:expected==='Hoodies'?crewneck:hoodie}},tax).length,sku);
 }
 assert.equal(inventoryGarment({'Item Name':'CDG hooded sweatshirt'}),'Hoodies');
 const categories=listingSchema(tax).properties.category.enum;
 assert.ok(categories.includes(hoodie));assert.ok(categories.includes(crewneck));assert.ok(categories.every(c=>/Hoodies|Sweatshirts/.test(c)));
});
test('Designer size 38 survives copy and row construction without an invented conversion',()=>{
 const item={sku:'AJ1016',price:'225.00',condition:tax.conditions[0],source:{Category:'Crewneck'},photos:[{url:'https://example.com/photo.jpg'}],analysis:{title:'Jean Paul Gaultier Crewneck Sweatshirt',body:'Scale graphic.',size:'38',sizeVerified:true,brand:'Other (unbranded)',category:crewneck,color:tax.colors[0],age:'',style1:'',style2:'',hashtags:['jeanpaulgaultier','sweatshirt','crewneck','graphic','designer']}};
 assert.match(description(item),/Tagged size: 38/);
 assert.equal(listingRow(item,tax).Size,'38');
 assert.ok(exportErrors(item,tax).some(e=>/do not guess a conversion/.test(e)));
});
