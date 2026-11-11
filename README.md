# WiniSort

**Your files. Your folders. Your freedom.**

WiniSort is a production-oriented, 100% local-first visual file and media organizer engineered with vanilla HTML5, CSS3, and modern JavaScript ES modules. It features a fluid central media pool with a signature collection vortex, surrounded by four configurable destination banks (Top, Left, Right, Bottom), real streaming file copies via the File System Access API, `.winisort/` disk-first project persistence, safe undo/redo, duplicate candidate verification, rule-based smart sorting, and non-destructive image compression.

## Key Engineering Highlights
- **100% Local-First & Private**: Zero servers, zero user accounts, zero API keys, zero telemetry, and zero cloud uploads.
- **Zero-CDN Self-Hosted Runtime**: Self-hosted `WiniSans` WOFF2 fonts, programmatic PWA PNG icons, and locally bundled PDF engine/worker (`public/vendor/pdf.js` & `public/vendor/pdf.worker.js`).
- **Disk-First Memory Efficiency**: Handles 50,000+ metadata records using lazy async directory iteration, 512 KB streaming file copy chunks, a windowed 36-item media pool strip, and an LRU ObjectURL/ImageBitmap resource tracker.
- **Safety-First Copy Engine**: Defaults to verified **COPY** (never modifying original source files). Includes collision resolution (`Keep Both Safely`, `Auto-Rename`, `Skip`, `Replace`), source/output alias protection, and verified filesystem undo.

## Beginner-Friendly Windows Setup & Development Guide

No React or external framework installation is required.

### 1. Install Node.js LTS on Windows
1. Visit `https://nodejs.org/` and download the **LTS (Long Term Support)** Windows Installer (`.msi`).
2. Run the installer with default settings (ensure "Add to PATH" is checked).

### 2. Verify Node.js and npm
Open **PowerShell** or **Command Prompt** and run:
```powershell
node -v
npm -v
```
Both commands should print version numbers (e.g., `v20.x.x` and `10.x.x`).

### 3. Extract the Project ZIP
1. Right-click `WiniSort-Production.zip` in Windows File Explorer and select **Extract All...**
2. Choose a destination folder such as `C:\Projects\WiniSort`.
   *(Important: Always extract the ZIP before opening in VS Code or uploading to GitHub).*

### 4. Open the Project in VS Code
1. Launch **Visual Studio Code**.
2. Click **File -> Open Folder...** and select the extracted `winisort` folder.
3. Press ``Ctrl + ` `` to open the integrated terminal inside VS Code.

### 5. Install Dependencies
In the VS Code terminal, run:
```powershell
npm ci
```
*(Or `npm install` if you want npm to refresh dev dependencies for your OS).*

### 6. Start the Local Development Server
```powershell
npm run dev
```

### 7. Access the Local URL
Open Chrome or Edge and visit the URL printed in the terminal (default: `http://localhost:5173`).
*(Tip: You can also serve the pre-built `dist/` folder immediately using any static file server without running `npm ci`!)*

### 8. Run Automated Tests
Run the unit and integration test suites using Node's built-in test runner:
```powershell
npm test
```
For browser end-to-end Playwright UI tests:
```powershell
npx playwright test
```

### 9. Build Production Assets
```powershell
npm run build
```
This outputs the optimized static application to `dist/` and runs `scripts/verify-build.js` to verify all local fonts, icons, manifest, service worker, and zero-CDN compliance.

### 10. Preview the Production Build Locally
```powershell
npm run preview
```
Visit `http://localhost:4173` to test the production bundle and offline PWA service worker.

### 11. Publish Using GitHub Pages
1. Create a new repository on GitHub (e.g., `winisort`).
2. Extract `WiniSort-Production.zip` and commit all extracted project files (`index.html`, `package.json`, `vite.config.js`, `public/`, `src/`, `dist/`, `.github/workflows/deploy.yml`, etc.) to the `main` branch:
```powershell
git init
git add .
git commit -m "Initial commit of WiniSort production application"
git branch -M main
git remote add origin https://github.com/unskyit/winisort.git
git push -u origin main
```
3. In your GitHub repository, navigate to **Settings -> Pages**.
4. Under **Build and deployment -> Source**, select **GitHub Actions**.
5. The included `.github/workflows/deploy.yml` workflow will automatically run tests and publish `dist/` to `https://<your-username>.github.io/winisort/`.

### 12. Configure Repository Subpath Deployment
`vite.config.js` defaults to `base: process.env.BASE_PATH || './'`, and `manifest.webmanifest` + `sw.js` use relative `./` paths. This means WiniSort works seamlessly at both a root domain (`https://example.com/`) and any GitHub Pages repository subpath (`https://username.github.io/winisort/`) without code changes.

### 13. Install WiniSort as a Desktop or Mobile PWA
1. Open your deployed HTTPS URL (or `http://localhost:4173`) in Chrome, Edge, Android Chrome, or iOS Safari.
2. On Desktop Chrome/Edge: Click the **Install WiniSort** icon on the right side of the address bar.
3. On Android Chrome: Tap the browser menu (`⋮`) and select **Install app** or **Add to Home screen**.
4. On iOS Safari: Tap the **Share** button and select **Add to Home Screen**.

### 14. Update the Application Later
When you push changes or update `CACHE_VERSION` inside `public/sw.js`, the Service Worker automatically caches the updated shell and cleans up old cache versions upon activation.

### 15. Save and Restore a WiniSort Project
- **Automatic & Disk Save**: When a writable Output Directory is connected, clicking **Settings -> Save Project (.winisort)** writes `.winisort/project.json` and `.winisort/operations.jsonl` directly inside your output directory. When you reconnect that output directory in a future session, WiniSort automatically loads your destinations, rules, and sorting state.
- **Portable JSON Export/Import**: Click **Settings -> Export Portable Project JSON** to download a `.winisort.json` file, and **Import Project JSON** to restore it on any browser.
