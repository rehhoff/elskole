/* Fase 3: kompetencetræ og log over typiske fejl. Fanen "Kompetence" vises, når kompStart() findes.
   Metoder og felter starter med "komp", så de ikke støder sammen med andre filer i bland(). Alt udregnes af data, der findes i forvejen
   (kort, tilstand, resultater). Der gemmes intet nyt. Alt i globalt scope starter med KOMP_ eller komp.
   Plan, formler og forenklinger: docs/planer/2026-11-22-fase-3-kompetence.md */

/* Delemner under de emner, hvor der er indhold at knytte til. Et delemne peger på kort (tags), opgavegeneratorer, cases og fejlfindingstyper.
   ff:['*'] betyder alle fejlfindingstyper. Emner uden poster her vises kun med deres kort og resultater. */
const KOMP_TRAE = {
  mat: [
    { id:'ohm', navn:'Ohms lov og spænding', tags:['ohm', 'spaending', 'serie', 'parallel'], opg:['ohm'] },
    { id:'effekt', navn:'Effekt og energi (1-faset)', tags:['effekt', '1-faset', 'energi', 'virkningsgrad'], opg:['effekt1'] },
    { id:'3fas', navn:'3-faset, stjerne og trekant', tags:['3-faset', 'stjerne', 'trekant'], opg:['effekt3'] },
    { id:'vekselstroem', navn:'Vekselstrøm, reaktans og cos φ', tags:['vekselstroem', 'effektivvaerdi', 'reaktans', 'impedans', 'spole', 'kondensator', 'reaktiv', 'cosphi'] },
    { id:'kompensering', navn:'Kompensering', tags:['kompensering'], opg:['kompensering'] },
    { id:'motor', navn:'Motorer og transformere', tags:['motor', 'omdrejninger', 'transformer'] }
  ],
  dim: [
    { id:'leder', navn:'Ledere og modstand', tags:['leder', 'temperatur'], opg:['ledermodstand'] },
    { id:'spfald', navn:'Spændingsfald', tags:['spaendingsfald'], opg:['du1', 'du3'] },
    { id:'iz', navn:'Strømværdi og korrektionsfaktorer', opg:['iz'] },
    { id:'udkobling', navn:'Udkobling, Zs og kortslutning', opg:['zs', 'ik'] },
    { id:'case-gruppe', navn:'Ny gruppe i ældre installation', cases:['case-ny-gruppe-aeldre'] },
    { id:'fejlfinding', navn:'Fejlfinding og måling', ff:['*'] }
  ],
  saer: [
    { id:'bad', navn:'Badeværelse og fugtige rum', cases:['case-badevaerelse'] },
    { id:'elbil', navn:'Ladepunkt til elbil', cases:['case-elbil-11kw'] },
    { id:'solceller', navn:'Solcelleanlæg', cases:['case-solceller'] },
    { id:'byggeplads', navn:'Byggepladstavle', cases:['case-byggeplads'] }
  ]
};

const KOMP_ARTER = { kort:'Kort', opgave:'Opgaver', case:'Cases', fejlfinding:'Fejlfinding' };
const KOMP_NIVEAUER = [
  { fra:0.85, navn:'Stærk', farve:'var(--ok)' }, { fra:0.65, navn:'God', farve:'var(--ok)' },
  { fra:0.4, navn:'Under opbygning', farve:'var(--warn)' }, { fra:0, navn:'Svag', farve:'var(--crit)' }
];
const KOMP_DAG = 86400000;

/* Hukommelsessandsynlighed for ét kort. FSRS definerer stabilitet som det antal dage, hvor sandsynligheden er faldet til 90 %. */
function kompHuskSandsynlighed(t, nu) {
  if (!t || !(t.state > 0) || !(t.stability > 0)) return 0;
  const sidst = t.last_review ? Date.parse(t.last_review) : NaN;
  const dage = Number.isFinite(sidst) ? Math.max(0, (nu - sidst) / KOMP_DAG) : 0;
  return Math.pow(0.9, dage / t.stability);
}

/* Seneste 10 forsøg, nyeste vægter mest (0,8 pr. trin). Resultater er sorteret med de ældste først. */
function kompForsoegVaerdi(liste) {
  const s = liste.slice(-10); let sum = 0, vaegt = 0;
  for (let i = 0; i < s.length; i++) { const w = Math.pow(0.8, s.length - 1 - i); sum += w * s[i].score; vaegt += w; }
  return vaegt ? sum / vaegt : null;
}

function kompNiveau(v) { return v == null ? null : KOMP_NIVEAUER.find(n => v >= n.fra); }

/* Samler kilderne for en mængde kort og resultater. Giver { kilder:{art:{v,n,…}}, beh, niveau }. */
function kompSamlet(kort, tilst, resultater, nu) {
  const kilder = {};
  if (kort.length) {
    let sum = 0, sete = 0;
    for (const k of kort) { const t = tilst[k.id], r = kompHuskSandsynlighed(t, nu); sum += r; if (t && t.state > 0) sete++; }
    kilder.kort = { v:sum / kort.length, n:kort.length, sete, vaegt:Math.min(1, kort.length / 5) };
  }
  for (const art of ['opgave', 'case', 'fejlfinding']) {
    const f = resultater.filter(r => r.art === art);
    if (f.length) kilder[art] = { v:kompForsoegVaerdi(f), n:f.length, rigtige:f.filter(r => r.korrekt).length, vaegt:Math.min(1, f.length / 3) };
  }
  let sum = 0, vaegt = 0;
  for (const k of Object.values(kilder)) { sum += k.v * k.vaegt; vaegt += k.vaegt; }
  const beh = vaegt ? sum / vaegt : null;
  return { kilder, beh, niveau:kompNiveau(beh) };
}

function APP_KOMPETENCE() {
  return {
    kompPeriode: '90',        // dage i fejllogens periode: '30' | '90' | 'alt'
    kompArtFilter: '',        // '' | 'opgave' | 'case' | 'fejlfinding'
    kompAaben: {},            // åbne emner i træet
    kompArter: KOMP_ARTER,
    _kompGenKort: null,       // fejlkode (opgave) -> generator-id'er, bygges første gang den skal bruges

    kompStart() {},

    /* ---------- Træ ---------- */
    kompTrae() {
      this.dataRev;
      const nu = Date.now(), kort = this.kort.filter(k => !k.slettet), res = this.resultater;
      return EMNER.map(e => {
        const ek = kort.filter(k => k.emne === e.id), er = res.filter(r => r.emne === e.id);
        const delemner = (KOMP_TRAE[e.id] || []).map(d => {
          const dk = d.tags ? ek.filter(k => k.tags.some(t => d.tags.includes(t))) : [];
          const dr = er.filter(r => (r.art === 'opgave' && (d.opg || []).includes(r.ref)) || (r.art === 'case' && (d.cases || []).includes(r.ref))
            || (r.art === 'fejlfinding' && d.ff && (d.ff.includes('*') || d.ff.includes(r.ref))));
          return Object.assign({ id:d.id, navn:d.navn, opg:d.opg || [], cases:d.cases || [] }, kompSamlet(dk, this.tilst, dr, nu));
        });
        /* Kort i et emne, som intet delemne dækker, vises samlet, så de ikke forsvinder */
        const dakket = new Set(); for (const d of KOMP_TRAE[e.id] || []) if (d.tags) for (const k of ek) if (k.tags.some(t => d.tags.includes(t))) dakket.add(k.id);
        const resten = ek.filter(k => !dakket.has(k.id));
        if (delemner.length && resten.length) delemner.push(Object.assign({ id:'oevrigt', navn:'Øvrige kort', opg:[], cases:[] }, kompSamlet(resten, this.tilst, [], nu)));
        return Object.assign({ id:e.id, navn:e.navn, delemner }, kompSamlet(ek, this.tilst, er, nu));
      });
    },
    kompPct(v) { return v == null ? '–' : Math.round(v * 100) + ' %'; },
    kompFarve(v) { const n = kompNiveau(v); return n ? n.farve : 'var(--line)'; },
    kompToggle(id) { this.kompAaben = Object.assign({}, this.kompAaben, { [id]: !this.kompAaben[id] }); },
    kompKildeTxt(art, k) {
      if (!k) return KOMP_ARTER[art] + ': ingen data';
      const n = art === 'kort' ? k.sete + ' af ' + k.n + ' kort set' : k.rigtige + ' af ' + k.n + ' rigtige';
      return KOMP_ARTER[art] + ' ' + Math.round(k.v * 100) + ' % (' + n + ')';
    },
    /* Svageste områder med data, til "Øv her"-listen øverst */
    kompSvageste() {
      const ud = [];
      for (const e of this.kompTrae()) for (const d of e.delemner) if (d.beh != null && d.id !== 'oevrigt') ud.push({ emne:e.id, emneNavn:e.kort, d });
      return ud.sort((a, b) => a.d.beh - b.d.beh).slice(0, 3);
    },
    /* Øv et emne eller delemne: opgaver først, så cases, ellers kortene i emnet */
    kompOev(emneId, d) {
      if (d && d.opg.length) { this.gaaTil('opgaver'); this.opgStart('gen:' + d.opg[Math.floor(Math.random() * d.opg.length)]); return; }
      if (d && d.cases.length) { this.kompAabnCase(d.cases[0]); return; }
      if (d && d.id === 'fejlfinding') { this.kompOevFejlfinding(''); return; }
      this.gaaTil('oev'); this.oevSkiftEmne(emneId);
    },
    kompHarOev(d) { return !!d && (d.opg.length > 0 || d.cases.length > 0 || d.id === 'fejlfinding'); },

    /* ---------- Log over typiske fejl ---------- */
    /* Fejlkode (opgave) -> generatorer, hvis typiskeFejl indeholder koden. Findes ved at lave opgaver med faste seeds. */
    kompGenForKode(kode) {
      if (!this._kompGenKort) {
        const m = {};
        if (typeof OPG_GENERATORER !== 'undefined' && typeof opgRng === 'function') {
          for (const g of OPG_GENERATORER) for (let s = 1; s <= 40; s++) {
            try { for (const f of g.lav(opgRng(s * 7919)).typiskeFejl || []) (m[f.fejltype] = m[f.fejltype] || new Set()).add(g.id); } catch (e) {}
          }
        }
        this._kompGenKort = m;
      }
      return [...(this._kompGenKort[kode] || [])];
    },
    kompFejlNavn(art, kode) {
      if (art === 'opgave' && typeof OPG_FEJLNAVNE !== 'undefined' && OPG_FEJLNAVNE[kode]) return OPG_FEJLNAVNE[kode];
      if (art === 'fejlfinding') {
        const fn = id => { const f = typeof FF_FEJL !== 'undefined' ? FF_FEJL.find(x => x.id === id) : null; return f ? f.navn : id; };
        const m = /^ff-type:([^>]+)>(.+)$/.exec(kode);
        if (m) return 'Fejlen var «' + fn(m[1]) + '», men du valgte ' + (m[2] === 'ingen' ? 'ingen fejltype' : '«' + fn(m[2]) + '»');
        if (kode === 'ff-placering') return 'Rigtig fejltype, men forkert placering';
        if (kode === 'ff-sikkerhed') return 'Sikkerhedsfejl under målingen';
      }
      const t = String(kode).replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1);
    },
    /* Fejl pr. (art, kode) i den valgte periode med tendens, ugesøjler og træning. */
    kompFejlLog() {
      this.dataRev;
      const nu = Date.now(), dage = this.kompPeriode === 'alt' ? 0 : Number(this.kompPeriode);
      const fra = dage ? nu - dage * KOMP_DAG : 0, forrigeFra = dage ? nu - 2 * dage * KOMP_DAG : 0;
      const alle = this.resultater.filter(r => r.fejltype && (!this.kompArtFilter || r.art === this.kompArtFilter));
      const g = {};
      for (const r of alle) {
        const t = Date.parse(r.tid), k = r.art + '|' + r.fejltype;
        const x = g[k] = g[k] || { art:r.art, kode:r.fejltype, antal:0, forrige:0, sidst:'', refs:{}, uger:[0, 0, 0, 0, 0, 0, 0, 0] };
        if (t >= fra) x.antal++; else if (dage && t >= forrigeFra) x.forrige++;
        if (!x.sidst || r.tid > x.sidst) x.sidst = r.tid;
        x.refs[r.ref] = (x.refs[r.ref] || 0) + 1;
        const u = Math.floor((nu - t) / (7 * KOMP_DAG)); if (u >= 0 && u < 8) x.uger[7 - u]++;
      }
      const liste = Object.values(g).filter(x => x.antal > 0);
      const sum = liste.reduce((a, x) => a + x.antal, 0), maks = Math.max(1, ...liste.flatMap(x => x.uger));
      return liste.sort((a, b) => b.antal - a.antal || (a.sidst < b.sidst ? 1 : -1)).map(x => {
        const gens = x.art === 'opgave' ? [...new Set([...this.kompGenForKode(x.kode), ...Object.keys(x.refs)])].filter(id => typeof OPG_GENERATORER !== 'undefined' && OPG_GENERATORER.some(o => o.id === id)) : [];
        const ref = Object.entries(x.refs).sort((a, b) => b[1] - a[1])[0];
        return Object.assign(x, { navn:this.kompFejlNavn(x.art, x.kode), andel:sum ? x.antal / sum : 0, gens, caseId:x.art === 'case' && ref ? ref[0] : '', uger:x.uger.map(n => n / maks),
          tendens:!dage ? '' : x.antal > x.forrige ? 'op' : x.antal < x.forrige ? 'ned' : 'lige' });
      });
    },
    kompTendensTxt(x) { return x.tendens === 'op' ? '▲ flere (før ' + x.forrige + ')' : x.tendens === 'ned' ? '▼ færre (før ' + x.forrige + ')' : x.tendens === 'lige' ? '= uændret' : ''; },
    kompTotalFejl() { return this.kompFejlLog().reduce((a, x) => a + x.antal, 0); },
    kompGenNavn(id) { const g = typeof OPG_GENERATORER !== 'undefined' ? OPG_GENERATORER.find(o => o.id === id) : null; return g ? g.navn : id; },

    /* ---------- Træning ---------- */
    kompOevOpgave(genId) { this.gaaTil('opgaver'); this.opgStart('gen:' + genId); },
    async kompAabnCase(id) {
      this.gaaTil('cases'); if (this.caseStart) await this.caseStart();
      const c = (this.caseListe || []).find(x => x.id === id); if (c) this.caseBegynd(c);
    },
    kompOevFejlfinding(kode) {
      this.gaaTil('fejlfinding');
      const m = /^ff-type:([^>]+)>/.exec(kode || '');
      if (this.ffNyt) this.ffNyt(undefined, m ? { fejl:m[1] } : undefined);
    }
  };
}
