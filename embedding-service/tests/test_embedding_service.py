"""Unit and API tests for the NestLink FastAPI Embedding Service.

Runnable via either:
  python3 -m unittest discover -s tests -v
  pytest -v
"""

from __future__ import annotations

import hashlib
import math
import os
import sys
import unittest
from pathlib import Path
from typing import List

from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.main import create_app  # noqa: E402
from app.model import EmbeddingModel, EmbeddingModelError  # noqa: E402
from app.preprocessing import preprocess_text  # noqa: E402


class DeterministicFakeModel(EmbeddingModel):
    """Lightweight deterministic 384-dim normalized model for offline API tests."""

    def __init__(self, fail: bool = False, loaded: bool = True) -> None:
        super().__init__(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            expected_dimensions=384,
        )
        self._fail = fail
        self._model = object() if loaded else None

    def load(self) -> None:
        self._model = object()

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        if not self.is_loaded:
            raise EmbeddingModelError("Embedding model is not loaded.")
        if self._fail:
            raise EmbeddingModelError("Simulated inference error.")

        vectors: List[List[float]] = []
        for text in texts:
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            raw = [((digest[i % len(digest)] / 255.0) - 0.5) for i in range(384)]
            norm = math.sqrt(sum(v * v for v in raw)) or 1.0
            vectors.append([v / norm for v in raw])
        return vectors


class TestPreprocessing(unittest.TestCase):
    def test_strips_html_and_collapses_whitespace(self) -> None:
        raw = "  <p>Backend   <b>Auth</b>\n\tand\tAPI Security</p>  "
        self.assertEqual(preprocess_text(raw), "Backend Auth and API Security")

    def test_truncates_to_max_length(self) -> None:
        text = "a" * 100
        self.assertEqual(len(preprocess_text(text, max_length=25)), 25)

    def test_handles_empty_and_whitespace(self) -> None:
        self.assertEqual(preprocess_text("   \n\t  "), "")


class TestEmbeddingEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.pop("EMBEDDING_API_KEY", None)
        self.model = DeterministicFakeModel()
        self.app = create_app(model_instance=self.model)
        self.client = TestClient(self.app)

    def test_health_endpoint(self) -> None:
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["ready"])
        self.assertEqual(body["dimensions"], 384)

    def test_embed_single_returns_normalized_384_vector(self) -> None:
        res = self.client.post(
            "/embed",
            json={"text": "Resources to learn backend authentication and API security"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["dimensions"], 384)
        self.assertEqual(len(body["embedding"]), 384)
        norm = math.sqrt(sum(x * x for x in body["embedding"]))
        self.assertAlmostEqual(norm, 1.0, places=5)

    def test_embed_rejects_whitespace_only_text(self) -> None:
        res = self.client.post("/embed", json={"text": "   \n\t  "})
        self.assertEqual(res.status_code, 400)

    def test_embed_batch_returns_multiple_vectors(self) -> None:
        res = self.client.post(
            "/embed/batch",
            json={"texts": ["JWT authentication guide", "React Tailwind dashboard"]},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["count"], 2)
        self.assertEqual(len(body["embeddings"]), 2)
        self.assertEqual(len(body["embeddings"][0]), 384)

    def test_embed_batch_rejects_empty_item(self) -> None:
        res = self.client.post("/embed/batch", json={"texts": ["Valid text", "   "]})
        self.assertEqual(res.status_code, 400)

    def test_api_key_protection_when_configured(self) -> None:
        os.environ["EMBEDDING_API_KEY"] = "secret-key-123"
        try:
            unauth = self.client.post("/embed", json={"text": "test"})
            self.assertEqual(unauth.status_code, 401)

            auth = self.client.post(
                "/embed",
                json={"text": "test"},
                headers={"X-API-Key": "secret-key-123"},
            )
            self.assertEqual(auth.status_code, 200)
        finally:
            os.environ.pop("EMBEDDING_API_KEY", None)

    def test_returns_503_on_model_inference_failure(self) -> None:
        failing_app = create_app(model_instance=DeterministicFakeModel(fail=True))
        failing_client = TestClient(failing_app)
        res = failing_client.post("/embed", json={"text": "hello world"})
        self.assertEqual(res.status_code, 503)


if __name__ == "__main__":
    unittest.main()
