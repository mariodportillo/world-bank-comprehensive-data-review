# World Bank Comprehensive Data Review

A standalone interactive website using the World Bank Indicators API. GitHub Pages serves the files in `web/`; the visitor's browser requests public data directly from `https://api.worldbank.org/v2/`. The notebook at https://observablehq.com/d/c304524d9309cd1a uses this same API. BigQuery is not part of this implementation.

- Website: https://mariodportillo.github.io/world-bank-comprehensive-data-review/
- Source repository: https://github.com/mariodportillo/world-bank-comprehensive-data-review

This is a functional starting point for the site's data interactions. The visual design and analytical views can evolve without changing the hosting setup.

## Run locally

Use Node.js 20 or later. There are no npm dependencies to install.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Choose a database, search for an indicator, select up to eight countries, set the year range, and press **Explore data**. The URL records the selected view so it can be bookmarked or shared. Hover or focus a chart point for its country, year and value. Switch the table between latest available values and every observation. CSV downloads retain missing cells, source identity, reporting years, footnotes, retrieval time, and database update date.

The initial comparison matches the notebook: WDI primary completion, Mexico and Canada, 2010–2025. A missing Canada series does not imply a zero rate. Country comparisons exclude aggregate regions.

## Data discovery and retrieval

The saved catalog contains 12,537 indicator definitions across EdStats, WDI, Gender Statistics, Education Policy, Human Capital Index and historical Global Partnership for Education. These are full catalogs of selected databases, including contextual measures, rather than a complete inventory of every World Bank data product. The metadata snapshot was retrieved on October 29, 2026. Use **Refresh this database's indicators** to update a selected list during a session. Observations and the selected indicator's full definition are requested live when a comparison runs.

Requests paginate and validate row counts. The client caches completed responses for five minutes. Timeouts use a 60-second deadline per attempt and retry at most twice; HTTP 429 and 5xx responses are also retried with bounded waits. User cancellation is not retried. After a failed request the user can explicitly load the saved October 29 example, which is clearly labeled and resets the controls to match that example.

Missing values remain null and break chart lines. Latest-value tables preserve each country's actual reporting year. Labels and definitions come from source-specific indicator metadata because some EdStats observation labels contain notes. Values above 100 are permitted when the indicator's denominator allows them.

The source catalogs were prepared in the parent research project. Everything needed to run this website is inside this folder. It can be a dedicated repository without publishing the research files, Python environment, proposal, or personal configuration from its parent folder.

## GitHub Pages deployment

Repository name: `world-bank-comprehensive-data-review`.

1. Add this folder's contents to that dedicated repository, on its `main` branch.
2. In repository Settings → Pages, select **GitHub Actions** as the publishing source.
3. The included `.github/workflows/pages.yml` checks the JavaScript and tests, then uploads only `web/` and deploys it to Pages.

The project-site URL is `https://mariodportillo.github.io/world-bank-comprehensive-data-review/`. Every local asset uses a relative URL, so the repository path works without a bundler, custom domain, or base-path rewrite. All data requests are public API reads and need no API key, paid database, or application server.

## Checks

```sh
npm run check
npm test
```

The tests check pagination, error envelopes, nulls and zero, metadata envelopes, timeout retry, user cancellation, source-aware latest-year selection, CSV escaping, and query validation. Browser verification is recorded separately in `VERIFICATION.md` after testing.

## Sources

- [World Bank developer documentation](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589-developer-information)
- [World Bank EdStats catalog](https://datacatalog.worldbank.org/search/dataset/0038480/education-statistics)
- [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Indicator definitions retain the original producer and dataset notes through the live source details. Check each source's license and attribution requirements when redistributing extracts. This project is an independent explorer and is not an official World Bank product.
