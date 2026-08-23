"""
AutoNet — Cascade Prompts & Pydantic Schema Definitions
========================================================
Defines structured output contracts for Qwen2.5-Coder-7B-Instruct:
  1. SectorCascadeAlert       — per-sector crisis diagnosis
  2. CityCascadeLLMSynthesis  — qualitative synthesis for citywide rollups (FLATTENED)

Author  : AutoNet Systems Team
Runtime : Python 3.11+ | Pydantic v2
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — ENUMS
# ─────────────────────────────────────────────────────────────────────────────

class SectorSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH     = "HIGH"
    MEDIUM   = "MEDIUM"


class CityThreatLevel(str, Enum):
    RED    = "RED"
    ORANGE = "ORANGE"
    YELLOW = "YELLOW"


class RootCauseDomain(str, Enum):
    WATERLOGGING_HYDROLOGY = "waterlogging_hydrology"
    SMOG_DISPERSION       = "smog_dispersion"
    THERMAL_STRESS        = "thermal_stress"
    TRANSIT_FLEET         = "transit_fleet"
    ROAD_CORRIDOR         = "road_corridor"
    POWER_GRID            = "power_grid"


class ActionPriority(str, Enum):
    P1_CRITICAL = "P1_CRITICAL"
    P2_HIGH     = "P2_HIGH"
    P3_MEDIUM   = "P3_MEDIUM"


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — SINGLE-SECTOR CASCADE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class SectorCascadeAlert(BaseModel):
    """Structured LLM output for a single-sector cascade diagnosis."""

    alertId: str = Field(
        ...,
        description="Unique alert identifier string (e.g., 'ALT_2026_0811_9901').",
    )
    primarySectorId: str = Field(
        ...,
        description="The target sector ID string (e.g., 'DEL_CENTRAL_CP').",
    )
    primarySectorName: str = Field(
        ...,
        description="Human-readable name of the sector (e.g., 'Connaught Place').",
    )
    district: str = Field(
        ...,
        description="District name (e.g., 'Central Delhi').",
    )
    cascadeScore: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Calculated cascade impact score between 0.0 and 1.0.",
    )
    confidence: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence percentage score between 0 and 100 (e.g., 89).",
    )
    predictedEvent: str = Field(
        ...,
        description="Single summary sentence predicting the primary cascade failure event.",
    )
    hoursUntil: float = Field(
        ...,
        ge=0.0,
        description="Estimated time in hours until severe escalation (e.g., 1.5).",
    )
    spatialSpread: list[str] = Field(
        ...,
        description="List of sector IDs where the cascade failure is predicted to spread.",
    )
    triggeredAgents: list[str] = Field(
        ...,
        description="List of domain agent IDs detecting critical readings.",
    )
    recommendations: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="Ordered list of actionable mitigation steps for emergency response teams.",
    )

    @field_validator("cascadeScore", mode="before")
    @classmethod
    def normalize_cascade_score(cls, v: Any) -> float:
        if isinstance(v, str):
            v = v.replace("%", "").strip()
        try:
            val = float(v)
            if val > 1.0:
                return round(val / 100.0, 2)
            return round(val, 2)
        except (ValueError, TypeError):
            return 0.50

    @field_validator("confidence", mode="before")
    @classmethod
    def coerce_confidence_int(cls, v: Any) -> int:
        if isinstance(v, float) and v <= 1.0:
            return int(round(v * 100))
        if isinstance(v, str):
            v = v.replace("%", "").strip()
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return 85


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — FLATTENED CITY ROLLUP SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class CityCascadeLLMSynthesis(BaseModel):
    """
    Flattened City Rollup Schema.
    Replaces nested objects/arrays with singular primitive fields to keep GBNF state
    machines simple and prevent llama-server token generation deadlocks.
    """
    summary: str = Field(
        ...,
        description="Concise 1-2 sentence executive summary of overall city status."
    )
    rootCauseDomain: RootCauseDomain = Field(
        ...,
        description="Primary domain initiating the cascade."
    )
    threatLevel: CityThreatLevel = Field(
        ...,
        description="Overall city risk level (RED, ORANGE, YELLOW)."
    )

    # Primary Affected Area (Singular)
    primaryAffectedDistrict: str = Field(
        ...,
        description="Most critical district impacted (e.g., 'Central Delhi')."
    )
    primaryAffectedSectorId: str = Field(
        ...,
        description="Most critical sector ID (e.g., 'DEL_CENTRAL_CP')."
    )
    primaryThreatTitle: str = Field(
        ...,
        description="Short summary title of the main threat."
    )
    primaryThreatDetail: str = Field(
        ...,
        description="1-sentence explanation of telemetry impact causing failure."
    )

    # Directive Action (Singular)
    primaryDirectiveAction: str = Field(
        ...,
        description="Single highest-priority emergency directive."
    )
    primaryDirectiveAgency: str = Field(
        ...,
        description="Target agency responsible (e.g., 'PWD / MCD')."
    )
    primaryDirectivePriority: ActionPriority = Field(
        ...,
        description="Priority level for immediate action."
    )

    # Transit Strategy (Singular)
    criticalCorridor: str = Field(
        ...,
        description="Primary blocked or impacted road/transit corridor."
    )
    bypassRoute: str = Field(
        ...,
        description="Primary alternate detour route for traffic."
    )
    transitAdjustment: str = Field(
        ...,
        description="Main DTC bus or Metro rerouting directive."
    )

    # Public Broadcast (Singular)
    publicHeadline: str = Field(
        ...,
        description="Public advisory warning headline."
    )
    publicMessage: str = Field(
        ...,
        description="Public advisory broadcast message."
    )


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — SCHEMA EXPORT HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def sector_alert_response_format() -> dict[str, Any]:
    return {
        "type": "json_object",
        "schema": SectorCascadeAlert.model_json_schema(),
    }


def city_rollup_synthesis_response_format() -> dict[str, Any]:
    return {
        "type": "json_object",
        "schema": CityCascadeLLMSynthesis.model_json_schema(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — PROMPT BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

SECTOR_ALERT_SYSTEM_PROMPT = """\
You are AutoNet CascadeAI, an expert urban emergency analyst embedded in the \
Delhi Integrated Emergency Operations Centre.

Your task is to analyze real-time telemetry from a degraded city sector and \
produce a structured crisis assessment. You reason like a senior field coordinator \
with deep knowledge of Delhi's infrastructure interdependencies — drainage, \
power grid, road corridors, and DTC transit routes.

Rules:
- Be specific. Name actual Delhi locations, roads, agencies (PWD, MCD, DTC, DISCOM, NDRF).
- Root causes must be directly inferable from the telemetry — do not invent data.
- Mitigation actions must be actionable within 30 minutes by field teams.
- confidence_score reflects how clearly the telemetry supports your diagnosis.
- Respond ONLY with the JSON object. No preamble, no explanation, no markdown.\
"""


def build_sector_alert_prompt(
    sector_record_dict: dict[str, Any],
    history: list[dict[str, Any]],
) -> str:
    history_block = "\n".join([
        f"  [{i+1}] score={h.get('healthScore')} | "
        f"anomaly={h.get('anomalyLevel')} | "
        f"signal={h.get('signal', '')[:80]} | "
        f"ts={h.get('timestamp', '')}"
        for i, h in enumerate(history)
    ]) or "  No prior history available."

    return f"""\
SECTOR TELEMETRY REPORT
========================
Sector ID     : {sector_record_dict.get('sectorId')}
District      : {sector_record_dict.get('district')}
Domain        : {sector_record_dict.get('domain')}
Agent ID      : {sector_record_dict.get('agentId')}
Health Score  : {sector_record_dict.get('healthScore')} / 100
Anomaly Level : {sector_record_dict.get('anomalyLevel', '').upper()}
Metric Value  : {sector_record_dict.get('metricValue')}
Live Signal   : {sector_record_dict.get('signal')}
Location      : {sector_record_dict.get('location', {}).get('placeName', 'Unknown')}

SIGNAL HISTORY (most recent last):
{history_block}

Based on the above telemetry, produce a SectorCascadeAlert JSON assessment.
"""


CITY_ROLLUP_SYSTEM_PROMPT = """\
You are AutoNet CascadeAI operating at city-wide incident command level.

Multiple Delhi sectors are simultaneously in cascade alert. Synthesize these \
alerts into a concise, high-priority executive assessment focusing on the single \
most critical incident epicenter, primary directive, and key transport detour.

Rules:
- Keep summary under 15 words.
- Assign directives to specific agencies (PWD, DTC, DISCOM, MCD, Delhi Police).
- Focus strictly on executive synthesis, primary routing, and agency actions.
- Respond ONLY with the JSON object. No preamble, no explanation, no markdown.\
"""


def build_city_rollup_prompt(
    active_alerts: list[dict[str, Any]],
    sequence_number: int = 1,
) -> str:
    alert_blocks = "\n\n".join([
        f"SECTOR {i+1}: {a.get('sectorId')} ({a.get('district')})\n"
        f"  Domain      : {a.get('domain')}\n"
        f"  Health Score: {a.get('healthScore')}\n"
        f"  Anomaly     : {a.get('anomalyLevel', '').upper()}\n"
        f"  Metric      : {a.get('metricValue')}\n"
        f"  Signal      : {a.get('signal')}\n"
        f"  Location    : {a.get('location', {}).get('placeName', 'Unknown')}"
        for i, a in enumerate(active_alerts[:15])
    ])

    return f"""\
ACTIVE SECTOR ALERTS ({len(active_alerts)} Total):
==================================================
{alert_blocks}

Synthesize these active alerts into a CityCascadeLLMSynthesis JSON object.
"""