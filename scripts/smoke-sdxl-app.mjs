import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050';let cookie='';
async function call(url,data){const r=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data&&!(data instanceof FormData)?{'content-type':'application/json'}:{})},body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined});const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');const body=await r.json();if(!r.ok)throw new Error(`${r.status}: ${body.error||'request failed'}`);return body;}
await call('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
const state=await call('/api/state');assert.equal(state.integrations.aiHealth.sdxl_ready,true);assert.equal(state.integrations.aiHealth.device,'cuda');
const order=[...state.orders].reverse().find(o=>['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));assert.ok(order,'Use TEST- fixture only');
const form=new FormData();form.set('orderId',order.id);form.set('purpose','garment');form.set('file',new File([await readFile('.local/assets/baff661f-7d01-4510-b170-57fb277761bb.jpg')],'sdxl-test-base.jpg',{type:'image/jpeg'}));
const asset=await call('/api/upload',form);
const markup={details:[{id:'sdxl-pocket-test',text:'Tambahkan satu kantong tempel persegi kecil warna biru tua polos pada kaos, dengan bukaan di atas dan jahitan rapi',x:.65,y:.42}],strokes:[.34,.38,.42,.46,.50].map(y=>({tool:'draw',detailId:'sdxl-pocket-test',width:.05,points:[[.58,y],[.72,y]]}))};
await call('/api/action',{action:'save_design_markup',input:{orderId:order.id,assetId:asset.id,markup}});
const posted=await call('/api/ai',{orderId:order.id,mode:'design',engine:'sdxl',assetId:asset.id,markup,prompt:markup.details[0].text});console.log('Submitted SDXL application test:',posted.id);
const start=Date.now();let job;
while(Date.now()-start<720000){const s=await call('/api/state');job=s.jobs.find(j=>j.id===posted.id);if(['succeeded','failed','stale'].includes(job?.status))break;await new Promise(r=>setTimeout(r,5000));}
await writeFile('outputs/sdxl-app-smoke-report.json',JSON.stringify({orderId:order.id,id:job?.id,status:job?.status,model:job?.model,engine:job?.engine,seconds:Math.round((Date.now()-start)/1000),previewError:job?.previewError,error:job?.error,editInstruction:job?.editInstruction},null,2));
assert.equal(job?.status,'succeeded',job?.error);assert.equal(job.engine,'sdxl');assert.equal(job.previewError,undefined,job.previewError);assert.notEqual(job.assetId,job.baseAssetId);assert.match(job.model,/stable-diffusion-xl/);
const r=await fetch(base+'/api/files/'+job.assetId,{headers:{cookie}});assert.equal(r.status,200);await writeFile('outputs/sdxl-smoke/app-after.png',Buffer.from(await r.arrayBuffer()));console.log('PASS application: authenticated upload -> saved numbered mask -> SDXL GPU -> private PNG. Quality requires visual review.');
