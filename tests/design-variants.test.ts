import {test} from "node:test";
import assert from "node:assert/strict";
import {generateVariants} from "../src/lib/design-variants";

test("variations run serially, wrap seeds, and report each available image", async()=>{
  const seeds:number[]=[], counts:number[]=[]; let active=false;
  const result=await generateVariants(3,2147483647,async(seed,index)=>{
    assert.equal(active,false);active=true;await Promise.resolve();active=false;
    seeds.push(seed);return {assetId:`image-${index}`,seed};
  },async(v)=>{counts.push(v.length);});
  assert.equal(new Set(seeds).size,3);assert.ok(seeds.every(s=>s>=0&&s<2147483648));
  assert.deepEqual(counts,[1,2,3]);assert.equal(result.failures,0);
});
test("one failed generation does not discard other successful illustrations",async()=>{
  const result=await generateVariants(3,1,async(seed,index)=>{if(index===1)throw Error("GPU failed");return {assetId:`image-${index}`,seed,label:['Classic','Flap','Pleated'][index],instruction:`Design ${index}`};},async()=>{});
  assert.deepEqual(result.variants.map(v=>v.assetId),["image-0","image-2"]);assert.equal(result.failures,1);
  assert.deepEqual(result.variants.map(v=>v.label),['Classic','Pleated']);
  assert.deepEqual(result.variants.map(v=>v.instruction),['Design 0','Design 2']);
  for(const count of [0,4,1.5])await assert.rejects(generateVariants(count,1,async()=>({assetId:"x",seed:1}),async()=>{}));
});
