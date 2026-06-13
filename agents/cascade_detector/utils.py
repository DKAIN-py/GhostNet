from datetime import datetime, timezone
import logging


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] AutoNet.cascade_brain — %(message)s")
log = logging.getLogger("autonet.cascade_brain")


def evaluate_cascade_risk(agent_data: list[dict[str, any]]) -> tuple[float, int, list[str], dict[str, any]]:
    
    agent_map = {item.get("agentId"): item for item in agent_data if item.get("agentId")}
    
    weights = {
        "air_quality": 0.40,
        "transport": 0.35,
        "sentiment": 0.25
    }
    
    state_scores: dict[str, float] = {}
    health_scores: dict[str, int] = {}
    agents_triggered: list[str] = []
    
    for agent_id in weights.keys():
        record = agent_map.get(agent_id, {})
        anomaly_level = str(record.get("anomalyLevel", "nominal")).lower()
        health_scores[agent_id] = int(record.get("healthScore", 100))
        
        if anomaly_level == "critical":
            s_score = 1.0
        elif anomaly_level == "warning":
            s_score = 0.5
        else:
            s_score = 0.0
            
        state_scores[agent_id] = s_score
        if s_score > 0.0:
            agents_triggered.append(agent_id)

    cascade_score = (
        (weights["air_quality"] * state_scores.get("air_quality", 0.0)) +
        (weights["transport"] * state_scores.get("transport", 0.0)) +
        (weights["sentiment"] * state_scores.get("sentiment", 0.0))
    )
    
    # if cascade_score < 0.65:
    #     return cascade_score, 0, [], {}

    triggered_healths = [health_scores[aid] for aid in agents_triggered]
    mean_triggered_health = sum(triggered_healths) / len(triggered_healths) if triggered_healths else 100
    confidence = int(100 - mean_triggered_health)
    
    if "air_quality" in agents_triggered and "sentiment" in agents_triggered and "transport" not in agents_triggered:
        predicted_event = "Severe regional smog emergency"
        hours_until = 36
        recommendation = "Issue immediate public health advisory, distribute mask arrays, and suspend physical schooling structures."
    elif "transport" in agents_triggered and "air_quality" in agents_triggered:
        predicted_event = "Systemic visibility and logistics gridlock"
        hours_until = 12
        recommendation = "Restrict heavy commercial border entry and enforce emergency public transit deployment."
    else:
        predicted_event = "Multi-domain environmental and civic degradation cascade"
        hours_until = 24
        recommendation = "Activate localized emergency containment protocols."

    context_payload = {
        "confidence": confidence,
        "predictedEvent": predicted_event,
        "hoursUntil": hours_until,
        "recommendation": recommendation,
        "agentsTriggered": agents_triggered,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    }

    return cascade_score, confidence, agents_triggered, context_payload