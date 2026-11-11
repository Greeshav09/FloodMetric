/* FloodMetric North Carolina prototype. Data comes from mock_data.js (a copy of mock_data.geojson). */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// ---------- data ----------
const sites = window.MOCK_DATA.features.map((f, i) => ({
  i, ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
  vuln: Math.max(1, Math.min(5, Math.round(1 + (f.properties.ppi_score - 35) / 64 * 4)))   // estimate for the popup
}));
const EVENT_COLOR = { "Hurricane Helene (2024)":"#0d9488", "Hurricane Florence (2018)":"#7c3aed", "Hurricane Floyd (1999)":"#d97706", "Routine Extreme Rainfall":"#64748b" };
const urgency = p => p > 80 ? "#dc2626" : "#ea580c";            // used by the PPI view (only sites with PPI 60+ appear)
const status = p => p > 80 ? "Inspection recommended" : p >= 60 ? "Review scheduled" : "Routine monitoring";
const VIEW_NAME = { history: "Historical failure patterns", exposure: "Flood exposure", ppi: "Predictive Priority Index" };
const state = { view: "history", storm: "all", place: null };

// Sites that belong in the current view: the storm filter applies everywhere, and the PPI view keeps only actionable sites.
const shown = () => sites.filter(s => (state.storm === "all" || s.historical_event === state.storm) && (state.view !== "ppi" || s.ppi_score >= 60));

// ---------- map ----------
const map = L.map("map", { zoomControl: false }).setView([35.4, -79.6], 7);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);
const layer = L.layerGroup().addTo(map);

// Popup content differs by view so each view tells a different story.
function popup(s) {
  const head = `<div class="pop"><h3>${esc(s.location)}</h3><p>${esc(s.infrastructure_type)} | ${esc(s.historical_event)}</p>`;
  const zone = s.fema_zone_aligned ? "Within FEMA zone" : "Outside FEMA zone";
  if (state.view === "history") return head + `<dl><dt>Failures on record</dt><dd>${s.failure_count}</dd><dt>Storm</dt><dd>${esc(s.historical_event)}</dd><dt>PPI</dt><dd>${s.ppi_score}</dd></dl></div>`;
  if (state.view === "exposure") return head + `<dl><dt>Flood extent radius</dt><dd>${(s.flood_extent_meters / 1000).toFixed(1)} km</dd><dt>Flood zone alignment</dt><dd>${zone}</dd><dt>Failures on record</dt><dd>${s.failure_count}</dd></dl></div>`;
  return head + `<dl><dt>PPI</dt><dd style="color:${urgency(s.ppi_score)}">${s.ppi_score}</dd><dt>Structural vulnerability (est.)</dt><dd>${s.vuln} of 5</dd>
    <dt>Flood zone alignment</dt><dd>${zone}</dd><dt>Recent 311 reports</dt><dd>${s.recent_311_reports}</dd><dt>Inspection status</dt><dd>${status(s.ppi_score)}</dd></dl>
    <div class="bar"><i style="width:${s.ppi_score}%;background:${urgency(s.ppi_score)}"></i></div><div class="note">${esc(s.latest_311_note)}</div></div>`;
}
function bind(m, s) {
  m.bindPopup(() => popup(s));
  m.on("click", () => { state.place = s.location; renderLogs(); });
  m.on("popupclose", () => { if (state.place === s.location) { state.place = null; renderLogs(); } });
  return m.addTo(layer);
}

// View 1: every site as a circle marker, radius = failure_count * 4.5, colored by storm.
function drawHistory(list) {
  list.forEach(s => bind(L.circleMarker([s.lat, s.lon], { radius: s.failure_count * 4.5, weight: 1.5, color: "#0f172a", fillColor: EVENT_COLOR[s.historical_event], fillOpacity: .6 }), s)
    .bindTooltip(esc(s.location) + ": " + s.failure_count + " failures"));
}
// View 2: no point markers. True-scale circles (meters) sized by flood_extent_meters. Larger extents go underneath so small ones stay clickable.
function drawExposure(list) {
  list.slice().sort((a, b) => b.flood_extent_meters - a.flood_extent_meters).forEach(s => {
    const inZone = s.fema_zone_aligned;
    bind(L.circle([s.lat, s.lon], { radius: s.flood_extent_meters, weight: inZone ? 1.5 : 1.2, color: inZone ? "#1e40af" : "#0284c7", dashArray: inZone ? null : "5 4",
      fillColor: inZone ? "#1d4ed8" : "#7dd3fc", fillOpacity: inZone ? .34 : .3 }), s)
      .bindTooltip(esc(s.location) + ": " + (s.flood_extent_meters / 1000).toFixed(1) + " km extent");
  });
}
// View 3: only PPI 60+ sites, drawn as target pins. Red above 80, orange from 60 to 80.
function drawPPI(list) {
  list.forEach(s => {
    const c = urgency(s.ppi_score);
    const html = `<svg class="pin" width="30" height="40" viewBox="0 0 28 36"><path d="M14 1C6.8 1 1 6.8 1 13.9 1 23.5 14 35 14 35s13-11.5 13-21.1C27 6.8 21.2 1 14 1z" fill="${c}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="7" fill="#fff"/><circle cx="14" cy="14" r="4.2" fill="${c}"/><circle cx="14" cy="14" r="1.6" fill="#fff"/></svg>`;
    bind(L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "", html, iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -34] }) }), s)
      .bindTooltip(esc(s.location) + ": PPI " + s.ppi_score);
  });
}

const dot = (c, n = 12, cls = "") => `<i style="width:${n}px;height:${n}px;background:${c}"></i>`;
const LEGENDS = {
  history: () => `<b>Failures on record</b>${[1, 3, 6].map(n => `<div><i style="width:${n * 4.5 * 2}px;height:${n * 4.5 * 2}px;background:#64748b99;border:1px solid #0f172a"></i>${n}</div>`).join("")}
    <b style="margin-top:8px">Storm</b>${Object.entries(EVENT_COLOR).map(([k, c]) => `<div>${dot(c, 10)}${esc(k)}</div>`).join("")}`,
  exposure: () => `<b>Flood extent</b><div>${dot("#1d4ed8")}Inside FEMA zone</div><div>${dot("#7dd3fc")}Outside FEMA zone</div><small>Circle radius is each site's flood_extent_meters. Illustrative shapes that mimic NC-FLEX inundation, not real extents.</small>`,
  ppi: () => `<b>Actionable sites (PPI 60+)</b><div>${dot("#dc2626")}Above 80, inspect</div><div>${dot("#ea580c")}60 to 80, review</div><small>Sites below 60 are hidden in this view.</small>`
};
function renderMap() {
  layer.clearLayers();
  ({ history: drawHistory, exposure: drawExposure, ppi: drawPPI })[state.view](shown());
  $("legend").innerHTML = LEGENDS[state.view]();
}

// ---------- left sidebar: recalculated from the active view AND storm filter ----------
const sum = (l, f) => l.reduce((a, s) => a + f(s), 0);
function renderMetrics() {
  const l = shown(), n = Math.max(1, l.length), v = state.view;
  const k = {
    history: [["Sites shown", l.length], ["Total failures", sum(l, s => s.failure_count)], ["Avg failures per site", (sum(l, s => s.failure_count) / n).toFixed(1)], ["Hotspots (5+ failures)", l.filter(s => s.failure_count >= 5).length]],
    exposure: [["Sites shown", l.length], ["Sum of extents (km2)", Math.round(sum(l, s => Math.PI * (s.flood_extent_meters / 1000) ** 2)).toLocaleString()], ["Avg extent radius (km)", (sum(l, s => s.flood_extent_meters) / n / 1000).toFixed(1)], ["Inside FEMA zone", Math.round(100 * l.filter(s => s.fema_zone_aligned).length / n) + "%"]],
    ppi: [["Actionable sites", l.length], ["Average PPI", Math.round(sum(l, s => s.ppi_score) / n)], ["Urgent (PPI above 80)", l.filter(s => s.ppi_score > 80).length], ["Recent 311 reports", sum(l, s => s.recent_311_reports)]]
  }[v];
  $("kpis").innerHTML = k.map(([a, b]) => `<div class="kpi"><span>${a}</span><strong>${b}</strong></div>`).join("");
  $("ctx").textContent = VIEW_NAME[v] + " | " + (state.storm === "all" ? "All events" : state.storm);

  const rank = { history: [s => s.failure_count, s => s.failure_count + " failures", "Most repeated failures"],
    exposure: [s => s.flood_extent_meters, s => (s.flood_extent_meters / 1000).toFixed(1) + " km", "Widest flood extents"],
    ppi: [s => s.ppi_score, s => "PPI " + s.ppi_score, "Highest PPI sites"] }[v];
  $("top").previousElementSibling.textContent = rank[2];
  $("top").innerHTML = l.slice().sort((a, b) => rank[0](b) - rank[0](a)).slice(0, 5)
    .map(s => `<li data-i="${s.i}"><span>${esc(s.location)}</span><b>${rank[1](s)}</b></li>`).join("") || '<li>No sites for this selection</li>';

  const types = ["Bridge", "Culvert", "Pumping Station", "Wastewater Plant"], counts = types.map(t => l.filter(s => s.infrastructure_type === t).length), max = Math.max(1, ...counts);
  $("types").innerHTML = types.map((t, j) => `<div class="row"><span>${t}</span><span><i style="width:${100 * counts[j] / max}%"></i></span><b>${counts[j]}</b></div>`).join("");
}

// ---------- right sidebar: latest 311 notes for the sites in the active view ----------
function renderLogs() {
  const base = shown(), list = state.place ? base.filter(s => s.location === state.place) : base;
  const logs = list.filter(s => s.recent_311_reports > 0).map(s => ({ s, sev: s.ppi_score > 80 ? "High" : s.ppi_score >= 60 ? "Medium" : "Low", hours: (s.i * 7) % 70 + 1 })).sort((a, b) => a.hours - b.hours);
  $("scope").innerHTML = state.place ? `Showing ${esc(state.place)} <button id="clr">Show all</button>` : `Showing ${logs.length} sites | ${VIEW_NAME[state.view]}`;
  const clr = $("clr"); if (clr) clr.onclick = () => { state.place = null; map.closePopup(); renderLogs(); };
  $("logs").innerHTML = logs.length ? logs.map(l => `<div class="log ${l.sev}"><div class="t"><span>${esc(l.s.latest_311_note)}</span><span>${l.sev}</span></div><div>${esc(l.s.location)} | ${l.s.recent_311_reports} recent reports</div><div class="m">${l.hours} hours ago</div></div>`).join("")
    : '<p class="muted">No reports for this selection.</p>';
}

// ---------- controls ----------
const ctx = document.createElement("p"); ctx.id = "ctx"; ctx.className = "ctx"; $("storm").after(ctx);
$("storm").innerHTML = '<option value="all">All events</option>' + [...new Set(sites.map(s => s.historical_event))].map(e => `<option>${esc(e)}</option>`).join("");
$("storm").onchange = e => {
  state.storm = e.target.value; state.place = null; renderAll();
  const l = shown(); if (l.length) map.fitBounds(l.map(s => [s.lat, s.lon]), { padding: [60, 60], maxZoom: 9 });
};
$("layers").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  state.view = b.dataset.view; state.place = null; map.closePopup();
  document.querySelectorAll("#layers button").forEach(x => x.classList.toggle("on", x === b));
  renderAll();
};
$("top").onclick = e => { const li = e.target.closest("li[data-i]"); if (li) { const s = sites[li.dataset.i]; map.setView([s.lat, s.lon], 10); } };
function renderAll() { renderMap(); renderMetrics(); renderLogs(); }
renderAll();
