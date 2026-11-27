import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050';
function client(){let cookie='';return async(url,data)=>{
 const form=data instanceof FormData;
 const response=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data&&!form?{'content-type':'application/json'}:{})},body:data?(form?data:JSON.stringify(data)):undefined});
 const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 return response;
};}
const roles=[['customer','alya@rupa.demo'],['merchant','toko@rupa.demo'],['tailor','penjahit@rupa.demo'],['admin','admin@rupa.demo']];
const sessions={};const checks=[];
for(const [role,email] of roles){
 const call=client();sessions[role]=call;
 const login=await call('/api/auth',{action:'login',email,password:'RupaDemo2026!'});assert.equal(login.status,200,'Supabase login: '+role);
 const response=await call('/api/state');assert.equal(response.status,200);
 const state=await response.json();assert.equal(state.mode,'supabase');assert.equal(state.user.role,role);assert.match(state.user.id,/^[a-f0-9-]{36}$/);
 assert.equal(state.referenceDesigns.length,60);assert.ok(state.referenceDesigns.every(r=>r.image.startsWith('/api/files/')));
 const photo=await call(state.referenceDesigns[0].image);assert.equal(photo.status,200,'Catalogue available: '+role);
 if(role==='merchant')assert.equal(state.jobs.length,0,'Merchant must not see private AI jobs');
 checks.push({role,login:true,catalogue:true});
 if(role==='customer')sessions.customerState=state;
}
const state=sessions.customerState;
const png=state.assets.find(a=>a.purpose==='preview'&&a.mime==='image/png');assert.ok(png);
const privateImage=await sessions.customer('/api/files/'+png.id);assert.equal(privateImage.status,200);assert.equal(privateImage.headers.get('content-type'),'image/png');
assert.equal((await fetch(base+'/api/files/'+png.id)).status,401,'Anonymous cannot read private images');
assert.equal((await sessions.merchant('/api/files/'+png.id)).status,404,'Merchant cannot read private previews');
const order=state.orders.find(o=>o.id==='100bdf92-c9e6-45fc-85e7-67bd9113ddf5'&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));assert.ok(order,'Only upload to TEST- fixture');
const form=new FormData();form.set('orderId',order.id);form.set('purpose','garment');form.set('file',new File([await privateImage.arrayBuffer()],'TEST-cloud-storage-check.png',{type:'image/png'}));
const uploaded=await sessions.customer('/api/upload',form);assert.equal(uploaded.status,200);const newAsset=await uploaded.json();
assert.equal((await sessions.customer(newAsset.url)).status,200);
const after=await(await sessions.customer('/api/state')).json();assert.ok(after.assets.some(a=>a.id===newAsset.id));
await writeFile('outputs/supabase-live-verification.json',JSON.stringify({mode:'supabase',roles:checks,privatePng:true,anonymousDenied:true,merchantPrivatePreviewDenied:true,newUploadAssetId:newAsset.id,cloudCatalogue:60,verifiedAt:new Date().toISOString()},null,2));
console.log('PASS: all four Supabase Auth roles, 60 cloud catalogue references, private PNG reads, anonymous/merchant restrictions, new upload and persisted metadata.');
