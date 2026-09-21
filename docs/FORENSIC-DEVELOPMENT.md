# Remaining forensic development

This document contains open work only. Completed work and test evidence belong in [VERIFICATION.md](VERIFICATION.md). The product contains methods and parameters, not challenge catalogs, writeups, answers or challenge-specific presets.

## Follow-up scope

- All planned generic forensic methods are implemented in the Extraction Tools panel. Remaining work is limited to measured improvements or additional reference vectors; do not reintroduce challenge selectors.
- Keep barcode recognition explicitly invoked and capability-gated through the browser BarcodeDetector API; do not add automatic payload inference or a broad third-party decoder without a separate reviewed dependency decision.
- Move expensive manual raw-pixel operations to a cancellable Worker only if profiling on the 16-megapixel cap demonstrates UI blocking; current bounded jobs yield and invalidate safely without requiring a second Worker.

Authenticity conclusions, general automatic payload inference and C2PA signature trust are not implied by these tools. No push or publishing is part of this work.
