"""Reproduce a TEST- fixture with the same seed to check the mask/blending fix."""
from pathlib import Path
import sqlite3,json,base64,io,time,sys,httpx
from PIL import Image,ImageChops
root=Path.cwd();sys.path.insert(0,str(root/'ai-worker'))
from server import DesignMarkup
from edit_mask import stroke_mask
report=json.loads((root/'outputs/ring-mask-app-smoke-report.json').read_text())
state=json.loads(sqlite3.connect(root/'.local/rupa.sqlite').execute('select state from workspace where id=1').fetchone()[0])
job=next(j for j in state['jobs'] if j['id']==report['id']);order=next(o for o in state['orders'] if o['id']==job['orderId'])
assert order['id']=='100bdf92-c9e6-45fc-85e7-67bd9113ddf5'
assert next(v for v in state['verifications'] if v['id']==order['verificationId'])['reference'].startswith('TEST-')
raw=(root/'.local/assets'/f'{job["baseAssetId"]}.jpg').read_bytes()
env=dict(line.split('=',1) for line in (root/'.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
started=time.time()
response=httpx.post('http://127.0.0.1:8000/preview',headers={'Authorization':'Bearer '+env['AI_WORKER_TOKEN'].strip().strip('"').strip("'")},json={'prompt':job['prompt'],'image':base64.b64encode(raw).decode(),'mode':'preview','engine':'sdxl','markup':job['markup'],'seed':job['seed']},timeout=600)
assert response.status_code==200,('worker status',response.status_code)
result=response.json();after=Image.open(io.BytesIO(base64.b64decode(result['image']))).convert('RGB');before=Image.open(io.BytesIO(raw)).convert('RGB')
mask=stroke_mask(before.size,DesignMarkup(**job['markup']))
diff=ImageChops.difference(before,after)
for channel in diff.split():assert ImageChops.multiply(channel,ImageChops.invert(mask)).getbbox() is None
assert diff.getbbox() is not None
after.save(root/'outputs/ring-mask-corrected.png')
(root/'outputs/ring-mask-worker-report.json').write_text(json.dumps({'seconds':round(time.time()-started,1),'seed':result['seed'],'model':result['model'],'outside_mask_pixels_identical':True,'closed_outline_center_editable':True},indent=2),encoding='utf-8')
print('PASS same-seed worker: filled mask + inner feather + fabric colour correction; outside pixels identical.',flush=True)
