// ---------- Seitenleiste & Navigation ----------
const isNarrow = () => matchMedia('(max-width: 859px)').matches;
function menuButton() { return iconBtn('menu', 'Seitenleiste öffnen', () => { if (isNarrow()) toggleSidebar(true); else setSidebarCollapsed(false); }, 'sb-open'); }
function toggleSidebar(open) { $('#sidebar').classList.toggle('open', open); $('#scrim').classList.toggle('open', open); }
function setSidebarCollapsed(c) {
  UI.sbCollapsed = c; $('#app').classList.toggle('sb-collapsed', c); saveUiPrefs();
  if (BV.root) setTimeout(() => { BV.renderFlyout(); BV.layoutSoon(); }, 30);
}
const isCollapsed = id => UI.collapsed.includes(id);
function toggleCollapsed(id) { UI.collapsed = isCollapsed(id) ? UI.collapsed.filter(x => x !== id) : [...UI.collapsed, id]; saveUiPrefs(); renderSidebar(); }
function treeRow({ depth, ic, icClass, label, active, hasKids, open, onToggle, onOpen, onMenu, bold, count }) {
  const row = h('div', { class: 'tree-row' + (active ? ' active' : '') + (bold ? ' bold' : ''), role: 'button', tabindex: '0', style: `padding-left:${4 + depth * 16}px` });
  row.append(hasKids
    ? h('button', { class: 'chev' + (open ? ' open' : ''), type: 'button', 'aria-label': open ? 'Zuklappen' : 'Aufklappen', 'aria-expanded': open ? 'true' : 'false', html: icon('chev', 14), onclick: e => { e.stopPropagation(); onToggle(); } })
    : h('span', { class: 'chev-sp' }));
  row.append(h('span', { class: 'tr-ic ' + (icClass || ''), html: icon(ic, 18) }), h('span', { class: 'lbl', text: label }));
  if (count != null) row.append(h('span', { class: 'count', text: String(count) }));
  if (onMenu) row.append(h('button', { class: 'tr-more', type: 'button', 'aria-label': 'Aktionen für ' + label, title: 'Aktionen', html: icon('more', 16), onclick: e => { e.stopPropagation(); onMenu(e.currentTarget); } }));
  row.addEventListener('click', () => onOpen());
  row.addEventListener('keydown', e => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } });
  return row;
}
function boardMenu(b, anchor) {
  const isSub = b.parentId && S.boards.has(b.parentId);
  const items = [{ label: 'Umbenennen …', onClick: () => renameEntity(b, 'Whiteboard umbenennen') },
    { label: 'Neues Whiteboard darin', onClick: () => { navigate({ type: 'board', id: b.id }); setTimeout(() => BV.addSubBoard(), 50); } }];
  if (!isSub) items.push({ label: 'In Ordner verschieben …', onClick: () => moveBoardToFolder(b) });
  else items.push({ label: 'Herauslösen', onClick: () => detachBoard(b) });
  items.push({ label: 'Whiteboard löschen', danger: true, onClick: () => deleteBoard(b) });
  openMenu(anchor, items);
}
function renderSidebar() {
  const tree = $('#boardTree'), pl = $('#presList'); if (!tree) return;
  const v = UI.view || {};
  tree.replaceChildren(); pl.replaceChildren();
  const boards = sortedBoards();
  const isRoot = b => !b.parentId || !S.boards.has(b.parentId) || b.parentId === b.id;
  const kidsOf = id => boards.filter(x => x.parentId === id && x.id !== id);
  const seen = new Set();
  const addBoard = (b, depth) => {
    if (seen.has(b.id)) return; seen.add(b.id);
    const kids = kidsOf(b.id); const open = !isCollapsed(b.id);
    tree.append(treeRow({ depth, ic: 'board', icClass: 'board', label: b.name || 'Ohne Namen', active: v.type === 'board' && v.id === b.id, hasKids: kids.length > 0, open,
      onToggle: () => toggleCollapsed(b.id), onOpen: () => navigate({ type: 'board', id: b.id }), onMenu: el => boardMenu(b, el) }));
    if (kids.length && open) kids.forEach(k => addBoard(k, depth + 1));
  };
  for (const f of sortedFolders()) {
    const inside = boards.filter(b => isRoot(b) && b.folderId === f.id); const open = !isCollapsed(f.id);
    tree.append(treeRow({ depth: 0, ic: 'folder', label: f.name || 'Ordner', bold: true, hasKids: true, open,
      onToggle: () => toggleCollapsed(f.id), onOpen: () => toggleCollapsed(f.id),
      onMenu: el => openMenu(el, [
        { label: 'Neues Whiteboard in diesem Ordner', onClick: () => { const b = newBoard('Neues Whiteboard', { folderId: f.id }); setEntity(b); touch(b); navigate({ type: 'board', id: b.id }); setTimeout(() => { const n = $('#boardName'); if (n) { n.focus(); n.select(); } }, 60); } },
        { label: 'Umbenennen …', onClick: () => renameEntity(f, 'Ordner umbenennen') },
        { label: 'Ordner löschen', danger: true, onClick: () => deleteFolder(f) }]) }));
    if (open) { if (!inside.length) tree.append(h('div', { class: 'empty-note', style: 'padding-left:42px', text: 'Leer' })); inside.forEach(b => addBoard(b, 1)); }
  }
  boards.filter(b => isRoot(b) && !S.folders.has(b.folderId)).forEach(b => addBoard(b, 0));
  boards.filter(b => !seen.has(b.id)).forEach(b => addBoard(b, 0)); // Sicherheitsnetz bei Zyklen
  if (!boards.length && !S.folders.size) tree.append(h('div', { class: 'empty-note', text: 'Noch kein Whiteboard' }));
  const pres = sortedPres();
  if (!pres.length) pl.append(h('div', { class: 'empty-note', text: 'Noch keine Präsentation' }));
  for (const p of pres) pl.append(treeRow({ depth: 0, ic: 'present', icClass: 'pres', label: p.name || 'Ohne Namen', active: v.type === 'pres' && v.id === p.id,
    count: p.cardIds.filter(id => S.cards.has(id)).length, onOpen: () => navigate({ type: 'pres', id: p.id }),
    onMenu: el => openMenu(el, [{ label: 'Präsentieren', onClick: () => Presenter.start(p.id, 0) }, { label: 'Umbenennen …', onClick: () => renameEntity(p, 'Präsentation umbenennen') },
      { label: 'Präsentation löschen', danger: true, onClick: async () => { if (!(await confirmDialog(`„${p.name}“ löschen?`, 'Die Karten bleiben in der Bibliothek.', 'Präsentation löschen'))) return; removeEntityLocal(keyOf(p), stamp()); Persist.mark(keyOf(p)); if (v.type === 'pres' && v.id === p.id) navigate(null); else renderSidebar(); } }]) }));
  $('#navLibrary').classList.toggle('active', v.type === 'library');
  $('#cardCount').textContent = String(S.cards.size);
}
const renderSidebarSoon = debounce(renderSidebar, 120);
function navigate(view) {
  if (BV.editingId) BV.endInlineEdit();
  if (!resolveView(view)) view = sortedBoards()[0] ? { type: 'board', id: sortedBoards()[0].id } : { type: 'library' };
  UI.view = view; UI.sel = null; toggleSidebar(false);
  if (view.type === 'board') {
    const b = S.boards.get(view.id); const chain = boardChain(b); const rf = rootOf(b).folderId;
    UI.collapsed = UI.collapsed.filter(id => id !== rf && !chain.some(c => c.id === id));
  }
  saveUiPrefs();
  if (view.type !== 'board') BV.unmount();
  if (view.type !== 'pres') PresView.presId = null;
  if (view.type !== 'library') LibView.grid = null;
  if (view.type === 'board') BV.mount(view.id);
  else if (view.type === 'pres') PresView.mount(view.id);
  else LibView.mount();
  renderSidebar();
  if (Editor.cardId) Editor.renderMeta();
}
function refreshCardEverywhere(cardId, light) {
  if (UI.view && UI.view.type === 'board' && BV.root) BV.refreshCard(cardId);
  if (UI.view && UI.view.type === 'library' && LibView.grid) { if (!light) LibView.renderGrid(); else refreshLibSoon(); }
  if (UI.view && UI.view.type === 'pres' && PresView.presId) refreshPresSoon();
  renderSidebarSoon();
}
const refreshLibSoon = debounce(() => LibView.grid && LibView.renderGrid(), 600);
const refreshPresSoon = debounce(() => PresView.presId && PresView.render(), 400);
function onDataChanged(changed) {
  // Ansicht nach (entfernten) Änderungen aktualisieren
  if (!UI.view || !resolveView(UI.view)) { navigate(UI.view); return; }
  if ($('#main .loading')) { navigate(UI.view); return; }
  const v = UI.view;
  if (v.type === 'board' && BV.root) { if (UI.sel && UI.sel.type !== 'arrow' && UI.sel.type !== 'section' && !BV.selIds().every(r => BV.itemOf(r))) UI.sel = null; BV.renderSections(); BV.renderItems(); BV.renderInk(); BV.refreshBreadcrumb(); BV.renderSelbar(); }
  else if (v.type === 'pres' && PresView.presId) PresView.render();
  else if (v.type === 'library') LibView.renderGrid();
  renderSidebar();
  if (Editor.cardId && (!changed || changed.has('c_' + Editor.cardId))) Editor.onRemoteChange();
  else if (Editor.cardId) Editor.renderMeta();
  if (Presenter.active() && changed) Presenter.render();
}

