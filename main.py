# master_app.py
import asyncio
from contextlib import asynccontextmanager
import logging
from typing import List
import os
from dotenv import load_dotenv

from fastapi import FastAPI

from .Agents.BaseAgent import BaseAgent
from .config.sector_registry import ALL_SECTORS
from .Agents.Smog_and_Dispersion_agent.agent import GenericSmogAgent
from .Agents.Waterloggin_Hydrology_agent.agent import GenericWaterloggingAgent
from .Agents.Thermal_Stress_agent.agent import GenericThermalAgent
from .Agents.Transit_Fleet_agent.agent import GenericTransitAgent

log = logging.getLogger("autonet.master")

load_dotenv()

# Global registry to hold active agent instances
active_agents: List[BaseAgent] = []

ALL_AGENTS = [
    GenericSmogAgent,
    GenericWaterloggingAgent,
    GenericThermalAgent,
    GenericTransitAgent
]

BACKEND_URL=os.getenv("BACKEND_URL")

@asynccontextmanager
async def master_lifespan(app: FastAPI):
    """
    Master lifespan manager.
    Instantiates and boots agents across all configured sectors on startup,
    and handles graceful shutdown on server stop.
    """
    log.info("Starting AutoNet Multi-Agent Engine...")

    # 1. Instantiate and start a Smog Agent for EVERY sector in the registry
    for sector_config in ALL_SECTORS:
        for agent in ALL_AGENTS:
            curr_agent = agent(
                config=sector_config,
                backend_url=BACKEND_URL,
                poll_interval=60
            )
            await curr_agent.start()
            active_agents.append(curr_agent)

    log.info("Successfully booted %d smog_dispersion agent nodes.", len(active_agents))

    yield  # Application runs here and accepts HTTP traffic

    # 2. Graceful Shutdown: Stop all background polling tasks
    log.info("Shutting down AutoNet Multi-Agent Engine...")
    await asyncio.gather(*(agent.stop() for agent in active_agents), return_exceptions=True)
    active_agents.clear()
    log.info("All agent nodes offline.")


# Master FastAPI Service
app = FastAPI(
    title="AutoNet Multi-Agent Master Orchestrator",
    version="2.0.0",
    lifespan=master_lifespan
)


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "online",
        "active_smog_nodes": len(active_agents),
        "nodes_running": [a.config.sector_id for a in active_agents if a._loop_task and not a._loop_task.done()]
    }