import { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Entity, CustomDataSource } from "resium";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useLocation } from "react-router-dom";

import { useGhostnet } from "../context/GhostnetContext";
import { T, getSeverityStyle } from "../lib/theme";
import { AGENT_META } from "../lib/schema";
import { SECTORS, SECTOR_BY_ID, nearestSectors, distanceBetween } from "../lib/sectors";

/* ─────────────────────────────────────────────────────── */
/* Cesium token                                            */
/* ─────────────────────────────────────────────────────── */
Cesium.Ion.defaultAccessToken =
import.meta.env.VITE_CESIUM_API;

/* ─────────────────────────────────────────────────────── */
/* Delhi boundary                                          */
/* ─────────────────────────────────────────────────────── */
const DELHI_BOUNDARY = [
  77.0645,28.8825, 77.1200,28.9200, 77.2000,28.9500, 77.3200,28.9100,
  77.3950,28.8500, 77.4500,28.7800, 77.5000,28.7200, 77.5200,28.6500,
  77.5100,28.5700, 77.4800,28.5000, 77.4200,28.4400, 77.3500,28.4000,
  77.2600,28.3800, 77.1800,28.3900, 77.0900,28.4200, 77.0000,28.4800,
  76.9200,28.5500, 76.8500,28.6200, 76.8700,28.7000, 76.9200,28.7800,
  76.9800,28.8300, 77.0645,28.8825,
];

/* ─────────────────────────────────────────────────────── */
/* Delhi default camera                                    */
/* ─────────────────────────────────────────────────────── */
const DELHI_VIEW = { lon: 77.209, lat: 28.6139, height: 14000 };

/* ─────────────────────────────────────────────────────── */
/* Agent palette                                           */
/* ─────────────────────────────────────────────────────── */
const AGENT_COLOR = {
  smog_dispersion:        "#FF4040",
  waterlogging_hydrology: "#40A0FF",
  thermal_stress:         "#FF8800",
  transit_fleet:          "#FFB800",
  road_corridor:          "#FF6600",
  metro_transit:          "#A066FF",
  power_grid:             "#FFE000",
  industrial_hazard:      "#FF2020",
  hospital_capacity:      "#FF4080",
  emergency_dispatch:     "#FF1030",
  social_panic:           "#C040FF",
  traffic_news:           "#FFA000",
};

const AGENT_GLYPH = {
  smog_dispersion:        "\u2601",
  waterlogging_hydrology: "\u2248",
  thermal_stress:         "\u2600",
  transit_fleet:          "B",
  road_corridor:          "\u2B95",
  metro_transit:          "M",
  power_grid:             "\u26A1",
  industrial_hazard:      "\u26A0",
  hospital_capacity:      "\u271A",
  emergency_dispatch:     "\u260E",
  social_panic:           "\u203C",
  traffic_news:           "\u26A7",
};

/* ─────────────────────────────────────────────────────── */
/* Cascade colours                                         */
/* ─────────────────────────────────────────────────────── */
const CSC_PRIMARY = "#FF2020";
const CSC_SPREAD  = "#FF8800";
const CSC_CITY    = "#4499FF";

/* ─────────────────────────────────────────────────────── */
/* Pure helpers                                             */
/* ─────────────────────────────────────────────────────── */
function cc(hex, a=1){ return Cesium.Color.fromCssColorString(hex).withAlpha(a); }
function rgba(hex, a){ const c=hex.replace("#",""), n=parseInt(c,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function toRad(d){ return d*Math.PI/180; }
function mToLat(m){ return m/111320; }
function mToLng(m,lat){ return m/(111320*Math.max(0.15,Math.abs(Math.cos(toRad(lat))))); }

function pos3(loc, h=22){
  if(!loc||typeof loc.lat!=="number"||typeof loc.lng!=="number") return null;
  return Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, h);
}

/* Offset a lat/lng by dx/dy metres — used to separate overlapping pins */
function offsetLoc(loc, dxM, dyM){
  if(!loc) return loc;
  return {
    ...loc,
    lat: loc.lat + mToLat(dyM),
    lng: loc.lng + mToLng(dxM, loc.lat),
  };
}

function lbl(s){
  return s?.location?.placeName||s?.location?.stationName||
         s?.metrics?.substationName||s?.metrics?.primaryFacilityName||
         s?.metrics?.corridorName||s?.sectorId||s?.agentId||"—";
}

function fxEntries(signal){
  if(!signal) return [];
  return Object.entries(signal).filter(([k,v])=>k.endsWith("Forecast")&&v&&typeof v==="object");
}

function sameSignal(a,b){ return a&&b&&a.sectorId===b.sectorId&&a.agentId===b.agentId; }

function isTriggered(cascades, signal){
  return (cascades||[]).some(c=>{
    const ag = c.triggeredAgents||c.agentsTriggered||[];
    const zone = c.primarySectorId===signal.sectorId||(c.spatialSpread||[]).includes(signal.sectorId);
    return ag.includes(signal.agentId)&&zone;
  });
}

function sectorRole(cascades, sectorId){
  for(const c of (cascades||[])){
    if(c.primarySectorId===sectorId) return "primary";
    if((c.spatialSpread||[]).includes(sectorId)) return "spread";
  }
  return null;
}

/* ─────────────────────────────────────────────────────── */
/* Pulse helpers                                            */
/* ─────────────────────────────────────────────────────── */
function pN(mn, mx, p = 1400) {
  return new Cesium.CallbackProperty(() => {
    // Quantize time so two properties evaluated during the same
    // Cesium frame always receive the exact same radius.
    const now = Math.floor(Date.now() / 50) * 50;
    const t = (now % p) / p;

    return mn + (mx - mn) * (Math.sin(t * Math.PI * 2) + 1) / 2;
  }, false);
}
function pC(hex,mn,mx,p=1400){ return new Cesium.CallbackProperty(()=>{ const t=(Date.now()%p)/p; return cc(hex,mn+(mx-mn)*(Math.sin(t*Math.PI*2)+1)/2); },false); }
function pM(hex,mn,mx,p=1400){ return new Cesium.ColorMaterialProperty(pC(hex,mn,mx,p)); }

/* ─────────────────────────────────────────────────────── */
/* Icon cache                                              */
/* ─────────────────────────────────────────────────────── */
const IC = new Map();
const RS = 2;

/* Agent badge — dark bg, glyph, glow */
function agentIcon(agentId, sev, health, highlighted){
  const hb = Math.round((health??50)/5)*5;
  const k = `ag:${agentId}:${sev}:${hb}:${highlighted?1:0}`;
  if(IC.has(k)) return IC.get(k);
  const accent = AGENT_COLOR[agentId]||"#FFFFFF";
  const glyph  = AGENT_GLYPH[agentId]||"\u25CF";
  const frac   = Math.max(0.04, Math.min(1, 1-hb/100));
  const sz = 80*RS;
  const cv = document.createElement("canvas"); cv.width=sz; cv.height=sz;
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
  const cx=sz/2, cy=sz/2, outerR=sz/2-3*RS, rw=6*RS, bgR=outerR-rw-2*RS;
  // glow
  const g=ctx.createRadialGradient(cx,cy,bgR*0.4,cx,cy,outerR*1.9);
  g.addColorStop(0,rgba(accent,highlighted?0.55:0.35)); g.addColorStop(1,rgba(accent,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,outerR*1.9,0,Math.PI*2); ctx.fill();
  // dark track
  ctx.beginPath(); ctx.arc(cx,cy,outerR,0,Math.PI*2);
  ctx.lineWidth=rw; ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.stroke();
  // progress arc
  ctx.beginPath(); ctx.arc(cx,cy,outerR,-Math.PI/2,-Math.PI/2+frac*Math.PI*2);
  ctx.lineWidth=rw; ctx.strokeStyle=accent; ctx.lineCap="round"; ctx.stroke();
  // dark badge
  ctx.beginPath(); ctx.arc(cx,cy,bgR,0,Math.PI*2);
  ctx.fillStyle="rgba(8,8,8,0.92)"; ctx.fill();
  ctx.lineWidth=3*RS; ctx.strokeStyle=accent; ctx.stroke();
  // glyph
  ctx.fillStyle="#FFFFFF";
  ctx.font=`bold ${Math.round(bgR*0.95)}px "Segoe UI Symbol","Noto Sans Symbols","Arial",sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(glyph,cx,cy+1.5*RS);
  const url=cv.toDataURL(); IC.set(k,url); return url;
}

/* SVG teardrop cascade pin — rendered as data URL */
function cascadePin(type, isSelected=false){
  const k = `cp:${type}:${isSelected?1:0}`;
  if(IC.has(k)) return IC.get(k);

  const color = type==="primary" ? CSC_PRIMARY : type==="spread" ? CSC_SPREAD : CSC_CITY;
  const label = type==="primary" ? "!" : type==="spread" ? "\u25CF" : "C";

  // SVG teardrop — proper Google-maps-style shape
  const W=48, H=64;
  const r = 20; // circle radius
  const cx = W/2, cy = r+2; // circle centre
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- teardrop path -->
    <path d="M${cx},${cy-r} A${r},${r} 0 1 1 ${cx-0.01},${cy-r} L${cx},${H-2} Z"
      fill="rgba(6,6,6,0.90)" stroke="${color}" stroke-width="${isSelected?3.5:2.5}" filter="url(#glow)"/>
    <!-- inner coloured circle -->
    <circle cx="${cx}" cy="${cy}" r="${r*0.52}" fill="${color}" opacity="0.95"/>
    <!-- label -->
    <text x="${cx}" y="${cy+1}" text-anchor="middle" dominant-baseline="middle"
      fill="white" font-family="Arial,sans-serif" font-size="${r*0.7}" font-weight="bold">${label}</text>
  </svg>`;

  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  IC.set(k,url); return url;
}

/* ─────────────────────────────────────────────────────── */
/* Sector hexagons — only in cascade layers                */
/* ─────────────────────────────────────────────────────── */
const SEC_R = SECTORS.reduce((acc,s)=>{
  const [nid] = nearestSectors(s.sectorId,1);
  const dk = nid ? distanceBetween(s.sectorId,nid) : 6;
  acc[s.sectorId] = Math.min(1800, Math.max(500,(dk*1000)/2*0.34));
  return acc;
},{});

function hexPts(c,r,rot=0){
  const pts=[];
  for(let i=0;i<6;i++){
    const a=toRad(rot+i*60);
    pts.push(c.lng+mToLng(r*Math.sin(a),c.lat), c.lat+mToLat(r*Math.cos(a)));
  }
  return pts;
}

function CascadeHex({sector, role, isSelected}){
  const r = SEC_R[sector.sectorId]||1800;
  const pts = hexPts(sector,r);
  const fillColor = role==="primary" ? CSC_PRIMARY : role==="spread" ? CSC_SPREAD : CSC_CITY;
  const fillAlpha = role==="primary" ? 0.38 : 0.22;
  const period    = role==="primary" ? 900 : 1400;
  return (
    <Entity polygon={{
      hierarchy: Cesium.Cartesian3.fromDegreesArray(pts),
      height: 3,
      material: isSelected ? pM(fillColor,fillAlpha*0.6,fillAlpha,period) : cc(fillColor,fillAlpha*0.5),
      outline: true,
      outlineColor: isSelected ? pC(fillColor,0.55,1.0,period) : cc(fillColor,0.75),
      outlineWidth: role==="primary" ? 4 : 2.5,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(700,60000),
    }}/>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Delhi boundary ring                                     */
/* ─────────────────────────────────────────────────────── */
function DelhiBoundary(){
  return (
    <Entity>
      <Entity polyline={{positions:Cesium.Cartesian3.fromDegreesArray(DELHI_BOUNDARY),width:9,material:new Cesium.PolylineGlowMaterialProperty({glowPower:0.4,color:cc("#FFD700",0.85)}),clampToGround:true}}/>
      <Entity polyline={{positions:Cesium.Cartesian3.fromDegreesArray(DELHI_BOUNDARY),width:2.5,material:cc("#FFE87C",1.0),clampToGround:true}}/>
    </Entity>
  );
}

/* ─────────────────────────────────────────────────────── */
/* AnomalyBadge                                            */
/* Overlapping pins at same sector offset by index        */
/* ─────────────────────────────────────────────────────── */
function AnomalyBadge({signal, highlighted, dimmed, onClick, offsetIndex=0}){
  const sev = signal.anomalyLevel==="critical"?"critical":signal.anomalyLevel==="warning"?"warning":"nominal";
  const size = sev==="critical"?52:sev==="warning"?42:30;

  // Spiral offset so overlapping pins don't stack — each gets a unique angle+distance
  const OFFSETS = [
    [0,0],[28,0],[-28,0],[0,28],[0,-28],
    [20,20],[-20,20],[20,-20],[-20,-20],
    [36,0],[-36,0],[0,36],
  ];
  const [dxM, dyM] = OFFSETS[Math.min(offsetIndex, OFFSETS.length-1)];
  const loc = offsetIndex===0 ? signal.location : offsetLoc(signal.location, dxM, dyM);

  return (
    <Entity
      position={pos3(loc, 28)}
      onClick={()=>onClick(signal)}
      billboard={{
        image: agentIcon(signal.agentId, sev, signal.healthScore, highlighted),
        width: size, height: size,
        color: dimmed ? cc("#FFFFFF",0.5) : Cesium.Color.WHITE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        eyeOffset: new Cesium.Cartesian3(0,0,-500),
      }}
      label={undefined}
    />
  );
}

/* ─────────────────────────────────────────────────────── */
/* Zone geometry helpers                                   */
/* ─────────────────────────────────────────────────────── */
function rad(s,m=1){ return Math.max(80,Number(s?.location?.radiusMeters||300)*m); }

function makeZone(signal,meters,points=12,seed=0){
  const loc=signal?.location;
  if(!loc||typeof loc.lat!=="number"||typeof loc.lng!=="number") return [];
  const pts=[];
  for(let i=0;i<points;i++){
    const a=(Math.PI*2*i)/points+seed*0.37;
    const v=0.78+((i*17+seed*13)%29)/100;
    pts.push(loc.lng+Math.cos(a)*mToLng(meters,loc.lat)*v, loc.lat+Math.sin(a)*mToLat(meters)*v);
  }
  return Cesium.Cartesian3.fromDegreesArray(pts);
}

function makeDir(signal,lenM,widM,dir=0,seed=0){
  const loc=signal?.location; if(!loc) return [];
  const h=toRad(dir);
  const fLng=Math.sin(h),fLat=Math.cos(h),sLng=Math.cos(h),sLat=-Math.sin(h);
  const cLng=mToLng(lenM,loc.lat),cLat=mToLat(lenM),wLng=mToLng(widM,loc.lat),wLat=mToLat(widM);
  const tpl=[[0,-0.18],[0.25,-0.48],[0.58,-0.72],[0.88,-0.82],[1.0,-0.45],[1.08,0],[1.0,0.45],[0.88,0.82],[0.58,0.72],[0.25,0.48],[0,0.18]];
  const deg=[];
  tpl.forEach(([fw,sd],i)=>{ const w=1+Math.sin(i*2.1+seed)*0.025; deg.push(loc.lng+(fLng*cLng*fw+sLng*wLng*sd)*w,loc.lat+(fLat*cLat*fw+sLat*wLat*sd)*w); });
  return Cesium.Cartesian3.fromDegreesArray(deg);
}

function roadPos(signal,lenM=1600){
  const geo=signal?.geometry||signal?.location?.geometry;
  if(geo?.type==="LineString"&&Array.isArray(geo.coordinates)) return Cesium.Cartesian3.fromDegreesArray(geo.coordinates.flat());
  const loc=signal?.location; if(!loc) return [];
  const lS=mToLng(lenM,loc.lat),lA=mToLat(lenM*0.18);
  return Cesium.Cartesian3.fromDegreesArray([loc.lng-lS,loc.lat-lA,loc.lng-lS*0.55,loc.lat-lA*0.4,loc.lng,loc.lat,loc.lng+lS*0.55,loc.lat+lA*0.4,loc.lng+lS,loc.lat+lA]);
}

function geoPoly(signal,fallback){
  const geo=signal?.geometry||signal?.location?.geometry;
  if(geo?.type==="Polygon"&&Array.isArray(geo.coordinates)){
    const ring=geo.coordinates[0];
    if(ring?.length>=3) return Cesium.Cartesian3.fromDegreesArray(ring.flat());
  }
  return fallback;
}

/* ─────────────────────────────────────────────────────── */
/* Source dot marker                                        */
/* ─────────────────────────────────────────────────────── */
function SrcDot({signal,color,triggered,onClick}){
  return (
    <Entity onClick={()=>onClick(signal)}>
      <Entity position={pos3(signal.location,22)} point={{
        pixelSize:triggered?14:10,
        color:cc(color,1),
        outlineColor:cc("#000000",0.8),
        outlineWidth:2.5,
        heightReference:Cesium.HeightReference.NONE,
        disableDepthTestDistance:Number.POSITIVE_INFINITY,
      }}/>
    </Entity>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Per-agent zone visuals                                  */
/* ─────────────────────────────────────────────────────── */
const ZC={smog:"#FF2020",flood:"#1080FF",thermal:"#FF6600",transit:"#FFAA00",metro:"#8844FF",power:"#FFE000",industrial:"#FF1010",hospital:"#FF2060",emergency:"#FF0030",panic:"#AA00FF",traffic:"#FF8800"};

function Smog({signal,triggered,onClick}){
  const m=signal.metrics||{};
  const scale=Math.min(2.8,Math.max(1,Number(m.aqi||160)/150+Number(m.pm25||100)/600));
  const wind=typeof m.windDirectionDeg==="number"?m.windDirectionDeg:135;
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:geoPoly(signal,makeDir(signal,rad(signal,1.7)*scale,rad(signal,0.8)*scale,wind,3)),height:15,material:cc(ZC.smog,triggered?0.50:0.32),outline:true,outlineColor:cc(ZC.smog,triggered?1.0:0.80),outlineWidth:triggered?5:3}}/>
    <Entity polygon={{hierarchy:makeDir(signal,rad(signal,0.85)*scale,rad(signal,0.35)*scale,wind,8),height:22,material:cc("#FF0000",triggered?0.60:0.40),outline:false}}/>
    <SrcDot signal={signal} color={ZC.smog} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Flood({signal,triggered,onClick}){
  const scale=Math.min(2.8,Math.max(0.9,Number(signal.metrics?.waterDepthCm||12)/15));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale),14,4),height:5,material:cc(ZC.flood,triggered?0.55:0.38),outline:true,outlineColor:cc(ZC.flood,triggered?1.0:0.85),outlineWidth:triggered?5:3}}/>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale*0.6),12,9),height:9,material:cc("#0055FF",0.50),outline:false}}/>
    <SrcDot signal={signal} color={ZC.flood} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Thermal({signal,triggered,onClick}){
  const scale=Math.min(2.5,Math.max(0.8,Number(signal.metrics?.feelsLikeTempC||signal.metrics?.ambientTempC||42)/42));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale),16,5),height:7,material:cc(ZC.thermal,triggered?0.50:0.32),outline:true,outlineColor:cc(ZC.thermal,triggered?1.0:0.80),outlineWidth:triggered?5:3}}/>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale*0.55),14,10),height:12,material:cc("#FF3300",0.50),outline:false}}/>
    <SrcDot signal={signal} color={ZC.thermal} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Transit({signal,triggered,onClick}){
  const ratio=Number(signal.metrics?.stationaryRatio||0.72);
  const len=rad(signal,2.1)*Math.min(1.5,Math.max(0.7,ratio+0.35));
  const road=roadPos(signal,len);
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polyline={{positions:road,width:triggered?22:14,material:cc(ZC.transit,0.30),clampToGround:true}}/>
    <Entity polyline={{positions:road,width:triggered?9:5,material:cc(ZC.transit,1.0),clampToGround:true}}/>
    <SrcDot signal={signal} color={ZC.transit} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Road({signal,triggered,onClick}){
  const len=Math.min(3500,Math.max(800,Number(signal.metrics?.jamLengthMeters||1800)));
  const road=roadPos(signal,len);
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polyline={{positions:road,width:triggered?24:16,material:cc(ZC.traffic,0.28),clampToGround:true}}/>
    <Entity polyline={{positions:road,width:triggered?10:6,material:cc(ZC.traffic,1.0),clampToGround:true}}/>
    <SrcDot signal={signal} color={ZC.traffic} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Metro({signal,triggered,onClick}){
  const sr=rad(signal)*Math.min(1.9,Math.max(0.7,Number(signal.metrics?.platformCapacityPct||80)/70));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity position={pos3(signal.location,8)} ellipse={{semiMajorAxis:sr,semiMinorAxis:sr,height:8,material:cc(ZC.metro,triggered?0.50:0.32),outline:true,outlineColor:cc(ZC.metro,triggered?1.0:0.85),outlineWidth:triggered?5:3}}/>
    <Entity position={pos3(signal.location,12)} ellipse={{semiMajorAxis:sr*0.5,semiMinorAxis:sr*0.5,height:12,material:cc("#6600FF",0.50),outline:false}}/>
    <SrcDot signal={signal} color={ZC.metro} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Power({signal,triggered,onClick}){
  const spokes=[];
  for(let i=0;i<8;i++){
    const a=(i*Math.PI*2)/8, len=rad(signal,1.15);
    spokes.push(<Entity key={`sk${i}`} polyline={{positions:Cesium.Cartesian3.fromDegreesArray([signal.location.lng,signal.location.lat,signal.location.lng+Math.sin(a)*mToLng(len,signal.location.lat),signal.location.lat+Math.cos(a)*mToLat(len)]),width:2.5,material:cc(ZC.power,0.80),clampToGround:true}}/>);
  }
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,1.2),10,6),height:7,material:cc(ZC.power,triggered?0.42:0.26),outline:true,outlineColor:cc(ZC.power,triggered?1.0:0.80),outlineWidth:triggered?5:3}}/>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,0.5),8,12),height:12,material:cc("#FFA000",0.50),outline:false}}/>
    {spokes}
    <SrcDot signal={signal} color={ZC.power} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Industrial({signal,triggered,onClick}){
  const m=signal.metrics||{};
  const evacR=Number(m.evacuationRadiusMeters||signal.location?.radiusMeters||800);
  return <Entity onClick={()=>onClick(signal)}>
    {(m.toxicSmokePlume??true)&&<Entity polygon={{hierarchy:makeDir(signal,evacR*1.6,evacR*0.5,Number(m.windDirectionDeg||135),14),height:16,material:cc("#999999",0.35),outline:true,outlineColor:cc("#CCCCCC",0.65),outlineWidth:2}}/>}
    <Entity polygon={{hierarchy:makeZone(signal,evacR,16,3),height:12,material:cc(ZC.industrial,triggered?0.52:0.34),outline:true,outlineColor:cc(ZC.industrial,triggered?1.0:0.85),outlineWidth:triggered?6:4}}/>
    <Entity polygon={{hierarchy:makeZone(signal,evacR*0.35,12,9),height:22,material:cc("#FF0000",0.55),outline:true,outlineColor:cc("#FF4400",1),outlineWidth:4}}/>
    <SrcDot signal={signal} color={ZC.industrial} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Hospital({signal,triggered,onClick}){
  const or_=rad(signal)*Math.min(2,Math.max(0.8,Number(signal.metrics?.icuOccupancyPct||90)/75));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity position={pos3(signal.location,9)} ellipse={{semiMajorAxis:or_,semiMinorAxis:or_,height:9,material:cc(ZC.hospital,triggered?0.48:0.30),outline:true,outlineColor:cc(ZC.hospital,triggered?1.0:0.85),outlineWidth:triggered?5:3}}/>
    <Entity position={pos3(signal.location,14)} ellipse={{semiMajorAxis:or_*0.5,semiMinorAxis:or_*0.5,height:14,material:cc("#FF0040",0.50),outline:false}}/>
    <SrcDot signal={signal} color={ZC.hospital} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Emergency({signal,triggered,onClick}){
  const scale=Math.min(2.5,Math.max(0.8,Number(signal.metrics?.callVelocitySpikeRatio||3)/2.5));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity position={pos3(signal.location,7)} ellipse={{semiMajorAxis:rad(signal,scale),semiMinorAxis:rad(signal,scale),height:7,material:cc(ZC.emergency,triggered?0.50:0.30),outline:true,outlineColor:cc(ZC.emergency,triggered?1.0:0.85),outlineWidth:triggered?5:3}}/>
    <Entity position={pos3(signal.location,12)} ellipse={{semiMajorAxis:rad(signal,scale*0.45),semiMinorAxis:rad(signal,scale*0.45),height:12,material:cc("#FF0020",0.55),outline:false}}/>
    <SrcDot signal={signal} color={ZC.emergency} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Panic({signal,triggered,onClick}){
  const m=signal.metrics||{};
  const scale=Math.min(2.8,Math.max(0.9,Number(m.meanRoBERTaPanicScore||0.7)+Number(m.keywordVelocityRatio||4)/7));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale),15,7),height:5,material:cc(ZC.panic,triggered?0.45:0.28),outline:true,outlineColor:cc(ZC.panic,triggered?1.0:0.80),outlineWidth:triggered?4:2.5}}/>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal,scale*0.55),13,12),height:10,material:cc("#8800FF",0.45),outline:false}}/>
    <SrcDot signal={signal} color={ZC.panic} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Traffic({signal,triggered,onClick}){
  const road=roadPos(signal,rad(signal,2.2));
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polyline={{positions:road,width:triggered?26:18,material:cc(ZC.traffic,0.28),clampToGround:true}}/>
    <Entity polyline={{positions:road,width:triggered?10:6,material:cc("#FF6600",1.0),clampToGround:true}}/>
    <SrcDot signal={signal} color={ZC.traffic} triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function Generic({signal,triggered,onClick}){
  return <Entity onClick={()=>onClick(signal)}>
    <Entity polygon={{hierarchy:makeZone(signal,rad(signal),12,4),height:5,material:cc("#FFFFFF",0.22),outline:true,outlineColor:cc("#FFFFFF",0.85),outlineWidth:triggered?4:2.5}}/>
    <SrcDot signal={signal} color="#FFFFFF" triggered={triggered} onClick={onClick}/>
  </Entity>;
}
function AgentViz({signal,triggered,onClick}){
  switch(signal.agentId){
    case "smog_dispersion":        return <Smog        signal={signal} triggered={triggered} onClick={onClick}/>;
    case "waterlogging_hydrology": return <Flood       signal={signal} triggered={triggered} onClick={onClick}/>;
    case "thermal_stress":         return <Thermal     signal={signal} triggered={triggered} onClick={onClick}/>;
    case "transit_fleet":          return <Transit     signal={signal} triggered={triggered} onClick={onClick}/>;
    case "road_corridor":          return <Road        signal={signal} triggered={triggered} onClick={onClick}/>;
    case "metro_transit":          return <Metro       signal={signal} triggered={triggered} onClick={onClick}/>;
    case "power_grid":             return <Power       signal={signal} triggered={triggered} onClick={onClick}/>;
    case "industrial_hazard":      return <Industrial  signal={signal} triggered={triggered} onClick={onClick}/>;
    case "hospital_capacity":      return <Hospital    signal={signal} triggered={triggered} onClick={onClick}/>;
    case "emergency_dispatch":     return <Emergency   signal={signal} triggered={triggered} onClick={onClick}/>;
    case "social_panic":           return <Panic       signal={signal} triggered={triggered} onClick={onClick}/>;
    case "traffic_news":           return <Traffic     signal={signal} triggered={triggered} onClick={onClick}/>;
    default:                       return <Generic     signal={signal} triggered={triggered} onClick={onClick}/>;
  }
}

/* ─────────────────────────────────────────────────────── */
/* SECTOR CASCADE LAYER                                    */
/* Pins + connecting lines are ALWAYS visible.              */
/* Selecting a cascade brightens the pin/hex/line and adds  */
/* the pulsing origin ring; nothing appears/disappears on   */
/* click anymore — click just intensifies + opens sidebar. */
/* ─────────────────────────────────────────────────────── */
function SectorCascadeLayer({cascades, selectedId, onSelect}){
  if(!cascades?.length) return null;
  return (
    <>
      {cascades.map((casc,ci)=>{
        const primary = SECTOR_BY_ID[casc.primarySectorId]; if(!primary) return null;
        const isSelected = selectedId===casc.primarySectorId;
        const targets = (casc.spatialSpread||[]).slice(0,4)
          .map(id=>({id,sector:SECTOR_BY_ID[id]})).filter(t=>t.sector);

        return (
          <Entity key={`sc-${casc.primarySectorId}-${ci}`}>
            {/* Primary hex — always shown in cascade layer */}
            <CascadeHex sector={primary} role="primary" isSelected={isSelected}/>

            {/* Primary SVG teardrop pin — position + billboard live on the SAME
                entity so it actually renders (a bare position on a parent Entity
                does not propagate down to a nested <Entity billboard=...>). */}
            <Entity
              position={pos3(primary, 38)}
              onClick={()=>onSelect(isSelected ? null : casc)}
              billboard={{
                image: cascadePin("primary", isSelected),
                width: 48, height: 64,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                eyeOffset: new Cesium.Cartesian3(0,0,-200),
              }}
            />

            {/* Pulsing ring at origin — own entity with its own position */}
            <Entity
              position={pos3(primary, 20)}
              ellipse={{
                semiMajorAxis: pN(500,1000,900),
                semiMinorAxis: pN(500,1000,900),
                height: 20,
                material: pM(CSC_PRIMARY,0.18,0.45,900),
                outline: true,
                outlineColor: pC(CSC_PRIMARY,0.6,1.0,900),
                outlineWidth: 4,
              }}
            />

            {/* Spread sectors — hex, pin, and connecting line are ALWAYS
                visible so the cascade reads as a connected network at a
                glance. Selecting the cascade just brightens everything. */}
            {targets.map(({id,sector})=>(
              <Entity key={`sc-sp-${id}`}>
                <CascadeHex sector={sector} role="spread" isSelected={isSelected}/>

                <Entity
                  position={pos3(sector, 32)}
                  onClick={()=>onSelect(isSelected ? null : casc)}
                  billboard={{
                    image: cascadePin("spread", isSelected),
                    width: 34, height: 46,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    eyeOffset: new Cesium.Cartesian3(0,0,-200),
                  }}
                />

                {/* Connection line primary → spread — always drawn */}
                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([primary.lng,primary.lat,sector.lng,sector.lat]),
                  width: isSelected ? 10 : 5,
                  material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: isSelected ? 0.5 : 0.25,
                    color: cc(CSC_PRIMARY, isSelected ? 0.55 : 0.35),
                  }),
                  clampToGround: true,
                }}/>
                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([primary.lng,primary.lat,sector.lng,sector.lat]),
                  width: isSelected ? 3 : 1.5,
                  material: cc("#FFFFFF", isSelected ? 0.95 : 0.55),
                  clampToGround: true,
                }}/>
              </Entity>
            ))}
          </Entity>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────── */
/* CITY CASCADE LAYER                                      */
/* Hub + area pins and connecting lines ALWAYS visible.     */
/* ─────────────────────────────────────────────────────── */
function CityCascadeLayer({cityIncident, isSelected, onSelect}){
  if(!cityIncident?.affectedAreas?.length) return null;
  const areas = cityIncident.affectedAreas
    .map(a=>({...a,sector:SECTOR_BY_ID[a.primarySectorId]}))
    .filter(a=>a.sector).slice(0,6);
  if(!areas.length) return null;
  const hub = areas[0].sector;

  return (
    <>
      {areas.map((area,i)=>{
        const isHub = i===0;
        const sector = area.sector;

        // Each area already carries its own secondarySectors (the sectors
        // that cascade spilled into around it) — previously this data was
        // only shown as text in the sidebar and never actually drawn on
        // the map, which is why a citywide incident with just one district
        // ever showed only a single hexagon. Render them here too.
        const spreadTargets = (area.secondarySectors||[]).slice(0,5)
          .map(id=>({id,sector:SECTOR_BY_ID[id]})).filter(t=>t.sector);

        return (
          <Entity key={`ci-area-${area.primarySectorId}`}>
            {/* Hex for this area's anchor sector */}
            <CascadeHex sector={sector} role="city" isSelected={isSelected}/>

            {/* SVG teardrop pin — position + billboard on the same entity
                so it renders (see note in SectorCascadeLayer above). */}
            <Entity
              position={pos3(sector, isHub?40:32)}
              onClick={onSelect}
              billboard={{
                image: cascadePin(isHub?"primary":"city", isSelected),
                width: isHub?48:34, height: isHub?64:46,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                eyeOffset: new Cesium.Cartesian3(0,0,-200),
              }}
            />

            {isHub && (
              <Entity
                position={pos3(sector, 20)}
                ellipse={{
                  semiMajorAxis: pN(600,1200,1800),
                  semiMinorAxis: pN(600,1200,1800),
                  height: 20,
                  material: pM(CSC_CITY,0.18,0.45,1800),
                  outline: true,
                  outlineColor: pC(CSC_CITY,0.55,1.0,1800),
                  outlineWidth: 4,
                }}
              />
            )}

            {/* Connection line from hub to every other affected area —
                always drawn so the whole incident reads as one connected
                network at a glance; selection just brightens it. */}
            {!isHub && (
              <Entity>
                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([hub.lng,hub.lat,sector.lng,sector.lat]),
                  width: isSelected ? 12 : 6,
                  material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: isSelected ? 0.5 : 0.25,
                    color: cc(CSC_CITY, isSelected ? 0.55 : 0.35),
                  }),
                  clampToGround: true,
                }}/>
                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([hub.lng,hub.lat,sector.lng,sector.lat]),
                  width: isSelected ? 3 : 1.5,
                  material: cc("#FFFFFF", isSelected ? 0.95 : 0.55),
                  clampToGround: true,
                }}/>
              </Entity>
            )}

            {/* NEW: this area's own spread sectors — smaller hexes + pins,
                connected back to THIS area's anchor (not the citywide hub),
                so the network visually branches out the way the underlying
                cascade data already describes it. */}
            {spreadTargets.map(({id,sector:spreadSector})=>(
              <Entity key={`ci-spread-${area.primarySectorId}-${id}`}>
                <CascadeHex sector={spreadSector} role="city" isSelected={isSelected}/>

                <Entity
                  position={pos3(spreadSector, 26)}
                  onClick={onSelect}
                  billboard={{
                    image: cascadePin("city", isSelected),
                    width: 26, height: 36,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    eyeOffset: new Cesium.Cartesian3(0,0,-200),
                  }}
                />

                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([sector.lng,sector.lat,spreadSector.lng,spreadSector.lat]),
                  width: isSelected ? 7 : 3.5,
                  material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: isSelected ? 0.45 : 0.2,
                    color: cc(CSC_CITY, isSelected ? 0.5 : 0.3),
                  }),
                  clampToGround: true,
                }}/>
                <Entity polyline={{
                  positions: Cesium.Cartesian3.fromDegreesArray([sector.lng,sector.lat,spreadSector.lng,spreadSector.lat]),
                  width: isSelected ? 2 : 1,
                  material: cc("#FFFFFF", isSelected ? 0.9 : 0.45),
                  clampToGround: true,
                }}/>
              </Entity>
            ))}
          </Entity>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Cascade Sidebar                                         */
/* ─────────────────────────────────────────────────────── */
function CascadeSidebar({item, onClose}){
  if(!item) return null;
  const isSector = item.type==="sector";
  const data = item.data;
  const accent = isSector ? CSC_PRIMARY : CSC_CITY;

  return (
    <div className="absolute top-0 right-0 h-full flex flex-col z-20"
      style={{width:360,background:T.bg.card,borderLeft:`2px solid ${accent}`,boxShadow:"-20px 0 50px rgba(0,0,0,0.22)",fontFamily:T.font.mono}}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{borderBottom:`1px solid ${T.border.subtle}`,background:T.bg.surface}}>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{background:accent,animation:"blink 1s step-start infinite"}}/>
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{color:accent}}>
            {isSector?"SECTOR CASCADE":"CITY INCIDENT"}
          </span>
        </div>
        <button onClick={onClose} style={{color:T.text.micro,background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">
        {isSector ? (
          <>
            <div>
              <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>PRIMARY SECTOR</div>
              <div className="text-[15px] font-bold" style={{color:T.text.primary}}>{data.primarySectorName||data.primarySectorId}</div>
              <div className="text-[10px] mt-0.5" style={{color:T.text.secondary}}>{data.district}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[["CASCADE SCORE",data.cascadeScore],["CONFIDENCE",`${data.confidence}%`],["ETA",`${data.hoursUntil}h`],["SPREAD SECTORS",data.spatialSpread?.length||0]].map(([l,v])=>(
                <div key={l}>
                  <div className="text-[7px] tracking-widest uppercase mb-0.5" style={{color:T.text.micro}}>{l}</div>
                  <div className="text-[14px] font-bold" style={{color:T.text.primary}}>{v}</div>
                </div>
              ))}
            </div>

            {(data.triggeredAgents||[]).length>0&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>TRIGGERED AGENTS</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.triggeredAgents.map(a=>(
                    <span key={a} className="text-[8px] tracking-wide uppercase px-2 py-1"
                      style={{border:`1px solid ${AGENT_COLOR[a]||T.border.default}`,color:AGENT_COLOR[a]||T.text.secondary}}>
                      {AGENT_GLYPH[a]} {(AGENT_META[a]?.label||a).toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.spatialSpread?.length>0&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>SPATIAL SPREAD</div>
                {data.spatialSpread.slice(0,6).map(id=>{
                  const s=SECTOR_BY_ID[id];
                  return <div key={id} className="text-[10px] mb-1" style={{color:T.text.secondary}}>→ {s?.name||id} <span style={{color:T.text.micro}}>({s?.district||"—"})</span></div>;
                })}
              </div>
            )}

            {(data.recommendations||[]).length>0&&(
              <div>
                <div className="text-[8px] tracking-widests uppercase mb-2" style={{color:T.text.micro}}>RECOMMENDED ACTIONS</div>
                {data.recommendations.map((r,i)=>(
                  <div key={i} className="flex gap-2 text-[10px] leading-relaxed mb-2" style={{color:T.text.secondary}}>
                    <span style={{color:CSC_PRIMARY,flexShrink:0}}>▸</span><span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {data.predictedEvent&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>PREDICTED EVENT</div>
                <div className="text-[11px] leading-relaxed" style={{color:T.text.secondary}}>{data.predictedEvent}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>{data.incidentId}</div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5"
                  style={{border:`1px solid ${CSC_CITY}`,color:CSC_CITY}}>{data.citywideSeverity}</span>
                <span className="text-[10px]" style={{color:T.text.micro}}>score {data.citywideCascadeScore}</span>
              </div>
              <div className="text-[11px] leading-relaxed" style={{color:T.text.secondary}}>{data.summary}</div>
            </div>

            {(data.affectedAreas||[]).length>0&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>AFFECTED AREAS</div>
                {data.affectedAreas.map(a=>(
                  <div key={a.primarySectorId} className="flex flex-col gap-1 py-2"
                    style={{borderBottom:`1px solid ${T.border.subtle}`}}>
                    <span className="text-[11px] font-bold" style={{color:T.text.primary}}>{a.district} · {a.primarySectorId}</span>
                    <span className="text-[10px]" style={{color:T.text.secondary}}>{a.affectedBy?.description}</span>
                    {a.secondarySectors?.length>0&&<span className="text-[9px]" style={{color:T.text.micro}}>→ {a.secondarySectors.join(", ")}</span>}
                  </div>
                ))}
              </div>
            )}

            {data.mitigationMeasures?.immediateDirectives?.length>0&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>IMMEDIATE DIRECTIVES</div>
                {data.mitigationMeasures.immediateDirectives.map((d,i)=>(
                  <div key={i} className="flex items-start justify-between gap-2 py-1.5"
                    style={{borderBottom:`1px solid ${T.border.subtle}`}}>
                    <span className="text-[10px] leading-relaxed" style={{color:T.text.secondary}}>
                      {d.action} <span style={{color:T.text.micro}}>— {d.targetAgency}</span>
                    </span>
                    <span className="text-[8px] tracking-widest uppercase font-bold px-1.5 py-0.5 shrink-0"
                      style={{border:`1px solid ${T.border.default}`,color:T.text.micro}}>
                      {d.priority?.replace("P","").replace("_"," ")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.mitigationMeasures?.publicAdvisories?.length>0&&(
              <div>
                <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>PUBLIC ADVISORIES</div>
                {data.mitigationMeasures.publicAdvisories.map((p,i)=>(
                  <div key={i} className="py-1.5" style={{borderBottom:`1px solid ${T.border.subtle}`}}>
                    <div className="text-[10px] font-bold" style={{color:T.text.primary}}>{p.headline}</div>
                    <div className="text-[9px] mt-0.5" style={{color:T.text.micro}}>{p.channel}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="text-[8px]" style={{color:T.text.micro}}>
          {data.timestamp ? new Date(data.timestamp).toLocaleTimeString("en-IN",{hour12:false}) : "—"}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Signal Drawer                                           */
/* ─────────────────────────────────────────────────────── */
function SignalDrawer({signal, cascades, cityIncident, onClose}){
  const meta   = AGENT_META[signal.agentId];
  const accent = AGENT_COLOR[signal.agentId]||"#FFFFFF";
  const forecasts = fxEntries(signal);

  let secRole = null;
  for(const c of (cascades||[])){
    if(c.primarySectorId===signal.sectorId){secRole="primary";break;}
    if((c.spatialSpread||[]).includes(signal.sectorId)) secRole="spread";
  }
  const cityArea = cityIncident?.affectedAreas?.find(a=>a.primarySectorId===signal.sectorId);

  return (
    <div className="absolute top-0 right-0 h-full flex flex-col z-20"
      style={{width:340,background:T.bg.card,borderLeft:`1px solid ${T.border.default}`,boxShadow:"-20px 0 50px rgba(0,0,0,0.18)",fontFamily:T.font.mono}}>

      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{borderBottom:`1px solid ${T.border.subtle}`}}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px]"
            style={{border:`1.5px solid ${accent}`,color:accent}}>{AGENT_GLYPH[signal.agentId]}</span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{color:T.text.primary}}>
              {meta?.label||signal.agentId?.replaceAll("_"," ")}
            </div>
            <div className="text-[8px] uppercase tracking-widest mt-0.5" style={{color:T.text.micro}}>{signal.domain||"UNKNOWN"}</div>
          </div>
        </div>
        <button onClick={onClose} style={{color:T.text.micro,background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">
        {secRole&&<div className="text-[9px] tracking-widest uppercase font-bold px-2 py-1 text-center"
          style={{border:`1px solid ${secRole==="primary"?CSC_PRIMARY:CSC_SPREAD}`,color:secRole==="primary"?CSC_PRIMARY:CSC_SPREAD}}>
          {secRole==="primary"?"⚠ CASCADE ORIGIN":"⚠ CASCADE SPREAD"}</div>}
        {cityArea&&<div className="text-[9px] tracking-widest uppercase font-bold px-2 py-1 text-center"
          style={{border:`1px solid ${CSC_CITY}`,color:CSC_CITY,background:"rgba(68,153,255,0.06)"}}>
          🌐 CITY INCIDENT · {cityIncident.citywideSeverity}</div>}

        <div>
          <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>HEALTH SCORE</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold" style={{color:accent}}>{signal.healthScore??"—"}</span>
            <span className="text-[10px]" style={{color:T.text.micro}}>/100</span>
          </div>
        </div>

        <div>
          <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>ANOMALY</div>
          <span className="inline-block text-[9px] tracking-widest uppercase font-bold px-2 py-1"
            style={{border:`1px solid ${accent}`,color:signal.anomalyLevel==="critical"?T.bg.card:accent,background:signal.anomalyLevel==="critical"?accent:"transparent"}}>
            {signal.anomalyLevel?.toUpperCase()||"UNKNOWN"}
          </span>
        </div>

        {[["SECTOR",signal.sectorId],["DISTRICT",signal.district],["LOCATION",lbl(signal)],["AGENT",signal.agentId],...(meta?.dataAnchor?[["DATA ANCHOR",meta.dataAnchor]]:[])].map(([l,v])=>(
          <div key={l}>
            <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{color:T.text.micro}}>{l}</div>
            <div className="text-[10px] break-words" style={{color:T.text.secondary}}>{v??"—"}</div>
          </div>
        ))}

        <div>
          <div className="text-[8px] tracking-widest uppercase mb-1" style={{color:T.text.micro}}>SIGNAL</div>
          <div className="text-[10px] leading-relaxed" style={{color:T.text.secondary}}>{signal.signal||"—"}</div>
        </div>

        {signal.metrics&&(
          <div>
            <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>METRICS</div>
            <div className="flex flex-col gap-1.5 pt-2" style={{borderTop:`1px solid ${T.border.subtle}`}}>
              {Object.entries(signal.metrics).map(([k,v])=>(
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-[8px] break-all" style={{color:T.text.micro}}>{k}</span>
                  <span className="text-[9px] text-right break-all" style={{color:T.text.secondary}}>
                    {Array.isArray(v)?v.join(", "):typeof v==="object"?JSON.stringify(v):String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {forecasts.map(([key,forecast])=>(
          <div key={key}>
            <div className="text-[8px] tracking-widest uppercase mb-2" style={{color:T.text.micro}}>
              {key.replace(/Forecast$/,"").replace(/([a-z])([A-Z])/g,"$1 $2").toUpperCase()} FORECAST
            </div>
            <div className="flex flex-col gap-1.5 pt-2" style={{borderTop:`1px solid ${T.border.subtle}`}}>
              {Object.entries(forecast).map(([fk,fv])=>(
                <div key={fk} className="flex flex-col gap-0.5">
                  <span className="text-[7px] uppercase tracking-wider" style={{color:T.text.micro}}>{fk}</span>
                  <span className="text-[9px]" style={{color:T.text.secondary}}>
                    {Array.isArray(fv)?(fv.length?fv.join(", "):"—"):String(fv)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{color:T.text.micro}}>UPDATED</div>
          <div className="text-[10px]" style={{color:T.text.secondary}}>
            {signal.timestamp ? new Date(signal.timestamp).toLocaleTimeString("en-IN",{hour12:false}) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Cesium pre-loader — call this from sidebar on mount    */
/* so terrain + buildings start loading before user visits */
/* ─────────────────────────────────────────────────────── */
let cesiumPreloaded = false;
export function preloadCesium(){
  if(cesiumPreloaded) return;
  cesiumPreloaded = true;
  // Kick off Cesium terrain init in background
  Cesium.createWorldTerrainAsync().catch(()=>{});
}

/* ─────────────────────────────────────────────────────── */
/* CITY MAP                                                */
/* ─────────────────────────────────────────────────────── */
export default function CityMap(){
  const {allSignals,sectorHealth,cascade,cascades,liveCityIncident,cityIncident} = useGhostnet();

  const [cesiumViewer,setCesiumViewer]                     = useState(null);
  const [ready,setReady]                                   = useState(false);
  const [error,setError]                                   = useState(null);
  const [selectedSignal,setSelectedSignal]                 = useState(null);
  const [selectedSignalWithRoad,setSelectedSignalWithRoad] = useState(null);
  const [layerMode,setLayerMode]                           = useState("agents");
  const [selectedCascade,setSelectedCascade]               = useState(null);

  const routerLocation    = useLocation();
  const clusterDsRef      = useRef(null);
  const roadGeomCache     = useRef({});
  const viewerInitDone    = useRef(false);

  const anomalySignals = useMemo(
    ()=>(allSignals||[]).filter(s=>s.anomalyLevel!=="nominal"&&s?.location&&typeof s.location.lat==="number"&&typeof s.location.lng==="number"),
    [allSignals]
  );

  const activeCascades     = useMemo(()=>cascades||(cascade?[cascade]:[]),[cascades,cascade]);
  const activeCityIncident = cityIncident||liveCityIncident;

  const selectedSectorCascadeId = selectedCascade?.type==="sector" ? selectedCascade.data?.primarySectorId : null;
  const cityIncidentSelected    = selectedCascade?.type==="city";

  /* ── Group signals by sector+location bucket to detect overlaps ── */
  const signalsByBucket = useMemo(()=>{
    const map = new Map();
    anomalySignals.forEach(s=>{
      // bucket by sector + rounded lat/lng (50m grid)
      const bLat = Math.round(s.location.lat*1000);
      const bLng = Math.round(s.location.lng*1000);
      const key = `${s.sectorId}:${bLat}:${bLng}`;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(s);
    });
    return map;
  },[anomalySignals]);

  /* Flat list of signals with their offset index assigned */
  const signalsWithOffset = useMemo(()=>{
    const result = [];
    signalsByBucket.forEach(group=>{
      group.forEach((s,i)=> result.push({signal:s, offsetIndex:i}));
    });
    return result;
  },[signalsByBucket]);

  /* ── Road snap ── */
  async function fetchNearestRoad(signal){
    const loc=signal?.location; if(!loc) return null;
    const key=`${signal.sectorId}:${signal.agentId}`;
    if(roadGeomCache.current[key]) return roadGeomCache.current[key];
    try{
      const res=await fetch(`https://router.project-osrm.org/nearest/v1/driving/${loc.lng},${loc.lat}?number=3&generate_hints=false`);
      const data=await res.json();
      if(data.code!=="Ok"||!data.waypoints?.length) return null;
      const snapped=data.waypoints[0].location, off=0.003;
      const rr=await fetch(`https://router.project-osrm.org/route/v1/driving/${snapped[0]-off},${snapped[1]};${snapped[0]+off},${snapped[1]}?overview=full&geometries=geojson&generate_hints=false`);
      const rd=await rr.json();
      if(rd.code!=="Ok"||!rd.routes?.[0]?.geometry) return null;
      roadGeomCache.current[key]=rd.routes[0].geometry;
      return rd.routes[0].geometry;
    }catch(e){return null;}
  }

  useEffect(()=>{
    if(!selectedSignal){setSelectedSignalWithRoad(null);return;}
    const roadAgents=["transit_fleet","road_corridor","traffic_news"];
    if(!roadAgents.includes(selectedSignal.agentId)){setSelectedSignalWithRoad(selectedSignal);return;}
    setSelectedSignalWithRoad(selectedSignal);
    fetchNearestRoad(selectedSignal).then(geo=>{if(geo)setSelectedSignalWithRoad({...selectedSignal,geometry:geo});});
  },[selectedSignal]); // eslint-disable-line

  /* ── Cesium setup — runs once when viewer mounts ── */
  useEffect(()=>{
    if(!cesiumViewer||viewerInitDone.current) return;
    viewerInitDone.current = true;
    let cancelled = false;

    async function setup(){
      try{
        const terrain = await Cesium.createWorldTerrainAsync();
        if(cancelled) return;
        cesiumViewer.terrainProvider = terrain;

        const buildings = await Cesium.createOsmBuildingsAsync();
        if(cancelled) return;
        buildings.maximumScreenSpaceError = 32;
        cesiumViewer.scene.primitives.add(buildings);

        cesiumViewer.scene.requestRenderMode = true;
        cesiumViewer.scene.maximumRenderTimeChange = Infinity;

        const ctrl = cesiumViewer.scene.screenSpaceCameraController;
        ctrl.enableInertia = true; ctrl.inertiaZoom = 0.8; ctrl.zoomFactor = 3;
        ctrl.enableRotate = ctrl.enableTranslate = ctrl.enableZoom = ctrl.enableTilt = ctrl.enableLook = true;
        ctrl.minimumZoomDistance = 800;
        ctrl.maximumZoomDistance = 120000;

        // Fly to Delhi immediately
        cesiumViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(DELHI_VIEW.lon, DELHI_VIEW.lat, DELHI_VIEW.height),
          orientation: { heading:Cesium.Math.toRadians(0), pitch:Cesium.Math.toRadians(-58), roll:0 },
          duration: 0,
        });

        setReady(true);
      }catch(e){ setError(e?.message||"Cesium failed."); }
    }
    setup();
    return()=>{ cancelled=true; };
  },[cesiumViewer]);

  /* ── Pulse render loop ── */
  useEffect(()=>{
    if(!cesiumViewer||!ready) return;
    let rafId;
    function loop(){ cesiumViewer.scene.requestRender(); rafId=requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafId);
  },[cesiumViewer,ready]);

  /* ── Focus-on-navigate ── */
  useEffect(()=>{
    if(!ready||!cesiumViewer) return;
    const fid = routerLocation.state?.focusSectorId; if(!fid) return;
    const sector = SECTOR_BY_ID[fid]; if(!sector) return;
    cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(sector.lng,sector.lat,2200),
      orientation: { heading:Cesium.Math.toRadians(0), pitch:Cesium.Math.toRadians(-55), roll:0 },
      duration: 2,
    });
    const s = anomalySignals.find(s=>s.sectorId===fid)||null;
    if(s) setSelectedSignal(s);
    window.history.replaceState({},document.title);
  },[ready,cesiumViewer,routerLocation.state,anomalySignals]);

  /* ── Clustering off ── */
  useEffect(()=>{
    if(!ready||!cesiumViewer) return;
    const ds = clusterDsRef.current?.cesiumElement; if(!ds) return;
    ds.clustering.enabled = false;
  },[ready,cesiumViewer,allSignals]);

  const sectorEntries = useMemo(()=>Object.entries(sectorHealth||{}),[sectorHealth]);

  function handleSignalClick(signal){
    if(layerMode!=="agents") return;
    setSelectedCascade(null);
    setSelectedSignal(prev=>sameSignal(prev,signal)?null:signal);
  }
  function handleCloseSignal(){ setSelectedSignal(null); setSelectedSignalWithRoad(null); }

  function handleSectorCascadeSelect(casc){
    setSelectedSignal(null);
    setSelectedCascade(casc ? {type:"sector",data:casc} : null);
  }
  function handleCityIncidentSelect(){
    if(!activeCityIncident) return;
    setSelectedSignal(null);
    setSelectedCascade(prev=>prev?.type==="city" ? null : {type:"city",data:activeCityIncident});
  }
  function handleCloseCascadeSidebar(){
    setSelectedCascade(null);
  }

  const visibleBadgeSignals = useMemo(
    ()=>signalsWithOffset.filter(({signal})=>!sameSignal(signal,selectedSignal)),
    [signalsWithOffset,selectedSignal]
  );

  function viewerRefCallback(e){ const v=e?.cesiumElement; if(v) setCesiumViewer(v); }

  const showCascadeSidebar = !!selectedCascade;
  const showSignalDrawer   = !showCascadeSidebar && !!selectedSignal;

  /* ─────────────────────────────────────────────────── */
  return (
    <div className="relative h-full w-full overflow-hidden" style={{fontFamily:T.font.mono,background:T.bg.root}}>
      <Viewer ref={viewerRefCallback}
        timeline={false} animation={false} baseLayerPicker={false}
        homeButton={false} sceneModePicker={false} navigationHelpButton={false}
        geocoder={false} fullscreenButton={false} infoBox={false} selectionIndicator={false}
        style={{position:"absolute",inset:0}}
      >
        {/* Delhi boundary — always visible */}
        {ready && <DelhiBoundary/>}

        {/* ── AGENTS LAYER ── */}
        {ready && layerMode==="agents" && (
          <>
            {selectedSignalWithRoad?.location && (
              <Entity key={`sel-${selectedSignalWithRoad.sectorId}-${selectedSignalWithRoad.agentId}`}>
                <AgentViz
                  signal={selectedSignalWithRoad}
                  triggered={isTriggered(activeCascades,selectedSignalWithRoad)}
                  onClick={handleSignalClick}
                />
              </Entity>
            )}
            <CustomDataSource ref={clusterDsRef} name="anomalies">
              {visibleBadgeSignals.map(({signal,offsetIndex},i)=>(
                <AnomalyBadge
                  key={`badge-${signal.sectorId}-${signal.agentId}-${i}`}
                  signal={signal}
                  offsetIndex={offsetIndex}
                  highlighted={isTriggered(activeCascades,signal)}
                  dimmed={!!selectedSignal}
                  onClick={handleSignalClick}
                />
              ))}
            </CustomDataSource>
          </>
        )}

        {/* ── SECTOR CASCADE LAYER ── */}
        {ready && layerMode==="sector" && (
          <SectorCascadeLayer
            cascades={activeCascades}
            selectedId={selectedSectorCascadeId}
            onSelect={handleSectorCascadeSelect}
          />
        )}

        {/* ── CITY CASCADE LAYER ── */}
        {ready && layerMode==="city" && (
          <CityCascadeLayer
            cityIncident={activeCityIncident}
            isSelected={cityIncidentSelected}
            onSelect={handleCityIncidentSelect}
          />
        )}
      </Viewer>

      {/* ── TOP CONTROLS — layer toggle only, no city switcher ── */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {[
          {mode:"agents", label:"◎ AGENTS",         color:T.text.primary},
          {mode:"sector", label:"⚠ SECTOR CASCADE",  color:CSC_PRIMARY},
          {mode:"city",   label:"🌐 CITY CASCADE",   color:CSC_CITY},
        ].map(({mode,label,color})=>{
          const isActive = layerMode===mode;
          return (
            <button key={mode}
              onClick={()=>{ setLayerMode(mode); setSelectedSignal(null); setSelectedCascade(null); }}
              disabled={!ready}
              className="text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold"
              style={{
                border:`1px solid ${isActive?color:T.border.default}`,
                background: isActive ? color : T.bg.card,
                color: isActive ? T.bg.card : T.text.secondary,
                fontFamily: T.font.mono,
                cursor: ready?"pointer":"not-allowed",
                opacity: ready?1:0.5,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── LEGEND ── */}
      {layerMode==="agents" && (
        <div className="absolute bottom-0 left-0 z-10 px-4 py-3"
          style={{background:T.bg.card,border:`1px solid ${T.border.default}`,width:400}}>
          <div className="text-[8px] tracking-[0.2em] uppercase mb-2" style={{color:T.text.micro}}>AGENT SIGNAL TYPES</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(AGENT_META).map(([agentId,meta])=>(
              <div key={agentId} className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px]"
                  style={{border:`1.5px solid ${AGENT_COLOR[agentId]}`,color:AGENT_COLOR[agentId]}}>
                  {AGENT_GLYPH[agentId]}
                </span>
                <span className="text-[7px] tracking-wide" style={{color:T.text.secondary}}>
                  {meta.label.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {layerMode==="sector" && (
        <div className="absolute bottom-0 left-0 z-10 px-4 py-3"
          style={{background:T.bg.card,border:`1px solid ${T.border.default}`,minWidth:260}}>
          <div className="text-[8px] tracking-[0.2em] uppercase mb-2" style={{color:T.text.micro}}>SECTOR CASCADE</div>
          <div className="text-[11px] font-bold" style={{color:CSC_PRIMARY}}>{activeCascades.length} ACTIVE</div>
          <div className="text-[9px] mt-1" style={{color:T.text.micro}}>
            Click <span style={{color:CSC_PRIMARY}}>!</span> pin → see details + brighter spread lines
          </div>
        </div>
      )}

      {layerMode==="city" && (
        <div className="absolute bottom-0 left-0 z-10 px-4 py-3"
          style={{background:T.bg.card,border:`1px solid ${T.border.default}`,minWidth:260}}>
          <div className="text-[8px] tracking-[0.2em] uppercase mb-2" style={{color:T.text.micro}}>CITY CASCADE</div>
          {activeCityIncident ? (
            <>
              <div className="text-[11px] font-bold" style={{color:CSC_CITY}}>
                {activeCityIncident.citywideSeverity} · {activeCityIncident.affectedAreas?.length} AREAS
              </div>
              <div className="text-[9px] mt-1" style={{color:T.text.micro}}>
                Click <span style={{color:CSC_CITY}}>C</span> pin → see full incident + brighter connections
              </div>
            </>
          ) : (
            <div className="text-[10px]" style={{color:T.text.micro}}>No city incident active</div>
          )}
        </div>
      )}

      {/* ── SIDEBARS ── */}
      {showCascadeSidebar && (
        <CascadeSidebar item={selectedCascade} onClose={handleCloseCascadeSidebar}/>
      )}
      {showSignalDrawer && (
        <SignalDrawer
          signal={selectedSignal}
          cascades={activeCascades}
          cityIncident={activeCityIncident}
          onClose={handleCloseSignal}
        />
      )}

      {/* Loading */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10"
          style={{color:T.text.primary,background:"rgba(0,0,0,0.40)"}}>
          <div className="text-center">
            <div className="text-[10px] tracking-[0.3em] uppercase" style={{fontFamily:T.font.mono}}>
              INITIALIZING SPATIAL ENGINE
            </div>
            <div className="text-[8px] tracking-widest mt-2" style={{color:T.text.micro,fontFamily:T.font.mono}}>
              TERRAIN · DELHI BOUNDARY · 39 SECTORS
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-10 text-center z-10"
          style={{color:"#FF4040",background:"rgba(0,0,0,0.80)"}}>
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2">CESIUM FAILED</div>
            <div className="text-[10px]">{error}</div>
          </div>
        </div>
      )}

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}