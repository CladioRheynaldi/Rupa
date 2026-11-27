import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report=JSON.parse(await readFile('outputs/controlnet-app-smoke-report.json','utf8'));
const base='http://127.0.0.1:3050';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'}});
 const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+`/orders/${report.orderId}/design`);
 const workspace=page.locator('.numbered-design-workspace');await workspace.waitFor();
 const generate=workspace.getByRole('button',{name:'Buat pratinjau perubahan',exact:true});await generate.waitFor();assert.equal(await generate.isEnabled(),true);
 assert.equal(await workspace.locator('select').count(),0);
 assert.equal(await workspace.getByRole('button',{name:'Cari referensi pakaian',exact:true}).count(),1);
 await page.getByText('Buat konsep pakaian dari teks',{exact:true}).click();
 await page.getByRole('button',{name:'Buat konsep dari teks',exact:true}).waitFor();
 const comparison=page.locator('.design-comparison');await comparison.waitFor();assert.equal(await comparison.locator('img').count(),2);
 for(const image of await comparison.locator('img').all())assert.ok(await image.evaluate(el=>el.complete&&el.naturalWidth>0));
 assert.equal(await page.getByRole('button',{name:'Buat alternatif AI',exact:true}).count(),1);
 await comparison.screenshot({path:'test-results/controlnet-comparison.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: SDXL + ControlNet before/after, regenerate, catalogue, concept form, no model selector, mobile layout.');
}finally{await browser.close();}
