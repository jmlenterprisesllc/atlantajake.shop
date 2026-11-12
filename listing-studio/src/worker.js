import {driveReady,skuFolders,drivePhotos,photoResponse} from './drive.js';
import {authorised,session,sessionCookie,logoutCookie,loginPage,correctPassword} from './auth.js';
import {description,validate,formatTitle} from '../public/core.js';
import {LISTING_INSTRUCTIONS} from './listing-prompt.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const skuOK=s=>/^AJ\d+$/.test(s);
export default {async fetch(req,env){
 try{
 const u=new URL(req.url),path=u.pathname;
 const dp=path.match(/^\/photos\/drive\/(AJ\d+)\/([A-Za-z0-9_-]{10,200})\/([a-f0-9]{64})(?:\/image\.(?:jpg|png|webp))?$/);
 if(dp&&req.method==='OPTIONS')return photoResponse(req,env,dp[1],dp[2],dp[3]);
 const privateHeaders={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
 if(!['GET','HEAD'].includes(req.method)&&(req.headers.get('Sec-Fetch-Site')==='cross-site'||req.headers.get('Origin')&&req.headers.get('Origin')!==u.origin))return json({error:'Cross-site request rejected'},403);
 if(path==='/login'&&req.method==='GET')return new Response(loginPage,{headers:{...privateHeaders,'Content-Type':'text/html;charset=utf-8'}});
 if(path==='/auth/login'&&req.method==='POST'){
 if(!env.ADMIN_TOKEN)return new Response('Studio sign-in is not configured yet.',{status:503,headers:privateHeaders});
 const body=await req.text();if(body.length>4096)return json({error:'Invalid sign-in request'},400);
 if(!await correctPassword(new URLSearchParams(body).get('password')||'',env.ADMIN_TOKEN))return new Response('Incorrect password. Return to the sign-in page and try again.',{status:401,headers:privateHeaders});
 return new Response(null,{status:303,headers:{...privateHeaders,Location:'/', 'Set-Cookie':sessionCookie(await session(env.ADMIN_TOKEN))}});
 }
 if(path==='/auth/logout'&&req.method==='POST')return new Response(null,{status:303,headers:{...privateHeaders,Location:'/login','Set-Cookie':logoutCookie}});
 if(path==='/studio.css'&&req.method==='GET')return env.ASSETS.fetch(req);


 if(dp){
 if(!['GET','HEAD'].includes(req.method))return json({error:'Method not allowed'},405);
 const started=Date.now();let response;
 try{response=await photoResponse(req,env,dp[1],dp[2],dp[3]);}
 catch{response=json({error:'Photo delivery failed.'},502);}
 console.info('PHOTO_DELIVERY '+JSON.stringify({sku:dp[1],method:req.method,status:response.status,contentType:response.headers.get('Content-Type'),declaredBytes:response.headers.get('Content-Length'),imageFormat:response.headers.get('X-Photo-Format'),elapsedMs:Date.now()-started,client:(req.headers.get('User-Agent')||'unknown').slice(0,160)}));
 return response;
 }
 if(path.startsWith('/photos/')){if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'Method not allowed'},405);const key=path.slice(8);if(!/^AJ\d+\/[a-f0-9]{64}\.jpg$/.test(key))return json({error:'Not found'},404);if(!env.PHOTOS)return json({error:'Not found'},404);const o=await env.PHOTOS.get(key);if(!o)return json({error:'Not found'},404);return new Response(req.method==='HEAD'?null:o.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});}
 if(!path.startsWith('/api/')){if(!await authorised(req,env))return new Response(null,{status:303,headers:{...privateHeaders,Location:'/login'}});const r=await env.ASSETS.fetch(req);const h=new Headers(r.headers);h.set('Cache-Control','no-store');h.set('X-Robots-Tag','noindex, nofollow');h.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");h.set('Referrer-Policy','no-referrer');return new Response(r.body,{status:r.status,headers:h});}
 if(!await authorised(req,env))return json({error:'Enter your studio access token.'},401);
 if(path==='/api/status')return json({storage:!!env.PHOTOS,database:!!env.DB,analysis:!!env.OPENAI_API_KEY&&!!env.OPENAI_MODEL,inventory:!!env.INVENTORY_CSV_URL,drive:driveReady(env)});
 if(path==='/api/inventory'){if(!env.INVENTORY_CSV_URL)return json({error:'Inventory connection not configured. Import an inventory CSV instead.'},503);const r=await fetch(env.INVENTORY_CSV_URL);if(!r.ok)return json({error:'Inventory sheet is unavailable. Import its CSV instead.'},502);return new Response(await r.text(),{headers:{'Content-Type':'text/csv','Cache-Control':'no-store'}});}
 if(!env.DB)return json({error:'Database setup required.'},503);
 if(path==='/api/drive/folders'&&req.method==='GET'){if(!driveReady(env))return json({error:'Connect the studio Drive service account first.'},503);return json(await skuFolders(env));}
 if(path==='/api/drive/import'&&req.method==='POST'){
 if(!driveReady(env))return json({error:'Drive connection not configured.'},503);
 const {sku,folderId}=await req.json();if(!skuOK(sku))return json({error:'Invalid SKU'},400);
 const row=await env.DB.prepare('SELECT data FROM items WHERE sku=?').bind(sku).first();if(!row)return json({error:'Import inventory for this SKU first.'},400);
 const item=JSON.parse(row.data);if(item.status==='exported')return json({error:'Already exported; review import results before replacing photos.'},409);
 const photos=await drivePhotos(env,sku,folderId,u.origin);
 const same=JSON.stringify(item.photos?.map(p=>[p.fileId,p.checksum,p.modifiedTime]))===JSON.stringify(photos.map(p=>[p.fileId,p.checksum,p.modifiedTime]));
 if(!same){item.photos=photos;item.analysis=null;item.description='';item.approved=false;item.status='photos ready';item.error='';}
 await env.DB.prepare('UPDATE items SET data=?,updated=? WHERE sku=?').bind(JSON.stringify(item),Date.now(),sku).run();return json(item);
 }
 if(path==='/api/items'&&req.method==='GET'){const r=await env.DB.prepare('SELECT data FROM items ORDER BY sku').all();return json(r.results.map(r=>JSON.parse(r.data)));}
 const m=path.match(/^\/api\/items\/(AJ\d+)$/);
 if(m&&req.method==='PUT'){if(Number(req.headers.get('Content-Length')||0)>1000000)return json({error:'Item too large'},413);const data=await req.json();if(data.sku!==m[1]||JSON.stringify(data).length>1000000||data.photos?.length>8)return json({error:'Invalid item'},400);await env.DB.prepare('INSERT INTO items(sku,data,updated) VALUES(?,?,?) ON CONFLICT(sku) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(m[1],JSON.stringify(data),Date.now()).run();return json({saved:true});}
 const upload=path.match(/^\/api\/upload\/(AJ\d+)\/([a-f0-9]{64})$/);
 if(upload&&['PUT','HEAD'].includes(req.method)){if(!env.PHOTOS)return json({error:'Mac uploads are disabled; import photos from Drive.'},503);const key=upload[1]+'/'+upload[2]+'.jpg';const url=u.origin+'/photos/'+key;
 if(req.method==='HEAD')return new Response(null,{status:await env.PHOTOS.head(key)?200:404});
 const bytes=await req.arrayBuffer();if(bytes.byteLength>5*1024*1024||bytes.byteLength<3||new Uint8Array(bytes)[0]!==255||new Uint8Array(bytes)[1]!==216)return json({error:'JPEG up to 5 MB required'},400);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(digest!==upload[2])return json({error:'Photo checksum mismatch'},400);
 await env.PHOTOS.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});return json({key,url});}
 if(path==='/api/analyze'&&req.method==='POST'){
 if(!env.OPENAI_API_KEY||!env.OPENAI_MODEL)return json({error:'Connect an OpenAI API key and model before analysis.'},503);
 const {sku}=await req.json();if(!skuOK(sku))return json({error:'Invalid SKU'},400);
 const record=await env.DB.prepare('SELECT data FROM items WHERE sku=?').bind(sku).first();if(!record)return json({error:'Item not found'},404);const item=JSON.parse(record.data);
 if(item.analysis)return json(item); // Repeated clicks must not create repeat charges.
 if(!item.photos?.length||item.photos.length>8||item.photos.some(p=>p.provider==='drive'?(!driveReady(env)||!p.fileId||!p.folderId):!new RegExp('^'+sku+'/[a-f0-9]{64}\\.jpg$').test(p.key)))return json({error:'Upload 1–8 matching photos first'},400);
 const tax=await (await env.ASSETS.fetch(new Request(u.origin+'/taxonomy.json'))).json();
 const candidates=tax.brands.filter(b=>{const name=b.split(' (')[0].toLowerCase();return name==='other'||name.length>2&&(JSON.stringify(item.source).toLowerCase().includes(name)||['champion','fruit of the loom','tultex','hanes','jerzees','lee','harley davidson','polo ralph lauren','guess','disney','looney tunes','jansport'].includes(name));});
 const lease=await env.DB.prepare('INSERT INTO analysis_locks(sku,expires) VALUES(?,?) ON CONFLICT(sku) DO UPDATE SET expires=excluded.expires WHERE expires<?').bind(sku,Date.now()+600000,Date.now()).run();
 if(!lease.meta.changes)return json({error:'This item is already being analyzed. Wait before retrying.'},409);
 try {
 const driveSets=new Map();
 const content=[{type:'input_text',text:JSON.stringify({inventory:item.source,brandOptions:candidates,colors:tax.colors,ages:tax.ages,styles:tax.styles,category:'Men >> Tops >> Sweatshirts (menswear, tops, sweatshirts)'})}];
 for(const p of item.photos){if(p.provider==='drive'){if(!driveSets.has(p.folderId))driveSets.set(p.folderId,await drivePhotos(env,sku,p.folderId,u.origin));const current=driveSets.get(p.folderId);const match=current.find(f=>f.fileId===p.fileId);if(!match)return json({error:'Photo missing from SKU folder'},400);content.push({type:'input_image',image_url:match.url,detail:'high'});}else{if(!env.PHOTOS||!await env.PHOTOS.head(p.key))return json({error:'Photo missing; reupload '+p.name},400);content.push({type:'input_image',image_url:u.origin+'/photos/'+p.key,detail:'high'});}}
 const properties=Object.fromEntries(['title','body','brand','category','color','age','style1','style2','size'].map(k=>[k,{type:'string'}]));properties.title.description='A concise, factual Depop search title in Title Case, with verified identifying words and Crewneck Sweatshirt in natural order.';properties.tagMissing={type:'boolean'};properties.hashtags={type:'array',items:{type:'string'}};properties.flags={type:'array',items:{type:'string'}};
 const result=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL,store:false,instructions:LISTING_INSTRUCTIONS,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'depop_listing',strict:true,schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}},max_output_tokens:1800})});
 if(!result.ok)return json({error:'Image analysis failed ('+result.status+'). Check account billing/model access; retry manually.'},502);
 const response=await result.json();const text=response.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');if(!text)return json({error:'Analysis returned no listing. Review model response before retrying.'},502);
 item.analysis=JSON.parse(text);item.analysis.title=formatTitle(item.analysis.title);item.description=description(item);item.flags=[...item.analysis.flags,...validate(item,tax)];item.approved=false;item.status='review';item.usage=response.usage;
 await env.DB.prepare('UPDATE items SET data=?,updated=? WHERE sku=?').bind(JSON.stringify(item),Date.now(),sku).run();return json(item);
 } finally { await env.DB.prepare('DELETE FROM analysis_locks WHERE sku=?').bind(sku).run(); }
 }
 return json({error:'Not found'},404);
 }catch(e){return json({error:'Request failed. Check setup or input and retry.'},500);}
}};
