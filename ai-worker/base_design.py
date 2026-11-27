"""Base-garment constraints for catalogue retrieval, separate from desired edits."""
import colorsys
from collections import Counter

CATEGORIES = {
    "tshirt": "a t-shirt with short sleeves",
    "shirt": "a button-up shirt with a collar",
    "long_sleeve": "a long sleeved top",
    "dress": "a dress",
    "jacket": "a jacket or coat",
    "pants": "a pair of long trousers",
    "shorts": "a pair of shorts",
    "skirt": "a skirt",
}
LABELS = {"tshirt":"kaos", "shirt":"kemeja", "long_sleeve":"atasan lengan panjang",
          "dress":"gaun", "jacket":"jaket/luaran", "pants":"celana panjang", "shorts":"celana pendek", "skirt":"rok",
          "red":"merah", "orange":"oranye", "yellow":"kuning", "green":"hijau", "blue":"biru", "purple":"ungu", "pink":"merah muda", "brown":"cokelat",
          "black":"hitam", "white":"putih", "gray":"abu-abu"}

def dominant_color(image):
    """Conservative central-colour estimate. Not garment segmentation or truth labels.

    Central crop limits background influence; abstain on strongly mixed colours.
    A person/background in this region can still affect the result.
    """
    image=image.convert("RGB")
    w,h=image.size
    pixels=image.crop((int(w*.28),int(h*.25),int(w*.72),int(h*.72))).resize((48,48))
    counts=Counter()
    for r,g,b in pixels.getdata():
        hue,sat,value=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if value<.20: color="black"
        elif sat<.16: color="white" if value>.78 else "gray"
        elif value<.55 and .025<hue<.14: color="brown"
        elif hue<.045 or hue>=.95: color="red"
        elif hue<.105: color="orange"
        elif hue<.19: color="yellow"
        elif hue<.46: color="green"
        elif hue<.72: color="blue"
        elif hue<.86: color="purple"
        else: color="pink"
        counts[color]+=1
    color,count=counts.most_common(1)[0]
    return color if count/sum(counts.values())>=.45 else None

def compatible_base(category, color, attributes, reference_color):
    # Unknown colours do not count as a confirmed match when a base colour exists.
    return category in attributes and (not color or reference_color==color)
