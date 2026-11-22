/* Fase 4: case-motor med forgreninger og regelbibliotek. Fanen "Cases" vises, når caseStart() findes.
   Metoder og felter starter med "case", så de ikke støder sammen med andre filer i bland(). Resultater gemmes med this.tilfoejResultat().
   En case er en JSON-fil i indhold/cases/ med en graf af trin (valg, tal, flere, slut). Formatet står i docs/planer/2026-11-22-fase-4-cases.md.
   Nye casefiler skal stå både her og i SKAL i sw.js. */
const CASE_FILER = ['elbil-11kw', 'badevaerelse', 'ny-gruppe-aeldre', 'byggeplads', 'solceller'].map(n => 'indhold/cases/' + n + '.json');
const CASE_REGLER_FIL = 'indhold/regler.json';
const CASE_KORREKT = 0.8;  // score, der tæller som gennemført korrekt
/* Tom case, som visningen bruger i det øjeblik en case lukkes, så Alpine ikke læser felter på null. */
const CASE_TOM = { c:{ id:'', titel:'', intro:'', emne:'andet', start:'slut', trin:{ slut:{ type:'slut', tekst:'' } } }, trinId:'slut', vej:[], svar:null, tal:'', flere:[], slut:false, score:0 };

function APP_CASES() {
  return {
    caseListe: [], caseRegler: [], caseIndlaest: false, caseHenter: false, caseFejl: '',
    caseVis: 'liste',      // 'liste' | 'regler'
    caseAktiv: null,       // { c, trinId, vej:[], svar, tal, flere:[], start, slut, score }
    caseRegelQ: '', caseRegelVist: null,

    /* Kaldes, når fanen vises. Henter casefiler og regelbibliotek én gang. */
    async caseStart() {
      if (this.caseIndlaest || this.caseHenter) return;
      this.caseHenter = true;
      const hent = async f => { try { const r = await fetch(f + '?v=' + APP_VERSION); return r.ok ? await r.json() : null; } catch (e) { return null; } };
      const [regler, ...cases] = await Promise.all([hent(CASE_REGLER_FIL), ...CASE_FILER.map(hent)]);
      this.caseRegler = regler && Array.isArray(regler.regler) ? regler.regler : [];
      this.caseListe = cases.filter(c => c && c.id && c.trin && c.trin[c.start]);
      this.caseFejl = !regler || this.caseListe.length < CASE_FILER.length ? 'Nogle cases eller regelbiblioteket kunne ikke hentes. Prøv igen, når der er net.' : '';
      this.caseHenter = false; this.caseIndlaest = !this.caseFejl;
    },

    caseRegel(id) { return this.caseRegler.find(r => r.id === id) || null; },
    caseKildeTxt(r) { return r ? [r.dok, r.afsnit && 'afsn. ' + r.afsnit, r.udgave && 'udg. ' + r.udgave, r.gyldigFra && 'gyldig fra ' + r.gyldigFra].filter(Boolean).join(', ') : ''; },
    caseVisRegel(id) { const r = this.caseRegel(id); if (!r) return; this.caseRegelVist = r; this.modal = 'caseRegel'; },

    /* Fremskridt pr. case ud fra resultaterne */
    caseForsoeg(id) { this.dataRev; return this.resultater.filter(r => r.art === 'case' && r.ref === id); },
    caseBedste(id) { const f = this.caseForsoeg(id); return f.length ? Math.max(...f.map(r => r.score)) : null; },
    casePct(x) { return x == null ? '–' : Math.round(x * 100) + ' %'; },
    caseFarve(s) { return !s || s.m === 0 ? 'var(--line)' : s.p >= s.m ? 'var(--ok)' : s.p > 0 ? 'var(--warn)' : 'var(--crit)'; },

    /* Motor */
    caseBegynd(c) {
      this.caseAktiv = { c, trinId:c.start, vej:[], svar:null, tal:'', flere:[], start:Date.now(), slut:false, score:0 };
      this.caseNytTrin();
    },
    caseTrin() { const a = this.caseAktiv; return a ? a.c.trin[a.trinId] : null; },
    caseNytTrin() {
      const a = this.caseAktiv, t = this.caseTrin(); a.svar = null; a.tal = '';
      a.flere = t && t.type === 'flere' ? t.muligheder.map(() => false) : [];
      if (t && t.type === 'slut') this.caseAfslut();
      this.$nextTick && this.$nextTick(() => { const e = document.getElementById('case-trin'); if (e && e.scrollIntoView) e.scrollIntoView({ block:'nearest' }); });
    },
    caseMaks(t) {
      if (!t) return 0;
      if (t.type === 'valg') return Math.max(0, ...t.svar.map(s => Number(s.point) || 0));
      return t.type === 'tal' || t.type === 'flere' ? Number(t.point) || 0 : 0;
    },
    caseSvarValg(i) {
      const a = this.caseAktiv, t = this.caseTrin(); if (!a || a.svar || !t || t.type !== 'valg') return;
      const s = t.svar[i]; if (!s) return;
      a.svar = { t:a.trinId, v:i, p:Number(s.point) || 0, m:this.caseMaks(t), fejltype:str(s.fejltype), feedback:str(s.feedback), til:s.til };
    },
    caseTal(v) { v = str(v).trim().replace(/\s/g, '').replace(',', '.'); return v === '' ? NaN : Number(v); },
    caseSvarTal() {
      const a = this.caseAktiv, t = this.caseTrin(); if (!a || a.svar || !t || t.type !== 'tal') return;
      const v = this.caseTal(a.tal);
      if (!Number.isFinite(v)) return this.say('Skriv et tal, fx 15,9.', true);
      const ok = Math.abs(v - t.facit) <= (Number(t.tol) || 0);
      const typ = ok ? null : (t.typiske || []).find(x => Math.abs(v - x.vaerdi) <= (Number(x.tol) || Number(t.tol) || 0));
      a.svar = { t:a.trinId, v, p:ok ? Number(t.point) || 0 : 0, m:this.caseMaks(t), ok,
        fejltype:ok ? '' : str(typ ? typ.fejltype : t.fejltype), feedback:ok ? str(t.feedbackRigtig) : str(typ ? typ.feedback : t.feedbackForkert),
        til:(ok ? t.rigtigTil : t.forkertTil) || t.til };
    },
    caseSvarFlere() {
      const a = this.caseAktiv, t = this.caseTrin(); if (!a || a.svar || !t || t.type !== 'flere') return;
      const m = t.muligheder, antal = m.filter(x => x.rigtig).length || 1;
      let rv = 0, fv = 0, fejl = '';
      m.forEach((x, i) => {
        if (a.flere[i] && x.rigtig) rv++;
        if (a.flere[i] && !x.rigtig) fv++;
        if (!fejl && !!a.flere[i] !== !!x.rigtig) fejl = str(x.fejltype) || str(t.fejltype);
      });
      const p = Math.round(Math.max(0, (rv - fv) / antal) * (Number(t.point) || 0) * 100) / 100;
      a.svar = { t:a.trinId, v:m.map((x, i) => i).filter(i => a.flere[i]), p, m:this.caseMaks(t), fejltype:fejl, feedback:'', til:t.til };
    },
    caseVidere() {
      const a = this.caseAktiv; if (!a || !a.svar) return;
      const s = a.svar; a.vej.push({ t:s.t, v:s.v, p:s.p, m:s.m, fejltype:s.fejltype });
      if (!a.c.trin[s.til]) { this.say('Casen peger på et trin, der ikke findes: ' + s.til, true); return; }
      a.trinId = s.til; this.caseNytTrin();
    },
    async caseAfslut() {
      const a = this.caseAktiv; if (!a || a.slut) return;
      const p = a.vej.reduce((x, v) => x + v.p, 0), m = a.vej.reduce((x, v) => x + v.m, 0);
      a.score = m ? Math.round(p / m * 1000) / 1000 : 1; a.slut = true;
      const f = a.vej.find(v => v.fejltype && v.p < v.m);
      await this.tilfoejResultat({ art:'case', ref:a.c.id, emne:a.c.emne, korrekt:a.score >= CASE_KORREKT, score:a.score, fejltype:f ? f.fejltype : '',
        varighedMs:Date.now() - a.start, data:{ vej:a.vej.map(v => ({ t:v.t, v:v.v, p:v.p, m:v.m })) } });
    },
    caseLuk() { this.caseAktiv = null; },

    /* Tekster til gennemgangen efter casen */
    caseValgTxt(t, v) {
      if (!t) return '';
      if (t.type === 'valg') return t.svar[v] ? t.svar[v].tekst : '';
      if (t.type === 'tal') return String(v).replace('.', ',') + (t.enhed ? ' ' + t.enhed : '');
      if (t.type === 'flere') return (v || []).map(i => t.muligheder[i] && t.muligheder[i].tekst).filter(Boolean).join(' · ') || '(intet valgt)';
      return '';
    },
    caseGennemgang() {
      const a = this.caseAktiv; if (!a) return [];
      return a.vej.map(v => {
        const t = a.c.trin[v.t]; let fb = '';
        if (t.type === 'valg') fb = str(t.svar[v.v] && t.svar[v.v].feedback);
        else if (t.type === 'tal') {
          const ok = v.p >= v.m, typ = ok ? null : (t.typiske || []).find(x => Math.abs(v.v - x.vaerdi) <= (Number(x.tol) || Number(t.tol) || 0));
          fb = (ok ? str(t.feedbackRigtig) : str(typ ? typ.feedback : t.feedbackForkert)) + (t.loesning ? '\n' + t.loesning : '');
        } else if (t.type === 'flere') fb = t.muligheder.filter((x, i) => x.rigtig || (v.v || []).includes(i)).map(x => (x.rigtig ? '✓ ' : '✗ ') + x.tekst + ': ' + str(x.feedback)).join('\n');
        return { t, v, valg:this.caseValgTxt(t, v.v), fb };
      });
    },

    /* Regelbibliotek */
    caseReglerListe() {
      const q = this.caseRegelQ.trim().toLowerCase();
      return this.caseRegler.filter(r => !q || [r.titel, r.resume, r.dok, r.afsnit, (r.tags || []).join(' ')].join('\n').toLowerCase().includes(q));
    },
    caseHarKort(r) { this.dataRev; return this.kort.some(k => !k.slettet && k.oprindelse === 'regel:' + r.id); },
    async caseLavKort(r) {
      if (!r) return;
      if (this.caseHarKort(r)) return this.say('Der findes allerede et kort af denne regel.');
      const kilde = { dok:str(r.dok), afsnit:str(r.afsnit), udgave:str(r.udgave), gyldigFra:str(r.gyldigFra) };
      const front = 'Hvad er reglen om: **' + str(r.titel) + '**?' + (r.dok ? '\n(' + this.caseKildeTxt(r) + ')' : '');
      const bag = str(r.resume) + (r.verificeret ? '' : '\n\n**Ikke kontrolleret mod kilden.** Slå op i den gældende udgave.');
      await this.gemKort(nytKort({ type:'regel', emne:EMNE_IDS.includes(r.emne) ? r.emne : 'andet', front, bag, kilde,
        tags:[...(r.tags || []), 'regel'], oprindelse:'regel:' + r.id }));
      this.say('Kortet er oprettet og kommer med i øvelserne.');
      if (this.oevStart) this.oevStart();
    }
  };
}
