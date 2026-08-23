# GHOSTNET

## Urban Early-Warning & Cascade Intelligence Engine

> **See the signal. Understand the relationship. Predict the cascade. Act before the city breaks.**

GHOSTNET is a real-time urban resilience and early-warning platform designed to understand how seemingly isolated infrastructure anomalies can propagate across Delhi's interconnected systems.

Instead of asking only:

> **"What is happening right now?"**

GHOSTNET asks:

> **"Why is it happening, where will it spread, what will it affect, how confident are we, and what should operators do next?"**

The platform combines:

- 12 specialized infrastructure micro-agents
- A 39-sector spatial city mesh
- Real-time telemetry ingestion
- Strict telemetry validation
- Cross-domain cascade reasoning
- Local LLM-powered intelligence
- Spatial risk propagation
- Citywide incident aggregation
- Real-time Socket.IO event streaming
- Historical replay
- Data integrity monitoring and recovery
- An operator-facing AI Assistant
- Interactive command-center visualization

---

# 01. THE PROBLEM

Modern cities already have dashboards for individual systems.

Air-quality systems monitor pollution.

Traffic systems monitor congestion.

Power systems monitor load.

Emergency systems monitor incidents.

Hospitals monitor capacity.

But cities do not fail one subsystem at a time.

A pollution event can reduce visibility.

Reduced visibility can slow public transport.

Slower transport can increase road congestion.

Congestion can delay emergency response.

Delayed emergency response can increase healthcare pressure.

A local anomaly can therefore become a cross-domain urban failure.

Traditional monitoring systems often display these events independently.

**GHOSTNET models the relationships between them.**

---

# 02. THE CORE IDEA

```text
                     +----------------------+
                     |    URBAN SIGNALS     |
                     |                      |
                     | Air · Rain · Traffic |
                     | Power · Transit · ER |
                     | Health · Social · NLP|
                     +----------+-----------+
                                |
                                v
                     +----------------------+
                     |   12 MICRO-AGENTS    |
                     |                      |
                     | Domain intelligence  |
                     +----------+-----------+
                                |
                                v
                   +-------------------------+
                   |   39-SECTOR CITY MESH   |
                   |                         |
                   | Spatial relationships  |
                   | + signal severity       |
                   +------------+------------+
                                |
                                v
                     +----------------------+
                     |   CASCADE ENGINE     |
                     |                      |
                     | Risk propagation     |
                     | Spatial decay        |
                     | Cross-domain impact  |
                     +----------+-----------+
                                |
                 +--------------+--------------+
                 |              |              |
                 v              v              v
           Sector Cascade   City Incident   Prediction
                 |              |              |
                 +--------------+--------------+
                                |
                                v
                     +----------------------+
                     | GHOSTNET COMMAND UI  |
                     |                      |
                     | MAP · NERVOUS SYSTEM |
                     | SIGNALS · CASCADES   |
                     | REPLAY · AI ASSISTANT|
                     +----------------------+
```

The difference is not another dashboard.

The difference is treating the city as an interconnected system.

---

# 03. WHAT GHOSTNET DOES

GHOSTNET follows the chain:

```text
Signal
   |
   v
Micro-Agent
   |
   v
Validation
   |
   v
Spatial Context
   |
   v
Cross-Domain Interaction
   |
   v
Cascade Propagation
   |
   v
Prediction
   |
   v
Intervention
```

The platform combines five major intelligence layers:

```text
REAL-TIME DATA
      +
MULTI-AGENT INTELLIGENCE
      +
SPATIAL COMPUTATION
      +
TEMPORAL REPLAY
      +
DECISION SUPPORT
```

---

# 04. SYSTEM ARCHITECTURE

GHOSTNET is composed of three major runtime layers.

```text
                    ┌─────────────────────────────┐
                    │     AUTONET / AI ENGINE      │
                    │                             │
                    │  Python + FastAPI           │
                    │  12 Micro-Agents             │
                    │  Sector State Store          │
                    │  Qwen 2.5 Cascade Reasoning  │
                    └──────────────┬──────────────┘
                                   │
                                   │ Socket.IO
                                   │ agent-signal
                                   │ cascade-alert
                                   │ cascade-clear
                                   │ agent-comms
                                   │ city-incident
                                   v
                    ┌─────────────────────────────┐
                    │      GHOSTNET BACKEND       │
                    │                             │
                    │  Node.js + Express          │
                    │  Strict Validation Gate     │
                    │  In-Memory State Store      │
                    │  Socket.IO Event Router     │
                    │  Data Integrity Layer       │
                    └──────────────┬──────────────┘
                                   │
                                   │ Socket.IO
                                   v
                    ┌─────────────────────────────┐
                    │       COMMAND CENTER        │
                    │                             │
                    │  React + Vite               │
                    │  GhostnetContext             │
                    │  Cesium                     │
                    │  Recharts                   │
                    │  Interactive UI              │
                    │  AI Assistant                │
                    └─────────────────────────────┘
```

The three layers have deliberately separated responsibilities.

### AI / Intelligence Layer

Responsible for:

- Generating and analyzing sector telemetry
- Domain-specific agent intelligence
- Maintaining sector state
- Spatial cascade calculations
- Cross-domain reasoning
- LLM-assisted cascade synthesis
- Producing structured events

### Backend Gateway

Responsible for:

- Receiving telemetry
- Validating telemetry contracts
- Protecting state from malformed data
- Maintaining low-latency in-memory state
- Broadcasting validated events
- Managing real-time Socket.IO communication
- Handling data-integrity events

### Frontend Command Center

Responsible for:

- Visualizing the city
- Displaying live signals
- Showing agent health
- Showing cascades
- Displaying citywide incidents
- Visualizing spatial propagation
- Historical replay
- Data integrity monitoring
- AI-assisted operator interaction

---

# 05. THE 12 MICRO-AGENT NETWORK

GHOSTNET uses specialized micro-agents instead of treating the entire city as one generic AI agent.

| # | Agent | Domain | Primary Intelligence |
|---|---|---|---|
| 01 | `smog_dispersion` | Environment | Pollution, visibility and atmospheric conditions |
| 02 | `waterlogging_hydrology` | Environment | Rainfall, drainage and accumulation |
| 03 | `thermal_stress` | Environment | Temperature anomalies and heat stress |
| 04 | `transit_fleet` | Transit | Fleet speed, delay and bottlenecks |
| 05 | `road_corridor` | Transit | Corridor congestion and road capacity |
| 06 | `metro_transit` | Transit | Station inflow and passenger pressure |
| 07 | `power_grid` | Infrastructure | Transformer and grid load |
| 08 | `industrial_hazard` | Infrastructure | Industrial incidents and hazardous events |
| 09 | `hospital_capacity` | Infrastructure | ICU and hospital capacity pressure |
| 10 | `emergency_dispatch` | Civic | Emergency calls and dispatch pressure |
| 11 | `social_panic` | Civic | Public sentiment and panic propagation |
| 12 | `municipal_news` | Civic | Civic incidents, closures and disruption reports |

Each agent produces normalized intelligence that can participate in the larger city-wide model.

---

# 06. THE 39-SECTOR SPATIAL MESH

GHOSTNET models Delhi as a spatial network rather than a flat collection of locations.

Each sector acts as a node.

Signals belong to sectors.

Cascades propagate between sectors.

```text
                     +-----------+
                     |  SECTOR A |
                     +-----+-----+
                           |
              +------------+------------+
              |            |            |
              v            v            v
         +--------+   +--------+   +--------+
         |SECTOR B|   |SECTOR C|   |SECTOR D|
         +----+---+   +----+---+   +----+---+
              |            |            |
              +------------+------------+
                           |
                           v
                     +-----------+
                     |  SECTOR E |
                     +-----------+
```

This gives every signal spatial context.

An anomaly near its source sector is not treated identically to an anomaly far away.

---

# 07. SPATIAL CASCADE MODEL

GHOSTNET models spatial propagation using a distance-decay relationship:

```text
H(A -> B) = R_A * e^(-lambda * distance(A,B))
```

Where:

```text
R_A
 |
 +-- risk generated by source signal A

distance(A,B)
 |
 +-- spatial distance between sectors

lambda
 |
 +-- spatial decay parameter
```

Signal severity is derived from health:

```text
severity = 1 - healthScore / 100
```

Conceptually:

```text
Source Severity
      x
Agent Weight
      x
Spatial Decay
      =
Sector Contribution
```

Multiple agents can contribute to the same sector.

```text
                  SMOG
                    |
                    v
              +-----------+
RAIN -------->|  SECTOR   |<-------- POWER
              +-----+-----+
                    |
                    v
                 TRANSIT
```

This creates a network-level risk model rather than a collection of isolated thresholds.

---

# 08. CASCADE DETECTION

A sector becomes a candidate cascade node when accumulated propagated risk crosses the configured cascade threshold.

The cascade engine identifies:

- Primary sector
- Spatial spread
- Triggered agents
- Cascade score
- Confidence
- Predicted event
- Estimated time horizon
- Recommended interventions

Example:

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
  "spatialSpread": [
    "DEL_EAST_PV",
    "DEL_NORTH_ISBT"
  ],
  "triggeredAgents": [
    "smog_dispersion",
    "transit_fleet"
  ],
  "recommendations": [
    "Speed reduction on Vikas Marg",
    "Deploy smog guns at Laxmi Nagar"
  ],
  "timestamp": "2026-08-20T19:05:00Z"
}
```

---

# 09. AGENT SIGNAL CONTRACT

Every agent signal follows a common normalized envelope.

```json
{
  "sectorId": "DEL_EAST_LN",
  "district": "East Delhi",
  "agentId": "waterlogging_hydrology",
  "domain": "environment",
  "healthScore": 15,
  "anomalyLevel": "critical",
  "signal": "Underpass waterlogged at Vikas Marg",
  "isLiveAnchor": false,
  "location": {
    "placeName": "Vikas Marg Underpass, Laxmi Nagar",
    "lat": 28.6304,
    "lng": 77.2777,
    "radiusMeters": 300
  },
  "timestamp": "2026-08-11T12:00:00.000Z"
}
```

The normalized signal can power:

```text
                  +-- CITY MAP
                  |
Signal -----------+-- AGENT CARD
                  |
                  +-- SIGNAL FEED
                  |
                  +-- SPARKLINE
                  |
                  +-- CASCADE ENGINE
                  |
                  +-- REPLAY
                  |
                  +-- ANALYTICS
```

This shared contract prevents different UI surfaces from inventing independent interpretations of the same event.

---

# 10. REAL-TIME EVENT SYSTEM

GHOSTNET uses Socket.IO as its real-time event layer.

```text
                  BACKEND
                     |
                     | Socket.IO
                     v
              +--------------+
              |  useSocket() |
              +------+-------+
                     |
          +----------+----------+
          |          |          |
          v          v          v
       SIGNAL     CASCADE    CITY INCIDENT
          |          |          |
          +----------+----------+
                     |
                     v
              GhostnetContext
                     |
                     v
                  UI SYSTEM
```

Core events:

```text
agent-signal
cascade-alert
cascade-clear
agent-comms
city-incident
city-incident-clear
data-integrity
```

### Event responsibilities

| Event | Purpose |
|---|---|
| `agent-signal` | Live sector telemetry |
| `cascade-alert` | New sector-level cascade |
| `cascade-clear` | Resolution of a sector cascade |
| `agent-comms` | Cross-agent communication |
| `city-incident` | Backend-owned citywide incident |
| `city-incident-clear` | Resolution of citywide incident |
| `data-integrity` | Rejected or invalid telemetry notification |

---

# 11. BACKEND VALIDATION GATE

The Node.js gateway acts as the central telemetry validation boundary.

```text
Incoming Telemetry
       |
       v
+----------------------+
| STRICT VALIDATION    |
|                      |
| Schema               |
| Required Fields      |
| Types                |
| Agent Contract       |
+----------+-----------+
           |
      +----+----+
      |         |
    VALID     INVALID
      |         |
      v         v
   Store      Reject
      |         |
      v         v
   Broadcast  data-integrity
```

The validation layer is intentionally placed **before state mutation and event broadcast**.

This means malformed telemetry cannot silently pollute the live city state.

The backend preserves payload fidelity for valid signals and relays them without changing the shared contract.

---

# 12. DATA INTEGRITY & STATE PROTECTION

GHOSTNET includes a dedicated Data Integrity layer for demonstrating and monitoring telemetry validation.

The system distinguishes three failure categories:

```text
INCOMPLETE
INVALID
INCONSISTENT
```

### Incomplete

A required field is missing.

Example:

```text
Missing required field: domain
```

### Invalid

A field exists but violates its schema or type constraints.

Examples:

```text
healthScore > 100
pm25 contains an invalid string
```

### Inconsistent

The signal contradicts an established contract.

Example:

```text
Agent domain does not match its registered domain
```

---

## Data Integrity Flow

```text
Malformed Telemetry
       |
       v
validateAgentSignal()
       |
       v
Validation Failure
       |
       +-------------------+
       |                   |
       v                   v
State NOT Mutated     data-integrity
                           |
                           v
                     Socket.IO Event
                           |
                           v
                     Command Center
```

A rejected signal does **not** become live telemetry.

Therefore:

```text
REJECTED TELEMETRY
```

and

```text
LIVE TELEMETRY
```

are tracked independently.

The interface never artificially subtracts a rejected signal from the live telemetry count.

---

## Data Integrity Demo Endpoint

The controlled demonstration endpoint is:

```http
POST /api/demo/data-integrity
```

Example request:

```json
{
  "type": "incomplete",
  "agentId": "smog_dispersion",
  "sectorId": "DEL_EAST_LN"
}
```

The endpoint intentionally constructs a malformed telemetry record, passes it through the same existing validation path used by normal telemetry, confirms rejection, and emits a `data-integrity` event.

It does **not** emit an `agent-signal` for the rejected record.

---

## Data Integrity UI

The command interface exposes:

- Current integrity status
- Rejected telemetry count
- Live telemetry count
- Validation reason
- Affected agent
- Affected sector
- Recovery state
- Latest validated telemetry
- Session-local validation events
- State-protection status

Possible system states include:

```text
OPERATIONAL
DEGRADED
RESTORED
```

When a malformed signal is rejected:

```text
SYSTEM STATUS
DEGRADED

REJECTED
1

LIVE TELEMETRY
468
```

When valid telemetry resumes:

```text
SYSTEM STATUS
RESTORED

LIVE STATE SYNCHRONIZED
```

The rejected record never becomes part of the live state.

---

# 13. CITYWIDE INCIDENT INTELLIGENCE

Sector cascades and citywide incidents are intentionally separate layers.

```text
                         CITY
                           |
            +--------------+--------------+
            |              |              |
            v              v              v
        DISTRICT        DISTRICT       DISTRICT
            |              |              |
         CASCADE         CASCADE        CASCADE
            |              |              |
          AGENTS          AGENTS         AGENTS
```

A citywide incident aggregates high-level consequences:

```text
CITYWIDE INCIDENT
|
+-- Severity
+-- Cascade Score
+-- Executive Summary
+-- Root Cause Domain
|
+-- Affected Areas
|   +-- Primary Sector
|   +-- Secondary Sectors
|   +-- Impacted Domains
|   +-- Failure Metrics
|
+-- Mitigation
    +-- Immediate Directives
    +-- Transit Rerouting
    +-- Public Advisories
```

The important architectural boundary is:

> **Citywide incidents are backend-owned.**

The frontend renders the event it receives.

It does not invent a city incident merely because sector-level risk exists.

---

# 14. CROSS-DOMAIN CASCADE

Consider an apparently isolated event:

```text
PM2.5 SPIKE
```

GHOSTNET can model the chain:

```text
PM2.5
  |
  v
Visibility
  |
  v
Bus Speed
  |
  v
Road Congestion
  |
  +----------------+
  |                |
  v                v
Metro Inflow    Emergency Calls
  |                |
  v                v
Station Stress  Dispatch Load
  |                |
  +-------+--------+
          |
          v
   City Mobility Risk
          |
          v
   Healthcare Pressure
```

Instead of simply displaying:

```text
Risk Score = 87
```

the platform can explain the relationship:

```text
Visibility degradation
        ->
Transit capacity degradation
        ->
Road congestion
        ->
Emergency response pressure
```

This makes the cascade understandable to an operator.

---

# 15. AGENT COMMUNICATION

GHOSTNET exposes cross-agent interactions.

Example:

```text
SMOG & DISPERSION
        |
        | visibility below threshold
        v
BUS FLEET
        |
        | speed degradation detected
        v
ARTERIAL CONGESTION
        |
        | corridor capacity collapsing
        v
METRO TRANSIT
        |
        | passenger overflow
        v
EMERGENCY DISPATCH
```

The operator can therefore understand not only that risk increased, but how one domain is influencing another.

---

# 16. NERVOUS SYSTEM VIEW

The Nervous System treats the city as a living network.

Instead of asking:

> "Which card is red?"

it asks:

> **"Where is the city's stress propagating?"**

The visualization connects:

```text
AGENT
  |
  v
SECTOR
  |
  v
DOMAIN
  |
  v
CASCADE
  |
  v
CITY
```

This exposes relationships that conventional card-based dashboards hide.

---

# 17. AI ASSISTANT

GHOSTNET also provides an operator-facing **AI Assistant** as an additional interaction layer on top of the command center.

The assistant is intended to make the system easier to interrogate without forcing an operator to manually navigate every dashboard surface.

Instead of searching through:

```text
MAP
SIGNALS
SECTORS
CASCADES
AGENTS
CITY INCIDENTS
```

the operator can use the assistant as a conversational interface for understanding the current situation.

The assistant complements — rather than replaces — the underlying intelligence pipeline.

```text
                  GHOSTNET STATE
                       |
        +--------------+--------------+
        |              |              |
     Signals        Cascades      Incidents
        |              |              |
        +--------------+--------------+
                       |
                       v
                 AI ASSISTANT
                       |
                       v
              Operator Explanation
```

The assistant fits the broader GHOSTNET philosophy:

```text
WHAT happened?
      |
      v
WHERE is it?
      |
      v
WHY is it happening?
      |
      v
WHAT is it affecting?
      |
      v
WHAT happens next?
      |
      v
WHAT should the operator inspect?
```

The assistant is therefore an interaction layer over the existing city intelligence rather than a separate source of truth.

---

# 18. HISTORICAL REPLAY

GHOSTNET is designed to answer:

> **"How did we get here?"**

rather than only:

> **"What is happening now?"**

Replay reconstructs the progression of signals over time.

```text
T-38h
  |
  +-- weak anomaly
  |
T-24h
  |
  +-- regional degradation
  |
T-12h
  |
  +-- cross-domain interaction
  |
T-06h
  |
  +-- cascade formation
  |
T-01h
  |
  +-- critical city impact
```

Replay acceleration allows the evolution to be observed quickly:

```text
1x
5x
10x
```

The same visualization layer can consume changing temporal state.

---

# 19. LIVE VS REPLAY

GHOSTNET intentionally separates live intelligence from historical reconstruction.

### LIVE

```text
Backend
   |
   v
Socket.IO
   |
   v
Signals
   |
   v
Current City State
```

### REPLAY

```text
Historical Dataset
       |
       v
Replay Engine
       |
       v
Time-Controlled Signals
       |
       v
Same Visualization Layer
```

This allows the platform to use the same visualization concepts for both current operations and historical analysis.

---

# 20. INTERVENTION INTELLIGENCE

Detection without action is incomplete.

GHOSTNET attaches recommendations to cascade events.

Example:

```text
CASCADE DETECTED

PRIMARY
Connaught Place

CONFIDENCE
89%

TRIGGERED
Transit Fleet
Power Grid
Social Panic

IMMEDIATE DIRECTIVE
Deploy traffic response teams

TRANSIT
Reroute affected corridors

PUBLIC
Issue civic advisory
```

The platform therefore moves from:

```text
OBSERVATION
```

to:

```text
DECISION SUPPORT
```

The ultimate purpose is to increase warning time so that operators can intervene before a local anomaly becomes systemic.

---

# 21. COMMAND CENTER

GHOSTNET is designed as an operational command interface rather than a conventional analytics dashboard.

Core interfaces include:

- City Map
- Nervous System
- Signal Feed
- Sector Browser
- Sector Detail
- Cascade Intelligence
- City Incident Intelligence
- Agent Communication
- Historical Replay
- Data Integrity
- Schema Documentation
- AI Assistant

The interface is designed around the operational questions:

```text
WHAT
WHERE
WHY
HOW
WHAT NEXT
```

---

# 22. FRONTEND ARCHITECTURE

```text
src/
|
+-- assets/
|
+-- components/
|   |
|   +-- dashboard/
|   |   +-- AgentCard.jsx
|   |   +-- CascadeAlertTray.jsx
|   |   +-- CityCascadePanel.jsx
|   |   +-- CityIncidentDrawer.jsx
|   |   +-- DomainBreakdown.jsx
|   |   +-- JudgeDemoPanel.jsx
|   |   +-- SectorCascadePanel.jsx
|   |   +-- SignalFeed.jsx
|   |   +-- TopThreats.jsx
|   |
|   +-- sectors/
|   |   +-- DistrictSection.jsx
|   |   +-- SectorPill.jsx
|   |
|   +-- shared/
|       +-- SeverityLegend.jsx
|       +-- Sidebar.jsx
|       +-- Topbar.jsx
|
+-- context/
|   +-- GhostnetContext.jsx
|   +-- ReplayContext.jsx
|
+-- hooks/
|   +-- useMockStream.js
|   +-- useReplayEngine.js
|   +-- useSocket.js
|   +-- useSparklineData.js
|
+-- lib/
|   +-- citySeverity.js
|   +-- replayData.js
|   +-- schema.js
|   +-- sectors.js
|   +-- theme.js
|
+-- pages/
|   +-- CascadeLog.jsx
|   +-- Citymap.jsx
|   +-- Dashboard.jsx
|   +-- DataIntegrity.jsx
|   +-- NervousSystem.jsx
|   +-- Replay.jsx
|   +-- SchemaDocs.jsx
|   +-- SectorBrowser.jsx
|   +-- SectorDetail.jsx
|
+-- App.css
+-- App.jsx
+-- index.css
+-- main.jsx
```

---

# 23. FRONTEND STATE ARCHITECTURE

`GhostnetContext` acts as the frontend state boundary.

```text
                     GhostnetContext
                            |
           +----------------+----------------+
           |                |                |
        signals          cascades       cityIncident
           |                |                |
           v                v                v
        sectors        cascade UI       city UI
           |
           v
       feed / stats
```

Shared state includes:

- Signals
- Sectors
- Signal feed
- Cascades
- Cascade history
- City incidents
- City incident history
- Agent communications
- Cascade acknowledgements
- Backend connection state
- Data integrity state
- Network statistics

This gives the application a consistent source of truth.

---

# 24. DATA FLOW

A single backend signal can flow through the entire platform:

```text
Backend
   |
   v
Socket.IO
   |
   v
useSocket
   |
   v
GhostnetContext
   |
   +----------+----------+----------+
   |          |          |          |
   v          v          v          v
 Sector     Agent      Signal      Map
 State      Card       Feed
   |
   v
Sparkline
   |
   v
Cascade Intelligence
```

The same source data powers multiple surfaces instead of each component inventing its own interpretation.

---

# 25. DATA PROVENANCE

GHOSTNET distinguishes signal provenance using:

```text
isLiveAnchor
```

This allows the system to distinguish between:

```text
LIVE DATA
```

and:

```text
SIMULATED / SYNTHETIC / DERIVED DATA
```

This distinction is important for engineering integrity and demonstration transparency.

---

# 26. SEVERITY MODEL

Individual agent signals use three primary states:

```text
+---------------+
|   NOMINAL     |
|   healthy     |
+---------------+

+---------------+
|   WARNING     |
|   degrading   |
+---------------+

+---------------+
|   CRITICAL    |
|   failing     |
+---------------+
```

Cascade state is deliberately separate from individual signal severity.

A signal can be moderate while still contributing significantly to a larger cascade.

This prevents the platform from reducing intelligence to:

```text
red = danger
green = safe
```

---

# 27. BACKEND ARCHITECTURE

The backend acts as the central telemetry gateway between the Python/AI service and the React command center.

```text
┌───────────────────────────────────────────┐
│            AUTONET AI SERVICE             │
│                                           │
│  39 Sectors × 12 Agents                  │
│  Telemetry + Cascade Reasoning            │
└─────────────────────┬─────────────────────┘
                      │
                      │ Socket.IO / REST
                      v
┌───────────────────────────────────────────┐
│          GHOSTNET NODE.JS GATEWAY         │
│                                           │
│  Strict Validation Gate                   │
│           ↓                               │
│  In-Memory State Store                    │
│           ↓                               │
│  Socket.IO Broadcast Engine               │
└─────────────────────┬─────────────────────┘
                      │
                      │ Socket.IO
                      v
┌───────────────────────────────────────────┐
│          REACT COMMAND CENTER             │
│                                           │
│  Map · Signals · Cascades · Replay        │
│  Data Integrity · AI Assistant            │
└───────────────────────────────────────────┘
```

### Backend responsibilities

- Atomic telemetry validation
- In-memory state management
- Socket.IO event routing
- Signal history
- Cascade state
- City incident state
- Agent communication history
- Data integrity events
- REST endpoints for state retrieval
- Development/test injection endpoints

---

# 28. BACKEND STATE STORE

The gateway uses in-memory data structures for low-latency state access.

```javascript
sectors =
  Map<sectorId, Map<agentId, signalPayload>>

activeCascades =
  Map<primarySectorId, cascadeAlertPayload>

signals =
  Array<signalPayload>

agentComms =
  Array<commsPayload>

cascadeHistory =
  Array<cascadeAlert | cascadeClear>

activeCityIncident =
  { current: null | cityIncidentPayload }
```

The backend is intentionally optimized as a real-time gateway rather than a traditional persistence-heavy application.

---

# 29. REST API

The backend exposes REST endpoints for ingestion, state retrieval and development workflows.

## Telemetry

```http
POST /agent-signal
```

Ingests and validates an agent signal.

## Cascades

```http
POST /cascade-alert
POST /cascade-clear
```

Creates or clears sector-level cascades.

## Agent Communication

```http
POST /agent-comms
```

Sends a cross-agent communication event.

## City Incidents

```http
POST /city-incident
POST /city-incident-clear
```

Creates or clears a citywide incident.

## Data Integrity

```http
POST /api/demo/data-integrity
```

Runs the controlled data-integrity demonstration.

## State

```http
GET /health
GET /mesh/snapshot
GET /sectors/state
GET /sectors/state/:sectorId
GET /agent-signals
GET /cascades
GET /agent-comms
GET /history
GET /replay
GET /replay/dates
```

## Development

```http
GET /test
POST /test

GET /test-city-incident
POST /test-city-incident
```

---

# 30. AI / AUTONET ENGINE

The intelligence layer is a Python-first, event-driven monitoring system.

The master FastAPI application manages:

- AI brain lifecycle
- Socket.IO connection
- Sector state
- Agent startup and shutdown
- Cascade engine execution

Each agent runs asynchronously and follows a common lifecycle.

```text
Fetch
  |
  v
Compute
  |
  v
Store
  |
  v
Emit
```

The Cascade Engine reads sector state and performs structured risk synthesis.

The system uses a local Qwen 2.5 model served through `llama-server` for structured cascade reasoning.

---

# 31. AI ENGINE DATA FLOW

```text
External Data Sources
        |
        v
Data Fetchers
        |
        v
12 Micro-Agents
        |
        v
Health / Anomaly Calculation
        |
        v
SectorStateStore
        |
        v
Normalized agent-signal
        |
        v
Socket.IO
        |
        +-------------------+
        |                   |
        v                   v
GHOSTNET Backend       Cascade Engine
                            |
                            v
                       Qwen 2.5
                            |
                            v
                    Cascade Reasoning
                            |
                            v
                  cascade-alert / clear
                            |
                            v
                     GHOSTNET UI
```

---

# 32. TECHNOLOGY STACK

## Frontend

- React
- Vite
- Tailwind CSS
- Recharts
- Cesium
- Resium
- Socket.IO Client
- React Router

## Backend

- Node.js
- Express
- Socket.IO
- Native JavaScript `Map`-based state store
- Node.js native test runner

## Intelligence Layer

- Python 3.11+
- FastAPI
- `python-socketio`
- `aiohttp`
- `httpx`
- Pydantic
- pandas
- openpyxl
- BeautifulSoup
- gtfs-kit
- PyTorch
- Transformers
- Local `llama-server`
- Qwen 2.5

---

# 33. PROJECT STRUCTURE

```text
GHOSTNET/
|
+-- frontend/
|   |
|   +-- src/
|   |   +-- components/
|   |   +-- context/
|   |   +-- hooks/
|   |   +-- lib/
|   |   +-- pages/
|   |   +-- App.jsx
|   |   +-- main.jsx
|   |
|   +-- package.json
|   +-- vite.config.js
|   +-- .env
|
+-- backend/
|   |
|   +-- src/
|   |   +-- agents/
|   |   +-- engine/
|   |   +-- lib/
|   |   +-- routes/
|   |   +-- socket/
|   |   +-- store/
|   |
|   +-- server.js
|   +-- app.js
|   +-- package.json
|   +-- .env
|   +-- test/
|
+-- intelligence/
|   |
|   +-- main.py
|   +-- global_config.py
|   +-- Agents/
|   +-- Cascade_Engine/
|   +-- config/
|   +-- qwen2.5run.sh
|   +-- pyproject.toml
|
+-- README.md
```

---

# 34. GETTING STARTED

GHOSTNET is composed of multiple services.

For a complete local demonstration, start:

1. The Python / AutoNet intelligence service
2. The Node.js GHOSTNET backend
3. The React frontend

---

## 34.1 Prerequisites

### Frontend

- Node.js 18+
- npm

### Backend

- Node.js 18+
- npm

### Intelligence Layer

- Python 3.11+
- pip
- Local model runtime / `llama-server`
- Qwen 2.5 model

---

# 35. BACKEND INSTALLATION

```bash
cd backend
npm install
```

Create the backend environment file:

```bash
cp .env.example .env
```

Example:

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
ALLOWED_ORIGINS=*
```

Start the backend:

```bash
npm run dev
```

or:

```bash
npm start
```

The backend should bind to:

```text
http://localhost:3001
```

Socket.IO is exposed from the same server.

---

# 36. FRONTEND INSTALLATION

```bash
cd frontend
npm install
```

Create:

```text
.env
```

Example:

```env
VITE_BACKEND_URL=http://localhost:3001
```

If Cesium is enabled, provide the corresponding Vite-exposed Cesium Ion environment variable required by the frontend implementation.

For Vite browser variables, use the `VITE_` prefix.

Start the frontend:

```bash
npm run dev
```

The Vite development server will provide the command-center interface.

---

# 37. INTELLIGENCE ENGINE INSTALLATION

```bash
cd intelligence
```

Install the Python dependencies according to the project's `pyproject.toml`.

Configure the required environment variables in `.env`.

Typical configuration includes:

```env
POLL_INTERVAL_SEC=
SOCKET_URL=
WAQI_TOKEN=
TOMTOM_API_KEY=
DELHI_TRANSIT_API_KEY=
```

Start the local Qwen runtime using:

```bash
./qwen2.5run.sh
```

Then start the Python master service:

```bash
python main.py
```

The local LLM service is expected to be available through the OpenAI-compatible endpoint used by the Cascade Engine.

---

# 38. RUNNING THE COMPLETE SYSTEM

The intended local runtime looks like:

```text
Terminal 1
-----------
Qwen / AI Runtime

Terminal 2
-----------
Python AutoNet
        |
        v
Socket.IO
        |
        v

Terminal 3
-----------
Node.js GHOSTNET Backend
        |
        v
Port 3001

Terminal 4
-----------
React Frontend
        |
        v
Browser
```

Once all services are running:

```text
AI Agents
   |
   v
Backend
   |
   v
Socket.IO
   |
   v
GhostnetContext
   |
   +---- Map
   +---- Signals
   +---- Cascades
   +---- City Incidents
   +---- Data Integrity
   +---- AI Assistant
   +---- Replay
```

---

# 39. TESTING & QUALITY ASSURANCE

The backend includes an integration/acceptance test suite using Node.js's native test runner and TAP assertions.

Run:

```bash
npm test
```

The acceptance suite validates the core operational contracts, including:

- Valid agent-signal ingestion
- State mutation for valid telemetry
- Socket.IO signal emission
- Cascade alert ingestion
- Cascade clear lifecycle
- Agent communication
- Malformed telemetry rejection
- Invalid metric/type rejection
- City incident lifecycle
- State querying
- WebSocket ingestion
- WebSocket validation rejection
- Data integrity demonstration
- Rejected telemetry not mutating live state
- `data-integrity` event emission
- No `agent-signal` emission for rejected telemetry
- Normal telemetry continuing correctly after a data-integrity event

The latest backend acceptance run contains **13 passing acceptance cases**, including the data-integrity cases.

---

# 40. DATA INTEGRITY ACCEPTANCE FLOW

The critical data-integrity contract is:

```text
POST /api/demo/data-integrity
             |
             v
Construct malformed signal
             |
             v
validateAgentSignal()
             |
             v
        REJECTED
             |
       +-----+-----+
       |           |
       v           v
No state       data-integrity
mutation          event
                   |
                   v
               Frontend
```

After the rejection, a normal valid signal must still be able to update state normally.

This demonstrates that the validation gate is protective rather than destructive.

---

# 41. ENGINEERING PRINCIPLES

## Data before decoration

Every visualization should answer a question.

## Spatial context matters

A risk without a location is incomplete.

## Time matters

A snapshot cannot fully explain a cascade.

## Cross-domain relationships matter

Environmental, mobility, infrastructure and civic systems continuously influence one another.

## Provenance matters

Live, synthetic and derived signals should remain distinguishable.

## Validation before mutation

Malformed data must not contaminate operational state.

## Explain the cascade

Do not only say:

```text
CRITICAL
```

Explain:

```text
WHY
WHERE
HOW
WHAT NEXT
```

---

# 42. THE WINNING DEMONSTRATION

The strongest GHOSTNET demonstration is a narrative rather than a feature tour.

## Scene 1 — Calm City

```text
CITY STATUS
NOMINAL
```

Show:

- 39-sector spatial mesh
- Agent network
- Live command center

---

## Scene 2 — Introduce an Anomaly

A signal arrives:

```text
SMOG & DISPERSION

Health: 31
Status: CRITICAL
```

The audience sees the anomaly before hearing the explanation.

---

## Scene 3 — Spatial Propagation

The source sector becomes active.

Nearby sectors begin receiving propagated risk.

Explain:

> "The system is not just detecting the anomaly. It is evaluating where its effects can propagate."

---

## Scene 4 — Cross-Domain Reaction

Show the agent communication chain:

```text
SMOG
  |
  v
TRANSIT
  |
  v
CONGESTION
  |
  v
METRO
```

The audience sees the relationship forming.

---

## Scene 5 — Cascade

Open cascade intelligence:

```text
CASCADE DETECTED

Confidence: 89%

Primary:
Connaught Place

Spread:
3 sectors

Triggered:
Transit
Power
Social
```

---

## Scene 6 — AI Assistant

Use the AI Assistant to interrogate the situation conversationally.

The operator can move from manually inspecting multiple panels toward asking the system for contextual explanations of the current urban state.

---

## Scene 7 — Historical Replay

Switch to Replay.

Increase speed:

```text
10x
```

Watch the cascade form.

The audience now sees not only the emergency, but the sequence that produced it.

---

## Scene 8 — Data Integrity

Trigger the controlled data-integrity demonstration.

```text
MALFORMED TELEMETRY
        |
        v
VALIDATION GATE
        |
        v
REJECTED
        |
        v
STATE PROTECTED
```

Show:

```text
REJECTED TELEMETRY
        +
LIVE TELEMETRY
```

as separate values.

Then send valid telemetry and demonstrate:

```text
DEGRADED
    |
    v
RESTORED
    |
    v
LIVE STATE SYNCHRONIZED
```

This proves that invalid telemetry is rejected without corrupting the operational state.

---

# 43. THE 90-SECOND JUDGE STORY

```text
NORMAL CITY
     |
     v
ANOMALY
     |
     v
VALIDATION
     |
     v
SPATIAL PROPAGATION
     |
     v
CROSS-DOMAIN INTERACTION
     |
     v
CASCADE DETECTION
     |
     v
CITYWIDE IMPACT
     |
     v
AI EXPLANATION
     |
     v
INTERVENTION
```

The audience should never have to imagine the cascade.

They should be able to watch it happen.

---

# 44. WHY THIS ARCHITECTURE MATTERS

The depth of GHOSTNET does not come from the number of cards on the screen.

It comes from the interaction between:

```text
DATA
  |
  v
AGENTS
  |
  v
SECTORS
  |
  v
DOMAINS
  |
  v
CASCADE
  |
  v
PREDICTION
  |
  v
INTERVENTION
```

A city signal becomes meaningful when its context is understood.

A cascade becomes meaningful when its propagation is understood.

A prediction becomes valuable when it provides enough warning to act.

---

# 45. LONG-TERM VISION

Delhi is not 39 separate sectors.

It is one interconnected system.

```text
                     +-------------+
                     | ENVIRONMENT |
                     +------+------+
                            |
                   +--------v--------+
                   |     MOBILITY    |
                   +--------+--------+
                            |
                +-----------v-----------+
                |     INFRASTRUCTURE    |
                +-----------+-----------+
                            |
                   +--------v--------+
                   |      CIVIC      |
                   +--------+--------+
                            |
                   +--------v--------+
                   |    HEALTHCARE   |
                   +-----------------+
```

The city becomes a graph.

The agents become nodes of intelligence.

The signals become observations.

The cascade becomes the prediction.

The operator gets something more valuable than another dashboard:

# TIME TO ACT.

---

# 46. SUCCESS METRIC

The ultimate metric is not:

```text
Number of charts
```

It is not:

```text
Number of AI agents
```

It is:

```text
WARNING TIME
```

If GHOSTNET can identify a developing cross-domain failure before it becomes obvious to a human operator, the system has created operational value.

The desired progression is:

```text
INCIDENT
   ^
   |
DETECTED
   |
TOO LATE
   |
-------------------------
   |
GHOSTNET
   |
   v
EARLY WARNING
   |
   v
INTERVENTION
   |
   v
FAILURE REDUCED
```

---

# 47. FUTURE EVOLUTION

The architecture allows additional capabilities without replacing the core system.

Potential future extensions include:

```text
Forecast Calibration
        |
        v
Prediction Accuracy
        |
        v
False Positive Analysis
        |
        v
Intervention Outcome Tracking
        |
        v
Model Feedback
        |
        v
Improved Cascade Prediction
```

The long-term objective is to move from:

```text
DETECTION
```

to:

```text
PREDICTION
```

and eventually:

```text
PRESCRIPTION
```

---

# 48. FINAL PHILOSOPHY

A normal dashboard asks:

```text
Which sensor is bad?
```

GHOSTNET asks:

```text
Which relationships are becoming dangerous?
```

A normal alert asks:

```text
What happened?
```

GHOSTNET asks:

```text
What happened?
Where?
Why?
What is it affecting?
Where will it spread?
How confident are we?
What should operators do?
```

A normal historical chart shows:

```text
PAST -> PRESENT
```

GHOSTNET attempts to reconstruct:

```text
PAST
 |
 v
CAUSE
 |
 v
PROPAGATION
 |
 v
CASCADE
 |
 v
FAILURE
```

That is the core philosophy of the platform.

---

# GHOSTNET

## See the signal.

## Understand the relationship.

## Predict the cascade.

## Protect the city before the failure becomes systemic.

> **Built for the city that has not failed yet.**
