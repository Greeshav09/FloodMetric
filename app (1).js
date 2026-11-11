/* FloodMetric dashboard. Sample data is simulated. */
const CONFIG = {
  dataUrl: "data/sites.geojson",
  failuresUrl: "data/failure_points.geojson",
  // Set to your own server route that forwards to an LLM (never put an API key in this file).
  // Expected reply: { results: [{ asset, vulnerability, confidence, evidence }] }
  llmEndpoint: "",
  minConfidence: 0.6,
  maxBytes: 1000000
};

// Strict rubric sent to the LLM as its system prompt. The local fallback parser follows the same scale.
const RUBRIC_PROMPT = `You extract structural condition from messy inspection text for a flood-infrastructure tool.
Map each asset to ONE integer on this scale and nothing else:
1 Very Low: Excellent condition, newly built, no visible defects.
2 Low: Good condition, minor superficial wear, structurally sound.
3 Moderate: Fair condition, clear wear and tear, requires routine maintenance.
4 High: Poor condition, significant degradation, structural integrity compromised.
5 Critical: Severe damage, failing components, immediate structural risk.
Rules: Use only evidence in the text. Do not guess. If the text does not clearly support one level, return vulnerability null and confidence below 0.5.
Return JSON only: {"results":[{"asset":"name","vulnerability":1-5 or null,"confidence":0-1,"evidence":"short quote"}]}`;

// Fallback sample so the page still works when opened without a server (fetch fails on file://).
const FALLBACK = [
  ["S01","River Landing Rd","Road",35.757,-78.84,14,4,41,18],["S02","Old Ferry Rd approach","Road",35.733,-78.872,12,4,38,15],
  ["S03","Rocky Branch Rd","Culvert",35.784,-78.705,10,4,31,12],["S04","Swift Run Rd","Culvert",35.762,-78.779,8,5,27,9],
  ["S05","Black Creek Rd","Road",35.705,-78.751,8,5,29,11],["S06","Tar Bend Rd drainage","Drainage",35.81,-78.61,8,3,33,7],
  ["S07","Marsh Rd bridge","Bridge",35.675,-78.65,10,3,35,6],["S08","Hollis Creek culvert","Culvert",35.83,-78.79,6,4,19,2],
  ["S09","Mill Creek Rd bridge","Bridge",35.79,-78.83,6,3,22,4],["S10","Sandy Run drainage","Drainage",35.65,-78.82,4,3,16,5],
  ["S11","Maple Grove Rd bridge","Bridge",35.86,-78.68,6,2,24,2],["S12","Pine Hollow Rd culvert","Culvert",35.9,-78.74,4,2,9,3],
  ["S13","Cedar Fork bridge","Bridge",35.8,-78.9,2,2,6,1],["S14","Oak Ridge Rd culvert","Culvert",35.94,-78.86,2,1,4,0]
].map(a => ({ id:a[0], name:a[1], type:a[2], lat:a[3], lon:a[4], failures:a[5], vulnerability:a[6], exposure:a[7], reports:a[8], cluster_dist_m:null }));

const REPORTS = [
  ["2026-11-09T07:42","Street Flooding","River Landing Rd near Kit Creek","High"],["2026-11-09T06:15","High Water","Old Ferry Rd at creek crossing","High"],
  ["2026-11-08T19:30","Clogged Drain","Swift Run Rd, 1200 block","Medium"],["2026-11-08T16:05","Street Flooding","Rocky Branch Rd near the bend","Medium"],
  ["2026-11-08T11:20","Erosion","Black Creek Rd shoulder","Medium"],["2026-11-07T21:10","High Water","Marsh Rd under the bridge","Medium"],
  ["2026-11-07T14:45","Clogged Drain","Tar Bend Rd, storm inlet","Low"],["2026-11-07T09:00","Street Flooding","Black Creek Rd low point","High"],
  ["2026-11-06T18:25","Clogged Drain","Sandy Run Dr, 300 block","Low"],["2026-11-06T13:40","High Water","Mill Creek Rd bridge approach","Low"],
  ["2026-11-05T08:55","Erosion","Hollis Creek culvert outlet","Low"],["2026-11-04T17:30","Clogged Drain","River Landing Rd storm drain","Medium"]
].map(r => ({ timestamp:r[0], type:r[1], address:r[2], severity:r[3] }));

const STREAMS = [
  { name:"Wake County GIS Open Data", note:"Culvert, bridge and stormwater asset layers (ArcGIS Hub, GeoJSON or REST export).", use:"Replaces the simulated asset list" },
  { name:"USGS streamflow", note:"Instantaneous stream gauge readings for nearby creeks.", use:"https://waterservices.usgs.gov/nwis/iv/" },
  { name:"NOAA / NWS precipitation", note:"Forecast and observed rainfall to flag sites before a storm.", use:"https://api.weather.gov" },
  { name:"NC-FLEX flood extents", note:"Reconstructed flood footprints for 78 events, 1996 to 2020.", use:"https://doi.org/10.15139/s3/dokk16" },
  { name:"NCDOT and FEMA damage records", note:"Historical damage and repair records. Detailed NCDOT data is access-restricted.", use:"Feeds Phase I clustering" },
  { name:"Cary 311 requests", note:"Resident reports. Reviewed before they affect priorities.", use:"Replaces the simulated 311 list" }
];

let sites = [], lastStable = [], failurePts = [];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/* ---------- toasts ---------- */
function toast(msg, type = "info", ms = 7000) {
  const t = document.createElement("div");
  t.className = "toast " + type; t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), ms);
}

/* ---------- scoring ---------- */
const sliders = [0,1,2,3].map(i => $("w" + i));
function getWeights() {
  const raw = sliders.map(s => Math.max(0, num(s.value)));
  const t = raw.reduce((a, b) => a + b, 0);
  const w = t === 0 ? [.25,.25,.25,.25] : raw.map(v => v / t);   // always sums to 1.0
  w.forEach((v, i) => { $("o" + i).textContent = Math.round(v * 100) + "%"; });
  return w;
}
function calculateScores() {
  const w = getWeights();
  const maxF = Math.max(1, ...sites.map(s => s.failures));
  const maxE = Math.max(78, ...sites.map(s => s.exposure));
  const maxR = Math.max(1, ...sites.map(s => s.reports));
  sites.forEach(s => {
    const f = s.failures / maxF;
    const hist = s.cluster_dist_m == null ? f : 0.5 * f + 0.5 * Math.exp(-s.cluster_dist_m / 500);
    const p = [hist, (s.vulnerability - 1) / 4, s.exposure / maxE, s.reports / maxR].map(x => Math.min(1, Math.max(0, num(x))));
    s.ppi = Math.round(100 * p.reduce((a, x, i) => a + x * w[i], 0));
  });
}
const flag = p => p >= 70 ? "red" : p >= 40 ? "amber" : "green";
const queue = p => p >= 70 ? "Priority field inspection" : p >= 40 ? "Monitor and verify records" : "Routine schedule";
const COLORS = { red:"#ef5b4c", amber:"#f0b429", green:"#38c172" };

/* ---------- map ---------- */
const map = L.map("map").setView([35.7915, -78.7811], 10);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);
const siteLayer = L.layerGroup().addTo(map), failLayer = L.layerGroup().addTo(map);
let markers = {};

function drawMap() {
  siteLayer.clearLayers(); markers = {};
  sites.forEach(s => {
    const col = COLORS[flag(s.ppi)];
    markers[s.id] = L.circleMarker([s.lat, s.lon], { radius: 9, weight: 2, color: "#fff", fillColor: col, fillOpacity: .92 })
      .bindPopup("<strong>" + esc(s.name) + "</strong><br>Asset class: " + esc(s.type) + "<br>PPI: <strong>" + s.ppi +
        "</strong><br>Inspection queue: " + queue(s.ppi)).addTo(siteLayer);
  });
}
function drawFailures() {
  failLayer.clearLayers();
  failurePts.forEach(p => L.circleMarker([p[1], p[0]], { radius: 2, weight: 0, fillColor: "#7d8a82", fillOpacity: p[2] >= 0 ? .75 : .3 }).addTo(failLayer));
}

/* ---------- table, KPIs, bars ---------- */
function renderPanels() {
  const ranked = sites.slice().sort((a, b) => b.ppi - a.ppi);
  $("leaderboard").innerHTML = ranked.map((s, i) =>
    `<tr data-id="${esc(s.id)}"><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.type)}</td><td class="ppi ${flag(s.ppi)}">${s.ppi}</td><td>${s.failures}</td><td>${s.vulnerability}</td><td>${s.exposure}</td><td>${s.reports}</td></tr>`).join("");
  const n = c => sites.filter(s => flag(s.ppi) === c).length;
  $("kpis").innerHTML = [["Priority","red"],["Monitor","amber"],["Routine","green"]].map(([l, c]) =>
    `<div class="kpi" style="--k:var(--${c})"><span>${l}</span><strong>${n(c)}</strong></div>`).join("");
  $("bars").innerHTML = ranked.map(s => `<i title="${esc(s.name)}: ${s.ppi}" style="height:${Math.max(4, s.ppi)}%;background:${COLORS[flag(s.ppi)]}"></i>`).join("");
}
function refresh() { calculateScores(); renderPanels(); drawMap(); }

// Rebuild everything; if anything throws, restore the last stable data so the page never breaks.
function safeRefresh() {
  try { refresh(); lastStable = structuredClone(sites); return true; }
  catch (e) { console.error(e); sites = structuredClone(lastStable); try { refresh(); } catch (_) {} toast("Could not apply that data. Restored the last stable state.", "error"); return false; }
}
sliders.forEach(s => s.addEventListener("input", () => { try { refresh(); } catch (e) { console.error(e); } }));
$("leaderboard").addEventListener("click", e => {
  const tr = e.target.closest("tr"); if (!tr || !markers[tr.dataset.id]) return;
  map.setView(markers[tr.dataset.id].getLatLng(), 13); markers[tr.dataset.id].openPopup();
});

/* ---------- loading data ---------- */
function validSite(s) {
  return s && s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;
}
async function loadData() {
  try {
    const r = await fetch(CONFIG.dataUrl); if (!r.ok) throw new Error(r.status);
    const gj = await r.json();
    const list = gj.features.map(f => ({ id: String(f.properties.id), name: f.properties.name, type: f.properties.type,
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], failures: num(f.properties.failures),
      vulnerability: Math.min(5, Math.max(1, num(f.properties.vulnerability, 3))), exposure: num(f.properties.exposure),
      reports: num(f.properties.reports), cluster_dist_m: f.properties.cluster_dist_m == null ? null : num(f.properties.cluster_dist_m) })).filter(validSite);
    if (!list.length) throw new Error("empty");
    sites = list; $("dataSource").textContent = "Source: Phase I output";
    try { const fr = await (await fetch(CONFIG.failuresUrl)).json();
      failurePts = fr.features.map(f => [f.geometry.coordinates[0], f.geometry.coordinates[1], f.properties.cluster]); drawFailures(); } catch (_) {}
  } catch (_) {
    sites = structuredClone(FALLBACK); $("dataSource").textContent = "Source: built-in sample";
    toast("Using the built-in sample. Run the Python script and serve this folder (python -m http.server) to load data/sites.geojson.", "warn");
  }
  safeRefresh();
}

/* ---------- AI extraction: LLM first, rubric rules as fallback ---------- */
const KEYS = {
  5: ["failing","imminent","collapse","severe","critical","exposed rebar","undermin","scour","unsafe","immediate"],
  4: ["poor","significant","deteriorat","spalling","compromised","corrosion","section loss","settlement","cracking"],
  3: ["fair","wear and tear","routine maintenance","moderate","rust","staining"],
  2: ["good condition","minor","superficial","sound","slight"],
  1: ["excellent","newly built","new construction","no visible defect","no defects","pristine"]
};
function ruleScore(text) {
  const t = text.toLowerCase();
  const m = t.match(/(?:rating|score|condition|grade)\D{0,12}([1-5])\s*(?:\/|of|out of)?\s*5?/);
  if (m) return { vulnerability: +m[1], confidence: .95, evidence: m[0].trim() };
  const hits = {}; let total = 0;
  for (const lv in KEYS) { hits[lv] = KEYS[lv].filter(k => t.includes(k)).length; total += hits[lv]; }
  if (!total) return { vulnerability: null, confidence: 0, evidence: "" };
  const best = Object.keys(hits).sort((a, b) => hits[b] - hits[a]);
  const top = hits[best[0]], tie = hits[best[1]] === top;
  return { vulnerability: tie ? null : +best[0], confidence: tie ? .3 : Math.min(.9, .5 + .15 * top) * (top / total + .35 > 1 ? 1 : top / total + .35), evidence: "" };
}
async function extract(items) {
  if (CONFIG.llmEndpoint) {
    try {
      const r = await fetch(CONFIG.llmEndpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: RUBRIC_PROMPT, input: items.map(i => ({ asset: i.asset, text: i.text })) }) });
      const d = await r.json();
      if (!Array.isArray(d.results) || d.results.length !== items.length) throw new Error("bad shape");
      return d.results.map(x => ({ vulnerability: Number.isInteger(x.vulnerability) && x.vulnerability >= 1 && x.vulnerability <= 5 ? x.vulnerability : null,
        confidence: num(x.confidence), evidence: x.evidence || "" }));
    } catch (e) { toast("AI parser unavailable. Used the built-in rubric rules instead.", "warn"); }
  }
  return items.map(i => ruleScore(i.text));
}

/* ---------- file parsing ---------- */
function parseCSV(t) {
  const rows = []; let r = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; r.push(f); f = ""; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else f += c; }
  r.push(f); if (r.some(x => x.trim())) rows.push(r);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const h = rows[0].map(x => x.trim().toLowerCase());
  return rows.slice(1).map(row => Object.fromEntries(h.map((k, i) => [k, row[i]])));
}
function toRecord(o) {
  const g = (...k) => { for (const x of k) if (o[x] != null && o[x] !== "") return o[x]; };
  const v = g("vulnerability", "structural_vulnerability");
  return { id: g("id"), asset: g("name", "asset", "site"), lat: g("lat", "latitude"), lon: g("lon", "lng", "longitude"),
    vulnerability: v == null ? null : Number(v), text: String(g("notes", "condition", "description", "text", "inspection") ?? ""),
    failures: g("failures"), exposure: g("exposure", "flood_events"), reports: g("reports") };
}
function recordsFrom(text, ext) {
  if (ext === "csv") return parseCSV(text).map(toRecord);
  if (ext === "json" || ext === "geojson") {
    const d = JSON.parse(text);
    if (d && d.type === "FeatureCollection") return d.features.map(f => toRecord({ ...f.properties, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] }));
    if (Array.isArray(d)) return d.map(toRecord);
    throw new Error("JSON must be an array of records or a GeoJSON FeatureCollection.");
  }
  // Unstructured log: one record per paragraph (or per line when there are no blank lines).
  let blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length < 2) blocks = text.split("\n").map(b => b.trim()).filter(b => b.length > 15);
  return blocks.map(b => {
    const known = sites.find(s => b.toLowerCase().includes(s.name.toLowerCase()));
    const m = b.match(/(?:asset|site|location|structure)\s*[:=]\s*([^\n;,]+)/i);
    return { asset: known ? known.name : m && m[1].trim(), text: b, vulnerability: null };
  });
}

/* ---------- apply upload ---------- */
async function handleFile(file) {
  try {
    if (file.size > CONFIG.maxBytes) throw new Error("File is larger than 1 MB.");
    const text = await file.text();
    if (!text.trim() || text.includes("\u0000")) throw new Error("File is empty, binary or corrupted.");
    const recs = recordsFrom(text, file.name.split(".").pop().toLowerCase());
    if (!recs.length) throw new Error("No inspection records found.");

    const need = recs.filter(r => !(Number.isInteger(r.vulnerability) && r.vulnerability >= 1 && r.vulnerability <= 5));
    const parsed = await extract(need.map(r => ({ asset: r.asset, text: r.text })));
    need.forEach((r, i) => { r.vulnerability = parsed[i].confidence >= CONFIG.minConfidence ? parsed[i].vulnerability : null; });

    const snap = structuredClone(sites); let updated = 0, added = 0, rejected = 0;
    recs.forEach(r => {
      if (!(r.vulnerability >= 1 && r.vulnerability <= 5)) { rejected++; return; }
      const key = String(r.id ?? "").toLowerCase(), nm = String(r.asset ?? "").toLowerCase();
      let s = sites.find(x => (key && x.id.toLowerCase() === key) || (nm && x.name.toLowerCase() === nm));
      if (!s && nm) s = sites.find(x => x.name.toLowerCase().includes(nm) || nm.includes(x.name.toLowerCase()));
      if (s) { s.vulnerability = r.vulnerability; ["failures", "exposure", "reports"].forEach(k => { if (r[k] != null && Number(r[k]) >= 0) s[k] = num(r[k]); }); updated++; }
      else if (nm && Number.isFinite(+r.lat) && Number.isFinite(+r.lon) && r.lat !== "" && r.lon !== "") {
        const n = { id: "U" + (sites.length + 1), name: r.asset, type: "Unspecified", lat: +r.lat, lon: +r.lon, failures: num(r.failures), vulnerability: r.vulnerability, exposure: num(r.exposure), reports: num(r.reports), cluster_dist_m: null };
        if (validSite(n)) { sites.push(n); added++; } else rejected++;
      } else rejected++;
    });
    if (!updated && !added) { sites = snap; throw new Error("None of the " + recs.length + " records could be matched to a site and mapped to the 1 to 5 scale with enough confidence. Nothing was changed."); }
    if (!safeRefresh()) return;
    toast("Applied " + updated + " updates and " + added + " new sites." + (rejected ? " " + rejected + " records were rejected as unclear or unmatched." : ""), rejected ? "warn" : "info");
  } catch (e) {
    console.error(e); toast("Upload failed: " + e.message + " The last stable data is still in use.", "error", 10000);
  }
}
const drop = $("drop"), file = $("file");
drop.onclick = () => file.click(); $("pickFile").onclick = () => file.click();
drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") file.click(); };
file.onchange = () => { if (file.files[0]) handleFile(file.files[0]); file.value = ""; };
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

/* ---------- 311 panel, streams, modal ---------- */
const filter = $("incidentFilter");
filter.innerHTML = '<option value="all">All incident types</option>' + [...new Set(REPORTS.map(r => r.type))].sort().map(t => `<option>${esc(t)}</option>`).join("");
function renderReports() {
  const v = filter.value, list = REPORTS.filter(r => v === "all" || r.type === v).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  $("reportList").innerHTML = list.map(r => `<div class="report sev-${r.severity.toLowerCase()}"><div class="t"><span>${esc(r.type)}</span><span>${esc(r.severity)}</span></div><div>${esc(r.address)}</div><div class="m">${new Date(r.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div></div>`).join("");
  $("reportCount").textContent = list.length + " of " + REPORTS.length + " simulated reports. Unverified, and not proof of structural damage.";
}
filter.onchange = renderReports;
$("streams").innerHTML = STREAMS.map(s => `<div class="stream"><b>${esc(s.name)}</b><small>${esc(s.note)}</small><code>${esc(s.use)}</code></div>`).join("");
["openPPI", "openPPI2"].forEach(id => $(id).onclick = () => $("ppiModal").showModal());

renderReports();
loadData();
