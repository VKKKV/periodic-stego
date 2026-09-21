# Remaining forensic development

This document contains open work only. Completed work and test evidence belong in [VERIFICATION.md](VERIFICATION.md). The product contains methods and parameters, not challenge catalogs, writeups, answers or challenge-specific presets.

## Follow-up scope

- Extend native PNG decoding to packed 1/2/4-bit and 16-bit samples plus Adam7, with explicit sample/bit conventions and bounded memory.
- Distilled remaining methods: configurable channel-difference/anomaly and prime-value masks; pixel-coordinate/alpha traversal with optional Morse conversion; byte inversion/XOR and coordinate plotting; structured JPEG trailing-data/carving inspection; barcode recognition as a separate explicitly invoked tool. Require defined input/output contracts, size caps and reference vectors before implementing each. Do not reintroduce challenge selectors.
- Move expensive manual raw-pixel operations to a cancellable Worker if measured UI blocking warrants it.

Authenticity conclusions, general automatic payload inference and C2PA signature trust are not implied by these tools. No push or publishing is part of this work.
