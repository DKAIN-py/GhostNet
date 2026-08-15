import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import httpx
import socketio

from Agents.BaseAgent import BaseAgent
from config.sector_config import SectorConfig
from .panic_model import SocialPanicModel
from .social_data_fetcher import SocialDataFetcher
from Cascade_Engine.sector_state_store import SectorStateStore

log = logging.getLogger("autonet.agent.social_panic")


class GenericSocialPanicAgent(BaseAgent):
    """
    Agent 11: Public Panic NLP Agent (social_panic)
    Scrapes geolocated social posts and runs NLP inference to detect negative sentiment,
    panic keyword velocity, and cross-sector crisis propagation.
    """

    def __init__(
        self,
        config: SectorConfig,
        sio: socketio.AsyncClient,
        store: SectorStateStore,
        poll_interval: int = 35,
    ) -> None:
        self.config = config
        self.sio = sio
        self.poll_interval = poll_interval
        self.agent_id = "social_panic"
        self.domain = "civic"
        self.store = store

        self._http_client: httpx.AsyncClient | None = None
        self._loop_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("[%s] SocialPanicAgent active for %s", self.config.sector_id, self.config.name)

    async def stop(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        if self._http_client:
            await self._http_client.aclose()

    async def _run_loop(self) -> None:
        # Domain phase offset + sector jitter (Civic domain offset)
        domain_base_delay = 24.0
        sector_jitter = (hash(f"{self.config.sector_id}_{self.agent_id}") % 250) / 10.0
        await asyncio.sleep(domain_base_delay + sector_jitter)

        while True:
            try:
                await self.step()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.exception("[%s] Iteration error: %s", self.config.sector_id, exc)

            await asyncio.sleep(self.poll_interval)

    async def step(self) -> Dict[str, Any] | None:
        """Executes one iteration: Fetch Posts -> Evaluate NLP Model -> Construct Payload -> Emit Socket."""
        if not self._http_client:
            return None

        # 1. Fetch Social Telemetry
        data = await SocialDataFetcher.fetch_social_metrics(
            client=self._http_client,
            sector_id=self.config.sector_id,
            is_live_anchor=self.config.is_live_anchor,
        )

        posts_per_min = data["processedPostsPerMin"]
        panic_score = data["meanRoBERTaPanicScore"]
        neg_sentiment_pct = data["negativeSentimentPct"]
        velocity_ratio = data["keywordVelocityRatio"]
        top_keywords = data["topKeywords"]
        viral_count = data["viralPostCount"]

        # 2. Derive Math & Anomaly Evaluation
        eval_metrics = SocialPanicModel.evaluate_panic(
            processed_posts_per_min=posts_per_min,
            mean_roberta_panic_score=panic_score,
            negative_sentiment_pct=neg_sentiment_pct,
            keyword_velocity_ratio=velocity_ratio,
            viral_post_count=viral_count,
        )

        # Determine downstream spillover targets (e.g., from Laxmi Nagar to Preet Vihar / Mayur Vihar)
        upstream_id = getattr(self.config, "upstream_sector_id", "DEL_EAST_PV")
        downstream_targets = [upstream_id, "DEL_EAST_MV"] if self.config.district == "East Delhi" else ["DEL_CENTRAL_CP"]

        # 3. Construct Payload adhering strictly to SOCIAL_PANIC_SCHEMA
        payload = {
            "sectorId": self.config.sector_id,
            "district": self.config.district,
            "agentId": self.agent_id,
            "domain": self.domain,
            "healthScore": eval_metrics["healthScore"],
            "anomalyLevel": eval_metrics["anomalyLevel"],
            "metricValue": f"{panic_score} RoBERTa Panic Score",
            "signal": (
                f"Social Panic Surge: RoBERTa panic score {panic_score} ({velocity_ratio}x keyword velocity). "
                f"Virality spiking around '{top_keywords[0]}' and '{top_keywords[1]}'."
                if eval_metrics["anomalyLevel"] == "critical"
                else f"Public social sentiment nominal in {self.config.name} (Panic Score: {panic_score})."
            ),
            "isLiveAnchor": self.config.is_live_anchor,
            "location": {
                "placeName": f"{self.config.name} Transit & Commercial Corridor",
                "lat": self.config.lat,
                "lng": self.config.lng,
                "radiusMeters": 750,
            },
            "metrics": {
                "processedPostsPerMin": posts_per_min,
                "meanRoBERTaPanicScore": panic_score,
                "negativeSentimentPct": neg_sentiment_pct,
                "keywordVelocityRatio": velocity_ratio,
                "topKeywords": top_keywords,
                "viralPostCount": viral_count,
            },
            "panicForecast": {
                "perceivedCrisisSeverity": eval_metrics["perceivedCrisisSeverity"],
                "panicPropagationVelocity": eval_metrics["panicPropagationVelocity"],
                "misinformationRiskIndex": eval_metrics["misinformationRiskIndex"],
                "publicCivicDistressTarget": downstream_targets,
            },
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        record = await self.store.update_signal(payload)
        # 4. Dispatch Signal via Socket.io
        try:
            if self.sio.connected:
                await self.sio.emit("agent-signal", payload)
            else:
                log.warning("[%s] Socket.io disconnected, dropping social panic signal", self.config.sector_id)
        except Exception as e:
            log.error("[%s] Social panic socket emit error: %s", self.config.sector_id, e)

        return payload