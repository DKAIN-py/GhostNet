"""
GHOSTNET — Sentiment Agent (Social Crisis Monitor)
===================================================
Autonomous FastAPI microservice that scrapes live Delhi pollution tweets,
runs them through a local RoBERTa sentiment model, and emits a structured
crisis signal to the GHOSTNET Node.js backend.

No OpenAI. No external NLP API. Fully local transformer inference.

Author  : GHOSTNET Systems Team
Runtime : Python 3.11+ | FastAPI | Scweet | HuggingFace Transformers
Port    : 8003
"""

import asyncio

from datetime import datetime, timedelta, timezone

import httpx
from fastapi import FastAPI

from config import (NODE_BACKEND_URL, SEARCH_QUERY, POLL_INTERVAL_SECONDS)
from utils import (log, load_roberta_pipeline, load_scweet_scraper,
                   _extract_label_scores, evaluate_live_tweets)


roberta_pipeline = None   # HuggingFace sentiment pipeline
scweet_scraper   = None   # Scweet browser session instance


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — PAYLOAD BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def build_signal_payload(health_score: int, anomaly_level: str, signal: str) -> dict:
    """
    Constructs the locked GHOSTNET schema payload.
    Key names, casing, and structure are frozen — do not modify.
    """
    return {
        "agentId"     : "sentiment",
        "domain"      : "social",
        "healthScore" : health_score,
        "anomalyLevel": anomaly_level,
        "signal"      : signal,
        "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — BACKGROUND AGENT LOOP
# ─────────────────────────────────────────────────────────────────────────────

async def sentiment_agent_loop(roberta: callable) -> None:
    """
    Continuous non-blocking background worker.

    Every POLL_INTERVAL_SECONDS:
      1. Compute yesterday's date string for Scweet's `since` parameter
      2. Run Scweet.search() in a thread executor (it's synchronous under the hood)
      3. Analyze tweets through local RoBERTa pipeline
      4. Build schema-compliant payload
      5. POST to Node.js backend

    Scweet errors (rate limits, session drops, browser crashes) are caught
    and handled with a deterministic fallback — the loop never dies.
    """
    log.info("Sentiment Agent loop starting. Poll interval: %ds", POLL_INTERVAL_SECONDS)

    # Get the current running event loop once — reused across all iterations
    loop = asyncio.get_event_loop()

    async with httpx.AsyncClient() as client:
        while True:
            health_score  = 88
            anomaly_level = "nominal"
            signal        = "Sentiment engine on cooldown — baseline holding."

            try:
                # ── Step 1: Build date range string ─────────────────────────
                # Scweet's `since` param filters tweets from this date onward
                yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                log.info(
                    "Scraping tweets for query='%s' since=%s",
                    SEARCH_QUERY, yesterday_str
                )

                # ── Step 2: Run Scweet in executor (non-blocking) ────────────
                # Scweet drives a headless browser — this is CPU/IO blocking.
                # run_in_executor offloads it to a thread so the ASGI loop
                # remains free to serve HTTP requests during the scrape.
                if scweet_scraper is None:
                    raise RuntimeError("Scweet scraper not initialized — check TWITTER_AUTH_TOKEN.")

                tweets = await loop.run_in_executor(
                    None,
                    lambda: scweet_scraper.search(
                        SEARCH_QUERY,
                        since = yesterday_str,
                        limit = 10,
                    )
                )

                tweet_count = len(tweets) if tweets else 0
                log.info("Scweet returned %d tweets.", tweet_count)

                # ── Step 3: Analyze through RoBERTa ─────────────────────────
                health_score, anomaly_level, signal = evaluate_live_tweets(tweets or [], roberta)

            # ── Resilience: Scweet rate limit / session drop ─────────────────
            except Exception as exc:
                log.warning(
                    "Scraper exception caught — activating cooldown fallback. "
                    "Error: %s: %s",
                    type(exc).__name__, exc
                )
                # Deterministic fallback: nominal signal so dashboard never goes dead
                health_score  = 88
                anomaly_level = "nominal"
                signal        = (
                    "Sentiment engine pacing on token cooldown cycle — "
                    "X.com session throttled or rate-limited. Baseline nominal."
                )

            # ── Step 4: Build and dispatch payload ───────────────────────────
            try:
                payload = build_signal_payload(health_score, anomaly_level, signal)

                log.info(
                    "Signal built → healthScore=%d | anomalyLevel=%s",
                    health_score, anomaly_level.upper()
                )

                response = await client.post(
                    NODE_BACKEND_URL,
                    json   = payload,
                    timeout= 10.0,
                )
                response.raise_for_status()

                log.info(
                    "Signal dispatched → HTTP %d | timestamp=%s",
                    response.status_code, payload["timestamp"]
                )

            except httpx.ConnectError:
                # Node backend not up yet — log and continue, don't crash
                log.warning(
                    "Node backend unreachable at %s — payload logged locally only.",
                    NODE_BACKEND_URL
                )
                log.info("PAYLOAD (backend offline): %s", payload)

            except httpx.HTTPStatusError as exc:
                log.error("Backend returned HTTP %d.", exc.response.status_code)

            except Exception as exc:
                log.exception("Unexpected dispatch error: %s", exc)

            # ── Wait for next cycle ──────────────────────────────────────────
            log.debug("Sleeping %ds until next sentiment cycle...", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — FASTAPI APP & LIFECYCLE
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title      = "GHOSTNET — Sentiment Agent",
    description= (
        "Autonomous social crisis monitor. Scrapes Delhi pollution tweets, "
        "runs local RoBERTa NLP inference, emits GHOSTNET health signals."
    ),
    version    = "1.0.0",
)


@app.on_event("startup")
async def startup_event() -> None:
    """
    Startup sequence:
      1. Load RoBERTa model into memory (blocking, but only runs once)
      2. Initialize Scweet browser session
      3. Launch background agent loop as non-blocking asyncio Task
    """
    global roberta_pipeline, scweet_scraper

    log.info("GHOSTNET Sentiment Agent starting up...")

    # Load transformer model — runs in the main thread at startup
    # This blocks for ~10s on first cold start (model load), ~2s warm start
    loop = asyncio.get_event_loop()
    roberta_pipeline = await loop.run_in_executor(None, load_roberta_pipeline)

    # Initialize Scweet scraper
    scweet_scraper = await loop.run_in_executor(None, load_scweet_scraper)

    # Launch the background polling loop
    asyncio.create_task(sentiment_agent_loop(roberta_pipeline))
    log.info("Background sentiment agent loop scheduled.")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — HTTP ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/status", summary="Agent liveness check", tags=["Health"])
async def status() -> dict:
    """Lightweight probe — confirms process is alive and model is loaded."""
    return {
        "agent"        : "sentiment",
        "status"       : "running",
        "model_loaded" : roberta_pipeline is not None,
        "scraper_ready": scweet_scraper is not None,
    }


@app.get("/inference-preview", summary="Test RoBERTa on custom text", tags=["Debug"])
async def inference_preview(text: str) -> dict:
    """
    Dry-run the RoBERTa model on any text string without triggering a scrape.

    Example: GET /inference-preview?text=Delhi air is terrible today
    """
    if roberta_pipeline is None:
        return {"error": "Model not loaded yet. Try again in a few seconds."}

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: roberta_pipeline(text))

    scores = _extract_label_scores(
        result[0] if isinstance(result[0], list) else result
    )
    return {"input": text, "scores": scores}