"""
FloodMetric Phase I: Historical Damage Analytics
=================================================
Prototype backend for the Wake County / Cary pilot.

What it does
  1. Builds simulated infrastructure assets (bridges, culverts) and historical failure points.
  2. Projects everything from WGS84 (EPSG:4326) to NAD83 / North Carolina (EPSG:32119, meters)
     so that distances and DBSCAN's eps are real meters, not degrees.
  3. Runs DBSCAN on the failure points to find recurring damage clusters. The number of
     clusters is not set in advance.
  4. Scores each asset with a Predictive Priority Index (PPI) that uses cluster proximity,
     a FwDET-style flood depth estimate, structural condition, and 311 report counts.
  5. Writes GeoJSON files (back in EPSG:4326) for the web dashboard.

All data here is SIMULATED. Replace load_assets() and load_failure_points() with real
NCDOT / FEMA / Wake County GIS sources when access is available.

Requires: geopandas, shapely, scikit-learn, numpy
Run:      python phase1_historical_damage_analytics.py
"""
from pathlib import Path

import numpy as np
import geopandas as gpd
from shapely.geometry import Point
from sklearn.cluster import DBSCAN

WGS84 = "EPSG:4326"
NC_METERS = "EPSG:32119"          # NAD83 / North Carolina, units = meters
DATA_DIR = Path(__file__).parent / "data"
RNG = np.random.default_rng(42)   # fixed seed so the prototype is reproducible

# DBSCAN settings (meters): a cluster needs >= 4 failure points within 350 m of each other.
EPS_M, MIN_SAMPLES = 350, 4
SEARCH_RADIUS_M = 500             # window for counting nearby historical failures
PROX_DECAY_M = 500                # proximity score halves roughly every ~350 m (exp decay)
WEIGHTS = {"history": 0.35, "vulnerability": 0.25, "exposure": 0.25, "reports": 0.15}


# ---------------------------------------------------------------- data loading (simulated)
def load_assets() -> gpd.GeoDataFrame:
    """Simulated assets: (id, name, type, lat, lon, vulnerability 1-5, 311 reports, failures planted)."""
    rows = [
        ("S01", "River Landing Rd", "Road", 35.7570, -78.8400, 4, 18, 7),
        ("S02", "Old Ferry Rd approach", "Road", 35.7330, -78.8720, 4, 15, 6),
        ("S03", "Rocky Branch Rd", "Culvert", 35.7840, -78.7050, 4, 12, 5),
        ("S04", "Swift Run Rd", "Culvert", 35.7620, -78.7790, 5, 9, 4),
        ("S05", "Black Creek Rd", "Road", 35.7050, -78.7510, 5, 11, 4),
        ("S06", "Tar Bend Rd drainage", "Drainage", 35.8100, -78.6100, 3, 7, 4),
        ("S07", "Marsh Rd bridge", "Bridge", 35.6750, -78.6500, 3, 6, 5),
        ("S08", "Hollis Creek culvert", "Culvert", 35.8300, -78.7900, 4, 2, 3),
        ("S09", "Mill Creek Rd bridge", "Bridge", 35.7900, -78.8300, 3, 4, 3),
        ("S10", "Sandy Run drainage", "Drainage", 35.6500, -78.8200, 3, 5, 2),
        ("S11", "Maple Grove Rd bridge", "Bridge", 35.8600, -78.6800, 2, 2, 3),
        ("S12", "Pine Hollow Rd culvert", "Culvert", 35.9000, -78.7400, 2, 3, 2),
        ("S13", "Cedar Fork bridge", "Bridge", 35.8000, -78.9000, 2, 1, 1),
        ("S14", "Oak Ridge Rd culvert", "Culvert", 35.9400, -78.8600, 1, 0, 1),
    ]
    df = gpd.pd.DataFrame(
        rows, columns=["id", "name", "type", "lat", "lon", "vulnerability", "reports", "planted"]
    )
    geom = [Point(lon, lat) for lat, lon in zip(df.lat, df.lon)]
    return gpd.GeoDataFrame(df.drop(columns=["lat", "lon"]), geometry=geom, crs=WGS84)


def load_failure_points(assets_m: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Simulated damage records: tight groups around the worst assets plus scattered noise.
    Built directly in projected meters so offsets are exact."""
    pts = []
    for _, a in assets_m.iterrows():
        n = int(a.planted) * 2                       # more recurring damage near the worst assets
        offsets = RNG.normal(0, 140, size=(n, 2))    # sigma = 140 m
        pts += [Point(a.geometry.x + dx, a.geometry.y + dy) for dx, dy in offsets]
    minx, miny, maxx, maxy = assets_m.total_bounds
    noise = RNG.uniform([minx, miny], [maxx, maxy], size=(25, 2))   # isolated, non-recurring damage
    pts += [Point(x, y) for x, y in noise]
    return gpd.GeoDataFrame({"event_year": RNG.integers(1996, 2025, len(pts))}, geometry=pts, crs=NC_METERS)


# ---------------------------------------------------------------- analytics
def cluster_failures(fp: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """DBSCAN on projected coordinates. Label -1 means noise (not a recurring pattern)."""
    xy = np.column_stack([fp.geometry.x, fp.geometry.y])
    fp["cluster"] = DBSCAN(eps=EPS_M, min_samples=MIN_SAMPLES).fit_predict(xy)
    return fp


def fwdet_style_depth(ground_elev_m: np.ndarray, boundary_wse_m: np.ndarray) -> np.ndarray:
    """FwDET concept: flood depth = water surface elevation (taken from the flood boundary)
    minus ground elevation, floored at zero. The real FwDET tool derives the boundary
    elevation from a DEM; here both inputs are simulated."""
    return np.clip(boundary_wse_m - ground_elev_m, 0, None)


def score_assets(assets_m: gpd.GeoDataFrame, fp: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    clustered = fp[fp.cluster >= 0]
    cluster_union = clustered.geometry.union_all()   # use .unary_union on geopandas < 1.0

    # History: failures inside the search window + distance to the nearest recurring cluster.
    assets_m["failures"] = [int(fp.within(g.buffer(SEARCH_RADIUS_M)).sum()) for g in assets_m.geometry]
    assets_m["cluster_dist_m"] = [round(float(g.distance(cluster_union)), 1) for g in assets_m.geometry]
    assets_m["cluster_id"] = [
        int(clustered.iloc[clustered.geometry.distance(g).argmin()].cluster) for g in assets_m.geometry
    ]
    proximity = np.exp(-assets_m.cluster_dist_m / PROX_DECAY_M)

    # Exposure: simulated ground elevation and boundary water surface elevation (meters).
    ground = RNG.uniform(85, 125, len(assets_m))
    wse = ground + RNG.uniform(-1.5, 4.5, len(assets_m)) + assets_m.failures.values * 0.15
    depth = fwdet_style_depth(ground, wse)
    assets_m["flood_depth_m"] = depth.round(2)
    assets_m["exposure"] = np.clip(10 + 7 * depth + RNG.normal(0, 3, len(assets_m)), 0, 78).astype(int)  # events of 78

    # Normalize each component to 0-1, then combine.
    history = 0.5 * assets_m.failures / max(1, assets_m.failures.max()) + 0.5 * proximity
    vuln = (assets_m.vulnerability - 1) / 4
    expo = assets_m.exposure / 78
    rep = assets_m.reports / max(1, assets_m.reports.max())
    ppi = 100 * (WEIGHTS["history"] * history + WEIGHTS["vulnerability"] * vuln
                 + WEIGHTS["exposure"] * expo + WEIGHTS["reports"] * rep)
    assets_m["ppi_backend"] = ppi.round().astype(int)
    return assets_m


def main():
    DATA_DIR.mkdir(exist_ok=True)
    assets = load_assets()
    assets_m = assets.to_crs(NC_METERS)               # meters from here on
    fp = cluster_failures(load_failure_points(assets_m))
    assets_m = score_assets(assets_m, fp)

    n_clusters = fp.cluster.max() + 1
    print(f"{len(fp)} failure points, {n_clusters} recurring clusters, {(fp.cluster == -1).sum()} noise points")

    # Back to WGS84 for Leaflet / GeoJSON consumers.
    assets_m.drop(columns=["planted"]).to_crs(WGS84).to_file(DATA_DIR / "sites.geojson", driver="GeoJSON")
    fp.to_crs(WGS84).to_file(DATA_DIR / "failure_points.geojson", driver="GeoJSON")
    print(assets_m[["name", "failures", "cluster_dist_m", "flood_depth_m", "ppi_backend"]]
          .sort_values("ppi_backend", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
