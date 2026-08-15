from typing import Any, Dict, List


class SocialPanicModel:
    """Pure mathematical model evaluating social panic sentiment, virality, and cross-sector propagation."""

    @staticmethod
    def evaluate_panic(
        processed_posts_per_min: int,
        mean_roberta_panic_score: float,
        negative_sentiment_pct: float,
        keyword_velocity_ratio: float,
        viral_post_count: int,
    ) -> Dict[str, Any]:
        """Calculates normalized health score, panic propagation velocity, and perceived crisis severity."""

        # 1. Perceived Crisis Severity
        if mean_roberta_panic_score >= 0.80 or keyword_velocity_ratio >= 5.0 or viral_post_count >= 10:
            severity = "CRITICAL"
        elif mean_roberta_panic_score >= 0.60 or keyword_velocity_ratio >= 3.0 or viral_post_count >= 5:
            severity = "HIGH"
        elif mean_roberta_panic_score >= 0.40 or keyword_velocity_ratio >= 1.8:
            severity = "ELEVATED"
        else:
            severity = "NOMINAL"

        # 2. Panic Propagation Velocity Trend
        if keyword_velocity_ratio >= 4.0 and mean_roberta_panic_score >= 0.70:
            propagation = "EXPONENTIAL"
        elif keyword_velocity_ratio >= 2.0:
            propagation = "LINEAR"
        else:
            propagation = "STABLE"

        # 3. Misinformation Risk Index
        if viral_post_count >= 12 and negative_sentiment_pct >= 80.0:
            misinfo_risk = "HIGH"
        elif viral_post_count >= 5 or negative_sentiment_pct >= 65.0:
            misinfo_risk = "MEDIUM"
        else:
            misinfo_risk = "LOW"

        # 4. Calculate Health Score [0 = Critical, 100 = Optimal]
        # Base score degrades as RoBERTa panic score increases (0.0 = calm, 1.0 = panic)
        panic_penalty = mean_roberta_panic_score * 50.0
        sentiment_penalty = (negative_sentiment_pct / 100.0) * 20.0
        velocity_penalty = min(20.0, max(0.0, (keyword_velocity_ratio - 1.0) * 4.0))
        virality_penalty = min(10.0, viral_post_count * 0.8)

        raw_health_score = 100.0 - panic_penalty - sentiment_penalty - velocity_penalty - virality_penalty
        health_score = max(0, min(100, int(raw_health_score)))

        # 5. Anomaly Level Determination
        if health_score < 30 or severity == "CRITICAL":
            anomaly_level = "critical"
        elif health_score < 70 or severity in ("HIGH", "ELEVATED"):
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        return {
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "perceivedCrisisSeverity": severity,
            "panicPropagationVelocity": propagation,
            "misinformationRiskIndex": misinfo_risk,
        }