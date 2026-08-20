import { SOCKET_EVENTS } from "../lib/constants.js";

/**
 * Socket.io event emitter helpers using exact SOCKET_EVENTS string constants.
 * Payloads are relayed unmodified.
 */

export function emitAgentSignal(io, signalPayload) {
  if (!io) return;
  console.log(`[SIGNAL EMIT] Emitted [agent-signal] for sector ${signalPayload?.sectorId} (${signalPayload?.agentId})`);
  io.emit(SOCKET_EVENTS.AGENT_SIGNAL, signalPayload);
}

export function emitCascadeAlert(io, cascadePayload) {
  if (!io) return;
  console.log(`[CASCADE EMIT] Emitted [cascade-alert] for sector ${cascadePayload?.primarySectorId} (${cascadePayload?.alertId})`);
  io.emit(SOCKET_EVENTS.CASCADE_ALERT, cascadePayload);
}

export function emitCascadeClear(io, clearPayload = {}) {
  if (!io) return;
  console.log(`[CASCADE EMIT] Emitted [cascade-clear] for sector ${clearPayload?.primarySectorId}`);
  io.emit(SOCKET_EVENTS.CASCADE_CLEAR, clearPayload);
}

export function emitAgentComms(io, commsPayload) {
  if (!io) return;
  console.log(`[COMMS EMIT] Emitted [agent-comms] from ${commsPayload?.from || commsPayload?.sourceAgentId} to ${commsPayload?.to || commsPayload?.targetAgentId}`);
  io.emit(SOCKET_EVENTS.AGENT_COMMS, commsPayload);
}

export function emitCityIncident(io, incidentPayload) {
  if (!io) return;
  console.log(`[CITY INCIDENT EMIT] Emitted [city-incident] & [city-cascade] ${incidentPayload?.incidentId} [${incidentPayload?.citywideSeverity}]`);
  io.emit(SOCKET_EVENTS.CITY_INCIDENT, incidentPayload);
  io.emit("city-cascade", incidentPayload);
  io.emit("city_cascade", incidentPayload);
}

export function emitCityIncidentClear(io, clearPayload = {}) {
  if (!io) return;
  console.log(`[CITY INCIDENT EMIT] Emitted [city-incident-clear] & [city-cascade-clear] ${clearPayload?.incidentId}`);
  io.emit(SOCKET_EVENTS.CITY_INCIDENT_CLEAR, clearPayload);
  io.emit("city-cascade-clear", clearPayload);
  io.emit("city_cascade_clear", clearPayload);
}
