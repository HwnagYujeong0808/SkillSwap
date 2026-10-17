"""FastAPI service for the SkillSwap mock AI: recommender + safety filter.

Run:  uvicorn app.main:app --reload   (from ai_service/)
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config, hf_models, safety
from .recommender import Recommender
from .schemas import Profile, RecommendationResponse, RecommendRequest, ScreenRequest, ScreenResponse

logging.basicConfig(level=logging.INFO)
DATA = Path(__file__).resolve().parent.parent / "data" / "sample_profiles.json"


def load_profiles(path: Path = DATA) -> list[Profile]:
    return [Profile(**p) for p in json.loads(path.read_text())["profiles"]]


state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    hf_models.warm_up()
    state["rec"] = Recommender(load_profiles())
    state["audit"] = []
    yield


app = FastAPI(title="SkillSwap mock AI", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"])


@app.get("/health")
def health():
    return {"ok": True, "mock": config.MOCK, "models": hf_models.status(),
            "profiles": len(state["rec"].profiles)}


@app.get("/profiles", response_model=list[Profile])
def list_profiles():
    return list(state["rec"].profiles.values())


@app.put("/profiles/{person_id}", response_model=Profile)
def upsert_profile(person_id: str, profile: Profile):
    if profile.person_id != person_id:
        raise HTTPException(400, "person_id in path and body differ")
    state["rec"].upsert(profile)
    return profile


@app.post("/recommendations", response_model=RecommendationResponse)
def recommend(req: RecommendRequest):
    rec: Recommender = state["rec"]
    if req.person_id not in rec.profiles:
        raise HTTPException(404, f"unknown person_id {req.person_id}")
    resp = rec.recommend(req.person_id, req.weights, req.top_k, req.explain)
    # Every suggestion is logged; approval is a separate, human step.
    state["audit"].append({"actor": "ai.recommender", "action": "suggest", "object": req.person_id,
                           "weights": req.weights.model_dump(),
                           "suggested": [r.candidate_id for r in resp.recommendations]})
    return resp


@app.post("/safety/screen", response_model=ScreenResponse)
def screen(req: ScreenRequest):
    resp = safety.screen(req.text, level=req.level)
    if resp.flagged:
        state["audit"].append({"actor": "ai.safety_filter", "action": resp.action,
                               "object": req.match_id, "sender": req.sender_id,
                               "flags": [f.model_dump() for f in resp.flags]})
    return resp


@app.get("/audit")
def audit():
    return state["audit"]
