"""Refresh the dashboard's public API snapshot. Python standard library only."""
import concurrent.futures
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
START, END = 1990, 2025
METRICS = {
    'spending': ('2', 'SE.XPD.TOTL.GD.ZS', 'Education spending', '% of GDP'),
    'youth': ('2', 'SE.ADT.1524.LT.ZS', 'Youth literacy', '% of ages 15–24'),
    'adult': ('2', 'SE.ADT.LITR.ZS', 'Adult literacy', '% of ages 15+'),
    'noSchool': ('12', 'BAR.NOED.15UP.ZS', 'No schooling', '% of ages 15+'),
}


def fetch_all(path, **params):
    rows, urls, header = [], [], None
    page = 1
    while True:
        url = 'https://api.worldbank.org/v2/' + path + '?' + urllib.parse.urlencode(
            {**params, 'format': 'json', 'per_page': 10000, 'page': page})
        for attempt in range(2):
            try:
                with urllib.request.urlopen(url, timeout=60) as response:
                    body = json.load(response)
                break
            except (urllib.error.URLError, TimeoutError):
                if attempt:
                    raise
                time.sleep(1)
        if not isinstance(body, list) or len(body) != 2:
            raise RuntimeError(f'Unexpected API response: {str(body)[:250]}: {url}')
        meta, records = body
        if header is None:
            header = meta
        if int(meta['total']) != int(header['total']):
            raise RuntimeError('Data changed during pagination; rerun the refresh')
        rows.extend(records or [])
        urls.append(url)
        print(f'{path}: page {page}/{meta["pages"]}', flush=True)
        if page >= int(meta['pages']):
            break
        page += 1
    if len(rows) != int(header['total']):
        raise RuntimeError(f'Incomplete result: {len(rows)} / {header["total"]}')
    return {'rows': rows, 'requests': urls, 'meta': header}


def main():
    countries_result = fetch_all('country')
    countries = [{'id': c['id'], 'name': c['name'], 'region': c['region']['value'],
                  'regionId': c['region']['id'], 'income': c['incomeLevel']['value']}
                 for c in countries_result['rows'] if c['region']['id'] != 'NA']
    country_ids = {c['id'] for c in countries}
    jobs = {
        'wdi': ('country/all/indicator/' + ';'.join(v[1] for v in METRICS.values() if v[0] == '2'), {'source': 2, 'date': f'{START}:{END}'}),
        'attainment': ('country/all/indicator/BAR.NOED.15UP.ZS', {'source': 12, 'date': f'{START}:{END}'}),
        'sources': ('sources/2;12', {}),
        **{key + '_definition': ('indicator/' + cfg[1], {'source': cfg[0]}) for key, cfg in METRICS.items()},
    }
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(fetch_all, path, **params): key for key, (path, params) in jobs.items()}
        for future in concurrent.futures.as_completed(pending):
            results[pending[future]] = future.result()
    sources = results['sources']['rows']
    metrics = {}
    for key, (source, code, label, unit) in METRICS.items():
        definition = next(d for d in results[key + '_definition']['rows'] if d['source']['id'] == source)
        result = results['wdi' if source == '2' else 'attainment']
        rows = [[r['countryiso3code'], int(r['date']), r['value']] for r in result['rows']
                if r['indicator']['id'] == code and r['countryiso3code'] in country_ids
                and r['value'] is not None and str(r['date']).isdigit()]
        if not rows or not all(math.isfinite(row[2]) for row in rows):
            raise RuntimeError(f'No usable finite observations for {code}')
        if len({(r[0], r[1]) for r in rows}) != len(rows):
            raise RuntimeError(f'Duplicate country/year observations for {code}')
        metrics[key] = {'code': code, 'sourceId': source, 'label': label, 'unit': unit,
                        'name': definition['name'], 'definition': definition.get('sourceNote', ''),
                        'producer': definition.get('sourceOrganization', ''), 'sourceUpdated': result['meta'].get('lastupdated'),
                        'firstYear': min(r[1] for r in rows), 'lastYear': max(r[1] for r in rows),
                        'rows': sorted(rows)}
    retrieved_at = datetime.now(timezone.utc).isoformat()
    payload = {'schemaVersion': 1, 'retrievedAt': retrieved_at, 'metadataRetrievedAt': retrieved_at,
               'interval': {'start': START, 'end': END}, 'countries': countries, 'sources': sources,
               'metrics': metrics, 'requests': countries_result['requests'] +
               [url for result in results.values() for url in result['requests']]}
    target = ROOT / 'web/data/research.json'
    target.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
    print('Saved', target, {k: len(v['rows']) for k, v in metrics.items()}, flush=True)


if __name__ == '__main__':
    main()
