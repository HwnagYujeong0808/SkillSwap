"""Message safety filter: rules first, then a small zero-shot classifier.

Spec Section 9: screen messages for harassment, sexual content, and money or
personal-info requests. Flags go to a coordinator; nothing auto-bans. Distress
disclosures are escalated urgently (Onboarding workflow, E3).

Rules catch the explicit cases deterministically (and keep working with no
model). The classifier catches paraphrases the rules miss.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import config, hf_models
from .schemas import SafetyFlag, ScreenResponse


@dataclass(frozen=True)
class Rule:
    name: str
    category: str
    severity: str
    pattern: re.Pattern
    allowed_from_level: int | None = None  # rule is silent at or above this trust level


def _rx(p: str) -> re.Pattern:
    return re.compile(p, re.IGNORECASE)


MONEY = r"(money|cash|\$\s?\d+|\d+\s?dollars|gift\s?cards?|venmo|zelle|paypal|cash\s?app|western union|bitcoin|crypto|wire)"

RULES: list[Rule] = [
    Rule("money_request", "money_request", "high",
         _rx(rf"\b(send|lend|loan|wire|transfer|give me|borrow|spare|buy me|pay me)\b.{{0,40}}{MONEY}")),
    Rule("money_request_rev", "money_request", "high",
         _rx(rf"{MONEY}.{{0,40}}\b(send|lend|loan|borrow|help me out|pay (me|you) back)\b")),
    Rule("gift_cards", "money_request", "high", _rx(r"\bgift\s?cards?\b")),
    Rule("financial_details", "financial_info", "high",
         _rx(r"\b(bank (account|details|info)|routing number|account number|credit card|debit card|"
             r"card number|cvv|pin (number|code)|social security|ssn)\b")),
    Rule("credentials", "credentials", "high",
         _rx(r"\b(password|passcode|log-?in details|verification code|one[- ]time code|2fa code|otp)\b")),
    Rule("ssn_pattern", "financial_info", "high", _rx(r"\b\d{3}-\d{2}-\d{4}\b")),
    Rule("card_pattern", "financial_info", "high", _rx(r"\b(?:\d[ -]?){13,16}\b")),
    Rule("phone_number", "personal_info", "medium",
         _rx(r"(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"), allowed_from_level=5),
    Rule("ask_phone", "personal_info", "medium",
         _rx(r"\b(what'?s|give me|send me|share) your (phone|cell|number|mobile)\b"), allowed_from_level=5),
    Rule("email_address", "personal_info", "medium",
         _rx(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"), allowed_from_level=5),
    Rule("street_address", "personal_info", "medium",
         _rx(r"\b\d{1,5}\s+\w+(\s\w+)?\s(st|street|ave|avenue|rd|road|ln|lane|dr|drive|blvd|ct|court|way)\b"),
         allowed_from_level=10),
    Rule("ask_address", "personal_info", "medium",
         _rx(r"\b(where (exactly )?do you live|what'?s your address|your (home|street) address)\b"),
         allowed_from_level=10),
    Rule("home_visit", "pressure_secrecy", "medium",
         _rx(r"\b(come (over )?to (my|your) (house|home|place|apartment)|visit you at home|i'?ll come by your)\b"),
         allowed_from_level=10),
    Rule("off_platform", "off_platform", "medium",
         _rx(r"\b(whatsapp|telegram|signal app|snapchat|wechat|kik|off (this|the) app|text me (at|on))\b"),
         allowed_from_level=5),
    Rule("secrecy", "pressure_secrecy", "high",
         _rx(r"\b(don'?t tell (anyone|your|the)|keep (this|it) (between us|a secret|secret)|our (little )?secret)\b")),
    Rule("distress", "distress", "urgent",
         _rx(r"\b(want(ed)? to die|kill (myself|me)|end (it all|my life)|no reason to live|"
             r"better off (dead|without me)|hurt(ing)? myself|suicid\w*|"
             r"(he|she|they|someone) (hits|hurts|is hurting|has been hurting) me)\b")),
]

# Zero-shot labels -> (category, severity). Phrased as hypotheses for NLI.
MODEL_LABELS = {
    "asking someone for money, a loan or gifts": ("money_request", "high"),
    "asking for bank, credit card or password details": ("financial_info", "high"),
    "asking for a phone number or home address": ("personal_info", "medium"),
    "insulting, threatening or harassing someone": ("harassment", "high"),
    "sexual or romantic content": ("sexual_content", "high"),
    "pressuring someone to keep secrets or meet alone": ("pressure_secrecy", "high"),
    "expressing hopelessness or wanting to hurt oneself": ("distress", "urgent"),
}
HYPOTHESIS = "This message is {}."

SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "urgent": 3}


def _excerpt(text: str, start: int = 0, end: int | None = None, pad: int = 40) -> str:
    """Keep only the flagged excerpt (spec: excerpts, not full transcripts), with long digit runs masked."""
    end = len(text) if end is None else end
    lo, hi = max(0, start - pad), min(len(text), end + pad)
    snippet = ("…" if lo else "") + text[lo:hi].strip() + ("…" if hi < len(text) else "")
    return re.sub(r"\d{4,}|\d{3}-\d{2}-\d{4}", lambda m: "#" * len(m.group()), snippet)


def screen(text: str, level: int = 1) -> ScreenResponse:
    flags: list[SafetyFlag] = []
    seen_categories: set[str] = set()

    for rule in RULES:
        if rule.allowed_from_level is not None and level >= rule.allowed_from_level:
            continue
        m = rule.pattern.search(text)
        if m and rule.category not in seen_categories:
            flags.append(SafetyFlag(
                category=rule.category, source="rule", severity=rule.severity, score=1.0,
                excerpt=_excerpt(text, m.start(), m.end()), rule=rule.name,
            ))
            seen_categories.add(rule.category)

    model_scores = hf_models.zero_shot(text, list(MODEL_LABELS), HYPOTHESIS) or {}
    for label, prob in model_scores.items():
        category, severity = MODEL_LABELS[label]
        if prob < config.SAFETY_THRESHOLD or category in seen_categories:
            continue
        # Contact details are fine once the pair has reached masked calls (level 5+).
        if category == "personal_info" and level >= 5:
            continue
        flags.append(SafetyFlag(
            category=category, source="model", severity=severity, score=round(prob, 3),
            excerpt=_excerpt(text, 0, min(len(text), 160), pad=0),
        ))
        seen_categories.add(category)

    flags.sort(key=lambda f: SEVERITY_ORDER[f.severity], reverse=True)
    if any(f.severity == "urgent" for f in flags):
        action = "urgent_escalation"
        note = ("Possible distress: alert the coordinator now. If there is immediate danger, "
                "the person should call 988 or 911.")
    elif flags:
        action = "flag_for_coordinator"
        note = "Sent to the coordinator's flag inbox for review. The message is held, not deleted."
    else:
        action = "allow"
        note = "No concerns found."

    return ScreenResponse(
        flagged=bool(flags), action=action, flags=flags,
        model_scores={MODEL_LABELS[k][0]: round(v, 3) for k, v in model_scores.items()},
        note=note,
    )
