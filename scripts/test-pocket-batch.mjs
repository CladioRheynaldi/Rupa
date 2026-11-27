import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050',root='outputs/pocket-testing-20261103';
const label=process.argv[2]||'batch-1';
if(!/^batch-\d+$/.test(label))throw Error('Invalid batch label');
await mkdir(root,{recursive:true});
const health=await(await fetch('http://127.0.0.1:8000/health',{signal:AbortSignal.timeout(10000)})).json();
if(!health.ok||!health.analysis_ready||!health.sdxl_ready)throw Error('AI worker is not ready; no generation submitted');
let cookie='';
async function api(url,data){
 const r=await fetch(base+url,{method:data?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(120000)});
 const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');
 const j=await r.json();if(!r.ok)throw Error(`${r.status}: ${j.error||'Request failed'}`);return j;
}
await api('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
const state=await api('/api/state');
const order=state.orders.find(o=>o.id==='100bdf92-c9e6-45fc-85e7-67bd9113ddf5');
if(!order?.designMarkup?.assetId)throw Error('Demo garment missing');
if(!state.verifications.some(v=>v.id===order.verificationId&&v.reference.startsWith('TEST-')))throw Error('Only the dedicated TEST order may be used');
const markup=order.designMarkup.markup;
const input=await fetch(base+'/api/files/'+order.designMarkup.assetId,{headers:{cookie},signal:AbortSignal.timeout(120000)});
if(!input.ok)throw Error('Cannot read original demo image');
await writeFile(root+'/original.png',Buffer.from(await input.arrayBuffer()));
await writeFile(root+'/input.json',JSON.stringify({assetId:order.designMarkup.assetId,markup},null,2));
const submitted=await api('/api/ai',{orderId:order.id,mode:'design',engine:'sdxl',generation:'inpaint',variationCount:3,assetId:order.designMarkup.assetId,markup,prompt:markup.details.map(d=>d.text).join('\n')});
console.log('Submitted batch',submitted.id);
const start=Date.now();let job,previous='';
while(Date.now()-start<1000000){
 const current=await api('/api/state');job=current.jobs.find(j=>j.id===submitted.id);
 const progress=JSON.stringify({status:job?.status,result:job?.result,count:job?.variants?.length,error:job?.error});
 if(progress!==previous){console.log(progress);previous=progress;}
 if(['succeeded','failed','stale'].includes(job?.status))break;
 await new Promise(r=>setTimeout(r,10000));
}
const report={jobId:job?.id,model:job?.model,status:job?.status,editInstruction:job?.editInstruction,variants:job?.variants,error:job?.error,seconds:Math.round((Date.now()-start)/1000)};
await writeFile(root+'/'+label+'.json',JSON.stringify(report,null,2));
for(const [i,v]of (job?.variants||[]).entries()){
 const r=await fetch(base+'/api/files/'+v.assetId,{headers:{cookie},signal:AbortSignal.timeout(120000)});
 if(r.ok)await writeFile(`${root}/${label}-variant-${i+1}.png`,Buffer.from(await r.arrayBuffer()));
}
console.log('Saved batch',report);
