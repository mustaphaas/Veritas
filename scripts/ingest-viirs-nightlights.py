#!/usr/bin/env python3
"""Compute project-level NASA VIIRS Black Marble before/after impact.

Input: JSON produced by `wrangler d1 execute ... --json`.
Output: SQLite statements that upsert project_nightlight_impacts.

The script downloads only the VNP46A3 monthly tiles needed for projects with a
recorded commissioned_at value. NASA downloads require a free Earthdata token.
No result is fabricated when data or dates are unavailable.
"""

from __future__ import annotations

import argparse
import calendar
import datetime as dt
import html
import json
import math
import os
import re
import statistics
import sys
import tempfile
import urllib.request
from pathlib import Path

import h5py
import numpy as np

PRODUCT = "VNP46A3"
VERSION = "002"
ARCHIVE = "5200"
LAADS = "https://ladsweb.modaps.eosdis.nasa.gov"
RADIUS_M = 2000
CORE_RADIUS_M = 1000
CONTROL_INNER_M = 3000
CONTROL_OUTER_M = 5000
BEFORE_MONTHS = 12
AFTER_MONTHS = 12


def month_start(value: str) -> dt.date:
    return dt.date.fromisoformat(value[:10]).replace(day=1)


def add_months(value: dt.date, offset: int) -> dt.date:
    month = value.month - 1 + offset
    year = value.year + month // 12
    return dt.date(year, month % 12 + 1, 1)


def required_months(commissioned: dt.date) -> tuple[list[dt.date], list[dt.date]]:
    before = [add_months(commissioned, -i) for i in range(BEFORE_MONTHS, 0, -1)]
    after = [add_months(commissioned, i) for i in range(1, AFTER_MONTHS + 1)]
    return before, after


def tile_for(lat: float, lon: float) -> tuple[int, int]:
    h = int(math.floor((lon + 180.0) / 10.0))
    v = int(math.floor((90.0 - lat) / 10.0))
    return max(0, min(35, h)), max(0, min(17, v))


def doy_for_month(value: dt.date) -> int:
    return (value - dt.date(value.year, 1, 1)).days + 1


def archive_dir(value: dt.date) -> str:
    return f"{LAADS}/archive/allData/{ARCHIVE}/{PRODUCT}/{value.year}/{doy_for_month(value):03d}/"


def list_tile_file(value: dt.date, h: int, v: int, token: str) -> str | None:
    url = archive_dir(value)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "Veritas-VIIRS/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            page = response.read().decode("utf-8", "ignore")
    except Exception as exc:
        print(f"warning: unable to list {url}: {exc}", file=sys.stderr)
        return None
    pattern = re.compile(
        rf'({PRODUCT}\.A\d{{7}}\.h{h:02d}v{v:02d}\.{VERSION}\.\d+\.h5)'
    )
    match = pattern.search(html.unescape(page))
    return match.group(1) if match else None


def download_file(value: dt.date, filename: str, token: str, cache: Path) -> Path:
    target = cache / filename
    if target.exists() and target.stat().st_size > 1024:
        return target
    url = f"{archive_dir(value)}{filename}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Veritas-VIIRS/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as response, open(target, "wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    return target


def find_dataset(root: h5py.File, suffix: str):
    found = []
    def visitor(name, obj):
        if isinstance(obj, h5py.Dataset) and name.split("/")[-1] == suffix:
            found.append(obj)
    root.visititems(visitor)
    return found[0] if found else None


def lat_lon_vectors(h5: h5py.File, h: int, v: int, shape: tuple[int, int]):
    lat_ds = find_dataset(h5, "lat")
    lon_ds = find_dataset(h5, "lon")
    if lat_ds is not None and lon_ds is not None:
        lat = np.asarray(lat_ds[:], dtype=float)
        lon = np.asarray(lon_ds[:], dtype=float)
        if lat.ndim == 1 and lon.ndim == 1:
            return lat, lon
        if lat.ndim == 2 and lon.ndim == 2:
            return lat[:, 0], lon[0, :]

    rows, cols = shape
    north = 90.0 - v * 10.0
    west = -180.0 + h * 10.0
    lat = north - (np.arange(rows, dtype=float) + 0.5) * (10.0 / rows)
    lon = west + (np.arange(cols, dtype=float) + 0.5) * (10.0 / cols)
    return lat, lon


def haversine_grid(lat_vec, lon_vec, lat0: float, lon0: float):
    lat_rad = np.radians(lat_vec)[:, None]
    lon_rad = np.radians(lon_vec)[None, :]
    lat0r = math.radians(lat0)
    lon0r = math.radians(lon0)
    dlat = lat_rad - lat0r
    dlon = lon_rad - lon0r
    a = np.sin(dlat / 2) ** 2 + np.cos(lat_rad) * math.cos(lat0r) * np.sin(dlon / 2) ** 2
    return 6371000.0 * 2 * np.arctan2(np.sqrt(a), np.sqrt(np.maximum(0.0, 1 - a)))


def sample_month(path: Path, h: int, v: int, lat0: float, lon0: float):
    with h5py.File(path, "r") as h5:
        rad_ds = find_dataset(h5, "NearNadir_Composite_Snow_Free")
        quality_ds = find_dataset(h5, "NearNadir_Composite_Snow_Free_Quality")
        if rad_ds is None:
            raise RuntimeError(f"{path.name} lacks NearNadir_Composite_Snow_Free")

        radiance = np.asarray(rad_ds[:], dtype=float)
        fill = rad_ds.attrs.get("_FillValue")
        if fill is not None:
            radiance[radiance == float(np.asarray(fill).ravel()[0])] = np.nan
        scale = float(np.asarray(rad_ds.attrs.get("scale_factor", 1.0)).ravel()[0])
        offset = float(np.asarray(rad_ds.attrs.get("offset", 0.0)).ravel()[0])
        radiance = radiance * scale + offset
        radiance[radiance < 0] = np.nan

        if quality_ds is not None:
            quality = np.asarray(quality_ds[:])
            radiance[~np.isin(quality, [0, 1])] = np.nan

        lat_vec, lon_vec = lat_lon_vectors(h5, h, v, radiance.shape)
        dist = haversine_grid(lat_vec, lon_vec, lat0, lon0)

        project_values = radiance[dist <= RADIUS_M]
        core_values = radiance[dist <= CORE_RADIUS_M]
        control_values = radiance[(dist >= CONTROL_INNER_M) & (dist <= CONTROL_OUTER_M)]
        project_values = project_values[np.isfinite(project_values)]
        core_values = core_values[np.isfinite(core_values)]
        control_values = control_values[np.isfinite(control_values)]

        project = float(np.median(project_values)) if project_values.size else None
        core_median = float(np.median(core_values)) if core_values.size else None
        core_mean = float(np.mean(core_values)) if core_values.size else None
        core_p90 = float(np.percentile(core_values, 90)) if core_values.size else None
        control = float(np.median(control_values)) if control_values.size else None

        # Small spatial snapshot for future before/after heatmap rendering.
        nearest_row = int(np.argmin(np.abs(lat_vec - lat0)))
        nearest_col = int(np.argmin(np.abs(lon_vec - lon0)))
        half = 5
        r0, r1 = max(0, nearest_row-half), min(radiance.shape[0], nearest_row+half+1)
        c0, c1 = max(0, nearest_col-half), min(radiance.shape[1], nearest_col+half+1)
        grid = radiance[r0:r1, c0:c1]
        grid_json = [[None if not np.isfinite(x) else round(float(x), 3) for x in row] for row in grid]
        return project, control, core_median, core_mean, core_p90, grid_json


def median(values):
    vals = [v for v in values if isinstance(v, (int, float)) and math.isfinite(v)]
    return statistics.median(vals) if vals else None


def pct_change(before, after):
    if before is None or after is None or abs(before) < 0.05:
        return None
    return (after - before) / abs(before) * 100.0


def classify(project_pct, control_pct, core_before, core_after, core_p90_before, core_p90_after, control_before, control_after, before_n, after_n):
    if before_n < 6 or after_n < 6:
        return "insufficient_data", "insufficient", "insufficient_months", "Fewer than six valid months are available on one side of commissioning."

    quality = "good" if before_n >= 10 and after_n >= 10 else "moderate" if before_n >= 8 and after_n >= 8 else "limited"

    # Prefer percentage-based change when the baseline is bright enough to make
    # a ratio meaningful. The 90th percentile is sensitive to a small cluster
    # of newly lit pixels that a 2 km median can wash out.
    core_p90_pct = pct_change(core_p90_before, core_p90_after)
    if core_p90_pct is not None:
        differential = core_p90_pct - (control_pct or 0.0)
        if core_p90_pct >= 30 and differential >= 20:
            return "strong_increase", quality, "core_p90_percent_change", "The 1 km core 90th-percentile radiance increased substantially relative to the comparison area."
        if core_p90_pct >= 10 and differential >= 10:
            return "moderate_increase", quality, "core_p90_percent_change", "The 1 km core 90th-percentile radiance increased relative to the comparison area."
        if core_p90_pct <= -10:
            return "decrease", quality, "core_p90_percent_change", "The 1 km core 90th-percentile radiance decreased after commissioning."
        return "no_clear_change", quality, "core_p90_percent_change", "The 1 km core 90th-percentile radiance did not show a clear change relative to the comparison area."

    # For a near-zero baseline, percentage change is mathematically unstable.
    # Use an absolute-radiance test, while still requiring the project-core
    # increase to exceed the contemporaneous control-ring change.
    if core_p90_before is not None and core_p90_after is not None:
        project_delta = core_p90_after - core_p90_before
        control_delta = 0.0
        if control_before is not None and control_after is not None:
            control_delta = control_after - control_before
        excess_delta = project_delta - max(control_delta, 0.0)
        mean_delta = None if core_before is None or core_after is None else core_after - core_before

        if project_delta >= 0.30 and excess_delta >= 0.20 and (mean_delta is None or mean_delta >= 0.05):
            return "strong_increase", quality, "core_p90_absolute_change", "The pre-project signal was near zero, so Veritas used absolute 1 km core radiance change; the increase was strong and exceeded the comparison-area change."
        if project_delta >= 0.10 and excess_delta >= 0.08 and (mean_delta is None or mean_delta >= 0.02):
            return "moderate_increase", quality, "core_p90_absolute_change", "The pre-project signal was near zero, so Veritas used absolute 1 km core radiance change; the increase exceeded the comparison-area change."
        if project_delta <= -0.10:
            return "decrease", quality, "core_p90_absolute_change", "The pre-project signal was near zero and the 1 km core radiance decreased after commissioning."
        return "no_clear_change", quality, "core_p90_absolute_change", "The pre-project signal was near zero and the absolute 1 km core change was too small to call a measurable increase."

    if project_pct is not None:
        differential = project_pct - (control_pct or 0.0)
        if project_pct >= 30 and differential >= 20:
            return "strong_increase", quality, "two_km_median_percent_change", "The 2 km median radiance increased substantially relative to the comparison area."
        if project_pct >= 10 and differential >= 10:
            return "moderate_increase", quality, "two_km_median_percent_change", "The 2 km median radiance increased relative to the comparison area."
        if project_pct <= -10:
            return "decrease", quality, "two_km_median_percent_change", "The 2 km median radiance decreased after commissioning."
        return "no_clear_change", quality, "two_km_median_percent_change", "The 2 km median radiance did not show a clear change."

    return "insufficient_data", quality, "signal_unavailable", "Valid monthly observations exist, but no reliable local radiance metric could be calculated."


def parse_wrangler_json(path: Path):
    raw = json.loads(path.read_text())
    rows = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                if isinstance(item.get("results"), list):
                    rows.extend(item["results"])
                elif isinstance(item.get("result"), list):
                    rows.extend(item["result"])
                elif "id" in item:
                    rows.append(item)
    elif isinstance(raw, dict):
        rows = raw.get("results") or raw.get("result") or []
    return rows


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return repr(round(float(value), 8))
    text = str(value).replace("'", "''")
    return "'" + text + "'"


def grid_median(grids):
    valid = [np.asarray(g, dtype=float) for g in grids if g]
    if not valid:
        return None
    shape = valid[0].shape
    valid = [g for g in valid if g.shape == shape]
    if not valid:
        return None
    stacked = np.stack(valid)
    out = np.nanmedian(stacked, axis=0)
    return [[None if not np.isfinite(x) else round(float(x), 3) for x in row] for row in out]


def analyse_project(project, token: str, cache: Path):
    commissioned = month_start(project["commissionedAt"])
    before_months, after_months = required_months(commissioned)
    h, v = tile_for(float(project["latitude"]), float(project["longitude"]))
    series = []
    grids_before, grids_after = [], []

    for phase, months in (("before", before_months), ("after", after_months)):
        for month in months:
            filename = list_tile_file(month, h, v, token)
            if not filename:
                series.append({"month": month.isoformat(), "phase": phase, "projectRadiance": None, "controlRadiance": None})
                continue
            try:
                path = download_file(month, filename, token, cache)
                project_rad, control_rad, core_median, core_mean, core_p90, grid = sample_month(
                    path, h, v, float(project["latitude"]), float(project["longitude"])
                )
            except Exception as exc:
                print(f"warning: {project['id']} {month}: {exc}", file=sys.stderr)
                project_rad, control_rad, core_median, core_mean, core_p90, grid = None, None, None, None, None, None
            series.append({
                "month": month.isoformat(),
                "phase": phase,
                "projectRadiance": project_rad,
                "controlRadiance": control_rad,
                "coreMedianRadiance": core_median,
                "coreMeanRadiance": core_mean,
                "coreP90Radiance": core_p90,
            })
            if grid:
                (grids_before if phase == "before" else grids_after).append(grid)

    before_p = [x["projectRadiance"] for x in series if x["phase"] == "before" and x["projectRadiance"] is not None]
    after_p = [x["projectRadiance"] for x in series if x["phase"] == "after" and x["projectRadiance"] is not None]
    before_c = [x["controlRadiance"] for x in series if x["phase"] == "before" and x["controlRadiance"] is not None]
    after_c = [x["controlRadiance"] for x in series if x["phase"] == "after" and x["controlRadiance"] is not None]
    before_core = [x["coreMedianRadiance"] for x in series if x["phase"] == "before" and x["coreMedianRadiance"] is not None]
    after_core = [x["coreMedianRadiance"] for x in series if x["phase"] == "after" and x["coreMedianRadiance"] is not None]
    before_core_mean = [x["coreMeanRadiance"] for x in series if x["phase"] == "before" and x["coreMeanRadiance"] is not None]
    after_core_mean = [x["coreMeanRadiance"] for x in series if x["phase"] == "after" and x["coreMeanRadiance"] is not None]
    before_core_p90 = [x["coreP90Radiance"] for x in series if x["phase"] == "before" and x["coreP90Radiance"] is not None]
    after_core_p90 = [x["coreP90Radiance"] for x in series if x["phase"] == "after" and x["coreP90Radiance"] is not None]

    baseline = median(before_p)
    post = median(after_p)
    control_baseline = median(before_c)
    control_post = median(after_c)
    core_baseline = median(before_core)
    core_post = median(after_core)
    core_mean_baseline = median(before_core_mean)
    core_mean_post = median(after_core_mean)
    core_p90_baseline = median(before_core_p90)
    core_p90_post = median(after_core_p90)
    project_pct = pct_change(baseline, post)
    core_pct = pct_change(core_baseline, core_post)
    core_p90_pct = pct_change(core_p90_baseline, core_p90_post)
    control_pct = pct_change(control_baseline, control_post)
    impact_class, quality, detection_metric, detection_reason = classify(
        project_pct,
        control_pct,
        core_mean_baseline,
        core_mean_post,
        core_p90_baseline,
        core_p90_post,
        control_baseline,
        control_post,
        len(before_p),
        len(after_p),
    )
    differential = project_pct - control_pct if project_pct is not None and control_pct is not None else None

    return {
        "project_id": project["id"],
        "commissioning_date": commissioned.isoformat(),
        "date_basis": project.get("dateBasis") or "field completion date",
        "radius_metres": RADIUS_M,
        "core_radius_metres": CORE_RADIUS_M,
        "control_inner_metres": CONTROL_INNER_M,
        "control_outer_metres": CONTROL_OUTER_M,
        "before_start": before_months[0].isoformat(),
        "before_end": before_months[-1].isoformat(),
        "after_start": after_months[0].isoformat(),
        "after_end": after_months[-1].isoformat(),
        "baseline_radiance": baseline,
        "after_radiance": post,
        "radiance_delta": (post - baseline) if baseline is not None and post is not None else None,
        "percent_change": project_pct,
        "core_baseline_radiance": core_baseline,
        "core_after_radiance": core_post,
        "core_radiance_delta": (core_post - core_baseline) if core_baseline is not None and core_post is not None else None,
        "core_percent_change": core_pct,
        "core_mean_baseline_radiance": core_mean_baseline,
        "core_mean_after_radiance": core_mean_post,
        "core_p90_baseline_radiance": core_p90_baseline,
        "core_p90_after_radiance": core_p90_post,
        "core_p90_percent_change": core_p90_pct,
        "control_baseline_radiance": control_baseline,
        "control_after_radiance": control_post,
        "control_percent_change": control_pct,
        "differential_percentage_points": differential,
        "months_before": len(before_p),
        "months_after": len(after_p),
        "impact_class": impact_class,
        "data_quality": quality,
        "detection_metric": detection_metric,
        "detection_reason": detection_reason,
        "series_json": json.dumps(series, separators=(",", ":")),
        "before_grid_json": json.dumps(grid_median(grids_before), separators=(",", ":")) if grids_before else None,
        "after_grid_json": json.dumps(grid_median(grids_after), separators=(",", ":")) if grids_after else None,
        "source_product": "VNP46A3.002",
        "source_name": "NASA VIIRS Black Marble",
        "source_url": "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A3",
        "analysis_method": "near-nadir-snow-free-multi-metric-v2",
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def emit_sql(results, output: Path):
    columns = [
        "project_id","commissioning_date","date_basis","radius_metres","core_radius_metres","control_inner_metres",
        "control_outer_metres","before_start","before_end","after_start","after_end",
        "baseline_radiance","after_radiance","radiance_delta","percent_change",
        "core_baseline_radiance","core_after_radiance","core_radiance_delta","core_percent_change",
        "core_mean_baseline_radiance","core_mean_after_radiance",
        "core_p90_baseline_radiance","core_p90_after_radiance","core_p90_percent_change",
        "control_baseline_radiance","control_after_radiance","control_percent_change",
        "differential_percentage_points","months_before","months_after","impact_class",
        "data_quality","detection_metric","detection_reason","series_json","before_grid_json","after_grid_json","source_product",
        "source_name","source_url","analysis_method","checked_at"
    ]
    lines = []
    for result in results:
        values = ",".join(sql_value(result.get(col)) for col in columns)
        lines.append(
            f"INSERT OR REPLACE INTO project_nightlight_impacts ({','.join(columns)}) VALUES ({values});"
        )
    output.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--projects-json", required=True)
    parser.add_argument("--output-sql", required=True)
    parser.add_argument("--cache-dir", default=".viirs-cache")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    token = os.environ.get("NASA_EARTHDATA_TOKEN", "").strip()
    if not token:
        raise SystemExit("NASA_EARTHDATA_TOKEN is required.")

    projects = [
        row for row in parse_wrangler_json(Path(args.projects_json))
        if row.get("id") and row.get("commissionedAt") and row.get("latitude") is not None and row.get("longitude") is not None
    ]
    if args.limit > 0:
        projects = projects[: args.limit]
    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)

    results = []
    for index, project in enumerate(projects, 1):
        print(f"[{index}/{len(projects)}] {project['id']}", file=sys.stderr)
        try:
            results.append(analyse_project(project, token, cache))
        except Exception as exc:
            print(f"warning: failed {project['id']}: {exc}", file=sys.stderr)

    emit_sql(results, Path(args.output_sql))
    print(f"Wrote {len(results)} project impact records to {args.output_sql}", file=sys.stderr)


if __name__ == "__main__":
    main()
