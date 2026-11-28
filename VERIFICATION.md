# Verification

## Notebook findings and CS448B article revision — November 28, 2026

- All 32 automated tests and JavaScript syntax checks pass. Both Python scripts pass syntax checks.
- The default article now uses the exact saved notebook outputs. Browser checks confirmed Uzbekistan 99.98% youth literacy / 5.95% GDP spending, Somalia 5.40% adult literacy / 1.23% GDP spending, correlations 0.3079 (192 country-code groups) and 0.3005 (194), and all 35 threshold rows. The five and ten saved spending averages produce 4.700% and 2.369% respectively.
- The original correlation SQL does not explicitly filter regional aggregates; counts are therefore labeled as country-code groups and exact membership is not asserted. Full-sample correlations are read from the saved query outputs, not recalculated from the short ranked subsets. The missing full-sample inputs and unknown notebook extraction/year coverage are disclosed.
- Switching the article to API mode changed youth correlation to approximately 0.2598 with 147 eligible countries and the threshold view to 21 matches among 124. Switching back restored the 35 saved notebook rows. API history is explicitly labeled as a different analysis when opening a notebook country.
- The main article now uses three distinct forms: a scatterplot, reorderable bar chart and country-by-indicator heatmap. The youth axis toggled between 99.8–100% and the full 0–100%. Reordering the adult cohort by spending put Burkina Faso first without changing the ten countries. Sorting the notebook heatmap by spending put Zimbabwe first at 9.05% GDP.
- Raising the notebook spending cutoff from 4% to 4.5% changed matches from 35 to 26. Searching for Mexico produced no passing row at that cutoff; showing all saved rows exposed Mexico’s exact 4.27 / 18.44 / 92.46 values and a below-cutoff label. No new countries were invented when cutoffs were lowered.
- All 26 saved result tables (884 rows) were extracted without executing notebook code. Automated checks match the five core archived outputs against the existing findings file. Both RANK and ROW_NUMBER outputs, the 35-row main result and the later ten-row example are retained.
- Browser checks confirmed 35 archived rows for cell 71, the zero-row duplicate-key result for cell 20, and the correct ROW_NUMBER SQL after opening its disclosure. SQL is displayed as inert text and is never executed.
- Comparison bookmarks retain both story source/threshold/sort settings and API country/year settings. Selecting Uzbekistan from the notebook opens the labeled API workspace with that country selected.
- Desktop checks at 1280 pixels and phone-sized checks at 390 pixels showed no page overflow. The mobile heatmap fit its container (321 pixels) without hidden horizontal columns; controls and exact values were visually inspected. The viewport override was reset afterward. CSV serialization preserves original decimal strings, SQL-result columns and country names; native file-save behavior remains outside the independently verified checks.
- The linked CS448B brief was reviewed directly. The website implements its visual-explainer direction and three-chart interaction requirement. Novelty review, the short video and course submission remain separate work.

## Guided narrative revision — November 28, 2026

- JavaScript syntax checks and all 23 automated tests pass with Node.js 20.14.0. The Python snapshot script also passes a syntax check.
- Pulled the real World Bank API extract with `scripts/refresh-research.py`: 6,948 non-missing observations across the four core notebook indicators, 217 countries/economies, source-specific definitions and exact request URLs. Aggregate regions are excluded. All saved country/year keys are unique.
- Checked the matched-year calculations against synthetic cases that distinguish them from independently averaged series. Tests cover valid zero, missing observations, common-year mode, minimum matched years, region counts, strict thresholds, optional adult context, Pearson edge cases, shareable state and CSV provenance/escaping.
- Extracted only the notebook’s five saved result tables: 5 youth ranking rows, 10 adult ranking rows, 35 threshold rows, and the two original correlation outputs. The notebook itself, assignment instructions and authentication configuration are not published.
- The actual browser rendered all three guided chapters without errors. The default youth view compares 147 countries (r ≈ 0.260); adult literacy compares 138 (r ≈ 0.268). With default historical thresholds, 21 of 124 eligible countries pass both. The story explicitly distinguishes its fixed 2000–2025 window from the optional comparison workspace.
- Selecting Niger’s adult-literacy bar updated the readout and **Follow Niger’s history** opened its linked country panel with exactly 2001, 2012, 2014, 2018 and 2022 as matched years. Keyboard Enter also selected the SVG bar.
- Selecting the top-five Barbados button opened a history comparison using its single matched year, 2012. Reloading the generated URL restored Barbados and the comparison settings.
- Raising the story spending slider from 4% to 4.5% changed qualifying countries from 21 to 15. The detailed view’s region filter also changed counts correctly: Sub-Saharan Africa has 30 eligible historical pairs among 48 countries/economies, with 11 passing the default thresholds.
- A 2025 common-year literacy comparison displayed zero eligible countries and a useful empty state. Switching to 2010 produced 33 adult-literacy country pairs. No old literacy observation was substituted into 2025.
- Country search found Mexico outside the qualifying schooling subset, labeled it below threshold, and showed its actual paired years (2000, 2005, 2010).
- A live browser API refresh completed successfully and retained 6,948 usable observations. Requests finished before manual cancellation could be exercised; cancellation and timeout behavior are covered by the API client tests. The native cancel interaction is not independently verified.
- The schooling indicator card opened the general library with source 12, `BAR.NOED.15UP.ZS`, Mexico/Canada and 1990–2025. Its live EdStats request completed, used the canonical definition, and reported 10 non-missing observations.
- The notebook reference selector displayed all 35 saved threshold rows.
- No horizontal page overflow at the observed 1280-pixel desktop width or the temporary 390-pixel mobile width, including the expanded comparison. Mobile chart labels, country controls and the chapter layout were visually inspected. The temporary viewport override was reset afterward.
- Browser console checks reported no errors or warnings during completed interactions.
- CSV serialization/provenance tests pass. The native file-save flow has not been independently verified.

Screenshots are local review artifacts under ignored `test-artifacts/`; they are not part of the deployed site.

## Publication

Public publication was authorized earlier in this project. The public repository is `mariodportillo/world-bank-comprehensive-data-review`; GitHub Pages deploys through `.github/workflows/pages.yml`. Pushes run the checks and tests before uploading `web/`. The Actions run and Pages deployment status record the publication result.

## Previous explorer verification — November 24, 2026

The general explorer passed its original 13 automated checks and live WDI comparisons for Mexico/Canada and Mexico/United States. It preserved missing data and actual reporting years, searched both WDI and EdStats metadata, and completed an EdStats learning-poverty request for Brazil/India. That explorer remains available as the indicator library.
