/**
 * Search and quick-filter helper across files and destinations.
 */
export function filterDestinationsByQuery(destinationsIterable, query = '') {
  const q = String(query || '').trim().toLowerCase();
  const list = Array.from(destinationsIterable || []);
  if (!q) return list;
  return list.filter(d => {
    const hay = `${d.name} ${d.collection || ''} ${d.emoji || ''}`.toLowerCase();
    return hay.includes(q);
  });
}
