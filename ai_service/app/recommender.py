"""Reciprocal, multi-objective, safety-constrained recommender (spec Section 7).

Pipeline: hard filters (rules) -> embed -> score both directions -> harmonic
mean -> weighted Learn/Social/Happy total -> top-k -> explanation sentence.
Loneliness and wellbeing never enter the similarity score; they only set
priority and routing for the coordinator.
"""
from __future__ import annotations

import hashlib
import re

import numpy as np

from . import hf_models
from .explainer import explain
from .schemas import Profile, Recommendation, RecommendationResponse, Scores, Weights

TEXT_FIELDS = ("teach_text", "learn_text", "interests_text", "generativity_text")

# Partner venues for the accessibility filter (demo data).
VENUES = [
    {"name": "Troy Public Library", "area": "Troy", "features": {"step_free", "quiet_room"}},
    {"name": "Albany Senior Center", "area": "Albany", "features": {"step_free", "quiet_room", "hearing_loop"}},
    {"name": "Schenectady County Library", "area": "Schenectady", "features": {"step_free"}},
    {"name": "Saratoga Springs Library", "area": "Saratoga Springs", "features": {"step_free", "quiet_room"}},
    {"name": "Campus Community Room", "area": "Albany", "features": {"step_free", "quiet_room"}},
]

SLOT_NAMES = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
    "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "am": "mornings", "pm": "afternoons", "eve": "evenings",
}


# ------------------------------------------------------------------ helpers

def hmean(x: float, y: float) -> float:
    return 0.0 if x + y == 0 else 2 * x * y / (x + y)


def cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def slot_label(slot: str) -> str:
    day, _, part = slot.partition("_")
    return f"{SLOT_NAMES.get(day, day)} {SLOT_NAMES.get(part, part)}".strip()


class EmbeddingCache:
    """Embeds each profile's text fields once; re-embeds only if text changes."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, dict[str, np.ndarray]]] = {}

    @staticmethod
    def _key(p: Profile) -> str:
        return hashlib.sha1("\x1f".join(getattr(p, f) for f in TEXT_FIELDS).encode()).hexdigest()

    def _store_rows(self, p: Profile, rows: np.ndarray) -> dict[str, np.ndarray]:
        emb = {f.removesuffix("_text"): rows[i] for i, f in enumerate(TEXT_FIELDS)}
        # Older adults' generativity answer often names a skill (J1.9), so it
        # is blended into the teach vector.
        if p.generativity_text.strip():
            mixed = 0.75 * emb["teach"] + 0.25 * emb["generativity"]
            n = np.linalg.norm(mixed)
            emb["teach"] = mixed / n if n else mixed
        self._store[p.person_id] = (self._key(p), emb)
        return emb

    def get(self, p: Profile) -> dict[str, np.ndarray]:
        hit = self._store.get(p.person_id)
        if hit and hit[0] == self._key(p):
            return hit[1]
        return self._store_rows(p, hf_models.embed([getattr(p, f) for f in TEXT_FIELDS]))

    def prime(self, profiles: list[Profile]) -> None:
        """Embed many profiles in one batch call."""
        todo = [p for p in profiles if p.person_id not in self._store]
        if not todo:
            return
        n = len(TEXT_FIELDS)
        vecs = hf_models.embed([getattr(p, f) for p in todo for f in TEXT_FIELDS])
        for i, p in enumerate(todo):
            self._store_rows(p, vecs[i * n:(i + 1) * n])


# ------------------------------------------------------------- hard filters

# Towns linked by the regional bus network; everywhere else needs a driver.
TRANSIT_CORE = {"Albany", "Troy", "Schenectady"}


def _reachable(a: Profile, b: Profile) -> bool:
    if a.area == b.area or "drives" in (a.transport, b.transport):
        return True
    # Within the bus core, one person who can ride the bus can travel to a
    # venue in the other's town.
    in_core = a.area in TRANSIT_CORE and b.area in TRANSIT_CORE
    return in_core and any(p.transport in ("bus", "walk") for p in (a, b))


def _venue_ok(a: Profile, b: Profile) -> bool:
    needs = {k for p in (a, b) for k, v in p.accessibility.items() if v}
    if not needs:
        return True
    areas = {a.area, b.area}
    return any(needs <= v["features"] and v["area"] in areas for v in VENUES)


def hard_filter_reasons(o: Profile, s: Profile) -> list[str]:
    """Rule checks only, no AI. Empty list means the pair may be scored."""
    reasons = []
    if not (o.verified and s.verified):
        reasons.append("not verified")
    if s.person_id in o.safety_exclusions or o.person_id in s.safety_exclusions:
        reasons.append("safety exclusion")
    if not _reachable(o, s):
        reasons.append("not reachable by transport")
    if not set(o.availability) & set(s.availability):
        reasons.append("no shared availability")
    if not set(o.languages) & set(s.languages):
        reasons.append("no shared language")
    if not _venue_ok(o, s):
        reasons.append("no venue meets accessibility needs")
    return reasons


# ------------------------------------------------------------------- scores

def learn_score(eo: dict, es: dict) -> tuple[float, float, float]:
    o_to_s = max(cos(eo["teach"], es["learn"]), 0.0)
    s_to_o = max(cos(es["teach"], eo["learn"]), 0.0)
    return hmean(o_to_s, s_to_o), o_to_s, s_to_o


def format_agreement(a: Profile, b: Profile) -> float:
    if a.format_pref == b.format_pref or "either" in (a.format_pref, b.format_pref):
        return 1.0
    return 0.5


def social_score(o: Profile, s: Profile, eo: dict, es: dict) -> float:
    return (
        0.5 * max(cos(eo["interests"], es["interests"]), 0.0)
        + 0.3 * (1 - abs(o.style.extraversion - s.style.extraversion))
        + 0.2 * format_agreement(o, s)
    )


def motive_score(o: Profile, s: Profile) -> float:
    give_o = max(o.motives.values, o.generativity)
    seek_s = max(s.motives.understanding, s.motives.career)
    give_s = max(s.motives.values, s.generativity or 0.0)
    seek_o = max(o.motives.understanding, o.motives.career)
    return (give_o * seek_s + give_s * seek_o + min(o.motives.social, s.motives.social)) / 3


def happy_score(o: Profile, s: Profile) -> tuple[float, float]:
    overlap = len(set(o.availability) & set(s.availability)) / max(len(o.availability), 1)
    transport = 1.0 if o.transport != "needs_ride" or s.transport == "drives" else 0.6
    m = motive_score(o, s)
    return 0.5 * m + 0.3 * (0.5 * overlap + 0.5 * transport) + 0.2 * o.generativity, m


def score_pair(o: Profile, s: Profile, eo: dict, es: dict, w: Weights) -> Scores:
    L, l_os, l_so = learn_score(eo, es)
    S = social_score(o, s, eo, es)
    H, M = happy_score(o, s)
    wl, ws, wh = w.normalized()
    r = lambda x: round(float(x), 4)
    return Scores(
        learn=r(L), learn_o_to_s=r(l_os), learn_s_to_o=r(l_so),
        social=r(S), happy=r(H), motive=r(M), total=r(wl * L + ws * S + wh * H),
    )


# ------------------------------------------------------------ facts/routing

def _items(text: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;,]| and ", text) if t.strip()]


def shared_interests(a: Profile, b: Profile, threshold: float = 0.55) -> list[str]:
    ia, ib = _items(a.interests_text), _items(b.interests_text)
    if not ia or not ib:
        return []
    va, vb = hf_models.embed(ia), hf_models.embed(ib)
    sims = va @ vb.T
    found = []
    for i, j in zip(*np.where(sims >= threshold)):
        label = ia[i] if ia[i].lower() == ib[j].lower() else f"{ia[i]} / {ib[j]}"
        if label not in found:
            found.append(label)
    return found[:3]


def pair_facts(o: Profile, s: Profile) -> dict:
    return {
        "older_adult": o.first_name,
        "student": s.first_name,
        "older_teaches": o.teach_text,
        "student_wants": s.learn_text,
        "student_teaches": s.teach_text,
        "older_wants": o.learn_text,
        "shared_interests": shared_interests(o, s),
        "shared_availability": [slot_label(x) for x in sorted(set(o.availability) & set(s.availability))],
    }


def routing(p: Profile) -> dict:
    """Priority and routing only; never a similarity feature (spec Section 7)."""
    priority = 0
    if (p.loneliness.ucla3 or 0) >= 7:
        priority += 2
    if p.network_lsns6 is not None and p.network_lsns6 < 12:
        priority += 1
    fmt_hint = None
    if (p.loneliness.djg_emotional or 0) >= 2:
        fmt_hint = "steady one-on-one pair"
    elif (p.loneliness.djg_social or 0) >= 2:
        fmt_hint = "add group and community-event suggestions"
    hold = p.wellbeing_who5 is not None and p.wellbeing_who5 < 28
    return {
        "priority": priority,
        "format_hint": fmt_hint,
        "coordinator_checkin_before_matching": hold,
    }


# ---------------------------------------------------------------- top level

class Recommender:
    def __init__(self, profiles: list[Profile]) -> None:
        self.profiles = {p.person_id: p for p in profiles}
        self.cache = EmbeddingCache()
        self.cache.prime(profiles)

    def upsert(self, p: Profile) -> None:
        self.profiles[p.person_id] = p
        self.cache.get(p)

    def recommend(self, person_id: str, weights: Weights | None = None, top_k: int = 3,
                  explain_matches: bool = True) -> RecommendationResponse:
        weights = weights or Weights()
        me = self.profiles[person_id]
        other_role = "student" if me.role == "older_adult" else "older_adult"
        e_me = self.cache.get(me)

        scored, filtered = [], {}
        for cand in self.profiles.values():
            if cand.role != other_role:
                continue
            o, s = (me, cand) if me.role == "older_adult" else (cand, me)
            reasons = hard_filter_reasons(o, s)
            if reasons:
                filtered[cand.person_id] = reasons
                continue
            e_c = self.cache.get(cand)
            eo, es = (e_me, e_c) if me.role == "older_adult" else (e_c, e_me)
            scored.append((score_pair(o, s, eo, es, weights), o, s, cand))

        scored.sort(key=lambda t: t[0].total, reverse=True)
        recs = []
        for sc, o, s, cand in scored[:top_k]:
            facts = pair_facts(o, s)
            text, source = explain(facts) if explain_matches else ("", "template")
            recs.append(Recommendation(
                candidate_id=cand.person_id, candidate_first_name=cand.first_name,
                scores=sc, explanation=text, explanation_source=source, facts=facts,
            ))
        return RecommendationResponse(
            person_id=person_id, weights=weights, routing=routing(me),
            recommendations=recs, filtered_out=filtered,
        )

    def rank(self, person_id: str, weights: Weights | None = None) -> list[tuple[str, float]]:
        """All eligible candidates, best first, without explanations (for evaluation)."""
        resp = self.recommend(person_id, weights, top_k=10_000, explain_matches=False)
        return [(r.candidate_id, r.scores.total) for r in resp.recommendations]
