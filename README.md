# GhostNet — Urban Early Warning Engine

Real-time multi-agent AI system monitoring Delhi's air quality, transport, and social sentiment. Detects cascade risk across domains and fires alerts before emergencies escalate.


## Architecture

```
AutoNet (Python/FastAPI)          ghostnet-backend (Node.js)        Frontend (React/Vite)
─────────────────────────         ──────────────────────────         ─────────────────────
air_analysis agent          →     POST /signals                →     AgentCard
transit_analysis agent      →     POST /signals                →     SignalFeed
sentiment_analysis agent    →     POST /signals                →     Dashboard
cascade_detector            →     POST /cascade-alert          →     CascadeBar / CascadeModal
                                  GET  /system-state           ←     cascade_detector (polls)
                                  Socket.io (agent-signal)     →     live feed
                                  Socket.io (cascade-alert)    →     alert banner
                                  Socket.io (cascade-clear)    →     clear banner
```


## Repos

| Layer | Stack |
|-------|-------|
| Backend | Node.js, Express, Socket.io |
| AI Agents | Python, FastAPI, httpx, uv |
| Frontend | React, Vite, Socket.io-client |

Backend branch: `backend` — `github.com/Tushar-bit01/GhostNet`


## Backend

### Setup

```bash
cd ghostnet-backend
npm install
cp .env.example .env   # fill in PORT
node server.js
```

Runs on `http://localhost:3001` by default.

### Routes

#### Signals

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/signals` | Receive agent signal. Validates schema, rejects stale (>25h) timestamps. Emits `agent-signal` via Socket.io. |
| `GET` | `/signals/latest` | Last signal per agent (`currentSystemState` map). |
| `GET` | `/signals/history` | All signals from last 24h (max 1440). |

Signal schema:
```json
{
  "agentId": "air_quality",
  "domain": "air-quality",
  "healthScore": 72,
  "anomalyLevel": "moderate",
  "signal": "PM2.5 rising in Anand Vihar",
  "timestamp": "2026-06-13T10:00:00Z"
}
```

`anomalyLevel` values: `good` | `moderate` | `warning` | `critical`

#### Cascade

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/cascade-alert` | Receive cascade from Python detector. 5s debounce guard. Emits `cascade-alert` via Socket.io. |
| `POST` | `/cascade-clear` | Clear active cascade. Idempotent. Emits `cascade-clear`. |
| `GET` | `/cascade-history` | Full audit trail of all past cascades. |
| `GET` | `/test` | Re-emits last received cascade. Debug only — hit `/cascade-alert` first. |

Cascade schema:
```json
{
  "confidence": 74,
  "predictedEvent": "Severe regional smog emergency",
  "hoursUntil": 36,
  "recommendation": "Issue immediate public health advisory",
  "agentsTriggered": ["air_quality", "sentiment"],
  "timestamp": "2026-06-13T10:00:00Z"
}
```

#### System State

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/system-state` | Returns current state of all agents as array. Polled by cascade detector. |

#### Replay

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/replay/dates` | Available replay dates. |
| `GET` | `/replay/:date` | Signals for a given date, sorted by timestamp. |
| `GET` | `/replay/:date/stream` | SSE stream — replays signals with real time delays. |

### Socket.io Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `agent-signal` | Server → Client | Signal object |
| `cascade-alert` | Server → Client | Cascade object |
| `cascade-clear` | Server → Client | `{ clearedAt }` |
| `agent-comms` | Server → Client | Inter-agent communication |

### Storage

All data is in-memory. No database. Resets on server restart.

| Store key | Contents | Cap |
|-----------|----------|-----|
| `signals` | Raw signal array | 1440 entries / 24h window |
| `currentSystemState` | Latest signal per agent | No cap (3 agents) |
| `activeCascade` | Current active cascade | 1 (overwritten on new alert) |
| `cascadeHistory` | All past cascades | No cap |
| `replayData` | Seeded historical signals | Static |


## Python Agents (AutoNet)

### Setup

```bash
cd AutoNet/agents
uv sync
cp .env.example .env   # fill in API keys and NODE URLs
uv run python main.py
```

### Agents

**air_analysis** — Fetches AQI data from AQICN and government APIs. Computes `healthScore` and `anomalyLevel`. Posts to `/signals`.

**transit_analysis** — Monitors Delhi metro and road transport. Posts to `/signals`.

**sentiment_analysis** — Runs NLP pipeline on social data. Posts to `/signals`.

**cascade_detector** — Polls `/system-state` every `EVALUATION_INTERVAL` seconds. Runs weighted risk matrix:

| Agent | Weight |
|-------|--------|
| air_quality | 0.40 |
| transport | 0.35 |
| sentiment | 0.25 |

Fires `POST /cascade-alert` when cascade score ≥ 0.65. Confidence computed as `100 - mean(triggeredAgentHealthScores)`.

### Config (`cascade_detector/config.py`)

```
NODE_CASCADE_ALERT_URL   — POST target for alerts
NODE_LATEST_STATE_URL    — GET source for system state
EVALUATION_INTERVAL      — Poll interval in seconds
```


## Frontend

### Setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_BACKEND_URL=http://localhost:3001
npm run dev
```

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Live agent cards, signal feed, cascade banner |
| Cascade Log | `/cascade-log` | History of all past cascades |
| Nervous System | `/nervous-system` | System topology view |
| Replay | `/replay` | Historical signal playback by date |

### State

All live state lives in `GhostnetContext`. Socket connection managed by `useSocket` hook.

```
GhostnetContext
├── signals        — latest signal per agent
├── feed           — last 50 signals (newest first)
├── cascade        — active cascade or null
├── cascadeHistory — all cascades this session
└── connected      — socket connection status
```


## Environment Variables

### Backend (`.env`)
```
PORT=3001
```

### Frontend (`.env`)
```
VITE_BACKEND_URL=http://localhost:3001
```

### Python (`.env`)
```
NODE_CASCADE_ALERT_URL=http://localhost:3001/cascade-alert
NODE_LATEST_STATE_URL=http://localhost:3001/system-state
EVALUATION_INTERVAL=60
```


## Team

| Member | Owns |
|--------|------|
| Piyush | Node.js backend, Socket.io, in-memory store, replay engine |
| Divyanshu | Python AI agents, cascade detector, NLP pipeline |
| Tushar | React frontend, dashboard, Replay, Scoket.io |

---

## Notes

- Backend has no persistence — all data resets on restart. This is intentional for the demo scope.
- The `/test` endpoint re-emits the last cascade received via `/cascade-alert`. It will 404 if no real cascade has been received yet in the current session.
- Cascade cooldown is 5 seconds — the detector will get a 429 if it fires too fast. This is a debounce, not a block.
