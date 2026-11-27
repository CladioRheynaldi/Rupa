import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../src/lib/seed';
import {execute} from '../src/lib/domain';
import {visibleOrder} from '../src/lib/model';
import {demoMenuEnabled} from '../src/lib/demo';

const details={name:'Toko Baru',city:'Depok',category:'Pakaian wanita',description:'Koleksi pakaian untuk pengujian.'};
test('only admin can add stores and assign store tailors',()=>{
 const s=seedState(),admin=s.users[3],tailor=s.users[2];
 for(const u of s.users.filter(u=>u.role!=='admin')){
  assert.throws(()=>execute(s,u,'create_shop',details));
  assert.throws(()=>execute(s,u,'assign_shop_tailor',{shopId:'senja',tailorId:tailor.id}));
 }
 const created=execute(s,admin,'create_shop',details) as {id:string};
 const shop=s.shops.find(x=>x.id===created.id)!;assert.equal(shop.active,false);assert.equal(shop.approved,true);
 assert.throws(()=>execute(s,admin,'set_shop',{shopId:shop.id,active:true}));
 assert.throws(()=>execute(s,admin,'create_shop',{...details,name:' TOKO BARU '}));
 assert.throws(()=>execute(s,admin,'assign_shop_tailor',{shopId:shop.id,tailorId:s.users[0].id}));
 execute(s,admin,'assign_shop_tailor',{shopId:shop.id,tailorId:tailor.id});
 execute(s,admin,'set_shop',{shopId:shop.id,active:true});assert.equal(shop.active,true);
});

test('new orders use their store tailor and shop changes do not transfer old orders',()=>{
 const s=seedState(),customer=s.users[0],admin=s.users[3],original=s.users[2];
 const second={id:'second-tailor',name:'Penjahit Dua',email:'two@test.demo',role:'tailor' as const};s.users.push(second);
 execute(s,admin,'assign_shop_tailor',{shopId:'senja',tailorId:second.id});
 const verification={id:'verified-one',customerId:customer.id,shopId:'senja',productId:s.products[0].id,reference:'TEST-ONE',channel:'Shopee',evidence:'proof',status:'verified' as const,reason:'checked',createdAt:new Date().toISOString()};s.verifications.push(verification);
 const created=execute(s,customer,'create_order',{verificationId:verification.id}) as {id:string};
 const order=s.orders.find(o=>o.id===created.id)!;assert.equal(order.tailorId,second.id);
 execute(s,admin,'assign_shop_tailor',{shopId:'senja',tailorId:original.id});
 assert.equal(order.tailorId,second.id);assert.equal(visibleOrder(original,order),false);
 assert.throws(()=>execute(s,admin,'assign_tailor',{orderId:order.id,tailorId:second.id}));
 execute(s,admin,'assign_tailor',{orderId:order.id,tailorId:original.id});assert.equal(order.tailorId,original.id);
 s.verifications.push({...verification,id:'verified-two',reference:'TEST-TWO'});
 const next=execute(s,customer,'create_order',{verificationId:'verified-two'}) as {id:string};
 assert.equal(s.orders.find(o=>o.id===next.id)?.tailorId,original.id);
 delete s.shops.find(x=>x.id==='senja')!.tailorId;
 s.verifications.push({...verification,id:'verified-three',reference:'TEST-THREE'});
 assert.throws(()=>execute(s,customer,'create_order',{verificationId:'verified-three'}));
});

test('Supabase demo menu is an explicit local prototype option',()=>{
 assert.equal(demoMenuEnabled({APP_MODE:'supabase',APP_URL:'http://127.0.0.1:3050',RUPA_DEMO_MENU:'1'}),true);
 assert.equal(demoMenuEnabled({APP_MODE:'supabase',APP_URL:'http://127.0.0.1:3050'}),false);
 assert.equal(demoMenuEnabled({APP_MODE:'supabase',APP_URL:'https://rupa.example',RUPA_DEMO_MENU:'1'}),false);
 assert.equal(demoMenuEnabled({APP_MODE:'supabase',APP_URL:'http://localhost:3050',RUPA_DEMO_MENU:'1',VERCEL:'1'}),false);
});
