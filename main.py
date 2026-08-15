"""
AutoNet — Master Orchestrator & Lifecycle Manager
=================================================
Manages local llama-server (Qwen 2.5 Coder 7B), Socket.io backend connections,
SectorStateStore in-memory buffer, 195 multi-agent loops, and the CascadeEngine.

Author  : AutoNet Systems Team
Runtime : Python 3.11+
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
import httpx
import socketio

from .Agents.Arterial_Congestion_agent.agent import GenericRoadCorridorAgent
from .Agents.BaseAgent import BaseAgent
from .Agents.Emergency_Dispatch_agent.agent import GenericEmergencyDispatchAgent
from .Agents.Hospital_Capacity_agent.agent import GenericHospitalCapacityAgent
from .Agents.Muncipal_Advisory_agent.agent import GenericMuncipalAdvisoryAgent
from .Agents.Power_Grid_agent.agent import GenericPowerGridAgent
from .Agents.Smog_and_Dispersion_agent.agent import GenericSmogAgent
from .Agents.Social_Panic_Agent.agent import GenericSocialPanicAgent
from .Agents.Structural_Industrial_Hazard_agent.agent import GenericIndustrialHazardAgent
from .Agents.Thermal_Stress_agent.agent import GenericThermalAgent
from .Agents.Transit_Fleet_agent.agent import GenericTransitAgent
from .Agents.Waterloggin_Hydrology_agent.agent import GenericWaterloggingAgent
from .config.sector_registry import ALL_SECTORS
from Cascade_Engine.cascade_engine import CascadeEngine
from Cascade_Engine.sector_state_store import SectorStateStore
from global_config import POLL_INTERVAL_SEC, SOCKET_URL

log = logging.getLogger("autonet.master")

load_dotenv()

# Path to local Qwen execution script
SCRIPT_PATH = Path.home() / "models" / "qwen_2.5_coder_7b" / "qwen2.5run.sh"

# Global Singletons
active_agents: List[BaseAgent] = []
sector_store = SectorStateStore()
sio = socketio.AsyncClient()
http_client: httpx.AsyncClient | None = None
cascade_engine: CascadeEngine | None = None

ALL_AGENT_CLASSES = [
    GenericSmogAgent,
    GenericWaterloggingAgent,
    GenericThermalAgent,
    GenericTransitAgent,
    GenericRoadCorridorAgent,
    GenericPowerGridAgent,
    GenericIndustrialHazardAgent,
    GenericHospitalCapacityAgent,
    GenericEmergencyDispatchAgent,
    GenericSocialPanicAgent,
    GenericMuncipalAdvisoryAgent,
]


# ─────────────────────────────────────────────────────────────────────────────
# LLM BRAIN LIFECYCLE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def ensure_brain_running() -> bool:
    """Triggers start script and polls until llama-server responds on port 8080."""
    log.info("🧠 [Brain Lifecycle] Executing qwen2.5run.sh start...")
    try:
        proc = await asyncio.create_subprocess_exec(
            str(SCRIPT_PATH),
            "start",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
    except Exception as exc:
        log.error("🧠 [Brain Lifecycle] Failed to launch script %s: %s", SCRIPT_PATH, exc)
        return False

    # Poll http://localhost:8080/v1/models until llama-server is ready
    async with httpx.AsyncClient(timeout=2.0) as client:
        for attempt in range(20):
            try:
                resp = await client.get("http://localhost:8080/v1/models")
                if resp.status_code == 200:
                    log.info("⚡ [Brain Lifecycle] Qwen2.5 Cascade Brain is live on :8080!")
                    return True
            except httpx.RequestError:
                pass
            await asyncio.sleep(1.0)

    log.warning("⚠️ [Brain Lifecycle] Brain port 8080 did not respond within 20s.")
    return False


async def stop_brain() -> None:
    """Triggers stop script on app teardown."""
    log.info("😴 [Brain Lifecycle] Putting Qwen2.5 Cascade Brain to sleep...")
    try:
        proc = await asyncio.create_subprocess_exec(
            str(SCRIPT_PATH),
            "stop",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        log.info("✅ [Brain Lifecycle] Brain stopped successfully.")
    except Exception as exc:
        log.error("🧠 [Brain Lifecycle] Failed to execute stop script: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI LIFESPAN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def master_lifespan(app: FastAPI):
    """
    Master lifespan manager.
    Wakes local Qwen2.5 LLM brain, connects Socket.io, boots all sector agents
    with shared SectorStateStore reference, and manages CascadeEngine execution.
    """
    global http_client, cascade_engine
    log.info("Starting AutoNet Multi-Agent & Cascade Engine System...")

    # 1. Start Qwen2.5 local llama-server via qwen2.5run.sh
    brain_ready = await ensure_brain_running()
    if not brain_ready:
        log.warning("⚠️ Continuing boot without local LLM brain. Fallback handling active.")

    # 2. Establish persistent Socket.io connection to backend
    try:
        await sio.connect(SOCKET_URL)
        log.info("Connected shared Socket.io client to %s", SOCKET_URL)
    except Exception as exc:
        log.error("Failed to connect to Socket.io server at %s: %s", SOCKET_URL, exc)

    # 3. Initialize HTTP client and CascadeEngine instance
    http_client = httpx.AsyncClient()
    cascade_engine = CascadeEngine(
        store=sector_store,
        sio=sio,
        http_client=http_client,
    )

    # Start CascadeEngine background 30-min evaluation loop
    await cascade_engine.start()

    # 4. Instantiate and start all agent nodes across ALL sectors
    for sector_config in ALL_SECTORS:
        for AgentClass in ALL_AGENT_CLASSES:
            curr_agent = AgentClass(
                config=sector_config,
                sio=sio,
                poll_interval=POLL_INTERVAL_SEC,
                store=sector_store,
            )
            await curr_agent.start()
            active_agents.append(curr_agent)

    log.info(
        "Successfully booted %d agent nodes across %d sectors.",
        len(active_agents),
        len(ALL_SECTORS),
    )

    yield  # Application serving HTTP traffic

    # 5. Graceful Teardown
    log.info("Shutting down AutoNet Engine...")

    # Stop CascadeEngine loop
    if cascade_engine:
        await cascade_engine.stop()

    # Stop all active agent worker loops
    await asyncio.gather(
        *(agent.stop() for agent in active_agents),
        return_exceptions=True
    )
    active_agents.clear()

    # Disconnect network clients
    if sio.connected:
        await sio.disconnect()
        log.info("Socket.io client disconnected.")

    if http_client:
        await http_client.aclose()
        log.info("HTTP client closed.")

    # Put LLM brain server process to sleep
    await stop_brain()

    log.info("All agent nodes and cascade engine offline.")


# Master FastAPI Application
app = FastAPI(
    title="AutoNet Multi-Agent Master Orchestrator",
    version="2.0.0",
    lifespan=master_lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# HTTP ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """Returns real-time health metrics of all components."""
    running_nodes = [
        f"{a.config.sector_id}:{a.agent_id}"
        for a in active_agents
        if a._loop_task and not a._loop_task.done()
    ]
    store_snapshot = await sector_store.snapshot()

    return {
        "status": "online",
        "socket_connected": sio.connected,
        "active_agent_nodes": len(active_agents),
        "running_nodes_count": len(running_nodes),
        "store_metrics": {
            "total_sectors": store_snapshot["totalSectors"],
            "alerting_count": store_snapshot["alertingCount"],
            "average_score": store_snapshot["averageScore"],
        },
    }


@app.get("/api/sectors/store", tags=["Telemetry"])
async def get_store_snapshot():
    """Returns full in-memory SectorStateStore snapshot for state inspection."""
    return await sector_store.snapshot()


@app.post("/api/cascade/trigger-now", tags=["Cascade Engine"])
async def trigger_cascade_evaluation():
    """Manually triggers a single CascadeEngine evaluation cycle immediately."""
    if not cascade_engine:
        raise HTTPException(status_code=503, detail="CascadeEngine is not initialized.")

    # Run evaluation cycle asynchronously in background task to avoid HTTP timeout
    asyncio.create_task(cascade_engine.run_evaluation_cycle())
    return {
        "status": "triggered",
        "message": "Cascade evaluation cycle initiated asynchronously.",
        "timestamp": store_snapshot if (store_snapshot := await sector_store.snapshot()) else {}
    }