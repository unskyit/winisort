import { createDestinationCardElement } from './destination-card.js';

/**
 * Renders one of the 4 surrounding destination banks ('top' | 'left' | 'right' | 'bottom')
 * with smart capacity management: pinned & recent first, plus a "+N More / Search Picker" button when capacity is exceeded.
 */
export function renderDestinationBank(container, bankName, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const isHorizontal = bankName === 'top' || bankName === 'bottom';
  const maxVisible = store.preferences.maxVisibleCardsPerBank || (isHorizontal ? 5 : 6);

  // Gather destinations assigned to this bank (or favorite destinations in Quick Sort mode)
  const bankDests = [];
  for (const dest of store.destinations.values()) {
    if (store.ui.quickSortMode) {
      if (bankName === 'bottom' && (dest.pinned || dest.favorite)) {
        bankDests.push(dest);
      }
    } else if (dest.bank === bankName) {
      bankDests.push(dest);
    }
  }

  // Sort pinned first, then by recent usage, then creation order
  const recentOrder = store.ui.recentDestinationIds || [];
  bankDests.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const rA = recentOrder.indexOf(a.id);
    const rB = recentOrder.indexOf(b.id);
    if (rA !== -1 && rB !== -1) return rA - rB;
    if (rA !== -1) return -1;
    if (rB !== -1) return 1;
    return a.createdAt - b.createdAt;
  });

  const header = document.createElement('div');
  header.className = 'ws-bank-header';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = `${bankName.toUpperCase()} (${bankDests.length})`;

  const addBtn = document.createElement('button');
  addBtn.className = 'ws-btn';
  addBtn.style.height = '24px';
  addBtn.style.padding = '0 7px';
  addBtn.style.fontSize = '11px';
  addBtn.textContent = '+ Folder';
  addBtn.title = `Create a new destination in the ${bankName} bank`;
  addBtn.addEventListener('click', () => actions.onOpenNewDestination?.(bankName));

  header.append(titleSpan, addBtn);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = isHorizontal ? 'ws-bank-cards-horizontal' : 'ws-bank-cards-vertical';

  const visibleDests = bankDests.slice(0, maxVisible);
  const overflowCount = Math.max(0, bankDests.length - visibleDests.length);

  for (const dest of visibleDests) {
    cardsWrap.appendChild(createDestinationCardElement(dest, store, actions));
  }

  if (overflowCount > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'ws-btn ws-badge-accent';
    moreBtn.textContent = `+${overflowCount} More...`;
    moreBtn.title = 'Search and pick from all destinations';
    moreBtn.addEventListener('click', () => actions.onOpenCommandPalette?.());
    cardsWrap.appendChild(moreBtn);
  }

  if (bankDests.length === 0 && !store.ui.quickSortMode) {
    const emptyHint = document.createElement('div');
    emptyHint.style.cssText = 'font-size:11.5px;color:var(--text-muted);padding:4px 6px;';
    emptyHint.textContent = `No folders on ${bankName}.`;
    cardsWrap.appendChild(emptyHint);
  }

  if (isHorizontal) {
    header.style.marginRight = '8px';
    container.append(header, cardsWrap);
  } else {
    container.append(header, cardsWrap);
  }
}
