/**
 * Analyzes an OperationJournal (and optional disk directory verification) to detect interrupted or partial operations.
 * Distinguishes valid completions from partial/interrupted operations without ever deleting uncertain files automatically.
 *
 * @param {import('./journal.js').OperationJournal} journal
 * @param {(destName: string, outputFileName: string) => Promise<{ exists: boolean, size?: number }>} [diskInspector]
 * @returns {Promise<Array<{
 *   opId: string,
 *   fileName: string,
 *   destinationName: string,
 *   outputFileName: string,
 *   expectedSize: number,
 *   actualSize: number | null,
 *   state: 'verified-complete' | 'partial-write' | 'missing-output' | 'failed',
 *   recommendedAction: 'mark-sorted' | 'retry-copy' | 'review-manual'
 * }>>}
 */
export async function analyzeCrashRecovery(journal, diskInspector = null) {
  const byOpId = new Map();
  for (const entry of journal.entries) {
    if (!entry || !entry.opId) continue;
    byOpId.set(entry.opId, entry);
  }

  const report = [];
  for (const [opId, lastEntry] of byOpId.entries()) {
    if (lastEntry.status === 'pending' || lastEntry.status === 'failed') {
      let exists = false;
      let actualSize = null;
      if (diskInspector && lastEntry.destinationName && lastEntry.outputFileName) {
        try {
          const diskInfo = await diskInspector(lastEntry.destinationName, lastEntry.outputFileName);
          exists = Boolean(diskInfo?.exists);
          actualSize = typeof diskInfo?.size === 'number' ? diskInfo.size : null;
        } catch (_) {}
      }

      if (exists && actualSize === lastEntry.fileSize && lastEntry.fileSize > 0) {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize,
          actualSize,
          state: 'verified-complete',
          recommendedAction: 'mark-sorted'
        });
      } else if (exists && actualSize !== lastEntry.fileSize) {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize || 0,
          actualSize,
          state: 'partial-write',
          recommendedAction: 'review-manual'
        });
      } else {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize || 0,
          actualSize: null,
          state: lastEntry.status === 'failed' ? 'failed' : 'missing-output',
          recommendedAction: 'retry-copy'
        });
      }
    }
  }

  return report;
}
