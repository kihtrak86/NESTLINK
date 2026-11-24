"""Sentence Transformers model loader and inference wrapper.

The model is loaded once at process startup (outside request handlers)
and reused across all incoming requests.
"""

from __future__ import annotations

import logging
import math
from typing import List, Optional

logger = logging.getLogger("nestlink.embedding.model")


class EmbeddingModelError(RuntimeError):
    """Raised when embedding generation fails or produces invalid output."""


class EmbeddingModel:
    """Singleton-style wrapper around sentence-transformers/all-MiniLM-L6-v2."""

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        expected_dimensions: int = 384,
    ) -> None:
        self.model_name = model_name
        self.expected_dimensions = expected_dimensions
        self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """Load SentenceTransformer weights once into memory."""
        if self._model is not None:
            return

        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError as exc:
            raise EmbeddingModelError(
                "sentence-transformers is not installed. Run `pip install -r requirements.txt`."
            ) from exc

        logger.info("Loading embedding model: %s", self.model_name)
        self._model = SentenceTransformer(self.model_name)
        actual_dim = self._model.get_sentence_embedding_dimension()
        if actual_dim != self.expected_dimensions:
            logger.warning(
                "Loaded model dimension (%s) differs from expected (%s).",
                actual_dim,
                self.expected_dimensions,
            )
            self.expected_dimensions = int(actual_dim)
        logger.info(
            "Embedding model ready: %s (%d dims)",
            self.model_name,
            self.expected_dimensions,
        )

    def _validate_vector(self, vector: List[float]) -> List[float]:
        if len(vector) != self.expected_dimensions:
            raise EmbeddingModelError(
                f"Expected {self.expected_dimensions}-dim vector, got {len(vector)}."
            )
        cleaned: List[float] = []
        for value in vector:
            fval = float(value)
            if not math.isfinite(fval):
                raise EmbeddingModelError("Embedding contains non-finite value.")
            cleaned.append(fval)
        return cleaned

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Encode a list of preprocessed strings into L2-normalized vectors."""
        if not self.is_loaded:
            raise EmbeddingModelError("Embedding model is not loaded.")
        if not texts:
            return []

        raw_vectors = self._model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        result: List[List[float]] = []
        for row in raw_vectors:
            vec = row.tolist() if hasattr(row, "tolist") else list(row)
            result.append(self._validate_vector(vec))
        return result

    def embed_one(self, text: str) -> List[float]:
        """Encode a single preprocessed string into an L2-normalized vector."""
        vectors = self.embed_batch([text], batch_size=1)
        return vectors[0]
