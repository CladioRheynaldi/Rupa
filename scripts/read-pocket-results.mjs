import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3050',root='outputs/pocket-testing-20261027';
const label=process.argv[3]||'batch-1';
if(!/^batch-\d+$/.test(label))throw Error('Invalid batch label');
const r=await fetch(base+'/api/auth',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'})});
if(!r.ok)throw Error('Demo login failed');
const cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const state=await(await fetch(base+'/api/state',{headers:{cookie}})).json();
const job=state.jobs.find(j=>j.id===(process.argv[2]||'5627afca-a63a-4e07-8cf4-7a4600638ee2'));
if(!job)throw Error('Job unavailable');
console.log(JSON.stringify({status:job.status,result:job.result,instruction:job.editInstruction,variants:job.variants,error:job.error}));
for(const [i,v]of (job.variants||[]).entries()){
 const out=await fetch(base+'/api/files/'+v.assetId,{headers:{cookie}});
 if(out.ok)await writeFile(`${root}/${label}-variant-${i+1}.png`,Buffer.from(await out.arrayBuffer()));
}
