# periodic-stego

A browser-local workbench for investigating periodic structure in PNG and JPEG images. Open an image, tune preprocessing and detection parameters, and compare the original, FFT spectrum, circular autocorrelation, and X/Y profiles.

[Open the workbench](https://vkkkv.github.io/periodic-stego/)

![FFT workbench with a synthetic 16-pixel signal](docs/workstation.png)

A periodic peak is evidence of repeated structure, **not proof of hidden text**. This tool does not decode payloads or guess their encoding.

## Run the web app

Use Node.js 24 LTS (also supported: 22.12+ in the 22.x line, or 26+).

```sh
cd web
npm install
npm run dev
```

Open the local URL printed by Vite. Choose a local file, drag it onto the page, paste a PNG/JPEG from the clipboard, or select a synthetic fixture and click **Run demo**.

```sh
npm run build
npm run preview
```

The production app is static: `web/dist/` can be served by any static host. Vite uses relative asset and Worker paths, including GitHub Pages project subpaths. No backend is needed.

## Privacy and input limits

- Images are decoded and analyzed locally using Canvas and a Web Worker. There is no upload endpoint, analytics, external font, CDN dependency, or account system.
- The host still receives normal requests for the site assets. Image data and parameters are not sent with those requests.
- Files are limited to 32 MiB, 16 megapixels, and 16384 pixels per side before decoding. Larger files must be resized locally first. PNG and JPEG are supported, not SVG, RAW, animated image analysis, or arbitrary URLs.
- The default analysis limit is 512 pixels on the longer ROI dimension, adjustable up to 1024. Area-average downsampling happens in the Worker. Padding is bounded to 2048 × 2048.
- Images/results are held in memory, not persisted in local storage. Exported reports include the image filename, dimensions, byte size, and file modification time, but no pixels. Review this metadata before sharing reports. Debug info excludes the filename and pixel data.

## Workbench controls

**Preprocessing:** luminance/R/G/B/Alpha, range normalization, mean removal, row/column/least-squares plane detrending, analysis gamma, ROI, max dimension, zero padding, and none/Hann/Hamming/Blackman windows. Alpha is available when the decoded image has non-opaque pixels. Enter ROI coordinates or drag a rectangle on the original image. ROI coordinates are in original-image pixels.

**Detection:** DC exclusion radius and peak separation in FFT bins, count per source, relative-power threshold, autocorrelation method, normalization, X/Y lag limits, minimum lag, lag threshold, and lag separation. Direct circular autocorrelation is a verification fallback limited to 32 × 32 padded pixels; larger inputs show an error rather than silently switching algorithms.

**Display only:** magnitude/power/log-power, display gamma, frequency zoom, conjugate markers, axes/grid, period labels, interpolation, image scale, profile frequency/period labels, profile zoom/pan, and wraparound warning visibility. These settings redraw existing results without changing the numerical Worker job. Analysis gamma is separate and does change the input signal.

Default, stripe, subtle-noise, CTF, JPEG-artifact, and conservative presets change parameters only. Save/load preset JSON preserves all analysis/display settings; imported presets are validated, not executed. Changing the source image clears ROI and resets padding to prevent stale dimensions.

Parameter changes are debounced by 150 ms. Superseded Workers are terminated immediately and all responses are checked against the current job ID. The previous plot stays visible while marked **Updating**; stale or failed analyses cannot be exported as current results.

## Numerical conventions and interpretation

The TypeScript implementation uses Float64 throughout, with radix-2 FFTs and Bluestein convolution for arbitrary lengths. It has no runtime package dependencies. Forward transforms use `exp(-2πikn/N)` without scaling; inverse transforms use the positive sign and divide by the sample count (width × height in 2D). `fftshift` moves each axis by `floor(N/2)`.

Pipeline order: crop → area-average downsample → channel values divided by 255 → analysis gamma → optional min/max normalization → detrend → optional mean removal → separable window → zero padding → FFT. Luminance is `0.2126 R + 0.7152 G + 0.0722 B` on decoded channel values; this is not linear-light color management. Browser image/color/EXIF decoding may differ from Pillow.

Frequency is measured in cycles per **analyzed pixel**. Period is `1 / |frequency|`; zero frequency has no finite period. Multiply X/Y periods by the report's `scaleX`/`scaleY` to express them in original-image pixels. Zero padding changes FFT bin spacing, not the effective physical resolution.

Circular autocorrelation is `IFFT(FFT(x) × conjugate(FFT(x)))` on the padded grid. AC candidates report actual pixel lags, not reciprocal FFT-bin positions. Opposite lag directions and Fourier conjugate pairs are merged within their respective candidate source. X/Y FFT profiles and 2D peaks remain separate evidence sources; the same physical period can appear in multiple sources and at harmonics.

FFT detection uses local maxima, DC exclusion, minimum separation, and a relative-to-median-background score. A separate spectral-concentration factor, compensated for zero-padding, prevents large noise outliers from automatically becoming strong findings. The displayed 0–1 confidence is an **uncalibrated signal-strength heuristic**, not a statistical probability. Autocorrelation alone does not set the strong-periodicity status. Thresholds are exploratory controls, not a universal significance test.

JPEG blocks, resizing, scanlines, moiré, image boundaries and ordinary textures can all create peaks. Windows broaden peaks; aggressive detrending can remove the signal of interest; downsampling may suppress/alias high-frequency content; padding and circular wraparound affect interpretation. Weak/no findings do not rule out steganography. Inspect stability across channels, crops, windows and scales before drawing a conclusion.

## Exports

- JSON report: tool version, timestamp, image metadata (no pixels), every parameter, preprocessing dimensions/scales, FFT convention, candidates, statistics, warnings and caveats.
- PNG: original image, preprocessed data, FFT heatmap, autocorrelation heatmap, or the four labeled profile plots. Heatmap PNGs include axes and selected overlays/zoom; the interactive coordinate readout and findings remain in the UI/JSON report.
- Preset JSON: all analysis/display parameters, suitable for reloading with the same input image. Presets do not contain the image.

Composite report PNG export is not implemented. Browser decoding is the remaining platform-dependent part of reproduction.

## Tests and fixtures

From the repository root:

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
python -m pytest -q
python scripts/generate_fixtures.py
```

From `web/`:

```sh
npm ci --ignore-scripts
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests compare complex FFTs with direct DFT, inverse roundtrips, odd-size shifts, a NumPy-generated numerical oracle, direct/FFT AC agreement, periods 8/16/32, horizontal/both-axis structure, conservative noise, constant/RGB/Alpha inputs, ROI, downsampling, padding, validation and Worker races. Fixtures in `web/tests/fixtures/` are reproducibly generated synthetic images, not photographs.

Playwright exercises PNG drag/drop and JPEG file selection, real plots, analysis/display controls, report and PNG downloads, preset roundtrips, corrupt/empty/oversize input, 1024-pixel responsiveness, rapid-change supersession, replacement loads, a 390-pixel viewport and reduced motion. Automated browser verification currently targets Chromium; recent Firefox/Safari provide the required APIs but are not part of the tested matrix.

Detailed execution evidence, review repairs and verification limits: [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Python reference and batch fallback

The preserved NumPy/Pillow CLI is a separate, simpler reference, not a server for the web app:

```sh
python -m periodic_stego demo --output /tmp/periodic-stego-demo
python -m periodic_stego analyze image.png --json report.json --diagnostics diagnostics/
```

The CLI uses mean removal, no window and no resampling. For numerical comparison, use those same settings in the web app. Detection heuristics and report schemas intentionally differ; Python remains a legacy reference, not a bit-for-bit clone of the full web UI. Its autocorrelation output now uses true `lag_pixels` / `period_pixels` and `normalized_correlation` rather than the former incorrect frequency-profile interpretation.

## Deployment

The `Verify and deploy Pages` GitHub Actions workflow runs Python tests, formatting checks, web unit tests, production build and Chromium smoke tests before publishing. The deploy job is restricted to `main` and has only Pages/OIDC write permissions. Actions are pinned to commit SHAs. Set repository Pages source to **GitHub Actions**. Pull requests run verification without deployment.

The site is intended for local files, CTF handouts and authorized forensic analysis. It neither scans external targets nor performs payload recovery.
