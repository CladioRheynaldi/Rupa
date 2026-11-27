"""Render normalized customer annotations into a binary editing mask."""
from PIL import Image, ImageDraw, ImageChops, ImageOps

def closed_outline(points,width):
    if len(points)<4:return False
    area=abs(sum(x1*y2-x2*y1 for (x1,y1),(x2,y2) in zip(points,points[1:]+points[:1])))/2
    return (points[0][0]-points[-1][0])**2+(points[0][1]-points[-1][1])**2 <= (2*width)**2 and area>width*width

def fill_enclosed(mask):
    import cv2,numpy as np
    # Padding ensures flood-fill starts outside even if the selection hits an edge.
    padded=np.asarray(ImageOps.expand(mask,border=1,fill=0)).copy()
    cv2.floodFill(padded,None,(0,0),128)
    holes=Image.fromarray(np.where(padded[1:-1,1:-1]==0,255,0).astype('uint8'))
    return ImageChops.lighter(mask,holes)

def stroke_mask(size, markup):
    mask = Image.new("L",size,0)
    for stroke in markup.strokes:
        layer=Image.new("L",size,0)
        draw=ImageDraw.Draw(layer)
        width = max(1,round(stroke.width*size[0]))
        points = [(round(x*(size[0]-1)),round(y*(size[1]-1))) for x,y in stroke.points]
        color = 255
        closed=stroke.tool == "draw" and closed_outline(points,width)
        if closed:
            draw.polygon(points,fill=255)
        draw.line(points+[points[0]] if closed else points,fill=color,width=width,joint="curve")
        radius = width/2
        for x,y in points:
            draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=color)
        if stroke.tool == "draw":
            mask=ImageChops.lighter(mask,fill_enclosed(layer))
        else:
            mask=ImageChops.subtract(mask,layer)
    return mask

def crop_context(image,mask):
    box = mask.getbbox()
    if box is None:
        raise ValueError("Penanda kosong setelah dihapus. Coret kembali area yang ingin diubah.")
    pad = max(20,round(max(box[2]-box[0],box[3]-box[1])*.75))
    box = (max(0,box[0]-pad),max(0,box[1]-pad),min(image.width,box[2]+pad),min(image.height,box[3]+pad))
    return image.crop(box),box

def composite_strokes(original,generated,box,mask):
    import cv2,numpy as np
    full = original.copy()
    full.paste(generated.resize((box[2]-box[0],box[3]-box[1]),Image.Resampling.LANCZOS),box[:2])
    selected=np.asarray(mask)>0
    # Distance-based feathering stays wholly inside the permitted region.
    distance=cv2.distanceTransform(selected.astype('uint8'),cv2.DIST_L2,5)
    bounds=mask.getbbox()
    if not bounds:return original.copy()
    radius=max(1,min(10,min(bounds[2]-bounds[0],bounds[3]-bounds[1])*.08))
    before=np.asarray(original.convert('RGB'));after=np.asarray(full.convert('RGB')).copy()
    old_hsv=cv2.cvtColor(before,cv2.COLOR_RGB2HSV);new_hsv=cv2.cvtColor(after,cv2.COLOR_RGB2HSV)
    hue=np.abs(old_hsv[:,:,0].astype('int16')-new_hsv[:,:,0].astype('int16'))
    hue=np.minimum(hue,180-hue)
    # Correct a colour cast only on material with a similar hue, preserving
    # contrasting new objects. Estimate the offset at the inner boundary.
    similar=(hue<10)&(old_hsv[:,:,1]>55)&(new_hsv[:,:,1]>55)&selected
    boundary=similar&(distance>1)&(distance<=max(3,radius))
    if boundary.sum()>=16:
        offset=np.clip(np.median(before[boundary].astype('float32')-after[boundary].astype('float32'),axis=0),-48,48)
        after[similar]=np.clip(after[similar].astype('float32')+offset,0,255).astype('uint8')
    alpha=np.clip(distance/radius,0,1)
    alpha=alpha*alpha*(3-2*alpha) # Smoothstep: no hard circular edge.
    blend=Image.fromarray((alpha*255).astype('uint8'))
    # Unmarked and erased pixels have alpha exactly zero.
    return Image.composite(Image.fromarray(after),original,blend)
