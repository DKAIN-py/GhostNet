# AutoNet Agent Catalog

This document explains every agent in the AutoNet Delhi monitoring mesh: what each agent measures, how it converts raw telemetry into a health score, what it emits to the system, and what operational decisions can be inferred from each signal.

The system is built around a common contract: every agent runs an async `step()` loop, updates the shared `SectorStateStore`, and emits a normalized payload on the Socket.IO event named `agent-signal` when connected. The payload always contains at least:

- `sectorId`
- `district`
- `agentId`
- `domain`
- `healthScore`
- `anomalyLevel`
- `metricValue`
- `signal`
- `isLiveAnchor`
- `location`
- `timestamp`

These signals are then read by the central `CascadeEngine`, which reasons over multi-sector risk and triggers higher-level citywide alerts.

---

## Agent Summary Matrix

| Agent Class | agent_id | Domain | Primary Question It Answers | Core Output |
| --- | --- | --- | --- | --- |
| `GenericSmogAgent` | `smog_dispersion` | `environment` | Is the local air quality degrading and are pollutants drifting toward adjacent sectors? | PM2.5-based AQI risk + downwind plume projection |
| `GenericWaterloggingAgent` | `waterlogging_hydrology` | `environment` | Is rainfall overwhelming drainage and creating flood depth risk, especially in underpasses? | Water depth + drain saturation + flood forecast |
| `GenericThermalAgent` | `thermal_stress` | `environment` | Is the urban heat island creating dangerous feels-like temperatures and power stress? | Feels-like temperature + transformer trip risk |
| `GenericTransitAgent` | `transit_fleet` | `transit` | Are buses stalling to the point of route gridlock and service failure? | Fleet stationary ratio + delay and gridlock risk |
| `GenericMetroTransitAgent` | `metro_transit` | `transit` | Is a metro interchange becoming overcrowded enough to close gates or create surges? | Platform capacity + gate-throttling risk |
| `GenericRoadCorridorAgent` | `road_corridor` | `transit` | Is the arterial corridor slowing enough to create congestion and queue spillover? | Congestion %, jam length, upstream spillover |
| `GenericPowerGridAgent` | `power_grid` | `infrastructure` | Is the local substation overloaded, causing possible feeder trips and blackout risk? | Load %, frequency, feeder outage, restoration window |
| `GenericIndustrialHazardAgent` | `industrial_hazard` | `infrastructure` | Is a plant or industrial facility creating a chemical/fire hazard requiring evacuation or road closure? | Hazard grade, containment time, closure radius |
| `GenericHospitalCapacityAgent` | `hospital_capacity` | `infrastructure` | Are ICU beds, oxygen reserves, and ER capacity under pressure? | ICU occupancy + ambulance diversion status |
| `GenericEmergencyDispatchAgent` | `emergency_dispatch` | `civic` | Is emergency call volume spiking beyond normal and creating response strain? | Call surge ratio + first-responder exhaustion |
| `GenericSocialPanicAgent` | `social_panic` | `civic` | Is public sentiment becoming panicked and virally propagating crisis narratives? | Panic score + misinformation risk |
| `GenericMuncipalAdvisoryAgent` | `traffic_news` | `civic` | Are official closures, police advisories, or diversion events disrupting mobility? | Road closure severity + reroute risk |

---

## 1) `GenericSmogAgent` (`smog_dispersion`)

### What it does
This agent monitors particulate pollution and atmospheric stagnation in a sector. It fetches AQI form data for a configured monitoring station (or a synthetic fallback if the sector is not the live anchor) and converts the observation into a sector health signal.

### What it computes
The agent primarily uses:

- `pm25` concentration
- visibility in meters
- wind speed in km/h
- wind direction in degrees

From these it computes:

- `PlumeDispersionModel.calculate_health_score(pm25, visibility_m)`
  - returns a sector health score from 0 to 100
  - classifies anomaly as `nominal`, `warning`, or `critical`
- `calculate_stagnation_index(wind_speed_kmh)`
  - estimates how trapped the air mass is, where values close to 1.0 imply stable, stagnant air
- `predict_downwind_sectors(wind_dir_deg, wind_speed_kmh)`
  - projects likely neighboring sectors that will receive moving smoke/plume impact

### How it computes it
The model uses a thresholded PM2.5 scale and visibility penalty:

- PM2.5 <= 30 → near-normal
- PM2.5 30–120 → degraded and warning range
- PM2.5 > 250 → severe health risk
- visibility below 500m adds further penalty

This makes the health score degrade as pollution and haze intensify. Stagnation is approximated using an exponential decay on wind speed, so low wind means poor dispersion.

### What it does with the result
The payload includes:

- `metrics` with AQI values and computed stagnation
- `diffusionForecast` with `targetSectorIds` and `estimatedArrivalMins`
- `signal` describing whether severe PM2.5 is expected to drift toward adjacent sectors

It writes to `SectorStateStore` and emits `agent-signal` on the shared Socket.IO client.

### What we can infer from the signal
From a smog signal, the system can infer:

- whether the sector is entering a pollution episode
- if inversion or stagnation is trapping pollutants
- which neighboring sectors are likely to receive the plume next
- whether a cascade event may emerge from air-quality stress affecting hospitals, transit, and public safety

A critical signal is effectively a warning that pollution is not just local—it is spreading and may begin to degrade the citywide operating environment.

---

## 2) `GenericWaterloggingAgent` (`waterlogging_hydrology`)

### What it does
This agent models urban drainage failure. It looks at rainfall intensity, accumulated rainfall, and the drain capacity baseline for each sector to forecast water depth and underpass flooding.

### What it computes
Using `HydrologyModel` it calculates:

- drain capacity remaining as a percentage
- standing water depth in centimeters
- 30-minute projected flood depth
- normalized health score based on water depth and whether an underpass is flooded

Main calculations:

- `calculate_drain_capacity_pct(accumulated_rain_24h_mm)`
- `calculate_water_depth_cm(rainfall_rate_mmhr, drain_capacity_mmhr, has_underpass, pump_status)`
- `predict_30min_depth_cm(current_depth_cm, rainfall_rate_mmhr, has_underpass)`
- `calculate_health_score(water_depth_cm, underpass_flooded)`

### How it computes it
The model assumes rainfall above the local drainage threshold creates runoff. If the sector contains an underpass, the pooling multiplier is larger, and pump failure raises the depth much faster. Standing-water risk is treated as a function of:

- rain intensity
- 24-hour rainfall accumulation
- drain base capacity
- underpass geometry
- pump health condition

### What it does with the result
The agent emits:

- `metricValue`: water depth in centimeters
- `metrics` with rainfall, drain capacity, underpass status, and pump status
- `floodForecast` with projected depth and whether roads or buses may become impassable

It then stores the result in the sector store and emits the signal to the backend.

### What we can infer from the signal
This signal tells us whether urban flooding is likely to become a mobility hazard. If `underpassFlooded` or `impassableForBuses` turns true, the system can infer:

- bus routes may be blocked
- emergency response may be delayed
- road congestion may spike in adjacent corridors
- the sector’s health score is likely to degrade even if other domains remain nominal

It is a strong operational signal for transportation and civic management teams.

---

## 3) `GenericThermalAgent` (`thermal_stress`)

### What it does
This agent models urban heat stress and local thermal overload. It looks at weather, humidity, solar radiation, and the sector’s degree of concrete density to estimate heat stress and indirect electrical risk.

### What it computes
Key calculations include:

- `calculate_feels_like_c(temp_c, humidity_pct)` using a heat-index style approximation
- `calculate_surface_temp_c(ambient_temp_c, solar_irradiance_wm2, is_concrete_dense)`
- `calculate_uhi_delta_c(ambient_temp_c, uhi_baseline_offset_c, is_concrete_dense)`
- `calculate_grid_load_impact(feels_like_c)` for electrical demand surge
- `classify_transformer_trip_risk(feels_like_c, surface_temp_c)`
- `classify_heatstroke_risk(feels_like_c)`
- `calculate_health_score(feels_like_c, transformer_risk)`

### How it computes it
The model treats dense concrete zones as stronger heat accumulators. It blends humidity and temperature into a discomfort metric to estimate how hot the sector feels. It also estimates localized power-stress risk and transformer failure probability when the environment is extreme.

### What it does with the result
The agent creates a payload with:

- `thermalForecast` containing `gridLoadImpactPct`, `transformerTripRisk`, and `heatstrokeRiskIndex`
- `metrics` with ambient and feels-like temperatures, surface temp, and humidity

The data is stored and emitted to the central monitoring stream.

### What we can infer from the signal
A thermal signal tells us whether the sector is likely to suffer from:

- public heat stress and health risk
- power-grid overload because cooling demand spikes
- transformer failure or load shedding risk
- secondary cascading effects on hospitals, grid reliability, and social panic

This is one of the most important environmental triggers because it can degrade both infrastructure and human resilience simultaneously.

---

## 4) `GenericTransitAgent` (`transit_fleet`)

### What it does
This agent models public bus fleet performance using GTFS-RT style fleet telemetry. It measures how many buses are stopped versus active and estimates whether corridor flow is deteriorating toward gridlock.

### What it computes
Main model logic:

- `calculate_stationary_ratio(stopped_buses, total_active_buses)`
- `calculate_avg_speed_mps(stationary_ratio)`
- `calculate_route_delay_mins(stationary_ratio, active_buses)`
- `classify_gridlock_risk(stationary_ratio, avg_speed_mps)`
- `calculate_health_score(stationary_ratio, gridlock_risk)`

### How it computes it
The model treats the fraction of stationary buses as the strongest signal. A high stationary ratio implies low average speed, high route delay, and imminent service collapse. The higher the proportion of stopped buses, the more likely the corridor is entering congestion or shutdown.

### What it does with the result
It builds a bus-network signal with:

- `metricValue` like `72.0% Fleet Stationary`
- `metrics` including `totalActiveBuses`, `stoppedBuses`, `stationaryRatio`, `avgFleetSpeedMps`
- `bottleneckForecast` with route delay and gridlock risk

The result is updated in the store and emitted via socket.

### What we can infer from the signal
This signal tells us:

- whether public transport is failing in a given sector
- if current bus service can maintain commuter flow
- whether route delays are spilling into nearby corridor stress
- whether a transit collapse is likely to worsen civic disruption or induce panic behavior

This is a direct operational indicator of transit resilience.

---

## 5) `GenericMetroTransitAgent` (`metro_transit`)

### What it does
This agent monitors metro interchange crowd density and platform throughput. It estimates whether a station is becoming overcrowded enough to impact entry gates, wait times, and crowd spillover onto streets.

### What it computes
The `MetroModel` calculates:

- platform capacity percentage relative to total gate throughput capacity
- number of throttled gates required to avoid crush conditions
- average platform wait time
- surge forecast with gate closure risk, overflow risk, and time-to-lock estimates
- final sector health score

### How it computes it
It approximates crowding by comparing passenger inflow per minute against supported gate throughput. Once inflow exceeds a threshold, the model begins limiting gate access and raises estimated wait time. If crowding continues, a station can reach gate-closure or lock conditions.

### What it does with the result
It emits:

- `metricValue` like `86.0% Platform Capacity`
- `metrics` with inflow, gate count, throttled gate count, and average wait time
- `surgeForecast` with closure risk and overflow ratio

This signal is then stored and emitted for downstream citywide coordination.

### What we can infer from the signal
A metro signal indicates whether the station is close to:

- over-crowding
- gate lock or platform shutdown
- street-level overflow into surrounding roads
- delays that propagate to other transit modes

This is a strong indicator of localized mobility and crowd-management risk.

---

## 6) `GenericRoadCorridorAgent` (`road_corridor`)

### What it does
This agent measures arterial traffic conditions and queue build-up to estimate corridor degradation, delay, and upstream spillover.

### What it computes
It computes:

- congestion percentage as a ratio of current vs free-flow speed
- average delay over a 5 km corridor segment
- projected speed in 20 minutes
- bus infiltration classification (low/medium/high)
- health score and anomaly level based on current speed and congestion

### How it computes it
The model compares current speed against an expected free-flow speed. As speed falls, the congestion ratio and delay index rise. When current speed drops below a threshold, the corridor enters a critical anomaly state and spillover risk rises.

### What it does with the result
It emits:

- `metricValue` like `68.2% Congestion`
- `metrics` with speed, jam length, bottleneck type, and delay index
- `corridorForecast` with predicted speed, upstream spillover sector, and recommended bypass route

This is then stored and emitted through the common signal channel.

### What we can infer from the signal
The corridor signal tells us:

- if the road network is entering traffic paralysis
- how much queue spillover is likely to reach upstream sectors
- whether bus corridors are being overtaken by general traffic
- which bypass or reroute path may help relieve conditions

This is one of the strongest geospatial indicators for network-level mobility disruption.

---

## 7) `GenericPowerGridAgent` (`power_grid`)

### What it does
This agent evaluates the health of a substation and its impact on the grid. It monitors grid frequency, transformer load, and estimated feeder trips to alert the system to power degradation or outages.

### What it computes
`PowerGridModel.evaluate_grid_health()` calculates:

- transformer load percentage
- tripped feeder count
- whether traffic signals are offline
- whether a commercial blackout is likely
- health score and anomaly level
- cascade trip risk and estimated restoration time

### How it computes it
The model blends:

- grid frequency deviation from 50Hz
- substation load relative to rated capacity
- threshold-based penalties for overload and instability

If load is high enough or frequency drops low enough, the system marks the subsystem as critical and projects potential feeder trips and blackout conditions.

### What it does with the result
The payload includes:

- `metricValue` like `91.4% Substation Load (49.6Hz)`
- `metrics` with transformer load, grid frequency, active feederr count, traffic signals offline flag
- `gridForecast` containing cascade trip risk and estimated restoration time

It stores the value and emits the signal through Socket.IO.

### What we can infer from the signal
From this signal, we can infer whether there is:

- a potentially cascading grid outage
- risk to traffic lights and urban traffic control
- outage risk to commercial and residential loads
- dependency risk for other sectors that depend on electricity, such as hospitals, transit, and cooling systems

This is a crucial infrastructure sentinel because electrical stress can cascade across many domains.

---

## 8) `GenericIndustrialHazardAgent` (`industrial_hazard`)

### What it does
This agent is designed for high-risk industrial or chemical zones. It tracks whether an incident such as a fire, explosion, or toxic plume is unfolding and calculates the risk radius and possible road closure requirements.

### What it computes
The `IndustrialHazardModel` produces:

- hazard severity grade
- evacuation radius in meters
- road closure enforcement decision
- plume drift direction
- estimated containment hours
- urgency level
- normalized health score and anomaly level

### How it computes it
The model classifies incidents by type and by scale of deployed fire tenders, then applies penalties for:

- chemical leaks or explosions
- plume toxicity
- large emergency response footprint

The result is a severity-based evaluation with a projected evacuation radius and emergency route closure impact.

### What it does with the result
It emits a payload with:

- `metricValue` like `Category-3 (Major) Fire/Hazard`
- `metrics` for incident type, fire tenders, active chemical agent, and evacuation radius
- `hazardForecast` with plume direction, containment hours, urgency, and road diversion impact

The signal is persisted and broadcast to downstream consumers.

### What we can infer from the signal
This signal tells us whether a local industrial site is generating a toxic or structural hazard that could affect nearby communities. It implies an immediate need to:

- restrict roads and control evacuation corridors
- trigger emergency traffic rerouting
- elevate citywide risk if plume drift reaches transport or dense residential zones

This is a primary hazard escalation signal for infrastructure and safety teams.

---

## 9) `GenericHospitalCapacityAgent` (`hospital_capacity`)

### What it does
This agent monitors hospital ICU and emergency-room pressure. It estimates whether a major facility is approaching saturation and whether ambulances should be diverted to backup facilities.

### What it computes
The model calculates:

- ICU occupancy percentage
- time to ICU saturation
- health score from ICU vacancy and surge pressure
- triage diversion activity
- anomaly level based on occupancy and emergency load

### How it computes it
The model compares total ICU capacity against available beds, emergency respiratory admissions per hour, oxygen reserve, and ambulance queue length. The result penalizes the health score as occupancy, oxygen stress, and emergency surge increase.

### What it does with the result
It emits:

- `metricValue` like `88% ICU Occupancy`
- `metrics` with total ICU, available ICU, oxygen reserve, ambulance queue, ventilators in use
- `healthcareForecast` with `estimatedTimeToIcuSaturationHours` and `triageDivertingActive`

These values are updated in the master store and pushed to the signal stream.

### What we can infer from the signal
A hospital signal indicates:

- whether emergency units are near saturation
- if ambulance diversion is active
- whether respiratory and respiratory-support demand is crossing operational thresholds
- if the hospital could become a bottleneck during a multi-sector cascade

This is a critical life-support signal and often a key factor in city-level emergency escalation.

---

## 10) `GenericEmergencyDispatchAgent` (`emergency_dispatch`)

### What it does
This agent measures emergency call demand and system strain. It treats 112 call volume as a near-real-time proxy for ground-level crisis intensity, especially when direct sensors are delayed or absent.

### What it computes
The dispatch model calculates:

- surge ratio against baseline call volume
- predicted response time with backlog impact
- first-responder exhaustion level
- health score based on surge, backlog, and latency
- anomaly classification

### How it computes it
It compares current calls/minute to baseline, then applies penalties for queue backlog and beyond-threshold response latency. The result captures both incoming demand and system capacity degradation.

### What it does with the result
The emitted payload contains:

- `metricValue` such as `12 calls/min (3.1x surge)`
- `metrics` with call volume, active dispatch count, category, response time, backlog
- `dispatchForecast` with responder exhaustion and hotspot corridor

It updates the shared store and emits the signal.

### What we can infer from the signal
This signal tells us whether the city’s emergency response network is being overrun. It can imply:

- mass casualty or incident escalation
- severe congestion in specific corridors or hotspots
- under-resourced emergency response
- high need for cross-agency coordination or medical escalation

This is the operational pulse of real-time crisis demand.

---

## 11) `GenericSocialPanicAgent` (`social_panic`)

### What it does
This agent observes geolocated social discourse and NLP-derived emotion signals. It attempts to detect whether panic is spreading in a sector based on a mix of social posts, sentiment, keywords, and virality.

### What it computes
The `SocialPanicModel` computes:

- crisis severity (`NOMINAL`, `ELEVATED`, `HIGH`, `CRITICAL`)
- propagation velocity (`STABLE`, `LINEAR`, `EXPONENTIAL`)
- misinformation risk
- health score from panic sentiment, negative sentiment %, keyword velocity, and viral post count

### How it computes it
The model increases the penalty as:

- RoBERTa panic score rises
- negative sentiment becomes dominant
- keywords accelerate in volume
- viral posts spike

A critical signal emerges from a combination of high emotional intensity and social spread beyond a local context.

### What it does with the result
The signal payload includes:

- `metricValue`: RoBERTa panic score
- `metrics` with processed posts, sentiment ratio, keyword velocity, and top keywords
- `panicForecast` with `perceivedCrisisSeverity`, `panicPropagationVelocity`, and `misinformationRiskIndex`

It is stored and emitted as an `agent-signal` event.

### What we can infer from the signal
This provides a warning that public trust, operational clarity, or crowd behavior may be degrading. It helps infer:

- mass fear or rumor propagation
- civic disturbance potential
- diffuse public risk perception beyond measured infrastructure damage
- which downstream sectors may be emotionally or socially impacted next

This is a crucial “human layer” signal because crisis perception can amplify or distort operational reality.

---

## 12) `GenericMuncipalAdvisoryAgent` (`traffic_news`)

### What it does
This agent monitors official advisories, police notices, public traffic news, and route closure announcements. It reflects policy- or human-generated disruptions that may not appear in sensor data immediately.

### What it computes
The `TrafficAdvisoryModel` evaluates:

- closure type (`vip_movement`, `protest`, `diversion`, etc.)
- closure severity (`minor_diversion`, `major_arterial_blocked`, `full_zone_lockdown`)
- affected corridor count
- duration length
- whether the closure is police-verified
- resulting diversion risk and transit reroute status
- normalized health score and anomaly level

### How it computes it
The model penalizes:

- closure severity
- number of affected corridors
- length of closure duration
- unplanned or protest-based closure types

The result is a forecast of how disruptive the advisory is to general mobility and transit.

### What it does with the result
The agent emits:

- `metricValue` like `Major Arterial Blocked`
- `metrics` including advisory source, closure type, affected corridors, verification, and duration
- `advisoryForecast` with diversion risk and public transit reroute activity

It stores the result and emits the signal.

### What we can infer from the signal
This signal tells us:

- public infrastructure is being deliberately disrupted or diverted
- transit rerouting is likely active
- emergency or VIP movement may be creating arterial choke points
- what adjacent sectors may become secondary congestion zones

This is a governance layer signal that reflects human-driven mobility changes rather than physical sensor drift.

---

## Cross-Agent Interpretation: Why the Mesh Matters

Each agent emits a simplified, normalized health score and an anomaly level, but the real value of AutoNet is in the combination of signals. For example:

- a smog signal plus a thermal signal may indicate elevated fire and respiratory risk
- a hydrology signal plus a road corridor signal suggests flood-induced transport collapse
- a power grid signal plus a hospital signal indicates climate and infrastructure compounding risk
- a social panic signal plus emergency dispatch surge indicates a citywide perception-and-response crisis

The `CascadeEngine` aggregates these signals and asks the local Qwen model to reason over the whole pattern. This gives the system a higher-level view than any single agent can provide.

This is the core design principle of AutoNet: domain agents produce localized sensor truth, and the cascade layer synthesizes that evidence into multi-sector operational intelligence.
