"""ONNX Runtime model loader and inference wrapper for sentence-transformers/all-MiniLM-L6-v2.

Produces the exact same 384-dimensional L2-normalized embeddings (mean pooling + L2 norm)
without requiring PyTorch, keeping runtime memory under ~180 MB on Render's 512 MB tier.
"""

from __future__ import annotations

import logging
import math
from typing import List

logger = logging.getLogger("nestlink.embedding.model")


class EmbeddingModelError(RuntimeError):
    """Raised when embedding generation fails or produces invalid output."""


class EmbeddingModel:
    """Singleton-style ONNX Runtime wrapper around sentence-transformers/all-MiniLM-L6-v2."""

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        expected_dimensions: int = 384,
    ) -> None:
        self.model_name = model_name
        self.expected_dimensions = expected_dimensions
        self._model = None
        self._tokenizer = None
        self._input_names: List[str] = []

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """Load ONNX model weights and WordPiece tokenizer once into memory."""
        if self._model is not None:
            return

        try:
            import onnxruntime as ort  # type: ignore
            from huggingface_hub import hf_hub_download  # type: ignore
            from tokenizers import Tokenizer  # type: ignore
        except ImportError as exc:
            raise EmbeddingModelError(
                "onnxruntime, tokenizers, or huggingface-hub is not installed. Run `pip install -r requirements.txt`."
            ) from exc

        logger.info("Loading ONNX embedding model: %s", self.model_name)
        tokenizer_path = hf_hub_download(repo_id=self.model_name, filename="tokenizer.json")
        model_path = hf_hub_download(repo_id=self.model_name, filename="onnx/model.onnx")

        tokenizer = Tokenizer.from_file(tokenizer_path)
        tokenizer.enable_truncation(max_length=256)
        tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")

        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1

        session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )

        self._tokenizer = tokenizer
        self._model = session
        self._input_names = [inp.name for inp in session.get_inputs()]

        output_shape = session.get_outputs()[0].shape
        if len(output_shape) >= 3 and isinstance(output_shape[-1], int):
            if output_shape[-1] != self.expected_dimensions:
                logger.warning(
                    "Loaded model dimension (%s) differs from expected (%s).",
                    output_shape[-1],
                    self.expected_dimensions,
                )
                self.expected_dimensions = int(output_shape[-1])

        logger.info(
            "Embedding model ready (ONNX): %s (%d dims)",
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

    def embed_batch(self, texts: List[str], batch_size: int = 16) -> List[List[float]]:
        """Encode a list of preprocessed strings into L2-normalized 384-dim vectors."""
        if not self.is_loaded or self._tokenizer is None:
            raise EmbeddingModelError("Embedding model is not loaded.")
        if not texts:
            return []

        import numpy as np  # type: ignore

        result: List[List[float]] = []
        for start in range(0, len(texts), batch_size):
            chunk = texts[start : start + batch_size]
            encodings = self._tokenizer.encode_batch(chunk)

            input_ids = np.array([enc.ids for enc in encodings], dtype=np.int64)
            attention_mask = np.array([enc.attention_mask for enc in encodings], dtype=np.int64)

            feeds = {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
            }
            if "token_type_ids" in self._input_names:
                feeds["token_type_ids"] = np.zeros_like(input_ids, dtype=np.int64)

            outputs = self._model.run(None, feeds)
            last_hidden_state = outputs[0]

            mask_expanded = np.expand_dims(attention_mask, axis=-1).astype(np.float32)
            sum_embeddings = np.sum(last_hidden_state * mask_expanded, axis=1)
            sum_mask = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
            pooled = sum_embeddings / sum_mask

            norms = np.linalg.norm(pooled, axis=1, keepdims=True)
            norms = np.clip(norms, a_min=1e-12, a_max=None)
            normalized = pooled / norms

            for row in normalized:
                result.append(self._validate_vector(row.tolist()))

        return result

    def embed_one(self, text: str) -> List[float]:
        """Encode a single preprocessed string into an L2-normalized vector."""
        vectors = self.embed_batch([text], batch_size=1)
        return vectors[0]
