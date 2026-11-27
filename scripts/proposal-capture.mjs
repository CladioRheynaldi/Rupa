import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='outputs/proposal-review',base='http://127.0.0.1:3050',orderId='100bdf92-c9e6-45fc-85e7-67bd9113ddf5';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const manifest=[];
try{
 for(const [role,email,paths]of [
  ['customer','alya@rupa.demo',['/shops','/shops/senja',`/orders/${orderId}/design`,`/orders/${orderId}/consultation`,`/orders/${orderId}`,'/workspace/claims']],
  ['merchant','toko@rupa.demo',['/workspace/verification']],
 ]){
  const context=await browser.newContext({viewport:{width:1000,height:760},deviceScaleFactor:1.5});
  const auth=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email,password:'RupaDemo2026!'}});
  if(!auth.ok())throw Error('Login failed');
  const state=await(await context.request.get(base+'/api/state')).json();
  const page=await context.newPage();
  for(const [i,path]of paths.entries()){
   await page.goto(base+path);await page.waitForLoadState('networkidle');await page.locator('h1').first().waitFor();
   await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
   const file=`${root}/${role}-${i}.png`;
   await page.screenshot({path:file,fullPage:true});
   const outline=await page.locator('h1,h2,h3,.panel,.numbered-design-workspace,.numbered-design-fields,.numbered-description-section,.generated-variants,.design-comparison,.chat-layout,.chat-panel').evaluateAll(els=>els.map(el=>({tag:el.tagName,class:el.className,text:el.innerText.slice(0,110),x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
   manifest.push({role,path,file,outline});
  }
  await context.close();
 }
 await writeFile(`${root}/capture-manifest.json`,JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(manifest));
}finally{await browser.close();}
