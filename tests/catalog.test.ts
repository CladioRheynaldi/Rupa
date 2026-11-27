import {test} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveCatalog} from '../src/lib/catalog';
import {photoCatalog} from '../src/lib/photo-catalog';

test('migrated catalogue replaces every local image URL without duplicate references',()=>{
 const migrated=photoCatalog.map(ref=>({...ref,image:'/api/files/catalog-'+ref.id}));
 const result=effectiveCatalog(migrated);
 assert.equal(result.length,photoCatalog.length);
 assert.ok(result.every(ref=>ref.image.startsWith('/api/files/')));
 assert.deepEqual(result.map(ref=>ref.id),photoCatalog.map(ref=>ref.id));
});

test('new licensed uploads are retained alongside migrated references',()=>{
 const extra={...photoCatalog[0],id:'admin-upload',image:'/api/files/upload'};
 assert.equal(effectiveCatalog([extra]).length,photoCatalog.length+1);
 assert.equal(effectiveCatalog([extra]).at(-1)?.id,extra.id);
});
