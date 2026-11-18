import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import worker from '../src/worker.js';
import * as core from '../public/core.js';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const tax=JSON.parse(await readFile(new URL('../public/taxonomy.json',import.meta.url)));
function fixture(){
 const records=new Map();let writes=0,failNext=false,releaseSave;
 for(const sku of ['AJ1028','AJ1029','AJ1030']){
  const item=core.importItem({SKU:sku,'Item Name':'Mickey Mouse red crewneck, no tag, soft feel',RRP:'35',Condition:'A'});
  Object.assign(item,{listingStandard:core.LISTING_COPY_STANDARD,status:'review',photos:[{name:'front.jpg',url:'https://studio.example/front.jpg'}],analysis:{title:'Mickey Mouse Red Crewneck Sweatshirt',body:'Red crewneck with Mickey Mouse embroidery.',brand:'Other (unbranded)',category:core.SWEATSHIRT_CATEGORY,color:'Red (red)',color2:'',source1:'',style3:'',age:'',style1:'Retro (retro)',style2:'Casual (casual)',size:'L',hashtags:['mickey','disney','crewneck','red','sweatshirt'],flags:['Review tag details.']}});
  item.description=core.description(item).replace('Please message','No tag. Please message');records.set(sku,item);
 }
 const env={ADMIN_TOKEN:'test',DB:{prepare(){return {
  all:async()=>({results:[...records.values()].map(item=>({data:JSON.stringify(item)}))}),
  bind(...args){return {run:async()=>{if(failNext){failNext=false;throw Error('Simulated database outage');}if(releaseSave)await releaseSave;writes++;records.set(args[0],JSON.parse(args[1]));return {success:true};}};}
 };}},ASSETS:{fetch:async()=>Response.json(tax)}};
 return {records,get writes(){return writes;},fail(){failNext=true;},delay(){let release;releaseSave=new Promise(r=>release=r);return ()=>{releaseSave=undefined;release();};},async open(storage){
  const dom=new JSDOM(html.replace(/<script[^>]*>.*?<\/script>/gs,''),{url:'https://studio.example/',runScripts:'outside-only'}),w=dom.window;
  Object.assign(w,{structuredClone,Blob,fetch:async(path,options={})=>{
   if(path==='taxonomy.json')return Response.json(tax);
   const headers={...options.headers,Authorization:'Bearer test'};
   return worker.fetch(new Request(new URL(path,w.location.href),{...options,headers}),env);
  }});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  let downloaded;w.URL.createObjectURL=blob=>{downloaded=blob;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  w.core=core;if(storage)w.localStorage.setItem('atlantajake-review-session-v1',storage);
  // Execute the complete shipped app module with its real exports, DOM events and Worker API.
  const script=app.replace(/^import\{([^}]+)\}from'\.\/core.js';/, 'const {$1}=window.core;');
  await w.eval('(async()=>{'+script+'})()');
  return {dom,w,$:id=>w.document.getElementById(id),get download(){return downloaded;},storage:()=>w.localStorage.getItem('atlantajake-review-session-v1')};
 }};
}
function edit(page,id,value){page.$(id).value=value;page.$(id).dispatchEvent(new page.w.Event('input',{bubbles:true}));}
function select(page){edit(page,'from','AJ1028');edit(page,'to','AJ1030');page.$('selectRange').click();page.w.document.querySelector('[data-sku="AJ1028"] strong').click();}
function sku(page){return page.w.document.querySelector('#review .eyebrow').textContent.split(' ')[0];}
async function settle(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));}
test('Complete DOM review flow saves owner approval, advances, resumes after reload and exports despite suggestions',async()=>{
 const f=fixture();let p=await f.open();select(p);
 assert.match(p.$('suggestions').textContent,/soft feel/);assert.doesNotMatch(p.$('suggestions').textContent,/missing tag must/);
 edit(p,'price','43.75');const release=f.delay();const saving=p.$('approve').onclick();await settle();
 assert.equal(p.$('approve').disabled,true);p.w.document.querySelector('[data-sku="AJ1030"] strong').click();assert.equal(sku(p),'AJ1028');
 release();await saving;assert.equal(f.writes,1);assert.equal(f.records.get('AJ1028').approved,true);assert.equal(sku(p),'AJ1029');
 const saved=p.storage();p.dom.window.close();p=await f.open(saved);
 assert.equal(sku(p),'AJ1029');assert.equal(p.w.document.querySelectorAll('#items input:checked').length,3);assert.equal(p.$('from').value,'AJ1028');assert.match(p.w.document.querySelector('[data-sku="AJ1028"]').textContent,/Approved/);
 f.fail();edit(p,'price','51.25');await p.$('approve').onclick();assert.equal(sku(p),'AJ1029');assert.equal(f.records.get('AJ1029').approved,false);assert.equal(p.$('price').value,'51.25');assert.match(p.$('reviewFeedback').textContent,/Request failed/);
 await p.$('approve').onclick();assert.equal(sku(p),'AJ1030');assert.equal(f.records.get('AJ1029').price,'51.25');
 edit(p,'price','0');await p.$('approve').onclick();assert.equal(f.records.get('AJ1030').approved,true);assert.match(p.$('reviewFeedback').textContent,/Batch review complete/);
 await p.$('export').onclick();assert.match(p.$('exportFeedback').textContent,/AJ1030: Price required/);assert.equal(p.download,undefined);
 edit(p,'price','43.75');await p.$('approve').onclick();await p.$('export').onclick();
 const csv=await p.download.text();for(const item of f.records.values()){assert.equal(item.status,'exported');assert.ok(csv.includes(item.sku));}assert.ok(csv.includes('No tag.'));
 assert.equal(f.writes,7);assert.match(p.$('suggestions').textContent,/soft feel/);
 p.dom.window.close();
});
test('Complete DOM save-and-next preserves a draft, and approve advances to an unanalyzed item',async()=>{
 const f=fixture();const last=f.records.get('AJ1030');last.analysis=null;last.description='';last.photos=[];
 const p=await f.open();select(p);edit(p,'description',p.$('description').value+'\nEdited');await p.$('saveNext').onclick();
 assert.equal(f.records.get('AJ1028').approved,false);assert.match(f.records.get('AJ1028').description,/Edited/);assert.equal(sku(p),'AJ1029');
 await p.$('approve').onclick();assert.equal(sku(p),'AJ1030');assert.ok(p.$('next'));assert.ok(p.$('markSold'));assert.equal(p.$('approve'),null);
 p.dom.window.close();
});
