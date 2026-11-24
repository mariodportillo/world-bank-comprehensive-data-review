export function latestRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (row.value === null || !Number.isInteger(row.year)) continue;
    const key = JSON.stringify([row.sourceId, row.indicatorId, row.iso3]);
    if (!byKey.has(key) || row.year > byKey.get(key).year) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a,b) => a.country.localeCompare(b.country));
}

export function csvFor(rows, provenance) {
  const cell = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  const fields = ['sourceId','indicatorId','country','iso3','year','value','footnote','retrievedAt','sourceUpdated'];
  return [fields, ...rows.map(row => fields.map(key => key === 'retrievedAt' ? provenance.retrievedAt : key === 'sourceUpdated' ? provenance.meta.lastupdated : row[key]))]
    .map(row => row.map(cell).join(',')).join('\r\n');
}

export function readSelection(search, validSources, validCountries) {
  const source = search.get('source') ?? '2';
  const indicator = search.get('indicator') ?? 'SE.PRM.CMPT.ZS';
  const countries = (search.get('countries') ?? 'MEX,CAN').split(',');
  const start = Number(search.get('start') ?? 2010), end = Number(search.get('end') ?? 2025);
  if (!validSources.has(source) || !/^[\w.-]+$/.test(indicator)
      || !countries.length || countries.length > 8 || countries.some(c => !validCountries.has(c))
      || !Number.isInteger(start) || !Number.isInteger(end) || start < 1800 || end > 2100 || end < start) {
    throw new Error('Choose a database, an indicator, 1–8 countries, and a valid year range.');
  }
  return {source, indicator, countries: [...new Set(countries)], start, end};
}
