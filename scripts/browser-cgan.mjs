import assert from "node:assert/strict";
import {createRequire} from "node:module";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require("C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base="http://127.0.0.1:3050";
const browser=await chromium.launch({channel:"msedge",headless:true});
try {
 const context=await browser.newContext();
 await context.request.post(base+"/api/auth",{headers:{origin:base},data:{action:"login",email:"alya@rupa.demo",password:"RupaDemo2026!"}});
 const state=await(await context.request.get(base+"/api/state")).json();
 assert.equal(state.integrations.aiHealth.cgan_ready,true);
 const order=[...state.orders].reverse().find(o=>["draft","consultation"].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith("TEST-")));
 assert.ok(order);
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+`/orders/${order.id}/design`);
 await page.locator(".ai-helper input[type=file]").setInputFiles(path.resolve("public/images/dress.jpg"));
 await page.locator(".ai-helper").getByText("Foto tersimpan",{exact:true}).waitFor();
 await page.getByLabel("Model pratinjau").selectOption("cgan");
 await page.getByText(/cGAN dilatih untuk edit pakaian ber-mask/).waitFor();
 await page.getByRole("button",{name:"Tandai tengah",exact:true}).click();
 await page.getByLabel("Deskripsi tambahan detail yang diinginkan").fill("Ubah warna kain pada area yang ditandai menjadi biru");
 const posted=page.waitForResponse(r=>r.url().endsWith("/api/ai")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"Buat desain & perbandingan",exact:true}).click();
 const response=await posted;assert.equal(response.status(),200);const {id}=await response.json();
 const deadline=Date.now()+300000;let job;
 while(Date.now()<deadline){
  const s=await(await context.request.get(base+"/api/state")).json();job=s.jobs.find(j=>j.id===id);
  if(["succeeded","stale","failed"].includes(job?.status)) break;
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 assert.equal(job.status,"succeeded",job.error);assert.ok(!job.previewError,job.previewError);
 assert.equal(job.engine,"cgan");assert.match(job.model,/Rupa-cGAN-MagicBrush-v1/);assert.ok(job.markup.strokes.length);
 await page.reload();const result=page.locator(".ai-result").first();await result.locator(".design-comparison").waitFor();
 assert.equal(await result.locator(".design-comparison img").count(),2);
 await result.screenshot({path:"test-results/cgan-browser.png"});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log("PASS actual browser: opt-in experimental trained cGAN -> saved strokes -> private before/after images. This is functional verification, not an image-quality pass.");
}finally{await browser.close();}
