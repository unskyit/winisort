import { serializeProjectManifest } from './manifest.js';

export class CheckpointManager {
  constructor(store) {
    this.store = store;
    this.opsSinceLastCheckpoint = 0;
    this.checkpoints = [];
  }

  createSnapshot(label = 'auto') {
    const manifest = serializeProjectManifest(this.store);
    const snapshot = {
      id: `ckpt_${Date.now()}`,
      label,
      timestamp: Date.now(),
      manifest
    };
    this.checkpoints.push(snapshot);
    if (this.checkpoints.length > 10) {
      this.checkpoints.shift();
    }
    this.opsSinceLastCheckpoint = 0;
    return snapshot;
  }

  notifyOperationCompleted() {
    this.opsSinceLastCheckpoint++;
    const interval = this.store.preferences.autoCheckpointInterval || 10;
    if (this.opsSinceLastCheckpoint >= interval) {
      return this.createSnapshot('auto');
    }
    return null;
  }
}
