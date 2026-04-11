"""Jina v3 embedding service.

API mode (default / ENV_MODE != test):
    POST to https://api.jina.ai/v1/embeddings with JINA_API_KEY.
    Retries on 429 (Retry-After header) and 5xx (exponential backoff).

Local mode (ENV_MODE=test):
    Loads jinaai/jina-embeddings-v3 via HuggingFace transformers with MPS
    acceleration on Apple Silicon. ~570 MB one-time download.
"""

from __future__ import annotations

import logging
import math
import time
from settings import get_jina_api_key, is_test_env

logger = logging.getLogger(__name__)


class ConfigurationError(Exception):
    """Raised when required configuration (e.g. JINA_API_KEY) is missing."""


class DimensionMismatchError(Exception):
    """Raised when an embedding has unexpected dimensions."""


class JinaEmbeddingService:
    JINA_API_URL = "https://api.jina.ai/v1/embeddings"
    MODEL = "jina-embeddings-v3"
    DIMENSIONS = 1024
    BATCH_SIZE = 128

    def __init__(self) -> None:
        self._api_key = get_jina_api_key()
        if not self.is_local and not self._api_key:
            raise ConfigurationError("JINA_API_KEY is required for vector embeddings")

        self._local_model = None  # lazy-loaded on first use in local mode

    @property
    def is_local(self) -> bool:
        """True when ENV_MODE=test — uses local HuggingFace model instead of REST API."""
        return is_test_env()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def embed(self, texts: list[str], task: str = "retrieval.passage") -> list[list[float]]:
        """Embed a list of texts, auto-chunking into batches of BATCH_SIZE.

        Args:
            texts: Input strings to embed.
            task:  Jina task type — "retrieval.passage" for skills,
                   "retrieval.query" for job descriptions.

        Returns:
            List of 1024-dimensional float vectors in the same order as inputs.

        Raises:
            DimensionMismatchError: If any returned embedding has != 1024 dims.
        """
        if not texts:
            return []

        chunks = [
            texts[i : i + self.BATCH_SIZE]
            for i in range(0, len(texts), self.BATCH_SIZE)
        ]

        results: list[list[float]] = []
        for chunk in chunks:
            if self.is_local:
                batch_embeddings = self._embed_local(chunk, task)
            else:
                batch_embeddings = self._embed_api(chunk, task)

            for idx, emb in enumerate(batch_embeddings):
                if len(emb) != self.DIMENSIONS:
                    raise DimensionMismatchError(
                        f"Embedding at index {len(results) + idx} has {len(emb)} dims "
                        f"(expected {self.DIMENSIONS})"
                    )
            results.extend(batch_embeddings)

        return results

    # ------------------------------------------------------------------
    # API mode
    # ------------------------------------------------------------------

    def _embed_api(self, texts: list[str], task: str) -> list[list[float]]:
        """Call Jina REST API with retry logic."""
        import requests  # stdlib-adjacent; always available in scraper env

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.MODEL,
            "dimensions": self.DIMENSIONS,
            "task": task,
            "input": texts,
        }

        max_5xx_retries = 3
        backoff = 2.0

        for attempt in range(max_5xx_retries + 1):
            try:
                resp = requests.post(self.JINA_API_URL, json=payload, headers=headers, timeout=120)
            except requests.RequestException as exc:
                if attempt < max_5xx_retries:
                    logger.warning(f"[jina] network error (attempt {attempt + 1}): {exc}, retrying in {backoff}s")
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                raise

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 60))
                logger.warning(f"[jina] rate limited (429), waiting {retry_after}s")
                time.sleep(retry_after)
                # Reset backoff counter — 429 is transient, not a server error
                attempt = 0  # noqa: SIM113 — intentional reset
                continue

            if resp.status_code >= 500:
                if attempt < max_5xx_retries:
                    logger.warning(
                        f"[jina] server error {resp.status_code} (attempt {attempt + 1}), "
                        f"retrying in {backoff}s"
                    )
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                resp.raise_for_status()

            resp.raise_for_status()
            data = resp.json()
            # Jina returns {"data": [{"embedding": [...], "index": N}, ...]}
            # Sort by index to guarantee order matches input
            items = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in items]

        # Should not reach here
        raise RuntimeError("[jina] exhausted retries without a successful response")

    # ------------------------------------------------------------------
    # Local mode (ENV_MODE=test)
    # ------------------------------------------------------------------

    def _load_local_model(self):
        """Lazy-load the HuggingFace model on first use."""
        if self._local_model is not None:
            return self._local_model

        try:
            import torch
            from transformers import AutoModel
        except ImportError as exc:
            raise ConfigurationError(
                "Local embedding requires 'transformers', 'torch', and 'einops'. "
                "Run: pip install -r requirements-dev.txt"
            ) from exc

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        logger.info(f"[jina-local] loading jinaai/jina-embeddings-v3 on {device} (~570 MB first run)")
        model = AutoModel.from_pretrained(
            "jinaai/jina-embeddings-v3",
            trust_remote_code=True,
        )
        model = model.to(device)
        model.eval()
        self._local_model = model
        logger.info(f"[jina-local] model loaded on {device}")
        return model

    def _embed_local(self, texts: list[str], task: str) -> list[list[float]]:
        """Embed using local HuggingFace model (MPS / CPU)."""
        import torch

        model = self._load_local_model()
        with torch.no_grad():
            embeddings = model.encode(
                texts,
                task=task,
                truncate_dim=self.DIMENSIONS,
            )
        # embeddings is a numpy array or tensor; convert to plain Python lists
        if hasattr(embeddings, "tolist"):
            return embeddings.tolist()
        return [list(e) for e in embeddings]
