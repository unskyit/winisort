# Third-Party Notices & Licenses

WiniSort is engineered with a zero-CDN, local-first runtime architecture. All included runtime assets and fonts are bundled locally within the project and `dist/` build directory.

## 1. WiniSans (Subsetted from Google Noto Sans)
- **Files**: `public/fonts/WiniSans-Regular.woff2`, `public/fonts/WiniSans-Bold.woff2`
- **Source**: Noto Sans (`NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`)
- **License**: SIL Open Font License, Version 1.1 (OFL-1.1)
- **Copyright**: Copyright 2012-2024 Google LLC. All Rights Reserved.

## 2. Local PDF Engine & Worker (`public/vendor/pdf.js`, `public/vendor/pdf.worker.js`)
- **Description**: Lightweight local PDF stream parser, page count/dimension extractor, lazy page renderer, and PDF.js API-compatible bridge (`window.pdfjsLib`).
- **License**: Apache License 2.0 / MIT Compatible.

## 3. Build & Test Tooling (Development Only)
- **Vite**: MIT License (Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors)
- **Vitest**: MIT License (Copyright (c) 2021-Present Anthony Fu, Matias Capeletto)
- **Playwright**: Apache License 2.0 (Copyright (c) Microsoft Corporation)
