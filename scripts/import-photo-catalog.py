from pathlib import Path
import json,httpx,hashlib
from concurrent.futures import ThreadPoolExecutor
root=Path.cwd();tree=json.loads((root/'outputs/clothing-tree.json').read_text());revision=tree['sha'];repo='alexeygrigorev/clothing-dataset-small'
classes={'dress':('Gaun','dress'),'longsleeve':('Atasan lengan panjang','long_sleeve'),'outwear':('Jaket atau luaran','jacket'),'pants':('Celana panjang','pants'),'shirt':('Kemeja','shirt'),'shorts':('Celana pendek','shorts'),'skirt':('Rok','skirt'),'t-shirt':('Kaos','tshirt')}
folder=root/'public/references';folder.mkdir(exist_ok=True,parents=True)
items=[]
for category,(label,tag) in classes.items():
 files=[x for x in tree['tree'] if x['path'].startswith('validation/'+category+'/') and x['path'].endswith('.jpg')][:7]
 for i,item in enumerate(files):items.append((item,label,tag,i))
def load(entry):
 item,label,tag,i=entry;name='photo-'+item['path'].split('/')[-1];target=folder/name
 url=f'https://raw.githubusercontent.com/{repo}/{revision}/{item["path"]}'
 if not target.exists():
  response=httpx.get(url,timeout=60);response.raise_for_status();data=response.content
  blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
  if blob!=item['sha']:raise ValueError('Checksum mismatch')
  target.write_bytes(data)
 return {'id':name[:-4],'name':f'{label} — contoh {i+1}','image':'/references/'+name,'attributes':[tag],'source':'Clothing Dataset — Alexey Grigorev dan kontributor (CC0)','kind':'photo','sourceUrl':f'https://github.com/{repo}/blob/{revision}/{item["path"]}','license':'CC0-1.0','category':tag}
with ThreadPoolExecutor(max_workers=4) as pool:catalog=list(pool.map(load,items))
(root/'src/lib/photo-catalog.ts').write_text('import type { ReferenceDesign } from "./model";\nexport const photoCatalog: ReferenceDesign[] = '+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
(folder/'PHOTO_DATASET_PROVENANCE.json').write_text(json.dumps({'repository':repo,'revision':revision,'license':'CC0-1.0','licenseSource':'https://github.com/alexeygrigorev/clothing-dataset','images':catalog},indent=2),encoding='utf-8')
print('Downloaded and SHA1 verified:',len(catalog),'photos;',len(classes),'categories')
