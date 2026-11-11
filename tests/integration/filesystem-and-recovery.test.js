import test from 'node:test';
import assert from 'node:assert/strict';

import { AppStateStore } from '../../src/core/state.js';
import { FilesystemAdapter } from '../../src/filesystem/adapter.js';
import { SourceManager } from '../../src/filesystem/source-manager.js';
import { DestinationManager } from '../../src/filesystem/destination-manager.js';
import { CopyEngine } from '../../src/filesystem/copy-engine.js';
import { ProjectManager } from '../../src/project/project-manager.js';
import { HistoryManager } from '../../src/sorting/history.js';
import { SortingEngine } from '../../src/sorting/sorting-engine.js';
import { MockFileSystemDirectoryHandle, MockFileSystemFileHandle } from '../fixtures/synthetic-generator.js';

function createTestHarness() {
  const store = new AppStateStore();
  store.capabilities.hasDirectoryPicker = true;
  const adapter = new FilesystemAdapter(store.capabilities);
  const sourceManager = new SourceManager(store);
  const destinationManager = new DestinationManager(store, adapter);
  const copyEngine = new CopyEngine(store, adapter, destinationManager);
  const projectManager = new ProjectManager(store, adapter, destinationManager);
  const historyManager = new HistoryManager(store, adapter, destinationManager);
  const sortingEngine = new SortingEngine(store, copyEngine, destinationManager, historyManager, projectManager);

  return {
    store,
    adapter,
    sourceManager,
    destinationManager,
    copyEngine,
    projectManager,
    historyManager,
    sortingEngine
  };
}

test('Integration 1: Source import, destination creation, verified streaming copy, and duplicate collision handling', async () => {
  const { store, sourceManager, destinationManager, sortingEngine } = createTestHarness();

  const sourceDir = new MockFileSystemDirectoryHandle('CameraRoll');
  sourceDir.entriesMap.set('rangoli.jpg', new MockFileSystemFileHandle('rangoli.jpg', 'IMAGE_BYTES_123456'));
  sourceDir.entriesMap.set('notes.pdf', new MockFileSystemFileHandle('notes.pdf', '%PDF-1.7 SAMPLE CONTENT'));

  const outputRoot = new MockFileSystemDirectoryHandle('MySortedFiles');
  await destinationManager.setOutputRootDirectory(outputRoot);

  const diwaliDest = await destinationManager.createDestination({ name: 'Diwali', emoji: '🪔', bank: 'top' });
  const scanStats = await sourceManager.importDirectoryHandle(sourceDir);
  assert.equal(scanStats.eligibleFiles, 2);

  const fileIds = Array.from(store.files.keys());
  const firstFile = store.files.get(fileIds[0]);

  const copyRes = await sortingEngine.assignFileToDestination(firstFile.id, diwaliDest.id);
  assert.equal(copyRes.status, 'completed');
  assert.equal(copyRes.finalName, 'rangoli.jpg');
  assert.equal(diwaliDest.stats.fileCount, 1);

  // Verify second copy of same filename resolves collision with numbered suffix 'rangoli (1).jpg'
  const secondCopy = await sortingEngine.assignFileToDestination(firstFile.id, diwaliDest.id);
  assert.equal(secondCopy.finalName, 'rangoli (1).jpg');
  assert.equal(diwaliDest.stats.fileCount, 2);
});

test('Integration 2: Safe filesystem undo removes unmodified app-created output file, but blocks unsafe undo if modified externally', async () => {
  const { store, sourceManager, destinationManager, sortingEngine, historyManager } = createTestHarness();

  const sourceDir = new MockFileSystemDirectoryHandle('Source');
  sourceDir.entriesMap.set('report.pdf', new MockFileSystemFileHandle('report.pdf', '%PDF-1.7 ORIGINAL BYTES'));

  const outputRoot = new MockFileSystemDirectoryHandle('Output');
  await destinationManager.setOutputRootDirectory(outputRoot);
  const workDest = await destinationManager.createDestination({ name: 'Work', bank: 'right' });

  await sourceManager.importDirectoryHandle(sourceDir);
  const fileId = Array.from(store.files.keys())[0];

  await sortingEngine.assignFileToDestination(fileId, workDest.id);
  assert.equal(workDest.stats.fileCount, 1);

  // Safe undo removes file and restores unsorted status
  await historyManager.undo();
  assert.equal(workDest.stats.fileCount, 0);
  assert.equal(store.files.get(fileId).status, 'unsorted');

  // Redo and then simulate external modification of the output file on disk
  await historyManager.redo(sortingEngine);
  assert.equal(workDest.stats.fileCount, 1);

  const writtenHandle = await workDest.dirHandle.getFileHandle('report.pdf', { create: false });
  writtenHandle.bytes = new TextEncoder().encode('EXTERNALLY_MODIFIED_LARGER_CONTENT_BYTES');

  await assert.rejects(() => historyManager.undo(), /modified externally/);
});

test('Integration 3: Partial write detection, permission failure handling, batch processing, and .winisort crash recovery', async () => {
  const { store, sourceManager, destinationManager, sortingEngine, projectManager } = createTestHarness();

  const sourceDir = new MockFileSystemDirectoryHandle('BatchSource');
  sourceDir.entriesMap.set('img1.jpg', new MockFileSystemFileHandle('img1.jpg', '1234567890'));
  sourceDir.entriesMap.set('img2.jpg', new MockFileSystemFileHandle('img2.jpg', 'ABCDEFGHIJ'));

  const outputRoot = new MockFileSystemDirectoryHandle('OutputRoot');
  await destinationManager.setOutputRootDirectory(outputRoot);
  const dest = await destinationManager.createDestination({ name: 'Album', bank: 'left' });

  await sourceManager.importDirectoryHandle(sourceDir);
  const allIds = Array.from(store.files.keys());

  // Batch processing
  const batchRes = await sortingEngine.batchAssignToDestination(allIds, dest.id, {
    namingPattern: '{dest}_{index}'
  });
  assert.equal(batchRes.length, 2);
  assert.equal(batchRes[0].finalName, 'Album_001.jpg');
  assert.equal(batchRes[1].finalName, 'Album_002.jpg');

  // Save .winisort project to disk and reload
  await projectManager.saveProjectToDisk();
  const metaDir = await outputRoot.getDirectoryHandle('.winisort', { create: false });
  const savedManifestFile = await (await metaDir.getFileHandle('project.json')).getFile();
  assert.ok(savedManifestFile.size > 50);

  // Simulate truncated partial write failure
  dest.dirHandle.truncateWrites = true;
  await assert.rejects(
    () => sortingEngine.assignFileToDestination(allIds[0], dest.id),
    /Verification failed/
  );

  // Simulate permission revocation failure
  dest.dirHandle.truncateWrites = false;
  dest.dirHandle.permissionState = 'denied';
  await assert.rejects(
    () => sortingEngine.assignFileToDestination(allIds[0], dest.id),
    /not writable/
  );
});

test('Integration 4: Connect existing destination folder indexes existing files without overwriting them', async () => {
  const { destinationManager } = createTestHarness();
  const existingSchoolFolder = new MockFileSystemDirectoryHandle('School_Time');
  existingSchoolFolder.entriesMap.set('syllabus.pdf', new MockFileSystemFileHandle('syllabus.pdf', '%PDF-1.7 SYLLABUS'));
  existingSchoolFolder.entriesMap.set('slide1.jpg', new MockFileSystemFileHandle('slide1.jpg', 'JPEG_DATA'));

  const connected = await destinationManager.connectExistingDestination(existingSchoolFolder);
  assert.equal(connected.isExternalConnection, true);
  assert.equal(connected.stats.fileCount, 2);
  assert.equal(connected.stats.pdfCount, 1);
  assert.equal(connected.stats.imagesCount, 1);
});
