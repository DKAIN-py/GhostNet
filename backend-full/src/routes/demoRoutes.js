import express from "express";
import { validateAgentSignal, AGENT_REGISTRY } from "../agents/registry.js";
import { SECTOR_BY_ID, SECTORS } from "../lib/sectors.js";
import { emitDataIntegrity } from "../socket/emitter.js";

export function createDemoRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * POST /api/demo/data-integrity
   * Controlled Data Integrity demonstration endpoint.
   * Constructs an intentionally malformed telemetry record, evaluates it through the
   * existing validateAgentSignal validator, confirms rejection without mutating live state,
   * and emits the 'data-integrity' event via Socket.IO.
   */
  const handleDataIntegrityDemo = (req, res) => {
    // Safety check for production environment
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_ENDPOINTS !== "true") {
      return res.status(403).json({
        error: "Forbidden",
        statusCode: 403,
        message: "Demo endpoints are disabled in production environment.",
      });
    }

    const {
      type = "incomplete",
      agentId = "smog_dispersion",
      sectorId = "DEL_EAST_LN",
    } = req.body || {};

    const validTypes = ["incomplete", "invalid", "inconsistent"];
    const normalizedType = validTypes.includes(type) ? type : "incomplete";

    const sectorMeta = SECTOR_BY_ID[sectorId] || SECTORS[0];
    const resolvedSectorId = sectorMeta.sectorId;
    const resolvedDistrict = sectorMeta.district || "East Delhi";
    const resolvedPlaceName = sectorMeta.name || "Vikas Marg";
    const agentDef = AGENT_REGISTRY[agentId] || AGENT_REGISTRY["smog_dispersion"];
    const resolvedAgentId = agentDef.agentId;
    const resolvedDomain = agentDef.domain;

    let malformedSignal;

    switch (normalizedType) {
      case "invalid":
        // Invalid: healthScore out of range (>100) and metric type violation
        malformedSignal = {
          sectorId: resolvedSectorId,
          district: resolvedDistrict,
          agentId: resolvedAgentId,
          domain: resolvedDomain,
          isLiveAnchor: true,
          healthScore: 145, // Invalid: must be 0-100
          anomalyLevel: "critical",
          signal: `Invalid metric range detected for ${resolvedAgentId}`,
          location: {
            placeName: resolvedPlaceName,
            lat: sectorMeta.lat || 28.6304,
            lng: sectorMeta.lng || 77.2777,
            radiusMeters: 500,
          },
          metrics: {
            pm25: "invalid_string_val", // Type violation
            pm10: 380,
            aqi: 389,
            windSpeedKmh: 4,
            windDirectionDeg: 310,
            visibilityMeters: 600,
            stagnationIndex: 0.88,
          },
          timestamp: new Date().toISOString(),
        };
        break;

      case "inconsistent":
        // Inconsistent: Domain mismatch with agent registry
        const conflictingDomain = resolvedDomain === "transit" ? "environment" : "transit";
        malformedSignal = {
          sectorId: resolvedSectorId,
          district: resolvedDistrict,
          agentId: resolvedAgentId,
          domain: conflictingDomain, // Inconsistent domain mismatch
          isLiveAnchor: true,
          healthScore: 20,
          anomalyLevel: "critical",
          signal: `Domain mismatch telemetry for ${resolvedAgentId}`,
          location: {
            placeName: resolvedPlaceName,
            lat: sectorMeta.lat || 28.6304,
            lng: sectorMeta.lng || 77.2777,
            radiusMeters: 500,
          },
          metrics: {
            // Empty metrics
          },
          timestamp: new Date().toISOString(),
        };
        break;

      case "incomplete":
      default:
        // Incomplete: Missing required fields (domain, healthScore, location, metrics, timestamp)
        malformedSignal = {
          sectorId: resolvedSectorId,
          agentId: resolvedAgentId,
          // Intentionally missing domain, district, isLiveAnchor, healthScore, location, metrics, timestamp
        };
        break;
    }

    // Pass through THE SAME EXISTING VALIDATION PATH
    const validation = validateAgentSignal(malformedSignal);

    // Verify rejection
    if (validation.valid) {
      return res.status(500).json({
        error: "InternalError",
        message: "Failed to construct an invalid demo signal",
      });
    }

    // Construct exact data-integrity event payload
    const primaryReason = validation.errors[0] || "Telemetry record failed integrity validation";
    const dataIntegrityPayload = {
      status: "degraded",
      type: normalizedType,
      sectorId: resolvedSectorId,
      agentId: resolvedAgentId,
      reason: primaryReason,
      timestamp: new Date().toISOString(),
    };

    // Emit data-integrity via Socket.IO (DO NOT emit agent-signal)
    emitDataIntegrity(getIO(), dataIntegrityPayload);

    return res.status(200).json({
      success: true,
      rejected: true,
      demoType: normalizedType,
      reason: primaryReason,
      validationErrors: validation.errors,
      malformedSignal,
      dataIntegrityEvent: dataIntegrityPayload,
    });
  };

  router.post("/api/demo/data-integrity", handleDataIntegrityDemo);
  router.get("/api/demo/data-integrity", handleDataIntegrityDemo);

  return router;
}
