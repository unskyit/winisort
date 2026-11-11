import { bus } from './event-bus.js';
import { createId } from '../utils/ids.js';
import { detectCapabilities } from './capability-detector.js';
import { createDefaultPreferences, createDefaultFilters } from './configuration.js';

/**
 * Predictable, event-driven application state store for WiniSort.
 * Separates UI state, sources, destinations, active file references, operations, and statistics.
 */
export class AppStateStore {
  constructor() {
    this.capabilities = detectCapabilities();
    this.reset();
  }

  reset() {
    this.project = {
      id: createId('proj'),
      schemaVersion: '1.0.0',
      name: 'My WiniSort Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputRootName: null,
      outputRootHandle: null,
      isDirty: false
    };

    this.ui = {
      activeModal: null, // 'filters' | 'settings' | 'stats' | 'rules' | 'duplicates' | 'compression' | 'recovery' | 'help' | 'command-palette' | 'new-destination'
      modalPayload: null,
      quickSortMode: false,
      focusMode: false,
      searchQuery: '',
      statusFilter: 'unsorted', // 'unsorted' | 'all' | 'sorted' | 'skipped' | 'review-later' | 'favorites'
      categoryFilter: 'all',
      activeFileId: null,
      selectedFileIds: new Set(),
      recentDestinationIds: [],
      draggingFileIds: [],
      dropTargetDestinationId: null,
      isScanning: false,
      scanProgress: {
        foldersDiscovered: 0,
        filesScanned: 0,
        eligibleFiles: 0,
        ignoredFiles: 0,
        totalEligibleBytes: 0,
        currentFolder: '',
        startedAt: 0,
        elapsedMs: 0,
        errors: []
      },
      sessionStartedAt: Date.now(),
      offlineReady: false
    };

    this.preferences = createDefaultPreferences();
    this.filters = createDefaultFilters();

    /** @type {Map<string, Object>} sourceId -> source descriptor */
    this.sources = new Map();

    /** @type {Map<string, Object>} destinationId -> destination descriptor */
    this.destinations = new Map();

    /** @type {Map<string, Object>} fileId -> lightweight file metadata record (File handle kept by reference, never serialized into JSON) */
    this.files = new Map();

    /** @type {string[]} Ordered list of fileIds matching current filter/search */
    this.filteredFileIds = [];

    /** @type {Map<string, Object>} operationId -> active/completed operation */
    this.operations = new Map();

    /** @type {Array<Object>} Automation rules */
    this.rules = [];

    /** @type {Array<Object>} Recovery findings */
    this.recoveryItems = [];

    this.stats = {
      totalFiles: 0,
      unsortedCount: 0,
      sortedCount: 0,
      skippedCount: 0,
      reviewLaterCount: 0,
      favoriteCount: 0,
      totalEligibleBytes: 0,
      sortedBytes: 0,
      completedCopyBytes: 0,
      failedCopyBytes: 0,
      compressionSavedBytes: 0,
      errorsCount: 0
    };
  }

  /**
   * Recomputes filteredFileIds and aggregate session counters cleanly.
   */
  recomputeDerivedState() {
    const query = (this.ui.searchQuery || '').trim().toLowerCase();
    const statusFilter = this.ui.statusFilter;
    const catFilter = this.ui.categoryFilter;

    let unsortedCount = 0;
    let sortedCount = 0;
    let skippedCount = 0;
    let reviewLaterCount = 0;
    let favoriteCount = 0;
    let totalEligibleBytes = 0;
    let sortedBytes = 0;

    const matchingIds = [];

    for (const [id, file] of this.files.entries()) {
      totalEligibleBytes += file.size || 0;
      if (file.favorite) favoriteCount++;

      if (file.status === 'sorted') {
        sortedCount++;
        sortedBytes += file.size || 0;
      } else if (file.status === 'skipped') {
        skippedCount++;
      } else if (file.status === 'review-later') {
        reviewLaterCount++;
      } else {
        unsortedCount++;
      }

      // Check status filter
      let statusMatch = true;
      if (statusFilter === 'unsorted') statusMatch = file.status === 'unsorted';
      else if (statusFilter === 'sorted') statusMatch = file.status === 'sorted';
      else if (statusFilter === 'skipped') statusMatch = file.status === 'skipped';
      else if (statusFilter === 'review-later') statusMatch = file.status === 'review-later';
      else if (statusFilter === 'favorites') statusMatch = Boolean(file.favorite);

      if (!statusMatch) continue;

      if (catFilter !== 'all' && file.category !== catFilter) continue;

      if (query) {
        const hay = `${file.name} ${file.extension} ${file.relativePath || ''} ${file.category}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      matchingIds.push(id);
    }

    this.filteredFileIds = matchingIds;
    this.stats.totalFiles = this.files.size;
    this.stats.unsortedCount = unsortedCount;
    this.stats.sortedCount = sortedCount;
    this.stats.skippedCount = skippedCount;
    this.stats.reviewLaterCount = reviewLaterCount;
    this.stats.favoriteCount = favoriteCount;
    this.stats.totalEligibleBytes = totalEligibleBytes;
    this.stats.sortedBytes = sortedBytes;

    // Ensure activeFileId remains valid within current filtered view
    if (!this.ui.activeFileId || !this.filteredFileIds.includes(this.ui.activeFileId)) {
      this.ui.activeFileId = this.filteredFileIds.length > 0 ? this.filteredFileIds[0] : null;
    }
  }

  getActiveFile() {
    if (!this.ui.activeFileId) return null;
    return this.files.get(this.ui.activeFileId) || null;
  }

  notify(section = 'all', payload = null) {
    bus.emit('state:changed', { section, payload, state: this });
  }
}

export const store = new AppStateStore();
