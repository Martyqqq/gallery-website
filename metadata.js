// Read embedded metadata only when Details opens; successful results are cached per session.
const cache = new Map();
const MAX_BYTES = 40 * 1024 * 1024;
const labels = {
 Make:'Camera manufacturer', Model:'Camera model', LensModel:'Lens',
 DateTimeOriginal:'Capture date', CreateDate:'Digitized date', ModifyDate:'Modified date',
 ExposureTime:'Shutter speed', FNumber:'Aperture', ISO:'ISO', FocalLength:'Focal length',
 ExposureCompensation:'Exposure compensation', MeteringMode:'Metering mode', Flash:'Flash',
 WhiteBalance:'White balance', ColorSpace:'Color space', Orientation:'Orientation',
 ExifImageWidth:'EXIF width', ExifImageHeight:'EXIF height', ImageWidth:'Image width',
 ImageHeight:'Image height', latitude:'GPS latitude', longitude:'GPS longitude',
 Artist:'Artist', Copyright:'Copyright', ImageDescription:'Description', Software:'Software'
};
function format(key, value) {
 if(value instanceof Date) {
  // EXIF timestamps normally describe the camera clock, not a known timezone.
  const pad=n=>String(n).padStart(2,'0');
  return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
 }
 if(key==='ExposureTime' && typeof value==='number')return value>0&&value<1?`1/${Math.round(1/value)} s`:`${value} s`;
 if(key==='FNumber')return `f/${value}`;
 if(key==='FocalLength')return `${value} mm`;
 if(['string','number','boolean'].includes(typeof value))return String(value);
 if(Array.isArray(value)&&value.length<=8&&value.every(v=>['string','number'].includes(typeof v)))return value.join(', ');
 return null;
}
export function rowsFromExif(tags) {
 return Object.entries(tags).flatMap(([key,value])=>{
  const formatted=format(key,value);
  return formatted!==null&&formatted!==''?[[labels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2'),formatted]]:[];
 });
}
export function combineMetadata(automatic, overrides={}) {
 const result={...automatic};
 for(const [key,value] of Object.entries(overrides)) {
  if(value===null||value==='')delete result[key];
  else result[key]=String(value);
 }
 return result;
}
export function coordinates(fields) {
 const lat=fields['GPS latitude'],lon=fields['GPS longitude'];
 if(lat===undefined||lon===undefined||String(lat).trim()===''||String(lon).trim()==='')return null;
 const latitude=Number(lat),longitude=Number(lon);
 return Number.isFinite(latitude)&&Math.abs(latitude)<=90&&Number.isFinite(longitude)&&Math.abs(longitude)<=180?{latitude,longitude}:null;
}
export async function extractExif(bytes, parse) {
 const data=new Uint8Array(bytes);
 // exifr handles JPEG/PNG/TIFF/HEIC; extract a WebP EXIF chunk explicitly.
 if(String.fromCharCode(...data.slice(0,4))==='RIFF'&&String.fromCharCode(...data.slice(8,12))==='WEBP'){
  const view=new DataView(bytes);
  for(let offset=12;offset+8<=data.length;){
   const name=String.fromCharCode(...data.slice(offset,offset+4));const length=view.getUint32(offset+4,true);
   if(offset+8+length>data.length)throw Error('Incomplete WebP data.');
   if(name==='EXIF'){
    let start=offset+8;
    if(String.fromCharCode(...data.slice(start,start+4))==='Exif')start+=6;
    return await parse(bytes.slice(start,offset+8+length),{gps:true})||{};
   }
   offset+=8+length+(length%2);
  }
  return {};
 }
 return await parse(bytes,{gps:true})||{};
}
async function readPart(url, rangeBytes) {
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(url,{mode:'cors',credentials:'omit',signal:controller.signal,headers:rangeBytes?{Range:`bytes=0-${rangeBytes-1}`}:{}});
  if(!response.ok)throw Error(`Photo request failed (${response.status}).`);
  const partial=response.status===206;
  const limit=partial?rangeBytes:MAX_BYTES;
  const contentRange=response.headers.get('Content-Range');
  const match=contentRange?.match(/^bytes 0-(\d+)\/(\d+)$/i);
  if(partial&&!match){controller.abort();throw Error('R2 must expose the Content-Range header in its CORS policy.');}
  if(Number(response.headers.get('Content-Length'))>limit){controller.abort();throw Error('The server returned too much image data. Check byte-range support or use a smaller metadata source.');}
  const reader=response.body.getReader();const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('Metadata download exceeded its byte limit.');}chunks.push(value);}
  const buffer=new Uint8Array(length);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const {parse}=await import('./vendor/exifr.mjs');
  const size=partial?Number(match[2]):length;
  let tags;
  try {
   tags=await extractExif(buffer.buffer,parse);
   if(partial&&length<size&&!Object.keys(tags).length)throw Error('No metadata was found in this portion of the file.');
  } catch(error) {
   if(partial&&length<size)error.retryLargerRange=true;
   throw error;
  }
  return {fields:Object.fromEntries(rowsFromExif(tags)),size,type:response.headers.get('Content-Type')?.split(';')[0]||'',hasExif:Object.keys(tags).length>0};
 }finally{clearTimeout(timer);}
}
async function read(url) {
 // TIFF/DNG metadata is often near the beginning. Large originals need not
 // be downloaded in full. Retry larger portions only on parsing failures.
 const isTiff=/\.(dng|tiff?|nef|arw|cr2)(?:[?#]|$)/i.test(url);
 if(!isTiff)return readPart(url);
 const ranges=[1,4,16].map(mib=>mib*1024*1024);
 for(let index=0;index<ranges.length;index++){
  try{return await readPart(url,ranges[index]);}
  catch(error){if(!error.retryLargerRange||index===ranges.length-1)throw error;}
 }
}
export function readMetadata(url) {
 if(!cache.has(url))cache.set(url,read(url).catch(error=>{cache.delete(url);throw error;}));
 return cache.get(url);
}
