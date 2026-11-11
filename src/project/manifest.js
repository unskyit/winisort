import { CURRENT_SCHEMA_VERSION, validateAndMigrateManifest } from './migrations.js';
import { WiniSortError, ErrorCode } from '../core/errors.js';

/**
 * Serializes the current application state into a portable, human-readable project.json structure.
 * Never embeds raw File objects, Blobs, or base64 media previews.
 * @param {import('../core/state.js').AppStateStore} store
 * @returns {Object}
 */
export function serializeProjectManifest(store) {
  const sources = [];
  for (const src of store.sources.values()) {
    sources.push({
      id: src.id,
      name: src.name,
      kind: src.kind,
      addedAt: src.addedAt,
      fileCount: src.fileCount,
      totalBytes: src.totalBytes
    });
  }

  const destinations = [];
  for (const dest of store.destinations.values()) {
    destinations.push({
      id: dest.id,
      name: dest.name,
      folderName: dest.folderName,
      emoji: dest.emoji,
      color: dest.color,
      bank: dest.bank,
      pinned: dest.pinned,
      favorite: dest.favorite,
      shortcut: dest.shortcut,
      collection: dest.collection,
      quotaBytes: dest.quotaBytes,
      isAppCreated: dest.isAppCreated,
      isExternalConnection: dest.isExternalConnection,
      stats: { ...dest.stats }
    });
  }

  const assignments = [];
  for (const file of store.files.values()) {
    if (file.status !== 'unsorted' || file.favorite) {
      assignments.push({
        fileId: file.id,
        name: file.name,
        relativePath: file.relativePath,
        size: file.size,
        lastModified: file.lastModified,
        fingerprint: file.fingerprint,
        status: file.status,
        favorite: Boolean(file.favorite),
        assignedDestinationId: file.assignedDestinationId,
        sortedOutputName: file.sortedOutputName
      });
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: store.project.id,
    name: store.project.name,
    createdAt: store.project.createdAt,
    updatedAt: Date.now(),
    outputRootName: store.project.outputRootName || null,
    preferences: { ...store.preferences },
    filters: { ...store.filters },
    rules: Array.from(store.rules || []),
    sources,
    destinations,
    assignments,
    stats: { ...store.stats }
  };
}

/**
 * Parses and validates a JSON string into a verified project manifest object.
 * @param {string} jsonText
 * @returns {Object}
 */
export function parseProjectManifestJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new WiniSortError(
      ErrorCode.INVALID_PROJECT_JSON,
      'The selected project file is not valid JSON.',
      { cause: err }
    );
  }
  const result = validateAndMigrateManifest(parsed);
  if (!result.valid) {
    throw new WiniSortError(
      ErrorCode.CORRUPTED_MANIFEST,
      `Invalid project manifest: ${result.errors.join(' ')}`
    );
  }
  return result.manifest;
}
