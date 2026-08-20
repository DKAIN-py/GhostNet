import http from "http";
import assert from "assert";
import { describe, it, before, after, beforeEach } from "node:test";
import { Server as SocketIOServer } from "socket.io";
import { io as ClientIO } from "socket.io-client";
import { createApp } from "../app.js";
import { registerSocketHandlers } from "../src/socket/handlers.js";
import {
  memoryStore,
  sectors,
  activeCascades,
  cascadeHistory,
  activeCityIncident,
  agentComms,
  resetMemoryStore
} from "../src/store/memory.js";

const TEST_PORT = 3199;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("GHOSTNET Phase 1 Backend Acceptance Tests", () => {
  let server;
  let ioServer;
  let clientSocket;

  before(async () => {
    let ioInstance = null;
    const app = createApp(() => ioInstance);

    server = http.createServer(app);
    ioServer = new SocketIOServer(server, {
      cors: { origin: "*" },
      allowEIO3: true,
      transports: ["polling", "websocket"],
    });
    ioInstance = ioServer;

    ioServer.on("connection", (socket) => {
      registerSocketHandlers(ioServer, socket);
    });

    await new Promise((resolve) => {
      server.listen(TEST_PORT, "127.0.0.1", resolve);
    });

    // Connect client socket
    clientSocket = ClientIO(SERVER_URL, {
      transports: ["polling", "websocket"],
      forceNew: true,
    });

    await new Promise((resolve) => {
      clientSocket.on("connect", resolve);
    });
  });

  after(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (ioServer) {
      ioServer.close();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetMemoryStore();
  });

  // Helper for HTTP requests
  async function postJson(endpoint, data) {
    const res = await fetch(`${SERVER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function getJson(endpoint) {
    const res = await fetch(`${SERVER_URL}${endpoint}`);
    const body = await res.json();
    return { status: res.status, body };
  }

  // Helper to wait for Socket event
  function waitForSocketEvent(eventName, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        clientSocket.off(eventName, handler);
        reject(new Error(`Timed out waiting for socket event: ${eventName}`));
      }, timeoutMs);

      const handler = (payload) => {
        clearTimeout(timer);
        clientSocket.off(eventName, handler);
        resolve(payload);
      };

      clientSocket.on(eventName, handler);
    });
  }

  // Helper to verify NO socket event is fired
  function assertNoSocketEvent(eventName, durationMs = 300) {
    return new Promise((resolve, reject) => {
      const handler = (payload) => {
        clientSocket.off(eventName, handler);
        reject(new Error(`Unexpected socket event received: ${eventName}`));
      };

      clientSocket.on(eventName, handler);

      setTimeout(() => {
        clientSocket.off(eventName, handler);
        resolve();
      }, durationMs);
    });
  }

  it("1. Accepts valid POST /agent-signal, stores in memory, and fires 'agent-signal' unmodified", async () => {
    const validSignal = {
      sectorId: "DEL_EAST_LN",
      district: "East Delhi",
      agentId: "smog_dispersion",
      domain: "environment",
      isLiveAnchor: true,
      healthScore: 24,
      anomalyLevel: "critical",
      signal: "AQI spike to 389 in East Delhi",
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
      timestamp: "2026-08-19T12:00:00Z",
    };

    const socketPromise = waitForSocketEvent("agent-signal");
    const { status, body } = await postJson("/agent-signal", validSignal);

    assert.strictEqual(status, 200);
    assert.strictEqual(body.success, true);

    // Verify stored in memory
    const stored = sectors.get("DEL_EAST_LN")?.get("smog_dispersion");
    assert.ok(stored, "Signal must be stored in memory store");
    assert.deepStrictEqual(stored, validSignal);

    // Verify Socket.io event payload
    const emitted = await socketPromise;
    assert.deepStrictEqual(emitted, validSignal, "Emitted payload must be unmodified");
  });

  it("2. Accepts valid POST /cascade-alert, stores in memory, and fires 'cascade-alert' unmodified", async () => {
    const validCascade = {
      alertId: "ALT_2026_0819_1001",
      primarySectorId: "DEL_EAST_LN",
      primarySectorName: "Laxmi Nagar",
      district: "East Delhi",
      cascadeScore: 0.82,
      confidence: 91,
      predictedEvent: "Severe smog stagnation with transport slowdown",
      hoursUntil: 1.0,
      spatialSpread: ["DEL_EAST_PP", "DEL_NORTH_ISBT"],
      triggeredAgents: ["smog_dispersion", "transit_fleet"],
      recommendations: [
        "Speed reduction on Vikas Marg",
        "Deploy smog guns at Laxmi Nagar",
      ],
      timestamp: "2026-08-19T13:17:00Z",
    };

    const socketPromise = waitForSocketEvent("cascade-alert");
    const { status, body } = await postJson("/cascade-alert", validCascade);

    assert.strictEqual(status, 200);
    assert.strictEqual(body.success, true);

    // Verify stored in memory
    const stored = activeCascades.get("DEL_EAST_LN");
    assert.ok(stored, "Cascade must be stored in activeCascades");
    assert.deepStrictEqual(stored, validCascade);
    assert.strictEqual(cascadeHistory.length, 1);

    // Verify Socket.io event payload
    const emitted = await socketPromise;
    assert.deepStrictEqual(emitted, validCascade, "Emitted payload must be unmodified");
  });

  it("3. Accepts valid POST /agent-comms, stores in memory, and fires 'agent-comms' unmodified", async () => {
    const validComms = {
      from: "smog_dispersion",
      to: "transit_fleet",
      message: "Visibility below 450m in East Delhi, flagging speed reduction",
      timestamp: "2026-08-19T13:18:00Z",
    };

    const socketPromise = waitForSocketEvent("agent-comms");
    const { status, body } = await postJson("/agent-comms", validComms);

    assert.strictEqual(status, 200);
    assert.strictEqual(body.success, true);

    // Verify stored in memory
    assert.strictEqual(agentComms.length, 1);
    assert.deepStrictEqual(agentComms[0], validComms);

    // Verify Socket.io event payload
    const emitted = await socketPromise;
    assert.deepStrictEqual(emitted, validComms, "Emitted payload must be unmodified");
  });

  it("4. Rejects malformed POST /agent-signal (missing metric & wrong type) with 400, never touches store, never emits", async () => {
    // Case A: Missing required metric 'aqi'
    const missingMetric = {
      sectorId: "DEL_EAST_LN",
      district: "East Delhi",
      agentId: "smog_dispersion",
      domain: "environment",
      isLiveAnchor: true,
      healthScore: 24,
      anomalyLevel: "critical",
      signal: "AQI spike",
      location: { placeName: "Vikas Marg", lat: 28.6304, lng: 77.2777, radiusMeters: 500 },
      metrics: {
        pm25: 245,
        pm10: 380,
        // aqi is missing
        windSpeedKmh: 4,
        windDirectionDeg: 310,
        visibilityMeters: 600,
        stagnationIndex: 0.88,
      },
      timestamp: "2026-08-19T12:00:00Z",
    };

    const noEventPromiseA = assertNoSocketEvent("agent-signal");
    const resA = await postJson("/agent-signal", missingMetric);
    await noEventPromiseA;

    assert.strictEqual(resA.status, 400);
    assert.strictEqual(resA.body.error, "ValidationError");
    assert.strictEqual(sectors.size, 0, "Store must not be mutated on validation failure");

    // Case B: Wrong type in metric ('pm25' is string instead of number)
    const wrongTypeMetric = {
      ...missingMetric,
      metrics: {
        ...missingMetric.metrics,
        aqi: 389,
        pm25: "not_a_number", // wrong type
      },
    };

    const noEventPromiseB = assertNoSocketEvent("agent-signal");
    const resB = await postJson("/agent-signal", wrongTypeMetric);
    await noEventPromiseB;

    assert.strictEqual(resB.status, 400);
    assert.strictEqual(resB.body.error, "ValidationError");
    assert.strictEqual(sectors.size, 0, "Store must not be mutated on validation failure");
  });

  it("5. Rejects malformed POST /cascade-alert (missing fields) with 400, never touches store, never emits", async () => {
    const malformedCascade = {
      alertId: "ALT_INVALID",
      primarySectorId: "DEL_EAST_LN",
      // missing primarySectorName, cascadeScore, confidence, etc.
      district: "East Delhi",
      timestamp: "2026-08-19T13:17:00Z",
    };

    const noEventPromise = assertNoSocketEvent("cascade-alert");
    const res = await postJson("/cascade-alert", malformedCascade);
    await noEventPromise;

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "ValidationError");
    assert.strictEqual(activeCascades.size, 0, "activeCascades must remain empty");
    assert.strictEqual(cascadeHistory.length, 0, "cascadeHistory must remain empty");
  });

  it("6. Rejects malformed POST /agent-comms (missing 'from' and 'message') with 400, never touches store, never emits", async () => {
    const malformedComms = {
      to: "transit_fleet",
      timestamp: "2026-08-19T13:18:00Z",
    };

    const noEventPromise = assertNoSocketEvent("agent-comms");
    const res = await postJson("/agent-comms", malformedComms);
    await noEventPromise;

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "ValidationError");
    assert.strictEqual(agentComms.length, 0, "agentComms buffer must remain empty");
  });

  it("7. Handles POST /city-incident and POST /city-incident-clear lifecycle with Socket.io relay", async () => {
    const validIncident = {
      incidentId: "inc-20260819-001",
      citywideSeverity: "CRITICAL",
      citywideCascadeScore: 92.0,
      summary: "Multi-sector infrastructure cascade across East Delhi",
      affectedAreas: ["East Delhi", "Central Delhi"],
      rootCauseDomain: "environment",
      mitigationMeasures: ["Deploy smog guns", "Speed reduction on Vikas Marg"],
      timestamp: "2026-08-19T21:28:56.000Z",
    };

    const incidentSocketPromise = waitForSocketEvent("city-incident");
    const resInc = await postJson("/city-incident", validIncident);

    assert.strictEqual(resInc.status, 200);
    assert.deepStrictEqual(activeCityIncident.current, validIncident);

    const emittedInc = await incidentSocketPromise;
    assert.deepStrictEqual(emittedInc, validIncident);

    // Clear incident
    const clearSocketPromise = waitForSocketEvent("city-incident-clear");
    const resClear = await postJson("/city-incident-clear", {
      incidentId: "inc-20260819-001",
      timestamp: "2026-08-19T22:00:00.000Z",
    });

    assert.strictEqual(resClear.status, 200);
    assert.strictEqual(activeCityIncident.current, null);

    const emittedClear = await clearSocketPromise;
    assert.strictEqual(emittedClear.incidentId, "inc-20260819-001");
  });

  it("8. Validates GET /sectors/state, GET /sectors/state/:sectorId, and GET /history", async () => {
    // Seed one signal
    await postJson("/agent-signal", {
      sectorId: "DEL_EAST_LN",
      district: "East Delhi",
      agentId: "smog_dispersion",
      domain: "environment",
      isLiveAnchor: true,
      healthScore: 50,
      anomalyLevel: "nominal",
      signal: "Normal",
      location: { placeName: "Laxmi Nagar", lat: 28.6304, lng: 77.2777, radiusMeters: 500 },
      metrics: {
        pm25: 50, pm10: 80, aqi: 90, windSpeedKmh: 10, windDirectionDeg: 180, visibilityMeters: 2000, stagnationIndex: 0.2
      },
      timestamp: "2026-08-19T12:00:00Z",
    });

    // Test GET /sectors/state
    const stateRes = await getJson("/sectors/state");
    assert.strictEqual(stateRes.status, 200);
    assert.ok(Array.isArray(stateRes.body.sectors));
    assert.strictEqual(stateRes.body.sectors.length, 39);

    // Test GET /sectors/state/:sectorId
    const singleRes = await getJson("/sectors/state/DEL_EAST_LN");
    assert.strictEqual(singleRes.status, 200);
    assert.strictEqual(singleRes.body.sectorId, "DEL_EAST_LN");
    assert.strictEqual(singleRes.body.signals.length, 1);

    // Test GET /history
    const historyRes = await getJson("/history");
    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.body.history));
  });

  it("9. Ingests 'agent-signal' via WebSocket from Python AI service, validates, stores in memory, and broadcasts to other clients", async () => {
    // Connect a second client representing the frontend listener
    const frontendSocket = ClientIO(SERVER_URL, {
      transports: ["polling", "websocket"],
      forceNew: true,
    });

    await new Promise((resolve) => frontendSocket.on("connect", resolve));

    const pythonSignal = {
      sectorId: "DEL_NORTH_ISBT",
      district: "North Delhi",
      agentId: "transit_fleet",
      domain: "transit",
      isLiveAnchor: true,
      healthScore: 30,
      anomalyLevel: "warning",
      signal: "Bus corridor congestion near ISBT",
      location: {
        placeName: "ISBT Kashmere Gate",
        lat: 28.6692,
        lng: 77.2312,
        radiusMeters: 400,
      },
      metrics: {
        totalActiveBuses: 45,
        stoppedBuses: 18,
        stationaryRatio: 0.40,
        avgFleetSpeedMps: 3.2,
        affectedRouteCount: 6,
        topChokeRoute: "Route 108",
      },
      bottleneckForecast: {
        congestionDurationMins: 45,
      },
      timestamp: "2026-08-19T14:00:00Z",
    };

    // Frontend socket listens for broadcast
    const broadcastPromise = new Promise((resolve) => {
      frontendSocket.on("agent-signal", (data) => resolve(data));
    });

    // Python socket emits with acknowledgment callback
    const ack = await new Promise((resolve) => {
      clientSocket.emit("agent-signal", pythonSignal, (response) => {
        resolve(response);
      });
    });

    assert.strictEqual(ack.success, true);

    // Verify stored in memory
    const stored = sectors.get("DEL_NORTH_ISBT")?.get("transit_fleet");
    assert.ok(stored, "Signal sent via WebSocket must be stored in memory");
    assert.deepStrictEqual(stored, pythonSignal);

    // Verify frontend received broadcast
    const broadcasted = await broadcastPromise;
    assert.deepStrictEqual(broadcasted, pythonSignal);

    frontendSocket.disconnect();
  });

  it("10. Rejects invalid 'agent-signal' via WebSocket from Python AI service without mutating store or broadcasting", async () => {
    const invalidSignal = {
      sectorId: "DEL_NORTH_ISBT",
      agentId: "transit_fleet",
      // missing required fields & invalid metrics
      timestamp: "2026-08-19T14:00:00Z",
    };

    const ack = await new Promise((resolve) => {
      clientSocket.emit("agent-signal", invalidSignal, (response) => {
        resolve(response);
      });
    });

    assert.strictEqual(ack.success, false);
    assert.strictEqual(ack.error, "ValidationError");
    assert.strictEqual(sectors.size, 0, "Memory store must not be mutated on failed socket validation");
  });
});
