import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveBrand,listingSchema,LISTING_STANDARD} from '../src/listing-quality.js';
import {exportAttributes,listingRow,validate,importItem,description,dropdownChoices,inventoryEra,exportCSV,SWEATSHIRT_CATEGORY} from '../public/core.js';
import worker from '../src/worker.js';
const tax=JSON.parse(await readFile(new URL('../public/taxonomy.json',import.meta.url)));
test('A maker outside the prompt shortlist resolves against the complete template',()=>{
 const name=tax.brands.find(b=>b.startsWith('Russell Athletic ('));
 assert.ok(name);assert.equal(resolveBrand('Russell Athletic',tax.brands).brand,name);
 assert.equal(resolveBrand('Russell Athletic',tax.brands).warning,'');
});
test('Unmatched or ambiguous makers use Other with an explicit review warning',()=>{
 assert.equal(resolveBrand('Unlisted Actual Maker',tax.brands).brand,'Other (unbranded)');
 assert.match(resolveBrand('Unlisted Actual Maker',tax.brands).warning,/Unlisted Actual Maker/);
 assert.match(resolveBrand('a b',['A B (one)','AB (two)','Other (unbranded)']).warning,/unambiguously/);
});
test('Structured generation requires inspectable evidence and search phrases and constrains dropdowns',()=>{
 const s=listingSchema(tax);assert.ok(s.required.includes('evidence'));assert.ok(s.required.includes('searchPhrases'));
 assert.deepEqual(s.properties.color.enum,tax.colors);assert.equal(s.properties.hashtags.minItems,5);
 assert.equal(s.properties.brand.enum,undefined); // A shortlist must not hide the real manufacturer.
});
function item(){return {...importItem({SKU:'AJ1060','Item Name':'Vintage 1985 crewneck red, front graphic: number 20, Rah Rah. Insanely soft',RRP:'45',Condition:'A'}),analysis:{title:'Vintage 80s Rah Rah 20 Red Graphic Crewneck Sweatshirt',body:'Red sweatshirt with a Rah Rah and 20 front graphic. Soft fabric noted in the inventory.',brand:'Other (unbranded)',category:tax.categories.find(v=>v.startsWith('Men >> Tops >> Sweatshirts')),color:'Red (red)',age:'80s (80s)',style1:'Retro (retro)',style2:'Casual (casual)',size:'S',tagMissing:true,hashtags:['rahrah','crewneck','sweatshirt','graphic','retro'],flags:[]},photos:[{url:'https://studio.example/photo.jpg'}]};}
test('Explicitly removing irrelevant Multi, Vintage or Y2K persists through export without reinstating defaults',()=>{
 const i=item();Object.assign(i.analysis,{color2:'',source1:'',style3:'',age:''});
 assert.equal(validate(i,tax).length,0);const row=listingRow(i,tax);
 for(const h of ['Color 2','Source 1','Style 3','Age'])assert.equal(row[h],'');
 assert.deepEqual(exportAttributes({}),{color2:'Multi (multi)',source1:'Vintage (vintage)',style3:'Y2K (y2_k)'});
});
test('Duplicate hashtags and invalid optional attributes cannot pass review validation',()=>{
 const i=item();i.analysis.hashtags=['red','red','crewneck','graphic','retro'];i.analysis.style3='irrelevant';
 assert.ok(validate(i,tax).includes('Use five distinct hashtags'));assert.ok(validate(i,tax).includes('Select valid style3'));
});
async function replace({failed=false,exported=false}={}){
 const old=item();old.approved=true;old.status=exported?'exported':'approved';old.photos=[{key:'AJ1060/'+'a'.repeat(64)+'.jpg',url:'https://studio.example/photo.jpg'}];
 let saved,calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return failed?Response.json({error:'unavailable'},{status:429}):Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...old.analysis,brand:'Russell Athletic',evidence:[{fact:'Red graphic sweatshirt',support:'Inventory Item Name'}],searchPhrases:['Rah Rah sweatshirt','red graphic crewneck']})}]}]});};
 const env={ADMIN_TOKEN:'test',OPENAI_API_KEY:'fake',OPENAI_MODEL:'configured',ASSETS:{fetch:async()=>Response.json(tax)},PHOTOS:{head:async()=>({})},DB:{prepare:sql=>({bind:(...args)=>({first:async()=>({data:JSON.stringify(old)}),run:async()=>{if(sql.startsWith('UPDATE items'))saved=JSON.parse(args[0]);return {meta:{changes:1}};}})})}};
 try{const response=await worker.fetch(new Request('https://studio.example/api/analyze',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({sku:'AJ1060',replace:true})}),env);return {response,saved,calls,old};}finally{globalThis.fetch=original;}
}
test('Explicit single-item replacement clears approval, preserves photos, records standard and resolves full brand',async()=>{
 const r=await replace();assert.equal(r.response.status,200);assert.equal(r.calls,1);assert.equal(r.saved.approved,false);
 assert.equal(r.saved.listingStandard,LISTING_STANDARD);assert.deepEqual(r.saved.photos,r.old.photos);
 assert.match(r.saved.analysis.brand,/^Russell Athletic \(/);assert.equal(r.saved.analysis.evidence.length,1);
});
test('Failed paid replacement retains the saved approved listing',async()=>{
 const r=await replace({failed:true});assert.equal(r.response.status,502);assert.equal(r.saved,undefined);assert.equal(r.old.approved,true);
});
test('Exported listing replacement is blocked before any paid API call',async()=>{
 const r=await replace({exported:true});assert.equal(r.response.status,409);assert.equal(r.saved,undefined);assert.equal(r.calls,0);
});

test('Unreadable size labels are distinguished from missing tags and verified sizes',()=>{const i=item();i.analysis.tagMissing=false;i.analysis.sizeVerified=false;assert.match(description(i),/Size: S \(seller provided; tag size unverified\)/);i.analysis.sizeVerified=true;assert.match(description(i),/Tagged size: S/);i.analysis.tagMissing=true;assert.match(description(i),/Size: S \(tag missing\)/);});

test('Unknown dropdown values remain explicitly invalid instead of falling back to Collectibles',()=>{
 const options=dropdownChoices(tax.categories,'Men >> Tops >> Sweatshirts');
 assert.equal(options.filter(o=>o.selected).length,1);assert.equal(options[0].value,'__invalid__');assert.equal(options[0].disabled,true);
 assert.equal(options.find(o=>o.value===tax.categories[0]).selected,false);
 const optional=dropdownChoices(tax.ages,'invalid era',true);assert.equal(optional[0].value,'__invalid__');assert.ok(optional.some(o=>o.value===''&&!o.disabled));
 assert.equal(dropdownChoices(tax.categories,SWEATSHIRT_CATEGORY).find(o=>o.selected).value,SWEATSHIRT_CATEGORY);
});
test('A valid but unrelated category blocks approval and CSV export for crewneck inventory',()=>{
 const i=item();i.source.Category='Crewneck';i.approved=true;i.analysis.category=tax.categories[0];
 assert.ok(validate(i,tax).some(e=>e.includes('Crewneck category must')));assert.throws(()=>exportCSV([i],tax),/Crewneck category must/);
 delete i.source.Category;assert.ok(validate(i,tax).some(e=>e.includes('Crewneck category must')));i.analysis.category=SWEATSHIRT_CATEGORY;assert.equal(validate(i,tax).length,0);
});
test('Explicit vintage dating is checked without treating an event year as manufacture proof',()=>{
 assert.equal(inventoryEra({'Item Name':'Vintage 1985 crewneck red'}),'80s (80s)');
 assert.equal(inventoryEra({'Item Name':'Atlanta 1996 Olympics Vintage Champion crewneck'}),'');
 assert.equal(inventoryEra({'Item Name':'HOYAS 80s crewneck'}),'80s (80s)');
 const i=item();i.approved=true;i.analysis.age='90s (90s)';assert.throws(()=>exportCSV([i],tax),/Age conflicts with inventory: 80s/);
 i.analysis.age='80s (80s)';assert.equal(validate(i,tax).length,0);i.analysis.age='';assert.equal(validate(i,tax).length,0);
});
test('New generation schema permits unknown age instead of forcing a decade',()=>{assert.ok(listingSchema(tax).properties.age.enum.includes(''));});
test('Server rejects approval writes with a valid but wrong category or contradictory age',async()=>{
 for(const field of ['category','age']){
  const i=item();i.source.Category='Crewneck';i.approved=true;if(field==='category')i.analysis.category=tax.categories[0];else i.analysis.age='90s (90s)';
  let writes=0;const env={ADMIN_TOKEN:'test',DB:{prepare:()=>{writes++;throw Error('Must not write');}},ASSETS:{fetch:async()=>Response.json(tax)}};
  const response=await worker.fetch(new Request('https://studio.example/api/items/AJ1060',{method:'PUT',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(i)}),env);
  assert.equal(response.status,422);assert.match((await response.json()).error,/Cannot approve/);assert.equal(writes,0);
 }
});
