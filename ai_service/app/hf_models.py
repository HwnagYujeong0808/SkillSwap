"""Lazy loaders for the three Hugging Face models, each with a mock stand-in.

- Embedder:   sentence-transformers/all-MiniLM-L6-v2 (22M params, 384-d)
- Explainer:  Qwen/Qwen2.5-0.5B-Instruct (0.5B params) for one-sentence reasons
- Classifier: a small zero-shot NLI model for the safety filter

Models load on first use and are cached for the life of the process. If a model
cannot load (offline, no torch), the mock is used and `status()` says so.
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
from functools import lru_cache

import numpy as np

from . import config

log = logging.getLogger("skillswap.models")
_lock = threading.Lock()
_status: dict[str, str] = {}


def status() -> dict[str, str]:
    return dict(_status)


def _device() -> str:
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


# ---------------------------------------------------------------- embeddings

# Mock embeddings: a bag of "concepts" hashed into 384 dims. The concept map
# lets mock mode still see that "baking bread" and "cooking meals" are related.
_CONCEPTS = {
    "food": "cook cooking bake baking bread pie pies meal meals recipe recipes kitchen food canning grocery budget",
    "tech": "phone phones smartphone app apps tablet video call calls computer online internet tech email social media photo photos telehealth portal portals ai streaming coding",
    "repair": "fix fixing repair engine engines car carpentry woodworking tools tractor tractors hands-on",
    "garden": "garden gardening plants farm canning animal animals",
    "language": "spanish english language languages idioms conversation chinese bengali polish tutoring",
    "history": "history local stories story life tradition traditions",
    "career": "career job advice mentoring professional engineer engineers resume",
    "music": "music choir singing piano guitar",
    "health": "health patient nurse nursing communication",
    "science": "chemistry math science research writing",
    "money": "banking bank budget finances",
}
_WORD_TO_CONCEPT = {w: c for c, words in _CONCEPTS.items() for w in words.split()}


def _mock_embed(text: str, dim: int = 384) -> np.ndarray:
    vec = np.zeros(dim, dtype=np.float32)
    for tok in re.findall(r"[a-z][a-z\-]+", text.lower()):
        for key, weight in ((_WORD_TO_CONCEPT.get(tok), 1.0), (tok[:6], 0.35)):
            if key:
                h = int(hashlib.md5(key.encode()).hexdigest(), 16)
                vec[h % dim] += weight
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec


@lru_cache(maxsize=1)
def _embedder():
    if config.MOCK:
        _status["embedder"] = "mock (hashed concepts)"
        return None
    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer(config.EMBED_MODEL, device=_device())
        _status["embedder"] = config.EMBED_MODEL
        return model
    except Exception as exc:  # pragma: no cover - depends on environment
        log.warning("Embedder unavailable (%s); using mock embeddings", exc)
        _status["embedder"] = f"mock (load failed: {type(exc).__name__})"
        return None


def embed(texts: list[str]) -> np.ndarray:
    """Return L2-normalized embeddings, one row per text. Empty text -> zero row."""
    model = _embedder()
    out = np.zeros((len(texts), 384), dtype=np.float32)
    idx = [i for i, t in enumerate(texts) if t and t.strip()]
    if not idx:
        return out
    if model is None:
        for i in idx:
            out[i] = _mock_embed(texts[i])
        return out
    with _lock:
        vecs = model.encode([texts[i] for i in idx], normalize_embeddings=True, show_progress_bar=False)
    if vecs.shape[1] != out.shape[1]:
        out = np.zeros((len(texts), vecs.shape[1]), dtype=np.float32)
    out[idx] = vecs
    return out


# ---------------------------------------------------------------- small LLM


@lru_cache(maxsize=1)
def _llm():
    if not config.USE_LLM:
        _status["explainer"] = "template (LLM disabled)"
        return None
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        tok = AutoTokenizer.from_pretrained(config.LLM_MODEL)
        model = AutoModelForCausalLM.from_pretrained(config.LLM_MODEL, torch_dtype=torch.float32)
        model.to(_device()).eval()
        _status["explainer"] = config.LLM_MODEL
        return tok, model
    except Exception as exc:  # pragma: no cover
        log.warning("LLM unavailable (%s); using template explanations", exc)
        _status["explainer"] = f"template (load failed: {type(exc).__name__})"
        return None


def generate(system: str, user: str, max_new_tokens: int = 64) -> str | None:
    """Greedy chat completion from the small LLM, or None when it is unavailable."""
    loaded = _llm()
    if loaded is None:
        return None
    import torch

    tok, model = loaded
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tok(prompt, return_tensors="pt").to(model.device)
    with _lock, torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            repetition_penalty=1.1,
            pad_token_id=tok.eos_token_id,
        )
    return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


# ------------------------------------------------------- zero-shot classifier


@lru_cache(maxsize=1)
def _zero_shot():
    if not config.USE_SAFETY_MODEL:
        _status["safety_classifier"] = "rules only (model disabled)"
        return None
    try:
        from transformers import pipeline

        dev = _device()
        clf = pipeline(
            "zero-shot-classification",
            model=config.SAFETY_MODEL,
            device=0 if dev == "cuda" else (dev if dev == "mps" else -1),
        )
        _status["safety_classifier"] = config.SAFETY_MODEL
        return clf
    except Exception as exc:  # pragma: no cover
        log.warning("Safety classifier unavailable (%s); rules only", exc)
        _status["safety_classifier"] = f"rules only (load failed: {type(exc).__name__})"
        return None


def zero_shot(text: str, labels: list[str], template: str) -> dict[str, float] | None:
    """Independent (multi-label) entailment probability per label, or None."""
    clf = _zero_shot()
    if clf is None:
        return None
    with _lock:
        res = clf(text, candidate_labels=labels, hypothesis_template=template, multi_label=True)
    return dict(zip(res["labels"], (float(s) for s in res["scores"])))


def warm_up() -> dict[str, str]:
    """Load every model now (used at API start-up so the first request is fast)."""
    embed(["warm up"])
    _llm()
    _zero_shot()
    return status()
