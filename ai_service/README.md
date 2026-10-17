# SkillSwap mock AI service

A mock of the **recommendation engine** (spec Section 7) and the **message safety filter** (Section 9), built on small, self-hosted Hugging Face models. It's a FastAPI service that the React front end or the main API can call. All data is synthetic.

| Component | Model | Size | What it does |
|---|---|---|---|
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` | 22M | Embeds teach / learn / interests / generativity text for skill fit |
| Explanations | `Qwen/Qwen2.5-0.5B-Instruct` | 0.5B | Rewrites a factual draft into one warm sentence per match |
| Safety classifier | `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` | 184M | Zero-shot detection of money requests, harassment, sexual content, pressure and distress |

Profile text never leaves the machine. Models download on first run (about 1.5 GB total) and are cached in `~/.cache/huggingface`.

## Run it

```bash
cd ai_service
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/demo.py               # recommendations, planted-pair checks, safety examples
.venv/bin/uvicorn app.main:app --port 8000     # API; docs at http://localhost:8000/docs
SKILLSWAP_MOCK=1 .venv/bin/pytest -q           # fast tests, no models needed
```

`SKILLSWAP_MOCK=1` replaces every model with a deterministic stand-in (hashed-concept embeddings, template explanations, rules-only safety), so the full pipeline runs offline.

On Windows (PowerShell):

```powershell
cd ai_service
python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --port 8000          # real models (first run downloads ~1.5 GB)
$env:SKILLSWAP_MOCK = "1"; .\.venv\Scripts\uvicorn app.main:app --port 8000   # no models
```

## Connect to the website

The React site (`../src/ai.js`) calls this service for matching and for screening messages, posts and reviews.

- **Local:** start this service on port 8000, then `npm run dev` in the repo root. The Matches page says "Suggested by SkillSwap AI" when it's connected.
- **No service running** (or the GitHub Pages site): the site quietly falls back to its built-in matcher and keyword filter.
- **Hosted:** deploy this service somewhere that runs Python, add the site's origin to `SKILLSWAP_CORS_ORIGINS`, and build the site with `VITE_AI_URL=https://your-service`.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Which models are loaded (or mocked) |
| GET / PUT | `/profiles`, `/profiles/{id}` | List the synthetic profiles; add or replace one (re-embedded automatically) |
| POST | `/recommendations` | `{"person_id": "oa_0001", "weights": {"learn": 0.4, "social": 0.3, "happy": 0.3}, "top_k": 3}` |
| POST | `/safety/screen` | `{"text": "...", "level": 2, "match_id": "m1", "sender_id": "st_0001"}` |
| GET | `/audit` | Every suggestion and every flag, in order |

## Recommendation engine (`app/recommender.py`)

1. **Hard filters (rules, no AI):** both verified, no safety exclusion, reachable (same town, someone drives, or both in the Albany / Troy / Schenectady bus core), at least one shared slot, a shared language, and a partner venue that meets accessibility needs. Rejected pairs are returned in `filtered_out`, with reasons.
2. **Learn:** the harmonic mean of cos(teach_A, learn_B) and cos(teach_B, learn_A), so one-sided pairs score low.
3. **Social:** 0.5 × interests cosine + 0.3 × extraversion closeness + 0.2 × format agreement.
4. **Happy:** 0.5 × motive complementarity + 0.3 × logistics fit + 0.2 × the older adult's generativity.
5. **Total:** w_L·L + w_S·S + w_H·H, with weights normalized (default 0.4 / 0.3 / 0.3).
6. **Routing (never a similarity feature):** UCLA-3 ≥ 7 and LSNS-6 < 12 raise priority; De Jong Gierveld picks a one-on-one or group hint; WHO-5 < 28 sets `coordinator_checkin_before_matching`.
7. **Explanation:** a factual draft is built from the features, then Qwen rephrases it. The output is rejected (and the draft used instead) if it drops a skill, adds too much, addresses the reader, or mentions scores, age, health or loneliness. `explanation_source` says which one you got.

On the sample data, all four planted strong pairs rank #1 (precision@3 = 4/4), and all three traps behave as expected: no shared slot, no shared language, and one-sided fit.

## Safety filter (`app/safety.py`)

- **Rules** (deterministic, always on) cover money, gift cards, bank / card / SSN details, passwords, phone numbers, emails, addresses, home visits, moving off the platform, secrecy and distress phrases.
- **The zero-shot model** catches paraphrases the rules miss (for example "a little extra cash?" or insults). The threshold is `SKILLSWAP_SAFETY_THRESHOLD` (default 0.75).
- **Trust-level aware:** phone numbers and off-platform contact are allowed from level 5, and addresses and home visits from level 10.
- **Actions:** `allow`, `flag_for_coordinator`, or `urgent_escalation` (distress, which adds 988 / 911 guidance). Nothing auto-bans. Excerpts are trimmed and long digit runs are masked before storage.

## Configuration

| Env var | Default |
|---|---|
| `SKILLSWAP_MOCK` | `0` |
| `SKILLSWAP_EMBED_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` |
| `SKILLSWAP_LLM_MODEL` | `Qwen/Qwen2.5-0.5B-Instruct` (try `Qwen/Qwen2.5-1.5B-Instruct` for better phrasing) |
| `SKILLSWAP_USE_LLM` | `1` |
| `SKILLSWAP_SAFETY_MODEL` | `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` |
| `SKILLSWAP_USE_SAFETY_MODEL` | `1` |
| `SKILLSWAP_SAFETY_THRESHOLD` | `0.75` |
| `SKILLSWAP_CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` (web pages allowed to call the API) |

## Not done yet (mock limits)

- Profiles are held in memory from `data/sample_profiles.json`, not Postgres / pgvector.
- The audit log is in memory, and there is no coordinator approval endpoint yet.
- There are 15 hand-written profiles, not the 60 + 60 synthetic set from Section 8.
- There is no learning from feedback or contextual bandits.
