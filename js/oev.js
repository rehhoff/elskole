/* Øv: dagens gentagelser med FSRS (ts-fsrs 5.2.3, global FSRS). Forfaldne kort og et antal nye kort, blandet på tværs af emner.
   Metoderne samles i app() i js/app.js. */
const KARAKTERER = [ { r:1, l:'Igen', k:'1' }, { r:2, l:'Svært', k:'2' }, { r:3, l:'Godt', k:'3' }, { r:4, l:'Let', k:'4' } ];
const LAER_FORUD_MIN = 20;  // kort i læringstrin, der forfalder inden for 20 min, vises i samme økt

function APP_OEV() {
  return {
    oevKoe: [], oevVent: [], oevId: '', oevVist: false, oevT0: 0, oevFortrydListe: [], oevEmne: '', oevEkstraNye: 0, oevSet: 0,
    karakterer: KARAKTERER,

    fsrs() {
      const p = FSRS.generatorParameters({ request_retention:this.indst.retention, maximum_interval:this.indst.maksInterval, enable_fuzz:true, enable_short_term:true });
      return FSRS.fsrs(p);
    },
    tilKort(t) {
      if (!t) return FSRS.createEmptyCard(new Date());
      return { due:new Date(t.due), stability:t.stability, difficulty:t.difficulty, elapsed_days:t.elapsed_days, scheduled_days:t.scheduled_days,
        learning_steps:t.learning_steps, reps:t.reps, lapses:t.lapses, state:t.state, last_review:t.last_review ? new Date(t.last_review) : undefined };
    },
    fraKort(id, c) {
      return normTilstand({ id, due:c.due.toISOString(), stability:c.stability, difficulty:c.difficulty, elapsed_days:c.elapsed_days, scheduled_days:c.scheduled_days,
        learning_steps:c.learning_steps, reps:c.reps, lapses:c.lapses, state:c.state, last_review:c.last_review ? new Date(c.last_review).toISOString() : '' });
    },

    aktiveKort() { return this.kort.filter(k => !k.slettet && (!this.oevEmne || k.emne === this.oevEmne)); },
    nyeIdag() { const d = dagNoegle(new Date()); return this.log.filter(l => l.ny && dagNoegle(l.tid) === d).length; },
    /* Forfalden: læringstrin når tiden er nået, gentagelser i løbet af i dag (som i Anki). */
    forfalden(t, naa) {
      if (!t) return false;
      const slut = new Date(naa); slut.setHours(23, 59, 59, 999);
      return (t.state === 1 || t.state === 3) ? new Date(t.due) <= naa : new Date(t.due) <= slut;
    },
    /* Bland på tværs af emner (interleaving): skiftevis ét kort fra hvert emne */
    oevBland(liste) {
      const g = {}; for (const k of liste) (g[k.emne] = g[k.emne] || []).push(k.id);
      const r = [], spande = Object.values(g); let i = 0;
      while (spande.some(s => s.length)) { const s = spande[i++ % spande.length]; if (s.length) r.push(s.shift()); }
      return r;
    },
    oevStart() {
      const naa = new Date(), aktive = this.aktiveKort();
      const forf = aktive.filter(k => this.forfalden(this.tilst[k.id], naa)).sort((a, b) => this.tilst[a.id].due < this.tilst[b.id].due ? -1 : 1);
      const plads = Math.max(0, this.indst.nyePrDag - this.nyeIdag()) + this.oevEkstraNye;
      const nye = aktive.filter(k => !this.tilst[k.id]).sort((a, b) => a.oprettet < b.oprettet ? -1 : 1).slice(0, plads);
      /* Først gentagelser, så nye kort flettet ind efter hver tredje gentagelse */
      const g = this.oevBland(forf), n = this.oevBland(nye), koe = [];
      while (g.length || n.length) { koe.push(...g.splice(0, 3)); if (n.length) koe.push(n.shift()); }
      this.oevKoe = koe; this.oevVent = []; this.oevNaeste();
    },
    oevNaeste() {
      this.oevVist = false;
      const naa = Date.now();
      this.oevVent.sort((a, b) => a.due - b.due);
      if (this.oevVent.length && this.oevVent[0].due <= naa) { this.oevId = this.oevVent.shift().id; }
      else if (this.oevKoe.length) this.oevId = this.oevKoe.shift();
      else if (this.oevVent.length && this.oevVent[0].due - naa <= LAER_FORUD_MIN * 60000) this.oevId = this.oevVent.shift().id;
      else this.oevId = '';
      this.oevT0 = Date.now();
    },
    oevAktiv() { return !!this.oevId; },
    oevKortet() { this.dataRev; return this.kort.find(k => k.id === this.oevId) || null; },
    oevRest() { return this.oevKoe.length + this.oevVent.length + (this.oevId ? 1 : 0); },
    oevVis() { if (this.oevId) this.oevVist = true; },

    /* Forhåndsvisning af næste interval for hver karakter */
    oevIntervaller() {
      if (!this.oevId) return {};
      const naa = new Date(), r = this.fsrs().repeat(this.tilKort(this.tilst[this.oevId]), naa), u = {};
      for (const k of KARAKTERER) u[k.r] = this.varighedTxt(r[k.r].card.due - naa);
      return u;
    },
    varighedTxt(ms) {
      const m = ms / 60000;
      if (m < 1) return '< 1 min'; if (m < 60) return Math.round(m) + ' min';
      const t = m / 60; if (t < 24) return Math.round(t) + ' t';
      const d = t / 24; if (d < 30) return Math.round(d) + ' d';
      if (d < 365) return (d / 30).toFixed(d < 60 ? 1 : 0).replace('.', ',') + ' md';
      return (d / 365).toFixed(1).replace('.', ',') + ' år';
    },
    async oevKarakter(r) {
      if (!this.oevId || !this.oevVist) return;
      const id = this.oevId, gl = this.tilst[id] || null, naa = new Date();
      const ud = this.fsrs().next(this.tilKort(gl), naa, r), ny = this.fraKort(id, ud.card);
      const l = normLog({ kortId:id, tid:naa.toISOString(), karakter:r, ny:!gl, foer:gl ? gl.state : 0, varighedMs:Math.min(600000, Date.now() - this.oevT0) });
      this.oevFortrydListe.push({ id, gl, logId:l.id }); if (this.oevFortrydListe.length > 20) this.oevFortrydListe.shift();
      await this.gemTilst(ny); await this.tilfoejLog(l); this.oevSet++;
      if ((ny.state === 1 || ny.state === 3) && new Date(ny.due) - naa < 24 * 3600000) this.oevVent.push({ id, due:new Date(ny.due).getTime() });
      this.oevNaeste();
    },
    async oevFortryd() {
      const f = this.oevFortrydListe.pop(); if (!f) return;
      this.oevVent = this.oevVent.filter(v => v.id !== f.id); this.oevKoe = this.oevKoe.filter(x => x !== f.id);
      if (this.oevId && this.oevId !== f.id) this.oevKoe.unshift(this.oevId);
      if (f.gl) await this.gemTilst(f.gl);
      else { delete this.tilst[f.id]; this.dataRev++; if (IDB) await new Promise(ok => { const tx = IDB.transaction('tilstand', 'readwrite'); tx.objectStore('tilstand').delete(f.id); tx.oncomplete = ok; tx.onerror = ok; }); }
      await this.fjernLog(f.logId); this.oevSet = Math.max(0, this.oevSet - 1);
      this.oevId = f.id; this.oevVist = true; this.oevT0 = Date.now();
    },
    oevFlereNye(n) { this.oevEkstraNye += n; this.oevStart(); },
    oevSkiftEmne(e) { this.oevEmne = e; this.oevStart(); },
    oevTast(e) {
      if (!this.oevId) return false;
      if ((e.key === ' ' || e.key === 'Enter') && !this.oevVist) { this.oevVis(); return true; }
      if (this.oevVist && /^[1-4]$/.test(e.key)) { this.oevKarakter(Number(e.key)); return true; }
      if (e.key === 'z' && this.oevFortrydListe.length) { this.oevFortryd(); return true; }
      return /^[1-4]$/.test(e.key);
    },

    /* Statistik til forsiden */
    stat() {
      this.dataRev;
      const naa = new Date(), idag = dagNoegle(naa), alle = this.kort.filter(k => !k.slettet);
      const dagens = this.log.filter(l => dagNoegle(l.tid) === idag);
      const dage = new Set(this.log.map(l => dagNoegle(l.tid)));
      /* Stribe: dage i træk med mindst ét svar. En enkelt fridag bryder ikke striben. I dag tæller først, når der er øvet. */
      let stribe = 0, fri = 0; const d = new Date(naa); if (!dage.has(idag)) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 3650; i++) { const k = dagNoegle(d); if (dage.has(k)) { stribe++; fri = 0; } else if (++fri > 1) break; d.setDate(d.getDate() - 1); }
      const imorgen = new Date(naa); imorgen.setDate(imorgen.getDate() + 1); imorgen.setHours(23, 59, 59, 999);
      return {
        i_alt:alle.length, nye:alle.filter(k => !this.tilst[k.id]).length, idag:dagens.length,
        rigtige:dagens.length ? Math.round(100 * dagens.filter(l => l.karakter > 1).length / dagens.length) : null,
        stribe, imorgen:alle.filter(k => { const t = this.tilst[k.id]; return t && new Date(t.due) <= imorgen; }).length
      };
    },
    /* Beherskelse pr. emne: andel kort med stabilitet ≥ 21 dage (som "modne" kort i Anki) */
    emneStat() {
      this.dataRev;
      return EMNER.map(e => {
        const k = this.kort.filter(x => !x.slettet && x.emne === e.id), t = k.map(x => this.tilst[x.id]).filter(Boolean);
        return { id:e.id, navn:e.navn, antal:k.length, startet:t.length, modne:t.filter(x => x.stability >= 21).length, pct:k.length ? Math.round(100 * t.filter(x => x.stability >= 21).length / k.length) : 0 };
      }).filter(e => e.antal);
    }
  };
}
