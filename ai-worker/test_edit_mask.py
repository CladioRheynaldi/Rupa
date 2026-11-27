import unittest
from PIL import Image, ImageChops, ImageDraw
from pydantic import ValidationError
from server import DesignMarkup
from edit_mask import stroke_mask,crop_context,composite_strokes

class CustomerMarkup(unittest.TestCase):
    def test_generated_fabric_cast_is_corrected_without_recolouring_new_object(self):
        original=Image.new('RGB',(100,100),(240,0,0))
        generated=Image.new('RGB',(100,100),(200,0,0));ImageDraw.Draw(generated).rectangle((40,40,60,60),fill='blue')
        mask=Image.new('L',(100,100),0);ImageDraw.Draw(mask).rectangle((20,20,80,80),fill=255)
        result=composite_strokes(original,generated,(0,0,100,100),mask)
        self.assertEqual(result.getpixel((30,30)),(240,0,0))
        self.assertEqual(result.getpixel((50,50)),(0,0,255))
        self.assertEqual(result.getpixel((10,10)),original.getpixel((10,10)))
    def test_closed_outline_edits_the_inside_not_only_brush_ring(self):
        import math
        circle=[[.5+.2*math.cos(i*2*math.pi/40),.5+.2*math.sin(i*2*math.pi/40)] for i in range(41)]
        markup=DesignMarkup(strokes=[{"tool":"draw","width":.03,"points":circle}])
        mask=stroke_mask((200,200),markup)
        self.assertEqual(mask.getpixel((100,100)),255)
        self.assertEqual(mask.getpixel((10,10)),0)
        # An explicit eraser hole must survive another unrelated stroke.
        markup.strokes.append(type(markup.strokes[0])(tool="erase",width=.08,points=[(.5,.5)]))
        markup.strokes.append(type(markup.strokes[0])(tool="draw",width=.03,points=[(.1,.1),(.2,.1)]))
        self.assertEqual(stroke_mask((200,200),markup).getpixel((100,100)),0)

    def test_erase_and_preservation_outside_strokes(self):
        markup=DesignMarkup(strokes=[
            {"tool":"draw","width":.12,"points":[[.2,.5],[.8,.5]]},
            {"tool":"erase","width":.15,"points":[[.5,.4],[.5,.6]]},
        ])
        original=Image.new("RGB",(200,150),"red")
        mask=stroke_mask(original.size,markup)
        self.assertEqual(mask.getpixel((100,75)),0)
        self.assertEqual(mask.getpixel((60,75)),255)
        crop,box=crop_context(original,mask)
        result=composite_strokes(original,Image.new("RGB",crop.size,"blue"),box,mask)
        diff=ImageChops.difference(original,result)
        self.assertEqual(ImageChops.multiply(diff,ImageChops.invert(mask).convert("RGB")).getbbox(),None)
        self.assertEqual(result.getpixel((100,75)),original.getpixel((100,75)))

    def test_invalid_coordinates_and_empty_result_are_rejected(self):
        with self.assertRaises(ValidationError):
            DesignMarkup(strokes=[{"tool":"draw","width":.1,"points":[[2,.5]]}])
        empty=DesignMarkup(strokes=[{"tool":"erase","width":.1,"points":[[.5,.5]]}])
        with self.assertRaisesRegex(ValueError,"Penanda kosong"):
            crop_context(Image.new("RGB",(50,50)),stroke_mask((50,50),empty))

if __name__ == "__main__": unittest.main()
