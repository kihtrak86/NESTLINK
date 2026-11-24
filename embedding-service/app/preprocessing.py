"""Consistent text preprocessing shared by bookmark indexing and query embedding."""

from __future__ import annotations

import re
import unicodedata

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def preprocess_text(text: str, max_length: int = 2000) -> str:
    """Normalize text consistently for Sentence Transformers encoding.

    - Normalizes Unicode to NFC
    - Strips basic HTML tags if present
    - Collapses all whitespace/newlines into single spaces
    - Strips leading/trailing whitespace and truncates safely
    """
    if not isinstance(text, str):
        return ""

    normalized = unicodedata.normalize("NFC", text)
    normalized = _HTML_TAG_RE.sub(" ", normalized)
    normalized = _WHITESPACE_RE.sub(" ", normalized).strip()

    if max_length > 0 and len(normalized) > max_length:
        normalized = normalized[:max_length].rstrip()

    return normalized
