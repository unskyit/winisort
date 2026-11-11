# Browser Compatibility & Manual Verification Checklist

WiniSort uses runtime feature detection (`src/core/capability-detector.js`) rather than user-agent sniffing.

## Capability Matrix

| Browser / Platform | Filesystem Mode | Directory Import | Direct Folder Copy (`createWritable`) | Fallback Export (`.zip` / `.json`) | Offline PWA Shell |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chrome Desktop (v86+)** | Native FS Access | `showDirectoryPicker` | Full Streaming Write + Verify | Supported | Full Support |
| **Edge Desktop (v86+)** | Native FS Access | `showDirectoryPicker` | Full Streaming Write + Verify | Supported | Full Support |
| **Opera / Brave Desktop** | Native FS Access | `showDirectoryPicker` | Full Streaming Write + Verify | Supported | Full Support |
| **Firefox Desktop** | Export Mode | `webkitdirectory` + Drag & Drop | Not exposed by browser; uses Session Staging | Full ZIP + JSON Export | Full Support |
| **Safari macOS** | Export Mode | `webkitdirectory` + Drag & Drop | Partial/Restricted; uses Session Staging | Full ZIP + JSON Export | Full Support |
| **Chrome Android** | Export Mode / Picker | File & Multi-Select Picker | Session Staging + ZIP Export | Full ZIP + JSON Export | Full Support |
| **Safari iOS / iPadOS** | Export Mode | Files App & Photo Picker | Session Staging + ZIP Export | Full ZIP + JSON Export | Add to Home Screen |

## Repeatable Manual Browser Verification Checklist

1. **Initial Workspace & Zero-Onboarding Launch**: Open the app URL and verify the 5-region workspace and central collection tray load immediately with no login or cloud prompts.
2. **Media Filter Enforcement**: Open **🎯 Media Filters**, enable only `JPG` and `PNG`, import a folder containing `JPG`, `WEBP`, and `PDF`, and confirm only `JPG`/`PNG` enter the active queue.
3. **Real Filesystem Output (Chrome/Edge Desktop)**: Click **💾 Select Output Dir**, pick a test output folder, create a new destination (`Festival 🪔`), and sort a file. Verify in your OS file manager that `Festival/<filename>` was created and matches the exact byte size.
4. **Collision Resolution**: Sort the same file a second time into the same destination with default `Keep Both Safely` policy and verify `<filename> (1).<ext>` is created without overwriting the first copy.
5. **Safe Undo Verification**: Press `Ctrl/Cmd + Z` immediately after sorting and verify the app-created copy is removed from the destination folder and the item returns to the unsorted queue.
6. **Fallback Export Mode (Firefox/Safari/Mobile)**: Confirm the top compatibility banner explains Export Mode, sort several files into destinations, and click **Settings -> Export Sorted Files as ZIP Archive** to verify the downloaded `.zip` contains the organized subfolder structure.
7. **Offline PWA Launch**: Install the app as a PWA, disconnect network access, and relaunch the installed app to confirm all fonts, icons, styles, and scripts load offline.

## Truthful Verification Report (Sandbox Environment vs. Manual Browser Targets)
- **Automated Verified in Sandbox**: All 15 Node.js unit and integration test suites (`tests/unit/core-and-engines.test.js` and `tests/integration/filesystem-and-recovery.test.js`), 50,000-file synthetic metadata benchmark, production build verification (`scripts/verify-build.js`), and static web app integrity check (`check_web_app.py`) were executed and passed in the build container.
- **Requires Manual Device Verification**: Native OS permission prompts (`window.showDirectoryPicker`) on Windows/macOS Chrome & Edge, touch gestures on physical Android/iOS devices, and OS-level PWA installation prompts require manual verification using the checklist above.
