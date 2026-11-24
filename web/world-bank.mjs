/** World Bank Indicators v2 client. Browser ES module; Node 20+ for local use. */
export function createWorldBankClient({
  fetchImpl = globalThis.fetch.bind(globalThis),
  perPage = 1000,
  timeoutMs = 60000,
  retries = 2,
  cacheMs = 300000
} = {}) {
  const base = "https://api.worldbank.org/v2/";
  const cache = new Map();
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once: true});
  });

  function urlFor(path, params = {}) {
    if (!path || /^(https?:|\/)/i.test(path) || path.includes("..")) {
      throw new Error("Use a relative World Bank v2 endpoint path");
    }
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    url.searchParams.set("format", "json");
    if (url.href.length > 4000 || url.pathname.split("/").some(s => s.length > 1500)) {
      throw new Error("Split this query: API URL or path segment limit exceeded");
    }
    return url.href;
  }

  async function request(path, params = {}, {signal} = {}) {
    signal?.throwIfAborted();
    const url = urlFor(path, params);
    const hit = cache.get(url);
    if (hit && Date.now() - hit.time < cacheMs) return structuredClone(hit.result);
    let payload;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal?.addEventListener("abort", abort, {once: true});
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error(`World Bank request timed out after ${timeoutMs / 1000}s: ${url}`));
      }, timeoutMs);
      try {
        const response = await fetchImpl(url, {signal: controller.signal});
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          const header = response.headers.get("retry-after");
          const seconds = header === null ? NaN : Number(header);
          const delay = Number.isFinite(seconds) ? seconds * 1000
            : header ? Date.parse(header) - Date.now() : NaN;
          await response.body?.cancel();
          clearTimeout(timer);
          await pause(Math.min(30000, Math.max(0, Number.isFinite(delay) ? delay : 500 * 2 ** attempt)), signal);
          continue;
        }
        if (!response.ok) throw new Error(`World Bank HTTP ${response.status}: ${url}`);
        payload = await response.json();
        break;
      } catch (error) {
        // Retry our deadline; user cancellation, invalid JSON, and other errors surface immediately.
        if (timedOut && !signal?.aborted && attempt < retries) {
          await pause(Math.min(500 * 2 ** attempt, 30000), signal);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    }
    const messages = Array.isArray(payload) ? payload[0]?.message : payload?.message;
    if (messages) {
      throw new Error(`World Bank API: ${JSON.stringify(messages)} (${url})`);
    }
    const result = {payload, url, retrievedAt: new Date().toISOString()};
    if (cacheMs > 0) cache.set(url, {time: Date.now(), result: structuredClone(result)});
    return result;
  }

  /** Standard list and country/indicator endpoints only; metadata uses request(). */
  async function getAll(path, params = {}, {signal} = {}) {
    const {page: ignoredPage, per_page: requestedSize, ...filters} = params;
    const size = Number(requestedSize ?? perPage);
    if (!Number.isInteger(size) || size < 1) throw new Error("per_page must be a positive integer");
    const rows = [], requests = [];
    let meta, retrievedAt, expectedPages, expectedTotal;
    for (let page = 1; ; page++) {
      const result = await request(path, {...filters, per_page: size, page}, {signal});
      const body = result.payload;
      if (!Array.isArray(body) || !body[0] || !(Array.isArray(body[1]) || body[1] === null)) {
        throw new Error("Expected [pagination, rows]; use request() for metadata/advanced endpoints");
      }
      const [header, records] = body;
      const pages = Number(header.pages), total = Number(header.total);
      if (!Number.isInteger(pages) || pages < 0 || !Number.isInteger(total) || total < 0
          || Number(header.page) !== page) throw new Error("Invalid pagination header");
      if (page === 1) {
        meta = header; retrievedAt = result.retrievedAt;
        expectedPages = pages; expectedTotal = total;
      } else if (pages !== expectedPages || total !== expectedTotal) {
        throw new Error("Catalog changed during pagination; refresh and retry");
      }
      rows.push(...(records ?? [])); requests.push(result.url);
      if (page >= pages) break;
      if (!records?.length) throw new Error("Empty page before end of results");
    }
    if (rows.length !== expectedTotal) throw new Error(`Incomplete result: ${rows.length}/${expectedTotal} rows`);
    return {rows, meta, requests, retrievedAt};
  }

  async function observations({source, indicators, countries = "all", date, ...params}, options = {}) {
    if (!/^\d+$/.test(String(source))) throw new Error("An explicit numeric source ID is required");
    const codes = Array.isArray(indicators) ? indicators : String(indicators ?? "").split(";");
    const places = Array.isArray(countries) ? countries : String(countries).split(";");
    if (!codes.length || codes.length > 60 || codes.some(x => !/^[A-Za-z0-9_.-]+$/.test(x))) {
      throw new Error("Supply 1–60 valid indicator codes from one source");
    }
    if (places.some(x => !/^[A-Za-z0-9_-]+$/.test(x))) throw new Error("Invalid country selector");
    const result = await getAll(`country/${places.join(";")}/indicator/${codes.join(";")}`,
      {...params, source, date}, options);
    return {...result, source: String(source), rows: result.rows.map(row => ({
      sourceId: String(source),
      indicatorId: row.indicator.id,
      observationLabel: row.indicator.value,
      countryId: row.country.id,
      iso3: row.countryiso3code,
      country: row.country.value,
      period: row.date,
      year: /^\d{4}$/.test(row.date) ? Number(row.date) : null,
      value: row.value,
      unit: row.unit,
      observationStatus: row.obs_status,
      decimal: row.decimal,
      footnote: row.footnote ?? null
    }))};
  }

  return {request, getAll, observations, urlFor, clearCache: () => cache.clear()};
}

/** Retains actual observation years; all-null groups are omitted. Annual data only. */
export function latestNonNull(rows, {minYear = -Infinity, maxYear = Infinity} = {}) {
  const result = new Map();
  for (const row of rows) {
    if (row.value === null || row.value === undefined || !Number.isInteger(row.year)
        || row.year < minYear || row.year > maxYear) continue;
    const key = JSON.stringify([row.sourceId, row.iso3 || row.countryId, row.indicatorId]);
    if (!result.has(key) || row.year > result.get(key).year) result.set(key, row);
  }
  return [...result.values()];
}
