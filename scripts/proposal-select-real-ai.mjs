import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report=JSON.parse(await readFile('outputs/proposal-review/real-ai-report.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
 const base='http://127.0.0.1:3050';
 await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'}});
 const page=await context.newPage();await page.goto(base+`/orders/${report.orderId}/design`);await page.waitForLoadState('networkidle');
 const card=page.locator('.generated-variants figure').nth(2);
 if(await card.getByRole('button',{name:'Pilih variasi 3',exact:true}).count())await card.getByRole('button',{name:'Pilih variasi 3',exact:true}).click();
 await card.getByRole('button',{name:'Terpilih untuk konsultasi',exact:true}).waitFor();
 await page.locator('.design-comparison img').last().evaluate(el=>el.decode());
 for(const [name,selector] of [['real-ai-comparison','.design-comparison'],['real-ai-variants','.generated-variants']]){
  const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();await page.evaluate(y=>window.scrollBy(0,y-170),b.y);await el.screenshot({path:`outputs/proposal-review/${name}.png`});
 }
 console.log('Third real variation selected and screenshot captured from app.');
}finally{await browser.close();}
