// ---------- Eigenes Konto (Supabase): Anmeldung, Sync, Dateien ----------
const SUPA = { url: 'https://nmanthrnmwtlavvuesjy.supabase.co', key: 'sb_publishable_g1Mlwalj3D335zBGO3UpRg_mN1Ui_E3', bucket: 'kt-files' };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const Supa = {
  client: null, user: null, channel: null, since: null, pulling: false, again: false, urls: new Map(), timer: null,
  available() { return !HOST.claude && !!(window.supabase && window.supabase.createClient); },
  async start() {
    HOST.supa = true;
    this.client = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.client.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { setTimeout(() => Auth.newPassword(), 0); return; }
      if (ev === 'SIGNED_OUT') return;
      if (session && session.user && (!this.user || this.user.id !== session.user.id)) setTimeout(() => this.signedIn(session.user), 0);
    });
    let session = null;
    try { const r = await this.client.auth.getSession(); session = r.data && r.data.session; } catch (e) {}
    if (session) await this.signedIn(session.user);
    else if (lsGet('kt-local-only') === '1') Persist.goLocal('chosen');
    else { Persist.mode = 'signedout'; updateSync(); renderAccount(); Auth.show(); }
  },
  async signedIn(user) {
    if (this.user && this.user.id === user.id) return;
    const prev = lsGet('kt-uid');
    if (prev && prev !== user.id) { await wipeLocalData(); lsSet('kt-uid', user.id); location.reload(); return; }
    lsSet('kt-uid', user.id); lsSet('kt-local-only', null);
    this.user = user; Auth.hide();
    Persist.driver = 'supa'; Persist.mode = 'cloud'; Persist.merged = false; Persist.reachable = true;
    updateSync(); renderAccount();
    await this.initialPull();
    this.subscribe();
    addEventListener('online', () => { Persist.reachable = true; this.pull(); Persist.schedule(300); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pull(); });
    clearInterval(this.timer); this.timer = setInterval(() => this.pull(), 45000);
  },
  async selectAll(cols) {
    const out = []; const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await this.client.from('kt_docs').select(cols).order('key').range(from, from + size - 1);
      if (error) throw error; out.push(...data); if (data.length < size) break;
    }
    return out;
  },
  async initialPull() {
    try {
      const rows = await this.selectAll('key,v,deleted,updated_at');
      const need = [];
      for (const r of rows) {
        const rv = +r.v; Persist.remoteV.set(r.key, rv); this.bump(r.updated_at);
        if (rv > localV(r.key)) { if (r.deleted) { removeEntityLocal(r.key, rv); Persist.localDirty.add(r.key); } else need.push(r.key); }
      }
      for (let i = 0; i < need.length; i += 80) {
        const { data, error } = await this.client.from('kt_docs').select('key,v,deleted,body,updated_at').in('key', need.slice(i, i + 80));
        if (error) throw error; this.apply(data, true);
      }
      Persist.reachable = true; Persist.merged = true;
      const all = [...S.cards.values(), ...S.boards.values(), ...S.pres.values(), ...S.folders.values()];
      for (const e of all) { const k = keyOf(e); if (e.v > (Persist.remoteV.get(k) || 0)) Persist.dirty.add(k); }
      for (const [k, v] of S.tomb) if (v > (Persist.remoteV.get(k) || 0)) Persist.dirty.add(k);
      if (isEmptyStore()) seedExamples();
      Persist.schedule(300); onDataChanged(null); updateSync();
    } catch (e) {
      Persist.reachable = false; updateSync(); setTimeout(() => this.initialPull(), 8000);
    }
  },
  bump(ts) { if (ts && (!this.since || ts > this.since)) this.since = ts; },
  apply(rows, quiet) {
    const changed = new Set();
    for (const r of rows || []) {
      if (!r || typeof r.key !== 'string' || !/^[cbpf]_/.test(r.key)) continue;
      const rv = +r.v; Persist.remoteV.set(r.key, rv); this.bump(r.updated_at);
      if (rv <= localV(r.key)) continue;
      if (r.deleted) { removeEntityLocal(r.key, rv); Persist.localDirty.add(r.key); changed.add(r.key); continue; }
      const e = deser(r.body); if (e && keyOf(e) === r.key) { e.v = rv; setEntity(e); Persist.localDirty.add(r.key); changed.add(r.key); }
    }
    if (changed.size && !quiet) { Persist.schedule(300); onDataChanged(changed); }
    return changed;
  },
  async pull() {
    if (!this.user || !Persist.merged) return;
    if (this.pulling) { this.again = true; return; }
    this.pulling = true;
    try {
      let q = this.client.from('kt_docs').select('key,v,deleted,body,updated_at').order('updated_at').limit(500);
      if (this.since) q = q.gte('updated_at', this.since);
      const { data, error } = await q; if (error) throw error;
      this.apply(data); Persist.reachable = true;
      if (data.length === 500) this.again = true;
    } catch (e) { Persist.reachable = false; }
    this.pulling = false; updateSync();
    if (this.again) { this.again = false; setTimeout(() => this.pull(), 50); }
  },
  subscribe() {
    if (this.channel) return;
    const soon = debounce(() => this.pull(), 400);
    try {
      this.channel = this.client.channel('kt-' + this.user.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kt_docs', filter: 'user_id=eq.' + this.user.id }, soon)
        .subscribe();
    } catch (e) { this.channel = null; }
  },
  async writeKey(key) {
    const e = entityByKey(key);
    const row = e ? { user_id: this.user.id, key, v: e.v, deleted: false, body: ser(e) } : { user_id: this.user.id, key, v: S.tomb.get(key) || stamp(), deleted: true, body: null };
    const { error } = await this.client.from('kt_docs').upsert(row, { onConflict: 'user_id,key' });
    if (error) throw { code: 'unavailable', message: error.message };
    Persist.remoteV.set(key, row.v);
  },
  // Dateien
  safeName: n => (n || 'datei').normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'datei',
  async upload(blob, name) {
    const path = `${this.user.id}/${newId()}-${this.safeName(name)}`;
    const { error } = await this.client.storage.from(SUPA.bucket).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    return path;
  },
  async url(path) {
    const c = this.urls.get(path); if (c && c.until > Date.now()) return c.url;
    if (!this.client || !this.user) return '';
    const { data, error } = await this.client.storage.from(SUPA.bucket).createSignedUrl(path, 7 * 86400);
    if (error || !data) return '';
    this.urls.set(path, { url: data.signedUrl, until: Date.now() + 6 * 86400e3 }); return data.signedUrl;
  },
  async download(path) { const { data, error } = await this.client.storage.from(SUPA.bucket).download(path); if (error) throw error; return data; },
  async signOut() {
    await Persist.flush();
    if (Persist.dirty.size && !(await confirmDialog('Abmelden, obwohl noch Änderungen fehlen?', 'Einige Änderungen sind noch nicht hochgeladen (z. B. weil du offline bist). Sie gehen beim Abmelden verloren.', 'Trotzdem abmelden'))) return;
    try { await this.client.auth.signOut(); } catch (e) {}
    await wipeLocalData(); lsSet('kt-uid', null); location.reload();
  }
};
async function wipeLocalData() {
  S.cards.clear(); S.boards.clear(); S.pres.clear(); S.folders.clear(); S.tomb.clear();
  try { if (LocalCache.idb) await new Promise(res => { const tx = LocalCache.idb.transaction('ents', 'readwrite'); tx.objectStore('ents').clear(); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('kt:')) localStorage.removeItem(k); } } catch (e) {}
  try { const db = await LocalFiles.open(); if (db) await new Promise(res => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').clear(); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
}
function renderAccount() {
  const box = $('#account'); if (!box) return;
  if (!HOST.supa) { box.hidden = true; return; }
  box.hidden = false; box.replaceChildren();
  if (Supa.user) box.append(h('span', { class: 'acc-mail', text: Supa.user.email || 'Angemeldet' }), h('button', { class: 'link-btn', type: 'button', text: 'Abmelden', onclick: () => Supa.signOut() }));
  else box.append(h('span', { class: 'acc-mail', text: 'Nicht angemeldet' }), h('button', { class: 'link-btn', type: 'button', text: 'Anmelden', onclick: () => Auth.show() }));
}
// Anmeldemaske
const Auth = {
  show(mode = 'login') {
    const el = $('#auth'); el.hidden = false; this.mode = mode; this.render();
  },
  hide() { const el = $('#auth'); if (el) { el.hidden = true; el.replaceChildren(); } },
  render(msg, isErr) {
    const el = $('#auth'); const login = this.mode === 'login';
    const email = h('input', { class: 'm-input', type: 'email', id: 'authEmail', autocomplete: 'email', placeholder: 'E-Mail-Adresse', 'aria-label': 'E-Mail-Adresse', value: lsGet('kt-last-email') || '' });
    const pw = h('input', { class: 'm-input', type: 'password', id: 'authPw', autocomplete: login ? 'current-password' : 'new-password', placeholder: login ? 'Passwort' : 'Passwort (mind. 8 Zeichen)', 'aria-label': 'Passwort' });
    const note = h('p', { class: 'auth-msg' + (isErr ? ' err' : ''), role: 'status', text: msg || '' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: login ? 'Anmelden' : 'Konto anlegen' });
    const form = h('form', { class: 'auth-form' }, email, pw, note, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault(); const em = email.value.trim(), p = pw.value;
      if (!em || !p) { this.render('Bitte E-Mail und Passwort eingeben.', true); return; }
      lsSet('kt-last-email', em); submit.disabled = true; note.textContent = login ? 'Melde an …' : 'Lege Konto an …'; note.className = 'auth-msg';
      try {
        if (login) {
          const { error } = await Supa.client.auth.signInWithPassword({ email: em, password: p });
          if (error) throw error;
        } else {
          if (p.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
          const { data, error } = await Supa.client.auth.signUp({ email: em, password: p, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { this.mode = 'login'; this.render('Fast geschafft: Bestätige deine E-Mail über den Link im Postfach (auch im Spam-Ordner nachsehen). Danach hier anmelden.'); return; }
        }
      } catch (err) {
        const m = String(err && err.message || err);
        const de = /invalid login/i.test(m) ? 'E-Mail oder Passwort stimmt nicht.' : /not confirmed/i.test(m) ? 'Die E-Mail-Adresse ist noch nicht bestätigt. Bitte den Link in der Bestätigungs-Mail öffnen.' : /already registered/i.test(m) ? 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.' : /rate limit/i.test(m) ? 'Zu viele Versuche. Bitte in einigen Minuten erneut probieren.' : /fetch|network/i.test(m) ? 'Keine Verbindung. Bist du online?' : m;
        this.render(de, true);
      }
    });
    el.replaceChildren(h('div', { class: 'auth-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Anmelden' },
      h('div', { class: 'auth-brand', html: $('.brand .logo').outerHTML + '<span>Kartentisch</span>' }),
      h('p', { class: 'auth-lead', text: login ? 'Melde dich an. Deine Karten sind dann auf Mac, iPad und iPhone gleich.' : 'Neues Konto anlegen. Danach bekommst du eine E-Mail zur Bestätigung.' }),
      form,
      h('div', { class: 'auth-links' },
        h('button', { class: 'link-btn', type: 'button', text: login ? 'Noch kein Konto? Konto anlegen' : 'Schon ein Konto? Anmelden', onclick: () => { this.mode = login ? 'signup' : 'login'; this.render(); } }),
        login ? h('button', { class: 'link-btn', type: 'button', text: 'Passwort vergessen?', onclick: () => this.reset() }) : null,
        h('button', { class: 'link-btn muted', type: 'button', text: 'Ohne Konto nur auf diesem Gerät nutzen', onclick: () => { lsSet('kt-local-only', '1'); this.hide(); if (Persist.mode !== 'local') Persist.goLocal('chosen'); renderAccount(); } }))));
    setTimeout(() => (email.value ? pw : email).focus(), 30);
  },
  async reset() {
    const em = ($('#authEmail') || {}).value || lsGet('kt-last-email') || '';
    if (!em.trim()) { this.render('Gib zuerst oben deine E-Mail-Adresse ein.', true); return; }
    const { error } = await Supa.client.auth.resetPasswordForEmail(em.trim(), { redirectTo: location.origin + location.pathname });
    this.render(error ? 'Das hat nicht geklappt: ' + error.message : 'Wir haben dir einen Link zum Zurücksetzen geschickt.', !!error);
  },
  async newPassword() {
    const p = await promptDialog('Neues Passwort festlegen', '', 'Speichern', 'mindestens 8 Zeichen');
    if (!p) return; if (p.length < 8) { toast('Das Passwort braucht mindestens 8 Zeichen.'); return this.newPassword(); }
    const { error } = await Supa.client.auth.updateUser({ password: p });
    toast(error ? 'Passwort konnte nicht gespeichert werden: ' + error.message : 'Neues Passwort gespeichert.');
  }
};

// ---------- Umzug: Dateien mit exportieren und importieren ----------
function mediaBlocks(card) { return card.blocks.filter(b => ['image', 'file', 'video', 'audio'].includes(b.type) && (b.asset || b.local || b.sb)); }
const fileRef = b => b.asset ? 'asset:' + b.asset : b.sb ? 'sb:' + b.sb : b.local ? 'local:' + b.local : null;
async function blobForBlock(b) {
  if (b.asset) { const r = await fetch('/_blob/' + b.asset); if (!r.ok) throw new Error('fehlt'); return r.blob(); }
  if (b.sb) return Supa.download(b.sb);
  if (b.local) { const u = await LocalFiles.url(b.local); if (!u) throw new Error('fehlt'); return (await fetch(u)).blob(); }
  return null;
}
async function collectFiles() {
  const files = {}; let missing = 0;
  for (const c of S.cards.values()) for (const b of mediaBlocks(c)) {
    const ref = fileRef(b); if (!ref || files[ref]) continue;
    try { const blob = await blobForBlock(b); files[ref] = { name: b.name || '', type: blob.type || b.mime || '', data: await blobToDataUrl(blob) }; }
    catch (e) { missing++; }
  }
  return { files, missing };
}
// Nach dem Import: Dateien in den Speicher dieses Geräts bzw. Kontos bringen
async function relinkFiles(card, files) {
  if (!files) return;
  for (const b of mediaBlocks(card)) {
    const ref = fileRef(b); const f = ref && files[ref]; if (!f || typeof f.data !== 'string' || !f.data.startsWith('data:')) continue;
    const reachable = (b.asset && HOST.claude) || (b.sb && Supa.user) ; if (reachable) continue;
    try {
      const blob = await (await fetch(f.data)).blob();
      const file = new File([blob], f.name || b.name || 'datei', { type: f.type || blob.type });
      const nb = await Files.toBlock(file);
      for (const k of ['asset', 'sb', 'local', 'src']) delete b[k];
      for (const k of ['asset', 'sb', 'local', 'src']) if (nb[k]) b[k] = nb[k];
    } catch (e) { /* bleibt als fehlende Datei sichtbar */ }
  }
}
