// ─────────────────────────────────────────────────────────
// GHOSTNET — Sector Topology
//
// The static 39-node mesh AutoNet's spatial cascade engine
// runs on. Backend eventually owns this table; frontend just
// needs matching sectorIds so a live payload drops in cleanly.
//
// H(A→B) = R_A * e^(-lambda * distance(A,B))
// ─────────────────────────────────────────────────────────

export const SECTORS = [

    // ── 1. Central Delhi ──────────────────────────────────
    { sectorId: "DEL_CENTRAL_CP",   name: "Connaught Place", district: "Central Delhi", lat: 28.6315, lng: 77.2167, isLiveAnchor: true  },
    { sectorId: "DEL_CENTRAL_KB",   name: "Karol Bagh",      district: "Central Delhi", lat: 28.6514, lng: 77.1907, isLiveAnchor: true  },
    { sectorId: "DEL_CENTRAL_DG",   name: "Daryaganj",       district: "Central Delhi", lat: 28.6459, lng: 77.2410, isLiveAnchor: false },
  
    // ── 2. Central North Delhi ────────────────────────────
    { sectorId: "DEL_CNORTH_MT",    name: "Model Town",      district: "Central North Delhi", lat: 28.7115, lng: 77.1913, isLiveAnchor: false },
    { sectorId: "DEL_CNORTH_SB",    name: "Shalimar Bagh",   district: "Central North Delhi", lat: 28.7132, lng: 77.1569, isLiveAnchor: false },
    { sectorId: "DEL_CNORTH_AV",    name: "Ashok Vihar",     district: "Central North Delhi", lat: 28.6950, lng: 77.1750, isLiveAnchor: false },
  
    // ── 3. East Delhi ──────────────────────────────────────
    { sectorId: "DEL_EAST_LN",      name: "Laxmi Nagar",     district: "East Delhi", lat: 28.6304, lng: 77.2777, isLiveAnchor: true  },
    { sectorId: "DEL_EAST_MV",      name: "Mayur Vihar",     district: "East Delhi", lat: 28.6096, lng: 77.2905, isLiveAnchor: false },
    { sectorId: "DEL_EAST_PV",      name: "Preet Vihar",     district: "East Delhi", lat: 28.6389, lng: 77.2953, isLiveAnchor: false },
  
    // ── 4. New Delhi ───────────────────────────────────────
    { sectorId: "DEL_NEW_LUTYENS",  name: "Parliament / Lutyens", district: "New Delhi", lat: 28.6170, lng: 77.2090, isLiveAnchor: false },
    { sectorId: "DEL_NEW_CHANAKYA", name: "Chanakyapuri",    district: "New Delhi", lat: 28.5933, lng: 77.1900, isLiveAnchor: false },
    { sectorId: "DEL_NEW_KHAN",     name: "Khan Market",     district: "New Delhi", lat: 28.5992, lng: 77.2265, isLiveAnchor: false },
  
    // ── 5. North Delhi ─────────────────────────────────────
    { sectorId: "DEL_NORTH_CL",     name: "Civil Lines",     district: "North Delhi", lat: 28.6775, lng: 77.2214, isLiveAnchor: false },
    { sectorId: "DEL_NORTH_MN",     name: "Mukherjee Nagar", district: "North Delhi", lat: 28.7050, lng: 77.2100, isLiveAnchor: false },
    { sectorId: "DEL_NORTH_KGATE",  name: "Kashmere Gate",   district: "North Delhi", lat: 28.6665, lng: 77.2290, isLiveAnchor: true  },
  
    // ── 6. North East Delhi ────────────────────────────────
    { sectorId: "DEL_NEAST_YV",     name: "Yamuna Vihar",    district: "North East Delhi", lat: 28.6950, lng: 77.2820, isLiveAnchor: false },
    { sectorId: "DEL_NEAST_DG",     name: "Dilshad Garden",  district: "North East Delhi", lat: 28.6800, lng: 77.3210, isLiveAnchor: false },
    { sectorId: "DEL_NEAST_SLP",    name: "Seelampur",       district: "North East Delhi", lat: 28.6710, lng: 77.2680, isLiveAnchor: false },
  
    // ── 7. North West Delhi ────────────────────────────────
    { sectorId: "DEL_NWEST_ROH",    name: "Rohini",          district: "North West Delhi", lat: 28.7495, lng: 77.0700, isLiveAnchor: false },
    { sectorId: "DEL_NWEST_NGL",    name: "Nangloi",         district: "North West Delhi", lat: 28.6830, lng: 77.0640, isLiveAnchor: false },
    { sectorId: "DEL_NWEST_PTM",    name: "Pitampura",       district: "North West Delhi", lat: 28.6980, lng: 77.1310, isLiveAnchor: false },
  
    // ── 8. Old Delhi ───────────────────────────────────────
    { sectorId: "DEL_OLD_CHANDNI",  name: "Chandni Chowk",   district: "Old Delhi", lat: 28.6506, lng: 77.2303, isLiveAnchor: false },
    { sectorId: "DEL_OLD_SADAR",    name: "Sadar Bazar",     district: "Old Delhi", lat: 28.6580, lng: 77.2130, isLiveAnchor: false },
    { sectorId: "DEL_OLD_CHAWRI",   name: "Chawri Bazar",    district: "Old Delhi", lat: 28.6480, lng: 77.2260, isLiveAnchor: false },
  
    // ── 9. Outer North Delhi ───────────────────────────────
    { sectorId: "DEL_ONORTH_NARELA",name: "Narela",          district: "Outer North Delhi", lat: 28.8520, lng: 77.0910, isLiveAnchor: false },
    { sectorId: "DEL_ONORTH_BAWANA",name: "Bawana",          district: "Outer North Delhi", lat: 28.7967, lng: 77.0371, isLiveAnchor: false },
    { sectorId: "DEL_ONORTH_ALIPUR",name: "Alipur",          district: "Outer North Delhi", lat: 28.7970, lng: 77.1360, isLiveAnchor: false },
  
    // ── 10. South Delhi ────────────────────────────────────
    { sectorId: "DEL_SOUTH_SAKET",  name: "Saket",           district: "South Delhi", lat: 28.5245, lng: 77.2066, isLiveAnchor: false },
    { sectorId: "DEL_SOUTH_HK",     name: "Hauz Khas",       district: "South Delhi", lat: 28.5494, lng: 77.2001, isLiveAnchor: true  },
    { sectorId: "DEL_SOUTH_VK",     name: "Vasant Kunj",     district: "South Delhi", lat: 28.5200, lng: 77.1590, isLiveAnchor: false },
  
    // ── 11. South East Delhi ───────────────────────────────
    { sectorId: "DEL_SEAST_NP",     name: "Nehru Place",     district: "South East Delhi", lat: 28.5492, lng: 77.2517, isLiveAnchor: true  },
    { sectorId: "DEL_SEAST_OKHLA",  name: "Okhla",           district: "South East Delhi", lat: 28.5355, lng: 77.2750, isLiveAnchor: false },
    { sectorId: "DEL_SEAST_GK",     name: "Kalkaji / Greater Kailash", district: "South East Delhi", lat: 28.5422, lng: 77.2372, isLiveAnchor: false },
  
    // ── 12. South West Delhi ───────────────────────────────
    { sectorId: "DEL_SWEST_DWARKA", name: "Dwarka",          district: "South West Delhi", lat: 28.5921, lng: 77.0460, isLiveAnchor: false },
    { sectorId: "DEL_SWEST_NJF",    name: "Najafgarh",       district: "South West Delhi", lat: 28.6090, lng: 76.9800, isLiveAnchor: false },
    { sectorId: "DEL_SWEST_MHP",    name: "Mahipalpur",      district: "South West Delhi", lat: 28.5480, lng: 77.1208, isLiveAnchor: false },
  
    // ── 13. West Delhi ─────────────────────────────────────
    { sectorId: "DEL_WEST_RG",      name: "Rajouri Garden",  district: "West Delhi", lat: 28.6469, lng: 77.1220, isLiveAnchor: false },
    { sectorId: "DEL_WEST_JP",      name: "Janakpuri",       district: "West Delhi", lat: 28.6219, lng: 77.0819, isLiveAnchor: false },
    { sectorId: "DEL_WEST_TILAK",   name: "Tilak Nagar",     district: "West Delhi", lat: 28.6366, lng: 77.0963, isLiveAnchor: false },
  ];
  
  export const SECTOR_BY_ID = SECTORS.reduce((acc, s) => {
    acc[s.sectorId] = s;
    return acc;
  }, {});
  
  export const SECTOR_IDS = SECTORS.map((s) => s.sectorId);
  
  
  // ── Haversine distance (km) ────────────────────────────────
  
  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }
  
  export function haversineKm(a, b) {
    const R = 6371;
  
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
  
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
  
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  
  
  // ── Static 39x39 distance matrix ───────────────────────────
  // DISTANCE_MATRIX[sectorIdA][sectorIdB] -> km
  // Built once at module load — this is the "static Haversine
  // Distance Matrix" the AI engineer builds server-side; the
  // frontend keeps its own copy so replay/demo mode can compute
  // cascades without waiting on a backend round-trip.
  
  export const DISTANCE_MATRIX = SECTORS.reduce((acc, a) => {
    acc[a.sectorId] = SECTORS.reduce((row, b) => {
      row[b.sectorId] = haversineKm(a, b);
      return row;
    }, {});
    return acc;
  }, {});
  
  
  // ── Spatial decay ───────────────────────────────────────────
  // H(A→B) = R_A * e^(-lambda * distance(A,B))
  //
  // R_A    = severity of the source signal, [0,1] (1 - healthScore/100)
  // lambda = decay constant (tuned so risk meaningfully drops off
  //          past ~6-8km, roughly one district's width)
  
  export const DECAY_LAMBDA = 0.16;
  
  export function spatialDecay(severity, distanceKm) {
    return severity * Math.exp(-DECAY_LAMBDA * distanceKm);
  }
  
  export function distanceBetween(sectorIdA, sectorIdB) {
    return DISTANCE_MATRIX[sectorIdA]?.[sectorIdB] ?? Infinity;
  }
  
  /*
   * Nearest N sectors to a given sector, closest first (self excluded).
   * Useful for "closest nodes react first" UI treatments.
   */
  export function nearestSectors(sectorId, count = 5) {
    return SECTOR_IDS
      .filter((id) => id !== sectorId)
      .sort(
        (a, b) =>
          distanceBetween(sectorId, a) - distanceBetween(sectorId, b)
      )
      .slice(0, count);
  }