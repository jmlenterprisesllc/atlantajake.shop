export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV contains an unclosed quoted field.');
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function inventoryCSV(text){const rows=parseCSV(text.replace(/^\uFEFF/,''));const h=rows.shift();if(!h?.includes('SKU')||!h.includes('Item Name')||!h.includes('RRP'))throw Error('Inventory needs SKU, Item Name and RRP columns.');const seen=new Set();return rows.map(r=>{const v=Object.fromEntries(h.map((k,i)=>[k,r[i]||'']));v.SKU=v.SKU.trim().toUpperCase();if(!/^AJ\d+$/.test(v.SKU)||seen.has(v.SKU))throw Error('Invalid or duplicate SKU: '+v.SKU);seen.add(v.SKU);return v;});}
export const LISTING_COPY_STANDARD='2026-11-12-seller-facts-v3';
export const SWEATSHIRT_CATEGORY='Men >> Tops >> Sweatshirts (menswear, tops, sweatshirts)';
export function dropdownChoices(values,current,allowBlank=false){
 const unknown=!values.includes(current)&&!(allowBlank&&current==='');
 return [...(unknown?[{value:'__invalid__',text:`Choose a valid value (saved: ${current||'missing'})`,selected:true,disabled:true}]:[]),...(allowBlank?[{value:'',text:'Not specified',selected:current==='',disabled:false}]:[]),...values.map(value=>({value,text:label(value),selected:value===current,disabled:false}))];
}
export function inventoryEra(source={}){
 const notes=[source['Era'],source['Age'],source['Item Name'],source['Description/Details']].filter(Boolean).join(' ');
 const decades=[...notes.matchAll(/\b(50|60|70|80|90|00)['’]?s\b/gi)].map(m=>m[1]);
 for(const m of notes.matchAll(/\bvintage\s+(19[5-9]\d|200\d)\b/gi))decades.push(m[1].slice(2,3)+'0');
 const unique=[...new Set(decades)];return unique.length===1?unique[0]==='00'?'00s (y2k)':unique[0]+'s ('+unique[0]+'s)':'';
}
export function attributeErrors(item,tax){
 const a=item.analysis;if(!a)return [];const errors=[];
 if(a.category!==SWEATSHIRT_CATEGORY)errors.push('Crewneck category must be Men > Tops > Sweatshirts for this studio.');
 const era=inventoryEra(item.source);if(era&&a.age&&a.age!==era)errors.push('Age conflicts with inventory: '+label(era)+'. Verify the date; select that era or leave age unspecified if dating is uncertain.');
 return errors;
}
export const label=v=>(v||'').replace(/ \([^)]*\)$/,'');
// Presentation cleanup only. Never add eras, brands or other SEO claims here.
const titleAcronyms=new Set(['USA','US','UK','NYC','LA','NFL','NBA','MLB','NHL','NCAA','NASCAR','HBCU','Y2K','ACG','DKNY','DMX','WWF','WWE','BMW','ATV','WIP','MTV','DC','2XL','3XL','4XL','XS','XXS','XL','XXL','XXXL']);
const titleSmallWords=new Set(['a','an','and','as','at','by','for','from','in','of','on','or','the','to','with']);
export function formatTitle(value){return String(value||'').trim().replace(/\s+/g,' ').split(' ').map((word,index,words)=>word.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu,part=>{
 const lower=part.toLowerCase(),upper=part.toUpperCase();
 if(titleAcronyms.has(upper))return upper;
 if(/^\d{2,4}s$/i.test(part))return lower;
 if(index>0&&index<words.length-1&&titleSmallWords.has(lower))return lower;
 // Respect spellings such as McDonald's, iPhone and Carhartt WIP.
 if(/[a-z][A-Z]/.test(part))return part;
 return lower.charAt(0).toUpperCase()+lower.slice(1);
})).join(' ');}
export function reviewDraft(item,values={}){
 const draft=structuredClone(item);if(!draft.analysis)throw Error('Analyze this item before editing its listing.');
 Object.assign(draft.analysis,values.fields||{});
 const copy=values.description??draft.description??description(draft);
 draft.analysis.title=formatTitle(values.title??copy.split(/\r?\n/)[0]??draft.analysis.title);
 draft.description=copy.replace(/^[^\r\n]*/,draft.analysis.title);
 draft.price=values.price??draft.price;draft.condition=values.condition??draft.condition;
 return draft;
}
export function coverDraft(item,index){
 if(!Number.isInteger(index)||index<0||index>=item.photos.length)throw Error('Select a valid cover photo.');
 const draft=structuredClone(item);if(index===0)return draft;
 draft.photos.unshift(draft.photos.splice(index,1)[0]);draft.approved=false;draft.status=draft.analysis?'review':'photos ready';draft.error='';
 return draft;
}
export function nextReviewSKU(list,currentSKU,selection=[]){
 const selected=new Set(selection),queue=[...list].filter(i=>!selected.has(currentSKU)||selected.has(i.sku)).sort((a,b)=>Number(a.sku.slice(2))-Number(b.sku.slice(2)));
 const position=queue.findIndex(i=>i.sku===currentSKU),ordered=[...queue.slice(position+1),...queue.slice(0,Math.max(position,0))];
 return ordered.find(i=>i.sku!==currentSKU&&i.analysis&&!i.approved&&i.status!=='exported')?.sku||null;
}
export function description(item){const a=item.analysis;if(!a)return '';return [a.title,a.body,(a.sizeVerified===true&&!a.tagMissing?'Tagged size: ':'Size: ')+a.size,'Shipping: FREE','Please message us for the exact measurements.','Open to offers!','~AtlantaJake',a.hashtags.map(x=>'#'+x.replace(/^#/, '')).join(' '),item.sku].join('\n\n');}
export function validate(item,tax){const a=item.analysis;const e=[];if(!a)return ['Analysis required'];if(!item.photos?.length)e.push('Photos missing');if(item.photos?.some(p=>!p.url?.startsWith('https://')))e.push('Upload photos before export');const d=item.description||description(item);if(!a.title?.trim())e.push('Title required');if(/\binventory (?:lists|says|notes|describes)\b|\b(?:size is unverified|unverified from photos|confirmed manufacturing year|design or copyright text|no readable (?:neck )?tag is shown)\b/i.test(d))e.push('Move internal verification commentary out of customer copy and into review notes');if(d.length>1000)e.push('Description exceeds 1,000 characters');const tags=d.match(/#[\w]+/g)||[];if(tags.length!==5)e.push('Use exactly five hashtags');else if(new Set(tags.map(t=>t.toLowerCase())).size!==5)e.push('Use five distinct hashtags');if(/\b(featuring|quirky|edgy)\b|[-–—]/i.test(d))e.push('Description contains prohibited wording or dashes');if(!Number.isFinite(Number(item.price))||Number(item.price)<=0)e.push('Price required');for(const [k,list] of [['brand','brands'],['category','categories'],['color','colors'],['age','ages'],['style1','styles'],['style2','styles']])if(!(k==='age'&&a[k]==='')&&!tax[list].includes(a[k]))e.push('Select valid '+k);if(!['S','M','L','XL','XXL','XS','XXS','3XL','4XL','One size'].includes(a.size))e.push('Check crewneck size');for(const [k,list] of [['color2','colors'],['source1','sources'],['style3','styles']])if(a[k]!==undefined&&a[k]!==''&&!tax[list].includes(a[k]))e.push('Select valid '+k);if(!tax.conditions.includes(item.condition))e.push('Condition required');e.push(...attributeErrors(item,tax));return e;}
export function photoDeliveryURL(photo,origin){
 if(!origin||photo.provider!=='drive')return photo.url;
 const current=new URL(photo.url),target=new URL(origin);
 if(target.protocol!=='https:'||!/^\/photos\/drive\/AJ\d+\/[A-Za-z0-9_-]{10,200}\/[a-f0-9]{64}(?:\/image\.(?:jpg|png|webp))?$/.test(current.pathname))throw Error('Invalid photo delivery URL');
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[photo.mimeType]||current.pathname.match(/\/image\.(jpg|png|webp)$/)?.[1]||'jpg';
 return target.origin+current.pathname.replace(/\/image\.(jpg|png|webp)$/,'')+'/image.'+ext;
}
export function exportAttributes(a){return {color2:a.color2??'Multi (multi)',source1:a.source1??'Vintage (vintage)',style3:a.style3??'Y2K (y2_k)'};}
export function listingRow(item,tax,photoOrigin){const a=item.analysis,copy=item.description||description(item),exportDescription=copy.replace(/^[^\r\n]*/,formatTitle(copy.split(/\r?\n/)[0]));return Object.fromEntries(tax.headers.map(h=>[h,({'Description':exportDescription,'Category':a.category,'Price':item.price,'Brand':a.brand,'Condition':item.condition,'Size':a.size,'Color 1':a.color,'Color 2':exportAttributes(a).color2,'Source 1':exportAttributes(a).source1,'Source 2':'Preloved (preloved)','Age':a.age,'Style 1':a.style1,'Style 2':a.style2,'Style 3':exportAttributes(a).style3,'Location':'Atlanta, United States','Domestic Shipping price':'0','International Shipping price':'25','SKU':item.sku,...Object.fromEntries((item.photos||[]).map((p,i)=>[i===0?'Picture Hero url':`Picture ${i+1} url`,photoDeliveryURL(p,photoOrigin)]))})[h]??'']));}
export function exportCSV(items,tax,photoOrigin){if(!items.length||items.length>100)throw Error('Export 1–100 listings at a time.');for(const i of items){const e=validate(i,tax);if(e.length||!i.approved)throw Error(i.sku+': '+(e.join('; ')||'Review and approve first'));}const records=[['Template version: 6',...Array(25).fill('')],tax.headers,tax.instructions,...items.map(i=>{const r=listingRow(i,tax,photoOrigin);return tax.headers.map(h=>r[h]);})];return records.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function importItem(source){const price=Number(source.RRP.replace(/[^\d.]/g,''));return {sku:source.SKU,source,price:price>0?(Math.round(price*125)/100).toFixed(2):'',condition:({'A':'Used - Excellent (used_excellent)','AB':'Used - Good (used_good)','B':'Used - Fair (used_fair)'})[source.Condition]||'',photos:[],approved:false,status:'new'};}
