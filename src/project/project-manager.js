import { serializeProjectManifest, parseProjectManifestJson } from './manifest.js';
import { OperationJournal } from './journal.js';
import { CheckpointManager } from './checkpoints.js';
import { analyzeCrashRecovery } from './recovery.js';
import { triggerBrowserDownload } from '../filesystem/export-fallback.js';

/**
 * Manages disk-first `.winisort/` project persistence inside the user-selected output root directory,
 * plus portable JSON export/import when operating in fallback browsers.
 */
export class ProjectManager {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
    this.journal = new OperationJournal();
    this.checkpoints = new CheckpointManager(store);
  }

  /**
   * Writes `.winisort/project.json` and `.winisort/operations.jsonl` to the connected outputRootHandle if available.
   */
  async saveProjectToDisk() {
    const manifest = serializeProjectManifest(this.store);
    const rootHandle = this.store.project.outputRootHandle;

    if (rootHandle && typeof rootHandle.getDirectoryHandle === 'function') {
      const metaDir = await this.adapter.getSubdirectory(rootHandle, '.winisort', true);
      await this._writeTextFile(metaDir, 'project.json', JSON.stringify(manifest, null, 2));
      await this._writeTextFile(metaDir, 'operations.jsonl', this.journal.toJsonLines());
      this.store.project.isDirty = false;
      this.store.project.updatedAt = Date.now();
      this.store.notify('project-saved', { mode: 'disk', path: `${rootHandle.name}/.winisort/project.json` });
      return { mode: 'disk', manifest };
    }

    // Fallback: trigger portable JSON download
    this.exportPortableProjectJson();
    return { mode: 'download', manifest };
  }

  exportPortableProjectJson() {
    const manifest = serializeProjectManifest(this.store);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const safeTitle = (this.store.project.name || 'winisort-project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    triggerBrowserDownload(blob, `${safeTitle}.winisort.json`);
    this.store.project.isDirty = false;
    this.store.notify('project-exported', manifest);
    return manifest;
  }

  /**
   * Restores project configuration, destinations, filters, and assignment statuses from a manifest object.
   * @param {Object} manifest
   */
  async restoreFromManifest(manifest) {
    this.store.project.id = manifest.projectId || this.store.project.id;
    this.store.project.name = manifest.name || 'Restored Project';
    if (manifest.preferences) {
      this.store.preferences = { ...this.store.preferences, ...manifest.preferences };
    }
    if (manifest.filters) {
      this.store.filters = { ...this.store.filters, ...manifest.filters };
    }
    if (Array.isArray(manifest.rules)) {
      this.store.rules = manifest.rules;
    }

    // Restore destinations
    this.store.destinations.clear();
    for (const d of manifest.destinations || []) {
      let dirHandle = null;
      if (this.store.project.outputRootHandle && !d.isExternalConnection) {
        try {
          dirHandle = await this.adapter.getSubdirectory(
            this.store.project.outputRootHandle,
            d.folderName || d.name,
            true
          );
        } catch (_) {}
      }
      this.store.destinations.set(d.id, {
        ...d,
        dirHandle,
        exportedFiles: new Map(),
        stats: d.stats || this.destinationManager._createEmptyStats()
      });
    }

    // Reconcile assignment statuses against currently imported files by fingerprint
    const assignmentByFp = new Map();
    for (const a of manifest.assignments || []) {
      if (a.fingerprint) assignmentByFp.set(a.fingerprint, a);
    }

    for (const file of this.store.files.values()) {
      const matched = assignmentByFp.get(file.fingerprint);
      if (matched) {
        file.status = matched.status || file.status;
        file.favorite = Boolean(matched.favorite);
        file.assignedDestinationId = matched.assignedDestinationId || null;
        file.sortedOutputName = matched.sortedOutputName || null;
      }
    }

    this.store.recomputeDerivedState();
    this.store.notify('project-restored', manifest);
  }

  /**
   * Inspects an output directory for `.winisort/project.json` and `.winisort/operations.jsonl`,
   * restores metadata, and runs crash recovery diagnostics.
   * @param {FileSystemDirectoryHandle} outputRootHandle
   */
  async loadAndRecoverFromDirectory(outputRootHandle) {
    await this.destinationManager.setOutputRootDirectory(outputRootHandle);
    try {
      const metaDir = await outputRootHandle.getDirectoryHandle('.winisort', { create: false });
      const projText = await this._readTextFile(metaDir, 'project.json');
      if (projText) {
        const manifest = parseProjectManifestJson(projText);
        await this.restoreFromManifest(manifest);
      }

      const journalText = await this._readTextFile(metaDir, 'operations.jsonl');
      if (journalText) {
        this.journal = OperationJournal.fromJsonLines(journalText);
        const recoveryItems = await analyzeCrashRecovery(this.journal, async (destName, outputFileName) => {
          try {
            const sub = await outputRootHandle.getDirectoryHandle(destName, { create: false });
            const fh = await sub.getFileHandle(outputFileName, { create: false });
            const f = await fh.getFile();
            return { exists: true, size: f.size };
          } catch (_) {
            return { exists: false };
          }
        });
        this.store.recoveryItems = recoveryItems;
        this.store.notify('recovery-analyzed', recoveryItems);
        return recoveryItems;
      }
    } catch (_) {
      // No existing .winisort directory yet — fresh output directory
    }
    return [];
  }

  async _writeTextFile(dirHandle, filename, content) {
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async _readTextFile(dirHandle, filename) {
    try {
      const fh = await dirHandle.getFileHandle(filename, { create: false });
      const f = await fh.getFile();
      return await f.text();
    } catch (_) {
      return null;
    }
  }
}
