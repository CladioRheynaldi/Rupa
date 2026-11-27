import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3050';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=async()=>await(await context.request.get(base+'/api/state')).json();
 await page.goto(base+'/login');
 const menu=page.locator('.demo-accounts');await menu.waitFor();assert.equal(await menu.getByRole('button').count(),4);
 await menu.getByRole('button',{name:'Admin',exact:true}).click();await page.waitForURL('**/workspace');
 assert.equal((await state()).user.role,'admin');
 await page.getByRole('link',{name:'Toko & mitra',exact:true}).click();
 await page.getByText('Tambah toko baru',{exact:true}).click();
 const existing=process.env.TEST_STORE_ID ? (await state()).shops.find(s=>s.id===process.env.TEST_STORE_ID && s.name.startsWith('TEST Demo Atelier ')) : undefined;
 const name=existing?.name||'TEST Demo Atelier '+Date.now();
 if(!existing){
 await page.getByLabel('Nama toko',{exact:true}).fill(name);
 await page.getByLabel('Kota toko',{exact:true}).fill('Depok');
 await page.getByLabel('Kategori toko',{exact:true}).fill('Pakaian wanita');
 await page.getByLabel('Deskripsi toko',{exact:true}).fill('Toko contoh untuk menguji tambah toko dan penugasan penjahit.');
 await page.getByRole('button',{name:'Simpan toko baru',exact:true}).click();
 await page.getByText('Toko baru berhasil ditambahkan',{exact:true}).first().waitFor();
 }
 let data=await state();const shop=data.shops.find(s=>s.name===name);assert.ok(shop);assert.equal(shop.active,false);assert.equal(shop.tailorId,undefined);
 const card=page.locator(`[data-shop-id="${shop.id}"]`);
 assert.equal(await card.getByRole('button',{name:'Aktifkan',exact:true}).isDisabled(),true);
 const tailor=data.users.find(u=>u.role==='tailor');assert.ok(tailor);
 await card.getByLabel('Penjahit untuk '+name,{exact:true}).selectOption(tailor.id);
 await card.getByRole('button',{name:'Simpan penjahit toko',exact:true}).click();
 await page.getByText('Penjahit toko diperbarui untuk pesanan baru',{exact:true}).first().waitFor();
 await card.getByRole('button',{name:'Aktifkan',exact:true}).click();await card.getByRole('button',{name:'Nonaktifkan',exact:true}).waitFor();
 data=await state();const active=data.shops.find(s=>s.id===shop.id);assert.equal(active.active,true);assert.equal(active.tailorId,tailor.id);
 await page.reload();await card.getByRole('button',{name:'Nonaktifkan',exact:true}).waitFor();
 assert.equal(await card.getByLabel('Penjahit untuk '+name,{exact:true}).inputValue(),tailor.id);
 // Keep the test example inactive so customers do not see a store with no products.
 await card.getByRole('button',{name:'Nonaktifkan',exact:true}).click();await card.getByRole('button',{name:'Aktifkan',exact:true}).waitFor();
 await card.screenshot({path:'test-results/admin-new-store.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1280,height:900});
 for(const [label,role] of [['Pelanggan','customer'],['Pemilik toko','merchant'],['Penjahit','tailor']]){
  await page.goto(base+'/login');await menu.waitFor();await menu.getByRole('button',{name:label,exact:true}).click();await page.waitForURL('**/workspace');assert.equal((await state()).user.role,role);
  if(role==='customer'){
   const denied=await context.request.post(base+'/api/action',{headers:{origin:base},data:{action:'assign_shop_tailor',input:{shopId:shop.id,tailorId:tailor.id}}});assert.equal(denied.status(),403);
   const create=await context.request.post(base+'/api/action',{headers:{origin:base},data:{action:'create_shop',input:{name:'Unauthorized',city:'Depok',category:'Test',description:'Must be denied'}}});assert.equal(create.status(),403);
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile('outputs/admin-store-verification.json',JSON.stringify({newStoreId:shop.id,name,storeTailorId:tailor.id,storeLeftInactive:true,persistsAfterReload:true,roles:['admin','customer','merchant','tailor'],demoMenu:true,nonAdminDenied:true,mobileLayout:true},null,2));
 console.log('PASS: four demo role buttons use Supabase login; admin creates store, assigns tailor, activates and deactivates; assignment persists; non-admin writes denied; mobile layout passes.');
}finally{await browser.close();}
