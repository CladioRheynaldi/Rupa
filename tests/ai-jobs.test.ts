import {test} from "node:test";
import assert from "node:assert/strict";
import {seedState} from "../src/lib/seed";
import {dailyAILimit,replaceDesignJob,indexAIRequests} from "../src/lib/ai-jobs";
import {designMarkupSchema} from "../src/lib/design-markup";
import type {AIJob} from "../src/lib/model";
test("new design replaces only its own order history and preserves request accounting",()=>{
 const state=seedState(); state.jobs=[];
 const job=(id:string,orderId="order",mode:AIJob["mode"]="design"):AIJob=>({id,orderId,mode,ownerId:"customer",prompt:"test design",specVersion:1,status:"queued",createdAt:new Date().toISOString()});
 state.jobs.push(job("old"),job("other","other-order"),job("size","order","measurements"));
 replaceDesignJob(state,job("new"));
 assert.deepEqual(state.jobs.map(j=>j.id),["other","size","new"]);
 assert.equal(state.audit.filter(a=>a.action==="request_ai").length,4);
 indexAIRequests(state);
 assert.equal(state.audit.filter(a=>a.action==="request_ai").length,4);
 replaceDesignJob(state,job("latest"));
 assert.equal(state.jobs.filter(j=>j.orderId==="order"&&j.mode==="design").length,1);
 assert.equal(state.audit.filter(a=>a.action==="request_ai").length,5);
});
test("numbered detail schema rejects duplicate identifiers, dangling references and partial coordinates",()=>{
 const detail={id:"one",text:"add pocket",x:.3,y:.4};
 const stroke={tool:"draw",detailId:"one",width:.03,points:[[.3,.4]]};
 assert.ok(designMarkupSchema.safeParse({details:[detail],strokes:[stroke]}).success);
 assert.equal(designMarkupSchema.safeParse({details:[detail,detail],strokes:[]}).success,false);
 assert.equal(designMarkupSchema.safeParse({details:[],strokes:[stroke]}).success,false);
 assert.equal(designMarkupSchema.safeParse({details:[{...detail,y:undefined}],strokes:[]}).success,false);
});

test("extra testing quota is bounded and applies only to local demo",()=>{
 assert.equal(dailyAILimit(true,"40"),40);
 assert.equal(dailyAILimit(false,"40"),20);
 for(const value of ["NaN","Infinity","100000","-1","20.5",undefined])assert.equal(dailyAILimit(true,value),20);
});
