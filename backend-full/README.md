# GHOSTNET Backend — Real-Time Municipal Telemetry Gateway & Cascade Relay

> A high-throughput, low-latency Node.js and Socket.io gateway designed for real-time validation, state aggregation, and event relay of multi-agent urban infrastructure telemetry across the 39 sectors of the Delhi National Capital Region (NCR).

---

## 🛠️ System Architecture & Key Components

GHOSTNET acts as the central telemetry validation gate, in-memory state repository, and real-time event router between an upstream **Python / AI Multi-Agent Simulation Engine** (AutoNet) and downstream **React Operational Command Dashboards**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       UPSTREAM PYTHON AI SERVICE                        │
│             (39 Sectors × 12 Autonomous Agents = 468 Nodes)             │
│            • ML Telemetry Generation & Sector State Analysis            │
│            • Cascade Propagation Engine & LLM Rollup Reasoning          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ WebSocket (Socket.io EIO3/EIO4)
                                     │ or HTTP POST REST Ingestion
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        GHOSTNET NODE.JS GATEWAY                         │
│                                                                         │
│  ┌────────────────────────┐      ┌───────────────────────────────────┐  │
│  │ Strict Validation Gate │ ───► │        In-Memory Data Store       │  │
│  │ (Per-Agent Metric &    │      │  • Sector Signals (Map<LWW>)      │  │
│  │  Schema Verification)  │      │  • Active Cascades (Map<Sector>)  │  │
│  └────────────────────────┘      │  • Ring Buffers (Signals & Comms) │  │
│                                  │  • Active City Incident Object    │  │
│                                  └─────────────────┬─────────────────┘  │
│                                                    │                    │
│                                                    ▼                    │
│                                  ┌───────────────────────────────────┐  │
│                                  │   Socket.io Broadcast Engine      │  │
│                                  │   (Zero Mutation / Pure Relay)    │  │
│                                  └─────────────────┬─────────────────┘  │
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │ Full-Duplex WebSockets
                                                     │ (agent-signal, cascade-alert,
                                                     │  agent-comms, city-incident)
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DOWNSTREAM REACT DASHBOARD                       │
│                        (City Command & Operations)                      │
│             • Live Interactive Sector Mesh & Geographic Map             │
│             • Real-Time Threat Alerts & Inter-Agent Chat Feed           │
│             • Aggregated Citywide Multi-Agent Cascade Panel             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Invariants & Patterns

1. **Atomic Validation Gatekeeper**: Telemetry payloads received over WebSocket or REST must satisfy rigid per-agent metric schemas and type definitions before mutating state or triggering client emissions. Invalid payloads are immediately rejected with HTTP `400 Bad Request` or socket error callbacks without dirtying store collections.
2. **Pure Relay & Payload Fidelity**: Payloads are broadcast to downstream consumers completely **unmodified**. Field names, floating-point numbers, and nested structures are preserved verbatim to guarantee contract compatibility with the frontend.
3. **Decoupled In-Memory Storage**: Built on zero-dependency native JavaScript `Map` structures and capped sliding-window ring buffers (`Last-Write-Wins` per sector/agent) for sub-millisecond read/write latency.
4. **Bidirectional Socket Protocol**: Full support for Engine.IO v3 and v4 protocols with automated reconnection handling, socket acknowledgment callbacks, and ping/pong keepalives.

---

## 📂 Directory Structure

```text
d:/ghoda/
├── app.js                      # Express application factory, CORS origins matcher, route registration
├── package.json                # Project dependencies, scripts, and ES module declaration
├── projectContext.md           # Architecture specifications, agent matrices, and protocol contracts
├── README.md                   # Complete system documentation and developer manual
├── server.js                   # Process entry point, HTTP server instantiation, Socket.io lifecycle
├── src/
│   ├── agents/
│   │   └── registry.js         # 12-agent schemas, metric validators, and cascade normalizers
│   ├── engine/
│   │   └── cascade.js          # Reference cascade scoring algorithm and mock incident generators
│   ├── lib/
│   │   ├── constants.js        # Frozen Socket.io event names, agent IDs, and severity constants
│   │   ├── schema.js           # Agent metadata, domain groupings, and cascade weights
│   │   └── sectors.js          # Sector metadata registry (39 Delhi NCR sectors with coordinates)
│   ├── routes/
│   │   ├── cascadeRoutes.js    # /cascade-alert, /cascade-clear, and /cascades endpoints
│   │   ├── commsRoutes.js      # /agent-comms inter-agent messaging endpoints
│   │   ├── incidentRoutes.js   # /city-incident and /city-incident-clear endpoints
│   │   ├── meshRoutes.js       # /health, /mesh/snapshot, /sectors, /agents, /mesh/reset
│   │   ├── replayRoutes.js     # /replay and /replay/dates historical telemetry endpoints
│   │   ├── signalRoutes.js     # /agent-signal and /agent-signals query endpoints
│   │   ├── stateRoutes.js      # /sectors/state, /sectors/state/:sectorId, and /history
│   │   └── testRoutes.js       # /test and /test-city-incident mock injection endpoints
│   ├── socket/
│   │   ├── emitter.js          # Outbound Socket.io broadcast helpers
│   │   └── handlers.js         # Inbound Socket.io event listeners and acknowledgment dispatchers
│   └── store/
│       └── memory.js           # In-memory Map storage, sliding-window ring buffers, and getters
└── test/
    └── acceptance.test.js      # End-to-end integration and TAP acceptance test harness
```

---

## 🤖 The 12 Infrastructure Agents & Telemetry Schemas

GHOSTNET orchestrates signals across 4 critical urban infrastructure domains:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   ENVIRONMENT   │  │     TRANSIT     │  │ INFRASTRUCTURE  │  │      CIVIC      │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│• smog_dispersion│  │• transit_fleet  │  │• power_grid     │  │• emergency_     │
│• waterlogging_  │  │• road_corridor  │  │• industrial_    │  │  dispatch       │
│  hydrology      │  │• metro_transit  │  │  hazard         │  │• social_panic   │
│• thermal_stress │  │                 │  │• hospital_      │  │• traffic_news   │
│                 │  │                 │  │  capacity       │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Agent Schema Reference Table

| Agent ID | Domain | Forecast Key | Required Telemetry Metrics & Types |
| :--- | :--- | :--- | :--- |
| `smog_dispersion` | `environment` | `diffusionForecast` | `pm25` (num), `pm10` (num), `aqi` (num), `windSpeedKmh` (num), `windDirectionDeg` (num), `visibilityMeters` (num), `stagnationIndex` (num) |
| `waterlogging_hydrology` | `environment` | `floodForecast` | `rainfallRateMmHr` (num), `accumulatedRain24hMm` (num), `waterDepthCm` (num), `drainAbsorptionCapPct` (num), `underpassFlooded` (bool), `pumpStatus` (str) |
| `thermal_stress` | `environment` | `thermalForecast` | `ambientTempC` (num), `feelsLikeTempC` (num), `surfaceTempC` (num), `uhiIntensityDeltaC` (num), `humidityPct` (num), `solarIrradianceWm2` (num) |
| `transit_fleet` | `transit` | `bottleneckForecast` | `totalActiveBuses` (num), `stoppedBuses` (num), `stationaryRatio` (num), `avgFleetSpeedMps` (num), `affectedRouteCount` (num), `topChokeRoute` (str) |
| `road_corridor` | `transit` | `corridorForecast` | `corridorName` (str), `freeFlowSpeedKmh` (num), `currentAvgSpeedKmh` (num), `congestionLevelPct` (num), `jamLengthMeters` (num), `bottleneckType` (str), `avgDelayIndexMins` (num) |
| `metro_transit` | `transit` | `surgeForecast` | `passengerInflowPerMin` (num), `platformCapacityPct` (num), `activeGateCount` (num), `throttledGateCount` (num), `avgPlatformWaitMins` (num), `lineTransferSurge` (bool/str/num) |
| `power_grid` | `infrastructure` | `gridForecast` | `substationName` (str), `discomProvider` (str), `transformerLoadPct` (num), `gridFrequencyHz` (num), `activeFeeders` (num), `trippedFeeders` (num), `trafficSignalsOffline` (bool/str/num), `commercialBlackout` (bool) |
| `industrial_hazard` | `infrastructure` | `hazardForecast` | `zoneType` (str), `incidentType` (str), `hazardSeverityGrade` (str/num), `fireTendersDeployed` (num), `toxicSmokePlume` (bool), `chemicalAgent` (str/num), `evacuationRadiusMeters` (num), `roadClosureEnforced` (bool), `windDirectionDeg` (num) |
| `hospital_capacity` | `infrastructure` | `healthcareForecast`| `primaryFacilityName` (str), `totalIcuBeds` (num), `availableIcuBeds` (num), `icuOccupancyPct` (num), `erVentilatorsInUse` (num), `respiratoryAdmissionsHourly` (num), `oxygenReserveHours` (num), `ambulanceAmbulatoryQueue` (num) |
| `emergency_dispatch` | `civic` | `dispatchForecast` | `callVolumePerMin` (num), `baselineCallVolumeMin` (num), `callVelocitySpikeRatio` (num), `activeDispatches` (num), `primaryCallCategory` (str), `avgResponseTimeMins` (num), `dispatchQueueBacklog` (num) |
| `social_panic` | `civic` | `panicForecast` | `processedPostsPerMin` (num), `meanRoBERTaPanicScore` (num), `negativeSentimentPct` (num), `keywordVelocityRatio` (num), `topKeywords` (arr[str]), `viralPostCount` (num) |
| `traffic_news` | `civic` | `advisoryForecast` | `sourceType` (str), `closureType` (str), `closureSeverity` (str), `officialAdvisoryId` (str), `verifiedByPolice` (bool), `affectedCorridors` (arr[str]), `estimatedDurationHours` (num) |

---

## 📡 Socket.io Real-Time Protocol

GHOSTNET exposes full-duplex WebSocket channels over Socket.io. Clients can subscribe to events or emit telemetry with acknowledgment callbacks.

### Event Names & Bindings (`src/lib/constants.js`)

| Event Constant | Channel Name | Ingestion Listener Aliases | Payload Description |
| :--- | :--- | :--- | :--- |
| `AGENT_SIGNAL` | `agent-signal` | `agent_signal`, `agentSignal` | Sector-level telemetry emitted by an infrastructure agent. |
| `CASCADE_ALERT` | `cascade-alert` | `cascade_alert`, `cascadeAlert` | Multi-agent threat cascade triggered for a specific primary sector. |
| `CASCADE_CLEAR` | `cascade-clear` | `cascade_clear`, `cascadeClear` | Clearance event resolving active cascade status for a sector. |
| `AGENT_COMMS` | `agent-comms` | `agent_comms`, `agentComms` | Cross-agent negotiation message transmission. |
| `CITY_INCIDENT` | `city-incident` | `city-cascade`, `city_cascade`, `cityCascade` | Aggregated citywide disaster/cascade rollup across sectors. |
| `CITY_INCIDENT_CLEAR` | `city-incident-clear` | `city-cascade-clear`, `city_cascade_clear` | Resolution event for the active citywide incident. |

### Sample Telemetry Payloads

#### 1. Agent Signal (`agent-signal`)
```json
{
  "sectorId": "DEL_EAST_LN",
  "district": "East Delhi",
  "agentId": "smog_dispersion",
  "domain": "environment",
  "isLiveAnchor": true,
  "healthScore": 24,
  "anomalyLevel": "critical",
  "signal": "AQI spike to 389 in East Delhi",
  "location": {
    "placeName": "Vikas Marg",
    "lat": 28.6304,
    "lng": 77.2777,
    "radiusMeters": 500
  },
  "metrics": {
    "pm25": 245,
    "pm10": 380,
    "aqi": 389,
    "windSpeedKmh": 4,
    "windDirectionDeg": 310,
    "visibilityMeters": 600,
    "stagnationIndex": 0.88
  },
  "diffusionForecast": {
    "t1h_aqi": 410,
    "t3h_aqi": 380,
    "trend": "worsening"
  },
  "timestamp": "2026-08-20T19:00:00Z"
}
```

#### 2. Sector Cascade Alert (`cascade-alert`)
```json
{
  "alertId": "ALT_2026_0819_1001",
  "primarySectorId": "DEL_EAST_LN",
  "primarySectorName": "Laxmi Nagar",
  "district": "East Delhi",
  "cascadeScore": 0.82,
  "confidence": 91,
  "predictedEvent": "Severe smog stagnation with transport slowdown",
  "hoursUntil": 1.0,
  "spatialSpread": ["DEL_EAST_PV", "DEL_NORTH_ISBT"],
  "triggeredAgents": ["smog_dispersion", "transit_fleet"],
  "recommendations": [
    "Speed reduction on Vikas Marg",
    "Deploy smog guns at Laxmi Nagar"
  ],
  "timestamp": "2026-08-20T19:05:00Z"
}
```

#### 3. Citywide Incident Rollup (`city-incident`)
```json
{
  "incidentId": "CITY_INCIDENT_2026_0820_001",
  "citywideSeverity": "CRITICAL",
  "citywideCascadeScore": 0.92,
  "summary": "Severe monsoonal flash flooding in Central Delhi underpasses causing cross-district bus gridlock and local power transformer trips.",
  "rootCauseDomain": "waterlogging_hydrology",
  "affectedAreas": [
    {
      "district": "Central Delhi",
      "primarySectorId": "DEL_CENTRAL_CP",
      "secondarySectors": ["DEL_CENTRAL_KB", "DEL_OLD_CHANDNI"],
      "impactedDomains": ["waterlogging_hydrology", "transit_fleet", "power_grid"],
      "affectedBy": {
        "primaryThreat": "Minto Bridge Flash Inundation",
        "description": "42cm standing water halting DTC routes.",
        "metrics": {
          "waterDepthCm": 42.0,
          "busStationaryRatio": 0.78,
          "gridLoadImpactPct": 91.2
        }
      }
    }
  ],
  "mitigationMeasures": {
    "immediateDirectives": [
      {
        "action": "Activate high-capacity mobile dewatering pumps at Minto Bridge underpass.",
        "targetAgency": "PWD / MCD",
        "priority": "P1_CRITICAL"
      }
    ],
    "trafficAndTransitRerouting": [
      {
        "affectedCorridor": "Connaught Place Radial Roads & Minto Road",
        "bypassRoute": "DDU Marg -> Deen Dayal Upadhyaya flyover bypass",
        "transitAdjustment": "DTC Line 419 diverted via Barakhamba Road."
      }
    ],
    "publicAdvisories": [
      {
        "channel": "Delhi Traffic Police RSS & FM Broadcast",
        "headline": "AVOID Minto Bridge Underpass",
        "message": "Severe waterlogging at Minto Bridge. Use DDU Marg."
      }
    ]
  },
  "timestamp": "2026-08-20T19:10:00Z"
}
```

---

## 🌐 REST API Reference

All routes are registered cleanly at the root level without an `/api` prefix.

### 1. Ingestion & Command Endpoints

#### Ingest Agent Signal
`POST /agent-signal`
* **Request Body**: Complete `agent-signal` JSON payload matching the agent's schema.
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Agent signal processed and broadcast successfully",
    "signal": { ... }
  }
  ```
* **Validation Failure (400 Bad Request)**:
  ```json
  {
    "error": "ValidationError",
    "statusCode": 400,
    "message": "Agent signal validation failed",
    "details": ["Missing required metric 'pm25' for agent 'smog_dispersion'"]
  }
  ```

#### Post Sector Cascade Alert
`POST /cascade-alert`
* **Request Body**: Structured cascade alert payload. Supports envelope unwrapping (`alert`, `cascade`, `data`).

#### Clear Sector Cascade
`POST /cascade-clear`
* **Request Body**: `{ "primarySectorId": "DEL_EAST_LN", "resolvedBy": "operator" }`

#### Send Agent Communication
`POST /agent-comms`
* **Request Body**: `{ "from": "smog_dispersion", "to": "transit_fleet", "message": "Visibility < 500m", "timestamp": "..." }`

#### Post Citywide Incident
`POST /city-incident` (Alias: `POST /city-cascade`)
* **Request Body**: AutoNet multi-agent city incident rollup schema.

#### Clear Citywide Incident
`POST /city-incident-clear` (Alias: `POST /city-cascade-clear`)
* **Request Body**: `{ "incidentId": "...", "resolutionSummary": "All sectors normalized." }`

---

### 2. State & Telemetry Retrieval Endpoints

| Method | Endpoint | Query Parameters | Response Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | — | Gateway status, active signal count, cascade count, timestamp. |
| `GET` | `/mesh/snapshot` | — | Complete hydration payload (`sectors`, `agents`, `signals`, `activeCascades`, `activeCityIncident`, `commsHistory`). |
| `GET` | `/sectors/state` | — | Array of all 39 sectors merged with their latest agent signals and active cascade. |
| `GET` | `/sectors/state/:sectorId` | — | Detailed state for a single sector ID (e.g. `/sectors/state/DEL_EAST_LN`). |
| `GET` | `/agent-signals` | `?sectorId=&agentId=` | Filtered array of latest signals. |
| `GET` | `/cascades` | — | Current active cascades map and historical audit trail. |
| `GET` | `/agent-comms` | `?limit=50` | Recent agent chat / negotiation message log. |
| `GET` | `/history` | `?limit=50` | Cascade history audit records. |
| `GET` | `/replay` | `?date=YYYY-MM-DD&limit=100` | Historical signal and cascade playback records. |
| `GET` | `/replay/dates` | — | List of distinct dates available in the telemetry log. |
| `POST`| `/mesh/reset` | — | Resets in-memory state store to empty state. |

---

### 3. Simulation & Development Injection Endpoints

* `GET /test` | `POST /test`: Injects a sample critical smog signal for `DEL_EAST_LN` and broadcasts it to live sockets.
* `GET /test-city-incident` | `POST /test-city-incident`: Generates and broadcasts a full structured flood/smog city incident.

---

## 💾 In-Memory State Store (`src/store/memory.js`)

The gateway utilizes pure in-memory data structures to guarantee ultra-low latency reads and writes:

```javascript
// Telemetry per sector (39 sectors x 12 agents = up to 468 entries)
sectors = Map<sectorId, Map<agentId, signalPayload>>

// Active sector cascades (up to 39 concurrent, Last-Write-Wins per sector)
activeCascades = Map<primarySectorId, cascadeAlertPayload>

// Sliding ring buffer for global telemetry history (capped at 500 items)
signals = Array<signalPayload> (max 500)

// Sliding ring buffer for inter-agent chat history (capped at 200 items)
agentComms = Array<commsPayload> (max 200)

// Historical cascade events (alerts + clearances)
cascadeHistory = Array<cascadeAlert | cascadeClear>

// Active citywide incident pointer
activeCityIncident = { current: null | cityIncidentPayload }
```

---

## 🚀 Getting Started & Installation

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **npm**: v9.0.0 or higher

### Installation

1. Clone the repository and navigate into the project directory:
   ```bash
   cd d:/ghoda
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Start the server:
   ```bash
   # Production mode
   npm start

   # Development mode with automated watch reload
   npm run dev
   ```

The gateway will bind to `0.0.0.0:3001` and output:
```text
=======================================================
🚀 Starting AutoNet / GHOSTNET Socket.io Receiver on port 3001...
🌐 Bound to host: 0.0.0.0
📡 Socket.io endpoint active (cors: *, allowEIO3: true)
⚡ Mode: In-Memory Only
=======================================================
```

---

## ⚙️ Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3001` | TCP port for HTTP and WebSocket listeners. |
| `HOST` | `0.0.0.0` | Network binding interface (`0.0.0.0` for all interfaces / LAN). |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`). |
| `ALLOWED_ORIGINS`| `*` | Comma-separated list of allowed CORS browser origins. |
| `MONGODB_URI` | `""` *(optional)* | Connection URI for persistent secondary storage sink. |

---

## 🧪 Testing & Quality Assurance

GHOSTNET includes a comprehensive integration test suite utilizing Node.js's native test runner (`node:test`) and TAP assertions.

### Running Acceptance Tests
```bash
npm test
```

### Test Coverage Summary
The acceptance test suite (`test/acceptance.test.js`) verifies 10 critical operational contracts:
* [x] **Suite 1**: Validates `POST /agent-signal` storage and unmodified `agent-signal` socket emission.
* [x] **Suite 2**: Validates `POST /cascade-alert` ingestion and `cascade-alert` socket emission.
* [x] **Suite 3**: Validates `POST /agent-comms` ingestion and `agent-comms` socket emission.
* [x] **Suite 4**: Rejects malformed `agent-signal` (missing metrics, type violations) with HTTP 400 without mutating store.
* [x] **Suite 5**: Rejects malformed `cascade-alert` with HTTP 400.
* [x] **Suite 6**: Rejects malformed `agent-comms` with HTTP 400.
* [x] **Suite 7**: Validates `POST /city-incident` and `POST /city-incident-clear` lifecycle and socket relay.
* [x] **Suite 8**: Validates state querying via `GET /sectors/state`, `GET /sectors/state/:sectorId`, and `GET /history`.
* [x] **Suite 9**: Validates inbound WebSocket ingestion from Python AI service with acknowledgment callbacks.
* [x] **Suite 10**: Validates WebSocket validation rejections without state pollution.

---

## 🛡️ License

Private & Confidential — **AutoNet / GHOSTNET Systems Team**. All rights reserved.
