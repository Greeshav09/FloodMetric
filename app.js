/* FloodMetric North Carolina prototype. Data comes from mock_data.js (a copy of mock_data.geojson). */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// ---------- data ----------
const sites = window.MOCK_DATA.features.map((f, i) => ({
  i, ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
  // The mock file has no vulnerability field, so a 1 to 5 estimate is derived from PPI for the popup.
  vuln: Math.max(1, Math.min(5, Math.round(1 + (f.properties.ppi_score - 30) / 70 * 4)))
}));
const EVENT_COLOR = { "Hurricane Helene (2024)":"#2dd4a7", "Hurricane Florence (2018)":"#b6f23a", "Hurricane Floyd (1999)":"#f0b429", "Routine Extreme Rainfall":"#8c9a91" };
const pinColor = p => p > 80 ? "#ef5b4c" : p >= 60 ? "#f08a3c" : "#f2d03b";
const status = p => p > 80 ? "Inspection recommended" : p >= 60 ? "Review scheduled" : "Routine monitoring";

const state = { view: "history", storm: "all", place: null };

// ---------- map ----------
const map = L.map("map", { zoomControl: false }).setView([35.4, -79.6], 7);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_576y_1_5094530118c59c2dd4f27b54", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);
const layer = L.layerGroup().addTo(map);

const visible = () => sites.filter(s => state.storm === "all" || s.historical_event === state.storm);

function popup(s) {
  return `<div class="pop"><h3>${esc(s.location)}</h3><p>${esc(s.infrastructure_type)} | ${esc(s.historical_event)}</p>
  <dl><dt>PPI</dt><dd style="color:${pinColor(s.ppi_score)}">${s.ppi_score}</dd>
  <dt>Structural vulnerability (est.)</dt><dd>${s.vuln} of 5</dd>
  <dt>Flood zone alignment</dt><dd>${s.fema_zone_aligned ? "Within FEMA zone" : "Outside FEMA zone"}</dd>
  <dt>Failures on record</dt><dd>${s.failure_count}</dd>
  <dt>311 reports</dt><dd>${s.community_reports_count}</dd>
  <dt>Inspection status</dt><dd>${status(s.ppi_score)}</dd></dl>
  <div class="bar"><i style="width:${s.ppi_score}%;background:${pinColor(s.ppi_score)}"></i></div></div>`;
}
function bind(m, s) {
  m.bindPopup(popup(s));
  m.on("click", () => { state.place = s.location; renderLogs(); });
  m.on("popupclose", () => { if (state.place === s.location) { state.place = null; renderLogs(); } });
  return m.addTo(layer);
}

// View 1: bubble size by failure_count, color by storm. Four or more failures get an outer ring.
function drawHistory(list) {
  list.forEach(s => {
    if (s.failure_count >= 4) L.circleMarker([s.lat, s.lon], { radius: 9 + s.failure_count * 5 + 6, weight: 1.5, color: EVENT_COLOR[s.historical_event], fill: false, opacity: .6, interactive: false }).addTo(layer);
    bind(L.circleMarker([s.lat, s.lon], { radius: 5 + s.failure_count * 5, weight: 1.5, color: "#fff", fillColor: EVENT_COLOR[s.historical_event], fillOpacity: .6 }), s)
      .bindTooltip(esc(s.location) + ": " + s.failure_count + " failures");
  });
}
// View 2: nested translucent circles that stand in for NC-FLEX flood extents. Illustrative shapes, not real extents.
function drawExposure(list) {
  list.forEach(s => {
    const outer = 9000 + s.ppi_score * 350, aligned = s.fema_zone_aligned;
    L.circle([s.lat, s.lon], { radius: outer, weight: 0, fillColor: "#6fb1ff", fillOpacity: aligned ? .2 : .12, interactive: false }).addTo(layer);
    L.circle([s.lat, s.lon], { radius: outer * .55, weight: 1, color: "#4a8cff", opacity: .5, fillColor: aligned ? "#2f5fd0" : "#4a8cff", fillOpacity: aligned ? .45 : .22, interactive: false }).addTo(layer);
    bind(L.circleMarker([s.lat, s.lon], { radius: 4, weight: 1, color: "#fff", fillColor: "#fff", fillOpacity: 1 }), s);
  });
}
// View 3: teardrop pins colored by PPI band.
function drawPPI(list) {
  list.forEach(s => {
    const icon = L.divIcon({ className: "", html: `<span class="pin" style="--c:${pinColor(s.ppi_score)}"></span>`, iconSize: [22, 22], iconAnchor: [11, 24], popupAnchor: [0, -22] });
    bind(L.marker([s.lat, s.lon], { icon }), s);
  });
}

const LEGENDS = {
  history: () => `<b>Failure count</b>${[1, 3, 5].map(n => `<div><i style="width:${5 + n * 5}px;height:${5 + n * 5}px;background:#8c9a9199"></i>${n} on record</div>`).join("")}
    <b style="margin-top:8px">Storm</b>${Object.entries(EVENT_COLOR).map(([k, c]) => `<div><i style="width:10px;height:10px;background:${c}"></i>${esc(k)}</div>`).join("")}<small>Ring marks 4 or more failures.</small>`,
  exposure: () => `<b>Flood impacts</b><div><i style="width:12px;height:12px;background:#2f5fd0"></i>Core, FEMA aligned</div><div><i style="width:12px;height:12px;background:#4a8cff88"></i>Core, outside FEMA zone</div><div><i style="width:12px;height:12px;background:#6fb1ff44"></i>Wider extent</div><small>Illustrative shapes that mimic NC-FLEX extents.</small>`,
  ppi: () => `<b>PPI</b><div><i style="width:12px;height:12px;background:#ef5b4c"></i>Above 80, inspect</div><div><i style="width:12px;height:12px;background:#f08a3c"></i>60 to 80, review</div><div><i style="width:12px;height:12px;background:#f2d03b"></i>Below 60, monitor</div>`
};

function renderMap() {
  layer.clearLayers();
  const list = visible();
  ({ history: drawHistory, exposure: drawExposure, ppi: drawPPI })[state.view](list);
  $("legend").innerHTML = LEGENDS[state.view]();
}

// ---------- left sidebar ----------
function renderMetrics() {
  const l = visible(), n = l.length || 1;
  const avg = Math.round(l.reduce((a, s) => a + s.ppi_score, 0) / n);
  const fema = Math.round(100 * l.filter(s => s.fema_zone_aligned).length / n);
  $("kpis").innerHTML = [["Sites shown", l.length], ["Average PPI", avg], ["Total failures", l.reduce((a, s) => a + s.failure_count, 0)], ["FEMA aligned", fema + "%"]]
    .map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("top").innerHTML = l.slice().sort((a, b) => b.ppi_score - a.ppi_score).slice(0, 5)
    .map(s => `<li data-i="${s.i}"><span>${esc(s.location)}</span><b style="background:${pinColor(s.ppi_score)}">${s.ppi_score}</b></li>`).join("");
  const types = ["Bridge", "Culvert", "Pumping Station", "Wastewater Plant"];
  const max = Math.max(1, ...types.map(t => l.filter(s => s.infrastructure_type === t).length));
  $("types").innerHTML = types.map(t => { const c = l.filter(s => s.infrastructure_type === t).length;
    return `<div class="row"><span>${t}</span><span><i style="width:${100 * c / max}%"></i></span><b>${c}</b></div>`; }).join("");
}

// ---------- right sidebar: simulated 311 logs for the active storm or selected place ----------
const TEMPLATES = {
  "Bridge": ["Debris against bridge piers", "Road washout at the approach", "Standing water near the bridge deck"],
  "Culvert": ["Culvert inlet blocked", "Water over the roadway", "Erosion at the culvert outlet"],
  "Pumping Station": ["Pump station alarm reported", "Basin overflow near the station", "Standing water around the station"],
  "Wastewater Plant": ["Sewage odor near the plant", "Overflow at a nearby manhole", "Standing water on the plant access road"]
};
function logsFor(s) {
  const n = Math.min(3, Math.ceil(s.community_reports_count / 8)), sev = s.ppi_score > 80 ? "High" : s.ppi_score >= 60 ? "Medium" : "Low";
  return Array.from({ length: n }, (_, k) => ({ s, sev, text: TEMPLATES[s.infrastructure_type][k], hours: (s.i * 7 + k * 11) % 70 + 1 }));
}
function renderLogs() {
  const base = visible(), list = state.place ? base.filter(s => s.location === state.place) : base;
  const logs = list.flatMap(logsFor).sort((a, b) => a.hours - b.hours);
  $("scope").innerHTML = state.place ? `Showing ${esc(state.place)} <button id="clr">Show all</button>` : "Showing " + (state.storm === "all" ? "all storms" : esc(state.storm));
  const clr = $("clr"); if (clr) clr.onclick = () => { state.place = null; map.closePopup(); renderLogs(); };
  $("logs").innerHTML = logs.length ? logs.map(l => `<div class="log ${l.sev}"><div class="t"><span>${esc(l.text)}</span><span>${l.sev}</span></div><div>${esc(l.s.location)}</div><div class="m">${l.hours} hours ago</div></div>`).join("")
    : '<p class="muted">No reports for this selection.</p>';
}

// ---------- controls ----------
$("storm").innerHTML = '<option value="all">All events</option>' + [...new Set(sites.map(s => s.historical_event))].map(e => `<option>${esc(e)}</option>`).join("");
$("storm").onchange = e => {
  state.storm = e.target.value; state.place = null; renderAll();
  const l = visible(); if (l.length) map.fitBounds(l.map(s => [s.lat, s.lon]), { padding: [60, 60], maxZoom: 9 });
};
$("layers").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  state.view = b.dataset.view; state.place = null;
  document.querySelectorAll("#layers button").forEach(x => x.classList.toggle("on", x === b));
  renderMap(); renderLogs();
};
$("top").onclick = e => {
  const li = e.target.closest("li"); if (!li) return;
  const s = sites[li.dataset.i]; map.setView([s.lat, s.lon], 10);
};
function renderAll() { renderMap(); renderMetrics(); renderLogs(); }
renderAll();
