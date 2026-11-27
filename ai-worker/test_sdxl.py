import unittest,base64,io
from unittest.mock import patch
from types import SimpleNamespace
from PIL import Image,ImageChops
from server import Task
from sdxl_inpainting import preview,detail_tasks
from edit_mask import stroke_mask
from preview_errors import PreviewFailure

class SDXLContract(unittest.TestCase):
    def test_structured_pocket_bypasses_translation_and_requires_confirmation(self):
        from server import PocketSpec
        task=self.task();task.markup.details=task.markup.details[:1];task.markup.strokes=[]
        task.markup.details[0].pocket=PocketSpec(shape='rectangular',color='navy',box={'x':.2,'y':.3,'width':.2,'height':.25},confirmed=False)
        with self.assertRaises(PreviewFailure):list(detail_tasks(task))
        task.markup.details[0].pocket.confirmed=True
        task.variation_index=1
        calls=[]
        class Pipeline:
            def __call__(self,**kwargs):
                calls.append(kwargs);return SimpleNamespace(images=[Image.new('RGB',(kwargs['width'],kwargs['height']),'blue')])
            def maybe_free_model_hooks(self):pass
        with patch('sdxl_inpainting.ready',return_value=True),patch('sdxl_inpainting.pipeline',return_value=Pipeline()),patch('local_engine.generate',side_effect=AssertionError('Structured settings must not be rewritten')),patch('image_safety.safety',return_value=(lambda **kw:(None,[False]),lambda **kw:SimpleNamespace(pixel_values=None))):
            result=preview(task)
        self.assertEqual(calls[0]['width'],1024)
        self.assertEqual(calls[0]['controlnet_conditioning_scale'],0)
        self.assertEqual(calls[0]['strength'],.55)
        self.assertIn('sketch-guided hybrid',result['model'])
        self.assertIn('flap covering',calls[0]['prompt'])
        self.assertEqual(result['variant_label'],'Saku dengan penutup')
    def test_rectangular_pocket_guide_is_inside_mask_and_opt_in(self):
        import numpy as np
        from sdxl_inpainting import control_image
        source=Image.new('RGB',(160,160),'red')
        mask=Image.new('L',(160,160),0);mask.paste(255,(40,30,120,130))
        plain=np.asarray(control_image(source,mask))
        guided=np.asarray(control_image(source,mask,'a navy rectangular pocket'))
        self.assertGreater(int(guided.sum()),int(plain.sum()))
        self.assertTrue(np.array_equal(guided[np.asarray(mask)==0],plain[np.asarray(mask)==0]))
        self.assertTrue(np.array_equal(np.asarray(control_image(source,mask,'a white circle logo')),plain))
    def test_navy_pocket_prompt_separates_object_color_from_preservation_text(self):
        from sdxl_inpainting import generation_prompt
        positive,negative=generation_prompt("Add a navy blue rectangular pocket. Keep the red shirt outside the pocket.")
        self.assertIn("navy blue fabric patch pocket",positive)
        self.assertNotIn("red shirt",positive)
        self.assertIn("red pocket",negative)
        ordinary,_=generation_prompt("Add a white circle logo on the shirt")
        self.assertNotIn("navy",ordinary)
        blue_garment,_=generation_prompt("a navy blue rectangular pocket on a blue blouse")
        self.assertNotIn("red T-shirt",blue_garment)
        round_pocket,_=generation_prompt("a round navy blue pocket on a blouse")
        self.assertIn("round",round_pocket)
    def task(self):
        stream=io.BytesIO();Image.new("RGB",(200,160),"red").save(stream,format="PNG")
        return Task(prompt="two changes",engine="sdxl",image=base64.b64encode(stream.getvalue()).decode(),markup={"details":[{"id":"a","text":"add pocket","x":.2,"y":.3},{"id":"b","text":"add button","x":.7,"y":.6}],"strokes":[{"tool":"draw","detailId":"a","width":.1,"points":[[.2,.3],[.3,.3]]},{"tool":"draw","detailId":"b","width":.1,"points":[[.7,.6],[.8,.6]]}]})
    def test_each_instruction_has_its_own_region_and_result_preserves_every_other_pixel(self):
        task=self.task();original=Image.open(io.BytesIO(base64.b64decode(task.image))).convert("RGB")
        calls=[]
        class Pipeline:
            def __call__(self,**kwargs):
                calls.append(kwargs);return SimpleNamespace(images=[Image.new("RGB",(768,768),"blue" if len(calls)==1 else "green")])
            def maybe_free_model_hooks(self):pass
        processor=lambda **kw:SimpleNamespace(pixel_values=None)
        checker=lambda **kw:(None,[False])
        with patch("sdxl_inpainting.ready",return_value=True),patch("sdxl_inpainting.pipeline",return_value=Pipeline()),patch("local_engine.generate",side_effect=lambda prompt,**kw:prompt.split("Request: ")[-1]),patch("image_safety.safety",return_value=(checker,processor)):
            result=preview(task)
        self.assertEqual(len(calls),2)
        self.assertIn("pocket",calls[0]["prompt"]);self.assertNotIn("button",calls[0]["prompt"]);self.assertIn("button",calls[1]["prompt"]);self.assertNotIn("pocket",calls[1]["prompt"])
        final=Image.open(io.BytesIO(base64.b64decode(result["image"]))).convert("RGB")
        mask=stroke_mask(original.size,task.markup)
        diff=ImageChops.difference(original,final).convert("L")
        self.assertIsNone(ImageChops.multiply(diff,ImageChops.invert(mask)).getbbox())
        self.assertIsNotNone(diff.getbbox());self.assertEqual(final.getpixel((45,48)),(0,0,255));self.assertEqual(final.getpixel((145,96)),(0,128,0))
    def test_unmarked_detail_is_rejected(self):
        task=self.task();task.markup.strokes=[]
        with self.assertRaises(PreviewFailure):list(detail_tasks(task))

    def test_control_edges_cleared_only_in_target(self):
        import numpy as np
        from sdxl_inpainting import control_image
        im=Image.new("RGB",(100,100),"white");im.paste("black",(20,20,80,80))
        mask=Image.new("L",(100,100),0);mask.paste(255,(0,0,50,100))
        edges=np.asarray(control_image(im,mask))
        self.assertEqual(int(edges[:,:50].sum()),0)
        self.assertGreater(int(edges[:,50:].sum()),0)

    def test_text_concept_does_not_require_customer_photo_or_mask(self):
        task=Task(prompt="a red t-shirt with blue pocket",engine="sdxl",generation="text")
        self.assertEqual(list(detail_tasks(task)),[(1,task.prompt,None)])
        calls=[]
        class Pipeline:
            def __call__(self,**kwargs):
                calls.append(kwargs);return SimpleNamespace(images=[Image.new("RGB",(768,768),"blue")])
            def maybe_free_model_hooks(self):pass
        with patch("sdxl_inpainting.ready",return_value=True),patch("sdxl_inpainting.pipeline",return_value=Pipeline()),patch("local_engine.generate",return_value=task.prompt),patch("image_safety.safety",return_value=(lambda **kw:(None,[False]),lambda **kw:SimpleNamespace(pixel_values=None))):
            result=preview(task)
        self.assertEqual(calls[0]['mask_image'].getextrema(),(255,255))
        self.assertEqual(calls[0]['controlnet_conditioning_scale'],0)
        self.assertEqual(result['preservation'],'full-concept')
    def test_missing_weights_does_not_fabricate_a_preview(self):
        with patch("sdxl_inpainting.ready",return_value=False):
            with self.assertRaises(PreviewFailure) as e:preview(self.task())
        self.assertEqual(e.exception.code,"MODEL_NOT_READY")

    def test_pipeline_cache_is_released_on_inference_failure(self):
        with patch("sdxl_inpainting._preview",side_effect=PreviewFailure("GPU_MEMORY")),patch("sdxl_inpainting.pipeline") as cache:
            with self.assertRaises(PreviewFailure):preview(self.task())
            cache.cache_clear.assert_called_once()

    def test_logo_prompt_does_not_invent_stitching_or_an_unrequested_pocket(self):
        from sdxl_inpainting import generation_prompt
        positive,negative=generation_prompt("Add a white circle logo on the shirt")
        self.assertNotIn("stitching",positive)
        self.assertNotIn("Add ",positive)
        self.assertIn("patch pocket",negative)
        self.assertNotIn("patch pocket",generation_prompt("a logo on an existing pocket")[1])
