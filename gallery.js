import {readMetadata,combineMetadata,coordinates} from './metadata.js';
const $=id=>document.getElementById(id);
const rail=$('gallery'),dialog=$('details');
let photos=[],selected=null,returnFocus=null,map=null,mapResize=null,requestId=0,observer;
const images=new Map();
const safeUrl=value=>{const url=new URL(value,document.baseURI);if(!['http:','https:'].includes(url.protocol))throw Error('Use an HTTPS photo URL or relative file path.');return url.href;};
function validate(data){
 if(!Array.isArray(data))throw Error('photos.json must contain an array.');
 const ids=new Set();
 return data.map((photo,index)=>{
  if(!photo||typeof photo.imageUrl!=='string')throw Error(`Photo ${index+1} needs an imageUrl.`);
  const p={...photo,id:String(photo.id??index),imageUrl:safeUrl(photo.imageUrl)};
  if(ids.has(p.id))throw Error(`Duplicate photo id: ${p.id}`);ids.add(p.id);
  if(p.metadataUrl)p.metadataUrl=safeUrl(p.metadataUrl);
  if(p.metadataMode!==undefined&&!['auto','manual'].includes(p.metadataMode))throw Error('metadataMode must be auto or manual.');
  if(p.metadata!==undefined&&(!p.metadata||typeof p.metadata!=='object'||Array.isArray(p.metadata)||Object.values(p.metadata).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v))))throw Error('Metadata overrides must be a plain object of text or numbers.');
  if(p.notes!==undefined&&typeof p.notes!=='string')throw Error('Notes must be plain text.');
  if(p.creditUrl)p.creditUrl=safeUrl(p.creditUrl);
  return p;
 });
}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function position(){
 const max=rail.scrollWidth-rail.clientWidth;$('progress').style.transform=`translateX(${max>0?rail.scrollLeft/max*300:0}%)`;
 let active=0,distance=Infinity;const center=rail.scrollLeft+rail.clientWidth/2;
 [...rail.children].forEach((el,i)=>{const d=Math.abs(el.offsetLeft+el.offsetWidth/2-center);if(d<distance){distance=d;active=i;}});
 $('counter').textContent=`${String(photos.length?active+1:0).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')}`;
}
function render(){
 rail.replaceChildren();images.clear();observer?.disconnect();
 observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.loadImage();observer.unobserve(entry.target);}}),{root:rail,rootMargin:'0px 80%'});
 photos.forEach((photo,index)=>{
  const card=element('article','gallery-item'),stage=element('div','photo-stage'),img=element('img','photograph'),reflection=element('div','reflection'),mirror=element('img');
  img.alt=photo.alt||photo.title||`Photograph ${index+1}`;img.decoding='async';img.draggable=false;if(index===0)img.fetchPriority='high';
  mirror.alt='';mirror.draggable=false;mirror.decoding='async';reflection.setAttribute('aria-hidden','true');reflection.append(mirror);
  img.addEventListener('load',()=>{card.style.setProperty('--ratio',img.naturalWidth/img.naturalHeight);mirror.src=img.currentSrc;position();});
  img.addEventListener('error',()=>{stage.replaceChildren(element('p','photo-error','Photograph unavailable.'));});
  stage.append(img);images.set(photo.id,img);
  const caption=element('div','photo-caption'),button=element('button','details-button');button.append(document.createTextNode('Details '),element('span','','+'));button.setAttribute('aria-label',`Details for ${photo.title||img.alt}`);button.addEventListener('click',()=>openDetails(photo,button));
  caption.append(element('span','',String(index+1).padStart(2,'0')),button);card.append(stage,reflection,caption);rail.append(card);
  card.loadImage=()=>{img.src=photo.imageUrl;};if(index<2)card.loadImage();else observer.observe(card);
 });
 position();
}
async function load(){
 $('message').textContent='Opening the archive…';$('message').hidden=false;rail.hidden=true;
 try{const r=await fetch('./photos.json',{cache:'no-cache'});if(!r.ok)throw Error('Could not load photos.json.');photos=validate(await r.json());
  if(!photos.length){$('message').textContent='The archive is waiting for its first photograph.';return;}
  $('message').hidden=true;rail.hidden=false;render();
 }catch(error){$('message').textContent=`The archive could not load. ${error.message}`;const retry=element('button','retry','Try again');retry.onclick=load;$('message').append(retry);}
}
rail.addEventListener('wheel',e=>{if(e.ctrlKey||Math.abs(e.deltaX)>=Math.abs(e.deltaY))return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rail.clientWidth:1);if(delta>0?rail.scrollLeft<rail.scrollWidth-rail.clientWidth-1:rail.scrollLeft>0){e.preventDefault();rail.scrollLeft+=delta;}},{passive:false});
rail.addEventListener('scroll',position,{passive:true});window.addEventListener('resize',position);
rail.addEventListener('keydown',e=>{if(e.target!==rail)return;const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home'||e.key==='End')rail.scrollTo({left:e.key==='Home'?0:rail.scrollWidth,behavior});else rail.scrollBy({left:(e.key==='ArrowRight'?1:-1)*rail.clientWidth*.65,behavior});}});
let drag=null;rail.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('button,a'))return;drag={x:e.clientX,left:rail.scrollLeft};rail.setPointerCapture(e.pointerId);});rail.addEventListener('pointermove',e=>{if(drag)rail.scrollLeft=drag.left-(e.clientX-drag.x);});for(const event of ['pointerup','pointercancel','lostpointercapture'])rail.addEventListener(event,()=>drag=null);
function clearMap(){mapResize?.disconnect();mapResize=null;map?.remove();map=null;$('map').hidden=true;$('map-status').textContent='';}
$('close-details').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{requestId++;clearMap();returnFocus?.focus();});
$('retry-metadata').onclick=()=>fillDetails(selected);
function openDetails(photo,button){selected=photo;returnFocus=button;$('photo-title').textContent=photo.title||images.get(photo.id).alt;$('notes').textContent=photo.notes||'No notes added for this photograph.';$('credit').replaceChildren();if(photo.credit){const credit=photo.creditUrl?element('a','',photo.credit):element('span','',photo.credit);if(photo.creditUrl){credit.href=photo.creditUrl;credit.target='_blank';credit.rel='noreferrer';}$('credit').append('Sample photograph: ',credit);}dialog.showModal();dialog.scrollTop=0;fillDetails(photo);}
async function fillDetails(photo){
 const token=++requestId;clearMap();$('metadata').replaceChildren();$('retry-metadata').hidden=true;$('location').textContent='Reading location…';$('metadata-status').textContent=photo.metadataMode==='manual'?'':'Reading embedded photo metadata…';
 const img=images.get(photo.id);const base={'File name':decodeURIComponent(new URL(photo.metadataUrl||photo.imageUrl).pathname.split('/').pop())};
 if(img.naturalWidth)base['Display dimensions']=`${img.naturalWidth} × ${img.naturalHeight} px`;
 let fields=base,message='';
 if(photo.metadataMode!=='manual'){
  try{const result=await readMetadata(photo.metadataUrl||photo.imageUrl);fields={...base,'File size':`${(result.size/1024/1024).toFixed(2)} MB`,...(result.type?{'File type':result.type}:{}),...result.fields};message=result.hasExif?'':'No embedded EXIF metadata was found in this file.';}
  catch(error){message='Automatic metadata could not be read. The source may be unavailable, unsupported, or blocked by R2 CORS settings. ' + error.message;if(token===requestId)$('retry-metadata').hidden=false;console.warn('Photo metadata:',error.message);}
 }
 if(token!==requestId||!dialog.open)return;
 fields=combineMetadata(fields,photo.metadata);$('metadata-status').textContent=message;
 for(const [key,value] of Object.entries(fields)){if(value===null||value==='')continue;const row=element('tr'),label=element('th','',key);label.scope='row';row.append(label,element('td','',value));$('metadata').append(row);}
 const gps=coordinates(fields);if(!gps){$('location').textContent='No location is available for this photograph.';return;}
 $('location').textContent=`${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
 try{const L=await loadMapLibrary();if(token!==requestId||!dialog.open)return;$('map').hidden=false;map=L.map($('map'),{scrollWheelZoom:false}).setView([gps.latitude,gps.longitude],10);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{$('map-status').textContent='Some map tiles could not load.';}).addTo(map);L.circleMarker([gps.latitude,gps.longitude],{radius:7,color:'#fff',weight:2,fillColor:'#252525',fillOpacity:1}).addTo(map).bindTooltip('Photo location');mapResize=new ResizeObserver(()=>map?.invalidateSize());mapResize.observe($('map'));}
 catch{if(token===requestId)$('map-status').textContent='The map could not load.';}
}
let mapLibrary;
function loadMapLibrary(){
 if(!mapLibrary)mapLibrary=new Promise((resolve,reject)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href='./vendor/leaflet/leaflet.css';document.head.append(css);
  const script=document.createElement('script');script.src='./vendor/leaflet/leaflet.js';script.onload=()=>resolve(window.L);script.onerror=()=>{script.remove();mapLibrary=null;reject(Error('Map unavailable'));};document.head.append(script);
 });return mapLibrary;
}
load();
