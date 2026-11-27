import unittest
from PIL import Image
from base_design import dominant_color, compatible_base

class BaseDesignTests(unittest.TestCase):
    def test_red_garment_with_white_background(self):
        im=Image.new('RGB',(100,100),'white')
        im.paste('red',(25,15,75,85))
        self.assertEqual(dominant_color(im),'red')

    def test_same_category_but_wrong_color_excluded(self):
        self.assertFalse(compatible_base('tshirt','red',['tshirt'],'yellow'))
        self.assertFalse(compatible_base('tshirt','red',['dress'],'red'))
        self.assertFalse(compatible_base('tshirt','red',['tshirt'],None))
        self.assertTrue(compatible_base('tshirt','red',['tshirt'],'red'))

    def test_uncertain_base_color_does_not_invent_color(self):
        im=Image.new('RGB',(48,48),'red')
        for x in range(48):
            for y in range(48): im.putpixel((x,y), [(255,0,0),(0,0,255),(0,255,0)][x%3])
        self.assertIsNone(dominant_color(im))

if __name__=='__main__': unittest.main()
