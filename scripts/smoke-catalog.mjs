import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050'; let cookie='';
async function call(url,data){
  const r=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  const cookies=r.headers.getSetCookie(); if(cookies.length) cookie=cookies.map(v=>v.split(';')[0]).join('; ');
  const body=await r.json(); if(!r.ok)throw new Error(`${r.status}: ${body.error||'request failed'}`);return body;
}
await call('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
const state=await call('/api/state');
assert.equal(state.integrations.aiHealth.retrieval_ready,true);
const order=[...state.orders].reverse().find(o=>['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-'))&&o.designMarkup?.assetId);
assert.ok(order,'Only use an editable TEST- order with a garment photo');
const markup={details:[{id:'catalog-test',text:'Kaos dengan saku di bagian dada'}],strokes:[]};
const assetId=order.designMarkup.assetId;
const posted=await call('/api/ai',{orderId:order.id,mode:'design',engine:'catalog',assetId,markup,prompt:markup.details[0].text});
const start=Date.now();let job;
while(Date.now()-start<240000){
  const s=await call('/api/state');job=s.jobs.find(j=>j.id===posted.id);
  if(['succeeded','failed','stale'].includes(job?.status))break;
  await new Promise(r=>setTimeout(r,2000));
}
const report={orderId:order.id,id:job?.id,status:job?.status,engine:job?.engine,model:job?.model,seconds:Math.round((Date.now()-start)/1000),references:job?.references,error:job?.error};
await writeFile('outputs/catalog-smoke-report.json',JSON.stringify(report,null,2));
assert.equal(job?.status,'succeeded',job?.error);
assert.equal(job.engine,'catalog');assert.match(job.model,/fashionCLIP/i);
assert.equal(job.assetId,job.baseAssetId,'Retrieval must not create an edited image');
assert.ok(job.references?.length>=1,'Real photo references must be returned');
for(const ref of job.references){
  assert.match(ref.image,/\/(?:references\/photo-|api\/files\/catalog-photo-)/);assert.equal(ref.kind,'photo');
  const r=await fetch(base+ref.image,{headers:{cookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image/);
}
console.log(JSON.stringify({result:'PASS',orderId:order.id,model:job.model,photos:job.references.length,seconds:report.seconds}));
