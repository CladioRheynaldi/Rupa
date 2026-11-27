import unittest
from types import SimpleNamespace
from PIL import Image, ImageChops
from pydantic import ValidationError
from server import EditRegion, Task
from inpainting import region_mask, compose_region

class MaskedEditing(unittest.TestCase):
    def test_outside_region_is_pixel_identical(self):
        original = Image.new("RGB", (200,160), "red")
        generated = Image.new("RGB", (200,160), "blue")
        mask = region_mask(original.size, EditRegion(x=.2,y=.25,width=.3,height=.5))
        final = compose_region(original,generated,mask)
        difference = ImageChops.difference(original,final)
        self.assertEqual(difference.getbbox(),(40,40,100,120))
        self.assertEqual(final.getpixel((39,50)),original.getpixel((39,50)))
        self.assertEqual(final.getpixel((70,80)),generated.getpixel((70,80)))

    def test_out_of_bounds_region_is_rejected(self):
        with self.assertRaises(ValidationError):
            EditRegion(x=.9,y=.2,width=.5,height=.2)
        with self.assertRaises(ValidationError):
            EditRegion(x=0,y=0,width=.001,height=.2)

    def test_mask_reaches_image_boundary_without_overflow(self):
        region = EditRegion(x=.5,y=.5,width=.5,height=.5)
        self.assertEqual(region_mask((100,100),region).getbbox(),(50,50,100,100))

    def test_invalid_seed_is_rejected(self):
        with self.assertRaises(ValidationError):
            Task(prompt="add pocket",seed=-1)

if __name__ == "__main__": unittest.main()
