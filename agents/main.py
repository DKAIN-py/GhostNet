# Package imports
from fastapi import FastAPI
import asyncio

# Modules imports
from .transit_analysis.transport_agent import transport_app, transport_agent_loop
from .air_analysis.air_agent import air_app, air_quality_agent_loop

from .sentiment_analysis.twitter_analysis import x_app, sentiment_agent_loop
from .cascade_detector.cascade_detector import cascade_app, cascade_detector_loop


master_app = FastAPI(
    title="AutoNet Unified Multi-Agent Engine",
    description="Single-process execution mesh for distributed sensing and analytics cores."
)
master_app.mount("/sub-agent/transport", transport_app)
master_app.mount("/sub-agent/air", air_app)

master_app.mount("/sub-agent/sentiment", x_app)
master_app.mount("/sub-agent/cascade", cascade_app)


@master_app.on_event("startup")
async def launch_all_agent_loops():
    print("\n" + "="*60)
    print("AUTONET SWARM MATRIX INITIALIZED")
    print("-> All sensory background loops registered to master thread.")
    print("="*60 + "\n")
    asyncio.create_task(transport_agent_loop())
    asyncio.create_task(air_quality_agent_loop())
    
    asyncio.create_task(sentiment_agent_loop())
    asyncio.create_task(cascade_detector_loop())

@master_app.get("/")
async def get_cluster_topology():
    return {
        "system": "AutoNet Engine Core",
        "status": "operational",
        "active_mesh_nodes": {
            "air_quality_agent": "/sub-agent/air/status",
            "transport_agent": "/sub-agent/transport/status",
            "sentiment_agent": "/sub-agent/sentiment/status",
            "cascade_detector": "/sub-agent/cascade/status"
        }
    }

# if __name__ == "__main__":
#     uvicorn.run("main:master_app", host="0.0.0.0", port=8000, reload=True)