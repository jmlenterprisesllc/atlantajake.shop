const encoder=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function equal(a,b){const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)));const x=await digest(a),y=await digest(b);let n=0;for(let i=0;i<x.length;i++)n|=x[i]^y[i];return n===0;}
async function sign(payload,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)));}
export async function session(secret,now=Date.now()){const payload=String(now+4*60*60*1000)+'.'+crypto.randomUUID();return payload+'.'+await sign(payload,secret);}
export async function authorised(req,env,now=Date.now()){
 if(!env.ADMIN_TOKEN)return false;
 const bearer=req.headers.get('Authorization');if(bearer&&await equal(bearer,'Bearer '+env.ADMIN_TOKEN))return true;
 const value=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)aj_session=([^;]+)/)?.[1];if(!value)return false;
 const parts=value.split('.');if(parts.length!==3||!/^\d+$/.test(parts[0]))return false;const expires=Number(parts[0]);if(expires<=now||expires>now+4*60*60*1000)return false;
 return equal(parts[2],await sign(parts.slice(0,2).join('.'),env.ADMIN_TOKEN));
}
export const sessionCookie=value=>'aj_session='+value+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400';
export const logoutCookie='aj_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
export const loginPage=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in · AtlantaJake Studio</title><link rel="stylesheet" href="/studio.css"></head><body><header><span class="wordmark">ATLANTAJAKE<span>PRIVATE LISTING STUDIO</span></span></header><main><div class="intro"><div><p class="eyebrow">FOR THE ATLANTAJAKE TEAM</p><h1>Your next drop<br>starts here.</h1><p>Sign in to manage inventory, review photos and prepare listings.</p></div><form class="connect" action="/auth/login" method="post"><label>Studio password<input type="password" name="password" autocomplete="current-password" required autofocus></label><button type="submit">Sign in</button><small>This studio is restricted. Your API credentials are never entered here.</small></form></div></main></body></html>`;
export async function correctPassword(value,secret){return !!secret&&equal(value,secret);}
