import {test} from "node:test";
import assert from "node:assert/strict";
import {previewFailure} from "../src/lib/preview-errors";
test("blocked generation is distinguished from an invalid customer instruction",()=>{
 const message=previewFailure(422,{detail:{code:"IMAGE_CHECK_REJECTED",detail_number:2}});
 assert.match(message,/detail 2/);assert.match(message,/sudah diterima/);assert.match(message,/tidak lolos pemeriksaan/);
 assert.doesNotMatch(message,/instruksi sederhana/);
});
test("upstream payloads cannot expose untrusted exception text",()=>{
 assert.doesNotMatch(previewFailure(500,{detail:"SECRET_TRACE"}),/SECRET_TRACE/);
 assert.match(previewFailure(503,null),/belum siap/);
 assert.match(previewFailure(422,{detail:{code:"INVALID_EDIT_AREA"}}),/area edit/);
});
