import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3050',dir='outputs/proposal-review',oid='100bdf92-c9e6-45fc-85e7-67bd9113ddf5';
const browser=await chromium.launch({channel:'msedge',headless:true});const manifest=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
 await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'}});
 const page=await context.newPage();
 async function go(path){await page.goto(base+path);await page.waitForLoadState('networkidle');await page.locator('h1').first().waitFor();await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));}
 async function shot(name,locator){await locator.scrollIntoViewIfNeeded();const before=await locator.boundingBox();await page.evaluate(y=>window.scrollBy(0,y-170),before.y);await locator.screenshot({path:`${dir}/${name}.png`});const b=await locator.boundingBox();manifest.push({name,width:b.width,height:b.height});}
 await go('/shops/senja');await shot('01-bukti-pembelian',page.locator('.detail-grid .panel').first());
 await go(`/orders/${oid}/design`);
 const text=page.getByRole('textbox',{name:'Deskripsi detail 1',exact:true});
 if(await text.count()){await text.evaluate(el=>el.spellcheck=false);await text.fill('Tambahkan saku pada area bernomor 1; posisi dan bahan dikonfirmasi bersama penjahit.');}
 await page.locator('.detail-drag-handle').first().dragTo(page.locator('.numbered-design-fields .markup-surface').first(),{targetPosition:{x:165,y:145}});
 await shot('02-area-bernomor',page.locator('.numbered-design-fields .markup-surface').first());
 await shot('02-detail-desain',page.locator('.numbered-description-section'));
 await shot('03-perbandingan',page.locator('.design-comparison').first());
 await shot('03-variasi-ai',page.locator('.generated-variants').first());
 const state=await(await context.request.get(base+'/api/state')).json();
 const chatOrder=state.orders.find(o=>state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-'))&&state.messages.filter(m=>m.orderId===o.id).length>0&&state.messages.filter(m=>m.orderId===o.id).length<=3&&state.messages.filter(m=>m.orderId===o.id).every(m=>!/gak bisa|references\/|catalog-photo/i.test(m.body)));
 await go(`/orders/${chatOrder?.id||oid}/consultation`);await page.locator('.chat-messages').evaluate(el=>el.scrollTop=el.scrollHeight);await shot('04-konsultasi',page.locator('.chat-main'));
 await go(`/orders/${oid}/journey`);
 const journey=page.locator('.journey-layout').first();
 if(await journey.count())await shot('06-perjalanan',journey);else await shot('06-perjalanan',page.locator('.order-page'));
 await context.close();
 const merchant=await browser.newContext({viewport:{width:1250,height:900},deviceScaleFactor:1.5});
 await merchant.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'toko@rupa.demo',password:'RupaDemo2026!'}});
 const mp=await merchant.newPage();await mp.goto(base+'/workspace/verification');await mp.waitForLoadState('networkidle');
 const card=mp.locator('.verification-card').first();await card.screenshot({path:`${dir}/05-verifikasi-toko.png`});const b=await card.boundingBox();manifest.push({name:'05-verifikasi-toko',width:b.width,height:b.height});
 await merchant.close();await writeFile(`${dir}/focused-manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}finally{await browser.close();}
