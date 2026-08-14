"""
Need to Create a ML model on the historical data of Metero system from Open transit data
"""



import asyncio
from contextlib import asynccontextmanager
import logging
from typing import List
import os
import socketio
from dotenv import load_dotenv

from fastapi import FastAPI

from .Agents.BaseAgent import BaseAgent
from .config.sector_registry import ALL_SECTORS
from .Agents.Smog_and_Dispersion_agent.agent import GenericSmogAgent
from .Agents.Waterloggin_Hydrology_agent.agent import GenericWaterloggingAgent
from .Agents.Thermal_Stress_agent.agent import GenericThermalAgent
from .Agents.Transit_Fleet_agent.agent import GenericTransitAgent
from .Agents.Arterial_Congestion_agent.agent import GenericRoadCorridorAgent
from .Agents.Power_Grid_agent.agent import GenericPowerGridAgent

log = logging.getLogger("autonet.master")

load_dotenv()

SOCKET_URL = os.getenv("SOCKET_URL", "http://localhost:3001")

# Global registry to hold active agent instances
active_agents: List[BaseAgent] = []

# Single shared Socket.io async client instance
sio = socketio.AsyncClient()

ALL_AGENT_CLASSES = [
    GenericSmogAgent,
    GenericWaterloggingAgent,
    GenericThermalAgent,
    GenericTransitAgent,
    GenericRoadCorridorAgent,
    GenericPowerGridAgent,
]


@asynccontextmanager
async def master_lifespan(app: FastAPI):
    """
    Master lifespan manager.
    Connects to Node.js Socket.io server, instantiates and boots agents
    across all configured sectors on startup, and handles graceful shutdown.
    """
    log.info("Starting AutoNet Multi-Agent Engine...")

    # 1. Establish persistent Socket.io connection to Node.js backend
    try:
        await sio.connect(SOCKET_URL)
        log.info(" Connected shared Socket.io client to %s", SOCKET_URL)
    except Exception as exc:
        log.error(" Failed to connect to Socket.io server at %s: %s", SOCKET_URL, exc)

    # 2. Instantiate and start all 5 agents for EVERY sector in the registry
    for sector_config in ALL_SECTORS:
        for AgentClass in ALL_AGENT_CLASSES:
            curr_agent = AgentClass(
                config=sector_config,
                sio=sio,
                poll_interval=60
            )
            await curr_agent.start()
            active_agents.append(curr_agent)

    log.info(" Successfully booted %d agent nodes across %d sectors.", len(active_agents), len(ALL_SECTORS))

    yield  # Application runs here and accepts HTTP traffic

    # 3. Graceful Shutdown: Stop all background agent loops and disconnect Socket.io
    log.info("Shutting down AutoNet Multi-Agent Engine...")
    await asyncio.gather(*(agent.stop() for agent in active_agents), return_exceptions=True)
    active_agents.clear()

    if sio.connected:
        await sio.disconnect()
        log.info("Socket.io client disconnected.")

    log.info("All agent nodes offline.")


# Master FastAPI Service
app = FastAPI(
    title="AutoNet Multi-Agent Master Orchestrator",
    version="2.0.0",
    lifespan=master_lifespan
)


@app.get("/health", tags=["System"])
async def health_check():
    running_nodes = [
        f"{a.config.sector_id}:{a.agent_id}"
        for a in active_agents
        if a._loop_task and not a._loop_task.done()
    ]
    return {
        "status": "online",
        "socket_connected": sio.connected,
        "active_agent_nodes": len(active_agents),
        "running_nodes_count": len(running_nodes),
    }