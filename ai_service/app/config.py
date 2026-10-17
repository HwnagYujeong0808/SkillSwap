"""Runtime settings, read from environment variables.

SKILLSWAP_MOCK=1 swaps every Hugging Face model for a deterministic stand-in,
so tests and laptops without the models still run the full pipeline.
"""
import os


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


MOCK = _flag("SKILLSWAP_MOCK")

# Section 3 tech stack: self-hosted Sentence Transformers for matching.
EMBED_MODEL = os.getenv("SKILLSWAP_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# Small instruct LLM for the one-sentence match explanation (Section 7).
LLM_MODEL = os.getenv("SKILLSWAP_LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
USE_LLM = _flag("SKILLSWAP_USE_LLM", "1") and not MOCK

# Small zero-shot NLI classifier for the message safety filter (Section 9).
SAFETY_MODEL = os.getenv(
    "SKILLSWAP_SAFETY_MODEL", "MoritzLaurer/deberta-v3-base-zeroshot-v2.0"
)
USE_SAFETY_MODEL = _flag("SKILLSWAP_USE_SAFETY_MODEL", "1") and not MOCK
SAFETY_THRESHOLD = float(os.getenv("SKILLSWAP_SAFETY_THRESHOLD", "0.75"))

DEFAULT_WEIGHTS = (0.4, 0.3, 0.3)  # learn, social, happy

# Web pages allowed to call this service from a browser (the React dev server and `vite preview`).
# Add the deployed site's origin here when the service is hosted, e.g. https://<user>.github.io
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "SKILLSWAP_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"
).split(",") if o.strip()]
TOP_K = 3
