import {primaryJPEG} from './jpeg.js';
import {SignJWT,importPKCS8} from 'jose';
const ID=/^[A-Za-z0-9_-]{10,200}$/;
const FOLDER='application/vnd.google-apps.folder';
const extension=type=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type];
let cachedToken;
export const driveReady=env=>!!env.GOOGLE_SERVICE_ACCOUNT_JSON&&!!env.DRIVE_ROOT_FOLDER_ID&&!!env.PHOTO_LINK_SECRET;
function requireID(id){if(!ID.test(id||''))throw Error('Invalid Drive identifier');return id;}
export async function driveToken(env){
 const account=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}');
 if(!account.client_email||!account.private_key)throw Error('Drive credentials are not configured');
 // Token is isolate-local and never sent to the browser or stored in records.
 if(cachedToken?.credential===env.GOOGLE_SERVICE_ACCOUNT_JSON&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
 const key=await importPKCS8(account.private_key,'RS256');
 const jwt=await new SignJWT({scope:'https://www.googleapis.com/auth/drive.readonly'})
 .setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuer(account.client_email)
 .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
 const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
 if(!result.ok)throw Error('Drive authorization failed. Check the service account credential.');
 const token=await result.json();if(!token.access_token)throw Error('Drive returned no access token');
 cachedToken={credential:env.GOOGLE_SERVICE_ACCOUNT_JSON,value:token.access_token,expires:Date.now()+Number(token.expires_in||3600)*1000};return token.access_token;
}
export async function driveRequest(env,path,params={}){
 const url=new URL('https://www.googleapis.com/drive/v3/'+path);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);
 const response=await fetch(url,{headers:{Authorization:'Bearer '+await driveToken(env)}});
 if(!response.ok)throw Error('Drive request failed ('+response.status+'). Confirm the folder is shared with the studio service account.');return response;
}
export async function driveMeta(env,id){return(await driveRequest(env,'files/'+requireID(id),{fields:'id,name,mimeType,parents,trashed,size,modifiedTime,md5Checksum',supportsAllDrives:'true'})).json();}
export async function childFiles(env,parent){requireID(parent);const files=[];let pageToken='';do{const result=await(await driveRequest(env,'files',{q:`'${parent}' in parents and trashed = false`,pageSize:'1000',fields:'nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,md5Checksum)',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})})).json();files.push(...result.files);pageToken=result.nextPageToken||'';if(files.length>10000)throw Error('Folder exceeds the pilot scan limit.');}while(pageToken);return files;}
export async function skuFolders(env){const root=await driveMeta(env,env.DRIVE_ROOT_FOLDER_ID);if(root.trashed||root.mimeType!==FOLDER)throw Error('Configured Drive root is not a folder');return(await childFiles(env,root.id)).filter(f=>f.mimeType===FOLDER&&/^AJ\d+$/i.test(f.name)).map(f=>({sku:f.name.toUpperCase(),folderId:f.id})).sort((a,b)=>Number(a.sku.slice(2))-Number(b.sku.slice(2)));}
export async function confirmFolder(env,sku,folderId){const folder=await driveMeta(env,folderId);if(folder.trashed||folder.mimeType!==FOLDER||folder.name.toUpperCase()!==sku||!folder.parents?.includes(env.DRIVE_ROOT_FOLDER_ID))throw Error('SKU folder must be a direct child of the configured photo root.');return folder;}
async function signature(env,sku,id){if(!env.PHOTO_LINK_SECRET)throw Error('Photo link secret missing');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.PHOTO_LINK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(env.DRIVE_ROOT_FOLDER_ID+'/'+sku+'/'+id));return Array.from(new Uint8Array(signed),v=>v.toString(16).padStart(2,'0')).join('');}
export async function drivePhotos(env,sku,folderId,origin){await confirmFolder(env,sku,folderId);const all=await childFiles(env,folderId);const photos=all.filter(f=>['image/jpeg','image/png','image/webp'].includes(f.mimeType));
 const unsupported=all.filter(f=>f.mimeType.startsWith('image/')&&!photos.includes(f));if(unsupported.length)throw Error('Convert unsupported image types to JPEG: '+unsupported.map(f=>f.name).join(', '));
 if(!photos.length||photos.length>8)throw Error(sku+' needs 1–8 images; found '+photos.length+'. No files were discarded.');
 photos.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 return Promise.all(photos.map(async f=>({provider:'drive',fileId:f.id,folderId,name:f.name,mimeType:f.mimeType,modifiedTime:f.modifiedTime,checksum:f.md5Checksum||'',url:origin+'/photos/drive/'+sku+'/'+f.id+'/'+await signature(env,sku,f.id)+'/image.'+extension(f.mimeType)})));
}
export async function verifyPhoto(env,sku,photo){requireID(photo.fileId);requireID(photo.folderId);await confirmFolder(env,sku,photo.folderId);const file=await driveMeta(env,photo.fileId);if(file.trashed||!file.parents?.includes(photo.folderId)||!['image/jpeg','image/png','image/webp'].includes(file.mimeType))throw Error('Photo no longer belongs to this SKU folder.');return file;}
export async function photoResponse(req,env,sku,id,sig){
 if(!driveReady(env)||!/^AJ\d+$/.test(sku)||!ID.test(id)||!/^[a-f0-9]{64}$/.test(sig))return new Response('Not found',{status:404});
 const expected=await signature(env,sku,id);let difference=0;for(let j=0;j<64;j++)difference|=sig.charCodeAt(j)^expected.charCodeAt(j);if(difference)return new Response('Not found',{status:404});
 // Recheck folder membership on every request; a moved or trashed original stops delivery.
 const file=await driveMeta(env,id);const folderId=file.parents?.[0];if(!folderId||file.trashed)return new Response('Not found',{status:404});
 await verifyPhoto(env,sku,{fileId:id,folderId});
 const headers={'Content-Type':file.mimeType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Expose-Headers':'Content-Length, Content-Type','Content-Disposition':'inline; filename="'+sku+'-'+id+'.'+extension(file.mimeType)+'"'};
 if(file.size&&/^\d+$/.test(String(file.size)))headers['Content-Length']=String(file.size);
 if(req.method==='OPTIONS'){delete headers['Content-Length'];return new Response(null,{status:204,headers});}
 if(req.method==='HEAD'&&file.mimeType!=='image/jpeg')return new Response(null,{headers});
 const result=await driveRequest(env,'files/'+id,{alt:'media',supportsAllDrives:'true'});
 if(file.mimeType==='image/jpeg'){
 const original=new Uint8Array(await result.arrayBuffer()),prepared=primaryJPEG(original);
 headers['Content-Length']=String(prepared.bytes.byteLength);headers['X-Photo-Format']=prepared.normalized?'primary-jpeg-from-mpo':'jpeg';
 return new Response(req.method==='HEAD'?null:prepared.bytes,{headers});
 }
 return new Response(result.body,{headers});
}
