/* Lager: kort, tilstand og log i IndexedDB (databasen "elskole"), indstillinger i localStorage, backupfil.
   Alt holdes også i hukommelsen (this.kort, this.tilst, this.log), og hver ændring skrives straks. Metoderne samles i app() i js/app.js. */
let IDB = null;

function idbAaben() {
  return new Promise((ok, fejl) => {
    if (!('indexedDB' in self)) return fejl(new Error('Ingen IndexedDB'));
    const r = indexedDB.open(IDB_NAVN, IDB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['kort', 'tilstand', 'log']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath:'id' });
    };
    r.onsuccess = () => ok(r.result); r.onerror = () => fejl(r.error); r.onblocked = () => fejl(new Error('Databasen er blokeret af en anden fane'));
  });
}
function idbAlle(s) { return new Promise((ok, fejl) => { const r = IDB.transaction(s).objectStore(s).getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => fejl(r.error); }); }
function idbPut(s, liste) {
  return new Promise((ok, fejl) => {
    const tx = IDB.transaction(s, 'readwrite'), st = tx.objectStore(s);
    for (const x of liste) st.put(x);
    tx.oncomplete = () => ok(); tx.onerror = () => fejl(tx.error); tx.onabort = () => fejl(tx.error);
  });
}

function APP_LAGER() {
  return {
    async lagerStart() {
      let meta = null;
      try { meta = JSON.parse(localStorage.getItem(K_META)); this.indst = normIndst(JSON.parse(localStorage.getItem(K_INDST))); } catch (e) { this.indst = normIndst(); }
      try {
        IDB = await idbAaben();
        const [k, t, l] = await Promise.all([idbAlle('kort'), idbAlle('tilstand'), idbAlle('log')]);
        this.kort = k.map(normKort); this.log = l.map(normLog).sort((a, b) => a.tid < b.tid ? -1 : 1);
        const tm = {}; for (const x of t) { const n = normTilstand(x); if (n.id) tm[n.id] = n; } this.tilst = tm;
      } catch (e) { IDB = null; this.storageOk = false; this.kort = []; this.tilst = {}; this.log = []; }
      /* Første start efter en hævning af SCHEMA: tag en backup, før noget ændres (CLAUDE.md afsnit 1) */
      const gl = meta ? Number(meta.schema) || 0 : 0;
      if (meta && gl < SCHEMA && this.kort.length) this.autoBackup('Automatisk før opdatering fra skema ' + gl + ' til ' + SCHEMA);
      if (meta && meta.sidstBackup) this.sidstBackup = meta.sidstBackup;
      this.gemMeta(); this.dataRev++;
    },
    gemMeta() { try { localStorage.setItem(K_META, JSON.stringify({ schema:SCHEMA, sidstBackup:this.sidstBackup || '' })); } catch (e) {} },
    gemIndst() { this.indst = normIndst(this.indst); try { localStorage.setItem(K_INDST, JSON.stringify(this.indst)); } catch (e) {} this.synkSenere(); },

    async skriv(s, liste) {
      if (!liste.length || !IDB) return;
      try { await idbPut(s, JSON.parse(JSON.stringify(liste))); } catch (e) { this.say('Kunne ikke gemme i browseren: ' + (e && e.message || e), true); }
    },
    /* Gem et eller flere kort (nye eller rettede). rettet sættes, så synk ved, hvilken udgave der er nyest. */
    async gemKort(liste, beholdRettet) {
      liste = (Array.isArray(liste) ? liste : [liste]).map(k => { k = normKort(k); if (!beholdRettet) k.rettet = nu(); return k; });
      const idx = new Map(this.kort.map((k, i) => [k.id, i]));
      for (const k of liste) { const i = idx.get(k.id); if (i == null) { idx.set(k.id, this.kort.length); this.kort.push(k); } else this.kort.splice(i, 1, k); }
      this.dataRev++; await this.skriv('kort', liste); this.synkSenere(); return liste;
    },
    async gemTilst(liste, beholdRettet) {
      liste = (Array.isArray(liste) ? liste : [liste]).map(t => { t = normTilstand(t); if (!beholdRettet) t.rettet = nu(); return t; });
      for (const t of liste) this.tilst[t.id] = t;
      this.dataRev++; await this.skriv('tilstand', liste); this.synkSenere();
    },
    async tilfoejLog(liste) {
      liste = (Array.isArray(liste) ? liste : [liste]).map(normLog);
      const kendt = new Set(this.log.map(l => l.id)); liste = liste.filter(l => !kendt.has(l.id));
      if (!liste.length) return;
      this.log.push(...liste); this.log.sort((a, b) => a.tid < b.tid ? -1 : 1);
      this.dataRev++; await this.skriv('log', liste); this.synkSenere();
    },
    /* Log kan kun slettes, når en karakter fortrydes (samme session, sidste svar). */
    async fjernLog(id) {
      this.log = this.log.filter(l => l.id !== id); this.dataRev++;
      if (IDB) await new Promise(ok => { const tx = IDB.transaction('log', 'readwrite'); tx.objectStore('log').delete(id); tx.oncomplete = ok; tx.onerror = ok; });
      this.synkSenere();
    },

    /* Backup: én JSON-fil med alt. Indlæsning fletter (nyeste vinder), så intet går tabt. */
    backupData() { return { format:'elskole-backup', app:APP_VERSION, schema:SCHEMA, dato:nu(), kort:this.kort, tilstand:Object.values(this.tilst), log:this.log, indstillinger:this.indst }; },
    autoBackup(grund) { try { localStorage.setItem(K_BACKUP, JSON.stringify(Object.assign(this.backupData(), { grund }))); } catch (e) {} },
    hentBackup() {
      const tekst = JSON.stringify(this.backupData(), null, 1), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([tekst], { type:'application/json' })); a.download = 'elskole-backup-' + dagNoegle(new Date()) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.sidstBackup = nu(); this.gemMeta(); this.say('Backup hentet.');
    },
    async indlaesBackupFil(ev) {
      const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
      let d = null; try { d = JSON.parse(await f.text()); } catch (e) {}
      await this.indlaesBackup(d);
    },
    async indlaesBackup(d) {
      if (!d || d.format !== 'elskole-backup' || !Array.isArray(d.kort)) return this.say('Filen er ikke en backup fra Elskolen.', true);
      if ((Number(d.schema) || 0) > SCHEMA) return this.say('Backuppen er lavet af en nyere version af appen. Genindlæs siden med Ctrl+F5 og prøv igen.', true);
      const k = flet(this.kort, d.kort.map(normKort)).filter(x => { const g = this.kort.find(y => y.id === x.id); return !g || g !== x; });
      const nyT = flet(Object.values(this.tilst), (d.tilstand || []).map(normTilstand)).filter(x => x !== this.tilst[x.id]);
      await this.gemKort(k, true); await this.gemTilst(nyT, true); await this.tilfoejLog(d.log || []);
      this.say('Backup indlæst: ' + k.length + ' kort nye eller opdateret.');
    }
  };
}
