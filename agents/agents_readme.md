# AutoNet Delhi
> Real-time urban resilience intelligence for Delhi: a multi-agent monitoring mesh that fuses live infrastructure telemetry, local LLM cascade reasoning, and event-driven signal propagation across critical sectors.

---

## 🛠️ System Architecture & Key Components

`AutoNet Delhi` is a Python-first, event-driven monitoring and decision-support system designed around sector-level autonomous agents and a central cascade engine. The project uses a `FastAPI` application in `main.py` as the master orchestrator, a single shared `socketio.AsyncClient` for all agent traffic, and a local Qwen 2.5 model served through `llama-server` to evaluate cascade risk from aggregated sector health signals.

### Core execution model

- `main.py` defines the application lifecycle through `master_lifespan()`, which:
  1. starts the local Qwen 2.5 brain via `qwen2.5run.sh`,
  2. connects the shared Socket.IO client to `SOCKET_URL`,
  3. instantiates the central in-memory telemetry store, and
  4. boots every configured sector agent.
- Each agent conforms to the abstract contract in `Agents/BaseAgent.py` and runs in its own asynchronous loop with a per-domain offset and per-sector jitter to stagger telemetry bursts.
- Every agent writes its latest state to `SectorStateStore` and emits a normalized JSON payload over the `agent-signal` event when its Socket.IO connection is active.
- The `CascadeEngine` in `Cascade_Engine/cascade_engine.py` periodically examines the store, invokes the Qwen model with structured prompts, and emits `cascade-alert`, `cascade-clear`, and `city-cascade` events to the backend.

### Primary components

- `main.py`
  - Master FastAPI app and lifecycle manager.
  - Exposes `/health`, `/api/sectors/store`, and `/api/cascade/trigger-now` endpoints.
  - Manages agent bootstrapping, teardown, and brain lifecycle.

- `config/sector_config.py`
  - Defines the `SectorConfig` Pydantic schema that captures spatial, infrastructure, and domain metadata such as `sector_id`, `lat`, `lng`, `primary_corridor_name`, `rated_substation_capacity_mw`, and emergency/healthcare baselines.

- `config/sector_registry.py`
  - Loads the Delhi sector registry used to instantiate real-world monitoring contexts across the city.
  - Organizes sector metadata for districts, anchor sectors, drainage systems, metro resources, underpasses, hospitals, and civic chokepoints.

- `Agents/`
  - Contains the sector-aware micro-agents for environment, transit, and civic infrastructure monitoring.
  - Each domain folder follows the same pattern: `agent.py` for runtime orchestration, `[domain]_model.py` for calculations, and `[domain]_api_fetcher.py` for external or synthetic data collection.
  - Concrete agents include `GenericSmogAgent`, `GenericWaterloggingAgent`, `GenericThermalAgent`, `GenericTransitAgent`, `GenericRoadCorridorAgent`, `GenericPowerGridAgent`, `GenericIndustrialHazardAgent`, `GenericHospitalCapacityAgent`, `GenericEmergencyDispatchAgent`, `GenericSocialPanicAgent`, `GenericMuncipalAdvisoryAgent`, and `GenericMetroTransitAgent`.

- `Cascade_Engine/sector_state_store.py`
  - Provides `SectorRecord` and `SectorStateStore`, the central in-memory telemetry buffer.
  - Keeps a ring buffer of recent sector snapshots and enforces a "worst health score wins" policy when multiple domains report different conditions for the same sector.

- `Cascade_Engine/cascade_engine.py`
  - Implements `CascadeEngine`, a standalone loop that runs on an evaluation cadence and can trigger immediate evaluations.
  - Uses `QwenLLMClient` to send OpenAI-compatible requests to `http://localhost:8080/v1/chat/completions` with structured JSON responses.
  - Produces sector-level forecast alerts and aggregated citywide rollups.

- `mock_backend.js`
  - Lightweight Node.js + Socket.IO receiver used as the event sink for live telemetry and cascade events.
  - Listens for `agent-signal`, `cascade-alert`, `cascade-clear`, and `city-cascade` payloads.

- `qwen2.5run.sh`
  - Bash script that starts and stops the local `llama-server` instance loaded with the Qwen 2.5 Coder 7B model.
  - Runs the model on port `8080` and writes logs to the local model directory.

### Data flow and design patterns

1. `global_config.py` reads runtime configuration from environment variables and `.env` values, including `POLL_INTERVAL_SEC`, `SOCKET_URL`, `WAQI_TOKEN`, `TOMTOM_API_KEY`, and `DELHI_TRANSIT_API_KEY`.
2. `master_lifespan()` starts the local model and opens the persistent Socket.IO client.
3. Agent constructors receive the same `sio` client, store, and `SectorConfig` instance for each sector.
4. Each domain agent does a fetch/compute/store/emit cycle:
   - fetch telemetry from a source such as AQI, GTFS-RT, TomTom traffic, or synthetic fallback data,
   - compute a model-based health score and anomaly level,
   - persist the record in `SectorStateStore`,
   - emit a standardized event payload to the backend.
5. The `CascadeEngine` reads the store and asks the local LLM for structured sector and city risk synthesis.
6. Results are emitted back over Socket.IO for downstream dashboards, console logging, or incident triage.

### Technology stack

- Python 3.11+
- `FastAPI` for the master service and health endpoints
- `python-socketio` + `aiohttp` for the shared async WebSocket client
- `httpx` for HTTP calls to live APIs and the local OpenAI-compatible LLM endpoint
- `pydantic` for `SectorConfig` validation and structured LLM response models
- `pandas`, `openpyxl`, `BeautifulSoup`, and `gtfs-kit` for data ingestion and geospatial transport workflows
- `torch` and `transformers` for model-backed AI processing
- Node.js + `socket.io` for the mock receiver backend
- Local `llama-server` with a Qwen 2.5 model for structured cascade scoring and city rollups

---

## 📂 Directory Structure

```text
root/
├── main.py                           # FastAPI master orchestrator; boots the brain, sockets, and all agents
├── global_config.py                  # Reads environment variables such as `POLL_INTERVAL_SEC`, `SOCKET_URL`, and API keys
├── qwen2.5run.sh                     # Starts/stops the local llama.cpp Qwen 2.5 brain on port 8080
├── mock_backend.js                   # Node.js Socket.IO receiver for `agent-signal`, `cascade-alert`, and `city-cascade`
├── pyproject.toml                    # Python project metadata and dependency list
├── package.json                      # Node.js dependency metadata (`socket.io`)
├── .env                              # Local environment configuration loaded with `python-dotenv`
├── context.md                        # Project architecture notes and protocol references
├── delhi_stations.csv                # WAQI station inventory used for Delhi-sector location metadata
├── sdlc.html                         # HTML/offline design artifact for system life-cycle or architecture review
├── test.py                           # Simple HTTP/HTML fetch smoke-check for downstream data sources
├── unistat.py                        # Utility for collecting WAQI station data and writing Delhi station CSVs
├── __init__.py                       # Package marker for the root project module
├── Agents/                           # Domain-specific autonomous monitoring agents
│   ├── BaseAgent.py                  # Abstract async contract used by every agent (`start`, `stop`, `_run_loop`, `step`)
│   ├── Arterial_Congestion_agent/     # `GenericRoadCorridorAgent` + TomTom corridor congestion logic
│   │   ├── agent.py
│   │   ├── corridor_api_fetcher.py
│   │   └── corridor_model.py
│   ├── Emergency_Dispatch_agent/      # `GenericEmergencyDispatchAgent` for 112/emergency response monitoring
│   │   ├── agent.py
│   │   ├── dispatch_data_fetcher.py
│   │   └── dispatch_model.py
│   ├── Hospital_Capacity_agent/       # `GenericHospitalCapacityAgent` for ICU, bed, and casualty pressure
│   │   ├── agent.py
│   │   ├── hospital_api_fetcher.py
│   │   └── capacity_model.py
│   ├── Metero_Transit_agent/          # `GenericMetroTransitAgent` for metro congestion and interchange load
│   │   ├── agent.py
│   │   ├── metero_fetcher.py
│   │   ├── metero_model.py
│   │   └── data/
│   │       └── view.ipynb
│   ├── Muncipal_Advisory_agent/       # `GenericMuncipalAdvisoryAgent` for civic advisories and event closures
│   │   ├── agent.py
│   │   ├── advisory_data_fetcher.py
│   │   └── advisory_model.py
│   ├── Power_Grid_agent/              # `GenericPowerGridAgent` for grid capacity and load risk
│   │   ├── agent.py
│   │   ├── sdlc_api_fetcher.py
│   │   └── grid_model.py
│   ├── Smog_and_Dispersion_agent/     # `GenericSmogAgent` + AQI and plume behavior analytics
│   │   ├── agent.py
│   │   ├── api_fetcher.py
│   │   └── plume_model.py
│   ├── Social_Panic_Agent/            # `GenericSocialPanicAgent` for public sentiment and crowd risk cues
│   │   ├── agent.py
│   │   ├── social_data_fetcher.py
│   │   └── panic_model.py
│   ├── Structural_Industrial_Hazard_agent/  # `GenericIndustrialHazardAgent` for industrial risk and chemical hazards
│   │   ├── agent.py
│   │   ├── dfs_incident_fetcher.py
│   │   └── hazard_model.py
│   ├── Thermal_Stress_agent/          # `GenericThermalAgent` for UHI and heat-stress monitoring
│   │   ├── agent.py
│   │   ├── weather_api_fetcher.py
│   │   └── thermal_model.py
│   ├── Transit_Fleet_agent/           # `GenericTransitAgent` for public transport bottlenecks and fleet stationary ratios
│   │   ├── agent.py
│   │   ├── gtfs_fetcher.py
│   │   └── mobility_model.py
│   ├── Waterloggin_Hydrology_agent/   # `GenericWaterloggingAgent` for drainage overload and underpass flooding
│   │   ├── agent.py
│   │   ├── rain_api_fetcher.py
│   │   └── hydrology_model.py
│   └── __init__.py
├── Cascade_Engine/                   # Cascade-level reasoning and coordinated citywide alerting
│   ├── cascade_engine.py             # `CascadeEngine`, `QwenLLMClient`, and structured alert rollup orchestration
│   ├── cascade_prompts.py            # Prompt templates for sector alerts and citywide synthesis
│   ├── sector_state_store.py         # `SectorRecord` and `SectorStateStore` in-memory state management
│   └── __pycache__                   # Python bytecode cache
├── config/                           # Shared configuration and Delhi sector registry
│   ├── __init__.py
│   ├── sector_config.py              # `SectorConfig` schema for per-sector monitoring metadata
│   └── sector_registry.py            # Delhi sector definitions used to bootstrap monitoring agents
└── .gitignore                        # Repository ignore rules
```
