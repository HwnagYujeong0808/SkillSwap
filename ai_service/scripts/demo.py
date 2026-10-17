"""End-to-end demo: top-3 matches per older adult, planted-pair checks, safety screening.

    python scripts/demo.py            # real Hugging Face models
    SKILLSWAP_MOCK=1 python scripts/demo.py   # no models, deterministic stand-ins
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import hf_models, safety  # noqa: E402
from app.main import DATA, load_profiles  # noqa: E402
from app.recommender import Recommender  # noqa: E402
from app.schemas import Weights  # noqa: E402

MESSAGES = [
    (2, "Hi Margaret! I tried your bread recipe and it actually rose this time :)"),
    (2, "My car broke down and I'm short this month. Could you lend me $200? I'll pay you back."),
    (2, "Can you buy me a couple of Amazon gift cards? I'll explain later."),
    (3, "What's your bank account number so I can send you the recipe book money?"),
    (2, "Let's talk on WhatsApp instead, it's easier. Text me at 518-555-0142."),
    (6, "Here's my number for our call on Thursday: 518-555-0142"),
    (4, "Don't tell your daughter about our chats, keep this between us."),
    (3, "Could I come over to your house on Saturday? What's your address?"),
    (3, "You're useless and stupid, I don't know why I bother talking to you."),
    (2, "Honestly some days I feel like there's no point anymore and everyone would be better off without me."),
    (2, "Do you happen to have a little extra cash? Things have been tight."),
    (2, "The weather was lovely for the farmers market on Saturday."),
]


def main() -> None:
    t0 = time.time()
    profiles = load_profiles()
    planted = json.loads(DATA.read_text())["planted_pairs"]
    rec = Recommender(profiles)
    print(f"models: {json.dumps(hf_models.status(), indent=2)}  (embedded in {time.time() - t0:.1f}s)\n")

    print("=" * 78, "\nRECOMMENDATIONS (default weights 0.4 / 0.3 / 0.3)\n" + "=" * 78)
    for p in profiles:
        if p.role != "older_adult":
            continue
        r = rec.recommend(p.person_id, top_k=3)
        hold = " [coordinator check-in before matching]" if r.routing["coordinator_checkin_before_matching"] else ""
        print(f"\n{p.first_name} ({p.person_id}) priority={r.routing['priority']}{hold}")
        for i, m in enumerate(r.recommendations, 1):
            s = m.scores
            print(f"  {i}. {m.candidate_first_name:<6} total={s.total:.3f}  L={s.learn:.2f} "
                  f"(o→s {s.learn_o_to_s:.2f}, s→o {s.learn_s_to_o:.2f})  S={s.social:.2f}  H={s.happy:.2f}")
            print(f"     [{m.explanation_source}] {m.explanation}")
        if not r.recommendations:
            print("  (no eligible students)")
        for cid, why in r.filtered_out.items():
            print(f"     filtered {cid}: {', '.join(why)}")

    print("\n" + "=" * 78, "\nPLANTED PAIRS\n" + "=" * 78)
    hits = 0
    for pair in planted["strong"]:
        ranked = [c for c, _ in rec.rank(pair["older"])]
        ok = pair["student"] in ranked[:3]
        hits += ok
        pos = ranked.index(pair["student"]) + 1 if pair["student"] in ranked else None
        print(f"  strong {pair['older']}–{pair['student']} rank={pos} {'PASS' if ok else 'FAIL'}  ({pair['why']})")
    print(f"  precision@3 on strong pairs: {hits}/{len(planted['strong'])}")
    for trap in planted["traps"]:
        ranked = [c for c, _ in rec.rank(trap["older"])]
        if trap["expect"] == "filtered":
            ok = trap["student"] not in ranked
        else:
            strong = [s["student"] for s in planted["strong"] if s["older"] == trap["older"]]
            ok = all(ranked.index(s) < ranked.index(trap["student"]) for s in strong if s in ranked)
        print(f"  trap   {trap['older']}–{trap['student']} {'PASS' if ok else 'FAIL'}  ({trap['why']})")

    print("\n" + "=" * 78, "\nRE-RANKING: Walter with weights Learn 0.1 / Social 0.8 / Happy 0.1\n" + "=" * 78)
    r = rec.recommend("oa_0002", Weights(learn=0.1, social=0.8, happy=0.1), explain_matches=False)
    for m in r.recommendations:
        print(f"  {m.candidate_first_name:<6} total={m.scores.total:.3f}")

    print("\n" + "=" * 78, "\nSAFETY FILTER\n" + "=" * 78)
    for level, msg in MESSAGES:
        t = time.time()
        res = safety.screen(msg, level=level)
        cats = ", ".join(f"{f.category}({f.source},{f.severity})" for f in res.flags) or "-"
        print(f"\n  L{level} {msg[:70]}{'…' if len(msg) > 70 else ''}")
        print(f"     → {res.action:<22} {cats}  [{(time.time() - t) * 1000:.0f} ms]")


if __name__ == "__main__":
    main()
