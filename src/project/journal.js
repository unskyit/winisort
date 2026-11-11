/**
 * Append-style JSON Lines (operations.jsonl) journal for tracking pending, completed, and undone operations.
 */
export class OperationJournal {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
    /** @type {Array<Object>} */
    this.entries = [];
  }

  /**
   * Records an operation transition ('pending' | 'completed' | 'failed' | 'undone').
   * @param {{
   *   opId: string,
   *   type: string,
   *   status: 'pending' | 'completed' | 'failed' | 'undone',
   *   fileName: string,
   *   fileSize: number,
   *   fingerprint?: string,
   *   destinationId?: string,
   *   destinationName?: string,
   *   outputFileName?: string,
   *   timestamp?: number,
   *   error?: string
   * }} record
   */
  append(record) {
    const entry = {
      ...record,
      timestamp: record.timestamp || Date.now()
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.compact();
    }
    return entry;
  }

  /**
   * Compacts the journal by keeping only the latest state per opId up to maxEntries.
   */
  compact() {
    const latestByOp = new Map();
    for (const entry of this.entries) {
      latestByOp.set(entry.opId, entry);
    }
    this.entries = Array.from(latestByOp.values()).slice(-Math.floor(this.maxEntries * 0.75));
  }

  toJsonLines() {
    return this.entries.map(e => JSON.stringify(e)).join('\n') + (this.entries.length ? '\n' : '');
  }

  static fromJsonLines(jsonlText) {
    const journal = new OperationJournal();
    if (typeof jsonlText !== 'string' || !jsonlText.trim()) return journal;
    const lines = jsonlText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.opId) journal.entries.push(obj);
      } catch (_) {
        // Ignore truncated trailing line from crash
      }
    }
    return journal;
  }
}
