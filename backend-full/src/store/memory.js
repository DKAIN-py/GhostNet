/**
 * In-memory storage for GHOSTNET backend.
 * Pure storage collections with named exports. Zero cascade or ML computation.
 */

// 1. sectors: Map<sectorId, Map<agentId, signalPayload>> (latest signal per agent per sector)
export const sectors = new Map();

// 2. activeCascades: Map<primarySectorId, cascadeAlertPayload> (up to 39 concurrent, last-write-wins per sector)
export const activeCascades = new Map();

// 3. cascadeHistory: audit trail of cascade alerts and clears (capped array)
export const cascadeHistory = [];

// 4. activeCityIncident: singular active citywide incident
export const activeCityIncident = {
  current: null,
};

// 5. agentComms: capped ring buffer of agent communication messages
export const agentComms = [];
const AGENT_COMMS_MAX_CAPACITY = 200;

// 6. signals: sliding window of the last 500 signals
export const signals = [];
const SIGNALS_MAX_CAPACITY = 500;

// --- Storage Accessors & Mutators ---

export function setSectorSignal(signal) {
  if (!signal || !signal.sectorId || !signal.agentId) return;
  const { sectorId, agentId } = signal;

  if (!sectors.has(sectorId)) {
    sectors.set(sectorId, new Map());
  }
  sectors.get(sectorId).set(agentId, signal);

  // Add to sliding window signals buffer
  addSignal(signal);
  return signal;
}

export function getSectorSignals(sectorId) {
  if (!sectors.has(sectorId)) return [];
  return Array.from(sectors.get(sectorId).values());
}

export function getAllSectorSignals() {
  const all = [];
  for (const agentMap of sectors.values()) {
    for (const sig of agentMap.values()) {
      all.push(sig);
    }
  }
  return all;
}

export function getSectorAgentSignal(sectorId, agentId) {
  if (!sectors.has(sectorId)) return null;
  return sectors.get(sectorId).get(agentId) || null;
}

export function setActiveCascade(cascadeAlert) {
  if (!cascadeAlert || !cascadeAlert.primarySectorId) return null;
  const sectorId = cascadeAlert.primarySectorId;

  // LWW per primarySectorId
  activeCascades.set(sectorId, cascadeAlert);

  // Append to cascade history audit trail
  cascadeHistory.unshift(cascadeAlert);
  if (cascadeHistory.length > 200) {
    cascadeHistory.pop();
  }
  return cascadeAlert;
}

export function clearActiveCascade(primarySectorId, clearPayload = null) {
  let deleted = false;
  if (primarySectorId && primarySectorId !== "ALL") {
    deleted = activeCascades.delete(primarySectorId);
  } else {
    activeCascades.clear();
    deleted = true;
  }

  if (clearPayload) {
    cascadeHistory.unshift(clearPayload);
    if (cascadeHistory.length > 200) {
      cascadeHistory.pop();
    }
  }
  return deleted;
}

export function getActiveCascades() {
  return Array.from(activeCascades.values());
}

export function getCascadeHistory(limit = 50) {
  return cascadeHistory.slice(0, limit);
}

export function setActiveCityIncident(incident) {
  activeCityIncident.current = incident;
  return incident;
}

export function clearActiveCityIncident(clearPayload = null) {
  const prev = activeCityIncident.current;
  activeCityIncident.current = null;
  return prev;
}

export function getActiveCityIncident() {
  return activeCityIncident.current;
}

export function addAgentComm(comm) {
  if (!comm) return;
  agentComms.unshift(comm);
  if (agentComms.length > AGENT_COMMS_MAX_CAPACITY) {
    agentComms.pop();
  }
  return comm;
}

export function getAgentComms(limit = 50) {
  return agentComms.slice(0, limit);
}

export function addSignal(signal) {
  if (!signal) return;
  signals.unshift(signal);
  if (signals.length > SIGNALS_MAX_CAPACITY) {
    signals.pop();
  }
  return signal;
}

export function getSignals(limit = 500) {
  return signals.slice(0, limit);
}

export function resetMemoryStore() {
  sectors.clear();
  activeCascades.clear();
  cascadeHistory.length = 0;
  activeCityIncident.current = null;
  agentComms.length = 0;
  signals.length = 0;
}

export const memoryStore = {
  sectors,
  activeCascades,
  cascadeHistory,
  activeCityIncident,
  agentComms,
  signals,
  setSectorSignal,
  getSectorSignals,
  getAllSectorSignals,
  getSectorAgentSignal,
  setActiveCascade,
  clearActiveCascade,
  getActiveCascades,
  getCascadeHistory,
  setActiveCityIncident,
  clearActiveCityIncident,
  getActiveCityIncident,
  addAgentComm,
  getAgentComms,
  addSignal,
  getSignals,
  resetMemoryStore,
};
