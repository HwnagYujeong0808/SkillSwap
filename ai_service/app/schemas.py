"""Pydantic models mirroring the profile record in Section 6 of the spec."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["older_adult", "student"]


class Motives(BaseModel):
    understanding: float = 0.0
    social: float = 0.0
    values: float = 0.0
    career: float = 0.0
    protective: float = 0.0
    enhancement: float = 0.0


class Style(BaseModel):
    extraversion: float = 0.5
    openness: float = 0.5


class Loneliness(BaseModel):
    ucla3: Optional[int] = None
    djg_emotional: Optional[int] = None
    djg_social: Optional[int] = None


class Profile(BaseModel):
    person_id: str
    role: Role
    first_name: str
    age_band: Optional[str] = None
    area: str
    verified: bool = True
    teach_text: str = ""
    learn_text: str = ""
    generativity_text: str = ""
    interests_text: str = ""
    motives: Motives = Field(default_factory=Motives)
    generativity: float = 0.0
    style: Style = Field(default_factory=Style)
    loneliness: Loneliness = Field(default_factory=Loneliness)
    network_lsns6: Optional[int] = None
    wellbeing_who5: Optional[int] = None
    format_pref: Literal["one_on_one", "group", "either"] = "either"
    availability: list[str] = Field(default_factory=list)
    transport: Literal["drives", "bus", "walk", "needs_ride"] = "bus"
    languages: list[str] = Field(default_factory=lambda: ["en"])
    accessibility: dict = Field(default_factory=dict)
    safety_exclusions: list[str] = Field(default_factory=list)  # person_ids never to pair with
    is_synthetic: bool = True


class Weights(BaseModel):
    learn: float = 0.4
    social: float = 0.3
    happy: float = 0.3

    def normalized(self) -> tuple[float, float, float]:
        total = self.learn + self.social + self.happy
        if total <= 0:
            return (1 / 3, 1 / 3, 1 / 3)
        return (self.learn / total, self.social / total, self.happy / total)


class Scores(BaseModel):
    learn: float
    learn_o_to_s: float
    learn_s_to_o: float
    social: float
    happy: float
    motive: float
    total: float


class Recommendation(BaseModel):
    candidate_id: str
    candidate_first_name: str
    scores: Scores
    explanation: str
    explanation_source: Literal["llm", "template"]
    facts: dict


class RecommendationResponse(BaseModel):
    person_id: str
    weights: Weights
    routing: dict
    recommendations: list[Recommendation]
    filtered_out: dict[str, list[str]]


class RecommendRequest(BaseModel):
    person_id: str
    weights: Weights = Field(default_factory=Weights)
    top_k: int = 3
    explain: bool = True


class ScreenRequest(BaseModel):
    text: str
    sender_id: Optional[str] = None
    match_id: Optional[str] = None
    level: int = 1


class SafetyFlag(BaseModel):
    category: str
    source: Literal["rule", "model"]
    severity: Literal["low", "medium", "high", "urgent"]
    score: float
    excerpt: str
    rule: Optional[str] = None


class ScreenResponse(BaseModel):
    flagged: bool
    action: Literal["allow", "flag_for_coordinator", "urgent_escalation"]
    flags: list[SafetyFlag]
    model_scores: dict[str, float]
    note: str
