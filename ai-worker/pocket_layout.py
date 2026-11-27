"""Explicit geometric draft for a requested navy rectangular pocket.

This is an img2img conditioning sketch, never a fallback returned as AI output.
"""
import re
from PIL import Image, ImageDraw, ImageFilter, ImageChops

def applicable(description):
    return all(re.search(p,description,re.I) for p in [r'\bpocket\b',r'\b(?:rectangular|square)\b',r'\b(?:navy|dark blue)\b']) and not re.search(r'\b(?:logo|flap|zipper|button|round|circle|two|three|multiple|several|pair|[2-9])\b',description,re.I)

def pocket_mask(size,spec):
    b=spec.box;w,h=size
    pad=max(3,min(w*b.width,h*b.height)*.15)
    mask=Image.new('L',size,0)
    ImageDraw.Draw(mask).rectangle((max(0,int(w*b.x-pad)),max(0,int(h*b.y-pad)),min(w-1,int(w*(b.x+b.width)+pad)),min(h-1,int(h*(b.y+b.height)+pad))),fill=255)
    return mask

STYLES=('classic','flap','pleated')
STYLE_LABELS={'classic':'Saku terbuka klasik','flap':'Saku dengan penutup','pleated':'Saku lipit tengah'}

def pocket_prompt(spec,style='classic'):
    shape='rectangular' if spec.shape=='rectangular' else 'rounded-bottom'
    detail={'classic':'open top with a visible dark opening and folded top hem','flap':'a wide matching fabric flap covering the top opening, visible lower flap edge and shadow, no button','pleated':'open top and one prominent vertical inverted box pleat down the center, raised folded fabric and visible fold shadows'}[style]
    return f'One {spec.color} {shape} sewn fabric pocket, {detail}, stitching on the left side, right side and bottom, realistic fabric texture and soft shadows. Plain empty pocket, no logo.'

def conditioning_sketch(image,mask,spec=None,box=None,style='classic'):
    bounds=mask.getbbox()
    if not bounds:raise ValueError('Empty edit area')
    x0,y0,x1,y1=bounds;w=x1-x0;h=y1-y0
    left=x0+w*.14;right=x1-w*.14;top=y0+h*.22;bottom=y1-h*.12
    if box:left,top,right,bottom=box
    width=right-left;hem=max(3,h*.045);sag=h*.035
    layer=image.copy();draw=ImageDraw.Draw(layer)
    shadow=Image.new('L',image.size,0)
    ImageDraw.Draw(shadow).rounded_rectangle((left-2,top+3,right+4,bottom+5),radius=max(2,w*.025),fill=80)
    shadow=ImageChops.multiply(shadow.filter(ImageFilter.GaussianBlur(max(1,w*.02))),mask)
    layer=Image.composite(Image.new('RGB',image.size,(25,9,13)),layer,shadow)
    draw=ImageDraw.Draw(layer)
    # Rear lip and dark empty mouth; front panel starts slightly lower.
    draw.polygon([(left,top),(right,top),(right,top+hem+sag),(left,top+hem+sag)],fill=(15,29,51))
    opening=[(left,top+hem*.35),(right,top+hem*.35),(right-width*.1,top+hem+sag),(left+width*.1,top+hem+sag)]
    draw.polygon(opening,fill=(4,10,22))
    front=[(left,top+hem*.7),(left+width*.28,top+hem+sag),(right-width*.28,top+hem+sag),(right,top+hem*.7),(right,bottom-h*.025),(right-h*.025,bottom),(left+h*.025,bottom),(left,bottom-h*.025)]
    color={'navy':(20,39,70),'black':(38,40,43),'cream':(217,196,161)}.get(getattr(spec,'color','navy'))
    if getattr(spec,'shape',None)=='rounded_bottom':
        radius=(right-left)*.16
        draw.rounded_rectangle((left,top+hem+sag,right,bottom),radius=radius,fill=color)
        draw.rectangle((left,top+hem+sag,right,top+hem+sag+radius),fill=color)
        draw.polygon(front[:4]+[(right,top+hem+sag+radius),(left,top+hem+sag+radius)],fill=color)
    else:draw.polygon(front,fill=color)
    highlight=tuple(min(255,c+20) for c in color)
    draw.line(front[:4],fill=highlight,width=max(2,round(hem*.55)))
    inset=max(2,w*.025)
    if getattr(spec,'shape',None)=='rounded_bottom':
        draw.rounded_rectangle((left+inset,top+hem*1.8,right-inset,bottom-inset),radius=(right-left)*.12,outline=highlight,width=max(1,round(w*.004)))
    else:draw.line([(left+inset,top+hem*1.8),(left+inset,bottom-inset),(right-inset,bottom-inset),(right-inset,top+hem*1.8)],fill=highlight,width=max(1,round(w*.004)))
    dark=tuple(max(0,c-16) for c in color)
    if style=='flap':
        flap_bottom=top+(bottom-top)*.32
        draw.rectangle((left,top,right,flap_bottom+max(2,hem*.5)),fill=dark)
        draw.polygon([(left,top),(right,top),(right,flap_bottom-hem*.4),(right-width*.12,flap_bottom),(left+width*.12,flap_bottom),(left,flap_bottom-hem*.4)],fill=highlight)
        draw.line([(left+inset,flap_bottom-hem*.6),(right-inset,flap_bottom-hem*.6)],fill=color,width=max(1,round(hem*.25)))
    elif style=='pleated':
        middle=(left+right)/2;fold=width*.13;start=top+hem+sag
        draw.rectangle((middle-fold,start,middle+fold,bottom-inset),fill=dark)
        draw.rectangle((middle-fold,start,middle-fold*.6,bottom-inset),fill=highlight)
        draw.rectangle((middle+fold*.6,start,middle+fold,bottom-inset),fill=highlight)
        draw.line([(middle,start),(middle,bottom-inset)],fill=color,width=max(2,round(width*.035)))
    return Image.composite(layer,image,mask)
