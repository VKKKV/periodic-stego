# Agent Prompt: rebuild periodic-stego as a browser-local interactive image analysis tool

You are working in the `periodic-stego` repository.

This is the original migration brief, retained as design history. The Web-first implementation is now present; read `README.md` and `docs/VERIFICATION.md` for current behavior before using this brief for further changes.

Read `PLAN.md` completely before changing code. The user does not want a Python CLI-only tool. Transform this project into a browser-based, local-first interactive workbench for FFT/autocorrelation periodic image analysis.

Core user experience:

- Drag/drop or choose a local PNG/JPEG image.
- Process the image entirely in the browser; never upload it.
- Show original image, preprocessed image, FFT log-power spectrum, autocorrelation map, and X/Y profiles.
- Expose multiple adjustable parameters and update results in near real time.
- Show candidate periods/frequencies/relative power with caveats.
- Export reproducible JSON reports and diagnostic PNGs.

Read these current files before implementation:

- `README.md`
- `periodic_stego/analysis.py`
- `periodic_stego/cli.py`
- `periodic_stego/synthetic.py`
- `tests/test_analysis.py`

Preserve the Python implementation as a reference implementation and batch fallback. Do not delete it. Add a `web/` Vite + TypeScript application as specified by `PLAN.md`.

Implementation requirements:

1. Use a Web Worker for analysis so slider changes do not block the main thread.
2. Use a tested FFT implementation or a carefully tested own implementation; document normalization conventions.
3. Keep the browser app dependency-light. Canvas 2D is sufficient for v1; do not introduce WebGL unless needed.
4. Support adjustable:
   - channel: luminance/R/G/B/Alpha where applicable
   - mean removal
   - detrend
   - crop ROI
   - downsample/max dimension
   - padding
   - window function: none/Hann/Hamming/Blackman
   - spectrum: magnitude/power/log-power
   - display gamma
   - DC suppression
   - peak count/separation/threshold
   - autocorrelation max lag and threshold
5. Distinguish display-only parameters from analysis parameters.
6. Add job IDs or cancellation logic so stale worker results cannot overwrite newer results.
7. Add synthetic fixtures for known vertical, horizontal, both-axis, noise-only, constant, RGB, odd-size, and non-power-of-two cases.
8. Add Vitest unit tests and Playwright browser smoke tests.
9. Add JSON and PNG export. JSON must include tool version, image metadata, all parameters, preprocessing config, FFT convention, findings, warnings, and caveats.
10. Rewrite README as Web-first. Include local privacy, setup, dev/build/test commands, parameter explanations, limitations, and Python reference CLI usage.
11. Keep terminology honest: periodic peaks are evidence of repeated structure, not proof of hidden text. Never auto-claim successful payload recovery.
12. Follow the Dark Swiss / forensic workstation UI direction in `PLAN.md`: dark, restrained, low-radius, no glassmorphism, no emoji icons, one cold accent color, clear axes and units, responsive layout, reduced-motion support.

Work discipline:

- Inspect the current repository and dependencies first.
- Protect existing files and do not touch unrelated repositories.
- Implement in small verified steps.
- Run Python regression tests before and after changes.
- Run the web build, unit tests, and browser smoke tests.
- Test with the existing synthetic sample and a real local PNG/JPEG.
- Do not report completion until the browser app actually runs and the controls visibly update the analysis.
- If a dependency or browser tool is unavailable, use a minimal alternative and document the limitation honestly.

Acceptance criteria:

- `npm run dev` starts the app.
- `npm run build` succeeds.
- `npm test` succeeds.
- Browser can load a local image without a server upload.
- Changing at least window function, threshold, channel, and display mode updates rendered results.
- FFT, autocorrelation, and profiles are real calculated outputs, not placeholders.
- Known synthetic periodic input yields a candidate close to the known period.
- Noise-only input does not produce a strong periodic finding under the conservative preset.
- JSON and PNG exports work.
- No obvious console errors.
- README accurately describes the delivered behavior.

At the end, report:

- files added/changed
- exact commands run
- test/build/smoke results
- known limitations
- whether the app was verified in a real browser
