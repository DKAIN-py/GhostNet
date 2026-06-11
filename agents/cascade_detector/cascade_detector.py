# Package imports
from fastapi import FastAPI
import asyncio
import httpx

# Module imports
from .utils import log, evaluate_cascade_risk
from .config import (NODE_CASCADE_ALERT_URL, NODE_LATEST_STATE_URL, EVALUATION_INTERVAL)


async def cascade_detector_loop():
    async with httpx.AsyncClient as client:
        while True:
            try:
                response = await client.get(NODE_LATEST_STATE_URL, timeout=5.0)
                
                if response.status_code != 200:
                    log.error(f"Failed to fetch system state. Status: {response.status_code} — Retrying next tick.")
                else:
                    agent_states = response.json()
                    if isinstance(agent_states, dict):
                        agent_states = agent_states.get("records", [])
                        
                    cascade_score, confidence, triggered, alert_payload = evaluate_cascade_risk(agent_states)
                    
                    if cascade_score >= 0.65:
                        log.warning(f"THRESHOLD BREACHED — Cascade Score: {cascade_score:.2f}. Pushing alert!")
                        
                        post_response = await client.post(
                            NODE_CASCADE_ALERT_URL, 
                            json=alert_payload, 
                            timeout=5.0
                        )
                        log.info(f"Alert Broadcast Dispatched. Node server proxy returned code: {post_response.status_code}")
                    else:
                        log.info(f"[SYSTEM NOMINAL] Cascade Score: {cascade_score:.2f}. Sensory channels tracking normal metrics.")
                        
            except httpx.HTTPError as net_err:
                log.error(f"Network transport boundary failure routing to Node server: {net_err}")
            except Exception as loop_err:
                log.error(f"Unexpected execution breakdown inside Master Core loop: {loop_err}")
                
            await asyncio.sleep(EVALUATION_INTERVAL)

cascade_app = FastAPI(title="AutoNet Master Cascade Detector Engine")

@cascade_app.on_event("startup")
async def start_orchestrator_matrix():
    asyncio.create_task(cascade_detector_loop())

@cascade_app.get("/status")
async def get_engine_status():
    return {
        "engine": "AutoNet Master Cascade Orchestrator",
        "status": "operational",
        "evaluation_rules": {
            "matrix_weights": {"air_quality": 0.40, "transport": 0.35, "sentiment": 0.25},
            "activation_threshold": 0.65
        }
    }