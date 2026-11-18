import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {importItem,inventoryCSV,mergeInventorySource} from '../public/core.js';

const source=(sku,name,rrp='40')=>({SKU:sku,'Item Name':name,RRP:rrp,Condition:'A'});
const request=sources=>new Request('https://studio.example/api/inventory/import',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({sources})});
function database(){
 const records=new Map();let writes=0;
 const result=items=>({results:items.map(item=>({data:JSON.stringify(item)}))});
 return {records,get writes(){return writes;},prepare(sql){return {all:async()=>result([...records.values()]),bind(...args){return {sql,args,async all(){return result(args.map(sku=>records.get(sku)).filter(Boolean));}};}};},async batch(statements){writes+=statements.length;for(const {args} of statements)records.set(args[0],JSON.parse(args[1]));}};
}
test('CSV import stores inventory in D1, survives a new session and is idempotent',async()=>{
 const DB=database(),env={ADMIN_TOKEN:'test',DB};const sources=[source('AJ1028','Honda Crewneck'),source('AJ1029','Golf Crewneck')];
 let response=await worker.fetch(request(sources),env);assert.equal(response.status,200);
 assert.deepEqual((await response.json()).stats,{created:2,updated:0,unchanged:0,exported:0,excluded:0});assert.equal(DB.writes,2);
 response=await worker.fetch(new Request('https://studio.example/api/items',{headers:{Authorization:'Bearer test'}}),env);
 assert.deepEqual((await response.json()).map(item=>item.sku),['AJ1028','AJ1029']);
 response=await worker.fetch(request(sources),env);assert.equal(response.status,200);
 assert.equal((await response.json()).stats.unchanged,2);assert.equal(DB.writes,2);
});
test('Updated CSV preserves photos and custom prices, invalidates changed drafts and leaves exports intact',async()=>{
 const old=importItem(source('AJ1028','Honda Crewneck'));old.photos=[{url:'https://studio.example/photo.jpg'}];old.price='70.00';old.approved=true;old.status='approved';old.analysis={title:'Honda Crewneck'};
 const updated=mergeInventorySource(old,source('AJ1028','Honda Racing Crewneck','50'));
 assert.equal(updated.change,'updated');assert.equal(updated.item.price,'70.00');assert.deepEqual(updated.item.photos,old.photos);
 assert.deepEqual(updated.item.analysis,old.analysis);assert.equal(updated.item.approved,false);assert.equal(old.approved,true);
 const exported={...old,status:'exported'};assert.equal(mergeInventorySource(exported,source('AJ1028','Different Item')).item,exported);
 for(const status of ['sold','skipped'])assert.equal(mergeInventorySource({...old,status},source('AJ1028','Different Item')).change,'excluded');
 const fresh=mergeInventorySource(importItem(source('AJ1030','Red Crewneck','40')),source('AJ1030','Red Crewneck','50'));
 assert.equal(fresh.item.price,'62.50');
});
test('Saved drafts survive a replacement sheet upload without paying for new analysis',async()=>{
 const DB=database(),env={ADMIN_TOKEN:'test',DB},old=importItem(source('AJ1028','Honda Crewneck'));
 old.analysis={title:'Honda Crewneck',body:'Original paid draft'};old.description='Honda Crewneck\n\nOriginal paid draft';old.approved=true;old.status='approved';old.photos=[{url:'https://studio.example/front.jpg'}];DB.records.set(old.sku,old);
 const response=await worker.fetch(request([source('AJ1028','Honda Racing Crewneck')]),env);
 assert.equal(response.status,200);assert.equal((await response.json()).stats.updated,1);
 const saved=DB.records.get('AJ1028');assert.equal(saved.status,'inventory changed');assert.equal(saved.approved,false);
 assert.equal(saved.description,old.description);assert.deepEqual(saved.photos,old.photos);
});
test('Bulk import rejects duplicate or oversized batches before writing',async()=>{
 const DB=database(),env={ADMIN_TOKEN:'test',DB};
 for(const sources of [[source('AJ1','One'),source('AJ1','Two')],Array.from({length:101},(_,index)=>source('AJ'+(index+1),'Item'))]){
  const response=await worker.fetch(request(sources),env);assert.equal(response.status,400);assert.equal(DB.writes,0);
 }
});
test('Browser import sends large sheets in saved chunks and can resume with the same CSV',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function loadInventory('),end=app.indexOf("$('inventory').onchange",start);
 const controls={inventory:{disabled:false},refresh:{disabled:false}},items=new Map(),calls=[];let message='';
 const context=vm.createContext({online:true,busy:false,reviewSaving:false,inventorySaving:false,inventoryCSV,items,active:'',$:id=>controls[id],render:()=>{},review:()=>{},notice:text=>{message=text;},api:async(path,options)=>{
  assert.equal(path,'inventory/import');const batch=JSON.parse(options.body).sources;calls.push(batch);
  return {items:batch.map(importItem),stats:{created:batch.length,updated:0,unchanged:0,exported:0}};
 }});
 const load=vm.runInContext(app.slice(start,end)+';loadInventory',context);
 const csv='SKU,Item Name,RRP\n'+Array.from({length:205},(_,index)=>`AJ${index+1},Crewneck ${index+1},40`).join('\n');
 await load(csv);assert.deepEqual(calls.map(batch=>batch.length),[100,100,5]);assert.equal(items.size,205);
 assert.match(message,/load automatically next time/);assert.equal(controls.inventory.disabled,false);
});
test('Selecting a range reports missing inventory rows instead of silently stopping',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const start=app.indexOf("$('selectRange').onclick="),end=app.indexOf('\nlet exportURL',start);
 const controls={from:{value:'AJ1028'},to:{value:'AJ1074'},selectRange:{}},items=new Map();for(let n=1028;n<=1061;n++)items.set('AJ'+n,{sku:'AJ'+n,status:n===1061?'sold':'review'});
 let message='';const selected=new Set();const context=vm.createContext({$:id=>controls[id],items,selected,excludedFromBatch:i=>i.status==='sold',render:()=>{},notice:text=>{message=text;}});
 vm.runInContext(app.slice(start,end),context);controls.selectRange.onclick();
 assert.equal(selected.size,33);assert.match(message,/13 SKUs in this range are missing/);assert.match(message,/AJ1062/);assert.match(message,/Upload the current master inventory CSV/);
});
