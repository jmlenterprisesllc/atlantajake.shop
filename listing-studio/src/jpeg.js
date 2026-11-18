function mpPrimarySize(bytes,start,end){
 try{
  const base=start+6,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const little=bytes[base]===73&&bytes[base+1]===73;
  if(!little&&!(bytes[base]===77&&bytes[base+1]===77))return 0;
  const u16=p=>{if(p<base||p+2>end)throw Error();return view.getUint16(p,little);};
  const u32=p=>{if(p<base||p+4>end)throw Error();return view.getUint32(p,little);};
  if(u16(base+2)!==42)return 0;
  const ifd=base+u32(base+4),count=u16(ifd);if(count>64)return 0;
  for(let n=0;n<count;n++){const entry=ifd+2+n*12;if(u16(entry)===0xb002&&u32(entry+4)>=16){const mp=base+u32(entry+8);return u32(mp+4);}}
 }catch{}return 0;
}
// Extract the primary JPEG from MPF/MPO containers. Keep encoded image data,
// EXIF orientation and ICC profile unchanged; no pixel decode or recompression.
export function primaryJPEG(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG signature');
 const parts=[bytes.subarray(0,2)];let pos=2,mpo=false,primaryEnd=0;
 const finish=()=>{const size=parts.reduce((n,p)=>n+p.length,0),output=new Uint8Array(size);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return {bytes:output,normalized:true};};
 while(pos<bytes.length){
  const start=pos;if(bytes[pos++]!==255)throw Error('Invalid JPEG marker');
  while(bytes[pos]===255)pos++;
  const marker=bytes[pos++];
  if(marker===217){parts.push(bytes.subarray(start,pos));if(!mpo)return {bytes,normalized:false};return finish();}
  if(marker===1||(marker>=208&&marker<=215)){parts.push(bytes.subarray(start,pos));continue;}
  if(pos+2>bytes.length)throw Error('Truncated JPEG segment');
  const length=bytes[pos]*256+bytes[pos+1],end=pos+length;
  if(length<2||end>bytes.length)throw Error('Invalid JPEG segment length');
  const mpf=marker===226&&length>=6&&bytes[pos+2]===77&&bytes[pos+3]===80&&bytes[pos+4]===70&&bytes[pos+5]===0;
  if(mpf){mpo=true;primaryEnd=mpPrimarySize(bytes,pos,end);}else parts.push(bytes.subarray(start,end));
  pos=end;
  if(marker===218){
   if(mpo&&primaryEnd>=pos+2&&primaryEnd<=bytes.length&&bytes[primaryEnd-2]===255&&bytes[primaryEnd-1]===217){parts.push(bytes.subarray(pos,primaryEnd));return finish();}
   // Entropy data can contain escaped FF bytes and restart markers. Other
   // markers begin a new segment (including progressive scans and final EOI).
   const scanStart=pos;let scan=pos,found=false;
   while(scan<bytes.length){const next=bytes.indexOf(255,scan);if(next<0)break;let at=next+1;while(bytes[at]===255)at++;const code=bytes[at];if(code===0||(code>=208&&code<=215)){scan=at+1;continue;}pos=next;found=true;break;}
   if(!found)throw Error('JPEG end marker missing');
   parts.push(bytes.subarray(scanStart,pos));
  }
 }
 throw Error('JPEG end marker missing');
}
