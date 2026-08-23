# GHOSTNET Backend — Project Context & Architecture

---

## 1. Executive Summary & Purpose

**GHOSTNET** is a high-throughput, low-latency Node.js/Express/Socket.io backend service designed to function as the real-time telemetry validation gate, state store, and event relay engine for municipal and infrastructure monitoring across the Delhi National Capital Region (NCR).

The system continuously tracks 12 autonomous infrastructure agents operating across 39 distinct urban sectors, managing telemetry on power grid stability, air quality, transit networks, hydrological flood threats, hospital capacity, civic panic, and municipal emergency services.

---

## 2. Core Architectural Principles & Scope Boundaries

```
┌─────────────────────────┐
│   Python / AI Service   │ (Upstream: ML inference, cascade graph traversal, metric derivation)
└───────────┬─────────────┘
            │ WebSocket / Socket.io Duplex Connection
            │ (Emits agent-signal, cascade-alert, comms, incident)
            ▼
┌─────────────────────────┐
│     GHOSTNET Backend    │ (Node.js / Express / Socket.io)
│  ┌───────────────────┐  │   1. Strict Schema & Metric Validation Gate
│  │ In-Memory Store   │  │   2. In-Memory State Updates (LWW, Ring Buffers)
│  │ (Optional Mongo)  │  │   3. Unmodified Socket.io Real-Time Broadcasts
│  └───────────────────┘  │   4. Dual Support: WebSocket + HTTP REST Ingestion
└───────────┬─────────────┘
            │ WebSocket Broadcasts (Unmodified payloads)
            ▼
┌─────────────────────────┐
│     React Frontend      │ (Downstream: Live Map/Mesh UI, alerts, local fallback calculation)
└─────────────────────────┘
```

### 2.1 Scope Boundary Invariants
1. **Zero Computation Engine**: The backend does **not** run machine learning models, does **not** evaluate cascade graph propagation, and does **not** compute agent threat indices. Computation is strictly partitioned between the upstream Python AI services and downstream React frontend.
2. **WebSocket & REST Telemetry Ingestion**: The upstream Python / AI Service connects directly over **WebSocket / Socket.io** (or HTTP REST) to emit telemetry (`agent-signal`, `cascade-alert`, `cascade-clear`, `agent-comms`, `city-incident`, `city-incident-clear`).
3. **Relay Fidelity**: All incoming payloads that pass validation are broadcasted via Socket.io **unmodified** (identical field names, identical data types, nothing renamed or restructured).
4. **Atomic Validation Gate**: Every payload must pass strict schema and per-agent metric validation before touching the store or triggering a broadcast. If validation fails, the backend immediately rejects the event (HTTP 400 or Socket error acknowledgment), preventing partial mutations or invalid event emissions.
5. **Decoupled Persistence**: The backend runs in pure **In-Memory Mode** by default with zero hard database dependencies. MongoDB is an optional secondary sink when `MONGODB_URI` is provided.

---

## 3. The 12 Infrastructure Agents

Every `agent-signal` maps to one of the 12 fixed system agents, each with dedicated metric requirements:

| Agent ID | Domain | Forecast Key | Metric Fields & Types |
| :--- | :--- | :--- | :--- |
| `smog_dispersion` | `environment` | `diffusionForecast` | `pm25` (num), `pm10` (num), `aqi` (num), `windSpeedKmh` (num), `windDirectionDeg` (num), `visibilityMeters` (num), `stagnationIndex` (num) |
| `waterlogging_hydrology` | `environment` | `floodForecast` | `rainfallRateMmHr` (num), `accumulatedRain24hMm` (num), `waterDepthCm` (num), `drainAbsorptionCapPct` (num), `underpassFlooded` (bool), `pumpStatus` (str) |
| `thermal_stress` | `environment` | `thermalForecast` | `ambientTempC` (num), `feelsLikeTempC` (num), `surfaceTempC` (num), `uhiIntensityDeltaC` (num), `humidityPct` (num), `solarIrradianceWm2` (num) |
| `transit_fleet` | `transit` | `bottleneckForecast` | `totalActiveBuses` (num), `stoppedBuses` (num), `stationaryRatio` (num), `avgFleetSpeedMps` (num), `affectedRouteCount` (num), `topChokeRoute` (str) |
| `road_corridor` | `transit` | `corridorForecast` | `corridorName` (str), `freeFlowSpeedKmh` (num), `currentAvgSpeedKmh` (num), `congestionLevelPct` (num), `jamLengthMeters` (num), `bottleneckType` (str), `avgDelayIndexMins` (num) |
| `metro_transit` | `transit` | `surgeForecast` | `passengerInflowPerMin` (num), `platformCapacityPct` (num), `activeGateCount` (num), `throttledGateCount` (num), `avgPlatformWaitMins` (num), `lineTransferSurge` (bool/str/num) |
| `power_grid` | `infrastructure` | `gridForecast` | `substationName` (str), `discomProvider` (str), `transformerLoadPct` (num), `gridFrequencyHz` (num), `activeFeeders` (num), `trippedFeeders` (num), `trafficSignalsOffline` (num), `commercialBlackout` (bool) |
| `industrial_hazard` | `infrastructure` | `hazardForecast` | `zoneType` (str), `incidentType` (str), `hazardSeverityGrade` (str/num), `fireTendersDeployed` (num), `toxicSmokePlume` (bool), `chemicalAgent` (str), `evacuationRadiusMeters` (num), `roadClosureEnforced` (bool), `windDirectionDeg` (num) |
| `hospital_capacity` | `infrastructure` | `healthcareForecast`| `primaryFacilityName` (str), `totalIcuBeds` (num), `availableIcuBeds` (num), `icuOccupancyPct` (num), `erVentilatorsInUse` (num), `respiratoryAdmissionsHourly` (num), `oxygenReserveHours` (num), `ambulanceAmbulatoryQueue` (num) |
| `emergency_dispatch` | `civic` | `dispatchForecast` | `callVolumePerMin` (num), `baselineCallVolumeMin` (num), `callVelocitySpikeRatio` (num), `activeDispatches` (num), `primaryCallCategory` (str), `avgResponseTimeMins` (num), `dispatchQueueBacklog` (num) |
| `social_panic` | `civic` | `panicForecast` | `processedPostsPerMin` (num), `meanRoBERTaPanicScore` (num), `negativeSentimentPct` (num), `keywordVelocityRatio` (num), `topKeywords` (arr[str]), `viralPostCount` (num) |
| `traffic_news` | `civic` | `advisoryForecast` | `sourceType` (str), `closureType` (str), `closureSeverity` (str), `officialAdvisoryId` (str), `verifiedByPolice` (bool), `affectedCorridors` (arr[str]), `estimatedDurationHours` (num) |

---

## 4. In-Memory Store Structure (`src/store/memory.js`)

State is organized into pure storage collections with named exports:

- `sectors`: `Map<sectorId, Map<agentId, signal>>` — Stores the latest telemetry per agent for all 39 sectors.
- `activeCascades`: `Map<primarySectorId, cascadeAlert>` — Active multi-agent cascades (up to 39 concurrent, last-write-wins per sector).
- `cascadeHistory`: `Array<cascadeAlert | cascadeClear>` — Historical cascade log.
- `activeCityIncident`: `{ current: Object | null }` — Singular active citywide incident.
- `agentComms`: Ring buffer capped at 200 items for inter-agent communication messages.
- `signals`: Sliding window buffer retaining the last 500 validated signals.

---

## 5. API Routes & Socket.io Event Bindings

All routes are mounted **without** an `/api` prefix:

| Method | Endpoint | Description | Emitted Socket.io Event |
| :--- | :--- | :--- | :--- |
| `POST` | `/agent-signal` | Validates & stores incoming telemetry for an agent/sector | `agent-signal` |
| `POST` | `/cascade-alert` | Validates & registers an upstream cascade alert | `cascade-alert` |
| `POST` | `/cascade-clear` | Clears active cascade for a sector or citywide | `cascade-clear` |
| `POST` | `/agent-comms` | Ingests agent-to-agent message transmission | `agent-comms` |
| `POST` | `/city-incident` | Registers a citywide critical emergency incident | `city-incident` |
| `POST` | `/city-incident-clear`| Resolves active city incident | `city-incident-clear` |
| `GET` | `/sectors/state` | Returns latest status of all 39 sectors and active cascades | *None* |
| `GET` | `/sectors/state/:sectorId` | Returns telemetry and cascade for a single sector | *None* |
| `GET` | `/history` | Returns historical cascade audit trail | *None* |
| `GET` | `/health` | Service health, active signal and cascade counts | *None* |
| `GET` | `/mesh/snapshot` | Complete initial hydration state for frontend clients | *None* |
| `GET` | `/test` | Injects a valid test signal into the live bus | `agent-signal` |
| `GET` | `/test-city-incident` | Injects a test city incident into the live bus | `city-incident` |
| `GET` | `/replay` & `/replay/dates` | Telemetry logs and available dates for replay playback | *None* |

---

## 6. Directory Layout

```
d:/ghoda/
├── .env.example             # Template for environment configurations
├── .gitignore               # Standard ignore list (node_modules, logs, envs, etc.)
├── app.js                   # Express application setup, CORS matcher, route mounting
├── package.json             # ES Module configuration and scripts
├── projectContext.md        # This comprehensive project documentation
├── server.js                # Server entry point, Socket.io instantiation, port binding (0.0.0.0:3001)
├── src/
│   ├── agents/
│   │   └── registry.js      # 12-agent schemas and per-agent metric validators
│   ├── lib/
│   │   ├── constants.js     # Frozen socket event strings, agent IDs, severity constants
│   │   ├── schema.js        # Re-export and metadata helpers
│   │   └── sectors.js       # Geographic definitions for the 39 Delhi sectors
│   ├── routes/
│   │   ├── cascadeRoutes.js # /cascade-alert, /cascade-clear, /cascades
│   │   ├── commsRoutes.js   # /agent-comms
│   │   ├── incidentRoutes.js# /city-incident, /city-incident-clear
│   │   ├── meshRoutes.js    # /health, /mesh/snapshot, /sectors, /agents
│   │   ├── replayRoutes.js  # /replay, /replay/dates
│   │   ├── signalRoutes.js  # /agent-signal, /agent-signals
│   │   ├── stateRoutes.js   # /sectors/state, /sectors/state/:sectorId, /history
│   │   └── testRoutes.js    # /test, /test-city-incident
│   ├── socket/
│   │   └── emitter.js       # Type-safe Socket.io event emitter helpers
│   └── store/
│       └── memory.js        # Pure in-memory storage maps and ring buffers
└── test/
    └── acceptance.test.js   # End-to-end integration and acceptance test suite
```

---

## 7. Running & Testing

```bash
# Start server in production mode
npm start

# Start server in watch/development mode
npm run dev

# Execute acceptance tests
npm test
```
