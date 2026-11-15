function seedExamples() {
  const txt = html => ({ id: newId(), type: 'text', html });
  const c1 = newCard({ title: 'Willkommen am Kartentisch', blocks: [txt('<p>Das ist ein <b>Beispiel-Whiteboard</b>. Karten sind Notizen aus Text, Handschrift und Bildern.</p><ul><li><b>Doppelklick</b> auf eine leere Stelle legt eine Karte an. Du schreibst direkt hinein.</li><li><b>Doppelklick</b> auf eine Karte bearbeitet sie. Das Symbol oben rechts öffnet sie groß im Seitenpanel.</li><li>Ziehen verschiebt, die Ecke unten rechts ändert die Größe.</li></ul>')] });
  const c2 = newCard({ title: 'Eine Karte, viele Orte', color: 'yellow', blocks: [txt('<p>Jede Karte liegt in der <b>Kartenbibliothek</b>. Dieselbe Karte kann auf mehreren Whiteboards liegen. Änderst du sie, ändert sie sich überall.</p><p>„Vom Whiteboard entfernen“ behält die Karte, „Karte löschen“ entfernt sie überall.</p>')] });
  const loops = seedInk(t => [40 + t * 520 + 20 * Math.cos(t * Math.PI * 18), 62 + 22 * Math.sin(t * Math.PI * 18) + 6 * Math.sin(t * 5), 0.35 + 0.3 * Math.sin(t * Math.PI)], 260, 'b', 3);
  const under = seedInk(t => [44 + t * 500, 112 + 3 * Math.sin(t * 9), 0.45 + 0.2 * Math.sin(t * Math.PI)], 40, 'r', 3);
  const mark = seedInk(t => [60 + t * 230, 60 + 2 * Math.sin(t * 6), 0.5], 30, 'y', 20, 'hl');
  const c3 = newCard({ title: 'Handschrift', blocks: [
    txt('<p>Mit dem <b>Apple Pencil</b> schreibst du frei aufs Whiteboard (Stift in der Leiste links) oder im Seitenpanel in eine Karte. Der Finger verschiebt nur.</p><p>Auf dem iPhone: in der Seitenleiste „Mit Finger zeichnen“ einschalten.</p>'),
    { id: newId(), type: 'ink', h: 150, strokes: [mark, loops, under] }] });
  const c4 = newCard({ title: 'Präsentieren', color: 'rose', blocks: [txt('<p>Oben rechts macht <b>Präsentation</b> aus den Karten dieses Whiteboards eine Folienfolge. Die Reihenfolge ordnest du per Ziehen.</p><p>Im Vollbild: Pfeiltasten, Leertaste, Wischen oder Tippen. <b>Esc</b> beendet.</p>')] });
  const c5 = newCard({ title: 'Speichern und Synchronisieren', blocks: [txt(HOST.supa ? '<p>Deine Karten werden mit deinem Konto synchronisiert und erscheinen auf Mac, iPad und iPhone, sobald du dich dort anmeldest.</p><p>Tipp: In Safari über „Teilen → Zum Home-Bildschirm“ wird der Kartentisch zur App.</p><p><b>Exportieren</b> erstellt eine Sicherungsdatei mit allen Dateien.</p>' : '<p>Deine Karten liegen privat in deinem claude.ai-Konto und erscheinen auf Mac, iPad und iPhone, sobald du diese Seite dort öffnest.</p><p><b>Exportieren</b> erstellt eine Sicherungsdatei.</p>')] });
  const c6 = newCard({ title: 'Whiteboards im Whiteboard', color: 'green', blocks: [txt('<p>Oben siehst du den Pfad. Ein Klick auf „Erste Schritte“ bringt dich zurück.</p><p>In der Seitenleiste ordnest du Whiteboards in <b>Ordner</b>, z. B. „Sport“ oder „Kunstunterricht“.</p>')] });
  const folder = newFolder('Beispiele');
  const b = newBoard('Erste Schritte', { folderId: folder.id });
  const sub = newBoard('Ein Whiteboard im Whiteboard', { parentId: b.id });
  sub.items = [{ cardId: c6.id, x: 0, y: 0, w: 320, h: null }];
  b.items = [
    { cardId: c1.id, x: 60, y: 70, w: 340, h: null },
    { cardId: c2.id, x: 500, y: 40, w: 300, h: null },
    { cardId: c3.id, x: 500, y: 330, w: 340, h: null },
    { cardId: c4.id, x: 920, y: 90, w: 300, h: null },
    { cardId: c5.id, x: 60, y: 430, w: 340, h: null },
    { boardId: sub.id, x: 940, y: 520, w: 260, h: null }];
  b.arrows = [{ id: newId(), from: c1.id, to: c2.id }, { id: newId(), from: c2.id, to: c4.id }, { id: newId(), from: c2.id, to: c3.id }, { id: newId(), from: c1.id, to: c5.id }, { id: newId(), from: c4.id, to: sub.id, head: true }];
  const star = seedInk(t => { const a = t * Math.PI * 4 - Math.PI / 2; const r = (Math.round(t * 10) % 2 ? 18 : 42) * (0.9 + 0.1 * Math.sin(t * 7)); return [1290 + Math.cos(a) * r, 150 + Math.sin(a) * r, 0.5]; }, 10, 'o', 4);
  b.ink = [simplifyStroke(star)];
  const p = newPres('Beispiel-Präsentation'); p.cardIds = [c1.id, c3.id, c4.id];
  for (const e of [folder, c1, c2, c3, c4, c5, c6, sub, b, p]) { setEntity(e); touch(e); }
  try { localStorage.setItem('kt-seed', JSON.stringify([folder, c1, c2, c3, c4, c5, c6, sub, b, p].map(e => [keyOf(e), e.v]))); } catch (e) {}
  if (!UI.view || !resolveView(UI.view)) UI.view = { type: 'board', id: b.id };
}
