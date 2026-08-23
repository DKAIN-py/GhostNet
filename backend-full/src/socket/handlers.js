import { SOCKET_EVENTS } from "../lib/constants.js";
import {
  validateAgentSignal,
  validateCascadeAlert,
  normalizeCascadeAlert,
  validateCascadeClear,
  validateAgentComms,
  validateCityIncident,
  validateCityIncidentClear,
} from "../agents/registry.js";
import {
  setSectorSignal,
  setActiveCascade,
  clearActiveCascade,
  addAgentComm,
  setActiveCityIncident,
  clearActiveCityIncident,
  getActiveCityIncident,
} from "../store/memory.js";

function parsePayload(payload) {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch (e) {
      return payload;
    }
  }
  return payload;
}

let signalCount = 0;

/**
 * Registers WebSocket handlers for upstream Python / AI service and downstream clients.
 * Validates incoming socket payloads before mutating the store and broadcasting.
 */
export function registerSocketHandlers(io, socket) {
  // 1. Agent Signal via WebSocket (kebab-case, snake_case, camelCase)
  const handleAgentSignal = (rawPayload, callback) => {
    const payload = parsePayload(rawPayload);
    const validation = validateAgentSignal(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on '${SOCKET_EVENTS.AGENT_SIGNAL}':`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    signalCount++;
    // console.log(
    //   `[#${signalCount}/468]`
    // );

    setSectorSignal(payload);
    socket.broadcast.emit(SOCKET_EVENTS.AGENT_SIGNAL, payload);
    // console.log(`[SIGNAL EMIT] Broadcast [agent-signal] for sector ${payload.sectorId} (${payload.agentId}) to clients`);

    if (signalCount >= 468) {
      console.log(`🔄Cycle finished`);
      signalCount = 0;
    }

    if (typeof callback === "function") {
      callback({ success: true, message: "Agent signal processed and broadcast successfully" });
    }
  };

  socket.on(SOCKET_EVENTS.AGENT_SIGNAL, handleAgentSignal);
  socket.on("agent_signal", handleAgentSignal);
  socket.on("agentSignal", handleAgentSignal);

  // 2. Cascade Alert via WebSocket (kebab-case, snake_case, camelCase)
  const handleCascadeAlert = (rawPayload, callback) => {
    let payload = parsePayload(rawPayload);
    payload = normalizeCascadeAlert(payload);
    const validation = validateCascadeAlert(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on '${SOCKET_EVENTS.CASCADE_ALERT}':`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    console.log(`[SECTOR CASCADE]`);
    setActiveCascade(payload);
    socket.broadcast.emit(SOCKET_EVENTS.CASCADE_ALERT, payload);
    // console.log(`[CASCADE EMIT] Broadcast [cascade-alert] for sector ${payload.primarySectorId} (${payload.alertId}) to clients`);

    if (typeof callback === "function") {
      callback({ success: true, message: "Cascade alert recorded and broadcast successfully" });
    }
  };

  socket.on(SOCKET_EVENTS.CASCADE_ALERT, handleCascadeAlert);
  socket.on("cascade_alert", handleCascadeAlert);
  socket.on("cascadeAlert", handleCascadeAlert);

  // 3. Cascade Clear via WebSocket (kebab-case, snake_case, camelCase)
  const handleCascadeClear = (rawPayload = {}, callback) => {
    const payload = parsePayload(rawPayload);
    const validation = validateCascadeClear(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on '${SOCKET_EVENTS.CASCADE_CLEAR}':`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    const targetSector = payload.primarySectorId || payload.sectorId || "ALL";
    const clearPayload = {
      alertId: payload.alertId || `CLR_${Date.now()}`,
      primarySectorId: targetSector,
      clearedAt: payload.clearedAt || payload.timestamp || new Date().toISOString(),
      resolvedBy: payload.resolvedBy || "operator",
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    console.log(`[CASCADE CLEAR]`);
    clearActiveCascade(targetSector, clearPayload);
    socket.broadcast.emit(SOCKET_EVENTS.CASCADE_CLEAR, clearPayload);
    // console.log(`[CASCADE EMIT] Broadcast [cascade-clear] for sector ${targetSector} to clients`);

    if (typeof callback === "function") {
      callback({ success: true, message: "Cascade alert cleared successfully", clearPayload });
    }
  };

  socket.on(SOCKET_EVENTS.CASCADE_CLEAR, handleCascadeClear);
  socket.on("cascade_clear", handleCascadeClear);
  socket.on("cascadeClear", handleCascadeClear);

  // 4. Agent Comms via WebSocket (kebab-case, snake_case, camelCase)
  const handleAgentComms = (rawPayload, callback) => {
    const payload = parsePayload(rawPayload);
    const validation = validateAgentComms(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on '${SOCKET_EVENTS.AGENT_COMMS}':`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    addAgentComm(payload);
    socket.broadcast.emit(SOCKET_EVENTS.AGENT_COMMS, payload);
    console.log(`[COMMS EMIT] Broadcast [agent-comms] from ${payload.from || payload.sourceAgentId} to ${payload.to || payload.targetAgentId} to clients`);

    if (typeof callback === "function") {
      callback({ success: true, message: "Agent comms broadcast successfully" });
    }
  };

  socket.on(SOCKET_EVENTS.AGENT_COMMS, handleAgentComms);
  socket.on("agent_comms", handleAgentComms);
  socket.on("agentComms", handleAgentComms);

  // 5. City Incident / City Cascade via WebSocket (supports all alias event names)
  const handleCityIncident = (rawPayload, callback) => {
    const payload = parsePayload(rawPayload);
    const validation = validateCityIncident(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on city incident/cascade:`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    console.log(`[CITY INCIDENT] Received city cascade incident ${payload.incidentId} [${payload.citywideSeverity}] (${payload.activeSectorCount || payload.affectedAreas?.length || 0} sectors affected)`);
    setActiveCityIncident(payload);

    // Broadcast on both "city-incident" and "city-cascade" channels
    socket.broadcast.emit(SOCKET_EVENTS.CITY_INCIDENT, payload);
    socket.broadcast.emit("city-cascade", payload);
    socket.broadcast.emit("city_cascade", payload);
    socket.broadcast.emit("cityCascade", payload);

    console.log(`[CITY INCIDENT EMIT] Broadcast [city-incident] & [city-cascade] ${payload.incidentId} [${payload.citywideSeverity}] to clients`);

    if (typeof callback === "function") {
      callback({ success: true, message: "City incident recorded and broadcast successfully" });
    }
  };

  socket.on(SOCKET_EVENTS.CITY_INCIDENT, handleCityIncident);
  socket.on("city_incident", handleCityIncident);
  socket.on("cityIncident", handleCityIncident);
  socket.on("city-cascade", handleCityIncident);
  socket.on("city_cascade", handleCityIncident);
  socket.on("cityCascade", handleCityIncident);
  socket.on("cascade-incident", handleCityIncident);

  // 6. City Incident Clear via WebSocket (supports all alias event names)
  const handleCityIncidentClear = (rawPayload = {}, callback) => {
    const payload = parsePayload(rawPayload);
    const validation = validateCityIncidentClear(payload);

    if (!validation.valid) {
      console.warn(`[GHOSTNET Socket] ⚠️ Validation failed on city incident clear:`, validation.errors);
      if (typeof callback === "function") {
        callback({ success: false, error: "ValidationError", details: validation.errors });
      }
      return;
    }

    const prev = getActiveCityIncident();
    const clearPayload = {
      incidentId: payload.incidentId || prev?.incidentId || `CITY_INCIDENT_CLR_${Date.now()}`,
      clearedAt: payload.clearedAt || payload.timestamp || new Date().toISOString(),
      resolutionSummary: payload.resolutionSummary || "City incident status resolved.",
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    clearActiveCityIncident(clearPayload);
    socket.broadcast.emit(SOCKET_EVENTS.CITY_INCIDENT_CLEAR, clearPayload);
    socket.broadcast.emit("city-cascade-clear", clearPayload);
    socket.broadcast.emit("city_cascade_clear", clearPayload);

    console.log(`[CITY INCIDENT EMIT] Broadcast [city-incident-clear] & [city-cascade-clear] ${clearPayload.incidentId} to clients`);

    if (typeof callback === "function") {
      callback({ success: true, message: "City incident cleared successfully", clearPayload });
    }
  };

  socket.on(SOCKET_EVENTS.CITY_INCIDENT_CLEAR, handleCityIncidentClear);
  socket.on("city_incident_clear", handleCityIncidentClear);
  socket.on("cityIncidentClear", handleCityIncidentClear);
  socket.on("city-cascade-clear", handleCityIncidentClear);
  socket.on("city_cascade_clear", handleCityIncidentClear);
  socket.on("clear-city-incident", handleCityIncidentClear);
  socket.on("clear-city-cascade", handleCityIncidentClear);

  // Benign Ping / Pong
  socket.on("ping", (data) => {
    socket.emit("pong", { timestamp: new Date().toISOString(), echo: data });
  });
}
