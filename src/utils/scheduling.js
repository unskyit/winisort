/**
 * Bounded concurrency runner for async tasks without Promise.all() memory spikes.
 * @template T, R
 * @param {Iterable<T>} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} workerFn
 * @param {AbortSignal} [signal]
 * @returns {Promise<R[]>}
 */
export async function runBoundedConcurrent(items, concurrency, workerFn, signal) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const limit = Math.max(1, Math.min(concurrency || 2, 16));
  let cursor = 0;

  async function next() {
    while (cursor < list.length) {
      if (signal && signal.aborted) {
        throw new DOMException('Operation aborted', 'AbortError');
      }
      const idx = cursor++;
      results[idx] = await workerFn(list[idx], idx);
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(limit, list.length); i++) {
    runners.push(next());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Throttles a function so it executes at most once per `waitMs`.
 * @param {Function} fn
 * @param {number} waitMs
 * @returns {Function}
 */
export function throttle(fn, waitMs = 100) {
  let lastRun = 0;
  let timer = null;
  let lastArgs = null;

  return function throttled(...args) {
    const now = Date.now();
    const remaining = waitMs - (now - lastRun);
    lastArgs = args;
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastRun = now;
      fn.apply(this, lastArgs);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        fn.apply(this, lastArgs);
      }, remaining);
    }
  };
}

/**
 * Schedules low-priority work during browser idle periods with fallback.
 * @param {Function} callback
 * @param {number} [timeout=500]
 * @returns {number}
 */
export function scheduleIdleTask(callback, timeout = 500) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout });
  }
  return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 15 }), 16);
}
