import { bus } from './event-bus.js';
import { store } from './state.js';
import { STARTER_TEMPLATES } from './configuration.js';
import { FilesystemAdapter } from '../filesystem/adapter.js';
import { SourceManager } from '../filesystem/source-manager.js';
import { DestinationManager } from '../filesystem/destination-manager.js';
import { CopyEngine } from '../filesystem/copy-engine.js';
import { buildZipArchiveBlob, triggerBrowserDownload } from '../filesystem/export-fallback.js';
import { assertSafeSourceAndOutput } from '../filesystem/permission-manager.js';
import { ProjectManager } from '../project/project-manager.js';
import { parseProjectManifestJson } from '../project/manifest.js';
import { HistoryManager } from '../sorting/history.js';
import { RulesEngine } from '../sorting/rules.js';
import { SelectionManager } from '../sorting/selection.js';
import { DuplicateDetector } from '../sorting/duplicate-detector.js';
import { SortingEngine } from '../sorting/sorting-engine.js';
import { PreviewManager } from '../previews/preview-manager.js';
import { CompressionJobRunner } from '../optimization/compression-job.js';
import { AnimationController } from '../interactions/animation-controller.js';
import { DragController } from '../interactions/drag-controller.js';
import { TouchController } from '../interactions/touch-controller.js';
import { ShortcutsController } from '../interactions/shortcuts.js';
import { ToastManager } from '../components/toast.js';
import { ContextMenuManager } from '../components/context-menu.js';
import { renderScanProgressBanner } from '../components/progress.js';
import { renderToolbar } from '../components/toolbar.js';
import { renderDestinationBank } from '../components/destination-bank.js';
import { renderInitialMediaPool } from '../components/media-pool.js';
import { renderActiveSortingWorkspace } from '../components/active-viewer.js';
import { renderSettingsModal } from '../components/settings-panel.js';
import { renderStatisticsModal } from '../components/statistics.js';
import { renderCommandPaletteModal } from '../components/command-palette.js';
import {
  renderMediaFilterModal,
  renderDestinationDialog,
  renderCompressionModal,
  renderSmartRulesModal,
  renderHelpModal
} from '../components/dialogs.js';

export class WiniSortApplication {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.store = store;

    this.adapter = new FilesystemAdapter(this.store.capabilities);
    this.sourceManager = new SourceManager(this.store);
    this.destinationManager = new DestinationManager(this.store, this.adapter);
    this.copyEngine = new CopyEngine(this.store, this.adapter, this.destinationManager);
    this.projectManager = new ProjectManager(this.store, this.adapter, this.destinationManager);
    this.historyManager = new HistoryManager(this.store, this.adapter, this.destinationManager);
    this.rulesEngine = new RulesEngine(this.store);
    this.selectionManager = new SelectionManager(this.store);
    this.duplicateDetector = new DuplicateDetector(this.store, this.copyEngine);
    this.sortingEngine = new SortingEngine(
      this.store,
      this.copyEngine,
      this.destinationManager,
      this.historyManager,
      this.projectManager
    );
    this.previewManager = new PreviewManager(this.store, this.copyEngine);
    this.compressionRunner = new CompressionJobRunner(this.store, this.adapter, this.copyEngine);
    this.animationController = new AnimationController(this.store);
    this.contextMenu = new ContextMenuManager();

    this.dragController = new DragController(
      this.store,
      this.selectionManager,
      (fileIds, destId) => this.handleSortFiles(fileIds, destId),
      (dropped) => this.handleExternalDrop(dropped)
    );

    this.touchController = new TouchController(
      () => this.sortingEngine.navigateNext(),
      () => this.sortingEngine.navigatePrevious()
    );

    this.shortcutsController = new ShortcutsController(this.store, {
      onCloseModal: () => this.closeModal(),
      onOpenCommandPalette: () => this.openModal('command-palette'),
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onSelectAll: () => {
        this.selectionManager.selectAllFiltered();
        this.toast?.show(`Selected all ${this.store.ui.selectedFileIds.size} visible files`);
      },
      onFocusSearch: () => {
        document.getElementById('ws-global-search-input')?.focus();
      },
      onOpenHelp: () => this.openModal('help'),
      onNumericShortcut: (numStr) => this.handleNumericShortcut(numStr),
      onNextFile: () => this.sortingEngine.navigateNext(),
      onPreviousFile: () => this.sortingEngine.navigatePrevious(),
      onToggleFullscreenPreview: () => {
        const card = document.getElementById('ws-active-media-card');
        if (card && card.requestFullscreen) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else card.requestFullscreen().catch(() => {});
        }
      },
      onSkipActiveFile: () => {
        const active = this.store.getActiveFile();
        if (active) this.sortingEngine.skipFile(active.id);
      }
    });

    this.actions = this._buildActionsMap();
  }

  async init() {
    this._buildDomScaffold();
    this.applyThemeAndDensity();
    await this._seedDefaultDestinations();

    this.shortcutsController.mount();
    this.dragController.bindExternalFileDrop(this.rootEl);
    this.touchController.bindSwipeNavigation(this.centerStageEl);

    bus.on('state:changed', ({ section, payload }) => {
      this._onStateChanged(section, payload);
    });

    this.renderAll();
  }

  _buildDomScaffold() {
    this.rootEl.innerHTML = '';

    // Hidden fallback file inputs for browsers without File System Access API
    this.fileInputEl = document.createElement('input');
    this.fileInputEl.type = 'file';
    this.fileInputEl.multiple = true;
    this.fileInputEl.style.display = 'none';
    this.fileInputEl.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        await this.sourceManager.importFileList(e.target.files, 'Selected Files');
        e.target.value = '';
      }
    });

    this.dirInputEl = document.createElement('input');
    this.dirInputEl.type = 'file';
    this.dirInputEl.multiple = true;
    this.dirInputEl.setAttribute('webkitdirectory', '');
    this.dirInputEl.style.display = 'none';
    this.dirInputEl.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        const firstPath = e.target.files[0].webkitRelativePath || '';
        const folderLabel = firstPath.split('/')[0] || 'Imported Folder';
        await this.sourceManager.importFileList(e.target.files, folderLabel);
        e.target.value = '';
      }
    });

    this.projectInputEl = document.createElement('input');
    this.projectInputEl.type = 'file';
    this.projectInputEl.accept = '.json,application/json';
    this.projectInputEl.style.display = 'none';
    this.projectInputEl.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (f) {
        try {
          const text = await f.text();
          const manifest = parseProjectManifestJson(text);
          await this.projectManager.restoreFromManifest(manifest);
          this.toast.show(`Restored project "${manifest.name}"`, { type: 'success' });
        } catch (err) {
          this.toast.show(err.message || 'Failed to import project JSON', { type: 'danger' });
        }
        e.target.value = '';
      }
    });

    this.toolbarEl = document.createElement('header');
    this.toolbarEl.className = 'ws-toolbar';

    this.bannerRegionEl = document.createElement('div');
    this.scanBannerEl = document.createElement('div');

    this.workspaceEl = document.createElement('main');
    this.workspaceEl.className = 'ws-workspace';

    this.bankTopEl = document.createElement('section');
    this.bankTopEl.className = 'ws-bank-top';
    this.bankTopEl.setAttribute('aria-label', 'Top destination folders');

    this.bankLeftEl = document.createElement('aside');
    this.bankLeftEl.className = 'ws-bank-left';
    this.bankLeftEl.setAttribute('aria-label', 'Left destination folders');

    this.centerStageEl = document.createElement('section');
    this.centerStageEl.className = 'ws-center-stage';
    this.centerStageEl.setAttribute('aria-label', 'Central media sorting workspace');

    this.bankRightEl = document.createElement('aside');
    this.bankRightEl.className = 'ws-bank-right';
    this.bankRightEl.setAttribute('aria-label', 'Right destination folders');

    this.bankBottomEl = document.createElement('section');
    this.bankBottomEl.className = 'ws-bank-bottom';
    this.bankBottomEl.setAttribute('aria-label', 'Bottom destination folders');

    this.workspaceEl.append(
      this.bankTopEl,
      this.bankLeftEl,
      this.centerStageEl,
      this.bankRightEl,
      this.bankBottomEl
    );

    this.modalMountEl = document.createElement('div');
    this.toastRegionEl = document.createElement('div');
    this.toastRegionEl.className = 'ws-toast-Region';
    this.toast = new ToastManager(this.toastRegionEl);

    this.rootEl.append(
      this.fileInputEl,
      this.dirInputEl,
      this.projectInputEl,
      this.toolbarEl,
      this.bannerRegionEl,
      this.scanBannerEl,
      this.workspaceEl,
      this.modalMountEl,
      this.toastRegionEl
    );

    this._renderCompatibilityBanner();
  }

  async _seedDefaultDestinations() {
    if (this.store.destinations.size > 0) return;
    const starter = [
      { name: 'Diwali', emoji: '🪔', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'School', emoji: '🎓', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Work', emoji: '💼', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Favorites', emoji: '⭐', color: '#805AD5', bank: 'bottom', pinned: true, shortcut: '4' }
    ];
    for (const d of starter) {
      await this.destinationManager.createDestination(d);
    }
  }

  _renderCompatibilityBanner() {
    this.bannerRegionEl.innerHTML = '';
    const cap = this.store.capabilities;
    if (!cap.hasDirectoryPicker) {
      const banner = document.createElement('div');
      banner.className = 'ws-compat-banner is-warning';
      banner.innerHTML = `
        <span><strong>Browser Export Mode Active:</strong> Direct directory writing (File System Access API) is not exposed by this browser. You can organize all files in this session and export sorted folders as a ZIP archive or portable project JSON.</span>
        <button class="ws-btn" style="height:24px;font-size:11px;">Dismiss</button>
      `;
      banner.querySelector('button').addEventListener('click', () => banner.remove());
      this.bannerRegionEl.appendChild(banner);
    }
  }

  applyThemeAndDensity() {
    const p = this.store.preferences;
    let resolvedTheme = p.theme;
    if (resolvedTheme === 'system') {
      const darkMedia = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = darkMedia ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-density', p.density || 'comfortable');
    document.documentElement.setAttribute('data-motion', p.motionLevel || 'full');
    document.documentElement.setAttribute('data-transparency', p.transparencyLevel || 'normal');
  }

  _buildActionsMap() {
    return {
      onAddFiles: () => this.handleAddFiles(),
      onAddFolder: () => this.handleAddFolder(),
      onAddFolderOrFiles: () => this.handleAddFolder(),
      onSelectOutputDirectory: () => this.handleSelectOutputDirectory(),
      onConnectExistingDestination: () => this.handleConnectExistingDestination(),
      onLoadSampleMediaPack: () => this.handleLoadSampleMediaPack(),
      onApplyStarterTemplate: (tplId) => this.handleApplyStarterTemplate(tplId),
      onSearchChange: (q) => {
        this.store.ui.searchQuery = q;
        this.store.recomputeDerivedState();
        this.renderCenterStage();
      },
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onOpenFilters: () => this.openModal('filters'),
      onOpenSettings: () => this.openModal('settings'),
      onOpenStats: () => this.openModal('stats'),
      onOpenRules: () => this.openModal('rules'),
      onOpenHelp: () => this.openModal('help'),
      onOpenCommandPalette: () => this.openModal('command-palette'),
      onOpenNewDestination: (bank) => this.openModal('destination', { bank }),
      onOpenDestinationSettings: (destId) => this.openModal('destination', { destinationId: destId }),
      onOpenCompressionModal: (destId) => this.openModal('compression', { destinationId: destId }),
      onCloseModal: () => this.closeModal(),
      onToggleQuickSort: () => {
        this.store.ui.quickSortMode = !this.store.ui.quickSortMode;
        this.workspaceEl.classList.toggle('is-quick-sort', this.store.ui.quickSortMode);
        this.renderAll();
      },
      onToggleTheme: () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        this.store.preferences.theme = cur === 'dark' ? 'light' : 'dark';
        this.applyThemeAndDensity();
        this.renderToolbarSection();
      },
      onApplyThemeAndDensity: () => {
        this.applyThemeAndDensity();
        this.renderAll();
      },
      onSortActiveIntoDestination: (destId) => {
        const ids = this.selectionManager.getActiveOrSelectedFileIds();
        if (ids.length === 0) {
          this.toast.show('Select or import a file first to sort into this destination.', { type: 'info' });
          return;
        }
        this.handleSortFiles(ids, destId);
      },
      onCreateDestination: async (cfg) => {
        try {
          const d = await this.destinationManager.createDestination(cfg);
          this.closeModal();
          this.toast.show(`Created destination "${d.emoji} ${d.name}"`, { type: 'success' });
        } catch (err) {
          this.toast.show(err.message, { type: 'danger' });
        }
      },
      onUpdateDestination: (destId, updates) => {
        this.destinationManager.updateDestination(destId, updates);
        this.closeModal();
        this.toast.show('Destination updated', { type: 'success' });
      },
      onRemoveDestination: (destId) => {
        this.destinationManager.removeDestinationFromWorkspace(destId);
        this.toast.show('Removed destination from workspace (files on disk untouched)', { type: 'info' });
      },
      onNextFile: () => this.sortingEngine.navigateNext(),
      onPreviousFile: () => this.sortingEngine.navigatePrevious(),
      onSkipFile: (fileId) => this.sortingEngine.skipFile(fileId),
      onReviewLater: (fileId) => this.sortingEngine.markReviewLater(fileId),
      onToggleFavorite: (fileId) => this.sortingEngine.toggleFavorite(fileId),
      onCancelScan: () => this.sourceManager.cancelScan(),
      onSaveProject: async () => {
        try {
          const res = await this.projectManager.saveProjectToDisk();
          this.toast.show(
            res.mode === 'disk'
              ? 'Saved project metadata to .winisort/project.json'
              : 'Exported portable .winisort.json project file',
            { type: 'success' }
          );
        } catch (err) {
          this.toast.show(err.message, { type: 'danger' });
        }
      },
      onExportProjectJson: () => {
        this.projectManager.exportPortableProjectJson();
        this.toast.show('Exported portable project JSON', { type: 'success' });
      },
      onImportProjectJson: () => {
        this.projectInputEl.click();
      },
      onExportSortedZip: () => this.handleExportSortedZip(),
      onExecuteAllRules: () => this.handleExecuteAllRules(),
      onRunCompressionJob: (destId, opts) => this.handleRunCompressionJob(destId, opts),
      onDestinationContextMenu: (destId, x, y) => this.handleDestinationContextMenu(destId, x, y),
      onMediaCardContextMenu: (fileRecord, x, y) => this.handleMediaCardContextMenu(fileRecord, x, y)
    };
  }

  async handleAddFiles() {
    if (this.store.capabilities.hasOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        const files = [];
        for (const h of handles) {
          files.push(await h.getFile());
        }
        await this.sourceManager.importFileList(files, 'Picked Files');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    this.fileInputEl.click();
  }

  async handleAddFolder() {
    if (this.store.capabilities.hasDirectoryPicker) {
      try {
        const dirHandle = await this.adapter.pickDirectory({ mode: 'read' });
        if (this.store.project.outputRootHandle) {
          await assertSafeSourceAndOutput(dirHandle, this.store.project.outputRootHandle);
        }
        await this.sourceManager.importDirectoryHandle(dirHandle);
        return;
      } catch (err) {
        if (err.code === 'PICKER_CANCELED') return;
        this.toast.show(err.message, { type: 'danger' });
        return;
      }
    }
    if (this.store.capabilities.hasWebkitDirectory) {
      this.dirInputEl.click();
    } else {
      this.fileInputEl.click();
    }
  }

  async handleSelectOutputDirectory() {
    if (!this.store.capabilities.hasDirectoryPicker) {
      this.toast.show('Direct folder writing is unavailable in this browser. Sorted files will be staged for ZIP export.', {
        type: 'warning'
      });
      return;
    }
    try {
      const dirHandle = await this.adapter.pickDirectory({ mode: 'readwrite' });
      for (const src of this.store.sources.values()) {
        if (src.handle) {
          await assertSafeSourceAndOutput(src.handle, dirHandle);
        }
      }
      const recoveryItems = await this.projectManager.loadAndRecoverFromDirectory(dirHandle);
      this.toast.show(`Connected output folder "${dirHandle.name}"`, { type: 'success' });
      if (recoveryItems.length > 0) {
        this.toast.show(`Found ${recoveryItems.length} recoverable operation(s) in .winisort journal`, {
          type: 'warning'
        });
      }
    } catch (err) {
      if (err.code === 'PICKER_CANCELED') return;
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleConnectExistingDestination() {
    if (!this.store.capabilities.hasDirectoryPicker) {
      this.openModal('destination', { bank: 'right' });
      return;
    }
    try {
      const dirHandle = await this.adapter.pickDirectory({ mode: 'readwrite' });
      const dest = await this.destinationManager.connectExistingDestination(dirHandle, { bank: 'right' });
      this.toast.show(`Connected "${dest.name}" (${dest.stats.fileCount} existing files indexed)`, { type: 'success' });
    } catch (err) {
      if (err.code === 'PICKER_CANCELED') return;
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleLoadSampleMediaPack() {
    // Generates genuine in-memory File objects (SVG image, PDF document, WAV audio tone, Markdown note, CSV sheet)
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1E3A8A"/>
          <stop offset="100%" stop-color="#5286DB"/>
        </linearGradient>
      </defs>
      <rect width="800" height="520" rx="24" fill="url(#g)"/>
      <circle cx="620" cy="140" r="68" fill="#F6E05E" opacity="0.9"/>
      <path d="M0 390 L240 210 L460 360 L620 240 L800 370 L800 520 L0 520 Z" fill="#0F172A" opacity="0.75"/>
      <text x="48" y="468" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold">Diwali_Lantern_Festival_2026.svg</text>
    </svg>`;

    const pdfContent = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 140 >> stream
BT
/F1 14 Tf
72 710 Td
(WiniSort Local Architecture Specification - Semester Lecture Notes) Tj
(Zero Cloud Upload - Verified Streaming File Copy Engine) Tj
ET
endstream endobj
xref
0 5
trailer << /Root 1 0 R /Size 5 >>
%%EOF`;

    const mdContent = `# Q4 Product Architecture Notes

- Application: WiniSort
- Mode: 100% Local-First Browser Organizer
- Default action: Verified Streaming Copy
- Recovery: .winisort/project.json + operations.jsonl
`;
    const csvContent = `Title,Category,SizeMB,Status
Diwali_Celebration.jpg,Festival,4.2,Ready
Semester_Schedule.pdf,School,1.1,Ready
Client_Invoice_104.pdf,Work,0.4,Ready
`;

    const sampleFiles = [
      new File([svgContent], 'Diwali_Lantern_Festival_2026.svg', { type: 'image/svg+xml', lastModified: Date.now() - 86400000 * 5 }),
      new File([pdfContent], 'School_Computer_Science_Notes.pdf', { type: 'application/pdf', lastModified: Date.now() - 86400000 * 3 }),
      new File([mdContent], 'Work_Architecture_Brief.md', { type: 'text/markdown', lastModified: Date.now() - 86400000 * 2 }),
      new File([csvContent], 'Work_Budget_Summary_2026.csv', { type: 'text/csv', lastModified: Date.now() - 86400000 })
    ];

    await this.sourceManager.importFileList(sampleFiles, 'Sample Media Pack');
  }

  async handleApplyStarterTemplate(tplId) {
    const tpl = STARTER_TEMPLATES[tplId];
    if (!tpl) return;
    let added = 0;
    for (const d of tpl.destinations) {
      try {
        await this.destinationManager.createDestination(d);
        added++;
      } catch (_) {}
    }
    this.toast.show(`Applied "${tpl.name}" template (${added} folder(s) added)`, { type: 'success' });
  }

  async handleSortFiles(fileIds, destinationId) {
    try {
      if (fileIds.length === 1) {
        const res = await this.sortingEngine.assignFileToDestination(fileIds[0], destinationId);
        if (res.status === 'completed' || res.status === 'dry-run') {
          this.animationController.flashDestinationSuccess(destinationId);
          const dest = this.store.destinations.get(destinationId);
          const label = res.mode === 'dry-run'
            ? `[Dry Run] Would copy to ${dest?.name}`
            : `Sorted "${res.finalName}" → ${dest?.name}`;
          this.toast.show(label, {
            type: 'success',
            actionLabel: res.mode === 'dry-run' ? undefined : 'Undo',
            onAction: () => this.handleUndo()
          });
        }
      } else {
        const results = await this.sortingEngine.batchAssignToDestination(fileIds, destinationId);
        this.animationController.flashDestinationSuccess(destinationId);
        const dest = this.store.destinations.get(destinationId);
        this.toast.show(`Batch sorted ${results.length} files → ${dest?.name}`, {
          type: 'success',
          actionLabel: 'Undo Batch',
          onAction: () => this.handleUndo()
        });
      }
    } catch (err) {
      this.toast.show(err.message || 'Sorting operation failed', { type: 'danger' });
    }
  }

  async handleNumericShortcut(numStr) {
    for (const dest of this.store.destinations.values()) {
      if (dest.shortcut === numStr) {
        const ids = this.selectionManager.getActiveOrSelectedFileIds();
        if (ids.length > 0) {
          await this.handleSortFiles(ids, dest.id);
        }
        return;
      }
    }
  }

  async handleUndo() {
    try {
      const undone = await this.historyManager.undo();
      if (undone) {
        if (undone.destinationId) {
          this.animationController.flashDestinationSuccess(undone.destinationId);
        }
        this.toast.show('Undid last operation', { type: 'info' });
      }
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleRedo() {
    try {
      const redone = await this.historyManager.redo(this.sortingEngine);
      if (redone) {
        this.toast.show('Redid operation', { type: 'info' });
      }
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleExternalDrop({ handles, files }) {
    for (const h of handles || []) {
      if (h.kind === 'directory') {
        await this.sourceManager.importDirectoryHandle(h);
      }
    }
    if (files && files.length > 0) {
      await this.sourceManager.importFileList(files, 'Dropped Files');
    }
  }

  async handleExportSortedZip() {
    try {
      const entries = [];
      for (const dest of this.store.destinations.values()) {
        for (const [outName, item] of dest.exportedFiles.entries()) {
          const buf = await item.sourceFile.arrayBuffer();
          entries.push({
            path: `${dest.folderName}/${outName}`,
            bytes: new Uint8Array(buf)
          });
        }
      }

      if (entries.length === 0) {
        // Also allow zipping any sorted files currently in session if user wants a portable archive
        for (const file of this.store.files.values()) {
          if (file.status === 'sorted' && file.assignedDestinationId) {
            const dest = this.store.destinations.get(file.assignedDestinationId);
            const blob = await this.copyEngine.resolveSourceFile(file);
            const buf = await blob.arrayBuffer();
            entries.push({
              path: `${dest ? dest.folderName : 'Sorted'}/${file.sortedOutputName || file.name}`,
              bytes: new Uint8Array(buf)
            });
          }
        }
      }

      if (entries.length === 0) {
        this.toast.show('No sorted files available to export yet.', { type: 'warning' });
        return;
      }

      const zipBlob = buildZipArchiveBlob(entries);
      triggerBrowserDownload(zipBlob, 'WiniSort-Sorted-Folders.zip');
      this.toast.show(`Exported ${entries.length} sorted file(s) in WiniSort-Sorted-Folders.zip`, { type: 'success' });
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleExecuteAllRules() {
    const matches = this.rulesEngine.previewRuleMatches();
    if (matches.length === 0) {
      this.toast.show('No unsorted files matched active rules.', { type: 'info' });
      return;
    }
    let count = 0;
    for (const m of matches) {
      try {
        await this.sortingEngine.assignFileToDestination(m.fileId, m.destinationId);
        count++;
      } catch (_) {}
    }
    this.toast.show(`Rule engine sorted ${count} file(s)`, { type: 'success' });
  }

  async handleRunCompressionJob(destId, options) {
    try {
      const res = await this.compressionRunner.runOptimizationJob(destId, options);
      this.closeModal();
      this.toast.show(
        `Optimized ${res.processedCount} image(s) — Saved ${(res.totalSavedBytes / 1000).toFixed(1)} KB`,
        { type: 'success' }
      );
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  handleDestinationContextMenu(destId, x, y) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return;
    this.contextMenu.open(x, y, [
      {
        label: `Sort Active File into "${dest.name}"`,
        shortcut: dest.shortcut || '',
        onClick: () => this.actions.onSortActiveIntoDestination(destId)
      },
      {
        label: `${dest.pinned ? 'Unpin' : 'Pin'} Destination`,
        onClick: () => this.destinationManager.updateDestination(destId, { pinned: !dest.pinned })
      },
      {
        label: 'Move to Top Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'top' })
      },
      {
        label: 'Move to Left Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'left' })
      },
      {
        label: 'Move to Right Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'right' })
      },
      {
        label: 'Move to Bottom Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'bottom' })
      },
      { divider: true },
      {
        label: '🖼️ Optimize Folder Images...',
        onClick: () => this.openModal('compression', { destinationId: destId })
      },
      {
        label: '⚙️ Edit Destination Settings...',
        onClick: () => this.openModal('destination', { destinationId: destId })
      },
      {
        label: 'Duplicate Destination Config',
        onClick: () => this.destinationManager.duplicateDestinationConfig(destId)
      },
      {
        label: 'Remove from Workspace',
        onClick: () => this.destinationManager.removeDestinationFromWorkspace(destId)
      }
    ]);
  }

  handleMediaCardContextMenu(fileRecord, x, y) {
    if (!fileRecord) return;
    const items = [
      {
        label: fileRecord.favorite ? '★ Remove Favorite' : '☆ Mark as Favorite',
        onClick: () => this.sortingEngine.toggleFavorite(fileRecord.id)
      },
      {
        label: '⏭ Skip File (Move to Skipped Queue)',
        shortcut: 'Del',
        onClick: () => this.sortingEngine.skipFile(fileRecord.id)
      },
      {
        label: '🔖 Place in Review Later Queue',
        onClick: () => this.sortingEngine.markReviewLater(fileRecord.id)
      },
      { divider: true }
    ];

    for (const dest of Array.from(this.store.destinations.values()).slice(0, 6)) {
      items.push({
        label: `Sort → ${dest.emoji} ${dest.name}`,
        shortcut: dest.shortcut || '',
        onClick: () => this.handleSortFiles([fileRecord.id], dest.id)
      });
    }

    this.contextMenu.open(x, y, items);
  }

  openModal(modalName, payload = null) {
    this.store.ui.activeModal = modalName;
    this.store.ui.modalPayload = payload;
    this.renderModalSection();
  }

  closeModal() {
    this.store.ui.activeModal = null;
    this.store.ui.modalPayload = null;
    this.modalMountEl.innerHTML = '';
  }

  _onStateChanged(section, payload) {
    if (section === 'files-imported') {
      const sample = Array.from(this.store.files.values()).slice(-12);
      this.animationController.playImportVortex(this.centerStageEl, sample);
      this.toast.show(
        `Imported ${payload?.eligibleFiles || 0} eligible file(s) (${payload?.ignoredFiles || 0} filtered)`,
        { type: 'success' }
      );
      this.renderAll();
      return;
    }

    if (section === 'scan' || section === 'scan-progress') {
      renderScanProgressBanner(this.scanBannerEl, this.store, this.actions);
      return;
    }

    if (section === 'file-sorted' && payload?.quotaExceeded) {
      this.toast.show(
        `Quota Warning: "${payload.destination.name}" has reached its configured size threshold.`,
        { type: 'warning' }
      );
    }

    this.renderAll();
  }

  renderToolbarSection() {
    renderToolbar(this.toolbarEl, this.store, this.historyManager, this.actions);
  }

  renderBanksSection() {
    renderDestinationBank(this.bankTopEl, 'top', this.store, this.actions);
    renderDestinationBank(this.bankLeftEl, 'left', this.store, this.actions);
    renderDestinationBank(this.bankRightEl, 'right', this.store, this.actions);
    renderDestinationBank(this.bankBottomEl, 'bottom', this.store, this.actions);
  }

  renderCenterStage() {
    if (this.store.files.size === 0) {
      renderInitialMediaPool(this.centerStageEl, this.store, this.actions);
    } else {
      renderActiveSortingWorkspace(
        this.centerStageEl,
        this.store,
        this.previewManager,
        this.dragController,
        this.selectionManager,
        this.actions
      );
    }
  }

  renderModalSection() {
    this.modalMountEl.innerHTML = '';
    const m = this.store.ui.activeModal;
    const p = this.store.ui.modalPayload;
    if (!m) return;

    let modalEl = null;
    if (m === 'filters') {
      modalEl = renderMediaFilterModal(this.store, this.actions);
    } else if (m === 'settings') {
      modalEl = renderSettingsModal(this.store, this.actions);
    } else if (m === 'stats') {
      modalEl = renderStatisticsModal(this.store, this.duplicateDetector, this.actions);
    } else if (m === 'command-palette') {
      modalEl = renderCommandPaletteModal(this.store, this.actions);
    } else if (m === 'destination') {
      modalEl = renderDestinationDialog(this.store, p, this.actions);
    } else if (m === 'compression') {
      modalEl = renderCompressionModal(this.store, p?.destinationId, this.compressionRunner, this.actions);
    } else if (m === 'rules') {
      modalEl = renderSmartRulesModal(this.store, this.rulesEngine, this.actions);
    } else if (m === 'help') {
      modalEl = renderHelpModal(this.store, this.actions);
    }

    if (modalEl) {
      this.modalMountEl.appendChild(modalEl);
    }
  }

  renderAll() {
    this.renderToolbarSection();
    renderScanProgressBanner(this.scanBannerEl, this.store, this.actions);
    this.renderBanksSection();
    this.renderCenterStage();
  }
}
