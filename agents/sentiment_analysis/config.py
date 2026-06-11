from dotenv import load_dotenv
import os

load_dotenv()

# Extract from your browser's x.com cookies → Application → Cookies → auth_token
TWITTER_AUTH_TOKEN: str | None = os.getenv("TWITTER_AUTH_TOKEN")

# GHOSTNET Node.js ingest endpoint
NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL")

# Search query for live tweet ingestion
SEARCH_QUERY: str = os.getenv("SEARCH_QUERY", "Delhi pollution")

# Poll interval in seconds
POLL_INTERVAL_SECONDS: int = 60

# Max tweets to analyze per cycle (cost vs. signal tradeoff)
MAX_TWEETS_PER_CYCLE: int = 5

# Regional hazard keywords for crisis trigger matching
HAZARD_KEYWORDS: frozenset[str] = frozenset({
    "smog", "choking", "burning", "throat",
    "air", "visibility", "cough", "smoke",
    "breathe", "lungs", "aqi", "pollution",
})