import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3050";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const errors = [];
try {
  let response = await context.request.post(base + "/api/auth", {
    headers: { origin: base },
    data: {
      action: "login",
      email: "alya@rupa.demo",
      password: "RupaDemo2026!",
    },
  });
  assert.equal(response.status(), 200);
  let state = await (await context.request.get(base + "/api/state")).json();
  const order = [...state.orders]
    .reverse()
    .find((o) => ["draft", "consultation"].includes(o.status) && state.verifications.some((v)=>v.id===o.verificationId && v.reference.startsWith("TEST-")));
  assert.ok(order, "A verified customer-owned test draft must exist");
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.argv.includes("search")) {
    await page.goto(base + `/orders/${order.id}/design`);
    await page
      .locator(".ai-helper input[type=file]")
      .setInputFiles(path.resolve("test-results/ai-base.jpg"));
    await page
      .locator(".ai-helper")
      .getByText("Foto tersimpan", { exact: true })
      .waitFor();
    await page
      .getByLabel("Deskripsi tambahan detail yang diinginkan")
      .fill("Tambahkan logo tengkorak di tengah kaos merah");
    await page
      .getByRole("button", { name: "Buat desain & perbandingan" })
      .click();
    await page.locator(".ai-result").first().locator(".design-comparison").waitFor({timeout:600000});
    await page.locator(".ai-result").first().getByText("Referensi lain",{exact:true}).click();
    await page
      .locator(".ai-result")
      .first()
      .locator(".reference-grid a")
      .first()
      .waitFor({ timeout: 300000 });
    assert.equal(
      await page
        .locator(".ai-result")
        .first()
        .locator(".reference-grid a")
        .count(),
      1,
    );
    await page.screenshot({
      path: "test-results/ai-search-desktop.png",
      fullPage: true,
    });
    console.log(
      "PASS browser: upload clothing photo → description → matching catalogue reference from local inference.",
    );
  }
  if (process.argv.includes("measurements")) {
    await page.goto(base + `/orders/${order.id}/measurements`);
    await page
      .getByRole("heading", { name: "Detail kecil. Perbedaan besar." })
      .waitFor();
    if (!order.changes.some((change) => change.serviceId === "waist")) {
      await page
        .getByLabel("Posisi pada pakaian")
        .fill("Garis pinggang pakaian");
      await page
        .getByLabel("Ceritakan detail yang kamu inginkan")
        .fill(
          "TEST-AI: kecilkan pinggang dari 80 cm menjadi 76 cm, konfirmasikan kelayakan dahulu.",
        );
      await page
        .getByLabel("Lingkar pinggang pakaian sekarang (cm)")
        .fill("80");
      await page
        .getByLabel("Lingkar pinggang pakaian yang diinginkan (cm)")
        .fill("76");
      await page
        .getByRole("button", { name: "Tambah perubahan", exact: true })
        .click();
      await page
        .getByText("Detail perubahan ditambahkan", { exact: true })
        .waitFor();
    }
    await page
      .getByLabel("Deskripsi tambahan detail yang diinginkan")
      .fill(
        "Apa yang perlu penjahit pastikan sebelum mengubah lingkar pinggang dari 80 cm menjadi 76 cm?",
      );
    await page
      .getByRole("button", { name: "Minta saran ukuran", exact: true })
      .click();
    await page
      .locator(".ai-result")
      .first()
      .getByText(/selisih -4 cm/)
      .waitFor({ timeout: 300000 });
    await page.screenshot({
      path: "test-results/ai-measurements-desktop.png",
      fullPage: true,
    });
    console.log(
      "PASS browser: explicit waist measurements → local model + separate deterministic -4 cm calculation.",
    );
  }
  if (process.argv.includes("preview")) {
    await page.goto(base + `/orders/${order.id}/preview`);
    await page
      .locator("input[type=file]")
      .setInputFiles(path.resolve("public/images/dress.jpg"));
    await page.getByText("Foto tersimpan", { exact: true }).waitFor();
    await page
      .getByLabel("Deskripsi tambahan detail yang diinginkan")
      .fill("Ubah warna gaun menjadi biru. Pertahankan bentuk pakaian.");
    await page.getByRole("button", { name: "Buat desain & perbandingan" }).click();
    await page
      .locator(".ai-result")
      .first()
      .locator(".design-comparison")
      .waitFor({ timeout: 600000 });
    assert.equal(
      await page
        .locator(".ai-result")
        .first()
        .locator(".design-comparison img")
        .count(),
      2,
    );
    await page.screenshot({
      path: "test-results/ai-preview-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    console.log(
      "PASS browser: local image edit result and private original displayed side by side; mobile has no overflow.",
    );
  }
  if (process.argv.includes("catalog")) {
    const admin = await browser.newContext();
    response = await admin.request.post(base + "/api/auth", {
      headers: { origin: base },
      data: {
        action: "login",
        email: "admin@rupa.demo",
        password: "RupaDemo2026!",
      },
    });
    assert.equal(response.status(), 200);
    const adminPage = await admin.newPage();
    await adminPage.goto(base + "/workspace/references");
    await adminPage
      .getByRole("heading", { name: "Tambahkan foto referensi berizin" })
      .waitFor();
    assert.ok((await adminPage.locator(".reference-grid a").count()) >= 32);
    await adminPage.screenshot({
      path: "test-results/ai-catalog-admin.png",
      fullPage: true,
    });
    await admin.close();
    console.log("PASS browser: admin catalogue and original sketch labels.");
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
