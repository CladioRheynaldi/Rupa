import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3050';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext();
 await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'alya@rupa.demo',password:'RupaDemo2026!'}});
 const getState=async()=>await(await context.request.get(base+'/api/state')).json();
 let state=await getState();
 const order=[...state.orders].reverse().find(o=>['draft','consultation'].includes(o.status)&&state.verifications.some(v=>v.id===o.verificationId&&v.reference.startsWith('TEST-')));
 assert.ok(order,'Use TEST- fixture only');
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+`/orders/${order.id}/design`);
 const work=page.locator('.numbered-design-workspace');await work.waitFor();
 assert.equal(await work.locator('select').count(),0);
 assert.equal(await work.locator('input[type=file]').count(),1);
 await work.locator('input[type=file]').setInputFiles(path.resolve('public/images/dress.jpg'));
 await work.getByText('Foto tersimpan',{exact:true}).waitFor();
 const photo=work.locator('.base-design-photo');await photo.waitFor();
 assert.ok(await photo.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.design-photo-upload input[type=file]'))&Node.DOCUMENT_POSITION_FOLLOWING)));
 await work.getByLabel('Deskripsi detail 1',{exact:true}).fill('Tambahkan saku merah di sisi kiri');
 await work.getByRole('button',{name:'Tandai tengah',exact:true}).click();
 await work.getByRole('button',{name:'Letakkan di tengah',exact:true}).click();
 await work.getByRole('button',{name:'Tambah deskripsi',exact:true}).click();
 await work.getByLabel('Deskripsi detail 2',{exact:true}).fill('Tambahkan kancing biru di sisi kanan');
 const canvas=work.getByLabel('Kanvas coretan area perubahan',{exact:true});await canvas.scrollIntoViewIfNeeded();
 let b=await canvas.boundingBox();
 await page.mouse.move(b.x+b.width*.7,b.y+b.height*.65);await page.mouse.down();await page.mouse.move(b.x+b.width*.75,b.y+b.height*.7,{steps:8});await page.mouse.up();
 // Native drag/drop payload, followed by real pointer movement of the placed marker.
 await work.locator('.numbered-design-fields .markup-surface').evaluate((el,id)=>{const dt=new DataTransfer();dt.setData('text/rupa-detail',id);const r=el.getBoundingClientRect();el.dispatchEvent(new DragEvent('drop',{bubbles:true,clientX:r.x+r.width*.7,clientY:r.y+r.height*.65,dataTransfer:dt}));},await work.locator('.detail-drag-handle').nth(1).evaluate(el=>{const dt=new DataTransfer();el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));return dt.getData('text/rupa-detail');}));
 const pin=work.getByRole('button',{name:'Detail 2 pada canvas',exact:true});await pin.scrollIntoViewIfNeeded();let p=await pin.boundingBox();b=await canvas.boundingBox();
 await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*.6,{steps:8});await page.mouse.up();
 await work.getByRole('button',{name:'Simpan detail & penanda',exact:true}).click();
 await page.getByText('Detail dan penanda tersimpan',{exact:true}).first().waitFor();
 state=await getState();let markup=state.orders.find(o=>o.id===order.id).designMarkup.markup;
 assert.equal(markup.details.length,2);assert.ok(Math.abs(markup.details[1].x-.8)<.02);assert.ok(markup.strokes.some(s=>s.detailId===markup.details[0].id));assert.ok(markup.strokes.some(s=>s.detailId===markup.details[1].id));
 await page.reload();await work.getByLabel('Deskripsi detail 2',{exact:true}).waitFor();assert.equal(await work.getByLabel('Deskripsi detail 2',{exact:true}).inputValue(),'Tambahkan kancing biru di sisi kanan');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await work.locator('.numbered-description-section').screenshot({path:'test-results/numbered-details-mobile.png'});
 await page.setViewportSize({width:1280,height:900});await work.screenshot({path:'test-results/numbered-design-workspace.png'});
 // Exercise accepted request replacement without relying on mocked generation.
 await work.getByRole('button',{name:'Buat desain & perbandingan',exact:true}).click();
 await page.getByText('Desain terbaru sedang diproses',{exact:true}).waitFor();
 state=await getState();let jobs=state.jobs.filter(j=>j.orderId===order.id&&['design','preview'].includes(j.mode));assert.equal(jobs.length,1);assert.equal(jobs[0].engine,'sdxl');const first=jobs[0].id;
 await work.getByLabel('Deskripsi detail 2',{exact:true}).fill('Tambahkan kancing hijau di sisi kanan');
 await work.getByRole('button',{name:'Buat desain & perbandingan',exact:true}).click();
 await page.waitForTimeout(1500);state=await getState();jobs=state.jobs.filter(j=>j.orderId===order.id&&['design','preview'].includes(j.mode));assert.equal(jobs.length,1);assert.notEqual(jobs[0].id,first);assert.ok(jobs[0].prompt.includes('hijau'));
 assert.equal(await work.locator('.ai-result').count(),1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,order:order.id,latestJob:jobs[0].id,checks:'single upload, photo order, no model selector, two linked details, drop, pointer move, save/reload, mobile width, latest request replaces history'}));
} finally {await browser.close();}

