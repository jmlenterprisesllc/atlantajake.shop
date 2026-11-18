import{inventoryCSV,description,exportErrors,reviewSuggestions,exportCSV,label,formatTitle,previewSellerTitle,reviewDraft,coverDraft,nextReviewSKU,nextBatchSKU,setBatchStatus,restoreBatchStatus,excludedFromBatch,exportAttributes,dropdownChoices,photoPreviewURL,LISTING_COPY_STANDARD}from'./core.js';
const $=id=>document.getElementById(id),tax=await(await fetch('taxonomy.json')).json();
const items=new Map(),selected=new Set(),files=new Map(),localURLs=new Map();let online=false,active='',busy=false,reviewSaving=false,inventorySaving=false;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notice=s=>$('notice').textContent=s;
let sessionRecovery=null;
function signInAgain(){
 if(sessionRecovery)return sessionRecovery;
 sessionRecovery=new Promise((resolve,reject)=>{
  const dialog=$('sessionDialog'),form=$('sessionForm'),password=$('sessionPassword'),message=$('sessionMessage'),submit=$('sessionSubmit'),cancel=$('sessionCancel');
  let submitting=false,finished=false;
  const finish=error=>{if(finished)return;finished=true;password.value='';dialog.close();error?reject(error):resolve();};
  const dismiss=()=>{if(submitting)return;const error=Error('Sign in again to save. Your edits are still on this page.');error.code='AUTH_CANCELLED';finish(error);};
  password.value='';message.textContent='Your sign-in expired or is no longer valid. Enter your Studio password to continue the pending action. Your edits will stay here.';
  password.disabled=false;submit.disabled=false;cancel.disabled=false;
  cancel.onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss();};
  form.onsubmit=async e=>{
   e.preventDefault();if(submitting)return;submitting=true;password.disabled=true;submit.disabled=true;cancel.disabled=true;message.textContent='Signing in…';
   try{
    const response=await fetch('/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({password:password.value}).toString()});
    const result=await response.json();
    if(!response.ok||!result.signedIn)throw Error(result.error||'Could not sign in. Try again.');
    online=true;$('connection').textContent='Connected';finish();
   }catch(error){message.textContent=error.message;password.value='';}
   finally{submitting=false;password.disabled=false;submit.disabled=false;cancel.disabled=false;if(!finished)password.focus();}
  };
  dialog.showModal();password.focus();
 }).finally(()=>{sessionRecovery=null;});
 return sessionRecovery;
}
async function requestApi(path,options={}){
 const request=()=>fetch('/api/'+path,{...options,credentials:'same-origin'});
 let response=await request();
 if(response.status===401){$('connection').textContent='Sign in needed';await signInAgain();response=await request();}
 if(response.status===401){const error=Error('Sign-in was not accepted. Your changes have not been saved. Try signing in again.');error.code='AUTH_CANCELLED';throw error;}
 return response;
}
async function api(path,options={}){const r=await requestApi(path,options);if(!r.ok){let x;try{x=await r.json();}catch{}throw Error(x?.error||'Request failed: '+r.status);}return r.status===204?null:r.json();}
function visible(){const q=$('search').value.toLowerCase();return [...items.values()].filter(i=>(i.sku+' '+i.source['Item Name']).toLowerCase().includes(q)).sort((a,b)=>Number(a.sku.slice(2))-Number(b.sku.slice(2)));}
function render(){rememberReview();const list=visible();$('count').textContent=items.size;$('empty').hidden=!!list.length;$('items').innerHTML=list.map(i=>`<tr data-sku="${i.sku}" class="${active===i.sku?'active':''}"><td><input type="checkbox" aria-label="Select ${i.sku}" ${selected.has(i.sku)?'checked':''} ${excludedFromBatch(i)?'disabled':''}></td><td><strong>${i.sku}</strong><small>${escape(i.analysis?formatTitle((i.description||description(i)).split(/\r?\n/)[0]||i.analysis.title):i.source['Item Name'])}</small></td><td>${i.photos.length}/8</td><td>$${escape(i.price)}</td><td>${escape(i.status==='exported'?'Exported':i.approved?'Approved':i.status)}</td></tr>`).join('');for(const tr of $('items').querySelectorAll('tr')){tr.onclick=e=>{if(reviewSaving)return;const sku=tr.dataset.sku;if(e.target.type==='checkbox'){e.target.checked?selected.add(sku):selected.delete(sku);rememberReview();return;}active=sku;render();review();};}}
async function persist(i){if(!online)throw Error('Not connected. Your changes have not been saved. Reconnect and try again.');await api('items/'+i.sku,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(i)});}
async function loadInventory(text){
 if(!online)throw Error('Connect the studio before importing inventory.');
 if(busy||reviewSaving)throw Error('Finish the current photo or listing action before updating inventory.');
 if(inventorySaving)throw Error('Inventory is already being saved.');
 const sources=inventoryCSV(text);let saved=0,created=0,updated=0,exported=0;
 inventorySaving=true;$('inventory').disabled=true;$('refresh').disabled=true;
 try{
 for(let start=0;start<sources.length;start+=100){
  try{const result=await api('inventory/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:sources.slice(start,start+100)})});
   for(const item of result.items)items.set(item.sku,item);
   saved+=result.items.length;created+=result.stats.created;updated+=result.stats.updated;exported+=result.stats.exported;
   notice(`Saving inventory ${saved}/${sources.length}…`);
  }catch(e){render();throw Error(`Saved ${saved} of ${sources.length} rows. ${e.message} Upload the same CSV to resume safely.`);}
 }
 render();if(active)review();notice(`Saved ${sources.length} inventory rows. ${created} new, ${updated} updated${exported?', '+exported+' exported listings preserved':''}. Inventory will load automatically next time.`);
 }finally{inventorySaving=false;$('inventory').disabled=false;$('refresh').disabled=false;}
}
$('inventory').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await loadInventory(await file.text());}catch(error){notice(error.message);}finally{e.target.value='';}};

const reviewSessionKey='atlantajake-review-session-v1';
function rememberReview(){
 try{localStorage.setItem(reviewSessionKey,JSON.stringify({selected:[...selected],active,from:$('from').value,to:$('to').value,search:$('search').value}));}catch{}
}
function restoreReview(){
 try{const state=JSON.parse(localStorage.getItem(reviewSessionKey)||'null');if(!state)return;
 for(const sku of state.selected||[])if(items.has(sku)&&!excludedFromBatch(items.get(sku)))selected.add(sku);
 for(const key of ['from','to','search'])if(typeof state[key]==='string')$(key).value=state[key];
 if(items.has(state.active))active=state.active;
 }catch{}
}
async function connect(){try{const status=await api('status');online=true;$('localLabel').hidden=!status.storage;const saved=await api('items');for(const i of saved)items.set(i.sku,i);restoreReview();$('connection').textContent=status.analysis?'Connected · Analysis ready':'Connected · Setup needed';notice(saved.length?`Loaded ${saved.length} saved inventory items. Your last selection and review position are restored on this browser.`:'Signed in. Import your master inventory CSV once to save it here.');render();if(active)review();}catch(e){online=false;notice(e.message);}}
await connect();
$('refresh').onclick=async()=>{try{const r=await requestApi('inventory');if(!r.ok)throw Error((await r.json()).error);await loadInventory(await r.text());}catch(e){notice(e.message);}};
$('drive').onclick=async()=>{
 if(busy||inventorySaving||reviewSaving)return;if(!online)return notice('Connect the studio first.');
 const chosen=[...selected].map(s=>items.get(s)).filter(i=>i&&i.status!=='exported'&&!excludedFromBatch(i));if(!chosen.length)return notice('Select an inventory SKU range first.');
 busy=true;$('drive').disabled=true;let loaded=0;const problems=[];
 try{const folders=await api('drive/folders');const lookup=new Map();for(const folder of folders){if(!lookup.has(folder.sku))lookup.set(folder.sku,[]);lookup.get(folder.sku).push(folder.folderId);}
 for(const i of chosen){try{const match=lookup.get(i.sku)||[];if(match.length!==1)throw Error(match.length?'Duplicate SKU folders in Drive':'SKU folder missing from Drive');notice('Reading '+i.sku+' from Drive…');await persist(i);const updated=await api('drive/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:i.sku,folderId:match[0]})});items.set(i.sku,updated);loaded++;}catch(e){problems.push(i.sku+': '+e.message);if(e.code==='AUTH_CANCELLED')break;}}
 render();if(active)review();notice(`Loaded Drive photos for ${loaded} items. No photos were uploaded again.`+(problems.length?'\n'+problems.join('\n'):''));
 }catch(e){notice(e.message);}finally{busy=false;$('drive').disabled=false;}
};
$('folders').onchange=e=>{if(reviewSaving||busy||inventorySaving)return notice('Finish the current action before changing photos.');let count=0;const skipped=[];const groups=new Map();for(const f of e.target.files){const path=f.webkitRelativePath.split('/');const sku=path.find(p=>/^AJ\d+$/i.test(p))?.toUpperCase();if(!sku||!items.has(sku)||!(/\.(jpe?g|png|webp)$/i.test(f.name))){if(/\.(heic|heif)$/i.test(f.name))skipped.push(f.name+' (convert HEIC to JPEG)');continue;}if(!groups.has(sku))groups.set(sku,[]);groups.get(sku).push(f);}
 for(const[sku,group]of groups){const i=items.get(sku);if(group.length>8){skipped.push(sku+' has '+group.length+' images; select up to 8 before adding');continue;}group.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));files.set(sku,group);i.photos=group.map(f=>{const key=sku+'/'+f.name;if(localURLs.has(key))URL.revokeObjectURL(localURLs.get(key));const url=URL.createObjectURL(f);localURLs.set(key,url);return{name:f.name,preview:url};});i.analysis=null;i.description='';i.approved=false;i.status='photos ready';selected.add(sku);count+=group.length;}
 render();if(active)review();notice(`Matched ${count} photos in ${groups.size} SKU folders. Originals are unchanged.`+(skipped.length?'\n'+skipped.join('\n'):''));};
async function compress(file){const image=await createImageBitmap(file,{imageOrientation:'from-image'});const scale=Math.min(1,2000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image conversion failed')),'image/jpeg',.86));}
async function uploadPhoto(sku,p){const f=files.get(sku)?.find(f=>f.name===p.name);if(!f){if(p.url)return p;throw Error('Reselect the folder for '+sku);}const blob=await compress(f),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');const path=`upload/${sku}/${hash}`;let exists=await requestApi(path,{method:'HEAD'});if(exists.status===401)throw Error('Reconnect your studio.');if(exists.ok)return{name:p.name,key:sku+'/'+hash+'.jpg',url:location.origin+'/photos/'+sku+'/'+hash+'.jpg'};let last;for(let attempt=0;attempt<3;attempt++){try{const v=await api(path,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:blob});return{name:p.name,...v};}catch(e){last=e;}}throw last;}
$('process').onclick=async()=>{if(busy||inventorySaving||reviewSaving)return;if(!online)return notice('Connect the studio before uploading.');const batch=[...selected].map(k=>items.get(k)).filter(Boolean);if(!batch.length)return notice('Select items to process.');busy=true;$('process').disabled=true;let completed=0,skipped=0,cached=0;const failures=[];try{for(const i of batch){if(i.status==='exported'||excludedFromBatch(i)){skipped++;continue;}if(i.analysis){cached++;continue;}if(i.approved){skipped++;continue;}try{i.error='';if(!i.photos.length)throw Error('Select photos first.');notice('Preparing photos for '+i.sku+'…');const result=[];for(let j=0;j<i.photos.length;j+=3)result.push(...await Promise.all(i.photos.slice(j,j+3).map(p=>uploadPhoto(i.sku,p))));i.photos=result;i.status='uploaded';await persist(i);notice('Analyzing '+i.sku+'…');const resultItem=await api('analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:i.sku})});resultItem.error='';items.set(i.sku,resultItem);completed++;active=i.sku;review();}catch(e){i.status='needs attention';i.error=e.message;failures.push(i.sku+': '+e.message);active=i.sku;review();notice(i.sku+': '+e.message);if(e.code==='AUTH_CANCELLED')break;}render();}notice(`Analysis finished: ${completed} ready for review, ${failures.length} failed, ${cached} saved drafts kept without rewriting, ${skipped} skipped.`+(failures.length?' '+failures.join(' | '):' Review each item before approving.'));}finally{busy=false;$('process').disabled=false;}};
function reviewFeedback(message){const target=$('reviewFeedback');if(target)target.textContent=message;else notice(message);}
function setReviewBusy(value){for(const button of $('review').querySelectorAll('button'))button.disabled=value||button.dataset.cover==='0'||(excludedFromBatch(items.get(active))&&button.dataset.cover!==undefined);}
function readReviewDraft(item){if(!item.analysis)return structuredClone(item);return reviewDraft(item,{title:$('title').value,description:$('description').value,price:$('price').value,condition:$('condition').value,fields:Object.fromEntries([...$('review').querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]))});}
function reviewNotes(item){return [...new Set([
 ...(item.error&&!item.analysis?[item.error]:[]),
 ...(item.status==='inventory changed'?['Inventory changed since this draft was written. Review the copy and price.']:[]),
 ...(item.analysis&&item.listingStandard!==LISTING_COPY_STANDARD?['Earlier generator: review the cached copy and attributes.']:[]),
 ...reviewSuggestions(item,tax),...(item.analysis?.flags||[])
 ])];}
function refreshValidation(item){
 const draft=readReviewDraft(item),errors=exportErrors(draft,tax),notes=reviewNotes(draft);
 const target=$('blocking');if(target){target.hidden=!errors.length;target.textContent=errors.length?'Needed for CSV export (you can still approve):\n'+errors.join('\n'):'';}
 const suggestions=$('suggestions');if(suggestions){suggestions.hidden=!notes.length;suggestions.innerHTML=notes.map(note=>'<li>'+escape(note)+'</li>').join('');}
 const summary=$('reviewCheckSummary');if(summary)summary.textContent=errors.length?'Approval saves your review. Complete the export fields before downloading CSV.':'Review these suggestions, then approve when you are satisfied.';
 reviewFeedback('Unsaved edits. Save or approve to keep changes.');
}

async function chooseCover(index){
 if(reviewSaving||index===0)return;
 if(busy)return reviewFeedback('Wait for the analysis batch to finish before changing the cover.');
 reviewSaving=true;setReviewBusy(true);
 try{const draft=coverDraft(readReviewDraft(items.get(active)),index);await persist(draft);items.set(draft.sku,draft);render();review();reviewFeedback(draft.sku+' cover saved. Review and approve this photo order.');}
 catch(e){reviewFeedback(e.message);}
 finally{reviewSaving=false;setReviewBusy(false);}
}
function navigateBatch(direction){
 if(reviewSaving)return reviewFeedback('Wait for the current save to finish.');
 const next=nextBatchSKU([...items.values()],active,selected,direction);
 if(!next)return reviewFeedback('No other unapproved items in this selection. Select another range to continue.');
 active=next;render();review();reviewFeedback('Reviewing '+next+'.');
}
async function excludeCurrent(status){
 if(busy||inventorySaving||reviewSaving)return reviewFeedback('Wait for the current action to finish.');
 const item=items.get(active);reviewSaving=true;setReviewBusy(true);
 try{const draft=setBatchStatus(item,status);await persist(draft);items.set(draft.sku,draft);selected.delete(draft.sku);
  const next=nextBatchSKU([...items.values()],draft.sku,selected);if(next)active=next;
  render();review();reviewFeedback(draft.sku+(status==='sold'?' marked sold.':' skipped for now.')+(next?' Now reviewing '+next+'.':' No more unapproved items in this selection.'));
 }catch(e){reviewFeedback(e.message);}finally{reviewSaving=false;setReviewBusy(false);}
}
async function restoreCurrent(){
 if(busy||inventorySaving||reviewSaving)return reviewFeedback('Wait for the current action to finish.');
 const item=items.get(active);reviewSaving=true;setReviewBusy(true);
 try{const draft=restoreBatchStatus(item);await persist(draft);items.set(draft.sku,draft);selected.add(draft.sku);render();review();reviewFeedback(draft.sku+' restored to the selected batch.');}
 catch(e){reviewFeedback(e.message);}finally{reviewSaving=false;setReviewBusy(false);}
}
function review(){const i=items.get(active);if(!i)return;const a=i.analysis,defaults=a?exportAttributes(a):{},preview=a?previewSellerTitle(i):null,reviewCopy=preview?.description||'',reviewTitle=preview?.analysis.title||'',blocking=preview?exportErrors(preview,tax):[];const photos=i.photos.map((p,j)=>`<div class="photo"><img src="${escape(photoPreviewURL(p,location.origin))}" loading="lazy" decoding="async" alt="${i.sku} photo ${j+1}"><button data-cover="${j}" ${j===0||excludedFromBatch(i)?'disabled':''}>${j===0?'Cover':'Make cover'}</button></div>`).join('');
 const notes=reviewNotes(preview||i);
 const checks=`<section class="reviewChecks" aria-label="Review checks"><strong>Review suggestions</strong><div id="blocking" class="blocking" ${blocking.length?'':'hidden'}>${blocking.length?'Needed for CSV export (you can still approve):\n'+escape(blocking.join('\n')):''}</div><p id="reviewCheckSummary">${a?'Your approval saves this listing even when suggestions remain.':'Generate a draft before approving.'}</p><ul id="suggestions" ${notes.length?'':'hidden'}>${notes.map(note=>'<li>'+escape(note)+'</li>').join('')}</ul><p id="reviewFeedback" role="status" aria-live="polite">${i.approved?'Approval saved.'+(blocking.length?' Complete the export fields before downloading CSV.':' Ready for CSV export.'):''}</p></section>`;

 $('review').innerHTML=`<p class="eyebrow">${i.sku} · LISTING REVIEW</p><h2>${escape(a?reviewTitle:i.source['Item Name'])}</h2><div class="reviewActions"><button id="previous" class="secondary">Previous</button><button id="next" class="secondary">Next item</button>${excludedFromBatch(i)?'<button id="restore" class="secondary">Restore to batch</button>':'<button id="skip" class="secondary">Skip for now</button><button id="markSold" class="secondary">Mark sold</button>'}</div><div class="photos">${photos}</div>${a?`<label>Optimized title<input id="title" value="${escape(reviewTitle)}"></label><div class="fields">${[['brand','Brand','brands'],['category','Category','categories'],['color','Primary color','colors'],['age','Age','ages'],['style1','Style 1','styles'],['style2','Style 2','styles'],['color2','Secondary color','colors'],['source1','Source 1','sources'],['style3','Style 3','styles']].map(([key,name,list])=>`<label>${name}<select data-field="${key}">${dropdownChoices(tax[list],a[key]??defaults[key],['age','style1','style2','color2','source1','style3'].includes(key)).map(o=>`<option value="${escape(o.value)}" ${o.selected?'selected':''} ${o.disabled?'disabled':''}>${escape(o.text)}</option>`).join('')}</select></label>`).join('')}<label>Size<input data-field="size" value="${escape(a.size)}"></label><label>Listing price<input id="price" type="number" min="0.01" step="0.01" value="${escape(i.price)}"></label><label>Condition<select id="condition">${dropdownChoices(tax.conditions,i.condition).map(o=>`<option value="${escape(o.value)}" ${o.selected?'selected':''} ${o.disabled?'disabled':''}>${escape(o.text)}</option>`).join('')}</select></label></div><p>${i.listingStandard===LISTING_COPY_STANDARD?'Secondary color and Style 3 start blank. Source 1 is Vintage only when your inventory says vintage. Use styles only when they accurately describe this item.':'Older drafts may have Multi, Vintage and Y2K defaults. Keep each only if accurate; use Not specified otherwise.'}</p>${a.evidence?.length?'<details><summary>Facts used and buyer search phrases</summary><ul>'+a.evidence.map(e=>'<li>'+escape(e.fact)+' — '+escape(e.support)+'</li>').join('')+'</ul><p>'+escape((a.searchPhrases||[]).join(' · '))+'</p></details>':''}<label>Description<textarea id="description">${escape(reviewCopy)}</textarea></label><small id="characters">${reviewCopy.length}/1,000 characters</small>${checks}${excludedFromBatch(i)?'<p>This item is excluded. Restore it before editing or approving.</p>':'<div class="reviewActions saveActions"><button id="approve">'+(i.approved?'Approved · Next':'Approve & next')+'</button><button id="saveNext" class="secondary">Save draft &amp; next</button></div>'}${i.status!=='exported'&&!excludedFromBatch(i)?'<p><button id="regenerate" class="secondary">Generate replacement (uses API credits)</button></p><small>This replaces this item’s copy and analysis and clears its approval. Originals and cover order stay the same. It does not reanalyze your batch.</small>':''}`:excludedFromBatch(i)?'<p>This item is excluded from the batch. Restore it to continue work on it.</p>':'<p>Upload photos and analyze this item to generate its listing.</p>'}${!a?checks:''}`;
 for(const b of $('review').querySelectorAll('[data-cover]'))b.onclick=()=>chooseCover(Number(b.dataset.cover));
 for(const img of $('review').querySelectorAll('.photo img')){const original=img.getAttribute('src');const retry=document.createElement('button');retry.textContent='Retry photo';retry.className='photoRetry';retry.hidden=true;img.parentElement.append(retry);img.onerror=()=>{retry.hidden=false;retry.title='The photo could not load. Retry without reanalyzing.';};img.onload=()=>{retry.hidden=true;};retry.onclick=()=>{retry.hidden=true;img.src=original+(original.includes('?')?'&':'?')+'retry='+Date.now();};}
 $('previous').onclick=()=>navigateBatch(-1);$('next').onclick=()=>navigateBatch(1);
 if($('skip'))$('skip').onclick=()=>excludeCurrent('skipped');
 if($('markSold'))$('markSold').onclick=()=>excludeCurrent('sold');
 if($('restore'))$('restore').onclick=restoreCurrent;
 if(!a||excludedFromBatch(i))return;
 if($('regenerate'))$('regenerate').onclick=async()=>{
 if(busy||reviewSaving)return;reviewSaving=true;setReviewBusy(true);reviewFeedback('Generating a replacement draft for '+i.sku+' using API credits…');
 try{const updated=await api('analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:i.sku,replace:true})});items.set(i.sku,updated);render();review();reviewFeedback(i.sku+' replacement draft generated. Review facts, copy and attributes before approving.');}
 catch(e){reviewFeedback(e.message+' Your saved draft has been retained.');}
 finally{reviewSaving=false;setReviewBusy(false);}
 };
 $('title').oninput=()=>{$('description').value=$('description').value.replace(/^[^\r\n]*/,$('title').value);$('characters').textContent=$('description').value.length+'/1,000 characters';refreshValidation(i);};
 $('description').oninput=()=>{$('title').value=$('description').value.split(/\r?\n/)[0];$('characters').textContent=$('description').value.length+'/1,000 characters';refreshValidation(i);};
 for(const field of $('review').querySelectorAll('[data-field], #price, #condition'))field.onchange=()=>refreshValidation(i);
 const save=async(approved,continueReview=false)=>{
 if(reviewSaving)return;
 if(busy||inventorySaving)return reviewFeedback('Wait for the current batch action to finish before saving a review.');
 reviewSaving=true;setReviewBusy(true);reviewFeedback(approved?'Approving '+i.sku+'…':'Saving '+i.sku+'…');
 try{
 const draft=readReviewDraft(i);
 const errors=exportErrors(draft,tax);
 draft.approved=approved;draft.status=approved?'approved':'review';draft.error='';draft.flags=[...(draft.analysis.flags||[])];
 await persist(draft);items.set(draft.sku,draft);
 const next=approved||continueReview?nextBatchSKU([...items.values()],draft.sku,selected.size?selected:new Set(items.keys())):null;
 if(next)active=next;render();review();if(next)$('review').scrollIntoView({block:'start'});
 reviewFeedback(approved?draft.sku+' approval saved.'+(errors.length?' Export fields still need attention.':' Ready for CSV export.')+(next?' Now reviewing '+next+'.':' Batch review complete. No pending items remain in this selection.'):draft.sku+' changes saved as a draft. It is not approved for export.'+(next?' Now reviewing '+next+'.':''));
 }catch(e){reviewFeedback('Not saved. '+e.message+' Your edits are still here; try again.');}
 finally{reviewSaving=false;setReviewBusy(false);}
 };$('saveNext').onclick=()=>save(false,true);$('approve').onclick=()=>save(true);
}
$('search').oninput=render;$('selectAll').onchange=e=>{if(reviewSaving)return;for(const i of visible())e.target.checked&&!excludedFromBatch(i)?selected.add(i.sku):selected.delete(i.sku);render();};$('selectRange').onclick=()=>{if(reviewSaving)return;const start=Number($('from').value.replace(/\D/g,'')),end=Number($('to').value.replace(/\D/g,''));if(!start||end<start||end-start>5000)return notice('Enter a valid SKU range of up to 5,001 numbers.');selected.clear();const found=new Set();for(const i of items.values()){const n=Number(i.sku.slice(2));if(n>=start&&n<=end){found.add(n);if(!excludedFromBatch(i))selected.add(i.sku);}}const missing=[];for(let n=start;n<=end;n++)if(!found.has(n))missing.push('AJ'+n);render();notice(selected.size+' items selected.'+(missing.length?' '+missing.length+' SKUs in this range are missing from saved inventory ('+missing.slice(0,8).join(', ')+(missing.length>8?', …':'')+'). Upload the current master inventory CSV to add them; selecting a range does not import rows.':''));};
let exportURL='';
const exportFeedback=document.createElement('div');exportFeedback.id='exportFeedback';exportFeedback.setAttribute('role','status');exportFeedback.setAttribute('aria-live','polite');$('export').after(exportFeedback);
$('export').onclick=async()=>{
 if(reviewSaving||inventorySaving||busy)return notice('Finish the current action before exporting.');
 try{
 const chosen=[...selected].map(s=>items.get(s)).filter(i=>i?.approved);
 if(!chosen.length)throw Error('Check the box beside an approved listing, then click Export approved selection.');
 const csv=exportCSV(chosen,tax,'https://studio.atlantajake.com');
 if(exportURL)URL.revokeObjectURL(exportURL);
 exportURL=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=exportURL;link.download='AtlantaJake_Depop_'+new Date().toISOString().slice(0,10)+'.csv';link.textContent='Download CSV ('+chosen.length+' '+(chosen.length===1?'listing':'listings')+')';link.className='button secondary';
 exportFeedback.replaceChildren(link,document.createTextNode(' Your CSV is ready. If the download did not start, click Download CSV. After importing, set the Depop parcel size to Small for crewnecks that fit, and set the iOS Shipping Discount to Free if the description promises free shipping. The CSV does not set either option.'));
 link.click();notice('CSV ready for '+chosen.length+' listings. Set the Depop label size and any Free shipping discount before posting.');
 const saveErrors=[];
 for(const i of chosen){const draft={...i,status:'exported'};try{await persist(draft);items.set(i.sku,draft);}catch(e){saveErrors.push(i.sku);if(e.code==='AUTH_CANCELLED'){saveErrors.push(...chosen.slice(chosen.indexOf(i)+1).map(item=>item.sku));break;}}}
 render();
 if(saveErrors.length){const warning=' CSV is ready, but export status could not be saved for '+saveErrors.join(', ')+'.';exportFeedback.append(document.createTextNode(warning));notice(warning);}
 }catch(e){exportFeedback.textContent=e.message;notice(e.message);}
};
