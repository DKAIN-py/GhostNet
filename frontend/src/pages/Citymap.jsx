import { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Entity, CustomDataSource } from "resium";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { useGhostnet } from "../context/GhostnetContext";
import { T, getSeverityStyle } from "../lib/theme";
import { AGENT_META } from "../lib/schema";
import { SECTORS, SECTOR_BY_ID, nearestSectors, distanceBetween } from "../lib/sectors";

/* -------------------------------------------------------------------------- */
/* Cesium                                                                     */
/* -------------------------------------------------------------------------- */

Cesium.Ion.defaultAccessToken =
import.meta.env.VITE_CESIUM_API;

/* -------------------------------------------------------------------------- */
/* NOTE ON ROAD GEOMETRY                                                      */
/*                                                                             */
/* We never fabricate road lines as "truth". A sector's location is an area  */
/* centroid, not a snapped road segment. roadPositions() below prefers real  */
/* backend geometry (signal.geometry / signal.location.geometry) the moment  */
/* it's present — a LineString from an OSRM/Mapbox map-matching call — and   */
/* only falls back to a deterministic corridor shape from the centroid when  */
/* no real geometry exists yet. Same pattern for polygons via geometryPolygon.*/
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Badge accent colors + glyphs (used for the always-on pin markers)         */
/* -------------------------------------------------------------------------- */

const AGENT_COLOR = {
  smog_dispersion: "#C1443A",
  waterlogging_hydrology: "#2E7DB8",
  thermal_stress: "#D9791E",
  transit_fleet: "#B8862E",
  road_corridor: "#A66A1E",
  metro_transit: "#7A5CC2",
  power_grid: "#B39423",
  industrial_hazard: "#B0301E",
  hospital_capacity: "#B8355F",
  emergency_dispatch: "#B8271E",
  social_panic: "#8A3FAE",
  traffic_news: "#A67A1E",
};

const AGENT_GLYPH = {
  smog_dispersion: "\u2601",        // cloud
  waterlogging_hydrology: "\u2248", // waves
  thermal_stress: "\u2600",         // sun
  transit_fleet: "\uD83D\uDE8C",    // bus
  road_corridor: "\u2B95",          // arrow
  metro_transit: "\u24C2",          // circled M
  power_grid: "\u26A1",             // bolt
  industrial_hazard: "\u26A0",      // warning triangle
  hospital_capacity: "\u271A",      // heavy cross
  emergency_dispatch: "\u260E",     // phone
  social_panic: "\u203C",           // double exclamation
  traffic_news: "\u26A7",           // barrier
};

// Zone/shape accent colors for the rich per-agent visualization (shown only
// for the currently-selected signal in place of its pin).
const COLORS = {
  critical: "#FF3030",
  moderate: "#FFB020",
  warning: "#FFB020",
  nominal: "#55D98A",
  good: "#55D98A",

  smog: "#FF3838",
  flood: "#168CFF",
  thermal: "#FF6A00",
  transit: "#FF9F1C",
  metro: "#A86CFF",
  power: "#FFD400",
  industrial: "#FF2414",
  hospital: "#FF3E78",
  emergency: "#FF1744",
  panic: "#C044FF",
  traffic: "#FFB000",
};

const CASCADE_RED_PRIMARY = "#C41E1E";
const CASCADE_RED_SPREAD = "#8C1F1F";

function headlineFor(agentId, metrics = {}) {
  switch (agentId) {
    case "smog_dispersion": return `AQI ${metrics.aqi ?? "—"}`;
    case "waterlogging_hydrology": return `${metrics.waterDepthCm ?? "—"}cm depth`;
    case "thermal_stress": return `${metrics.feelsLikeTempC ?? metrics.ambientTempC ?? "—"}°C feels-like`;
    case "transit_fleet": return `${Math.round((metrics.stationaryRatio ?? 0) * 100)}% fleet stalled`;
    case "road_corridor": return `${metrics.congestionLevelPct ?? "—"}% congestion`;
    case "metro_transit": return `${metrics.platformCapacityPct ?? "—"}% platform`;
    case "power_grid": return `${metrics.transformerLoadPct ?? "—"}% load`;
    case "industrial_hazard": return metrics.incidentType && metrics.incidentType !== "none" ? metrics.incidentType.replaceAll("_", " ") : "monitoring";
    case "hospital_capacity": return `${metrics.icuOccupancyPct ?? "—"}% ICU`;
    case "emergency_dispatch": return `${metrics.callVolumePerMin ?? "—"} calls/min`;
    case "social_panic": return `panic ${(metrics.meanRoBERTaPanicScore ?? 0).toFixed(2)}`;
    case "traffic_news": return metrics.closureSeverity ? metrics.closureSeverity.replaceAll("_", " ") : "advisory";
    default: return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Cities                                                                     */
/* -------------------------------------------------------------------------- */

const CITIES = {
  delhi: { name: "Delhi", lon: 77.209, lat: 28.6139, height: 14000 },
  tokyo: { name: "Tokyo", lon: 139.6917, lat: 35.6895, height: 6000 },
  assam: { name: "Assam", lon: 91.7362, lat: 26.1445, height: 20000 },
};

/* -------------------------------------------------------------------------- */
/* Geo / color helpers                                                        */
/* -------------------------------------------------------------------------- */

function severityKey(anomalyLevel) {
  if (anomalyLevel === "critical") return "critical";
  if (anomalyLevel === "warning" || anomalyLevel === "moderate") return "moderate";
  return "good";
}

function severityColor(signal) {
  return COLORS[signal?.anomalyLevel] || COLORS.good;
}

function cesiumColor(hex, alpha = 1) {
  return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Explicit low height, NOT terrain-clamped — clamping every entity to
// terrain forces continuous resampling every frame and is what breaks
// smooth camera drag/zoom. A fixed small altitude reads correctly from
// any normal viewing angle and costs nothing per frame.
function positionOf(location, height = 22) {
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }
  return Cesium.Cartesian3.fromDegrees(location.lng, location.lat, height);
}

function labelText(signal) {
  return (
    signal?.location?.placeName ||
    signal?.location?.stationName ||
    signal?.metrics?.substationName ||
    signal?.metrics?.primaryFacilityName ||
    signal?.metrics?.corridorName ||
    signal?.sectorId ||
    signal?.agentId ||
    "UNKNOWN"
  );
}

function forecastTitle(key) {
  return key.replace(/Forecast$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() + " FORECAST";
}

function forecastEntries(signal) {
  if (!signal) return [];
  return Object.entries(signal).filter(([key, value]) => key.endsWith("Forecast") && value && typeof value === "object");
}

function toRad(deg) { return (deg * Math.PI) / 180; }

function metersToLat(meters) { return meters / 111320; }

function metersToLng(meters, latitude) {
  const cos = Math.cos(toRad(latitude));
  return meters / (111320 * Math.max(0.15, Math.abs(cos)));
}

function triggeredAgent(cascade, signal) {
  if (!cascade) return false;
  const agents = cascade.triggeredAgents || cascade.agentsTriggered || [];
  const inZone =
    cascade.primarySectorId === signal.sectorId ||
    (cascade.spatialSpread || []).includes(signal.sectorId);
  return agents.includes(signal.agentId) && inZone;
}

function cascadeRoleFor(cascade, sectorId) {
  if (!cascade) return null;
  if (cascade.primarySectorId === sectorId) return "primary";
  if ((cascade.spatialSpread || []).includes(sectorId)) return "spread";
  return null;
}

function isSameSignal(a, b) {
  if (!a || !b) return false;
  return a.sectorId === b.sectorId && a.agentId === b.agentId;
}

/* -------------------------------------------------------------------------- */
/* Pulse helpers — used to make cascade zones "breathe" (dark red, up/down). */
/* Cesium's requestRenderMode only redraws on scene changes, so a separate   */
/* rAF loop (wired up in CityMap below) keeps calling scene.requestRender()  */
/* while a cascade is active so these CallbackProperties actually animate.   */
/* -------------------------------------------------------------------------- */

function pulseNumber(min, max, periodMs = 1400) {
  return new Cesium.CallbackProperty(() => {
    const t = (Date.now() % periodMs) / periodMs;
    const s = (Math.sin(t * Math.PI * 2) + 1) / 2;
    return min + (max - min) * s;
  }, false);
}

function pulseColor(hex, minAlpha, maxAlpha, periodMs = 1400) {
  return new Cesium.CallbackProperty(() => {
    const t = (Date.now() % periodMs) / periodMs;
    const s = (Math.sin(t * Math.PI * 2) + 1) / 2;
    return cesiumColor(hex, minAlpha + (maxAlpha - minAlpha) * s);
  }, false);
}

function pulseMaterial(hex, minAlpha, maxAlpha, periodMs = 1400) {
  return new Cesium.ColorMaterialProperty(pulseColor(hex, minAlpha, maxAlpha, periodMs));
}

/* -------------------------------------------------------------------------- */
/* Sector boundaries — hexagon per sector, radius derived from the real       */
/* distance to that sector's nearest neighbor, so 39 boundaries roughly tile  */
/* the mesh without a GIS boundary dataset. Computed once at module load.    */
/* -------------------------------------------------------------------------- */

const SECTOR_BOUNDARY_RADIUS = SECTORS.reduce((acc, sector) => {
  const [nearestId] = nearestSectors(sector.sectorId, 1);
  const distKm = nearestId ? distanceBetween(sector.sectorId, nearestId) : 6;
  const meters = (distKm * 1000) / 2;
  // Deliberately small relative to inter-sector spacing (~0.34x half-distance)
  // so neighboring hexagons read as distinct cells instead of stacking into
  // an illegible overlap wherever sectors happen to sit close together.
  acc[sector.sectorId] = Math.min(1800, Math.max(500, meters * 0.34));
  return acc;
}, {});

function hexagonPoints(center, radiusMeters, rotationDeg = 0) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = toRad(rotationDeg + i * 60);
    const dLat = metersToLat(radiusMeters * Math.cos(angle));
    const dLng = metersToLng(radiusMeters * Math.sin(angle), center.lat);
    pts.push(center.lng + dLng, center.lat + dLat);
  }
  return pts;
}

function SectorBoundary({ sector, health, cascadeRole }) {
  const worst = health?.criticalCount > 0 ? "critical" : health?.warningCount > 0 ? "moderate" : "good";
  const style = getSeverityStyle(worst);
  const baseColor = style.bg || style.text;
  const radiusMeters = SECTOR_BOUNDARY_RADIUS[sector.sectorId] || 1800;
  const points = hexagonPoints(sector, radiusMeters);

  const isCascade = cascadeRole === "primary" || cascadeRole === "spread";
  const cascadeHex = cascadeRole === "primary" ? CASCADE_RED_PRIMARY : CASCADE_RED_SPREAD;
  const period = cascadeRole === "primary" ? 1000 : 1500;

  const fillMaterial = isCascade
    ? pulseMaterial(cascadeHex, cascadeRole === "primary" ? 0.18 : 0.10, cascadeRole === "primary" ? 0.34 : 0.18, period)
    : cesiumColor(baseColor, worst === "good" ? 0.015 : worst === "moderate" ? 0.035 : 0.06);

  const outlineColorVal = isCascade
    ? pulseColor(cascadeHex, 0.5, 0.95, period)
    : cesiumColor(baseColor, worst === "good" ? 0.18 : worst === "moderate" ? 0.35 : 0.55);

  // Hidden inside ~700m so the mesh never fights a zoomed-in selected zone
  // for attention; still visible at every normal city-browsing distance.
  const meshVisibility = new Cesium.DistanceDisplayCondition(700, 60000);

  return (
    <Entity>
      <Entity
        polygon={{
          hierarchy: Cesium.Cartesian3.fromDegreesArray(points),
          height: 3,
          material: fillMaterial,
          outline: true,
          outlineColor: outlineColorVal,
          outlineWidth: isCascade ? (cascadeRole === "primary" ? 3 : 2) : (worst === "critical" ? 1.8 : worst === "moderate" ? 1.2 : 0.75),
          distanceDisplayCondition: meshVisibility,
        }}
      />
      <Entity
        position={positionOf(sector, 3)}
        label={{
          text: sector.name.toUpperCase(),
          font: `8px ${T.font.mono}`,
          fillColor: isCascade ? cesiumColor("#FFD9D9") : cesiumColor(T.text.muted),
          outlineColor: cesiumColor(T.bg.root),
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: meshVisibility,
          scaleByDistance: new Cesium.NearFarScalar(500, 1, 16000, 0.35),
          translucencyByDistance: new Cesium.NearFarScalar(2500, 0.9, 24000, 0.05),
        }}
      />
    </Entity>
  );
}

/* -------------------------------------------------------------------------- */
/* Icon generation — canvas -> data URL, memoized.                            */
/* -------------------------------------------------------------------------- */

const iconCache = new Map();

function buildBadgeIcon(agentId, severity, healthScore, highlighted) {
  const healthBucket = Math.round((healthScore ?? 50) / 5) * 5;
  const key = `badge:${agentId}:${severity}:${healthBucket}:${highlighted ? 1 : 0}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const accent = AGENT_COLOR[agentId] || T.text.secondary;
  const glyph = AGENT_GLYPH[agentId] || "\u25CF";
  const severityFrac = Math.max(0.04, Math.min(1, 1 - healthBucket / 100));

  const size = 112;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const ringWidth = 6;
  const badgeR = outerR - ringWidth - 4;

  if (highlighted) {
    const grad = ctx.createRadialGradient(cx, cy, badgeR * 0.6, cx, cy, outerR * 1.6);
    grad.addColorStop(0, hexToRgba(accent, 0.42));
    grad.addColorStop(1, hexToRgba(accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // severity ring gauge — track + fill proportional to (1 - healthScore/100)
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = "rgba(163,156,141,0.35)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, -Math.PI / 2, -Math.PI / 2 + severityFrac * Math.PI * 2);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = accent;
  ctx.lineCap = "round";
  ctx.stroke();

  // badge body
  ctx.beginPath();
  ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = T.bg.card;
  ctx.fill();
  ctx.lineWidth = severity === "critical" ? 3.5 : 2.5;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // glyph
  ctx.fillStyle = accent;
  ctx.font = `${Math.round(badgeR * 1.1)}px "Segoe UI Symbol", "Noto Sans Symbols", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + 2);

  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}

function buildSectorDotIcon(colorHex) {
  const key = `dot:${colorHex}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const size = 20;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = T.bg.card;
  ctx.stroke();

  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}

function buildClusterIcon(count, accent) {
  const key = `cluster:${count}:${accent}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const size = 100;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;

  const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
  grad.addColorStop(0, hexToRgba(accent, 0.35));
  grad.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = T.text.primary;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = T.bg.card;
  ctx.stroke();

  ctx.fillStyle = T.bg.card;
  ctx.font = `bold ${Math.round(r * 0.85)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), cx, cy + 2);

  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}

/* -------------------------------------------------------------------------- */
/* Anomaly badge — the always-on pin for every non-nominal signal. Clicking  */
/* it selects the signal: the pin disappears from this clustered layer and   */
/* is replaced (see CityMap render) by its rich per-agent zone + the drawer. */
/* -------------------------------------------------------------------------- */

function AnomalyBadge({ signal, highlighted, dimmed, onClick }) {
  const severity = signal.anomalyLevel === "critical" ? "critical" : signal.anomalyLevel === "warning" ? "warning" : "nominal";
  const size = severity === "critical" ? 54 : severity === "warning" ? 44 : 32;
  const icon = buildBadgeIcon(signal.agentId, severity, signal.healthScore, highlighted);
  const headline = headlineFor(signal.agentId, signal.metrics);

  // Only critical (or cascade-highlighted) pins keep an always-on text
  // label. Everything else is icon-only until clicked, so a cluster of
  // warning-level pins never turns into a wall of overlapping text — and
  // ALL labels disappear the moment another signal is selected, so the
  // selected zone's own label is the only text on screen near it.
  const showLabel = !dimmed && (severity === "critical" || highlighted);

  return (
    <Entity
      position={positionOf(signal.location, 26)}
      onClick={() => onClick(signal)}
      billboard={{
        image: icon,
        width: size,
        height: size,
        color: dimmed ? cesiumColor("#FFFFFF", 0.45) : Cesium.Color.WHITE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }}
      label={showLabel ? {
        text: `${(AGENT_META[signal.agentId]?.label || signal.agentId).toUpperCase()}  ·  ${headline}`,
        font: `${severity === "critical" ? "bold " : ""}10px ${T.font.mono}`,
        fillColor: cesiumColor(T.text.primary),
        outlineColor: cesiumColor(T.bg.card),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -(size / 2 + 16)),
        showBackground: true,
        backgroundColor: cesiumColor(T.bg.card, 0.9),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(3000, 1, 30000, 0.15),
      } : undefined}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Per-agent rich zone visualizations — ONLY rendered for the currently-      */
/* selected signal, in place of its pin. Sized off real                      */
/* location.radiusMeters / metric-derived scale, and prefers real backend    */
/* geometry (LineString / Polygon) the instant it's present.                 */
/* -------------------------------------------------------------------------- */

function radius(signal, multiplier = 1) {
  return Math.max(80, Number(signal?.location?.radiusMeters || 300) * multiplier);
}

function makeZone(signal, meters, points = 12, seed = 0) {
  const location = signal?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") return [];

  const latStep = metersToLat(meters);
  const lngStep = metersToLng(meters, location.lat);
  const positions = [];

  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points + seed * 0.37;
    const variation = 0.78 + ((i * 17 + seed * 13) % 29) / 100;
    const x = Math.cos(angle) * lngStep * variation;
    const y = Math.sin(angle) * latStep * variation;
    positions.push(location.lng + x, location.lat + y);
  }

  return Cesium.Cartesian3.fromDegreesArray(positions);
}

// directionDeg follows compass degrees: 0 = north, 90 = east, 180 = south, 270 = west
function makeDirectionalZone(signal, lengthMeters, widthMeters, directionDeg = 0, seed = 0) {
  const location = signal?.location;
  if (!location) return [];

  const heading = toRad(directionDeg);
  const forwardLng = Math.sin(heading);
  const forwardLat = Math.cos(heading);
  const sideLng = Math.cos(heading);
  const sideLat = -Math.sin(heading);

  const centerLngStep = metersToLng(lengthMeters, location.lat);
  const centerLatStep = metersToLat(lengthMeters);
  const widthLngStep = metersToLng(widthMeters, location.lat);
  const widthLatStep = metersToLat(widthMeters);

  const center = { lng: location.lng, lat: location.lat };

  function point(forward, side) {
    return {
      lng: center.lng + forwardLng * centerLngStep * forward + sideLng * widthLngStep * side,
      lat: center.lat + forwardLat * centerLatStep * forward + sideLat * widthLatStep * side,
    };
  }

  const points = [
    point(0.0, -0.18), point(0.25, -0.48), point(0.58, -0.72), point(0.88, -0.82),
    point(1.0, -0.45), point(1.08, 0.0), point(1.0, 0.45), point(0.88, 0.82),
    point(0.58, 0.72), point(0.25, 0.48), point(0.0, 0.18),
  ];

  const degrees = [];
  points.forEach((pnt, index) => {
    const wobble = 1 + Math.sin(index * 2.1 + seed) * 0.025;
    degrees.push(
      center.lng + (pnt.lng - center.lng) * wobble,
      center.lat + (pnt.lat - center.lat) * wobble
    );
  });

  return Cesium.Cartesian3.fromDegreesArray(degrees);
}

function roadPositions(signal, lengthMeters = 1600) {
  const geometry = signal?.geometry || signal?.location?.geometry;

  if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return Cesium.Cartesian3.fromDegreesArray(geometry.coordinates.flat());
  }

  const location = signal?.location;
  if (!location) return [];

  const lngStep = metersToLng(lengthMeters, location.lat);
  const latStep = metersToLat(lengthMeters * 0.18);

  return Cesium.Cartesian3.fromDegreesArray([
    location.lng - lngStep, location.lat - latStep,
    location.lng - lngStep * 0.55, location.lat - latStep * 0.4,
    location.lng, location.lat,
    location.lng + lngStep * 0.55, location.lat + latStep * 0.4,
    location.lng + lngStep, location.lat + latStep,
  ]);
}

function geometryPolygon(signal, fallback) {
  const geometry = signal?.geometry || signal?.location?.geometry;

  if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const ring = geometry.coordinates[0];
    if (ring?.length >= 3) return Cesium.Cartesian3.fromDegreesArray(ring.flat());
  }

  return fallback;
}

function SourceMarker({ signal, color, triggered, onClick }) {
  return (
    <Entity position={positionOf(signal.location, 20)} onClick={() => onClick(signal)}>
      <Entity
        point={{
          pixelSize: triggered ? 13 : 9,
          color: cesiumColor(color, 1),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        }}
      />
      {triggered && (
        <Entity
          ellipse={{
            semiMajorAxis: radius(signal, 0.16),
            semiMinorAxis: radius(signal, 0.16),
            height: 24,
            material: cesiumColor(color, 0.12),
            outline: true,
            outlineColor: cesiumColor(color, 0.8),
            outlineWidth: 2,
          }}
        />
      )}
    </Entity>
  );
}

function SmogVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const aqi = Number(metrics.aqi || 160);
  const pm25 = Number(metrics.pm25 || 100);
  const scale = Math.min(2.8, Math.max(1, aqi / 150 + pm25 / 600));
  const wind = typeof metrics.windDirectionDeg === "number" ? metrics.windDirectionDeg : 135;

  const plume = geometryPolygon(signal, makeDirectionalZone(signal, radius(signal, 1.7) * scale, radius(signal, 0.8) * scale, wind, 3));
  const innerPlume = makeDirectionalZone(signal, radius(signal, 0.85) * scale, radius(signal, 0.35) * scale, wind, 8);

  return (
    <Entity name={`SMOG — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: plume, height: 15, material: cesiumColor(COLORS.smog, triggered ? 0.28 : 0.17), outline: true, outlineColor: cesiumColor(COLORS.smog, triggered ? 0.95 : 0.65), outlineWidth: triggered ? 5 : 2 }} />
      <Entity polygon={{ hierarchy: innerPlume, height: 22, material: cesiumColor("#FF1111", triggered ? 0.34 : 0.21), outline: false }} />
      <Entity polyline={{ positions: roadPositions({ ...signal, location: { ...signal.location, radiusMeters: radius(signal, 0.8) } }, radius(signal, 1.2)), width: triggered ? 4 : 2, material: cesiumColor("#FF7777", 0.55), clampToGround: true }} />
      <SourceMarker signal={signal} color={COLORS.smog} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 35)} label={{ text: `SMOG  AQI ${metrics.aqi ?? "—"}`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#260000", 0.82) }} />
    </Entity>
  );
}

function FloodVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const depth = Number(metrics.waterDepthCm || 12);
  const scale = Math.min(2.8, Math.max(0.9, depth / 15));

  const outer = geometryPolygon(signal, makeZone(signal, radius(signal, scale), 14, 4));
  const middle = makeZone(signal, radius(signal, scale * 0.68), 12, 9);
  const core = makeZone(signal, radius(signal, scale * 0.35), 10, 13);

  return (
    <Entity name={`FLOOD — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: outer, height: 5, material: cesiumColor(COLORS.flood, triggered ? 0.32 : 0.20), outline: true, outlineColor: cesiumColor(COLORS.flood, 0.9), outlineWidth: triggered ? 5 : 2 }} />
      <Entity polygon={{ hierarchy: middle, height: 8, material: cesiumColor("#0876E8", 0.25), outline: true, outlineColor: cesiumColor("#4DB4FF", 0.65), outlineWidth: 2 }} />
      <Entity polygon={{ hierarchy: core, height: 11, material: cesiumColor("#005CC8", 0.30), outline: false }} />
      <SourceMarker signal={signal} color={COLORS.flood} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 30)} label={{ text: `FLOOD  ${depth}cm`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -24), showBackground: true, backgroundColor: cesiumColor("#00335F", 0.85) }} />
    </Entity>
  );
}

function ThermalVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const temp = Number(metrics.feelsLikeTempC || metrics.ambientTempC || 42);
  const scale = Math.min(2.5, Math.max(0.8, temp / 42));

  const outer = makeZone(signal, radius(signal, scale), 16, 5);
  const middle = makeZone(signal, radius(signal, scale * 0.65), 14, 10);
  const core = makeZone(signal, radius(signal, scale * 0.32), 12, 15);

  return (
    <Entity name={`THERMAL — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: outer, height: 7, material: cesiumColor("#FF8A00", 0.11), outline: true, outlineColor: cesiumColor(COLORS.thermal, triggered ? 0.95 : 0.55), outlineWidth: triggered ? 5 : 2 }} />
      <Entity polygon={{ hierarchy: middle, height: 11, material: cesiumColor("#FF4B00", 0.16), outline: false }} />
      <Entity polygon={{ hierarchy: core, height: 15, material: cesiumColor("#FF1500", 0.23), outline: true, outlineColor: cesiumColor("#FF5A00", 0.7), outlineWidth: 2 }} />
      <SourceMarker signal={signal} color={COLORS.thermal} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 32)} label={{ text: `HEAT  ${temp}°C`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#571600", 0.85) }} />
    </Entity>
  );
}

function TransitFleetVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const ratio = Number(metrics.stationaryRatio || 0.72);
  const length = radius(signal, 2.1) * Math.min(1.5, Math.max(0.7, ratio + 0.35));
  const road = roadPositions(signal, length);

  return (
    <Entity name={`BUS FLEET — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polyline={{ positions: road, width: triggered ? 18 : 11, material: cesiumColor(COLORS.transit, 0.20), clampToGround: true }} />
      <Entity polyline={{ positions: road, width: triggered ? 7 : 4, material: cesiumColor(COLORS.transit, 0.92), clampToGround: true }} />
      <Entity polygon={{ hierarchy: makeDirectionalZone(signal, length * 0.55, radius(signal, 0.55), 90, 7), height: 6, material: cesiumColor("#FF6A00", 0.10), outline: true, outlineColor: cesiumColor(COLORS.transit, 0.55), outlineWidth: 2 }} />
      <SourceMarker signal={signal} color={COLORS.transit} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 32)} label={{ text: `BUS GRIDLOCK  ${Math.round(ratio * 100)}%`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#4A2600", 0.88) }} />
    </Entity>
  );
}

function RoadCorridorVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const jamLength = Math.max(800, Number(metrics.jamLengthMeters || 1800));
  const positions = roadPositions(signal, Math.min(3500, jamLength));

  return (
    <Entity name={`ROAD CONGESTION — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polyline={{ positions, width: triggered ? 22 : 15, material: cesiumColor(COLORS.traffic, 0.16), clampToGround: true }} />
      <Entity polyline={{ positions, width: triggered ? 10 : 7, material: cesiumColor(COLORS.traffic, 0.92), clampToGround: true }} />
      <SourceMarker signal={signal} color={COLORS.traffic} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 32)} label={{ text: `ROAD  ${metrics.congestionLevelPct ?? metrics.congestionPct ?? "—"}%`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#4D3000", 0.88) }} />
    </Entity>
  );
}

function MetroVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const crowd = Number(metrics.platformCapacityPct || 80);
  const stationRadius = radius(signal) * Math.min(1.9, Math.max(0.7, crowd / 70));

  return (
    <Entity name={`METRO — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity ellipse={{ semiMajorAxis: stationRadius, semiMinorAxis: stationRadius, height: 8, material: cesiumColor(COLORS.metro, 0.12), outline: true, outlineColor: cesiumColor(COLORS.metro, 0.85), outlineWidth: triggered ? 5 : 2 }} />
      <Entity ellipse={{ semiMajorAxis: stationRadius * 0.55, semiMinorAxis: stationRadius * 0.55, height: 12, material: cesiumColor("#6F35FF", 0.18), outline: true, outlineColor: cesiumColor(COLORS.metro, 0.55), outlineWidth: 2 }} />
      <SourceMarker signal={signal} color={COLORS.metro} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 35)} label={{ text: `METRO  ${crowd}%`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#27104A", 0.88) }} />
    </Entity>
  );
}

function PowerVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const load = Number(metrics.transformerLoadPct || metrics.gridLoadPct || 88);

  const outer = makeZone(signal, radius(signal, 1.2), 10, 6);
  const inner = makeZone(signal, radius(signal, 0.55), 8, 12);

  const spokes = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const length = radius(signal, 1.15);
    const lat1 = signal.location.lat + Math.cos(angle) * metersToLat(length);
    const lng1 = signal.location.lng + Math.sin(angle) * metersToLng(length, signal.location.lat);
    spokes.push(
      <Entity key={`power-spoke-${i}`} polyline={{ positions: Cesium.Cartesian3.fromDegreesArray([signal.location.lng, signal.location.lat, lng1, lat1]), width: 2, material: cesiumColor(COLORS.power, 0.55), clampToGround: true }} />
    );
  }

  return (
    <Entity name={`POWER GRID — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: outer, height: 7, material: cesiumColor(COLORS.power, 0.09), outline: true, outlineColor: cesiumColor(COLORS.power, 0.75), outlineWidth: triggered ? 4 : 2 }} />
      <Entity polygon={{ hierarchy: inner, height: 12, material: cesiumColor("#FFAA00", 0.18), outline: true, outlineColor: cesiumColor("#FF5C00", 0.7), outlineWidth: 2 }} />
      {spokes}
      <SourceMarker signal={signal} color={COLORS.power} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 34)} label={{ text: `POWER  ${load}%`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#4D3D00", 0.9) }} />
    </Entity>
  );
}

function IndustrialVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const evacuationRadius = Number(metrics.evacuationRadiusMeters || signal.location?.radiusMeters || 800);

  const outer = makeZone(signal, evacuationRadius, 16, 3);
  const inner = makeZone(signal, evacuationRadius * 0.38, 12, 9);
  const plume = makeDirectionalZone(signal, evacuationRadius * 1.6, evacuationRadius * 0.5, Number(metrics.windDirectionDeg || 135), 14);

  return (
    <Entity name={`INDUSTRIAL HAZARD — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      {(metrics.toxicSmokePlume ?? true) && (
        <Entity polygon={{ hierarchy: plume, height: 16, material: cesiumColor("#737373", 0.15), outline: true, outlineColor: cesiumColor("#AAAAAA", 0.42), outlineWidth: 2 }} />
      )}
      <Entity polygon={{ hierarchy: outer, height: 12, material: cesiumColor("#FF0000", triggered ? 0.19 : 0.11), outline: true, outlineColor: cesiumColor(COLORS.industrial, triggered ? 1 : 0.82), outlineWidth: triggered ? 6 : 3 }} />
      <Entity polygon={{ hierarchy: inner, height: 22, material: cesiumColor("#FF1800", 0.32), outline: true, outlineColor: cesiumColor("#FF3B00", 1), outlineWidth: 4 }} />
      <SourceMarker signal={signal} color={COLORS.industrial} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 40)} label={{ text: "⚠ INDUSTRIAL HAZARD", font: "bold 11px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 4, pixelOffset: new Cesium.Cartesian2(0, -30), showBackground: true, backgroundColor: cesiumColor("#780000", 0.9) }} />
    </Entity>
  );
}

function HospitalVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const occupancy = Number(metrics.icuOccupancyPct || 90);
  const outerRadius = radius(signal) * Math.min(2, Math.max(0.8, occupancy / 75));

  return (
    <Entity name={`HOSPITAL — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity ellipse={{ semiMajorAxis: outerRadius, semiMinorAxis: outerRadius, height: 9, material: cesiumColor(COLORS.hospital, 0.09), outline: true, outlineColor: cesiumColor(COLORS.hospital, 0.8), outlineWidth: triggered ? 5 : 2 }} />
      <Entity ellipse={{ semiMajorAxis: outerRadius * 0.58, semiMinorAxis: outerRadius * 0.58, height: 14, material: cesiumColor("#FF164E", 0.18), outline: true, outlineColor: cesiumColor("#FF4B77", 0.7), outlineWidth: 2 }} />
      <SourceMarker signal={signal} color={COLORS.hospital} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 35)} label={{ text: `ICU  ${occupancy}%`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#500018", 0.9) }} />
    </Entity>
  );
}

function EmergencyVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const spike = Number(metrics.callVelocitySpikeRatio || 3);
  const scale = Math.min(2.5, Math.max(0.8, spike / 2.5));

  return (
    <Entity name={`112 DISPATCH — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity ellipse={{ semiMajorAxis: radius(signal, scale), semiMinorAxis: radius(signal, scale), height: 7, material: cesiumColor(COLORS.emergency, 0.10), outline: true, outlineColor: cesiumColor(COLORS.emergency, 0.85), outlineWidth: triggered ? 5 : 2 }} />
      <Entity ellipse={{ semiMajorAxis: radius(signal, scale * 0.5), semiMinorAxis: radius(signal, scale * 0.5), height: 12, material: cesiumColor("#FF1744", 0.19), outline: true, outlineColor: cesiumColor("#FF1744", 0.65), outlineWidth: 2 }} />
      <SourceMarker signal={signal} color={COLORS.emergency} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 35)} label={{ text: `112  ${metrics.callVolumePerMin ?? "—"}/MIN`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#560010", 0.9) }} />
    </Entity>
  );
}

function PanicVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const panic = Number(metrics.meanRoBERTaPanicScore || 0.7);
  const velocity = Number(metrics.keywordVelocityRatio || 4);
  const scale = Math.min(2.8, Math.max(0.9, panic + velocity / 7));

  const outer = makeZone(signal, radius(signal, scale), 15, 7);
  const middle = makeZone(signal, radius(signal, scale * 0.62), 13, 12);
  const core = makeZone(signal, radius(signal, scale * 0.28), 11, 19);

  return (
    <Entity name={`SOCIAL PANIC — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: outer, height: 5, material: cesiumColor(COLORS.panic, 0.08), outline: true, outlineColor: cesiumColor(COLORS.panic, triggered ? 0.9 : 0.5), outlineWidth: triggered ? 4 : 2 }} />
      <Entity polygon={{ hierarchy: middle, height: 9, material: cesiumColor("#9E2CFF", 0.13), outline: true, outlineColor: cesiumColor("#B94CFF", 0.65), outlineWidth: 2 }} />
      <Entity polygon={{ hierarchy: core, height: 14, material: cesiumColor("#D000FF", 0.24), outline: true, outlineColor: cesiumColor(COLORS.panic, 0.9), outlineWidth: 3 }} />
      <SourceMarker signal={signal} color={COLORS.panic} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 35)} label={{ text: `PANIC  ${panic.toFixed(2)}`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#39004D", 0.9) }} />
    </Entity>
  );
}

function TrafficNewsVisual({ signal, triggered, onClick }) {
  const metrics = signal.metrics || {};
  const positions = roadPositions(signal, radius(signal, 2.2));

  return (
    <Entity name={`ROAD CLOSURE — ${labelText(signal)}`} onClick={() => onClick(signal)}>
      <Entity polyline={{ positions, width: triggered ? 24 : 17, material: cesiumColor(COLORS.traffic, 0.18), clampToGround: true }} />
      <Entity polyline={{ positions, width: triggered ? 9 : 6, material: cesiumColor("#FF5500", 0.95), clampToGround: true }} />
      <SourceMarker signal={signal} color={COLORS.traffic} triggered={triggered} onClick={onClick} />
      <Entity position={positionOf(signal.location, 34)} label={{ text: `ROAD BLOCK  ${metrics.closureSeverity || signal.anomalyLevel || "—"}`, font: "bold 10px monospace", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, pixelOffset: new Cesium.Cartesian2(0, -25), showBackground: true, backgroundColor: cesiumColor("#503000", 0.9) }} />
    </Entity>
  );
}

function GenericVisual({ signal, triggered, onClick }) {
  const color = severityColor(signal);
  const outer = makeZone(signal, radius(signal), 12, 4);
  const inner = makeZone(signal, radius(signal, 0.45), 9, 8);

  return (
    <Entity name={signal.agentId} onClick={() => onClick(signal)}>
      <Entity polygon={{ hierarchy: outer, height: 5, material: cesiumColor(color, 0.08), outline: true, outlineColor: cesiumColor(color, 0.75), outlineWidth: triggered ? 4 : 2 }} />
      <Entity polygon={{ hierarchy: inner, height: 10, material: cesiumColor(color, 0.16), outline: false }} />
      <SourceMarker signal={signal} color={color} triggered={triggered} onClick={onClick} />
    </Entity>
  );
}

function AgentVisualization({ signal, triggered, onClick }) {
  switch (signal.agentId) {
    case "smog_dispersion": return <SmogVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "waterlogging_hydrology": return <FloodVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "thermal_stress": return <ThermalVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "transit_fleet": return <TransitFleetVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "road_corridor": return <RoadCorridorVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "metro_transit": return <MetroVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "power_grid": return <PowerVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "industrial_hazard": return <IndustrialVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "hospital_capacity": return <HospitalVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "emergency_dispatch": return <EmergencyVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "social_panic": return <PanicVisual signal={signal} triggered={triggered} onClick={onClick} />;
    case "traffic_news": return <TrafficNewsVisual signal={signal} triggered={triggered} onClick={onClick} />;
    default: return <GenericVisual signal={signal} triggered={triggered} onClick={onClick} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Cascade ripple — dashed lines from the decay engine's actual primary       */
/* sector to its actual spatialSpread sectors, plus a pulsing red marker on   */
/* the primary sector ("that area... red marker going up and down").         */
/* -------------------------------------------------------------------------- */

function CascadeRipple({ cascade }) {
  if (!cascade?.primarySectorId) return null;
  const primary = SECTOR_BY_ID[cascade.primarySectorId];
  if (!primary) return null;

  const targets = (cascade.spatialSpread || [])
    .map((id) => ({ id, sector: SECTOR_BY_ID[id] }))
    .filter((t) => t.sector);

  return (
    <>
      <Entity
        position={positionOf(primary, 20)}
        billboard={{
          image: buildSectorDotIcon("#FF2020"),
          width: pulseNumber(20, 36, 900),
          height: pulseNumber(20, 36, 900),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
      />
      <Entity position={positionOf(primary, 14)}>
        <Entity
          ellipse={{
            semiMajorAxis: pulseNumber(300, 700, 1300),
            semiMinorAxis: pulseNumber(300, 700, 1300),
            height: 14,
            material: pulseMaterial("#FF2020", 0.05, 0.22, 1300),
            outline: true,
            outlineColor: pulseColor("#FF2020", 0.4, 0.9, 1300),
            outlineWidth: 2,
          }}
        />
      </Entity>

      {targets.map(({ id, sector }) => (
        <Entity key={`cascade-line-${id}`}>
          <Entity
            polyline={{
              positions: Cesium.Cartesian3.fromDegreesArray([primary.lng, primary.lat, sector.lng, sector.lat]),
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: cesiumColor(T.cascade.bg, 0.75), dashLength: 14 }),
              clampToGround: true,
            }}
          />
        </Entity>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* CITY MAP                                                                   */
/* -------------------------------------------------------------------------- */

export default function CityMap() {
  const { allSignals, sectorHealth, networkStats, cascade } = useGhostnet();

  const [cesiumViewer, setCesiumViewer] = useState(null);
  const [activeCity, setActiveCity] = useState("delhi");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);

  const clusterDsRef = useRef(null);
  const clusterHandlerRef = useRef(null);

  function viewerRefCallback(element) {
    const viewer = element?.cesiumElement;
    if (viewer) setCesiumViewer(viewer);
  }

  /* ---------------------------------------------------------------------- */
  /* Cesium setup                                                            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!cesiumViewer) return;

    if (!Cesium.Ion.defaultAccessToken || Cesium.Ion.defaultAccessToken.length < 20) {
      setError("No Cesium ion token configured.");
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const terrain = await Cesium.createWorldTerrainAsync();
        if (cancelled) return;
        cesiumViewer.terrainProvider = terrain;

        const buildings = await Cesium.createOsmBuildingsAsync();
        if (cancelled) return;
        buildings.maximumScreenSpaceError = 32;
        cesiumViewer.scene.primitives.add(buildings);

        cesiumViewer.scene.requestRenderMode = true;
        cesiumViewer.scene.maximumRenderTimeChange = Infinity;

        const controller = cesiumViewer.scene.screenSpaceCameraController;
        controller.enableInertia = true;
        controller.inertiaZoom = 0.8;
        controller.zoomFactor = 3;
        controller.enableRotate = true;
        controller.enableTranslate = true;
        controller.enableZoom = true;
        controller.enableTilt = true;
        controller.enableLook = true;

        setReady(true);
        flyTo("delhi", cesiumViewer, 0);
      } catch (err) {
        console.error("[GHOSTNET] Cesium setup failed:", err);
        setError(err?.message || "Failed to load Cesium city tiles.");
      }
    }

    setup();
    return () => { cancelled = true; };
  }, [cesiumViewer]);

  /* ---------------------------------------------------------------------- */
  /* Continuous render loop — only while a cascade is active, so the        */
  /* pulsing dark-red sector fill / marker actually animates. requestRender */
  /* -mode scenes otherwise only redraw on camera/entity changes.           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!cesiumViewer || !ready || !cascade) return;
    let rafId;
    function loop() {
      cesiumViewer.scene.requestRender();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [cesiumViewer, ready, cascade]);

  /* ---------------------------------------------------------------------- */
  /* Clustering — nearby anomaly badges collapse into one numbered sprite;   */
  /* clicking it flies the camera in until Cesium naturally un-clusters and  */
  /* reveals each problem individually.                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!ready || !cesiumViewer) return;

    const ds = clusterDsRef.current?.cesiumElement;
    if (!ds) return;

    ds.clustering.enabled = true;
    ds.clustering.pixelRange = 72;
    ds.clustering.minimumClusterSize = 2;

    const removeListener = ds.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.image = buildClusterIcon(clusteredEntities.length, T.severity.critical.bg);
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      cluster.billboard.id = {
        ghostnetCluster: true,
        positions: clusteredEntities
          .map((e) => e.position?.getValue(Cesium.JulianDate.now()))
          .filter(Boolean),
      };
    });

    if (!clusterHandlerRef.current) {
      const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
      handler.setInputAction((movement) => {
        const picked = cesiumViewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && picked.id?.ghostnetCluster && picked.id.positions?.length) {
          const sphere = Cesium.BoundingSphere.fromPoints(picked.id.positions);
          cesiumViewer.camera.flyToBoundingSphere(sphere, {
            duration: 1.1,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), Math.max(sphere.radius * 3.5, 600)),
          });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      clusterHandlerRef.current = handler;
    }

    return () => { removeListener(); };
  }, [ready, cesiumViewer, allSignals]);

  useEffect(() => {
    return () => {
      clusterHandlerRef.current?.destroy();
      clusterHandlerRef.current = null;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Camera                                                                  */
  /* ---------------------------------------------------------------------- */

  function flyTo(cityKey, viewerOverride, duration = 2.5) {
    const viewer = viewerOverride || cesiumViewer;
    if (!viewer) return;
    const city = CITIES[cityKey];
    if (!city) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, city.height),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-58), roll: 0 },
      duration,
    });
    setActiveCity(cityKey);
  }

  /* ---------------------------------------------------------------------- */
  /* Only non-nominal signals get a marker — the 39-sector hexagon layer     */
  /* already shows the full mesh is alive.                                  */
  /* ---------------------------------------------------------------------- */

  const anomalySignals = useMemo(
    () =>
      (allSignals || []).filter(
        (signal) =>
          signal.anomalyLevel !== "nominal" &&
          signal?.location &&
          typeof signal.location.lat === "number" &&
          typeof signal.location.lng === "number"
      ),
    [allSignals]
  );

  const sectorEntries = useMemo(() => Object.entries(sectorHealth || {}), [sectorHealth]);

  /* ---------------------------------------------------------------------- */
  /* Selection — clicking a pin (or its zone, once open) toggles selection.  */
  /* Selecting swaps the pin for the rich per-agent zone + opens the drawer. */
  /* Closing the drawer (or clicking the zone again) swaps it back to a pin. */
  /* ---------------------------------------------------------------------- */

  function handleSignalClick(signal) {
    setSelectedSignal((prev) => (prev && isSameSignal(prev, signal) ? null : signal));
  }

  function handleCloseDrawer() {
    setSelectedSignal(null);
  }

  const visibleBadgeSignals = useMemo(
    () => anomalySignals.filter((signal) => !isSameSignal(signal, selectedSignal)),
    [anomalySignals, selectedSignal]
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ fontFamily: T.font.mono, background: T.bg.root }}>
      <Viewer
        ref={viewerRefCallback}
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        geocoder={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* 39-sector boundary mesh — always visible, colored by worst signal,
            dark-red pulsing for any sector that's part of the active cascade */}
        {ready && sectorEntries.map(([sectorId, health]) => {
          const sector = SECTOR_BY_ID[sectorId];
          if (!sector) return null;
          // Focus mode: once a signal is selected, hide unrelated sector
          // hexagons so its zone isn't competing with a dozen overlapping
          // outlines. Its own sector and any active cascade sectors stay.
          const role = cascadeRoleFor(cascade, sectorId);
          const isRelevant = !selectedSignal || sectorId === selectedSignal.sectorId || role;
          if (!isRelevant) return null;
          return (
            <SectorBoundary
              key={`boundary-${sectorId}`}
              sector={sector}
              health={health}
              cascadeRole={role}
            />
          );
        })}

        {ready && cascade && <CascadeRipple cascade={cascade} />}

        {/* Selected signal: pin is swapped out for its real per-agent zone
            (plume / flood polygon / road line / power spokes / etc). */}
        {ready && selectedSignal?.location && (
          <Entity key={`selection-${selectedSignal.sectorId}-${selectedSignal.agentId}`}>
            <AgentVisualization
              signal={selectedSignal}
              triggered={triggeredAgent(cascade, selectedSignal)}
              onClick={handleSignalClick}
            />
          </Entity>
        )}

        {/* Clustered layer: the always-on clickable anomaly pins, minus
            whichever one is currently selected (shown as a zone above instead). */}
        {ready && (
          <CustomDataSource ref={clusterDsRef} name="anomalies">
            {visibleBadgeSignals.map((signal, index) => (
              <AnomalyBadge
                key={`badge-${signal.sectorId}-${signal.agentId}-${index}`}
                signal={signal}
                highlighted={triggeredAgent(cascade, signal)}
                dimmed={!!selectedSignal}
                onClick={handleSignalClick}
              />
            ))}
          </CustomDataSource>
        )}
      </Viewer>

      {/* Top controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {Object.keys(CITIES).map((key) => (
          <button
            key={key}
            onClick={() => flyTo(key)}
            disabled={!ready}
            className="text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold transition-all"
            style={{
              border: `1px solid ${T.border.default}`,
              background: activeCity === key ? T.text.primary : T.bg.card,
              color: activeCity === key ? T.bg.card : T.text.secondary,
              fontFamily: T.font.mono,
              cursor: ready ? "pointer" : "not-allowed",
              opacity: ready ? 1 : 0.5,
            }}
          >
            {CITIES[key].name}
          </button>
        ))}
      </div>

      {/* Map status */}
      <div className="absolute top-4 right-4 z-10 px-3 py-2" style={{ background: T.bg.card, border: `1px solid ${T.border.default}`, minWidth: 150 }}>
        <div className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>39-SECTOR MESH</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold" style={{ color: T.text.primary }}>{networkStats?.signalCount ?? 0}</span>
          <span className="text-[9px]" style={{ color: T.text.muted }}>signals</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] mt-1" style={{ color: T.text.secondary }}>
          {networkStats?.criticalCount > 0 && <span style={{ color: T.severity.critical.bg }}>● {networkStats.criticalCount} CRIT</span>}
          {networkStats?.warningCount > 0 && <span style={{ color: T.severity.moderate.text }}>● {networkStats.warningCount} WARN</span>}
        </div>
        <div className="text-[8px] tracking-widest uppercase mt-1" style={{ color: T.text.micro }}>
          {networkStats?.liveAnchorCount ?? 0} LIVE · {(networkStats?.signalCount ?? 0) - (networkStats?.liveAnchorCount ?? 0)} SIMULATED
        </div>
      </div>

      {/* Cascade banner */}
      {cascade && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-2 z-10" style={{ background: T.cascade.bg, border: `1px solid ${T.cascade.border}` }}>
          <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: T.cascade.text, animation: "blink 0.9s step-start infinite" }} />
          <span className="text-[9px] tracking-[0.25em] uppercase font-bold" style={{ color: T.cascade.text }}>
            CASCADE · {cascade.primarySectorName || cascade.primarySectorId}
          </span>
          <span className="text-[9px]" style={{ color: T.text.muted }}>
            {cascade.confidence ?? "—"}% CONF · {cascade.hoursUntil ?? "—"}H ETA
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 px-4 py-3" style={{ background: T.bg.card, border: `1px solid ${T.border.default}` }}>
        <div className="text-[8px] tracking-[0.2em] uppercase mb-2" style={{ color: T.text.micro }}>AGENT SIGNAL TYPES</div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mb-2">
          {Object.entries(AGENT_META).map(([agentId, meta]) => (
            <div key={agentId} className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px]" style={{ border: `1.5px solid ${AGENT_COLOR[agentId]}`, color: AGENT_COLOR[agentId] }}>
                {AGENT_GLYPH[agentId]}
              </span>
              <span className="text-[7px] tracking-wide" style={{ color: T.text.secondary }}>{meta.label.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="text-[7px] tracking-wide pt-2" style={{ color: T.text.muted, borderTop: `1px solid ${T.border.subtle}` }}>
          hexagon = sector boundary · click a pin to open its detail zone (road = line, water = polygon, power = spokes) · click again or close the panel to go back to a pin · pulsing dark red = active cascade
        </div>
      </div>

      {/* Selected signal drawer */}
      {selectedSignal && <SignalDrawer signal={selectedSignal} cascade={cascade} onClose={handleCloseDrawer} />}

      {/* Loading */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ color: T.text.primary, background: "rgba(0,0,0,0.35)" }}>
          <div className="text-center">
            <div className="text-[10px] tracking-[0.3em] uppercase">INITIALIZING SPATIAL ENGINE</div>
            <div className="text-[8px] tracking-widest mt-2" style={{ color: T.text.micro }}>LOADING TERRAIN · 39-SECTOR MESH · CASCADE MODEL</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-10 text-center z-10" style={{ color: T.severity.critical.bg, background: "rgba(0,0,0,0.75)" }}>
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2">CESIUM INITIALIZATION FAILED</div>
            <div className="text-[10px]">{error}</div>
          </div>
        </div>
      )}

      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer — right-side detail panel                                          */
/* -------------------------------------------------------------------------- */

function SignalDrawer({ signal, cascade, onClose }) {
  const style = getSeverityStyle(severityKey(signal.anomalyLevel));
  const color = style.bg || style.text;
  const meta = AGENT_META[signal.agentId];
  const forecasts = forecastEntries(signal);
  const role = cascadeRoleFor(cascade, signal.sectorId);

  return (
    <div className="absolute top-0 right-0 h-full flex flex-col z-20" style={{ width: 340, background: T.bg.card, borderLeft: `1px solid ${T.border.default}`, boxShadow: "-20px 0 50px rgba(0,0,0,0.16)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px]" style={{ border: `1.5px solid ${AGENT_COLOR[signal.agentId]}`, color: AGENT_COLOR[signal.agentId] }}>
            {AGENT_GLYPH[signal.agentId]}
          </span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: T.text.primary }}>
              {meta?.label || signal.agentId?.replaceAll("_", " ")}
            </div>
            <div className="text-[8px] uppercase tracking-widest mt-0.5 flex items-center gap-2" style={{ color: T.text.micro }}>
              <span>{signal.domain || "UNKNOWN"}</span>
              {signal.isLiveAnchor && (
                <span className="flex items-center gap-1" style={{ color: T.severity.good.text }}>
                  <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: T.severity.good.text }} />
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: T.text.micro, background: "none", border: "none", cursor: "pointer" }}>✕</button>
      </div>

      {/* Content */}
      <div className="px-4 py-4 flex flex-col gap-5 overflow-y-auto">

        {role && (
          <div className="text-[9px] tracking-widest uppercase font-bold px-2 py-1 text-center" style={{ border: `1px solid ${role === "primary" ? CASCADE_RED_PRIMARY : CASCADE_RED_SPREAD}`, color: role === "primary" ? CASCADE_RED_PRIMARY : CASCADE_RED_SPREAD }}>
            {role === "primary" ? "⚠ CASCADE ORIGIN SECTOR" : "⚠ CASCADE SPREAD SECTOR"}
          </div>
        )}

        {/* Health */}
        <div>
          <div className="text-[8px] tracking-widest uppercase mb-1" style={{ color: T.text.micro }}>HEALTH SCORE</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold" style={{ color }}>{signal.healthScore ?? "—"}</span>
            <span className="text-[10px]" style={{ color: T.text.micro }}>/100</span>
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="text-[8px] tracking-widest uppercase mb-1" style={{ color: T.text.micro }}>ANOMALY</div>
          <span className="inline-block text-[9px] tracking-widest uppercase font-bold px-2 py-1" style={{ border: `1px solid ${color}`, color }}>
            {signal.anomalyLevel || "UNKNOWN"}
          </span>
        </div>

        <InfoRow label="SECTOR" value={`${signal.sectorId} — ${labelText(signal)}`} />
        <InfoRow label="DISTRICT" value={signal.district} />
        <InfoRow label="HAZARD RADIUS" value={signal.location?.radiusMeters ? `${signal.location.radiusMeters}m` : "—"} />
        <InfoRow label="AGENT" value={signal.agentId} />
        {meta?.dataAnchor && <InfoRow label="DATA ANCHOR" value={meta.dataAnchor} />}

        {/* Signal */}
        <div>
          <div className="text-[8px] tracking-widest uppercase mb-2" style={{ color: T.text.micro }}>SIGNAL</div>
          <div className="text-[10px] leading-relaxed" style={{ color: T.text.secondary }}>{signal.signal || "No signal description"}</div>
        </div>

        {/* Metrics */}
        {signal.metrics && (
          <div>
            <div className="text-[8px] tracking-widest uppercase mb-2" style={{ color: T.text.micro }}>RAW METRICS</div>
            <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
              {Object.entries(signal.metrics).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <span className="text-[8px] break-all" style={{ color: T.text.micro }}>{key}</span>
                  <span className="text-[9px] text-right break-all" style={{ color: T.text.secondary }}>
                    {Array.isArray(value) ? (value.length ? value.join(", ") : "—") : typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast — auto-detects any "<x>Forecast" key, always last */}
        {forecasts.map(([key, forecast]) => (
          <div key={key}>
            <div className="text-[8px] tracking-widest uppercase mb-2" style={{ color: T.text.micro }}>{forecastTitle(key)}</div>
            <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
              {Object.entries(forecast).map(([fKey, fValue]) => (
                <div key={fKey} className="flex flex-col gap-0.5">
                  <span className="text-[7px] uppercase tracking-wider" style={{ color: T.text.micro }}>{fKey}</span>
                  <span className="text-[9px]" style={{ color: T.text.secondary }}>
                    {Array.isArray(fValue) ? (fValue.length ? fValue.join(", ") : "—") : String(fValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <InfoRow label="UPDATED" value={signal.timestamp ? new Date(signal.timestamp).toLocaleTimeString("en-IN", { hour12: false }) : "—"} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-[8px] tracking-widest uppercase mb-1" style={{ color: T.text.micro }}>{label}</div>
      <div className="text-[10px] break-words" style={{ color: T.text.secondary }}>{value ?? "—"}</div>
    </div>
  );
}