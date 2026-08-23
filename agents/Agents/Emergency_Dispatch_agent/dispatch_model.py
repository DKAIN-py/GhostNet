from typing import Any, Dict


class DispatchKinematicsModel:
    """Pure mathematical model evaluating 112 call velocity, response latency, and responder exhaustion."""

    @staticmethod
    def evaluate_dispatch(
        call_volume_per_min: int,
        baseline_call_volume_min: int,
        active_dispatches: int,
        avg_response_time_mins: float,
        dispatch_queue_backlog: int,
    ) -> Dict[str, Any]:
        """Evaluates emergency call kinematics, surge multiplier, and responder strain."""

        baseline_safe = max(1, baseline_call_volume_min)

        # 1. Calculate Velocity Surge Multiplier Ratio
        surge_ratio = round(call_volume_per_min / baseline_safe, 2)

        # 2. Estimate Predicted Response Time for New Calls (Mins)
        backlog_delay = dispatch_queue_backlog * 0.7
        predicted_response_time = round(avg_response_time_mins + backlog_delay, 1)

        # 3. Determine First-Responder Exhaustion Level
        if dispatch_queue_backlog > 10 or surge_ratio >= 4.5:
            exhaustion = "HIGH"
        elif dispatch_queue_backlog > 15 or surge_ratio >= 6.0:
            exhaustion = "CRITICAL"
        elif dispatch_queue_backlog > 4 or surge_ratio >= 2.5:
            exhaustion = "MEDIUM"
        else:
            exhaustion = "LOW"

        # 4. Calculate Health Score [0 = Critical, 100 = Optimal]
        # Base score from surge velocity
        if surge_ratio <= 1.2:
            base_score = 100.0
        else:
            base_score = max(0.0, 100.0 - ((surge_ratio - 1.0) * 15.0))

        # Penalties for operational backlogs and delayed response times
        queue_penalty = min(30.0, dispatch_queue_backlog * 2.5)
        latency_penalty = min(25.0, max(0.0, avg_response_time_mins - 10.0) * 2.0)

        raw_health_score = base_score - queue_penalty - latency_penalty
        health_score = max(0, min(100, int(raw_health_score)))

        # 5. Determine Anomaly Level
        if health_score < 30 or surge_ratio >= 4.0 or dispatch_queue_backlog >= 10:
            anomaly_level = "critical"
        elif health_score < 70 or surge_ratio >= 2.0 or dispatch_queue_backlog >= 4:
            anomaly_level = "warning"
        else:
            anomaly_level = "nominal"

        return {
            "callVelocitySpikeRatio": surge_ratio,
            "healthScore": health_score,
            "anomalyLevel": anomaly_level,
            "firstResponderExhaustion": exhaustion,
            "predictedResponseTime": predicted_response_time,
        }