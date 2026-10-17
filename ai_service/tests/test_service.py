"""Fast tests in mock mode (no model downloads). Run: SKILLSWAP_MOCK=1 pytest"""
import os

os.environ.setdefault("SKILLSWAP_MOCK", "1")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import safety  # noqa: E402
from app.explainer import BANNED, template  # noqa: E402
from app.main import app, load_profiles  # noqa: E402
from app.recommender import Recommender, hard_filter_reasons, hmean  # noqa: E402
from app.schemas import Weights  # noqa: E402


@pytest.fixture(scope="module")
def rec():
    return Recommender(load_profiles())


def test_hmean_punishes_one_sided():
    assert hmean(0.9, 0.0) == 0.0
    assert hmean(0.5, 0.5) == pytest.approx(0.5)


def test_traps_are_filtered(rec):
    p = rec.profiles
    assert "no shared availability" in hard_filter_reasons(p["oa_0005"], p["st_0006"])
    assert "no shared language" in hard_filter_reasons(p["oa_0006"], p["st_0007"])


def test_strong_pairs_in_top3(rec):
    for older, student in [("oa_0001", "st_0001"), ("oa_0002", "st_0004"), ("oa_0003", "st_0003")]:
        assert student in [c for c, _ in rec.rank(older)][:3], (older, student)


def test_one_sided_ranks_below_reciprocal(rec):
    ranked = [c for c, _ in rec.rank("oa_0002")]
    assert ranked.index("st_0004") < ranked.index("st_0008")


def test_weights_change_ranking_totals(rec):
    a = dict(rec.rank("oa_0002", Weights(learn=1, social=0, happy=0)))
    b = dict(rec.rank("oa_0002", Weights(learn=0, social=1, happy=0)))
    assert a != b


def test_low_wellbeing_routes_to_coordinator(rec):
    assert rec.recommend("oa_0006").routing["coordinator_checkin_before_matching"] is True


def test_template_explanation_is_clean(rec):
    facts = rec.recommend("oa_0001").recommendations[0].facts
    text = template(facts)
    assert facts["older_adult"] in text and not BANNED.search(text)


@pytest.mark.parametrize("msg,category", [
    ("Could you lend me $200 until Friday?", "money_request"),
    ("Please buy me some gift cards", "money_request"),
    ("What's your bank account number?", "financial_info"),
    ("Tell me your password and I'll fix it", "credentials"),
    ("Text me at 518-555-0142", "personal_info"),
    ("Keep this between us, ok?", "pressure_secrecy"),
    ("I want to die", "distress"),
])
def test_rules_flag(msg, category):
    res = safety.screen(msg, level=2)
    assert category in {f.category for f in res.flags}


def test_distress_is_urgent():
    assert safety.screen("some days I want to end it all", level=2).action == "urgent_escalation"


def test_phone_allowed_from_level_5():
    assert not safety.screen("My number is 518-555-0142", level=6).flagged


def test_benign_message_allowed():
    assert safety.screen("I loved hearing about your garden!", level=2).action == "allow"


def test_excerpt_masks_digits():
    res = safety.screen("my card number is 4111 1111 1111 1111", level=2)
    assert all("1111" not in f.excerpt for f in res.flags)


def test_api_roundtrip():
    with TestClient(app) as client:
        assert client.get("/health").json()["ok"]
        r = client.post("/recommendations", json={"person_id": "oa_0001"}).json()
        assert len(r["recommendations"]) >= 1
        s = client.post("/safety/screen", json={"text": "send me money via Zelle", "level": 2}).json()
        assert s["action"] == "flag_for_coordinator"
        assert len(client.get("/audit").json()) == 2
