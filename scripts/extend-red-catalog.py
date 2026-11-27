"""Import real red t-shirt candidates from the same pinned CC0 dataset.
Colour detection only selects candidates; inspect the resulting contact sheet.
"""
from pathlib import Path
import sys,json,hashlib,io,httpx
from PIL import Image,ImageOps,ImageDraw
root=Path.cwd();sys.path.insert(0,str(root/'ai-worker'))
from base_design import dominant_color
tree=json.loads((root/'outputs/clothing-tree.json').read_text())
revision=tree['sha'];repo='alexeygrigorev/clothing-dataset-small'
provenance=root/'public/references/PHOTO_DATASET_PROVENANCE.json'
data=json.loads(provenance.read_text());catalog=data['images'];seen={c['id'] for c in catalog};added=[]
files=[x for x in tree['tree'] if x['path'].startswith('train/t-shirt/') and x['path'].endswith('.jpg')]
with httpx.Client(timeout=45) as client:
 for item in files[:120]:
  name='photo-'+item['path'].split('/')[-1]
  if name[:-4] in seen: continue
  r=client.get(f'https://raw.githubusercontent.com/{repo}/{revision}/{item["path"]}');r.raise_for_status()
  raw=r.content
  assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==item['sha']
  if dominant_color(Image.open(io.BytesIO(raw)))!='red': continue
  entry={'id':name[:-4],'name':f'Kaos — contoh merah {len(added)+1}','image':'/references/'+name,'attributes':['tshirt'],'source':'Clothing Dataset — Alexey Grigorev dan kontributor (CC0)','kind':'photo','sourceUrl':f'https://github.com/{repo}/blob/{revision}/{item["path"]}','license':'CC0-1.0','category':'tshirt'}
  (root/'public/references'/name).write_bytes(raw);catalog.append(entry);added.append(entry)
  print('Candidate:',name,flush=True)
  if len(added)>=4:break
data['images']=catalog
provenance.write_text(json.dumps(data,indent=2),encoding='utf-8')
(root/'src/lib/photo-catalog.ts').write_text('import type { ReferenceDesign } from "./model";\nexport const photoCatalog: ReferenceDesign[] = '+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
sheet=Image.new('RGB',(256*max(1,len(added)),290),'white')
for i,c in enumerate(added):
 im=ImageOps.contain(Image.open(root/'public'/c['image'].lstrip('/')).convert('RGB'),(250,250));sheet.paste(im,(256*i,0));ImageDraw.Draw(sheet).text((256*i,256),c['name'].replace('—','-'),fill='black')
sheet.save(root/'outputs/red-catalog-candidates.jpg')
print('Added',len(added),'total',len(catalog))
