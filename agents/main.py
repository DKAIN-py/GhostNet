"""
AutoNet — Unified Master FastAPI Application
=============================================
Single-process execution mesh that mounts all four sensory sub-apps
and schedules their background loops concurrently on the asyncio event loop.

Critical architecture rules enforced here:
  1. NO blocking calls at module level (no pipeline(), no model.load())
  2. Each create_task() is individually exception-gated
  3. Tasks are staggered with asyncio.sleep(0.5) to prevent loop starvation
  4. Heavy init (ML models, browser sessions) is lazy-loaded INSIDE loop functions

Author  : AutoNet Systems Team
Runtime : Python 3.11+ | FastAPI | uvicorn | asyncio
"""

import asyncio
import logging
import traceback

from fastapi import FastAPI

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — LOGGING
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("autonet.master")


log.info("Importing sub-agent modules...")

try:
    from .air_analysis.air_agent import air_app, air_quality_agent_loop
    log.info("air_analysis module imported.")
except Exception:
    log.critical("FAILED to import air_analysis module:\n%s", traceback.format_exc())
    air_app = None
    air_quality_agent_loop = None

try:
    from .transit_analysis.transport_agent import transport_app, transport_agent_loop
    log.info("transit_analysis module imported.")
except Exception:
    log.critical("FAILED to import transit_analysis module:\n%s", traceback.format_exc())
    transport_app = None
    transport_agent_loop = None

try:
    from .sentiment_analysis.twitter_analysis import x_app, sentiment_agent_loop, init_sentiment_resources
    log.info("sentiment_analysis module imported.")
except Exception:
    log.critical("FAILED to import sentiment_analysis module:\n%s", traceback.format_exc())
    x_app = None
    sentiment_agent_loop = None
    init_sentiment_resources = None

try:
    from .cascade_detector.cascade_detector import cascade_app, cascade_detector_loop
    log.info("cascade_detector module imported.")
except Exception:
    log.critical("FAILED to import cascade_detector module:\n%s", traceback.format_exc())
    cascade_app = None
    cascade_detector_loop = None

log.info("All sub-agent module imports attempted.")


master_app = FastAPI(
    title      = "AutoNet Unified Multi-Agent Engine",
    description= "Single-process execution mesh for distributed sensing and analytics cores.",
    version    = "1.0.0",
)

if air_app:
    master_app.mount("/sub-agent/air", air_app)
    log.info("Mounted: /sub-agent/air")

if transport_app:
    master_app.mount("/sub-agent/transport", transport_app)
    log.info("Mounted: /sub-agent/transport")

if x_app:
    master_app.mount("/sub-agent/sentiment", x_app)
    log.info("Mounted: /sub-agent/sentiment")

if cascade_app:
    master_app.mount("/sub-agent/cascade", cascade_app)
    log.info("Mounted: /sub-agent/cascade")



async def _safe_loop_wrapper(loop_fn, name: str) -> None:
    log.info("[%s] Background loop task starting...", name)
    try:
        await loop_fn()
    except asyncio.CancelledError:
        log.info("[%s] Task cancelled (normal shutdown).", name)
    except Exception:
        log.critical(
            "[%s] LOOP CRASHED with unhandled exception:\n%s",
            name, traceback.format_exc()
        )


@master_app.on_event("startup")
async def launch_all_agent_loops() -> None:

    print("\n" + "=" * 60)
    print("  AUTONET SWARM MATRIX INITIALIZING")
    print("  Staging background loops with staggered boot sequence...")
    print("=" * 60 + "\n")
    try:
        if air_quality_agent_loop is None:
            raise RuntimeError("air_quality_agent_loop not imported, check air_analysis module.")

        task_air = asyncio.create_task(
            _safe_loop_wrapper(air_quality_agent_loop, "AIR_QUALITY"),
            name="air_quality_loop",
        )
        log.info("Task scheduled: AIR_QUALITY [task_id=%s]", id(task_air))

    except Exception:
        log.critical("Failed to schedule AIR_QUALITY loop:\n%s", traceback.format_exc())

    await asyncio.sleep(0.5)

    try:
        if transport_agent_loop is None:
            raise RuntimeError("transport_agent_loop not imported, check transit_analysis module.")

        task_transport = asyncio.create_task(
            _safe_loop_wrapper(transport_agent_loop, "TRANSPORT"),
            name="transport_loop",
        )
        log.info("Task scheduled: TRANSPORT [task_id=%s]", id(task_transport))

    except Exception:
        log.critical("Failed to schedule TRANSPORT loop:\n%s", traceback.format_exc())

    await asyncio.sleep(0.5)

    try:
        if sentiment_agent_loop is None or init_sentiment_resources is None:
            raise RuntimeError("sentiment_agent_loop or initializer not imported — check sentiment_analysis module.")

        log.info("Shedding execution control to allocate model resource memory arrays...")
        roberta_callable = await init_sentiment_resources()

        task_sentiment = asyncio.create_task(
            _safe_loop_wrapper(lambda: sentiment_agent_loop(roberta_callable), "SENTIMENT"),
            name="sentiment_loop",
        )
        log.info("Task scheduled: SENTIMENT [task_id=%s]", id(task_sentiment))

    except Exception:
        log.critical("Failed to schedule SENTIMENT loop:\n%s", traceback.format_exc())

    await asyncio.sleep(0.5)

    try:
        if cascade_detector_loop is None:
            raise RuntimeError("cascade_detector_loop not imported — check cascade_detector module.")

        task_cascade = asyncio.create_task(
            _safe_loop_wrapper(cascade_detector_loop, "CASCADE_DETECTOR"),
            name="cascade_loop",
        )
        log.info("Task scheduled: CASCADE_DETECTOR [task_id=%s]", id(task_cascade))

    except Exception:
        log.critical("Failed to schedule CASCADE_DETECTOR loop:\n%s", traceback.format_exc())

    await asyncio.sleep(0.5)

    print("\n" + "=" * 60)
    print("  AUTONET SWARM MATRIX ONLINE")
    print("  4 sensory loops active | Master orchestration running")
    print("=" * 60 + "\n")


@master_app.get("/status", summary="Master process health check", tags=["Health"])
async def master_status() -> dict:
    all_tasks = asyncio.all_tasks()
    loop_tasks = [
        {
            "name"  : t.get_name(),
            "done"  : t.done(),
            "cancelled": t.cancelled(),
        }
        for t in all_tasks
        if t.get_name() in (
            "air_quality_loop", "transport_loop",
            "sentiment_loop",   "cascade_loop",
        )
    ]

    return {
        "master"     : "autonet",
        "status"     : "running",
        "loop_tasks" : loop_tasks,
        "total_tasks": len(all_tasks),
    }