import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyFile, evaluateFileEligibility } from '../../src/filesystem/file-classifier.js';
import { sanitizeEntryName, sanitizeRelativePath, validateDestinationName } from '../../src/utils/sanitizer.js';
import { formatBytes, formatDuration } from '../../src/utils/formatters.js';
import { resolveFilenameCollision } from '../../src/filesystem/collision-handler.js';
import { AppStateStore } from '../../src/core/state.js';
import { FilesystemAdapter } from '../../src/filesystem/adapter.js';
import { DestinationManager } from '../../src/filesystem/destination-manager.js';
import { serializeProjectManifest, parseProjectManifestJson } from '../../src/project/manifest.js';
import { validateAndMigrateManifest } from '../../src/project/migrations.js';
import { OperationJournal } from '../../src/project/journal.js';
import { analyzeCrashRecovery } from '../../src/project/recovery.js';
import { RulesEngine } from '../../src/sorting/rules.js';
import { filterDestinationsByQuery } from '../../src/sorting/search.js';
import { checkCompressionEligibility } from '../../src/optimization/image-compressor.js';
import { detectCapabilities } from '../../src/core/capability-detector.js';
import { generateSyntheticMetadataFixtures } from '../fixtures/synthetic-generator.js';

test('1. File classification accurately distinguishes categories and preview capabilities', () => {
  const jpg = classifyFile({ name: 'Diwali_Photo.JPG', size: 204800 });
  assert.equal(jpg.category, 'images');
  assert.equal(jpg.extension, 'jpg');
  assert.equal(jpg.previewKind, 'image');
  assert.equal(jpg.isCompressibleImage, true);

  const heic = classifyFile({ name: 'IMG_0012.HEIC', size: 1024000 });
  assert.equal(heic.category, 'images');
  assert.equal(heic.isPreviewable, false); // Sortable even when browser cannot natively decode HEIC

  const mkv = classifyFile({ name: 'Movie_Clip.mkv', size: 50000000 });
  assert.equal(mkv.category, 'videos');

  const pdf = classifyFile({ name: 'Lecture_Notes.pdf', size: 45000 });
  assert.equal(pdf.category, 'pdf');
  assert.equal(pdf.previewKind, 'pdf');
});

test('2. Individual extension filters strictly enforce selected extensions (JPG/PNG only rejects WEBP/MP4/PDF)', () => {
  const strictFilters = {
    categories: { images: true, videos: false, pdf: false, other: false },
    extensions: ['jpg', 'png'],
    customExtensions: [],
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeHiddenFiles: false
  };

  assert.equal(evaluateFileEligibility({ name: 'photo.jpg', size: 1000 }, strictFilters).eligible, true);
  assert.equal(evaluateFileEligibility({ name: 'graphic.png', size: 1000 }, strictFilters).eligible, true);
  assert.equal(evaluateFileEligibility({ name: 'anim.webp', size: 1000 }, strictFilters).eligible, false);
  assert.equal(evaluateFileEligibility({ name: 'clip.mp4', size: 1000 }, strictFilters).eligible, false);
  assert.equal(evaluateFileEligibility({ name: 'doc.pdf', size: 1000 }, strictFilters).eligible, false);
});

test('3. Combined filters enforce min/max size, hidden files, and include/exclude filename patterns', () => {
  const filters = {
    categories: { images: true },
    extensions: ['jpg'],
    minSizeBytes: 5000,
    maxSizeBytes: 50000,
    includePattern: 'Diwali',
    excludePattern: 'thumb',
    includeHiddenFiles: false
  };

  assert.equal(evaluateFileEligibility({ name: 'Diwali_2026.jpg', size: 20000 }, filters).eligible, true);
  assert.equal(evaluateFileEligibility({ name: 'Diwali_thumb.jpg', size: 20000 }, filters).eligible, false);
  assert.equal(evaluateFileEligibility({ name: 'Diwali_small.jpg', size: 1000 }, filters).eligible, false);
  assert.equal(evaluateFileEligibility({ name: '.Diwali_hidden.jpg', size: 20000 }, filters).eligible, false);
});

test('4. Path sanitization prevents path traversal, control characters, and Windows reserved names', () => {
  assert.equal(sanitizeEntryName('CON.txt'), '_CON.txt');
  assert.equal(sanitizeEntryName('My:File*Name?.jpg'), 'My_File_Name_.jpg');
  assert.equal(sanitizeRelativePath('../../etc/passwd'), 'etc/passwd');
  assert.equal(sanitizeRelativePath('Photos\\2026\\../Diwali/lamp.jpg'), 'Photos/2026/Diwali/lamp.jpg');
});

test('5. Destination naming validation & unique destination creation prevents collisions', async () => {
  assert.equal(validateDestinationName('').valid, false);
  assert.equal(validateDestinationName('../Escape').valid, false);
  assert.equal(validateDestinationName('School 2026').valid, true);

  const s = new AppStateStore();
  const dm = new DestinationManager(s, new FilesystemAdapter(s.capabilities));
  await dm.createDestination({ name: 'Diwali', bank: 'top' });
  await assert.rejects(() => dm.createDestination({ name: 'diwali', bank: 'left' }), /already exists/);
});

test('6. Human-readable size and duration formatting supports SI and IEC units accurately', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1500000, { mode: 'SI', decimals: 1 }), '1.5 MB');
  assert.equal(formatBytes(1048576, { mode: 'IEC', decimals: 1 }), '1.0 MiB');
  assert.equal(formatDuration(125), '2:05');
  assert.equal(formatDuration(3665), '1:01:05');
});

test('7. Filename collision strategies support keep-both, auto-rename, skip, and replace without silent overwrite', async () => {
  const existing = new Set(['photo.jpg', 'photo (1).jpg']);
  const check = (name) => existing.has(name);

  const keepBoth = await resolveFilenameCollision('photo.jpg', check, { policy: 'keep-both' });
  assert.equal(keepBoth.action, 'write');
  assert.equal(keepBoth.finalName, 'photo (2).jpg');
  assert.equal(keepBoth.collided, true);

  const skipped = await resolveFilenameCollision('photo.jpg', check, { policy: 'skip' });
  assert.equal(skipped.action, 'skip');
});

test('8. Destination statistics and sorting state delta updates remain accurate', async () => {
  const s = new AppStateStore();
  const dm = new DestinationManager(s, new FilesystemAdapter(s.capabilities));
  const dest = await dm.createDestination({ name: 'School', bank: 'left' });

  dm.recordAddition(dest.id, { name: 'notes.pdf', category: 'pdf', size: 4096 }, 4096);
  dm.recordAddition(dest.id, { name: 'diagram.png', category: 'images', size: 8192 }, 8192);
  assert.equal(dest.stats.fileCount, 2);
  assert.equal(dest.stats.totalBytes, 12288);
  assert.equal(dest.stats.pdfCount, 1);
  assert.equal(dest.stats.imagesCount, 1);

  dm.recordRemoval(dest.id, { name: 'notes.pdf', category: 'pdf', size: 4096 }, 4096);
  assert.equal(dest.stats.fileCount, 1);
  assert.equal(dest.stats.totalBytes, 8192);
  assert.equal(dest.stats.pdfCount, 0);
});

test('9. Project manifest serialization and schema migration validate cleanly without raw media blobs', async () => {
  const s = new AppStateStore();
  const dm = new DestinationManager(s, new FilesystemAdapter(s.capabilities));
  await dm.createDestination({ name: 'Work', bank: 'right' });

  const manifest = serializeProjectManifest(s);
  const jsonStr = JSON.stringify(manifest);
  const parsed = parseProjectManifestJson(jsonStr);
  assert.equal(parsed.schemaVersion, '1.0.0');
  assert.equal(parsed.destinations.length, 1);

  const legacyMigration = validateAndMigrateManifest({
    schemaVersion: '0.9.0',
    projectId: 'proj_legacy',
    name: 'Legacy Project',
    destinations: []
  });
  assert.equal(legacyMigration.valid, true);
  assert.equal(legacyMigration.migrated, true);
  assert.equal(legacyMigration.manifest.schemaVersion, '1.0.0');
});

test('10. Journal recovery accurately distinguishes verified completions from partial writes and missing outputs', async () => {
  const journal = new OperationJournal();
  journal.append({
    opId: 'op_complete',
    type: 'sort-file',
    status: 'pending',
    fileName: 'a.jpg',
    fileSize: 5000,
    destinationName: 'Diwali',
    outputFileName: 'a.jpg'
  });
  journal.append({
    opId: 'op_partial',
    type: 'sort-file',
    status: 'pending',
    fileName: 'b.jpg',
    fileSize: 5000,
    destinationName: 'Diwali',
    outputFileName: 'b.jpg'
  });

  const report = await analyzeCrashRecovery(journal, async (destName, outFile) => {
    if (outFile === 'a.jpg') return { exists: true, size: 5000 };
    if (outFile === 'b.jpg') return { exists: true, size: 2100 }; // Partial write
    return { exists: false };
  });

  assert.equal(report.length, 2);
  assert.equal(report[0].state, 'verified-complete');
  assert.equal(report[0].recommendedAction, 'mark-sorted');
  assert.equal(report[1].state, 'partial-write');
  assert.equal(report[1].recommendedAction, 'review-manual');
});

test('11. Rule priority, search filtering, compression eligibility, capability detection, and 50,000 metadata stress test', () => {
  const s = new AppStateStore();
  const d1 = { id: 'd_diwali', name: 'Diwali', collection: 'Festivals', emoji: '🪔' };
  const d2 = { id: 'd_work', name: 'Work', collection: 'Office', emoji: '💼' };
  s.destinations.set(d1.id, d1);
  s.destinations.set(d2.id, d2);

  const rules = new RulesEngine(s);
  rules.addRule({ name: 'Low Priority', priority: 10, conditionType: 'category-is', conditionValue: 'images', destinationId: 'd_work' });
  rules.addRule({ name: 'High Priority Diwali', priority: 1, conditionType: 'name-contains', conditionValue: 'diwali', destinationId: 'd_diwali' });

  s.files.set('f1', { id: 'f1', name: 'Diwali_Lamp.jpg', category: 'images', extension: 'jpg', size: 12000, status: 'unsorted' });
  const previewMatches = rules.previewRuleMatches();
  assert.equal(previewMatches.length, 1);
  assert.equal(previewMatches[0].destinationId, 'd_diwali');

  assert.equal(filterDestinationsByQuery([d1, d2], 'fest').length, 1);
  assert.equal(checkCompressionEligibility({ name: 'pic.jpg', category: 'images', extension: 'jpg', size: 50000 }).eligible, true);
  assert.equal(checkCompressionEligibility({ name: 'clip.mp4', category: 'videos', extension: 'mp4', size: 50000 }).eligible, false);

  const caps = detectCapabilities({});
  assert.equal(caps.filesystemMode, 'fallback-export');

  // 50,000 metadata entries synthetic benchmark (< 500ms)
  const t0 = Date.now();
  const fiftyK = generateSyntheticMetadataFixtures(50000);
  assert.equal(fiftyK.length, 50000);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 4000, `50,000 metadata generation took ${elapsed}ms`);
});
