import unittest
from PIL import Image,ImageChops
from pocket_layout import applicable,conditioning_sketch

class PocketLayoutTests(unittest.TestCase):
    def test_design_variants_change_geometry_without_changing_color_box_or_outside_mask(self):
        from server import PocketSpec
        from pocket_layout import STYLES,pocket_mask,pocket_prompt
        spec=PocketSpec(shape='rectangular',color='navy',box={'x':.2,'y':.3,'width':.3,'height':.4},confirmed=True)
        before=spec.model_dump();source=Image.new('RGB',(240,240),'red');mask=pocket_mask(source.size,spec)
        images=[conditioning_sketch(source,mask,spec,(48,72,120,168),style) for style in STYLES]
        self.assertEqual(len(set(im.tobytes() for im in images)),3)
        for im in images:
            self.assertIsNone(ImageChops.multiply(ImageChops.difference(source,im).convert('L'),ImageChops.invert(mask)).getbbox())
        self.assertEqual(spec.model_dump(),before)
        self.assertIn('flap',pocket_prompt(spec,'flap'))
        self.assertIn('pleat',pocket_prompt(spec,'pleated'))
        for style in STYLES:self.assertIn('navy rectangular',pocket_prompt(spec,style))
    def test_structured_geometry_color_and_validation(self):
        from server import PocketSpec
        from pocket_layout import pocket_mask,pocket_prompt
        from pydantic import ValidationError
        spec=PocketSpec(shape='rounded_bottom',color='cream',box={'x':.2,'y':.3,'width':.2,'height':.25},confirmed=True)
        source=Image.new('RGB',(200,200),'red');mask=pocket_mask(source.size,spec)
        result=conditioning_sketch(source,mask,spec,(40,60,80,110))
        self.assertEqual(result.getpixel((60,90)),(217,196,161))
        self.assertEqual(result.getpixel((20,20)),source.getpixel((20,20)))
        self.assertIn('open top',pocket_prompt(spec))
        self.assertNotIn('Note',pocket_prompt(spec))
        with self.assertRaises(ValidationError):PocketSpec(shape='circle',color='cream',box=spec.box,confirmed=True)
        with self.assertRaises(ValidationError):PocketSpec(shape='rectangular',color='navy',box={'x':.9,'y':.3,'width':.2,'height':.2},confirmed=True)
    def test_only_supported_requested_geometry_uses_draft(self):
        self.assertTrue(applicable('a navy rectangular pocket'))
        for text in ['a white circle logo','a round navy pocket','a navy rectangular pocket with a zipper','a red rectangular pocket','two navy rectangular pocket details']:
            self.assertFalse(applicable(text))
    def test_draft_stays_inside_customer_mask(self):
        original=Image.new('RGB',(200,200),'red')
        mask=Image.new('L',(200,200),0);mask.paste(255,(40,30,140,170))
        result=conditioning_sketch(original,mask)
        diff=ImageChops.difference(original,result).convert('L')
        self.assertIsNone(ImageChops.multiply(diff,ImageChops.invert(mask)).getbbox())
        self.assertIsNotNone(diff.getbbox())
