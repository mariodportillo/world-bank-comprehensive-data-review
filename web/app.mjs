import {createWorldBankClient} from './world-bank.mjs';
import {latestRows, csvFor, readSelection} from './data-utils.mjs';

const $ = id => document.getElementById(id);
const client = createWorldBankClient({timeoutMs: 60000, retries: 2});
const colors = ['#2b668d','#c08343','#5e8b6d','#a26080','#796ba0','#429998','#b06759','#76863e'];
const number = new Intl.NumberFormat('en', {maximumFractionDigits: 3});
const option = (value, label) => new Option(label, value);
let catalog, countries, displayed, pending, queryVersion = 0;

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').dataset.kind = kind;
}

function renderIndicatorChoices(preferred) {
  const needle = $('search').value.trim().toLocaleLowerCase();
  const matches = catalog.indicators.filter(d => d.sourceId === $('source').value && `${d.id} ${d.name}`.toLocaleLowerCase().includes(needle));
  // Keep every matching choice selectable; native select avoids creating a custom combobox.
  $('indicator').replaceChildren(...matches.map(d => option(d.id, d.name)));
  if (matches.some(d => d.id === preferred)) $('indicator').value = preferred;
  $('match-count').textContent = `${matches.length.toLocaleString()} matches`;
  $('apply').disabled = !matches.length;
}

function selection() {
  const params = new URLSearchParams({source: $('source').value, indicator: $('indicator').value,
    countries: [...$('countries').selectedOptions].map(d => d.value).join(','),
    start: $('start-year').value, end: $('end-year').value});
  return readSelection(params, new Set(catalog.sources.map(d => d.id)), new Set(countries.map(d => d.id)));
}

function setControls(value) {
  $('source').value = value.source;
  $('search').value = '';
  renderIndicatorChoices(value.indicator);
  for (const opt of $('countries').options) opt.selected = value.countries.includes(opt.value);
  showSelectedCountries();
  $('start-year').value = value.start;
  $('end-year').value = value.end;
}

function showSelectedCountries() {
  $('selected-countries').textContent = `Selected: ${[...$('countries').selectedOptions].map(d => d.textContent).join(', ') || 'none'}`;
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function svgElement(tag, attrs = {}, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

function drawChart(result) {
  $('chart').replaceChildren(); $('legend').replaceChildren();
  const valid = result.rows.filter(r => r.value !== null && Number.isFinite(r.value) && Number.isInteger(r.year));
  if (!valid.length) { $('chart').append(element('p', 'No observations are available for this selection.', 'empty')); return; }
  const width = 800, height = 290, margin = {left: 52, right: 18, top: 18, bottom: 32};
  const years = result.selection;
  const min = Math.min(...valid.map(r => r.value)), max = Math.max(...valid.map(r => r.value));
  const pad = (max - min || Math.max(Math.abs(max), 1)) * .12;
  const lo = min - pad, hi = max + pad;
  const x = year => margin.left + (year - years.start) / (years.end - years.start || 1) * (width - margin.left - margin.right);
  const y = value => height - margin.bottom - (value - lo) / (hi - lo) * (height - margin.top - margin.bottom);
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${result.definition.name}, ${years.start} to ${years.end}`});
  for (let i = 0; i <= 4; i++) {
    const value = lo + (hi - lo) * i / 4;
    svg.append(svgElement('line', {x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), stroke: '#e8edf2'}));
    svg.append(svgElement('text', {x: margin.left - 10, y: y(value) + 3, 'text-anchor': 'end'}, number.format(value)));
  }
  const ticks = Math.min(5, years.end - years.start || 1);
  for (let i = 0; i <= ticks; i++) {
    const year = Math.round(years.start + (years.end - years.start) * i / ticks);
    if (i && year === years.start) continue;
    svg.append(svgElement('text', {x: x(year), y: height - 6, 'text-anchor': 'middle'}, String(year)));
  }
  result.selection.countries.forEach((country, index) => {
    const rows = result.rows.filter(r => r.iso3 === country).sort((a,b) => a.year - b.year);
    const color = colors[index % colors.length];
    const name = countries.find(c => c.id === country)?.name || country;
    const legend = element('span', undefined, 'legend-item');
    const dot = element('span', undefined, 'legend-dot'); dot.style.background = color;
    legend.append(dot, document.createTextNode(name)); $('legend').append(legend);
    let path = '', previous;
    for (const row of rows) {
      if (row.value === null || !Number.isInteger(row.year)) { previous = undefined; continue; }
      path += `${previous && row.year === previous.year + 1 ? 'L' : 'M'}${x(row.year)},${y(row.value)} `;
      previous = row;
    }
    svg.append(svgElement('path', {d: path, fill: 'none', stroke: color, 'stroke-width': 2}));
    for (const row of rows.filter(r => r.value !== null && Number.isInteger(r.year))) {
      const dot = svgElement('circle', {cx: x(row.year), cy: y(row.value), r: 3, fill: color, tabindex: 0});
      dot.append(svgElement('title', {}, `${name} · ${row.year}: ${number.format(row.value)}`)); svg.append(dot);
    }
  });
  $('chart').append(svg);
}

function renderTable() {
  if (!displayed) return;
  const all = $('all-observations').checked;
  const rows = all ? [...displayed.rows].sort((a,b) => a.country.localeCompare(b.country) || b.year - a.year) : latestRows(displayed.rows);
  $('table-title').textContent = all ? 'Every observation in this period' : 'Latest available in this period';
  const body = rows.map(row => {
    const tr = document.createElement('tr');
    for (const value of [row.country, row.year, row.value === null ? 'Missing' : number.format(row.value)]) tr.append(element('td', value));
    return tr;
  });
  if (!body.length) { const tr = document.createElement('tr'); const td = element('td', 'No non-null observations in this selection.'); td.colSpan = 3; tr.append(td); body.push(tr); }
  $('table-body').replaceChildren(...body);
}

function renderResult(result, saved = false) {
  displayed = result;
  $('result-content').hidden = false;
  $('error').hidden = true; $('saved-example').hidden = true;
  $('source-label').textContent = result.sourceName;
  $('indicator-title').textContent = result.definition.name;
  $('indicator-code').textContent = result.definition.id;
  $('definition').textContent = result.definition.sourceNote || 'See the source metadata for the definition of this measure.';
  const nonNull = result.rows.filter(r => r.value !== null);
  const summary = [[String(result.selection.countries.length), 'Countries selected'], [nonNull.length.toLocaleString(), 'Reported observations'],
    [`${result.selection.start}–${result.selection.end}`, 'Selected period']];
  $('summary').replaceChildren(...summary.map(([value, label]) => {
    const box = element('div'); box.append(element('span', value, 'stat-number'), element('span', label, 'stat-label')); return box;
  }));
  drawChart(result); renderTable();
  const present = new Set(nonNull.map(r => r.iso3));
  const missing = result.selection.countries.filter(c => !present.has(c)).map(c => countries.find(d => d.id === c)?.name || c);
  $('missing-note').textContent = missing.length ? `No reported values in this selection for ${missing.join(', ')}. A missing observation is not zero.` : 'Latest reported years can differ between countries.';
  $('producer').textContent = `Original source: ${result.definition.sourceOrganization || result.sourceName}`;
  $('retrieved').textContent = `Database updated: ${result.meta.lastupdated || 'not supplied'}. Retrieved: ${new Date(result.retrievedAt).toLocaleString()}.`;
  $('request-links').replaceChildren(...result.requests.map(url => {
    const li = document.createElement('li'), a = element('a', url); a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; li.append(a); return li;
  }));
  status(saved ? `Saved World Bank example · Retrieved ${new Date(result.retrievedAt).toLocaleDateString()}` : 'Live World Bank API · Request complete', saved ? 'saved' : 'live');
}

async function runQuery() {
  let chosen;
  try { chosen = selection(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; return; }
  pending?.abort(); pending = new AbortController();
  const ownVersion = ++queryVersion;
  $('results').setAttribute('aria-busy', 'true'); $('cancel').hidden = false;
  $('error').hidden = true; $('saved-example').hidden = Boolean(displayed);
  status('Requesting observations from the World Bank…');
  const params = new URLSearchParams({source: chosen.source, indicator: chosen.indicator, countries: chosen.countries.join(','), start: chosen.start, end: chosen.end});
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
  try {
    const [panel, definitions] = await Promise.all([
      client.observations({source: chosen.source, countries: chosen.countries, indicators: chosen.indicator,
        date: `${chosen.start}:${chosen.end}`, footnote: 'y'}, {signal: pending.signal}),
      client.getAll(`indicator/${chosen.indicator}`, {source: chosen.source}, {signal: pending.signal})
    ]);
    if (ownVersion !== queryVersion) return;
    const definition = definitions.rows.find(r => r.source.id === chosen.source);
    if (!definition) throw new Error('The selected indicator is unavailable in this database. Refresh its indicator list.');
    renderResult({...panel, requests: [...panel.requests, ...definitions.requests], definition, selection: chosen,
      sourceName: catalog.sources.find(s => s.id === chosen.source).name});
  } catch (error) {
    if (ownVersion !== queryVersion) return;
    if (pending.signal.aborted) status('Request canceled. Adjust your selection or explore again.');
    else {
      status('The data request could not be completed.');
      $('error').textContent = `${error.message} You can retry Explore data or load the saved example below.`;
      $('error').hidden = false; $('saved-example').hidden = false;
    }
  } finally {
    if (ownVersion === queryVersion) { $('results').setAttribute('aria-busy', 'false'); $('cancel').hidden = true; }
  }
}

$('query-form').addEventListener('submit', event => { event.preventDefault(); runQuery(); });
$('source').addEventListener('change', () => { $('search').value = ''; renderIndicatorChoices(); });
$('search').addEventListener('input', () => renderIndicatorChoices($('indicator').value));
$('countries').addEventListener('change', showSelectedCountries);
$('cancel').addEventListener('click', () => pending?.abort());
$('all-observations').addEventListener('change', renderTable);
$('download').addEventListener('click', () => {
  if (!displayed) return;
  const blob = new Blob([csvFor(displayed.rows, displayed)], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${displayed.definition.id}-${displayed.selection.start}-${displayed.selection.end}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('saved-example').addEventListener('click', async () => {
  pending?.abort(); queryVersion++;
  const result = await fetch(new URL('./data/example.json', import.meta.url)).then(r => r.json());
  const selection = {source: '2', indicator: 'SE.PRM.CMPT.ZS', countries: ['MEX','USA'], start: 2020, end: 2025};
  setControls(selection);
  const params = new URLSearchParams({source:selection.source, indicator:selection.indicator, countries:selection.countries.join(','), start:selection.start, end:selection.end});
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
  renderResult({...result, selection, sourceName: 'World Development Indicators'}, true);
  $('results').setAttribute('aria-busy', 'false'); $('cancel').hidden = true;
});
$('refresh-catalog').addEventListener('click', async () => {
  const source = $('source').value, button = $('refresh-catalog'); button.disabled = true;
  status('Refreshing indicator definitions from the World Bank…');
  try {
    const result = await client.getAll('indicator', {source, per_page: 10000});
    catalog.indicators = catalog.indicators.filter(d => d.sourceId !== source).concat(result.rows.map(d => ({sourceId: source, id: d.id, name: d.name})));
    if ($('source').value === source) renderIndicatorChoices($('indicator').value);
    $('catalog-note').textContent = `Selected database’s catalog refreshed ${new Date(result.retrievedAt).toLocaleDateString()}. Other database lists retain their saved dates.`;
    status('Indicator definitions refreshed. Apply your selection to request observations.');
  } catch (error) { $('error').hidden = false; $('error').textContent = error.message; }
  finally { button.disabled = false; }
});

try {
  [catalog, countries] = await Promise.all(['catalog','countries'].map(name => fetch(new URL(`./data/${name}.json`, import.meta.url)).then(r => {
    if (!r.ok) throw new Error(`Could not load ${name}.`); return r.json();
  })));
  $('source').replaceChildren(...catalog.sources.map(d => option(d.id, d.name)));
  $('countries').replaceChildren(...[...countries].sort((a,b) => a.name.localeCompare(b.name)).map(d => option(d.id, d.name)));
  let initial;
  try { initial = readSelection(new URLSearchParams(location.hash.slice(1)), new Set(catalog.sources.map(d => d.id)), new Set(countries.map(d => d.id))); }
  catch { initial = {source:'2', indicator:'SE.PRM.CMPT.ZS', countries:['MEX','CAN'], start:2010, end:2025}; }
  setControls(initial);
  $('catalog-note').textContent = `${catalog.indicators.length.toLocaleString()} indicator definitions across ${catalog.sources.length} databases. Catalog snapshot: ${new Date(catalog.retrievedAt).toLocaleDateString()}. Observations are requested live.`;
  runQuery();
} catch (error) {
  $('results').setAttribute('aria-busy', 'false'); status('Unable to initialize the explorer.');
  $('error').textContent = error.message; $('error').hidden = false;
}
