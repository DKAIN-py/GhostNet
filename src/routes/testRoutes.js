import express from "express";
import { setSectorSignal, setActiveCityIncident } from "../store/memory.js";
import { emitAgentSignal, emitCityIncident } from "../socket/emitter.js";

export function createTestRouter(ioOrGetter) {
  const router = express.Router();
  const getIO = () => (typeof ioOrGetter === "function" ? ioOrGetter() : ioOrGetter);

  /**
   * GET & POST /test
   * Emits and stores a test agent-signal
   */
  const handleTestSignal = (req, res) => {
    const testSignal = {
      sectorId: "DEL_EAST_LN",
      district: "East Delhi",
      agentId: "smog_dispersion",
      domain: "environment",
      isLiveAnchor: true,
      healthScore: 24,
      anomalyLevel: "critical",
      signal: "AQI spike to 389 in East Delhi (Test)",
      location: {
        placeName: "Vikas Marg",
        lat: 28.6304,
        lng: 77.2777,
        radiusMeters: 500,
      },
      metrics: {
        pm25: 245,
        pm10: 380,
        aqi: 389,
        windSpeedKmh: 4,
        windDirectionDeg: 310,
        visibilityMeters: 600,
        stagnationIndex: 0.88,
      },
      diffusionForecast: {
        t1h_aqi: 410,
        t3h_aqi: 380,
        trend: "worsening",
      },
      timestamp: new Date().toISOString(),
    };

    setSectorSignal(testSignal);
    emitAgentSignal(getIO(), testSignal);

    return res.status(200).json({
      success: true,
      message: "Test agent-signal generated, stored, and broadcast successfully",
      signal: testSignal,
      data: testSignal,
      ...testSignal,
    });
  };

  router.get("/test", handleTestSignal);
  router.post("/test", handleTestSignal);

  /**
   * GET & POST /test-city-incident & /compute-city-incident
   * Emits and stores a full structured test city-incident matching CityCascadePanel schema
   */
  const handleTestCityIncident = (req, res) => {
    const testIncident = {
      incidentId: `CITY_INCIDENT_${Date.now()}`,
      citywideSeverity: "CRITICAL",
      citywideCascadeScore: 0.92,
      summary: "Severe monsoonal flash flooding in Central Delhi underpasses causing cross-district bus gridlock and local power transformer trips.",
      rootCauseDomain: "waterlogging_hydrology",
      affectedAreas: [
        {
          district: "Central Delhi",
          primarySectorId: "DEL_CENTRAL_CP",
          secondarySectors: ["DEL_CENTRAL_KB", "DEL_OLD_CHANDNI"],
          impactedDomains: ["waterlogging_hydrology", "transit_fleet", "power_grid"],
          affectedBy: {
            primaryThreat: "Minto Bridge Flash Inundation & Substation Tripping",
            description: "42cm standing water at underpass halting DTC routes and causing thermal overload on local distribution transformers.",
            metrics: {
              waterDepthCm: 42.0,
              busStationaryRatio: 0.78,
              gridLoadImpactPct: 91.2,
            },
          },
        },
        {
          district: "East Delhi",
          primarySectorId: "DEL_EAST_LN",
          secondarySectors: ["DEL_EAST_PV", "DEL_EAST_MV"],
          impactedDomains: ["smog_dispersion", "social_panic", "hospital_capacity"],
          affectedBy: {
            primaryThreat: "Severe PM2.5 Stagnation & Panic Surge",
            description: "Stagnant smog plume (382 AQI) combined with viral social panic driving respiratory ER admissions up sharply.",
            metrics: {
              aqi: 382,
              meanRoBERTaPanicScore: 0.842,
              icuOccupancyPct: 95.2,
            },
          },
        },
      ],
      mitigationMeasures: {
        immediateDirectives: [
          {
            action: "Activate high-capacity mobile dewatering pumps at Minto Bridge underpass.",
            targetAgency: "PWD / MCD",
            priority: "P1_CRITICAL",
          },
          {
            action: "Deploy additional traffic police to unsignaled junctions during power outage.",
            targetAgency: "Delhi Traffic Police",
            priority: "P1_CRITICAL",
          },
          {
            action: "Pre-position ambulances near LNJP Hospital for respiratory overflow.",
            targetAgency: "CATS Ambulance / Delhi Health Dept.",
            priority: "P2_HIGH",
          },
        ],
        trafficAndTransitRerouting: [
          {
            affectedCorridor: "Connaught Place Radial Roads & Minto Road",
            bypassRoute: "DDU Marg -> Deen Dayal Upadhyaya flyover bypass",
            transitAdjustment: "DTC Line 419 diverted via Barakhamba Road to avoid Minto underpass.",
          },
          {
            affectedCorridor: "Vikas Marg & Laxmi Nagar Metro Corridor",
            bypassRoute: "Nirman Vihar flyover alternate route",
            transitAdjustment: "Bus services rerouted away from low-visibility smog corridor.",
          },
        ],
        publicAdvisories: [
          {
            channel: "Delhi Traffic Police Twitter / RSS & FM Broadcast",
            headline: "AVOID Minto Bridge Underpass & Outer Circle CP",
            message: "Severe waterlogging at Minto Bridge. Use DDU Marg or Barakhamba Road for East-West movement.",
          },
          {
            channel: "DPCC Public Health Advisory",
            headline: "Severe Air Quality — East Delhi",
            message: "AQI at severe levels near Laxmi Nagar. Sensitive groups advised to remain indoors.",
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };

    setActiveCityIncident(testIncident);
    emitCityIncident(getIO(), testIncident);

    return res.status(200).json({
      success: true,
      message: "Test city-incident generated, stored, and broadcast successfully",
      incident: testIncident,
      cityIncident: testIncident,
      data: testIncident,
      ...testIncident,
    });
  };

  router.get("/test-city-incident", handleTestCityIncident);
  router.post("/test-city-incident", handleTestCityIncident);
  router.get("/compute-city-incident", handleTestCityIncident);
  router.post("/compute-city-incident", handleTestCityIncident);

  return router;
}
