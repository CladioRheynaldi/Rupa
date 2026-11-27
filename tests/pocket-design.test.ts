import test from 'node:test';
import assert from 'node:assert/strict';
import {designMarkupSchema} from '../src/lib/design-markup';
import {newPocket,normalizePocketDetails,patchPocket} from '../src/lib/pocket-design';
test('structured pocket persists without brush strokes and geometry edits revoke approval',()=>{
 const initial=normalizePocketDetails({strokes:[],details:[{id:'p',text:'',pocket:{...newPocket(),confirmed:true}}]});
 assert.equal(designMarkupSchema.safeParse(initial).success,true);
 assert.match(initial.details![0].text,/open top/);
 assert.equal(initial.details![0].x,.38);
 const edited=patchPocket(initial,'p',{color:'cream'});
 assert.equal(edited.details![0].pocket!.confirmed,false);
 assert.match(edited.details![0].text,/cream/);
 assert.equal(patchPocket(edited,'p',{confirmed:true}).details![0].pocket!.confirmed,true);
 const invalid=structuredClone(initial);invalid.details![0].pocket!.box.x=.9;
 assert.equal(designMarkupSchema.safeParse(invalid).success,false);
});
