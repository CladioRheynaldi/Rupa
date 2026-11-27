import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {photoCatalog} from '../src/lib/photo-catalog';
import type {State,User} from '../src/lib/model';

if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const databasePath=path.resolve('.local/rupa.sqlite');
async function main(){
  if(!existsSync(databasePath))throw new Error('Local database does not exist.');
  const local=new DatabaseSync(databasePath,{readOnly:true});
  let source:State;
  try{
    const row=local.prepare('select state from workspace where id=1').get() as {state:string}|undefined;
    if(!row)throw new Error('Local workspace is empty.');
    source=JSON.parse(row.state);
  }finally{local.close();}
  if(source.users.some(u=>!u.id.endsWith('_demo')))throw new Error('This prototype migrator only handles the four demo identities. Non-demo accounts need an explicit Auth migration plan; passwords and sessions will not be copied.');
  for(const asset of source.assets){
    if(!existsSync(path.join('.local/assets',asset.id+'.jpg')))throw new Error('Missing source file: '+asset.id);
  }
  const plan={users:source.users.length,orders:source.orders.length,privateAssets:source.assets.length,cataloguePhotos:photoCatalog.length,mode:'dry-run',notes:'No model weights, passwords, session cookies, local deletion, or configuration switch.'};
  console.log(JSON.stringify(plan,null,2));
  if(!apply)return;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
  const expected=process.env.SUPABASE_MIGRATION_PROJECT_REF;
  if(!url||!secret||!expected)throw new Error('Configure Supabase URL, server-only secret key and SUPABASE_MIGRATION_PROJECT_REF in .env.local. Never paste keys into chat.');
  if(new URL(url).hostname!==expected+'.supabase.co')throw new Error('Project URL does not match the explicit migration target.');
  const cloud=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const existing=await cloud.from('rupa_workspace').select('id').eq('id',1).maybeSingle();
  if(existing.error)throw new Error('Schema not ready: '+existing.error.code);
  if(existing.data)throw new Error('Target already contains a workspace. Refusing to overwrite cloud data.');
  const bucket=await cloud.storage.getBucket('rupa-private');
  if(bucket.error||!bucket.data||bucket.data.public)throw new Error('A private rupa-private bucket must exist.');
  if(!bucket.data.allowed_mime_types?.includes('image/png'))throw new Error('Bucket must allow PNG previews before migration.');
  await mkdir('.local/migrations',{recursive:true});
  const snapshot=path.join('.local/migrations',expected+'-source.json');
  if(!existsSync(snapshot))await writeFile(snapshot,JSON.stringify(source));
  const mapPath=path.join('.local/migrations',expected+'-identity-map.json');
  const identityMap:Record<string,string>=existsSync(mapPath)?JSON.parse(await readFile(mapPath,'utf8')):{};
  const auth=await cloud.auth.admin.listUsers({perPage:1000});
  if(auth.error)throw new Error('Cannot inspect target Auth accounts.');
  if(auth.data.users.some(u=>!source.users.some(s=>s.email.toLowerCase()===u.email?.toLowerCase())))throw new Error('Target has unrelated Auth users; use a dedicated empty Rupa project.');
  for(const user of source.users){
    let target=auth.data.users.find(u=>u.email?.toLowerCase()===user.email.toLowerCase());
    if(!target){
      const created=await cloud.auth.admin.createUser({email:user.email,password:'RupaDemo2026!',email_confirm:true,user_metadata:{name:user.name}});
      if(created.error||!created.data.user)throw new Error('Failed to provision a demo Auth identity.');
      target=created.data.user;
    }
    identityMap[user.id]=target.id;
    const profile=await cloud.from('rupa_profiles').upsert({id:target.id,name:user.name,role:user.role,shop_id:user.shopId||null});
    if(profile.error)throw new Error('Failed to assign the migrated profile.');
    await writeFile(mapPath,JSON.stringify(identityMap,null,2));
  }
  function remap(value:unknown):unknown{
    if(typeof value==='string')return identityMap[value]||value;
    if(Array.isArray(value))return value.map(remap);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
    return value;
  }
  const state=remap(source) as State;
  let verified=0;
  async function transfer(storagePath:string,bytes:Buffer,mime:string){
    const previous=await cloud.storage.from('rupa-private').download(storagePath);
    if(previous.data){
      if(sha(Buffer.from(await previous.data.arrayBuffer()))!==sha(bytes))throw new Error('Cloud file differs; refusing overwrite: '+storagePath);
    }else{
      const upload=await cloud.storage.from('rupa-private').upload(storagePath,bytes,{contentType:mime,upsert:false});
      if(upload.error)throw new Error('Storage upload failed: '+storagePath);
    }
    const downloaded=await cloud.storage.from('rupa-private').download(storagePath);
    if(downloaded.error||!downloaded.data||sha(Buffer.from(await downloaded.data.arrayBuffer()))!==sha(bytes))throw new Error('Storage verification failed: '+storagePath);
    verified++;
  }
  for(const asset of state.assets)await transfer(asset.storagePath,await readFile(path.join('.local/assets',asset.id+'.jpg')),asset.mime);
  const admin=state.users.find((u:User)=>u.role==='admin');if(!admin)throw new Error('No migrated admin exists.');
  state.referenceDesigns??=[];
  for(const ref of photoCatalog){
    const assetId='catalog-'+ref.id,storagePath='catalogue/'+ref.id+'.jpg';
    await transfer(storagePath,await readFile(path.join('public/references',path.basename(ref.image))),'image/jpeg');
    if(!state.assets.some(a=>a.id===assetId))state.assets.push({id:assetId,ownerId:admin.id,name:ref.name,mime:'image/jpeg',storagePath,purpose:'reference_catalog',createdAt:new Date().toISOString()});
    const migrated={...ref,image:'/api/files/'+assetId};
    state.referenceDesigns=state.referenceDesigns.filter(r=>r.id!==ref.id);state.referenceDesigns.push(migrated);
    // Preserve saved reference selections while replacing their local file URL.
    for(const job of state.jobs)for(const saved of job.references||[])if(saved.id===ref.id)saved.image=migrated.image;
  }
  const inserted=await cloud.from('rupa_workspace').insert({id:1,revision:0,state});
  if(inserted.error)throw new Error('Cannot insert migrated workspace; remote files remain for a safe resume.');
  const check=await cloud.from('rupa_workspace').select('state').eq('id',1).single();
  // JSONB key order differs; compare the entire JSON value structurally.
  if(check.error||!isDeepStrictEqual(check.data.state,JSON.parse(JSON.stringify(state))))throw new Error('Cloud workspace verification failed. Do not change APP_MODE.');
  await writeFile(path.join('.local/migrations',expected+'-report.json'),JSON.stringify({project:expected,verifiedFiles:verified,orders:state.orders.length,users:state.users.length,cataloguePhotos:photoCatalog.length,finishedAt:new Date().toISOString(),localFilesDeleted:false},null,2));
  console.log('Verified migration complete. APP_MODE has NOT been changed. Test Supabase logins and files before activating or deleting local copies.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
