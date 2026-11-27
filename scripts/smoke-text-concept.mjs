import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050';let cookie='';
async function call(url,data){const r=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');const body=await r.json();if(!r.ok)throw new Error(`${r.status}: ${body.error||'request failed'}`);return body;}
await call('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
const previous=JSON.parse(await readFile('outputs/controlnet-app-smoke-report.json','utf8'));
const state=await call('/api/state');const order=state.orders.find(o=>o.id===previous.orderId&&['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));assert.ok(order);
const beforeJob=state.jobs.find(j=>j.id===previous.id);
if(beforeJob){const r=await fetch(base+'/api/files/'+beforeJob.baseAssetId,{headers:{cookie}});assert.equal(r.status,200);await writeFile('outputs/controlnet-before.jpg',Buffer.from(await r.arrayBuffer()));await writeFile('outputs/controlnet-mask.json',JSON.stringify(beforeJob.markup));}
const posted=await call('/api/ai',{orderId:order.id,mode:'preview',engine:'sdxl',generation:'text',prompt:'A red short sleeve cotton t-shirt with one navy blue chest pocket, plain white background, product photograph'});
console.log('Submitted text concept:',posted.id);
const start=Date.now();let job;
while(Date.now()-start<660000){const s=await call('/api/state');job=s.jobs.find(j=>j.id===posted.id);if(['succeeded','failed','stale'].includes(job?.status))break;await new Promise(r=>setTimeout(r,3000));}
await writeFile('outputs/text-concept-smoke-report.json',JSON.stringify({orderId:order.id,id:job?.id,status:job?.status,model:job?.model,seconds:Math.round((Date.now()-start)/1000),error:job?.error},null,2));
assert.equal(job?.status,'succeeded',job?.error);assert.equal(job.generation,'text');assert.equal(job.baseAssetId,undefined);assert.ok(job.assetId);assert.match(job.model,/full-canvas/);
const r=await fetch(base+'/api/files/'+job.assetId,{headers:{cookie}});assert.equal(r.status,200);await writeFile('outputs/text-concept-after.jpg',Buffer.from(await r.arrayBuffer()));
console.log('PASS: authenticated text-only request without garment image or strokes -> private standalone concept image.');
