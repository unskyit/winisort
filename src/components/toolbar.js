import { formatBytes } from '../utils/formatters.js';

/**
 * Renders the top native-style WiniSort application toolbar with all required controls.
 */
export function renderToolbar(container, store, historyManager, actions) {
  if (!container) return;
  container.innerHTML = '';

  // Brand section
  const brand = document.createElement('div');
  brand.className = 'ws-toolbar-brand';
  brand.innerHTML = `
    <div class="ws-brand-emblem" aria-hidden="true">W</div>
    <div class="ws-brand-text">
      <div class="ws-brand-title">
        <span>WiniSort</span>
        <span class="ws-badge ws-badge-accent" style="font-size:10px;">LOCAL-FIRST</span>
      </div>
      <div class="ws-brand-tagline">Your files. Your folders. Your freedom.</div>
    </div>
  `;

  // Primary File & Source Actions
  const leftActions = document.createElement('div');
  leftActions.className = 'ws-toolbar-actions';

  const addFilesBtn = document.createElement('button');
  addFilesBtn.className = 'ws-btn ws-btn-primary';
  addFilesBtn.id = 'btn-toolbar-add-files';
  addFilesBtn.textContent = '+ Add Files';
  addFilesBtn.title = 'Pick individual or multiple files to organize';
  addFilesBtn.addEventListener('click', () => actions.onAddFiles?.());

  const addFolderBtn = document.createElement('button');
  addFolderBtn.className = 'ws-btn';
  addFolderBtn.id = 'btn-toolbar-add-folder';
  addFolderBtn.textContent = '📂 Add Folder';
  addFolderBtn.title = 'Import a folder or nested directory tree';
  addFolderBtn.addEventListener('click', () => actions.onAddFolder?.());

  const filtersBtn = document.createElement('button');
  filtersBtn.className = 'ws-btn';
  filtersBtn.id = 'btn-toolbar-filters';
  filtersBtn.textContent = '🎯 Media Filters';
  filtersBtn.title = 'Choose which file categories and extensions to organize';
  filtersBtn.addEventListener('click', () => actions.onOpenFilters?.());

  const outputDirBtn = document.createElement('button');
  outputDirBtn.className = 'ws-btn';
  outputDirBtn.id = 'btn-toolbar-output-dir';
  outputDirBtn.textContent = store.project.outputRootName
    ? `💾 Output: ${store.project.outputRootName}`
    : '💾 Select Output Dir';
  outputDirBtn.title = 'Select writable root output directory for sorted folders';
  outputDirBtn.addEventListener('click', () => actions.onSelectOutputDirectory?.());

  leftActions.append(addFilesBtn, addFolderBtn, filtersBtn, outputDirBtn);

  // Search box
  const searchWrap = document.createElement('div');
  searchWrap.className = 'ws-toolbar-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'ws-search-icon';
  searchIcon.textContent = '🔍';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'ws-global-search-input';
  searchInput.placeholder = 'Search files, extensions, paths...';
  searchInput.value = store.ui.searchQuery || '';
  searchInput.setAttribute('aria-label', 'Search imported files');
  searchInput.addEventListener('input', (e) => {
    actions.onSearchChange?.(e.target.value);
  });

  const searchKbd = document.createElement('span');
  searchKbd.className = 'ws-search-kbd';
  searchKbd.textContent = '/';

  searchWrap.append(searchIcon, searchInput, searchKbd);

  // Right utility controls: Progress pill, Undo, Redo, Smart Rules, Stats, Theme, Settings, Help
  const rightActions = document.createElement('div');
  rightActions.className = 'ws-toolbar-right';

  const total = store.stats.totalFiles;
  const sorted = store.stats.sortedCount;
  const pct = total > 0 ? Math.round((sorted / total) * 100) : 0;

  const progressPill = document.createElement('button');
  progressPill.className = 'ws-btn';
  progressPill.id = 'btn-toolbar-stats';
  progressPill.title = 'Open Storage & Session Statistics';
  progressPill.textContent = total > 0
    ? `📊 ${sorted}/${total} (${pct}%) • ${formatBytes(store.stats.completedCopyBytes, { mode: store.preferences.unitSystem })}`
    : '📊 0 Sorted';
  progressPill.addEventListener('click', () => actions.onOpenStats?.());

  const undoBtn = document.createElement('button');
  undoBtn.className = 'ws-btn ws-btn-icon';
  undoBtn.id = 'btn-toolbar-undo';
  undoBtn.textContent = '↶';
  undoBtn.title = 'Undo last action (Ctrl/Cmd + Z)';
  undoBtn.setAttribute('aria-label', 'Undo');
  undoBtn.disabled = !historyManager.canUndo();
  undoBtn.addEventListener('click', () => actions.onUndo?.());

  const redoBtn = document.createElement('button');
  redoBtn.className = 'ws-btn ws-btn-icon';
  redoBtn.id = 'btn-toolbar-redo';
  redoBtn.textContent = '↷';
  redoBtn.title = 'Redo (Ctrl/Cmd + Shift + Z)';
  redoBtn.setAttribute('aria-label', 'Redo');
  redoBtn.disabled = !historyManager.canRedo();
  redoBtn.addEventListener('click', () => actions.onRedo?.());

  const rulesBtn = document.createElement('button');
  rulesBtn.className = 'ws-btn';
  rulesBtn.id = 'btn-toolbar-rules';
  rulesBtn.textContent = '⚡ Rules';
  rulesBtn.title = 'Rule-Based Smart Sorting & Folder Suggestions';
  rulesBtn.addEventListener('click', () => actions.onOpenRules?.());

  const quickSortBtn = document.createElement('button');
  quickSortBtn.className = `ws-btn ${store.ui.quickSortMode ? 'ws-btn-primary' : ''}`;
  quickSortBtn.id = 'btn-toolbar-quicksort';
  quickSortBtn.textContent = '🚀 Quick Sort';
  quickSortBtn.title = 'Toggle distraction-free Quick Sort layout';
  quickSortBtn.addEventListener('click', () => actions.onToggleQuickSort?.());

  const themeBtn = document.createElement('button');
  themeBtn.className = 'ws-btn ws-btn-icon';
  themeBtn.id = 'btn-toolbar-theme';
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  themeBtn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  themeBtn.title = 'Toggle Light / Dark (AMOLED) Theme';
  themeBtn.setAttribute('aria-label', 'Toggle theme');
  themeBtn.addEventListener('click', () => actions.onToggleTheme?.());

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'ws-btn ws-btn-icon';
  settingsBtn.id = 'btn-toolbar-settings';
  settingsBtn.textContent = '⚙️';
  settingsBtn.title = 'Open WiniSort Settings';
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.addEventListener('click', () => actions.onOpenSettings?.());

  const helpBtn = document.createElement('button');
  helpBtn.className = 'ws-btn ws-btn-icon';
  helpBtn.id = 'btn-toolbar-help';
  helpBtn.textContent = '?';
  helpBtn.title = 'Keyboard Shortcuts & Help (?)';
  helpBtn.setAttribute('aria-label', 'Help');
  helpBtn.addEventListener('click', () => actions.onOpenHelp?.());

  rightActions.append(progressPill, undoBtn, redoBtn, rulesBtn, quickSortBtn, themeBtn, settingsBtn, helpBtn);
  container.append(brand, leftActions, searchWrap, rightActions);
}
