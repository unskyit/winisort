import { createId } from '../utils/ids.js';

/**
 * Local rule-based smart sorting & logical folder suggestion engine (zero cloud AI dependencies).
 */
export class RulesEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Adds a new smart sorting rule.
   * Condition types: 'name-contains' | 'extension-is' | 'category-is' | 'size-over-mb' | 'year-is' | 'is-screenshot'
   */
  addRule(config) {
    const rule = {
      id: createId('rule'),
      name: config.name || 'Smart Rule',
      enabled: config.enabled !== false,
      priority: Number(config.priority ?? (this.store.rules.length + 1)),
      conditionType: config.conditionType || 'name-contains',
      conditionValue: String(config.conditionValue || '').trim(),
      destinationId: config.destinationId,
      createdAt: Date.now()
    };
    this.store.rules.push(rule);
    this.store.rules.sort((a, b) => a.priority - b.priority);
    this.store.notify('rules');
    return rule;
  }

  removeRule(ruleId) {
    this.store.rules = this.store.rules.filter(r => r.id !== ruleId);
    this.store.notify('rules');
  }

  /**
   * Evaluates whether a single fileRecord matches a rule.
   * @param {Object} file
   * @param {Object} rule
   * @returns {boolean}
   */
  matchesRule(file, rule) {
    if (!rule || !rule.enabled || !file) return false;
    const val = (rule.conditionValue || '').toLowerCase();

    switch (rule.conditionType) {
      case 'name-contains':
        return Boolean(val) && file.name.toLowerCase().includes(val);
      case 'extension-is': {
        const exts = val.split(',').map(s => s.replace(/^\./, '').trim()).filter(Boolean);
        return exts.includes((file.extension || '').toLowerCase());
      }
      case 'category-is':
        return file.category === val;
      case 'size-over-mb': {
        const thresholdBytes = parseFloat(val) * 1000 * 1000;
        return Number.isFinite(thresholdBytes) && file.size >= thresholdBytes;
      }
      case 'year-is': {
        if (!file.lastModified) return false;
        const yr = String(new Date(file.lastModified).getUTCFullYear());
        return yr === val;
      }
      case 'is-screenshot': {
        const lower = file.name.toLowerCase();
        return lower.includes('screenshot') || lower.includes('screen shot') || lower.startsWith('scr_');
      }
      default:
        return false;
    }
  }

  /**
   * Previews all unsorted files that match active rules in priority order (Dry Run preview).
   * @returns {Array<{ fileId: string, fileName: string, fileSize: number, ruleId: string, ruleName: string, destinationId: string, destinationName: string }>}
   */
  previewRuleMatches() {
    const activeRules = [...(this.store.rules || [])]
      .filter(r => r.enabled && this.store.destinations.has(r.destinationId))
      .sort((a, b) => a.priority - b.priority);

    const matches = [];
    for (const file of this.store.files.values()) {
      if (file.status !== 'unsorted') continue;
      for (const rule of activeRules) {
        if (this.matchesRule(file, rule)) {
          const dest = this.store.destinations.get(rule.destinationId);
          matches.push({
            fileId: file.id,
            fileName: file.name,
            fileSize: file.size,
            ruleId: rule.id,
            ruleName: rule.name,
            destinationId: rule.destinationId,
            destinationName: dest ? dest.name : 'Unknown'
          });
          break; // First matching highest-priority rule wins
        }
      }
    }
    return matches;
  }

  /**
   * Suggests logical destination folders based on visible filenames, years, and formats in the unsorted pool.
   */
  suggestFoldersFromPool() {
    const suggestions = [];
    const seenNames = new Set(
      Array.from(this.store.destinations.values()).map(d => d.name.toLowerCase())
    );

    let screenshotCount = 0;
    let pdfCount = 0;
    let videoCount = 0;
    let largeCount = 0;
    const years = new Map();

    for (const file of this.store.files.values()) {
      const lower = file.name.toLowerCase();
      if (lower.includes('screenshot') || lower.includes('screen_shot')) screenshotCount++;
      if (file.category === 'pdf') pdfCount++;
      if (file.category === 'videos') videoCount++;
      if (file.size >= 25 * 1000 * 1000) largeCount++;
      if (file.lastModified) {
        const y = String(new Date(file.lastModified).getFullYear());
        years.set(y, (years.get(y) || 0) + 1);
      }
    }

    if (screenshotCount > 0 && !seenNames.has('screenshots')) {
      suggestions.push({ name: 'Screenshots', emoji: '📱', reason: `${screenshotCount} screenshot files detected` });
    }
    if (pdfCount > 0 && !seenNames.has('pdf documents')) {
      suggestions.push({ name: 'PDF Documents', emoji: '📕', reason: `${pdfCount} PDF files in queue` });
    }
    if (videoCount > 0 && !seenNames.has('videos')) {
      suggestions.push({ name: 'Videos', emoji: '🎬', reason: `${videoCount} video clips in queue` });
    }
    if (largeCount > 0 && !seenNames.has('large media')) {
      suggestions.push({ name: 'Large Media', emoji: '🐘', reason: `${largeCount} files over 25 MB` });
    }
    for (const [yr, count] of years.entries()) {
      if (count >= 2 && !seenNames.has(`archive ${yr}`)) {
        suggestions.push({ name: `Archive ${yr}`, emoji: '📅', reason: `${count} files modified in ${yr}` });
      }
    }

    return suggestions.slice(0, 6);
  }
}
