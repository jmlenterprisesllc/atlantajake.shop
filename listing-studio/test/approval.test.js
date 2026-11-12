import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf(' const save=async approved=>');
const end=app.indexOf(";$('save').onclick",start);
const source=app.slice(start,end)+'; save';
function setup({errors=[],fail=false}={}){
 const item={sku:'AJ1028',analysis:{size:'S'},approved:false,status:'review',error:'old analysis error'};
 const controls={save:{},approve:{},reviewFeedback:{},price:{value:'56.25'},condition:{value:'good'},description:{value:'Reviewed description'},review:{querySelectorAll:()=>[{dataset:{field:'size'},value:'M'}]}};
 const items=new Map([[item.sku,item]]);let saved;
 const save=vm.runInNewContext(source,{i:item,$:id=>controls[id],structuredClone,tax:{},validate:()=>errors,notice:()=>{},persist:async draft=>{if(fail)throw Error('Session expired. Sign in again.');saved=draft;},items,render:()=>{},review:()=>{}});
 return {save,item,controls,items,get saved(){return saved;}};
}
test('Approval saves edited draft and confirms readiness next to buttons',async()=>{const t=setup();await t.save(true);assert.equal(t.saved.approved,true);assert.equal(t.saved.analysis.size,'M');assert.equal(t.saved.error,'');assert.equal(t.items.get('AJ1028').status,'approved');assert.match(t.controls.reviewFeedback.textContent,/approved and ready for CSV export/);assert.equal(t.controls.approve.disabled,false);});
test('Blocked approval shows validation errors next to buttons and preserves draft',async()=>{const t=setup({errors:['Use exactly five hashtags']});await t.save(true);assert.equal(t.saved,undefined);assert.equal(t.item.approved,false);assert.match(t.controls.reviewFeedback.textContent,/Cannot approve: Use exactly five hashtags/);});
test('Failed save does not mark item approved and reports the failure inline',async()=>{const t=setup({fail:true});await t.save(true);assert.equal(t.items.get('AJ1028').approved,false);assert.match(t.controls.reviewFeedback.textContent,/Session expired/);assert.equal(t.controls.save.disabled,false);});
