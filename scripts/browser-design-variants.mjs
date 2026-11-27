import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report=JSON.parse(await readFile('outputs/design-variants-smoke.json','utf8'));
const base='http://127.0.0.1:3050';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+`/orders/${report.orderId}/design`);
 const work=page.locator('.numbered-design-workspace');await work.waitFor();
 assert.equal(await work.getByRole('button',{name:'Cari referensi pakaian',exact:true}).count(),0);
 assert.equal(await page.getByText('Referensi lain',{exact:true}).count(),0);
 await work.getByRole('button',{name:'Buat 3 variasi ilustrasi',exact:true}).waitFor();
 const gallery=page.getByRole('region',{name:'Variasi ilustrasi AI'});
 const cards=page.locator('.generated-variants figure');await cards.first().waitFor();assert.equal(await cards.count(),3);
 for(const img of await page.locator('.generated-variants img').all())await img.evaluate(el=>el.decode());
 if(await page.getByRole('button',{name:'Pilih variasi 3',exact:true}).count()) {
   const completed=page.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Pilih variasi 3',exact:true}).click();
   assert.equal((await completed).status(),200);
 }
 await cards.nth(2).getByRole('button',{name:'Terpilih untuk konsultasi',exact:true}).waitFor();
 const state=await(await context.request.get(base+'/api/state')).json();
 assert.equal(state.jobs.find(j=>j.id===report.id).assetId,report.variants[2].assetId);
 await page.screenshot({path:'test-results/design-variants.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: 3 rendered illustrations, selection persisted, no reference search, no mobile overflow/browser errors.');
}finally{await browser.close();}
