# Verification

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
