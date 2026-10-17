"""One plain sentence per suggestion, generated only from computed facts.

A 0.5B model is too small to compose a faithful reason from raw facts (it
blends who teaches what), so the work is split:

1. `draft()` builds a factual sentence from the pair's features (no AI).
2. The small LLM only rephrases that draft to sound warm and natural.
3. `_valid()` checks the result (length, one sentence, both names, no banned
   topics, both skills still present). If it fails, the draft is used.

So the coordinator always gets a grounded sentence; the LLM only adds warmth.
"""
from __future__ import annotations

import re

from . import hf_models

SYSTEM = (
    "You rewrite sentences for a program that pairs older adults with university students. "
    "Make them warm and natural at a 6th-grade reading level. Keep every fact. Add nothing new. "
    "Output one sentence only."
)

PROMPT = (
    "Rewrite this sentence so it sounds warm and friendly, in at most 30 words. "
    "Keep both names and both skills. Do not add new facts.\n\n"
    "Sentence: {draft}\n\nRewritten:"
)

# Words that must never appear in a match explanation (spec Section 7).
BANNED = re.compile(
    r"\b(score|lonel\w*|isolat\w*|wellbeing|well-being|depress\w*|age[ds]?|old|elderly|"
    r"health|sick|ill|widow\w*|sad|percent|%)\b",
    re.IGNORECASE,
)

PROPER = {"puerto", "chinese", "mandarin", "spanish", "english", "american", "capital", "ai", "italian"}
LOWER_STARTS = {"Both", "They", "Together", "Each", "Their", "It"}
STOP = {"with", "from", "like", "that", "this", "some", "using", "learn", "share", "about",
        "into", "good", "basics", "making", "trying", "setting"}


def _short(text: str) -> str:
    """First item of a free-text list: 'Baking bread; budgeting' -> 'baking bread'."""
    first = re.split(r"[;,.]| and | including | like ", text)[0].strip()
    first = re.sub(r"\b(my|our)\b", "their", first, flags=re.IGNORECASE)
    if not first:
        return "something new"
    if first.split()[0].lower() in PROPER:
        return first
    return first[:1].lower() + first[1:]


def draft(f: dict) -> str:
    sentence = (
        f"{f['older_adult']} can share {_short(f['older_teaches'])}, and {f['student']} "
        f"can share {_short(f['student_teaches'])}"
    )
    if f["shared_interests"]:
        sentence += f"; both enjoy {f['shared_interests'][0].split(' / ')[0].lower()}"
    if f["shared_availability"]:
        sentence += f", and both are free on {f['shared_availability'][0]}"
    return sentence + "."


# Kept for callers that used the old name.
template = draft


def _content_words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]{4,}", text.lower())) - STOP


def _valid(text: str, f: dict, base: str) -> bool:
    n = len(text.split())
    if not text or n > 40 or n < 6:
        return False
    if BANNED.search(text) or re.search(r"\byou(r|'re)?\b", text, re.IGNORECASE):
        return False  # banned topic, or drifted into addressing the reader
    if f["older_adult"] not in text or f["student"] not in text:
        return False
    words = _content_words(text)
    # Both skills from the draft must survive the rewrite.
    for side in (_short(f["older_teaches"]), _short(f["student_teaches"])):
        if _content_words(side) and not words & _content_words(side):
            return False
    # Nothing much new: most content words must come from the draft or the facts.
    known = _content_words(base + " " + " ".join(str(v) for v in f.values()))
    if len(words - known) > max(6, len(words) // 2):
        return False
    return len(re.findall(r"[.!?](\s|$)", text)) <= 1


def _clean(raw: str) -> str:
    text = raw.strip().strip('"').strip()
    text = text.splitlines()[0].strip().strip('"') if text else ""
    # The model often splits the thought in two; join "X. Both ..." into "X; both ...".
    parts = re.split(r"(?<=[.!])\s+(?=[A-Z])", text)
    if len(parts) == 2:
        first, second = parts
        if second.split()[0] in LOWER_STARTS:
            second = second[0].lower() + second[1:]
        text = first.rstrip(".!") + "; " + second
    return text


def explain(facts: dict) -> tuple[str, str]:
    """Return (sentence, source) where source is 'llm' or 'template'."""
    base = draft(facts)
    raw = hf_models.generate(SYSTEM, PROMPT.format(draft=base), max_new_tokens=60)
    if raw is not None:
        text = _clean(raw)
        if _valid(text, facts, base):
            return text, "llm"
    return base, "template"
