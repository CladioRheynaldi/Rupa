import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3050',dir='outputs/proposal-review',orderId='100bdf92-c9e6-45fc-85e7-67bd9113ddf5';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
 async function api(url,data){const r=await context.request[data?'post':'get'](base+url,data?{headers:{origin:base},data}:{});const body=await r.json();assert.ok(r.ok(),body.error||String(r.status()));return body;}
 await api('/api/auth',{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'});
 const state=await api('/api/state');const order=state.orders.find(o=>o.id===orderId&&['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));assert.ok(order?.designMarkup?.assetId);
 const description='Tambahkan satu saku tempel kotak berwarna biru tua (navy) pada dada kanan pemakai, yaitu sisi kiri gambar. Bukaan atas, tepi jahitan dan bentuk kantong harus terlihat jelas. Pertahankan warna merah kaos di luar saku.';
 const markup={details:[{id:'demo-navy-pocket',text:description,x:.37,y:.39}],strokes:[{tool:'draw',detailId:'demo-navy-pocket',width:.035,points:[[.29,.28],[.46,.28],[.46,.51],[.29,.51],[.29,.28]]}]};
 await api('/api/action',{action:'save_design_markup',input:{orderId,assetId:order.designMarkup.assetId,markup}});
 const page=await context.newPage();await page.goto(base+`/orders/${orderId}/design`);await page.waitForLoadState('networkidle');
 await page.getByRole('textbox',{name:'Deskripsi detail 1',exact:true}).evaluate(el=>el.spellcheck=false);
 await page.getByRole('button',{name:'Buat 3 variasi ilustrasi',exact:true}).waitFor();
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/ai')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Buat 3 variasi ilustrasi',exact:true}).click();const response=await pending;assert.ok(response.ok());const submitted=await response.json();console.log('Submitted from actual UI:',submitted.id);
 const started=Date.now();let job,previous='';
 while(Date.now()-started<900000){const current=await api('/api/state');job=current.jobs.find(j=>j.id===submitted.id);const progress=`${job?.status}: ${job?.result||job?.error||''}`;if(progress!==previous){console.log(progress);previous=progress;}if(['succeeded','failed','stale'].includes(job?.status))break;await new Promise(r=>setTimeout(r,6000));}
 const report={id:job?.id,orderId,status:job?.status,prompt:description,model:job?.model,editInstruction:job?.editInstruction,variants:job?.variants,error:job?.error,seconds:Math.round((Date.now()-started)/1000)};
 await writeFile(`${dir}/real-ai-report.json`,JSON.stringify(report,null,2));assert.equal(job?.status,'succeeded',job?.error);
 await page.reload();await page.waitForLoadState('networkidle');await page.locator('.generated-variants').waitFor();
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
 async function shot(name,locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();await page.evaluate(y=>window.scrollBy(0,y-170),b.y);await locator.screenshot({path:`${dir}/${name}.png`});}
 await shot('real-ai-description',page.locator('.numbered-description-section'));
 await shot('real-ai-canvas',page.locator('.numbered-design-fields .markup-surface').first());
 await shot('real-ai-comparison',page.locator('.design-comparison').first());
 await shot('real-ai-variants',page.locator('.generated-variants').first());
 for(const [i,v]of job.variants.entries()){const r=await context.request.get(base+'/api/files/'+v.assetId);assert.ok(r.ok());await writeFile(`${dir}/real-ai-output-${i+1}.png`,await r.body());}
 console.log('Captured genuine app results.');
}finally{await browser.close();}
