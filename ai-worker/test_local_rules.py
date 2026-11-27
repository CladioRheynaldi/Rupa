import unittest
from local_engine import concepts, english_query, relevant_advice, matching_references

class CatalogueRules(unittest.TestCase):
    def test_right_pocket_natural_language(self):
        from types import SimpleNamespace
        right = SimpleNamespace(name="Kaos merah saku kanan", attributes=["tshirt", "red", "pocket", "right"])
        left = SimpleNamespace(name="Kaos merah saku kiri", attributes=["tshirt", "red", "pocket", "left"])
        self.assertEqual(matching_references("Saku di sebelah kanan pakaian", [right, left]), [right])
        self.assertEqual(matching_references("logo naga", [right, left]), [])
    def test_semantic_search_keeps_category_without_requiring_unverified_detail_labels(self):
        from local_engine import semantic_references
        from types import SimpleNamespace
        tshirt=SimpleNamespace(name="Kaos",attributes=["tshirt"])
        skirt=SimpleNamespace(name="Rok",attributes=["skirt"])
        self.assertEqual(semantic_references("kaos merah dengan kantong besar",[tshirt,skirt]),[tshirt])
        self.assertEqual(semantic_references("detail kantong",[tshirt,skirt]),[tshirt,skirt])
    def test_indonesian_attributes(self):
        self.assertEqual(concepts("Tambahkan logo tengkorak di tengah kaos merah"), {"skull","center","tshirt","red"})
    def test_tshirt_is_not_also_a_shirt(self):
        self.assertNotIn("shirt", concepts("red t-shirt"))
    def test_dress_size_not_inferred(self):
        self.assertEqual(concepts("gaun kuning"), {"dress","yellow"})
    def test_glossary_keeps_motif_and_position(self):
        result = english_query("tambahkan logo tengkorak di tengah kaos merah")
        for word in ["add","skull","center","tshirt","red"]:
            self.assertIn(word,result)
    def test_unrequested_body_areas_are_rejected(self):
        self.assertFalse(relevant_advice("Apakah ukuran dada dan lengan sesuai?", "Pinggang 80 cm menjadi 76 cm", "measurements"))
        self.assertTrue(relevant_advice("Di mana garis pinggang diukur?", "Pinggang 80 cm menjadi 76 cm", "measurements"))
    def test_unrequested_color_switch_is_rejected(self):
        self.assertFalse(relevant_advice("Kaos putih atau merah?", "Logo pada kaos merah", "design"))

if __name__ == "__main__": unittest.main()
