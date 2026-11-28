# World Bank Comprehensive Data Review

An interactive, guided investigation of education investment, literacy and access to schooling, developed from Mario Portillo’s CS145 research notebook. The site follows three questions before opening an optional comparison workspace:

1. Where is youth literacy highest, and what do those countries spend on education?
2. Where is adult literacy lowest?
3. Where do spending above 4% of GDP and no schooling above 10% coexist? Readers can move both thresholds.

- [Published website](https://mariodportillo.github.io/world-bank-comprehensive-data-review/)
- [Source repository](https://github.com/mariodportillo/world-bank-comprehensive-data-review)

The website uses the public **World Bank Indicators API v2**. It does not use BigQuery, credentials, an API key, a paid database or an application server. BigQuery appears only in the provenance of the notebook’s saved results.

## Run locally

Use Node.js 20 or later. There are no npm dependencies.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Select countries in the story charts, use the top-five country buttons, or move the schooling/spending sliders. **Follow this country’s history** opens a detailed comparison with a linked scatterplot, country rankings, an observation history and coverage counts. It supports region filters, a custom period, a minimum matched-year count, a single common year, country search and CSV export. The URL records changes to this comparison; section navigation retains those settings. The guided story keeps its stated 2000–2025 window independently of the comparison controls.

The original general explorer remains at `web/explorer.html`, linked as **Indicator library**. It contains 12,537 definitions across EdStats, WDI, Gender Statistics, Education Policy, Human Capital Index and historical Global Partnership for Education. Those are full catalogs of selected databases, including contextual measures; they are not an exhaustive inventory of every World Bank product. That catalog was retrieved October 29, 2026 and can be refreshed per database in the browser.

## Measures and coverage

The main story uses these four indicators, with source identity preserved:

| Measure | Code | Database | Non-missing observations in saved extract |
| --- | --- | --- | --- |
| Education expenditure, % GDP | `SE.XPD.TOTL.GD.ZS` | WDI, source 2 | 4,053 |
| Youth literacy, ages 15–24 | `SE.ADT.1524.LT.ZS` | WDI, source 2 | 1,162 |
| Adult literacy, ages 15+ | `SE.ADT.LITR.ZS` | WDI, source 2 | 1,013 |
| Barro-Lee no education, ages 15+ | `BAR.NOED.15UP.ZS` | EdStats, source 12 | 720 |

The saved API extract was retrieved **November 28, 2026** and covers 1990–2025. Literacy observations end in 2024; Barro-Lee schooling observations end in 2010. WDI reports a November 11, 2026 database update; EdStats reports June 25, 2024. A database update date is not the observation year. Six other measures from the notebook are linked to the full explorer, including no education at ages 25+, youth population cohorts and mortality.

The site reads a compact, genuine API extract in `web/data/research.json` at startup. This avoids making first render depend on upstream response time. **Refresh from API** explicitly updates all four observation series for 1990–2025 during the browser session. The current extract stays visible until every request succeeds. Cancellation or failure retains it. Definitions and the country catalog keep their separately disclosed saved retrieval date. A session refresh is not persisted to the repository.

To regenerate the saved extract and its definitions/catalog, use Python 3 (standard library only):

```sh
python3 scripts/refresh-research.py
```

The script requests source-specific indicator definitions, country metadata, database metadata and all observation pages; it validates totals, finite values and unique country/year keys before writing a complete payload. Exact request URLs and update dates are saved. The browser client uses a 60-second deadline per attempt, retries timeouts and HTTP 429/5xx responses at most twice, and never retries user cancellation. The library explorer caches completed requests for five minutes; an explicit research refresh clears that cache.

## Analysis choices

For each country, join education spending to the outcome on **country AND year**, restrict to the requested window, and average each measure over that exact same set of non-missing years. No interpolation or zero filling is used; reported zero remains valid. The default minimum is one matched year, and every comparison discloses counts and actual dates. Countries can contribute different years in average mode. **One common year** requires both observations in a shared date.

Country and economy entries are included; aggregate regions and income groups are excluded. Pearson’s r gives each eligible country equal weight and uses every dot before ranking or threshold highlighting. It is undefined for fewer than three countries or a constant measure. Rankings use unrounded values and country names break exact ties for display. Thresholds use strictly greater-than comparisons. The schooling view can show adult literacy context from the pair’s matched years; missing adult context does not exclude an otherwise eligible country.

These comparisons are descriptive, not causal. They do not control for income, demographic differences, time lags or reporting bias. Budget shares are not spending per student or education quality. Adult schooling attainment and illiteracy are distinct measures, not complements.

CSV exports contain all eligible analytical rows, exact matched years/counts, optional adult context dates, threshold status, comparison settings, source IDs, source update dates and retrieval timestamps. Values retain full precision rather than display rounding.

## Notebook provenance

`web/data/notebook-findings.json` contains only the notebook’s saved public-data results: top-five youth literacy (cell 59), youth correlation (61), bottom-ten adult literacy (65), adult correlation (67), and the 35-country threshold result (71). The original notebook, assignment instructions, account configuration, authentication cells and embedded images are not published.

The main notebook queries average each series over all its available years and then join countries. Their historical correlation results (0.3079 and 0.3005) and 35 threshold matches are shown separately from fresh API results. The original extract date and full contributing year ranges are not established by those result tables. They are not a current-data benchmark. Different vintages, time windows, same-year matching and optional adult context explain why the site’s results need not reproduce those numbers.

## Files and validation

- `web/index.html`, `research.css`, `research-app.mjs`: guided story and comparison interactions.
- `web/analysis.mjs`: pure matched-year analysis, correlation, state validation and analytical CSV.
- `web/world-bank.mjs`: shared source-specific, paginated API client.
- `web/explorer.html`, `app.mjs`, `styles.css`, `data-utils.mjs`: general indicator library/explorer.
- `scripts/refresh-research.py`: reproducible public-data snapshot pull.

```sh
npm run check
npm test
```

All 23 tests cover the API client, null/zero preservation, pagination, cancellation, timeouts, country/year joins, thresholds, optional context, correlation, coverage, URL settings, CSV provenance and saved data integrity. Browser checks are recorded in `VERIFICATION.md`.

## Publishing

GitHub Pages deploys `web/` on pushes to `main` through `.github/workflows/pages.yml`, after running the checks and tests. Pages uses GitHub Actions as its publishing source. Assets and data links are relative so the repository project path works without a bundler or base-path rewrite. Only the website repository’s files are published, not its parent research workspace.

## Sources

- [World Bank developer documentation](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589-developer-information)
- [API basic call structures](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
- [World Bank EdStats catalog](https://datacatalog.worldbank.org/search/dataset/0038480/education-statistics)
- [Youth literacy](https://data.worldbank.org/indicator/SE.ADT.1524.LT.ZS)
- [Adult literacy](https://data.worldbank.org/indicator/SE.ADT.LITR.ZS)
- [Education spending](https://data.worldbank.org/indicator/SE.XPD.TOTL.GD.ZS)

Full indicator definitions and original producers are retained in the extract and visible on the site. Check individual source licenses when redistributing extracts. This is an independent research project and is not affiliated with the World Bank.
