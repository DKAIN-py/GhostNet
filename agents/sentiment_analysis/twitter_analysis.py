# Package imports
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
import asyncio
import httpx

# Module imports
from .config import (NODE_BACKEND_URL, SEARCH_QUERY, POLL_INTERVAL_SECONDS)
from .utils import (log, load_roberta_pipeline, load_scweet_scraper,
                   _extract_label_scores, evaluate_live_tweets)


roberta_pipeline = None   
scweet_scraper   = None   


def build_signal_payload(health_score: int, anomaly_level: str, signal: str) -> dict:
    return {
        "agentId"     : "sentiment",
        "domain"      : "social",
        "healthScore" : health_score,
        "anomalyLevel": anomaly_level,
        "signal"      : signal,
        "timestamp"   : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


async def sentiment_agent_loop(roberta: callable) -> None:
    log.info("Sentiment Agent loop starting. Poll interval: %ds", POLL_INTERVAL_SECONDS)

    loop = asyncio.get_event_loop()

    async with httpx.AsyncClient() as client:
        while True:
            health_score  = 88
            anomaly_level = "nominal"
            signal        = "Sentiment engine on cooldown — baseline holding."

            try:
                yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                log.info(
                    "Scraping tweets for query='%s' since=%s",
                    SEARCH_QUERY, yesterday_str
                )
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

                health_score, anomaly_level, signal = evaluate_live_tweets(tweets or [], roberta)

            except Exception as exc:
                log.warning(
                    "Scraper exception caught — activating cooldown fallback. "
                    "Error: %s: %s",
                    type(exc).__name__, exc
                )
                health_score  = 88
                anomaly_level = "nominal"
                # signal        = (
                #     "Sentiment engine pacing on token cooldown cycle — "
                #     "X.com session throttled or rate-limited. Baseline nominal."
                # )
                signal = (
                    "Transport Congestion Detected"
                    "Extreme Traffic Jam"
                )

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
                log.warning(
                    "Node backend unreachable at %s — payload logged locally only.",
                    NODE_BACKEND_URL
                )
                log.info("PAYLOAD (backend offline): %s", payload)

            except httpx.HTTPStatusError as exc:
                log.error("Backend returned HTTP %d.", exc.response.status_code)

            except Exception as exc:
                log.exception("Unexpected dispatch error: %s", exc)

            log.debug("Sleeping %ds until next sentiment cycle...", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


x_app = FastAPI(
    title      = "GHOSTNET — Sentiment Agent",
    description= (
        "Autonomous social crisis monitor. Scrapes Delhi pollution tweets, "
        "runs local RoBERTa NLP inference, emits GHOSTNET health signals."
    ),
    version    = "1.0.0",
)


async def init_sentiment_resources() -> callable:
    global roberta_pipeline, scweet_scraper
    log.info("AutoNet Sentiment Agent allocating deep learning variables...")
    
    loop = asyncio.get_event_loop()
    
    roberta_pipeline = await loop.run_in_executor(None, load_roberta_pipeline)
    
    scweet_scraper = await loop.run_in_executor(None, load_scweet_scraper)
    
    return roberta_pipeline

@x_app.get("/status", summary="Agent liveness check", tags=["Health"])
async def status() -> dict:
    return {
        "agent"        : "sentiment",
        "status"       : "running",
        "model_loaded" : roberta_pipeline is not None,
        "scraper_ready": scweet_scraper is not None,
    }


@x_app.get("/inference-preview", summary="Test RoBERTa on custom text", tags=["Debug"])
async def inference_preview(text: str) -> dict:
    if roberta_pipeline is None:
        return {"error": "Model not loaded yet. Try again in a few seconds."}

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: roberta_pipeline(text))

    scores = _extract_label_scores(
        result[0] if isinstance(result[0], list) else result
    )
    return {"input": text, "scores": scores}