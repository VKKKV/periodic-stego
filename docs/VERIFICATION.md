# Implementation verification

Verified locally on 2026-09-09 with Node 26.8.1, npm 12.0.2, Python 3.14.7 and Playwright Chromium. CI uses Node 24 and Python 3.12. This records observed results, not a claim of complete numerical or security coverage.

## Acceptance evidence

- `python -m pytest -q`: 18 passed. Also passed from a fresh virtual environment after `python -m pip install -e '.[dev]'`.
- `npm run format:check`: passed.
- `npm run build`: TypeScript and production Vite build passed; standalone Worker emitted with relative asset paths.
- `npm test`: 36 passed across 6 files. Includes direct DFT, inverse roundtrips, independent NumPy oracle, direct/FFT circular AC agreement, known periods, noise/constant, odd sizes, ROI, resampling, padding and job supersession.
- `npm run test:e2e -- --repeat-each=3`: 8 Chromium cases repeated 3 times, 24 passed. After adding a display-gamma pixel-change assertion, `npm run test:e2e`: 8 passed again.
- `npm audit --audit-level=moderate`: 0 reported vulnerabilities. No runtime npm dependencies.
- Python demo and analyze CLI commands were exercised successfully with JSON and diagnostic output.

The browser tests run an isolated production build/preview on port 4174, not an existing dev server. `PLAYWRIGHT_BASE_URL` can point the same suite at a published site. The suite checks actual Canvas pixel changes, Worker result IDs/parameters, a known 16-pixel candidate, conservative noise, PNG signatures, JSON contents, preset reloads, broken/oversized input, 1024-pixel analysis responsiveness, rapid slider changes, ROI reset, 100% scrolling and a 390-pixel reduced-motion layout. It checks for page exceptions and non-GET/HEAD requests in the main workbench scenario.

Separate manual automation loaded actual local PNG and JPEG files successfully without upload requests; private source images are not included in this repository. The screenshot in `workstation.png` contains only the generated 16-pixel demonstration. One production-demo run reported 49 ms Worker analysis for 256 × 192 pixels; this is an observation on the local machine, not a portable performance guarantee.

## Independent review and repairs

Three focused read-only reviews covered numerical detection, asynchronous state/privacy/export and chart semantics. A final adversarial pass found an additional profile-boundary defect; its regression failed before the fix and passed afterward.

Repairs include constant-image normalization roundoff, zero-padding concentration compensation, odd near-Nyquist conjugate roundoff, unique even-Nyquist and half-length lag samples, stale demo/preset generations, serialized cancellable image decode, margin-safe ROI, scrollable 100% images, pixel-center axes, signed AC profiles and PNG plot overlays. Display-only changes reuse calculated arrays; heatmaps are remapped only when the result, display gamma or spectrum representation requires it.

An early browser test was intermittently interrupted by Vite HMR after formatting/builds. Moving tests to an isolated production preview removed this interference; repeated runs passed without test retries.

## Limits and deviations

- Automated compatibility is verified in Chromium, not Firefox/Safari.
- Screenshot capture succeeded, but the separate vision-analysis tool failed. DOM geometry, overflow, Canvas data and interaction assertions were verified; a full visual assessment is not claimed.
- Confidence is an uncalibrated signal-strength heuristic. Passing synthetic noise tests does not establish a universal false-positive rate or prove/disprove hidden content.
- No composite report PNG, payload decoding, backend or arbitrary URL input. Composite export was optional in the plan.
- Direct AC is limited to 32 × 32; larger direct-method input returns a readable error. Browser decoding/color handling may differ from Python.
- The original migration files remain as design history. Current behavior, units and bounds are documented in `../README.md`.

## Deployment

The repository workflow verifies Python and web tests before Pages publication. Deployment and live-site verification results will be recorded after the first successful release.
