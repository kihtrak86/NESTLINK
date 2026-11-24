"""NestLink FastAPI Embedding Service.

Exposes:
- GET  /health
- POST /embed
- POST /embed/batch
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.model import EmbeddingModel, EmbeddingModelError
from app.preprocessing import preprocess_text

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("nestlink.embedding.api")

EMBEDDING_MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "384"))
EMBEDDING_MAX_TEXT_LENGTH = int(os.getenv("EMBEDDING_MAX_TEXT_LENGTH", "2000"))
EMBEDDING_MAX_BATCH_SIZE = int(os.getenv("EMBEDDING_MAX_BATCH_SIZE", "64"))

# Initialized once at module scope; weights are loaded during FastAPI lifespan startup
embedding_model = EmbeddingModel(
    model_name=EMBEDDING_MODEL_NAME,
    expected_dimensions=EMBEDDING_DIMENSIONS,
)


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to embed")


class EmbedResponse(BaseModel):
    embedding: List[float]
    dimensions: int
    model: str


class BatchEmbedRequest(BaseModel):
    texts: List[str] = Field(
        ...,
        min_length=1,
        max_length=EMBEDDING_MAX_BATCH_SIZE,
        description="List of texts to embed in a single batch",
    )


class BatchEmbedResponse(BaseModel):
    embeddings: List[List[float]]
    count: int
    dimensions: int
    model: str


def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    configured_key = os.getenv("EMBEDDING_API_KEY", "").strip()
    if configured_key and x_api_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing embedding service API key.",
        )


def create_app(model_instance: Optional[EmbeddingModel] = None) -> FastAPI:
    """Application factory (accepts an injected model instance for unit testing)."""
    active_model = model_instance or embedding_model

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if not active_model.is_loaded:
            try:
                active_model.load()
            except Exception as exc:  # pragma: no cover - logged for ops visibility
                logger.error("Failed to load embedding model on startup: %s", exc)
        yield

    application = FastAPI(
        title="NestLink Embedding Service",
        description="Sentence Transformers microservice for NestLink Semantic Search",
        version="1.0.0",
        lifespan=lifespan,
    )

    @application.get("/health")
    def health():
        return {
            "status": "ok" if active_model.is_loaded else "degraded",
            "ready": active_model.is_loaded,
            "model": active_model.model_name,
            "dimensions": active_model.expected_dimensions,
        }

    @application.post(
        "/embed",
        response_model=EmbedResponse,
        dependencies=[Depends(verify_api_key)],
    )
    def embed_text(payload: EmbedRequest):
        cleaned = preprocess_text(payload.text, max_length=EMBEDDING_MAX_TEXT_LENGTH)
        if not cleaned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input text must not be empty after preprocessing.",
            )

        if not active_model.is_loaded:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Embedding model is not ready.",
            )

        try:
            vector = active_model.embed_one(cleaned)
        except EmbeddingModelError as exc:
            logger.error("Embedding generation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to generate embedding.",
            ) from exc

        return EmbedResponse(
            embedding=vector,
            dimensions=len(vector),
            model=active_model.model_name,
        )

    @application.post(
        "/embed/batch",
        response_model=BatchEmbedResponse,
        dependencies=[Depends(verify_api_key)],
    )
    def embed_batch(payload: BatchEmbedRequest):
        if len(payload.texts) > EMBEDDING_MAX_BATCH_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch size exceeds maximum of {EMBEDDING_MAX_BATCH_SIZE}.",
            )

        cleaned_texts: List[str] = []
        for idx, raw in enumerate(payload.texts):
            cleaned = preprocess_text(raw, max_length=EMBEDDING_MAX_TEXT_LENGTH)
            if not cleaned:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Text at index {idx} is empty after preprocessing.",
                )
            cleaned_texts.append(cleaned)

        if not active_model.is_loaded:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Embedding model is not ready.",
            )

        try:
            vectors = active_model.embed_batch(cleaned_texts)
        except EmbeddingModelError as exc:
            logger.error("Batch embedding generation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to generate batch embeddings.",
            ) from exc

        return BatchEmbedResponse(
            embeddings=vectors,
            count=len(vectors),
            dimensions=active_model.expected_dimensions,
            model=active_model.model_name,
        )

    return application


app = create_app()
