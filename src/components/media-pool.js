import { STARTER_TEMPLATES } from '../core/configuration.js';

/**
 * Renders the signature WiniSort initial collection tray when no files are loaded yet,
 * including quick starter folder templates and sample test batch creation for instant verification.
 */
export function renderInitialMediaPool(container, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const poolWrap = document.createElement('div');
  poolWrap.className = 'ws-pool-container';

  const tray = document.createElement('div');
  tray.className = 'ws-collection-tray';
  tray.id = 'ws-signature-collection-tray';

  const well = document.createElement('div');
  well.className = 'ws-tray-well';
  well.innerHTML = `<span style="font-size:40px;">🗂️</span>`;

  const heading = document.createElement('h1');
  heading.className = 'ws-tray-heading';
  heading.textContent = 'Your files, ready to find their place.';

  const subtext = document.createElement('p');
  subtext.className = 'ws-tray-subtext';
  subtext.textContent = 'Choose files or folders to begin organizing. Drag files onto this tray, pick a local folder, or apply a destination template below.';

  const btnRow = document.createElement('div');
  btnRow.className = 'ws-tray-buttons';

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'ws-btn ws-btn-primary';
  primaryBtn.id = 'btn-pool-add-files-or-folder';
  primaryBtn.style.height = '38px';
  primaryBtn.style.padding = '0 16px';
  primaryBtn.style.fontSize = '13.5px';
  primaryBtn.textContent = '📂 Add Files or Folder';
  primaryBtn.addEventListener('click', () => actions.onAddFolderOrFiles?.());

  const filterBtn = document.createElement('button');
  filterBtn.className = 'ws-btn';
  filterBtn.style.height = '38px';
  filterBtn.textContent = '🎯 Choose Media Categories';
  filterBtn.addEventListener('click', () => actions.onOpenFilters?.());

  const connectDestBtn = document.createElement('button');
  connectDestBtn.className = 'ws-btn';
  connectDestBtn.style.height = '38px';
  connectDestBtn.textContent = '🔗 Connect Existing Folder';
  connectDestBtn.addEventListener('click', () => actions.onConnectExistingDestination?.());

  const sampleBtn = document.createElement('button');
  sampleBtn.className = 'ws-btn';
  sampleBtn.id = 'btn-pool-load-sample-files';
  sampleBtn.style.height = '38px';
  sampleBtn.textContent = '✨ Load Sample Media Pack';
  sampleBtn.title = 'Generate local in-browser sample photos, audio, PDF, and docs to test sorting immediately';
  sampleBtn.addEventListener('click', () => actions.onLoadSampleMediaPack?.());

  btnRow.append(primaryBtn, filterBtn, connectDestBtn, sampleBtn);

  // Starter Destination Templates strip
  const templateSection = document.createElement('div');
  templateSection.style.cssText = 'width:100%;border-top:1px solid var(--border-hairline);padding-top:14px;display:flex;flex-direction:column;gap:8px;align-items:center;';

  const tplLabel = document.createElement('div');
  tplLabel.style.cssText = 'font-size:11.5px;color:var(--text-secondary);font-weight:600;';
  tplLabel.textContent = 'Optional Starter Destination Sets (Click to add folders):';

  const tplChips = document.createElement('div');
  tplChips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';

  for (const tpl of Object.values(STARTER_TEMPLATES)) {
    const chip = document.createElement('button');
    chip.className = 'ws-btn';
    chip.style.height = '28px';
    chip.style.fontSize = '11.5px';
    chip.textContent = `${tpl.emoji} ${tpl.name}`;
    chip.addEventListener('click', () => actions.onApplyStarterTemplate?.(tpl.id));
    tplChips.appendChild(chip);
  }

  templateSection.append(tplLabel, tplChips);
  tray.append(well, heading, subtext, btnRow, templateSection);
  poolWrap.appendChild(tray);
  container.appendChild(poolWrap);
}
