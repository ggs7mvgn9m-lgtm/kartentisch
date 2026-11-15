function pickCards({ title, multi, exclude, okLabel, allowNew }) {
  return modal((box, done) => {
    const chosen = new Set();
    const search = h('input', { class: 'search', type: 'search', placeholder: allowNew ? 'Suchen oder neuen Titel tippen' : 'Suchen', 'aria-label': 'Karten suchen', 'data-autofocus': true });
    const body = h('div', { class: 'm-body' });
    const ok = h('button', { class: 'btn primary', type: 'button', text: okLabel, disabled: true, onclick: () => done([...chosen]) });
    let first = null;
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const cards = [...S.cards.values()].filter(c => !exclude || !exclude.has(c.id)).sort((a, b) => b.v - a.v)
        .filter(c => !q || cardText(c).toLowerCase().includes(q)).slice(0, 200);
      body.replaceChildren(); first = null;
      if (allowNew && q && !cards.some(c => c.title.trim().toLowerCase() === q)) {
        const nb = h('button', { class: 'pick-row', type: 'button', onclick: () => { const c = newCard({ title: search.value.trim() }); setEntity(c); touch(c); done([c.id]); } },
          h('span', { class: 'sw', style: 'background:var(--accent)' }), h('span', { class: 'tt' }, h('b', { text: `+ Neue Karte „${search.value.trim()}“` }), h('small', { text: 'wird angelegt und verlinkt' })));
        body.append(nb); first = () => nb.click();
      }
      if (!cards.length && !first) body.append(h('div', { class: 'empty-note', style: 'padding:16px', text: q ? 'Keine passende Karte.' : 'Keine weiteren Karten in der Bibliothek.' }));
      for (const c of cards) {
        const sw = h('span', { class: 'sw' }); sw.style.background = `var(--stripe-${c.color})`;
        const row = h('button', { class: 'pick-row' + (chosen.has(c.id) ? ' on' : ''), type: 'button', 'aria-pressed': chosen.has(c.id) ? 'true' : 'false',
          onclick: () => { if (!multi) { done([c.id]); return; } if (chosen.has(c.id)) chosen.delete(c.id); else chosen.add(c.id); ok.disabled = !chosen.size; ok.textContent = chosen.size ? `${okLabel} (${chosen.size})` : okLabel; render(); } },
          sw, h('span', { class: 'tt' }, h('b', { text: cardTitle(c) }), h('small', { text: cardSnippet(c) })), multi ? h('span', { class: 'box', html: chosen.has(c.id) ? icon('check', 14) : '' }) : null);
        body.append(row);
        if (!first && !multi) first = () => row.click();
      }
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', e => { if (e.key === 'Enter' && !multi && first) { e.preventDefault(); e.stopPropagation(); first(); } });
    box.append(h('h2', { text: title }), search, body, h('div', { class: 'm-foot' }, h('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => done(null) }), multi ? ok : null));
    render();
  });
}
// ---------- Globale Suche (⌘K) ----------
function openSearch() {
  if ($('#modalRoot').firstChild) return;
  modal((box, done) => {
    box.classList.add('search-modal');
    const inp = h('input', { class: 'search big', type: 'search', placeholder: 'Karten, Whiteboards und Präsentationen durchsuchen', 'aria-label': 'Suchen', 'data-autofocus': true });
    const body = h('div', { class: 'm-body' }); let rows = [], idx = 0;
    const go = r => { done(null); setTimeout(() => r.open(), 0); };
    const snippet = (text, q) => { const i = text.toLowerCase().indexOf(q); if (i < 0) return text.slice(0, 110); const s = Math.max(0, i - 40); return (s ? '…' : '') + text.slice(s, s + 120); };
    const render = () => {
      const q = inp.value.trim().toLowerCase(); body.replaceChildren(); rows = []; idx = 0;
      const groups = [];
      const boards = sortedBoards().filter(b => !q || (b.name || '').toLowerCase().includes(q)).slice(0, 8);
      const pres = sortedPres().filter(p => !q || (p.name || '').toLowerCase().includes(q)).slice(0, 5);
      const cards = [...S.cards.values()].sort((a, b) => b.v - a.v).map(c => ({ c, t: cardText(c) })).filter(x => !q || x.t.toLowerCase().includes(q)).slice(0, 30);
      if (cards.length) groups.push(['Karten', cards.map(({ c, t }) => ({ ic: 'card', title: c.title.trim() || cardSnippet(c), sub: snippet(t.slice(c.title.length).trim(), q) || cardSnippet(c), open: () => Editor.open(c.id) }))]);
      if (boards.length) groups.push(['Whiteboards', boards.map(b => ({ ic: 'board', title: b.name || 'Ohne Namen', sub: [(S.folders.get(rootOf(b).folderId) || {}).name, ...boardChain(b).map(x => x.name)].filter(Boolean).join(' / '), open: () => navigate({ type: 'board', id: b.id }) }))]);
      if (pres.length) groups.push(['Präsentationen', pres.map(p => ({ ic: 'present', title: p.name || 'Ohne Namen', sub: `${p.cardIds.length} Folien`, open: () => navigate({ type: 'pres', id: p.id }) }))]);
      if (!groups.length) { body.append(h('div', { class: 'empty-note', style: 'padding:16px', text: 'Nichts gefunden.' })); return; }
      for (const [label, items] of groups) {
        body.append(h('div', { class: 'slash-head', text: label }));
        for (const r of items) {
          const i = rows.length;
          const el = h('button', { class: 'pick-row' + (i === 0 ? ' on' : ''), type: 'button', onclick: () => go(r), onpointermove: () => sel(i) },
            h('span', { class: 'si-ic', html: icon(r.ic, 16) }), h('span', { class: 'tt' }, h('b', { text: r.title }), r.sub ? h('small', { text: r.sub }) : null));
          r.el = el; rows.push(r); body.append(el);
        }
      }
    };
    const sel = i => { if (!rows.length) return; idx = (i + rows.length) % rows.length; rows.forEach((r, j) => r.el.classList.toggle('on', j === idx)); rows[idx].el.scrollIntoView({ block: 'nearest' }); };
    inp.addEventListener('input', render);
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel(idx - 1); }
      else if (e.key === 'Enter' && rows[idx]) { e.preventDefault(); e.stopPropagation(); go(rows[idx]); }
    });
    box.append(inp, body, h('div', { class: 'm-foot search-foot' }, h('span', { text: '↑ ↓ wählen · ↩ öffnen · Esc schließen' })));
    render();
  });
}
