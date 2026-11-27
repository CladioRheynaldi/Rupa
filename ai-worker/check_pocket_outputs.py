"""Pixel preservation and colour evidence, not a semantic pocket detector."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageChops
from server import DesignMarkup
from edit_mask import stroke_mask
from pocket_layout import pocket_mask
import sys
root=Path(__file__).resolve().parents[1]/'outputs'/('pocket-testing-'+(sys.argv[1] if len(sys.argv)>1 else '20261027'))
source=Image.open(root/'original.png').convert('RGB')
markup=DesignMarkup(**json.loads((root/'input.json').read_text())['markup'])
mask=stroke_mask(source.size,markup)
for detail in markup.details:
    if detail.pocket:mask=ImageChops.lighter(mask,pocket_mask(source.size,detail.pocket))
selected=np.asarray(mask)>0
rows=[]
for file in sorted(root.glob('batch-*-variant-*.png')):
    image=Image.open(file).convert('RGB')
    diff=ImageChops.difference(source,image)
    outside=bool(np.any(np.asarray(diff)[np.asarray(mask)==0]))
    pixels=np.asarray(image).astype('int16')
    blue=(pixels[:,:,2]>pixels[:,:,0]*1.2)&(pixels[:,:,2]>pixels[:,:,1]*1.05)&(pixels[:,:,2]>25)&selected
    rows.append({'file':file.name,'outside_mask_identical':not outside,'blue_pixels':int(blue.sum()),'masked_pixels':int(selected.sum()),'semantic_review':'requires visual inspection'})
(root/'pixel-checks.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows,indent=2))
