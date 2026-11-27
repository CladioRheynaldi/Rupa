import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3050";
const browser = await chromium.launch({channel:"msedge", headless:true});
try {
  const context = await browser.newContext();
  const auth = await context.request.post(base + "/api/auth", {headers:{origin:base}, data:{action:"login",email:"alya@rupa.demo",password:"RupaDemo2026!"}});
  assert.equal(auth.status(),200);
  const state = await (await context.request.get(base+"/api/state")).json();
  const order = [...state.orders].reverse().find(o => ["draft","consultation"].includes(o.status) && state.verifications.some(v => v.id === o.verificationId && v.reference.startsWith("TEST-")));
  assert.ok(order,"Only use verified TEST- fixture orders");
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror",e => errors.push(e.message));
  await page.goto(base+`/orders/${order.id}/preview`);
  await page.getByRole("button",{name:/Desain & Pratinjau/}).waitFor();
  assert.equal(await page.locator(".mode-card").count(),2);
  await page.locator(".ai-helper input[type=file]").setInputFiles(path.resolve("public/images/dress.jpg"));
  await page.locator(".ai-helper").getByText("Foto tersimpan",{exact:true}).waitFor();
  await page.getByLabel("Deskripsi tambahan detail yang diinginkan").fill("Saku di sebelah kanan pakaian");
  let jobId;
  if (process.argv.includes("--resume")) {
    jobId = [...state.jobs].reverse().find(j => j.orderId === order.id && j.mode === "design" && j.prompt === "Saku di sebelah kanan pakaian")?.id;
    assert.ok(jobId);
  } else {
  const submitted = page.waitForResponse(r => r.url().endsWith("/api/ai") && r.request().method() === "POST");
  await page.getByRole("button",{name:"Buat desain & perbandingan"}).click();
  const started = await submitted;
  assert.equal(started.status(),200);
  jobId = (await started.json()).id;
  }
  const deadline = Date.now()+600000;
  let completed;
  while (Date.now() < deadline) {
    const snapshot = await (await context.request.get(base+"/api/state")).json();
    completed = snapshot.jobs.find(j=>j.id===jobId);
    if (["succeeded","stale","failed"].includes(completed?.status)) break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  assert.equal(completed?.status,"succeeded",completed?.error);
  assert.ok(!completed.previewError,completed.previewError);
  await page.reload();
  const result = page.locator(".ai-result").first();
  await result.locator(".design-comparison").waitFor({timeout:600000});
  assert.equal(await result.locator(".design-comparison img").count(),2);
  await result.getByText("Referensi lain",{exact:true}).click();
  assert.ok(await result.locator(".reference-grid img").count() >= 1);
  await result.getByRole("button",{name:"Pilih referensi ini",exact:true}).first().click();
  await page.getByText("Pilihan referensi dikirim ke konsultasi",{exact:true}).waitFor();
  await page.reload();
  await page.getByText(/Pilihan gambar tersimpan/).first().waitFor();
  await page.locator(".ai-result").first().getByText("Referensi pilihan - gambar katalog, bukan edit foto pakaian",{exact:true}).waitFor();
  const updated = await (await context.request.get(base+"/api/state")).json();
  const job = [...updated.jobs].reverse().find(j => j.orderId === order.id);
  assert.ok(job.selectedReferenceId);
  assert.ok(updated.messages.some(m => m.orderId === order.id && m.body.includes("Pilihan referensi desain:")));
  await page.locator(".ai-result").first().screenshot({path:"test-results/ai-combined-selected.png"});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log("PASS real local AI: combined design → before/after → alternative right-pocket references → selection persists and notifies consultation; legacy preview URL and mobile checked.");
} finally { await browser.close(); }
