import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050';let cookie='';
async function call(url,data){const r=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');const body=await r.json();if(!r.ok)throw Error(`${r.status}: ${body.error||'request failed'}`);return body;}
await call('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
let state=await call('/api/state');
const order=state.orders.find(o=>o.id==='100bdf92-c9e6-45fc-85e7-67bd9113ddf5'&&['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));
assert.ok(order?.designMarkup?.assetId,'Dedicated TEST fixture with original photo');
const old=state.jobs.find(j=>j.orderId===order.id&&j.markup?.strokes?.length);
const markup=structuredClone(old?.markup||order.designMarkup.markup);
assert.ok(markup.strokes.some(s=>s.tool==='draw'));
if(!markup.details?.length){const id='test-pocket';markup.details=[{id,text:'Tambahkan saku tempel biru tua pada area yang ditandai'}];markup.strokes=markup.strokes.map(s=>({...s,detailId:s.tool==='draw'?id:undefined}));}
for(const d of markup.details)if(d.text.trim().length<5)d.text='Tambahkan saku tempel biru tua';
const posted=await call('/api/ai',{orderId:order.id,mode:'design',engine:'sdxl',generation:'inpaint',variationCount:3,assetId:order.designMarkup.assetId,markup,prompt:markup.details.map(d=>d.text).join('\n')});
console.log('TEST request',posted.id);
const started=Date.now();let job;
while(Date.now()-started<900000){state=await call('/api/state');job=state.jobs.find(j=>j.id===posted.id);if(['succeeded','failed','stale'].includes(job?.status))break;await new Promise(r=>setTimeout(r,5000));}
await writeFile('outputs/design-variants-smoke.json',JSON.stringify({orderId:order.id,id:job?.id,status:job?.status,variants:job?.variants,model:job?.model,error:job?.error,seconds:Math.round((Date.now()-started)/1000)},null,2));
assert.equal(job?.status,'succeeded',job?.error);assert.equal(job.variants?.length,3,job.result);
assert.equal(new Set(job.variants.map(v=>v.seed)).size,3);assert.equal(job.references,undefined);
const buffers=[];
for(const [i,v]of job.variants.entries()){const r=await fetch(base+'/api/files/'+v.assetId,{headers:{cookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);const b=Buffer.from(await r.arrayBuffer());buffers.push(b);await writeFile(`outputs/design-variant-${i+1}.png`,b);}
assert.ok(buffers.some(b=>!b.equals(buffers[0])),'Variants should not all be identical');
const chosen=job.variants[1];
await call('/api/action',{action:'select_ai_design',input:{orderId:order.id,jobId:job.id,referenceId:`generated:${chosen.assetId}`}});
state=await call('/api/state');assert.equal(state.jobs.find(j=>j.id===job.id).assetId,chosen.assetId);
console.log('PASS: 3 real SDXL outputs in private storage, distinct seeds/images, second variant selected for consultation.');
