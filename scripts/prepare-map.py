"""Prepare a self-contained Equal Earth basemap and small-economy locator points."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '9380cca83db5f9aef52d5e762765100745f84b27'
BOUNDARIES = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/ne_110m_admin_0_countries.geojson'
COUNTRIES = 'https://api.worldbank.org/v2/country?format=json&per_page=1000'
PROJECTION = 'https://github.com/d3/d3-geo/blob/main/src/projection/equalEarth.js'


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'world-bank-research-map'}), timeout=60) as response:
        return json.load(response)


def project(lon, lat):
    """Equal Earth forward equations; radians to a 1000 × 520 SVG canvas."""
    theta = math.asin(math.sqrt(3) / 2 * math.sin(math.radians(lat)))
    theta2 = theta * theta
    theta6 = theta2 ** 3
    x = math.radians(lon) * math.cos(theta) / (math.sqrt(3) / 2 * (1.340264 - 3 * .081106 * theta2 + theta6 * (7 * .000893 + 9 * .003796 * theta2)))
    y = theta * (1.340264 - .081106 * theta2 + theta6 * (.000893 + .003796 * theta2))
    return [round(500 + 175 * x, 2), round(250 - 175 * y, 2)]


def ring_points(ring):
    points = []
    for i, (lon, lat, *_) in enumerate(ring):
        if i:
            prev_lon, prev_lat = ring[i - 1][:2]
            if abs(lon - prev_lon) > 180:
                raise ValueError('Unsplit antimeridian edge in the source geometry')
            steps = max(1, math.ceil(max(abs(lon - prev_lon), abs(lat - prev_lat)) / 1.5))
            for step in range(1, steps):
                points.append(project(prev_lon + (lon - prev_lon) * step / steps, prev_lat + (lat - prev_lat) * step / steps))
        points.append(project(lon, lat))
    return points


def bounds(points):
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def area(points):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]))) / 2


def main():
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(fetch, BOUNDARIES)
        b = pool.submit(fetch, COUNTRIES)
        geo, country_payload = a.result(), b.result()
    header, countries = country_payload
    if int(header['pages']) != 1 or int(header['total']) != len(countries):
        raise ValueError('Incomplete World Bank location catalog')
    countries = [c for c in countries if c['region']['id'] != 'NA']
    known = {c['id'] for c in countries}
    features = []
    for feature in geo['features']:
        p = feature['properties']
        if p['ADM0_A3'] == 'ATA':
            continue
        # Natural Earth's older Kosovo code differs from the World Bank API code.
        candidates = [p.get('WB_A3'), p.get('ISO_A3_EH'), p.get('ISO_A3'), p.get('ADM0_A3')]
        code = next((c for c in candidates if c in known), None)
        if p.get('ADM0_A3') == 'KOS' and 'XKX' in known:
            code = 'XKX'
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        rings = [ring_points(ring) for polygon in polygons for ring in polygon]
        outer = [ring_points(polygon[0]) for polygon in polygons]
        largest = max(outer, key=area)
        path = ''.join('M' + 'L'.join(f'{x},{y}' for x, y in ring) + 'Z' for ring in rings)
        features.append({'key': p['ADM0_A3'], 'id': code, 'name': p['NAME_EN'] or p['NAME'], 'path': path,
                         'point': project(p['LABEL_X'], p['LABEL_Y']),
                         'bounds': bounds([point for ring in rings for point in ring]),
                         'focusBounds': bounds(largest)})
    mapped = {f['id'] for f in features if f['id']}
    locators = []
    for c in countries:
        if c['id'] in mapped or not c['longitude'] or not c['latitude']:
            continue
        lon, lat = float(c['longitude']), float(c['latitude'])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
            continue
        locators.append({'id': c['id'], 'name': c['name'], 'point': project(lon, lat),
                         'capital': c['capitalCity'], 'coordinates': [lon, lat]})
    payload = {'schemaVersion': 1, 'width': 1000, 'height': 520, 'projection': 'Equal Earth',
               'preparedAt': datetime.now(timezone.utc).isoformat(), 'sourceCommit': COMMIT,
               'sources': {'boundaries': BOUNDARIES, 'locations': COUNTRIES, 'projection': PROJECTION},
               'notes': 'Natural Earth 1:110m country polygons, Antarctica omitted. Locator circles mark economies absent from this generalized boundary layer; their positions use World Bank capital coordinates. Kosovo code KOS is matched to World Bank XKX. Boundaries do not imply endorsement.',
               'features': features, 'locators': locators}
    target = ROOT / 'web/data/world-map.json'
    all_locations = mapped | {p['id'] for p in locators}
    notebook = json.loads((ROOT / 'web/data/notebook-findings.json').read_text())
    missing = {r['country_code'] for rows in notebook['tables'].values() for r in rows if 'country_code' in r} - all_locations
    if missing:
        raise ValueError(f'Unlocated notebook countries: {sorted(missing)}')
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(features)} polygons, {len(locators)} capital locators, {len(all_locations)} World Bank locations; all notebook countries located.')


if __name__ == '__main__':
    main()
