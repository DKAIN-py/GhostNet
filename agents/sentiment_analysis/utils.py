# Package imports
from transformers import pipeline as hf_pipeline
from Scweet import Scweet
import logging
import random

# Module imports
from .config import (TWITTER_AUTH_TOKEN, MAX_TWEETS_PER_CYCLE, HAZARD_KEYWORDS)

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("autonet.sentiment")


def load_roberta_pipeline():
    
    model_id = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    log.info("Loading RoBERTa sentiment model: %s", model_id)
    log.info("First run will download ~500MB model weights. Subsequent runs use cache.")

    nlp = hf_pipeline(
        task            = "sentiment-analysis",
        model           = model_id,
        tokenizer       = model_id,
        top_k           = None,       
        truncation      = True,       
        max_length      = 514,
    )

    log.info("✓ RoBERTa tensor graph allocated. Model ready for inference.")
    return nlp


def load_scweet_scraper():
   
    if not TWITTER_AUTH_TOKEN:
        log.warning(
            "TWITTER_AUTH_TOKEN is not set. "
            "Export it: export TWITTER_AUTH_TOKEN=your_token_here"
        )
        return None

    log.info("Initializing Scweet browser session...")
    scraper = Scweet(auth_token=TWITTER_AUTH_TOKEN)
    log.info("✓ Scweet session established.")
    return scraper


def _extract_label_scores(raw_output: list[dict]) -> dict[str, float]:
    return {item["label"].lower(): item["score"] for item in raw_output}


def evaluate_live_tweets(tweets: list, roberta: callable) -> tuple[int, str, str]:
    if not tweets:
        log.warning("No tweets returned by scraper — using nominal fallback.")
        return (88, "nominal", "No tweets scraped this cycle — baseline holding.")

    analyzed         = 0
    negative_scores  = []
    crisis_triggers  = 0
    sample_texts     = []   

    for tweet in tweets[:MAX_TWEETS_PER_CYCLE]:
        text = tweet.get("text") or tweet.get("Tweet") or ""
        text = text.strip()

        if not text:
            continue

        try:
            raw_scores = roberta(text)
            scores = _extract_label_scores(
                raw_scores[0] if isinstance(raw_scores[0], list) else raw_scores
            )
        except Exception as exc:
            log.warning("RoBERTa inference failed on tweet: %s — skipping. Error: %s", text[:60], exc)
            continue

        neg_score = scores.get("negative", 0.0)
        negative_scores.append(neg_score)
        analyzed += 1

        text_lower = text.lower()
        has_hazard_keyword = any(kw in text_lower for kw in HAZARD_KEYWORDS)

        if neg_score > 0.5 and has_hazard_keyword:
            crisis_triggers += 1
            log.info(
                "Crisis trigger #%d detected → neg_score=%.2f | text: %s",
                crisis_triggers, neg_score, text[:80]
            )

        sample_texts.append(text[:60])

    if not negative_scores:
        return (88, "nominal", "Tweets scraped but inference yielded no results.")

    mean_negative = sum(negative_scores) / len(negative_scores)

    log.info(
        "Sentiment batch → analyzed=%d | mean_negative=%.3f | triggers=%d",
        analyzed, mean_negative, crisis_triggers
    )
    if crisis_triggers >= 2 or mean_negative > 0.70:
        health_score  = random.randint(15, 35)   
        anomaly_level = "critical"
        signal = (
            f"CRISIS DETECTED — {crisis_triggers} environmental triggers in "
            f"{analyzed} tweets. Mean negative confidence: {mean_negative:.2f}. "
            f"Sample: \"{sample_texts[0]}...\""
        )

    elif crisis_triggers >= 1 or mean_negative > 0.40:
        health_score  = random.randint(40, 65)  
        anomaly_level = "warning"
        signal = (
            f"Elevated negativity detected — {crisis_triggers} trigger(s) matched. "
            f"Mean negative confidence: {mean_negative:.2f} across {analyzed} tweets."
        )

    else:
        health_score  = random.randint(85, 95)   
        anomaly_level = "nominal"
        signal = (
            f"Sentiment baseline stable — mean negative confidence: {mean_negative:.2f} "
            f"across {analyzed} tweets. No crisis keywords triggered."
        )

    return (health_score, anomaly_level, signal)
