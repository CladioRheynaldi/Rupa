"""No GPU, model weights, or external provider requests are used by this test."""
import os
import unittest
from unittest.mock import patch
os.environ["AI_WORKER_TOKEN"] = "test-token-not-for-real-use-123456789"
os.environ.pop("QWEN_VL_URL", None)
os.environ.pop("QWEN_EDIT_URL", None)
os.environ.pop("ENABLE_LOCAL_RETRIEVAL", None)
from fastapi.testclient import TestClient
from server import app

class WorkerContract(unittest.TestCase):
    def setUp(self):
        token_patch = patch("server.TOKEN", os.environ["AI_WORKER_TOKEN"])
        token_patch.start()
        self.addCleanup(token_patch.stop)
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer " + os.environ["AI_WORKER_TOKEN"]}
    def test_health_does_not_claim_models_are_connected(self):
        result = self.client.get("/health")
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()["analysis_configured"])
        self.assertFalse(result.json()["preview_configured"])
    def test_unauthorized_analysis_is_rejected(self):
        result = self.client.post("/analyze", json={"prompt": "add a pocket", "mode": "design"})
        self.assertEqual(result.status_code, 403)
    def test_missing_model_returns_error_not_fake_analysis(self):
        result = self.client.post("/analyze", headers=self.headers, json={"prompt": "add a pocket", "mode": "design"})
        self.assertEqual(result.status_code, 503)
    def test_missing_preview_returns_error_not_fake_image(self):
        result = self.client.post("/preview", headers=self.headers, json={"prompt": "add a pocket", "mode": "preview"})
        self.assertEqual(result.status_code, 503)
    def test_disabled_retrieval_returns_error_not_keyword_results(self):
        result = self.client.post("/search", headers=self.headers, json={"query": "red skull t-shirt", "references": []})
        self.assertEqual(result.status_code, 410)
    def test_preview_failure_is_structured_without_leaking_exception(self):
        import base64,io
        from PIL import Image
        from preview_errors import PreviewFailure
        stream=io.BytesIO();Image.new("RGB",(16,16),"white").save(stream,format="PNG")
        payload={"prompt":"add a pocket","image":base64.b64encode(stream.getvalue()).decode(),"engine":"sdxl"}
        with patch.dict(os.environ,{"ENABLE_LOCAL_MODELS":"1"}), patch("server.health",return_value={"sdxl_ready":True,"controlnet_ready":True,"analysis_ready":True,"retrieval_ready":True}), patch("pathlib.Path.exists",return_value=True), patch("sdxl_inpainting.preview",side_effect=PreviewFailure("IMAGE_CHECK_REJECTED",1)):
            response=self.client.post("/preview",headers=self.headers,json=payload)
        self.assertEqual(response.status_code,422)
        self.assertEqual(response.json()["detail"],{"code":"IMAGE_CHECK_REJECTED","detail_number":1})
    def test_invalid_payload_is_rejected(self):
        result = self.client.post("/analyze", headers=self.headers, json={"prompt": "x", "mode": "unknown"})
        self.assertEqual(result.status_code, 422)

if __name__ == "__main__":
    unittest.main()
