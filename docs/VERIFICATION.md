# Implementation verification

Verified locally on 2026-09-09 with Node 26.8.1, npm 12.0.2, Python 3.14.7 and Playwright Chromium. CI uses Node 24 and Python 3.12. This records observed results, not a claim of complete numerical or security coverage.

## Tool-only extraction and native PNG — 2026-09-21

Current working tree: the challenge catalog, challenge IDs, answer-oriented decoders and embedded real challenge fixtures were removed after distilling their reusable operations. The previous section below is historical, not current product coverage.

- **452 unit tests across 16 files** pass, including **123 synthetic generic-extraction cases** plus native PNG and configurable bitstream tests. TypeScript/Vite production build passes.
- Chromium and Firefox: **40 current cases each passed** (39-case full runs plus the added gated cancellation case); WebKit: **40 passed** in a complete fixed-build container run. An earlier WebKit run had one intermittent existing demo/preset-race failure while the preview build was being updated; the isolated repeat passed without changing that test. Python: **38 passed**; formatting and `git diff --check` passed. Raw PNG tests exercise hidden RGB under alpha zero (`[1,2,3,0,101,51,201,128]`), five filters, all five supported 8-bit color types, PLTE/tRNS, CRC/order/bounds, decompression caps and cancellation. The browser bitstream download preserves the expected byte `0xae`; parameter/source changes disable stale exports.
- PNG/GIF containers are traversed to their structural end; extraction supports raw, ASCII bits and strict Base64. Indexed BMP sentinel extraction exposes bit symbols, packing and optional insertion, with no payload-length or silent repair assumptions. UI has methods and parameters only.
- Native PNG now supports legal packed 1/2/4/8/16-bit samples and Adam7 reconstruction. Packed samples are MSB-first and expanded to 0–255; 16-bit samples use their big-endian high byte in the RGBA result. The decoder remains native/manual, bounded, and without Canvas fallback. APNG and files with bytes following IEND are rejected; transparency, including 16-bit tRNS comparisons before output reduction, filters, CRC/order/bounds and cancellation remain covered by tests.

## Historical: PCA, EXIF and local challenge extraction — 2026-09-21

Implemented after signed baseline `0b721da` according to [the development plan](FORENSIC-DEVELOPMENT.md). These changes are local development, not a deployment claim.

- Web unit tests: **282 passed across 14 files**, including 38 PCA, 62 EXIF-thumbnail and 86 challenge-decoder cases. Production TypeScript/Vite build and Prettier passed. Python remains **38 passed**.
- All **37 cases per browser** passed in Chromium, Firefox and Debian-container WebKit. New E2E covers three PCA components and PNG exports, locale preservation, generated little/big-endian EXIF JPEG preview and byte-identical thumbnail downloads, missing-thumbnail cleanup, PNG payload extraction/download and source-replacement invalidation.
- At that stage, three actual HTS Steg 1/4/6 fixtures were losslessly embedded with SHA-256 assertions in the decoder test file. Beyond unit coverage, Chromium and Firefox each opened every fixture, invoked the catalog action, matched the source-documented text and downloaded byte-identical decoded payloads. No answer is embedded in production decoder code. No remote submission was performed.
- Chinese desktop PCA and 390-pixel extraction screenshots were visually reviewed; no overlapping controls were seen, and the narrow page had no horizontal overflow. A grayscale sample's PC2 black map was consistent with zero explained variance, not a rendering failure.

PCA uses decoded white-matted RGB at a maximum 2048-pixel side, not native source bytes or the FFT ROI; each component has its own min/max scaling. EXIF extraction supports explicitly referenced JPEG IFD1 thumbnails only; extraction validity is separate from browser decoding. Catalog methods beyond the three supported byte rules remain unimplemented. C2PA verification, raw-pixel bit-plane fidelity, general payload inference and authenticity conclusions remain outside this slice.

## Forensic/HCI review — 2026-09-21

This section records the current uncommitted working tree, not the deployed site. Earlier sections below are historical evidence.

- `npm test`: 96 passed across 11 files; TypeScript/Vite production build, Prettier and `git diff --check` passed. Python: 38 passed.
- Browser coverage: complete 33-case suites passed in Chromium, Firefox and WebKit. WebKit used a fresh Debian-targeted browser and dependencies inside an isolated `node:24-bookworm` container; mounting the host's incompatible cached browser was insufficient. Real macOS Safari remains untested.
- Added regressions exercise both empty-state entry points, forensic close/reopen, language switching without resetting method selection, independent FFT/forensic status ownership, export invalidation at replacement request, keyboard tabs, 390-pixel layout, codec-error retry and delayed old-image forensic completion. A legacy 1×1 OS/2 BMP CORE fixture now loads correctly; a raw 2×1 PNG demonstrates transparent RGB loss and verifies bilingual warnings. Screenshot paths now honor Playwright's per-test output directory instead of writing into a shared source-relative directory.
- Numerical/parser regressions cover DQT zigzag conversion and IJG quality endpoints, APP1-bounded TIFF reads, actual PNG eXIf chunks rather than payload substrings, spatial RGB clone verification, histogram-based ELA statistics, bounded strings, cancellation and unverified C2PA marker semantics.
- A supplied 720 × 960 JPEG was actually decoded and processed at qualities 50/75/90/95. All four diagnostic maps contained nonzero differences and a quality-90 PNG downloaded successfully. One Chromium run completed both pipelines in 550 ms; quality 90 gave mean maximum-channel difference 1.0710026041666667, p95 3 and maximum 24. No page exception or external request was observed. This is a single local observation, not a portable benchmark or authenticity verdict; the supplied image is not committed.

Visual review of a 390-pixel Chinese workbench screenshot and a desktop ELA panel screenshot found no overlapping controls; automated layout checks found no page-wide horizontal overflow. Dense chart labels remain small. ELA composites onto white and caps work dimensions at 2048; noise/clone maps use at most 512 pixels per side before upscaling. Cancellation is cooperative between phases, not mid-loop. Weighted RGB grayscale is not PCA, luminance bands are not an interactive level sweep, and the working image is not an extracted EXIF thumbnail. The challenge catalog remains a reference list, not a payload decoder. Canvas decode is not byte-exact: fully transparent RGB is lost and semi-transparent channels can be rounded. Raw pixel-bit steganography still requires a raw decoder; the UI explicitly warns about this limitation.

## AGPLv3 licensing and release checks

The project now declares **AGPL-3.0-only** in the README, Python metadata and npm package/lock metadata. The root `LICENSE` is the complete [SPDX AGPL-3.0-only text](https://github.com/spdx/license-list-data/blob/main/text/AGPL-3.0-only.txt), byte-identical to the local system's SPDX copy (SHA-256 `d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee`). Dependency licenses remain unchanged.

- After adding the legal footer and license asset: formatting, **67 Web unit tests**, the TypeScript/Vite production build, **22 Chromium cases** and **37 Python tests** passed. The new browser test fetches and downloads the full license, byte-compares both with `LICENSE`, checks English/Chinese source/no-warranty notices, and verifies a 390-pixel layout.
- `python -m build --no-isolation --outdir /tmp/periodic-stego-agpl-dist` built an sdist and wheel with setuptools 84.0.0. Inspection confirmed `License-Expression: AGPL-3.0-only`, `License-File: LICENSE`, and byte-identical license content in both archives. The build-system minimum is setuptools 77.0.3 for PEP 639 license metadata. The globally installed SCM helper logged a nonfatal Git-discovery warning while building from the sdist; a separate isolated-source build and archive checks also passed.
- Vite emits the root license as a local asset linked by the footer, downloadable as `LICENSE.txt`. The production asset is byte-identical to the root license; the browser test verifies same-origin access. The source link points to the repository; publishers of modified versions must point it at their corresponding source and preserve the applicable notices.

These are implementation and packaging checks, not legal advice or a complete license-compliance audit. Publication status is separate from local tests; consult the workflow for the exact pushed commit.

## Current follow-up verification

Verified locally on 2026-09-13 against the current working tree:

- Python: **38 passed**. Pure noiseless two-pixel alternating stripes now produce the Nyquist period-2 peak and `periodic_signal_detected: true` on both axes; the background median includes zero-power non-DC bins instead of selecting only positive bins.
- Web unit tests and production build pass with strict validation for manual native period and local-separation bounds. Existing v1 presets that predate these four fields receive only their documented defaults; other missing fields remain errors.
- Calibration covers color random-dot textures, independent color-noise negatives, signed local disparity including -16 and +56 pixels, browser JPEG encode/decode, and 0.5× browser scaling. These bounded synthetic cases do not establish a universal false-positive or false-negative rate.
- The full Playwright suite passes locally in Chromium, Firefox and Playwright WebKit (**24 cases per engine**). WebKit was run in a Debian 12 container with Playwright-installed dependencies because the Arch host lacks the required compatibility libraries. A real macOS Safari release remains a separate manual compatibility target.
- The Pages workflow pins the current native-Node-24 majors of checkout, setup-node, setup-python, upload-pages-artifact, configure-pages and deploy-pages by commit SHA. Publication and GitHub-hosted CI remain unverified until this working tree is committed and pushed.

## Magic Eye continuation — local evidence before licensing

The browser's FFT-only strong-signal gate missed a supplied 2000 × 1000 RGB random-dot image despite a visible circular-AC candidate. Native row matching now provides independent evidence without weakening spectral concentration. The source image is not checked into the repository.

- A clean working-tree snapshot of current source (including intended new files) passed `npm ci --ignore-scripts`, formatting, **67 unit tests** and the TypeScript/Vite production build. The snapshot ran **21 Chromium cases twice: 42 passed**, including the new disparity cases. Existing Python tests remain **37 passed**; the legacy Python detector was not redesigned.
- Actual file input, Worker analysis, report download and Chinese disparity PNG export succeeded against both Vite dev and the production preview with no page exceptions. Native period **120 original pixels**, correlation **0.8822383046616926**, prominence **0.8699011045935245**, support **32/32 rows**; strong-periodicity status is true. One production run took 430 ms, an observation rather than a performance guarantee.
- The 512 × 256 diagnostic searches local separations 66..126 original pixels. Matched fraction is **0.905517578125**. A separate NumPy implementation using direct overlap Pearson and direct 11-pixel SSD windows (not the TypeScript FFT/prefix-sum code) matched all **131,072** disparity/invalid samples exactly. Its correlation was **0.8822383046616935**. The largest disparity populations were 0 and 20 pixels; no hidden text is inferred from those numbers.
- Regression inputs use independent random-dot copy constraints, not Fourier stripes. They cover original periods 8/31/120/213, a 1024-pixel repeat in a 16384-pixel-wide input, known positive and negative disparity, complete signal cancellation by FFT downsampling, ROI/channel behavior, noise, quantized gradients, single edges, smooth nonperiodic texture, vertical repeats, and report buffer exclusion. Additional read-only review checks covered 48 independent-noise seeds, 8 quantized ramp slopes, small dimensions, direct Pearson agreement, ROI readout and actual transferable-buffer detachment/NaN preservation; the parent reran these checks against current source.
- Independent review caught a signed-rendering defect: valid -4-pixel disparity was clipped to the same black as zero. The grayscale range now includes the negative search endpoint. The pixel regression failed before the fix and passes afterward; another read-only acceptance check confirmed distinct -4/0 colors at gamma 0.5/1/2. Chromium additionally verifies foreground/background pixels and the exported PNG after disabling grid overlays/interpolation, since PNG export intentionally rerenders at a fixed width rather than copying the viewport Canvas.

Current scope remains horizontal, integer native-pixel repeats with fixed bounds/heuristics, not universal stereogram recognition, OCR or calibrated depth. Ordinary tiled texture can pass; compression, broad peaks, large depth excursions and out-of-range periods may fail. The algorithm and pinned upstream references are documented in [README.md](../README.md#magic-eye--random-dot-stereograms).

PNG files were decoded and verified, and Canvas/geometry/interaction checks passed. The separate vision tool returned a provider routing error (`MissingSessionID`), so no visual reading of hidden letters or complete aesthetic assessment is claimed. This section records local verification. Check the commit-specific GitHub Actions run for publication status; the historical deployment evidence below does not identify the current release.

## Earlier acceptance evidence (before native matching)

- `python -m pytest -q`: 37 passed, including spectral endpoints/conjugates, invalid arrays, 16-bit PNG preservation and period-2 synthetic fixtures. Also passed from a fresh virtual environment after `python -m pip install -e '.[dev]'`.
- `npm run format:check`: passed.
- `npm run build`: TypeScript and production Vite build passed; standalone Worker emitted with relative asset paths.
- `npm test`: 48 passed across 9 files. Includes direct DFT, inverse roundtrips, independent NumPy oracle, direct/FFT circular AC agreement, known periods, noise/constant, odd sizes, ROI, resampling, padding, job supersession, locale handling, odd half-length lags and exact-background median/orientation regression.
- `npm run test:e2e -- --repeat-each=2`: 18 Chromium cases repeated twice, 36 passed. A clean snapshot of the current working tree also passed all 18 cases after a fresh dependency install.
- `npm audit --audit-level=moderate`: 0 reported vulnerabilities. No runtime npm dependencies.
- Python demo and analyze CLI commands were exercised successfully with JSON and diagnostic output. The clean-install demo detected the 16-pixel structure; Pillow verified all three generated PNG files (source, FFT and AC), each 256 × 192.
- A separate Chromium smoke run exercised the maximum 2048 × 2048 padding on a 256 × 192 demo. It finished without a UI error (one observed Worker time: 991 ms); this is a local observation, not a performance guarantee.
- A clean working-tree snapshot (tracked files plus intended new files, excluding deleted/ignored artifacts) passed `npm ci --ignore-scripts`, formatting, 48 unit tests, production build and 18 Chromium tests. Its fresh Python venv passed editable installation and all 37 tests. This snapshot included the then-uncommitted changes, not just the earlier committed deployment.

The browser tests run an isolated production build/preview on port 4174, not an existing dev server. `PLAYWRIGHT_BASE_URL` can point the same suite at a published site. The suite checks actual Canvas pixel changes, Worker result IDs/parameters, a known 16-pixel candidate, conservative noise, PNG signatures, JSON contents, preset reloads, broken/oversized input, 1024-pixel analysis responsiveness, rapid slider changes, ROI reset, 100% scrolling and a 390-pixel reduced-motion layout. It checks for page exceptions and non-GET/HEAD requests in the main workbench scenario.

Separate manual automation alternated actual local PNG and JPEG files for 16 loads successfully without upload requests or page exceptions; private source images are not included in this repository. CDP garbage-collected heap samples showed backing storage stable at 18,345,927 bytes after warmup and JS used heap rising from 2,153,700 to 2,245,428 bytes over the later samples. This short check did not show unbounded image-buffer retention; it does not prove absence of long-run, browser-native or GPU leaks. The screenshot in `workstation.png` contains only the generated 16-pixel demonstration. One production-demo run reported 49 ms Worker analysis for 256 × 192 pixels; this is an observation on the local machine, not a portable performance guarantee.

## Current bilingual UI and review repairs

The English/中文 selector updates controls, tooltips, accessible labels, statuses/errors, findings, caveats, axes and hover readouts. A valid saved preference overrides the browser language; blocked storage does not prevent use. Report/preset data stays canonical English. A separate Chromium check downloaded the active Chinese profiles PNG and byte-compared it with the displayed Canvas PNG: identical, with no page exceptions.

`web/tests/e2e/i18n.spec.ts` verifies language persistence, a Chinese 390-pixel viewport, expanded parameter/candidate details, ROI and display controls, unchanged numerical reports/job IDs, translated Canvas content, malicious-looking filenames kept as text, malformed-preset errors and switching while a Worker is pending. The focused i18n adversarial pass found an expanded-caveat regression; it was repaired and the current browser tests cover it.

Confirmed repairs in this continuation:

- `web/src/main.ts` and `web/src/ui/panels.ts`: an export or unrelated input error could clear busy state during a running analysis; new-image analysis failure could show the old image's findings. Results are now cleared on source replacement, same-source stale results have an explicit notice, and export is disabled until current. Covered by `web/tests/e2e/review.spec.ts` and the pending-Worker locale test.
- `web/src/render/heatmap.ts`: hovering the original-image margin reported negative/nonexistent pixel coordinates. A bounds check now returns the translated outside-image message. The browser regression failed on the baseline and passes after repair.
- `web/src/ui/panels.ts` and `web/src/main.ts`: empty numeric inputs silently became zero, delayed demo completion invalidated newer preset imports, and restoring during the first decode left the app busy. `valueAsNumber`, generation ownership and page-restore state handling now have dedicated regressions.
- `web/src/core/peaks.ts`: odd half-length AC lags could disappear through conjugate roundoff; fixed-stride background sampling also aliased with grid orientation. The grid regression originally returned relative power 10 instead of 1000. Bounded exact-median selection and half-lag handling now pass orientation and independent sorted-oracle checks without mutating input.
- `periodic_stego/analysis.py`, `cli.py`, `synthetic.py`: Python FFT profiles omitted boundary peaks/duplicated conjugates, high-bit-depth grayscale loading clipped data to 8-bit, invalid arrays emitted warnings/errors too late, and the period-2 sine fixture contained no intended Nyquist component. Endpoint selection, native grayscale loading, early rejection and a cosine at period 2 have regressions.

A final independent numerical pass found no remaining introduced bugs in the scoped median, AC-boundary and Python fixes. The parent reran its current-source oracle script: 29,812 median/nonmutation checks, 3 transpose checks and 36 even/odd half-lag checks passed. The exact-selection sort fallback was inspected but not naturally triggered by those cases; arbitrary nonfinite spectrum inputs and a complete memory benchmark were outside this check.

## Earlier implementation review

Three focused read-only reviews covered numerical detection, asynchronous state/privacy/export and chart semantics. A final adversarial pass found an additional profile-boundary defect; its regression failed before the fix and passed afterward.

Repairs include constant-image normalization roundoff, zero-padding concentration compensation, odd near-Nyquist conjugate roundoff, unique even-Nyquist and half-length lag samples, stale demo/preset generations, serialized cancellable image decode, margin-safe ROI, scrollable 100% images, pixel-center axes, signed AC profiles and PNG plot overlays. Display-only changes reuse calculated arrays; heatmaps are remapped only when the result, display gamma or spectrum representation requires it.

An early browser test was intermittently interrupted by Vite HMR after formatting/builds. Moving tests to an isolated production preview removed this interference; repeated runs passed without test retries.

## Limits and deviations

- Automated compatibility passes locally in Chromium, Firefox and Playwright WebKit; CI runs the complete suite in all three engines. The local WebKit run used a Debian 12 container because the Arch host lacks required compatibility libraries. Playwright WebKit is not proof of compatibility with an actual macOS Safari release, which still needs a manual check.
- Python now computes its profile/2D relative-power baseline from all non-DC background bins, including zeros. Pure noiseless alternating two-pixel patterns produce a period-2 profile peak and `periodic_signal_detected: true` on both axes; this remains separate from the browser detector.
- Current desktop and 390-pixel mobile screenshots received a manual visual inspection after these changes: no obvious clipping, overlap or horizontal overflow was found, and the collapsed stereogram control section remained readable. Automated Canvas and layout checks passed in Chromium, Firefox and WebKit; an actual Safari visual comparison remains outstanding.
- Confidence is an uncalibrated signal-strength heuristic. Passing synthetic noise tests does not establish a universal false-positive rate or prove/disprove hidden content.
- No composite report PNG, payload decoding, backend or arbitrary URL input.
- Direct AC is limited to 32 × 32; larger direct-method input returns a readable error. Browser decoding/color handling may differ from Python.
- Obsolete migration briefs have been removed. Current behavior, units and bounds are documented in [README.md](../README.md).

## Earlier deployment evidence

The following records the earlier published revision, not the release status of the bilingual/review changes above. Current deployment status is available in the repository's GitHub Actions runs.

- Public repository: https://github.com/VKKKV/periodic-stego
- Live workbench: https://vkkkv.github.io/periodic-stego/
- First verified application revision: `1e5b47d13effc923e579d60436b5fd31db91b1bb`.
- GitHub Actions run https://github.com/VKKKV/periodic-stego/actions/runs/34324226034 completed successfully: Python 18 passed, web 36 passed, Chromium 8 passed, production build and deployment succeeded.
- Pages configuration was read back as `build_type: workflow`, HTTPS enforced; the published URL returned HTTP 200.
- `PLAYWRIGHT_BASE_URL=https://vkkkv.github.io/periodic-stego/ npm run test:e2e`: 8 passed against the live site, including Worker loading under the project subpath, file input, numerical controls, JSON/PNG downloads and mobile layout.
- A fresh local clone of the committed tree passed `npm ci --ignore-scripts`, formatting, all unit tests, production build and all 8 browser cases; Python 18 passed there too. The first clean-install attempt was accidentally run from the clone's parent directory and failed with no lockfile; rerunning from its `web/` directory succeeded.
