/* Fase 6: prøvesimulering og kobling til El-oversigtsappen. Fanen "Prøve" vises, når proeveStart() findes.
   Metoder og felter starter med "proeve", globale navne med PROEVE_ eller proeve. Plan: docs/planer/2026-11-22-fase-6-proeve.md.
   Prøven blander kort, regler (regelbiblioteket), regneopgaver (fase 2) og cases (fase 4) og giver en vejledende karakter.
   Ejeren sigter mod autorisation som elinstallatør (2026-11-23), så 'aut' er standard. De andre niveauer kan stadig vælges.
   El-oversigtsappen (samme origin) læses kun med localStorage.getItem. Der skrives, slettes eller åbnes aldrig noget hos den. */

const K_PROEVE = 'elskole.proeve';   // { niv, ind }: kun valg på denne enhed, synkroniseres ikke
/* Sammensætning pr. niveau. emner: tom liste = alle. maksNiveau: højeste opgaveniveau (1–3). Et bud, ikke den officielle prøveform. */
const PROEVE_NIVEAUER = [
  { id:'svend', navn:'Svendeprøve (elektriker)', min:60, kort:8, regler:2, opg:5, cases:1, maksNiveau:2, emner:['mat', 'dim', 'saer', 'arb'] },
  { id:'aut', navn:'Autoriseret elinstallatør', min:90, kort:6, regler:5, opg:4, cases:2, maksNiveau:3, emner:['dim', 'saer', 'love', 'erhv', 'arb'] },
  { id:'gen', navn:'Generel faglig dygtighed', min:45, kort:6, regler:3, opg:4, cases:1, maksNiveau:3, emner:[] },
  { id:'hurtig', navn:'Kort test', min:15, kort:4, regler:1, opg:2, cases:0, maksNiveau:2, emner:[] }
];
const PROEVE_VAEGT = { kort:1, regel:1, opgave:2, case:3 };   // point pr. spørgsmål
/* Procent -> 7-trinsskala (vejledende). Under 40 % er −3. */
const PROEVE_SKALA = [[92, '12'], [80, '10'], [65, '7'], [50, '4'], [40, '02'], [20, '00']];
const PROEVE_BESTAAET = 40;
const PROEVE_EL_INDEKS = 'tavleoversigt.projekter', PROEVE_EL_PROJEKT = id => 'tavleoversigt.p.' + id;
let PROEVE_TIMER = null;
/* Tomme stand-ins, så visningen ikke læser felter på null i det øjeblik prøven lukkes (som CASE_TOM i fase 4). */
const PROEVE_TOM = { id:'', niv:'', navn:'', min:0, items:[], nu:0, start:0, slutTid:0, faerdig:false, tidUd:false, res:null };
const PROEVE_TOM_SP = { art:'', emne:'andet', k:{ front:'', bag:'' }, r:{ titel:'', resume:'', kilde:'', verificeret:true }, opg:{ tekst:'', svar:[], trin:[] }, ind:{}, c:{ titel:'', intro:'' }, state:'', vist:false, vurd:null, res:null, point:0, maks:0, score:0 };

function proeveKarakter(pct) { for (const [g, k] of PROEVE_SKALA) if (pct >= g) return k; return '-3'; }
function proeveBland(l) { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* Navne fra El-oversigten vises med vis(): $ og \ fjernes, så de ikke bliver til formler. */
function proeveRens(s) { return str(s).replace(/[$\\]/g, '').trim().slice(0, 60); }
function proeveTal(v, maks) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(maks, Math.max(0, v)) : 0; }
/* n forskellige (så mange der er), foretrukket fra emnerne */
function proeveVaelg(liste, emneAf, emner, n) {
  const f = emner.length ? liste.filter(x => emner.includes(emneAf(x))) : liste, rest = liste.filter(x => !f.includes(x));
  return [...proeveBland(f), ...proeveBland(rest)].slice(0, n);
}
/* n elementer, med gentagelse når listen er kortere */
function proeveCyk(liste, n) { const ud = []; while (liste.length && ud.length < n) ud.push(...proeveBland(liste)); return ud.slice(0, n); }
function proeveArt() { return RESULTAT_ARTER.includes('proeve') ? 'proeve' : 'case'; }   // se planen: 'proeve' mangler i data.js

/* ---------- Kobling til El-oversigten: kun læsning ---------- */
function proeveElProjekter() {
  const ud = { fundet:false, projekter:0, zs:[], du:[] };
  let idx; try { idx = JSON.parse(localStorage.getItem(PROEVE_EL_INDEKS)); } catch (e) { return ud; }
  const liste = idx && Array.isArray(idx.liste) ? idx.liste : [];
  for (const p of liste.slice(0, 20)) {
    let d; try { d = JSON.parse(localStorage.getItem(PROEVE_EL_PROJEKT(str(p && p.id)))); } catch (e) { continue; }
    if (!d || !Array.isArray(d.grupper)) continue;
    ud.fundet = true; ud.projekter++;
    const pn = proeveRens(d.projekt && d.projekt.navn) || proeveRens(p.navn) || 'uden navn', G = new Map();
    for (const g of d.grupper) {
      if (!g || typeof g !== 'object') continue; G.set(g.id, g);
      if (OPG_KURVE[g.kar] && Number(g.In) > 0 && ud.zs.length < 200) ud.zs.push({ projekt:pn, nr:proeveRens(g.nr), navn:proeveRens(g.navn), kar:g.kar, In:Number(g.In) });
    }
    for (const e of Array.isArray(d.enheder) ? d.enheder : []) {
      const g = e && G.get(e.gruppeId), P = Number(e && e.effekt), L = Number(e && e.laengde), A = Number(e && e.tv);
      if (g && P > 0 && L > 0 && A > 0 && (e.kabel === 'PVC' || e.kabel === 'XLPE') && ud.du.length < 200)
        ud.du.push({ projekt:pn, nr:proeveRens(g.nr), enhed:proeveRens(e.navn), P, L, A, kabel:e.kabel, trefas:Number(g.faser) === 3 && !e.fase });
    }
  }
  return ud;
}
/* Generatorer ud fra ejerens egne data (samme formler som zs, du1 og du3 i fase 2). lav() bruger ikke tilfældighed. */
function proeveProjZs(c) {
  return { id:'proj-zs', navn:'Projektopgave: største Zs', emne:'dim', niveau:2, lav() {
    const k = OPG_KURVE[c.kar], Ia = k * c.In, Zs = 2 / 3 * 230 / Ia, andre = ['B', 'C', 'D'].filter(x => x !== c.kar);
    return { tekst:`Fra dit projekt «${c.projekt}»: gruppe ${c.nr} («${c.navn}») har en automatsikring ${c.kar}${c.In} ($U_0 = 230\\,\\text{V}$). Find udkoblingsstrømmen $I_a$ og den største sløjfeimpedans $Z_s$, hvor sikringen kobler ud ved en måling.`,
      inddata:{ In:c.In, kurve:c.kar, k },
      svar:[opgSvar('ia', 'Udkoblingsstrøm $I_a$', 'A', Ia), opgSvar('zs', 'Største $Z_s$', 'Ω', Zs)],
      trin:[OPG_R`$I_a = k \cdot I_n$ med $k = 5$ for B, $10$ for C og $20$ for D. Her: $I_a = ${k} \cdot ${OPG_M(c.In)}\,\text{A} = ${OPG_M(Ia)}\,\text{A}$`,
        OPG_R`$Z_s \le \dfrac{2}{3} \cdot \dfrac{U_0}{I_a} = \dfrac{2}{3} \cdot \dfrac{230\,\text{V}}{${OPG_M(Ia)}\,\text{A}} = ${OPG_M(Zs)}\,\Omega$`],
      typiskeFejl:[...andre.map(x => opgFejl('forkert-kurve', 'ia', OPG_KURVE[x] * c.In, `Du har brugt faktoren for karakteristik ${x}. Her er det ${c.kar} (k = ${k}).`)),
        opgFejl('glemt-23', 'zs', 230 / Ia, OPG_R`Du har glemt faktoren $2/3$.`), opgFejl('forkert-spaending', 'zs', 2 / 3 * 400 / Ia, 'Du har brugt 400 V. U₀ er fase mod jord, 230 V.')] };
  } };
}
function proeveProjDu(c) {
  return { id:'proj-du', navn:'Projektopgave: spændingsfald', emne:'dim', niveau:2, lav() {
    const U = c.trefas ? 400 : 230, I = c.P / (c.trefas ? OPG_S3 * 400 : 230), f = c.trefas ? OPG_S3 : 2, dU = f * OPG_RHO * c.L * I / c.A, p = dU / U * 100;
    const fejl = c.trefas
      ? [opgFejl('glemt-sqrt3', 'pct', OPG_RHO * c.L * I / c.A / 400 * 100, OPG_R`Du har glemt $\sqrt{3}$.`), opgFejl('faktor2-for-meget', 'pct', 2 * OPG_RHO * c.L * I / c.A / 400 * 100, OPG_R`Du har brugt 2 i stedet for $\sqrt{3}$.`),
        opgFejl('forkert-spaending', 'pct', dU / 230 * 100, 'Du har delt med 230 V. 3-faset ΔU måles mellem faserne, så det er 400 V.'), opgFejl('glemt-sqrt3', 'i', c.P / 400, OPG_R`Du har glemt $\sqrt{3}$.`)]
      : [opgFejl('glemt-faktor2', 'pct', p / 2, 'Du har glemt faktor 2: strømmen går både frem og tilbage.'), opgFejl('sqrt3-i-1faset', 'pct', OPG_S3 * OPG_RHO * c.L * I / c.A / 230 * 100, OPG_R`Du har brugt $\sqrt{3}$ i et 1-faset udtryk.`),
        opgFejl('forkert-spaending', 'pct', dU / 400 * 100, 'Du har delt med 400 V. 1-faset er det 230 V.'), opgFejl('forkert-spaending', 'i', c.P / 400, 'Du har brugt 400 V. 1-faset er det 230 V.')];
    return { tekst:`Fra dit projekt «${c.projekt}»: «${c.enhed}» på gruppe ${c.nr} er på ${OPG_T(c.P)} W og tilsluttet ${c.trefas ? '3-faset (3 × 400 V)' : '1-faset (230 V)'} med ${c.kabel}-kabel, ${OPG_T(c.A)} mm² kobber, ${OPG_T(c.L)} m ($\\cos\\varphi = 1$, $\\rho = 0{,}0225\\,\\Omega\\cdot\\text{mm}^2/\\text{m}$). Find strømmen og spændingsfaldet i procent på kablet.`,
      inddata:{ P:c.P, L:c.L, A:c.A, trefas:c.trefas },
      svar:[opgSvar('i', 'Strømmen I', 'A', I), opgSvar('pct', 'Spændingsfald', '%', p)],
      trin:[c.trefas ? OPG_R`$I = \dfrac{P}{\sqrt{3} \cdot U} = \dfrac{${OPG_M(c.P)}\,\text{W}}{\sqrt{3} \cdot 400\,\text{V}} = ${OPG_M(I)}\,\text{A}$` : OPG_R`$I = \dfrac{P}{U} = \dfrac{${OPG_M(c.P)}\,\text{W}}{230\,\text{V}} = ${OPG_M(I)}\,\text{A}$`,
        c.trefas ? OPG_R`$\Delta U = \dfrac{\sqrt{3} \cdot \rho \cdot L \cdot I}{A} = ${OPG_M(dU)}\,\text{V}$` : OPG_R`$\Delta U = \dfrac{2 \cdot \rho \cdot L \cdot I}{A} = ${OPG_M(dU)}\,\text{V}$`,
        OPG_R`$\dfrac{${OPG_M(dU)}\,\text{V}}{${U}\,\text{V}} \cdot 100 = ${OPG_M(p)}\,\%$`],
      typiskeFejl:fejl };
  } };
}

function APP_PROEVE() {
  return {
    proeveNiveauer: PROEVE_NIVEAUER, proeveSkala: PROEVE_SKALA, proeveVaegt: PROEVE_VAEGT,
    proeveNiv: 'aut', proeveInd: { min:90, kort:6, regler:5, opg:4, cases:2 },
    proeveEl: { fundet:false, projekter:0, zs:[], du:[] }, proeveBrugEl: true,
    proeveKlar: false, proeveHenter: false,
    proeveAkt: null,     // { id, niv, navn, min, items, nu, start, slutTid, faerdig, tidUd, res }
    proeveRest: 0,

    /* Kaldes, når fanen vises: henter gemte valg, læser El-oversigten og indlæser cases og regler. */
    async proeveStart() {
      if (!this.proeveKlar) {
        this.proeveKlar = true;
        try { const g = JSON.parse(localStorage.getItem(K_PROEVE)); if (g && PROEVE_NIVEAUER.some(n => n.id === g.niv)) { this.proeveNiv = g.niv; Object.assign(this.proeveInd, g.ind || {}); } else this.proeveVaelgNiveau('aut', true); } catch (e) {}
      }
      this.proeveEl = proeveElProjekter();
      await this.proeveIndlaes();
    },
    async proeveIndlaes() {
      if (typeof this.caseStart !== 'function') return;
      for (let i = 0; i < 50 && this.caseHenter; i++) await new Promise(r => setTimeout(r, 100));
      await this.caseStart();
    },
    proeveNivObj(id) { return PROEVE_NIVEAUER.find(n => n.id === (id || this.proeveNiv)) || PROEVE_NIVEAUER[0]; },
    proeveVaelgNiveau(id, ikkeGem) {
      const n = this.proeveNivObj(id); this.proeveNiv = n.id; this.proeveInd = { min:n.min, kort:n.kort, regler:n.regler, opg:n.opg, cases:n.cases };
      if (!ikkeGem) this.proeveGem();
    },
    proeveGem() { try { localStorage.setItem(K_PROEVE, JSON.stringify({ niv:this.proeveNiv, ind:this.proeveInd })); } catch (e) {} },
    proeveElTxt() {
      const e = this.proeveEl;
      return e.fundet ? `Fundet i El-oversigten på denne enhed: ${e.projekter} projekt(er), ${e.zs.length} sikringer og ${e.du.length} kabler, der kan blive til opgaver. Elskolen læser kun og ændrer intet.`
        : 'Ingen projekter fundet fra El-oversigten på denne enhed. Åbn El-oversigten i samme browser, så kan prøven bruge dine egne grupper og kabler.';
    },

    /* ---------- Opbygning ---------- */
    async proeveBegynd() {
      await this.proeveIndlaes();
      const n = this.proeveNivObj(), i = this.proeveInd, emner = n.emner, items = [];
      const kort = this.kort.filter(k => !k.slettet && k.front && k.bag);
      for (const k of proeveVaelg(kort, k => k.emne, emner, proeveTal(i.kort, 50)))
        items.push({ art:'kort', ref:k.id, emne:k.emne, k:{ front:k.front, bag:k.bag, kilde:Object.assign({}, k.kilde) }, vist:false, vurd:null });
      for (const r of proeveVaelg(this.caseRegler || [], r => r.emne, emner, proeveTal(i.regler, 50)))
        items.push({ art:'regel', ref:r.id, emne:EMNE_IDS.includes(r.emne) ? r.emne : 'andet', r:{ titel:str(r.titel), resume:str(r.resume), kilde:this.caseKildeTxt(r), verificeret:!!r.verificeret }, vist:false, vurd:null });
      const antalOpg = proeveTal(i.opg, 30);
      const alle = OPG_GENERATORER.filter(g => g.niveau <= n.maksNiveau), pool = alle.filter(g => !emner.length || emner.includes(g.emne));
      let proj = [];
      if (this.proeveBrugEl && antalOpg > 0) proj = proeveBland([...this.proeveEl.zs.map(proeveProjZs), ...this.proeveEl.du.map(proeveProjDu)]).slice(0, antalOpg >= 4 ? 2 : 1);
      for (const g of [...proj, ...proeveCyk(pool.length ? pool : alle, antalOpg - proj.length)]) {
        const seed = opgNytSeed();
        items.push({ art:'opgave', ref:g.id, emne:g.emne, seed, opg:opgLavOpgave(g, seed), ind:{}, res:null });
      }
      for (const c of proeveVaelg(this.caseListe || [], c => c.emne, emner, proeveTal(i.cases, 10))) items.push({ art:'case', ref:c.id, emne:c.emne, c, state:'ny', score:0 });
      for (const it of items) if (!it.ind) it.ind = {};   // x-model læser it.ind[...] også i det øjeblik visningen skifter spørgsmål
      if (!items.length) return this.say('Der er ingen spørgsmål at lave en prøve af. Opret kort eller læg flere spørgsmål i.', true);
      if (this.caseAktiv && this.caseLuk) this.caseLuk();
      const min = proeveTal(i.min, 300);
      this.proeveAkt = { id:uid(), niv:n.id, navn:n.navn, min, items, nu:0, start:Date.now(), slutTid:min ? Date.now() + min * 60000 : 0, faerdig:false, tidUd:false, res:null };
      this.proeveRest = min * 60;
      clearInterval(PROEVE_TIMER); PROEVE_TIMER = setInterval(() => this.proeveTik(), 1000);
    },
    proeveTik() {
      const a = this.proeveAkt;
      if (!a || a.faerdig) { clearInterval(PROEVE_TIMER); return; }
      if (a.slutTid) { this.proeveRest = Math.max(0, Math.ceil((a.slutTid - Date.now()) / 1000)); if (this.proeveRest <= 0) this.proeveAfslut(true); }
    },
    proeveTid() { const r = this.proeveRest; return Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); },

    /* ---------- Under prøven ---------- */
    proeveCur() { const a = this.proeveAkt; return a && a.items[a.nu] ? a.items[a.nu] : null; },
    proeveSvaret(it) {
      if (it.art === 'kort' || it.art === 'regel') return it.vurd != null;
      if (it.art === 'opgave') return Object.values(it.ind).some(v => str(v).trim() !== '');
      return it.state === 'faerdig';
    },
    proeveGaa(n) {
      const a = this.proeveAkt; if (!a || a.faerdig || n < 0 || n >= a.items.length) return;
      const c = this.proeveCur();
      if (c && c.art === 'case' && c.state === 'igang') return this.say('Afslut casen, før du går videre.', true);
      if (c && c.art === 'case' && this.caseAktiv) this.caseLuk();
      a.nu = n;
    },
    proeveDel(it, id) { return (it.res && it.res.del.find(d => d.id === id)) || { gyldig:false, ok:false, ind:0 }; },
    proeveVurder(it, v) { it.vurd = v; },
    proeveCaseA() { return this.caseAktiv || CASE_TOM; },
    proeveCaseT() { return this.caseTrin() || CASE_TOM.c.trin.slut; },
    proeveCaseStart(it) { this.caseBegynd(it.c); it.state = 'igang'; },
    /* Svar i en case giver ingen feedback under prøven: der gås straks videre. Gennemgang findes under Cases. */
    proeveCaseSvar(it, i) {
      const a = this.caseAktiv, t = a && this.caseTrin(); if (!a || a.slut || !t) return;
      if (t.type === 'valg') this.caseSvarValg(i); else if (t.type === 'tal') this.caseSvarTal(); else if (t.type === 'flere') this.caseSvarFlere();
      if (!a.svar) return;
      this.caseVidere();
      if (a.slut) { it.state = 'faerdig'; it.score = a.score; }
    },
    proeveAflever() {
      const a = this.proeveAkt; if (!a || a.faerdig) return;
      const mgl = a.items.filter(x => !this.proeveSvaret(x)).length;
      this.spoerg(mgl ? `Du har ${mgl} ubesvarede spørgsmål. Aflever alligevel?` : 'Aflever prøven?', () => this.proeveAfslut(false), 'Aflever');
    },
    proeveAfbryd() {
      this.spoerg('Afbryd prøven? Intet gemmes.', () => { clearInterval(PROEVE_TIMER); if (this.caseAktiv) this.caseLuk(); this.proeveAkt = null; }, 'Afbryd');
    },
    proeveLuk() { this.proeveAkt = null; },

    /* ---------- Afslutning, karakter og gem ---------- */
    async proeveAfslut(tidUd) {
      const a = this.proeveAkt; if (!a || a.faerdig) return;
      clearInterval(PROEVE_TIMER); a.faerdig = true; a.tidUd = !!tidUd;
      if (this.caseAktiv) this.caseLuk();
      const gem = [];
      for (const it of a.items) {
        it.maks = PROEVE_VAEGT[it.art]; it.point = 0;
        if (it.art === 'kort' || it.art === 'regel') it.point = (it.vurd || 0) * it.maks;
        else if (it.art === 'case') it.point = it.state === 'faerdig' ? it.score * it.maks : 0;
        else {
          const t = opgTjekSvar(it.opg, it.ind), score = t.del.filter(d => d.ok).length / t.del.length, besvaret = t.del.some(d => d.gyldig);
          it.res = { del:t.del.map(d => ({ id:d.id, ind:d.ind, gyldig:d.gyldig, ok:d.ok })), fejltype:t.fejltype || '', forklaring:t.forklaring || '', besvaret };
          it.score = score; it.point = score * it.maks;
          if (besvaret) { const svar = {}; for (const d of t.del) if (d.gyldig) svar[d.id] = d.ind;
            gem.push({ art:'opgave', ref:it.ref, emne:it.emne, korrekt:score === 1, score, fejltype:t.fejltype || '', varighedMs:0, data:{ seed:it.seed, svar, proeve:a.id } }); }
        }
      }
      const point = a.items.reduce((s, x) => s + x.point, 0), maks = a.items.reduce((s, x) => s + x.maks, 0), pct = maks ? Math.round(point / maks * 1000) / 10 : 0;
      const em = {};
      for (const it of a.items) { const e = em[it.emne] = em[it.emne] || [0, 0]; e[0] += it.point; e[1] += it.maks; }
      a.res = { point:Math.round(point * 100) / 100, maks, pct, karakter:proeveKarakter(pct), bestaaet:pct >= PROEVE_BESTAAET,
        emner:Object.entries(em).map(([id, [p, m]]) => ({ id, navn:this.emneNavn(id), point:Math.round(p * 100) / 100, maks:m, pct:m ? Math.round(p / m * 100) : 0 })) };
      gem.push({ art:proeveArt(), ref:'proeve', emne:'andet', korrekt:a.res.bestaaet, score:pct / 100, fejltype:'', varighedMs:Date.now() - a.start,
        data:{ proeve:a.id, niveau:a.niv, navn:a.navn, minutter:a.min, karakter:a.res.karakter, tidUd:a.tidUd, emner:em, del:a.items.map(x => [x.art, x.ref, x.emne, Math.round(x.point * 100) / 100, x.maks]) } });
      await this.tilfoejResultat(gem);
    },
    proeveHistorik() {
      this.dataRev;
      return this.resultater.filter(r => r.ref === 'proeve' && (r.art === 'proeve' || r.art === 'case')).slice(-10).reverse()
        .map(r => ({ id:r.id, tid:r.tid, navn:str(r.data.navn), karakter:str(r.data.karakter), pct:Math.round(r.score * 100), tidUd:!!r.data.tidUd }));
    },
    proeveFmt(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  };
}
