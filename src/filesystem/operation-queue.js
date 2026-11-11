import { createId } from '../utils/ids.js';

/**
 * Backpressure-aware, cancelable operation queue for single and batch sorting jobs.
 */
export class OperationQueue {
  constructor(concurrency = 2) {
    this.concurrency = Math.max(1, concurrency);
    this.queue = [];
    this.activeCount = 0;
    this.abortController = new AbortController();
  }

  setConcurrency(limit) {
    this.concurrency = Math.max(1, Math.min(limit || 2, 8));
  }

  /**
   * Enqueues an async task and returns a promise resolving when the task completes.
   * @param {(signal: AbortSignal) => Promise<any>} taskFn
   * @param {Object} [meta]
   * @returns {Promise<any>}
   */
  enqueue(taskFn, meta = {}) {
    const opId = createId('op');
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: opId,
        meta,
        taskFn,
        resolve,
        reject
      });
      this._drain();
    });
  }

  cancelAllPending() {
    this.abortController.abort();
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.reject(new DOMException('Queued operation canceled', 'AbortError'));
    }
    this.abortController = new AbortController();
  }

  getPendingCount() {
    return this.queue.length + this.activeCount;
  }

  async _drain() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.activeCount++;
      const signal = this.abortController.signal;

      Promise.resolve()
        .then(() => item.taskFn(signal))
        .then((res) => item.resolve(res))
        .catch((err) => item.reject(err))
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          this._drain();
        });
    }
  }
}
