"""Real local-model integration test, without touching customer orders."""
from pathlib import Path
import base64,json,httpx,sys
root=Path.cwd();sys.path.insert(0,str(root/'ai-worker'))
from base_design import dominant_color
from PIL import Image
env=dict(line.split('=',1) for line in (root/'.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
catalog=json.loads((root/'public/references/PHOTO_DATASET_PROVENANCE.json').read_text())['images']
refs=[{'id':c['id'],'name':c['name'],'attributes':c['attributes'],'image':base64.b64encode((root/'public'/c['image'].lstrip('/')).read_bytes()).decode()} for c in catalog]
base=base64.b64encode((root/'.local/assets/baff661f-7d01-4510-b170-57fb277761bb.jpg').read_bytes()).decode()
with httpx.Client(timeout=180) as client:
 response=client.post('http://127.0.0.1:8000/search',headers={'Authorization':'Bearer '+env['AI_WORKER_TOKEN'].strip().strip('"').strip("'")},json={'strategy':'semantic','query':'Tambahkan saku di dada','original_query':'Tambahkan saku di dada','image':base,'references':refs})
 response.raise_for_status();result=response.json()
 assert result['base']['category']=='tshirt',result['base']
 assert result['base']['color']=='red',result['base']
 assert len(result['ids'])>=1,result
 for identifier in result['ids']:
  ref=next(c for c in catalog if c['id']==identifier)
  assert 'tshirt' in ref['attributes']
  assert dominant_color(Image.open(root/'public'/ref['image'].lstrip('/')))=='red'
 (root/'outputs/base-search-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 # No compatible catalogue entry must produce no results, never a wrong-colour fallback.
 remaining=[r for r in refs if r['id'] not in result['ids']]
 empty=client.post('http://127.0.0.1:8000/search',headers={'Authorization':'Bearer '+env['AI_WORKER_TOKEN'].strip().strip('"').strip("'")},json={'strategy':'semantic','query':'Tambahkan saku di dada','image':base,'references':remaining})
 empty.raise_for_status();assert empty.json()['ids']==[],empty.json()
 print('PASS: uploaded photo identified as red t-shirt; all',len(result['ids']),'results share category and estimated base colour; prompt contains no garment type or colour.')
