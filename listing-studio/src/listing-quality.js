// This records a generation standard, not a search-ranking score.
import {LISTING_COPY_STANDARD} from '../public/core.js';
export const LISTING_STANDARD=LISTING_COPY_STANDARD;
const plain=value=>String(value||'').replace(/ \([^)]*\)$/,'');
const key=value=>plain(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
export function resolveBrand(value,brands){
 if(brands.includes(value))return {brand:value,warning:''};
 const matches=brands.filter(b=>key(b)===key(value));
 if(matches.length===1)return {brand:matches[0],warning:''};
 return {brand:brands.find(b=>b==='Other (unbranded)')||'',warning:`Manufacturer ${plain(value)||'unknown'} could not be matched unambiguously to the template. Verify the tag; Other was selected.`};
}
export function listingSchema(tax){
 const string={type:'string'};
 const properties={
  evidence:{type:'array',minItems:1,maxItems:12,items:{type:'object',properties:{fact:string,support:string},required:['fact','support'],additionalProperties:false}},
  searchPhrases:{type:'array',minItems:2,maxItems:4,items:string},
  title:{type:'string',description:'Readable buyer phrase using the strongest supported identity, era/event and exact garment type. Title Case is presentation, not a ranking claim.'},
  body:{type:'string',description:'2–3 appealing customer-facing sales sentences preserving explicit seller facts. No inventory/photo-verification commentary or manufacturing-year disclaimer; put conflicts in flags.'},
  brand:{type:'string',description:'Actual maker from readable tag or reliable inventory, even if absent from brandOptions. Plain maker name accepted; server resolves against the entire template. Other if unknown.'},
  category:{type:'string',enum:['Men >> Tops >> Sweatshirts (menswear, tops, sweatshirts)']},
  color:{type:'string',enum:tax.colors},color2:{type:'string',enum:['',...tax.colors],description:'Secondary garment color only when a substantial area, such as contrasting cuffs, supports it. Blank otherwise; a multicolor printed graphic alone is not Multi fabric.'},age:{type:'string',enum:['',...tax.ages]},
  style1:{type:'string',enum:['',...tax.styles]},style2:{type:'string',enum:['',...tax.styles]},size:string,
  tagMissing:{type:'boolean'},sizeVerified:{type:'boolean'},hashtags:{type:'array',minItems:5,maxItems:5,items:string},flags:{type:'array',items:string}
 };
 return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};
}
