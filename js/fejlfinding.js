/* Fase 5: fejlfinding med diagrammer og målinger. Fanen "Fejlfinding" vises, når ffStart() findes.
   Metoder og felter starter med "ff", så de ikke støder sammen med andre filer i bland(). Resultater gemmes med this.tilfoejResultat().
   Plan og forenklinger: docs/planer/2026-11-22-fase-5-fejlfinding.md */

const FF_RHO = 0.0225, FF_U0 = 230;

/* Fejlskabeloner. id bruges som ref i resultatet. steder: kabel, daase, forbruger. */
const FF_FEJL = [
  { id:'iso-lpe', navn:'Isolationsfejl L–PE', steder:['kabel', 'daase', 'forbruger'],
    symptomer:['RCD\'en er faldet ud flere gange, især i fugtigt vejr.', 'Kunden oplever, at RCD\'en slår fra uden tydelig grund.'],
    forklaring:'Isolationsmodstanden mellem L og PE er under kravet på 1 MΩ. Isolationsmåling på et punkt måler installationen fra punktet og ud, så fejlen ligger efter det sidste punkt med god isolation og før eller i det første punkt med for lav isolation. Spændinger, Zs og RCD-test ser normale ud, fordi lækstrømmen er lille.' },
  { id:'iso-npe', navn:'Isolationsfejl N–PE', steder:['kabel', 'daase', 'forbruger'],
    symptomer:['RCD\'en slår fra, når der tændes for noget på gruppen.', 'Kunden oplever, at RCD\'en slår fra uden tydelig grund.'],
    forklaring:'Isolationsmodstanden mellem N og PE er for lav. Under belastning løber en del af returstrømmen i PE uden om RCD\'en, som derfor slår fra. Med spænding på ser alt normalt ud, så fejlen findes kun med isolationsmåling på det spændingsløse anlæg.' },
  { id:'afbrudt-pe', navn:'Afbrudt PE', steder:['kabel', 'daase', 'forbruger'],
    symptomer:['Ved et periodisk eftersyn skal gruppen gennemmåles.', 'Kunden mener at have mærket en snurren fra et apparat med metalkappe.'],
    forklaring:'Beskyttelseslederen er afbrudt, så punkterne efter afbrydelsen ikke er beskyttet: kontinuiteten i PE er uendelig (OL), Zs kan ikke måles, RCD-testen kan ikke sende strøm i PE, og stiktesteren viser, at PE mangler. Fejlen ligger mellem det sidste punkt med kontinuitet og det første uden.' },
  { id:'afbrudt-n', navn:'Afbrudt N', steder:['kabel', 'daase', 'forbruger'],
    symptomer:['Noget på gruppen virker ikke, selv om sikringen er inde.', 'Lyset virker ikke i en del af gruppen.'],
    forklaring:'Nullederen er afbrudt. Efter afbrydelsen trækkes N op til L\'s potentiale gennem de tilsluttede forbrugere: L–N er næsten 0 V, mens N–PE er omkring 230 V. Zs og RCD-test (L–PE) er normale.' },
  { id:'byttet-ln', navn:'L og N byttet (polaritet)', steder:['daase', 'forbruger'],
    symptomer:['Efter en udskiftning skal gruppen kontrolleres, før den tages i brug.', 'En lampefatning er spændingsførende, selv om kontakten er slukket.'],
    forklaring:'L og N er byttet om i en samling. L–N er stadig 230 V, men L–PE er 0 V og N–PE 230 V, og polaritetstesten viser fejlen. Afbrydere bryder nu N i stedet for L, så forbrugeren er spændingsførende, selv når den er slukket.' },
  { id:'byttet-npe', navn:'N og PE byttet', steder:['daase', 'forbruger'],
    symptomer:['RCD\'en slår fra, når der tændes for noget på gruppen.', 'Efter en udskiftning skal gruppen kontrolleres, før den tages i brug.'],
    forklaring:'N og PE er byttet om. Spændingerne og stiktesteren ser korrekte ud, men PE-klemmen er forbundet til nullederen: kontinuiteten fra tavlens PE-skinne er OL, Zs måles alligevel (sløjfen lukkes gennem N), og RCD\'en udløser ikke ved test, fordi teststrømmen vender tilbage gennem RCD\'en. Under last løber returstrømmen i PE, og RCD\'en slår fra.' },
  { id:'daarlig-forb', navn:'Dårlig forbindelse (høj modstand)', steder:['daase'],
    symptomer:['En stikkontakt bliver lun, når der er belastning på.', 'Lyset blinker af og til.', 'Ved et periodisk eftersyn skal gruppen gennemmåles.'],
    forklaring:'En klemme i en dåse har høj overgangsmodstand. Uden belastning er spændingen normal, men Zs fra dåsen og ud er højere end kablets beregnede modstand (ρ·l/A) giver, og er ofte over grænsen. Sidder fejlen på PE, er også kontinuiteten for høj. Fejlen sidder i den første dåse, hvor springet ses.' }
];

/* Målinger. doed: kræver spændingsløst anlæg (ellers sikkerhedsfejl). levende: kræver spænding for at give en værdi. */
const FF_MAAL = [
  { id:'u-ln', l:'Spænding L–N', kort:'U L–N' }, { id:'u-lpe', l:'Spænding L–PE', kort:'U L–PE' }, { id:'u-npe', l:'Spænding N–PE', kort:'U N–PE' },
  { id:'pe', l:'Kontinuitet PE', kort:'R PE', doed:true },
  { id:'iso-lpe', l:'Isolation L–PE', kort:'Riso L–PE', doed:true }, { id:'iso-npe', l:'Isolation N–PE', kort:'Riso N–PE', doed:true },
  { id:'iso-ln', l:'Isolation L–N', kort:'Riso L–N', doed:true },
  { id:'zs', l:'Zs (sløjfe L–PE)', kort:'Zs', levende:true }, { id:'rcd', l:'RCD-test 1 × IΔn', kort:'RCD', levende:true },
  { id:'pol', l:'Polaritet (stiktester)', kort:'Polaritet', levende:true }
];

/* De fem sikkerhedsregler fra DS/EN 50110-1, med egne ord. */
const FF_REGLER = [
  { t:'Frakobl', b:'Slå gruppens automatsikring og RCD fra, så alle spændingsførende ledere er afbrudt.' },
  { t:'Sikr mod genindkobling', b:'Lås afbryderen, eller tag sikringen med, og sæt et skilt op om, at der arbejdes.' },
  { t:'Kontrollér, at der ikke er spænding', b:'Mål mellem alle ledere og mod jord på arbejdsstedet med en spændingstester, som du afprøver før og efter.' },
  { t:'Jord og kortslut, hvor det er relevant', b:'Gør det, hvis anlægget kan blive spændingssat igen, fx fra en anden forsyning. Ved en almindelig gruppe er det sjældent nødvendigt.' },
  { t:'Afskærm nærliggende spændingsførende dele', b:'Dæk eller afspær dele i nærheden, som stadig er spændingsførende, fx andre grupper i tavlen.' }
];

const FF_RUM = [
  { navn:'Køkken', stik:['Stik ved bordplade', 'Stik ved køleskab', 'Stik ved spisebord'], lampe:['Loftudtag køkken', 'Lampe over bord'], fast:['Emhætte'] },
  { navn:'Stue og entré', stik:['Stik ved sofa', 'Stik ved tv', 'Stik i entré'], lampe:['Loftudtag stue', 'Lampe i entré'], fast:['Ventilationsaggregat'] },
  { navn:'Værksted', stik:['Stik ved arbejdsbord', 'Stik ved port', 'Stik ved vask'], lampe:['Armatur i værksted', 'Udendørslampe'], fast:['Kompressor'] },
  { navn:'Bryggers og bad', stik:['Stik i bryggers', 'Stik ved vaskemaskine', 'Stik ved tørretumbler'], lampe:['Loftlampe bad', 'Lampe i bryggers'], fast:['Varmtvandsbeholder'] }
];
const FF_ART = { stik:'Stikkontakt', lampe:'Lampeudtag', fast:'Fast tilsluttet' };

/* Deterministisk tilfældighed (mulberry32) og streng-hash til seeds. */
function ffRng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function ffHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function APP_FEJLFINDING() {
  return {
    ffFejltyper: FF_FEJL, ffMaaleTyper: FF_MAAL, ffRegler: FF_REGLER,
    ffScen: null, ffLevende: true, ffPunkt: 'T', ffMaalinger: [], ffSikFejl: 0, ffTjek: [false, false, false, false, false],
    ffDiag: { type:'', sted:'' }, ffSvar: null, ffStartTid: 0,

    ffStart() { if (!this.ffScen) this.ffNyt(); },
    ffNyt(seed, tvang) {
      seed = Number.isFinite(Number(seed)) && seed !== '' && seed != null ? Number(seed) >>> 0 : 1 + Math.floor(Math.random() * 999999);
      this.ffScen = this.ffLavScenarie(seed, tvang);
      this.ffLevende = true; this.ffPunkt = 'T'; this.ffMaalinger = []; this.ffSikFejl = 0; this.ffTjek = [false, false, false, false, false];
      this.ffDiag = { type:'', sted:'' }; this.ffSvar = null; this.ffStartTid = Date.now();
    },

    /* ---------- Scenarie ---------- */
    ffLavScenarie(seed, tvang) {
      tvang = tvang || {};
      const r = ffRng(seed), vaelg = a => a[Math.floor(r() * a.length)], mellem = (a, b) => a + r() * (b - a);
      const rum = vaelg(FF_RUM), In = vaelg([10, 13, 16]), kar0 = r() < 0.2 ? 'C' : 'B', A = In === 16 ? 2.5 : 1.5;
      const ze = Math.round(mellem(0.15, 0.55) * 100) / 100, rcdT = Math.round(mellem(18, 34));
      const nD = r() < 0.5 ? 1 : 2;
      let nF = 2 + Math.floor(r() * 4); if (nD === 1) nF = Math.min(nF, 3);
      let fordel = [nF];
      if (nD === 2) { const lo = Math.max(nF - 3, 1), hi = Math.min(3, nF - 1), f1 = lo + Math.floor(r() * (hi - lo + 1)); fordel = [f1, nF - f1]; }
      const noder = [{ id:'T', art:'tavle', navn:'Tavle', kode:'Tavle', op:'', x:50, y:60, l:0 }];
      const dx = [210, 420];
      for (let d = 0; d < nD; d++) noder.push({ id:'D' + (d + 1), art:'daase', navn:'Dåse ' + (d + 1), kode:'D' + (d + 1), op:d ? 'D1' : 'T', x:dx[d], y:60,
        l:Math.round(d ? mellem(5, 15) : mellem(8, 25)) });
      const navne = { stik:[...rum.stik], lampe:[...rum.lampe], fast:[...rum.fast] }, ofs = { 1:[0], 2:[-50, 50], 3:[-70, 0, 70] };
      let fi = 0;
      for (let d = 0; d < nD; d++) for (let j = 0; j < fordel[d]; j++) {
        let art = fi === 0 ? 'stik' : vaelg(['stik', 'stik', 'lampe', 'lampe', 'fast']);
        if (!navne[art].length) art = ['stik', 'lampe', 'fast'].find(a => navne[a].length);
        const navn = navne[art].splice(Math.floor(r() * navne[art].length), 1)[0];
        fi++;
        noder.push({ id:'F' + fi, art, navn, kode:'F' + fi, op:'D' + (d + 1), x:dx[d] + ofs[fordel[d]][j], y:180, l:Math.round(mellem(2, 10)) });
      }
      /* Det fejlfri anlæg skal overholde Zs-grænsen. Gør det ikke med type C, bruges type B. */
      let kar = kar0;
      const laengde = id => this.ffSti({ noder }, id).reduce((a, x) => a + noder.find(n => n.id === x).l, 0);
      const zsMaks = Math.max(...noder.map(n => ze + 2 * FF_RHO * laengde(n.id) / A));
      if (kar === 'C' && zsMaks > 2 / 3 * FF_U0 / (10 * In)) kar = 'B';
      const type = FF_FEJL.some(f => f.id === tvang.fejl) ? tvang.fejl : vaelg(FF_FEJL).id, def = FF_FEJL.find(f => f.id === type);
      const kand = this.ffStedListe({ noder }).filter(s => def.steder.includes(s.art)).map(s => s.id);
      const sted = kand.includes(tvang.sted) ? tvang.sted : vaelg(kand);
      const fejl = { type, sted };
      if (type.startsWith('iso')) fejl.r = Math.round(mellem(0.03, 0.4) * 100) / 100;
      if (type === 'daarlig-forb') { fejl.r = Math.round(mellem(0.8, 2.5) * 100) / 100; fejl.leder = vaelg(['L', 'PE']); }
      const symptom = vaelg(def.symptomer);
      return { seed, navn:'Gruppe ' + (1 + Math.floor(r() * 12)) + ': ' + rum.navn, In, kar, A, ze, rcdT, noder, fejl, symptom };
    },
    /* Alle steder, en fejl kan sidde: kablet ind til hver node og selve dåsen eller forbrugeren. */
    ffStedListe(s) {
      const ud = [];
      for (const n of s.noder) {
        if (n.art === 'tavle') continue;
        const op = s.noder.find(x => x.id === n.op);
        ud.push({ id:'k:' + n.id, art:'kabel', navn:'Kablet ' + op.kode + ' → ' + n.kode + ' (' + n.l + ' m)' });
        ud.push({ id:'n:' + n.id, art:n.art === 'daase' ? 'daase' : 'forbruger', navn:n.art === 'daase' ? n.navn : n.kode + ' ' + n.navn });
      }
      return ud;
    },
    ffNode(s, id) { return s.noder.find(n => n.id === id); },
    ffSti(s, id) { const sti = []; let n = this.ffNode(s, id); while (n) { sti.unshift(n.id); n = n.op ? this.ffNode(s, n.op) : null; } return sti; },
    ffUnder(s, id) { return s.noder.filter(n => this.ffSti(s, n.id).includes(id)).map(n => n.id); },
    /* Ligger fejlen på vejen fra tavlen til P (påvirker kontinuitet, spænding, Zs, RCD og polaritet)? */
    ffForan(s, f, P) { const x = f.sted.slice(2); return x !== 'T' && this.ffSti(s, P).includes(x); },
    /* Ligger fejlen i det, isolationsmålingen på P omfatter (P og alt efter P, men ikke kablet ind til P)? */
    ffOmfang(s, f, P) { const x = f.sted.slice(2), under = this.ffUnder(s, P); return f.sted[0] === 'k' ? under.includes(x) && x !== P : under.includes(x); },
    ffZsGraense(s) { return 2 / 3 * FF_U0 / ((s.kar === 'C' ? 10 : 5) * s.In); },

    /* ---------- Måling ---------- */
    /* Støjfri værdi: { v:tal|null, tekst?, fare? }. fejl = null giver det fejlfri anlæg. */
    ffModel(s, P, m, levende, fejl) {
      const f = fejl || null, foran = f && this.ffForan(s, f, P), omf = f && this.ffOmfang(s, f, P), t = f && f.type;
      const def = FF_MAAL.find(x => x.id === m);
      if (def.doed && levende) return { v:null, fare:true, tekst:'STOP: anlægget er spændingsførende' };
      const sti = this.ffSti(s, P).slice(1), R = sti.reduce((a, id) => a + FF_RHO * this.ffNode(s, id).l / s.A, 0);
      const daarlig = f && t === 'daarlig-forb' && foran ? f : null;
      if (m.startsWith('u-')) {
        if (!levende) return { v:0 };
        let u = { 'u-ln':230, 'u-lpe':230, 'u-npe':0.3 };
        if (foran && t === 'afbrudt-n') u = { 'u-ln':1, 'u-lpe':230, 'u-npe':229 };
        if (foran && t === 'afbrudt-pe') u = { 'u-ln':230, 'u-lpe':12, 'u-npe':11 };
        if (foran && t === 'byttet-ln') u = { 'u-ln':230, 'u-lpe':0.3, 'u-npe':230 };
        return { v:u[m] };
      }
      if (m === 'pe') {
        if (foran && (t === 'afbrudt-pe' || t === 'byttet-npe')) return { v:null, tekst:'> 2000 Ω (OL)' };
        return { v:R + (daarlig && daarlig.leder === 'PE' ? daarlig.r : 0) };
      }
      if (m.startsWith('iso-')) {
        if (omf && t === m) return { v:f.r };
        return { v:null, tekst:'> 999 MΩ' };
      }
      if (levende === false) return { v:null, tekst:'Ingen spænding: testeren kan ikke måle' };
      if (m === 'pol') return { v:null, tekst:foran && t === 'afbrudt-pe' ? 'PE mangler' : foran && t === 'afbrudt-n' ? 'N mangler' : foran && t === 'byttet-ln' ? 'L og N byttet' : 'Korrekt' };
      if (foran && t === 'byttet-ln') return { v:null, tekst:'Testeren melder: L og N byttet' };
      if (m === 'zs') {
        if (foran && t === 'afbrudt-pe') return { v:null, tekst:'> 2000 Ω: ingen sløjfe' };
        return { v:s.ze + 2 * R + (daarlig ? daarlig.r : 0) };
      }
      if (m === 'rcd') {
        if (foran && t === 'afbrudt-pe') return { v:null, tekst:'Testeren stopper: ingen forbindelse til PE' };
        if (foran && t === 'byttet-npe') return { v:null, tekst:'Udløser ikke (> 1000 ms)' };
        return { v:s.rcdT };
      }
      return { v:null, tekst:'?' };
    },
    /* Måling med støj (n = gentagelse nr.) eller uden (n == null). Giver { v, tekst, fare }. */
    ffMaalModel(s, P, m, levende, fejl, n) {
      const b = this.ffModel(s, P, m, levende, fejl), u = Object.assign({}, b);
      if (u.v != null && n != null) {
        const r = ffRng(ffHash(s.seed + '|' + P + '|' + m + '|' + n)), x = r() - 0.5;
        if (m.startsWith('u-')) u.v = u.v > 100 ? u.v + x * 4 : u.v === 0 ? 0 : u.v * (0.6 + r() * 0.8);
        else if (m === 'pe' || m === 'zs') u.v = u.v * (1 + x * 0.06) + (m === 'pe' ? 0.01 + r() * 0.02 : 0);
        else if (m.startsWith('iso-')) u.v = u.v * (1 + x * 0.1);
        else if (m === 'rcd') u.v = u.v + x * 6;
      }
      if (u.v != null) u.tekst = this.ffFmt(m, u.v);
      return u;
    },
    ffFmt(m, v) {
      const t = (x, d) => x.toLocaleString('da-DK', { minimumFractionDigits:d, maximumFractionDigits:d });
      if (m.startsWith('u-')) return t(v, 1) + ' V';
      if (m.startsWith('iso-')) return t(v, v < 0.1 ? 3 : 2) + ' MΩ';
      if (m === 'rcd') return t(Math.round(v), 0) + ' ms';
      return t(v, 2) + ' Ω';
    },
    /* Afviger måling a (med fejl) tydeligt fra b (uden)? Tærsklerne er langt over støjen. */
    ffAfviger(m, a, b) {
      if (a.v == null || b.v == null) return (a.v == null) !== (b.v == null) || a.tekst !== b.tekst;
      const d = Math.abs(a.v - b.v);
      if (m.startsWith('u-')) return d > 20;
      if (m === 'pe' || m === 'zs') return d > Math.max(0.3, 0.15 * Math.abs(b.v));
      if (m === 'rcd') return d > 100;
      return d > 0.5 * Math.abs(b.v);
    },
    ffMaaleTilstand(m) { return !FF_MAAL.find(x => x.id === m).doed; },
    /* Målinger, som skiller fejlen fra det fejlfri anlæg (støjfrit). */
    ffAfgoerende(s, fejl) {
      fejl = fejl || s.fejl; const ud = [];
      for (const n of s.noder) for (const d of FF_MAAL) {
        const lev = !d.doed, med = this.ffMaalModel(s, n.id, d.id, lev, fejl), uden = this.ffMaalModel(s, n.id, d.id, lev, null);
        if (this.ffAfviger(d.id, med, uden)) ud.push({ p:n.id, m:d.id, med:med.tekst, uden:uden.tekst });
      }
      return ud;
    },
    ffSignatur(s, fejl) {
      return JSON.stringify(s.noder.map(n => FF_MAAL.map(d => { const x = this.ffModel(s, n.id, d.id, !d.doed, fejl); return x.v == null ? x.tekst : Math.round(x.v * 1e4); })));
    },

    /* ---------- Brugerflade ---------- */
    ffInfoTxt() {
      const s = this.ffScen; if (!s) return '';
      return 'Automatsikring ' + s.kar + s.In + ' A og RCD 30 mA type A. Kabel 3G' + String(s.A).replace('.', ',') + ' mm² (ρ = 0,0225 Ω·mm²/m). U₀ = 230 V. ' +
        'Længderne står ved kablerne. Forbrugerne er tilsluttet og tændt, når du måler spænding, og frakoblet, når du måler isolation.';
    },
    ffPunktNavn(id) { const n = this.ffScen && this.ffNode(this.ffScen, id); return n ? (n.art === 'tavle' || n.art === 'daase' ? n.navn : n.kode + ' ' + n.navn) : id; },
    ffMaalNavn(id) { const d = FF_MAAL.find(x => x.id === id); return d ? d.l : id; },
    ffFejlNavn(id) { const d = FF_FEJL.find(x => x.id === id); return d ? d.navn : id; },
    ffStedNavn(id) { const x = this.ffScen && this.ffStedListe(this.ffScen).find(s => s.id === id); return x ? x.navn : id; },
    ffVaelgPunkt(id) { if (this.ffScen && this.ffNode(this.ffScen, id)) this.ffPunkt = id; },
    ffKlikSvg(e) { const g = e.target.closest && e.target.closest('[data-p]'); if (g) this.ffVaelgPunkt(g.getAttribute('data-p')); },

    ffMaal(m) {
      const s = this.ffScen, d = FF_MAAL.find(x => x.id === m);
      if (!s || !d || this.ffSvar) return;
      const P = this.ffPunkt, nr = this.ffMaalinger.length + 1;
      if (d.doed && this.ffLevende) {
        this.ffSikFejl++;
        this.ffMaalinger.push({ nr, p:P, m, tekst:'STOP: farligt! ' + d.l + ' må kun måles på et spændingsløst anlæg', fare:true, v:null });
        this.say('Farligt: ' + d.l.toLowerCase() + ' på et spændingsførende anlæg. Gør anlægget spændingsløst først. Det koster point.', true);
        return;
      }
      const gang = this.ffMaalinger.filter(x => x.p === P && x.m === m).length;
      const u = this.ffMaalModel(s, P, m, this.ffLevende, s.fejl, gang);
      const uden = this.ffMaalModel(s, P, m, this.ffLevende, null);
      this.ffMaalinger.push({ nr, p:P, m, tekst:u.tekst, v:u.v, fare:false, levende:this.ffLevende, afviger:this.ffAfviger(m, u, uden) });
    },
    ffSidste() { return this.ffMaalinger[this.ffMaalinger.length - 1] || null; },
    ffAabnSikkerhed() { this.ffTjek = [false, false, false, false, false]; this.modal = 'ff-sikker'; },
    ffSaetTjek(i, v) {
      const t = [...this.ffTjek];
      if (v && t.slice(0, i).every(Boolean)) t[i] = true;
      if (!v) for (let j = i; j < t.length; j++) t[j] = false;
      this.ffTjek = t;
    },
    ffFrakobl() {
      if (!this.ffTjek.every(Boolean)) { this.say('Gå alle fem sikkerhedsregler igennem først.', true); return; }
      this.ffLevende = false; this.modal = null; this.say('Anlægget er spændingsløst og sikret.');
    },
    ffTilkobl() { this.ffLevende = true; this.ffTjek = [false, false, false, false, false]; },

    ffVurder(s, valg, maalinger, sikFejl) {
      const f = s.fejl, def = FF_FEJL.find(x => x.id === f.type);
      const typeOk = valg.type === f.type;
      const valgtSted = this.ffStedListe(s).find(x => x.id === valg.sted);
      const stedOk = typeOk && !!valgtSted && def.steder.includes(valgtSted.art) &&
        (valg.sted === f.sted || this.ffSignatur(s, Object.assign({}, f, { sted:valg.sted })) === this.ffSignatur(s, f));
      const n = maalinger.length, eff = n <= 8 ? 1 : n >= 25 ? 0 : (25 - n) / 17;
      const score = Math.round(Math.min(1, Math.max(0, (typeOk ? 0.5 + 0.2 * eff : 0) + (stedOk ? 0.3 : 0) - 0.25 * sikFejl)) * 100) / 100;
      const fejltype = !typeOk ? 'ff-type:' + f.type + '>' + (valg.type || 'ingen') : !stedOk ? 'ff-placering' : sikFejl ? 'ff-sikkerhed' : '';
      return { typeOk, stedOk, korrekt:typeOk && stedOk, score, fejltype };
    },
    async ffDiagnose() {
      const s = this.ffScen; if (!s || this.ffSvar) return;
      if (!this.ffDiag.type || !this.ffDiag.sted) { this.say('Vælg både fejltype og placering.', true); return; }
      const v = this.ffVurder(s, this.ffDiag, this.ffMaalinger, this.ffSikFejl);
      const afg = this.ffAfgoerende(s);
      this.ffSvar = Object.assign({ afg, afvigende:this.ffMaalinger.filter(x => x.afviger && !x.fare) }, v);
      await this.tilfoejResultat({ art:'fejlfinding', ref:s.fejl.type, emne:'dim', korrekt:v.korrekt, score:v.score, fejltype:v.fejltype,
        varighedMs:Date.now() - this.ffStartTid,
        data:{ seed:s.seed, maalinger:this.ffMaalinger.slice(0, 60).map(x => x.p + ':' + x.m + '=' + x.tekst), fejl:s.fejl.type, sted:s.fejl.sted,
          valgt:{ type:this.ffDiag.type, sted:this.ffDiag.sted }, sikkerhedsfejl:this.ffSikFejl } });
    },
    ffFejlTekst() {
      const s = this.ffScen; if (!s) return '';
      const f = s.fejl;
      let t = this.ffFejlNavn(f.type) + ' i ' + this.ffStedNavn(f.sted).replace(/^Kablet/, 'kablet');
      if (f.type.startsWith('iso')) t += ' (' + this.ffFmt('iso-lpe', f.r) + ')';
      if (f.type === 'daarlig-forb') t += ' (' + this.ffFmt('zs', f.r) + ' på ' + f.leder + ')';
      return t + '.';
    },
    ffGraenseTekst() {
      const s = this.ffScen; if (!s) return '';
      return 'Zs må højst være 2/3 · 230 V / ' + ((s.kar === 'C' ? 10 : 5) * s.In) + ' A = ' + this.ffFmt('zs', this.ffZsGraense(s)) + ' (Iₐ = ' + (s.kar === 'C' ? 10 : 5) + ' · Iₙ for type ' + s.kar + ').';
    },

    /* SVG-diagram som tekst (Alpine x-for virker ikke i SVG). Farver fra CSS-variablerne, så lyst og mørkt tema virker. */
    ffSvg() {
      const s = this.ffScen; if (!s) return '';
      const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const fejlSted = this.ffSvar ? s.fejl.sted : '', bredde = Math.max(...s.noder.map(n => n.x)) + 80;
      const halo = 'paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round';
      let ud = '<svg viewBox="0 0 ' + bredde + ' 240" style="width:100%;min-width:' + Math.min(bredde, 420) + 'px;max-width:' + Math.round(bredde * 1.2) + 'px;display:block;margin:0 auto" role="img" aria-label="Diagram over gruppen" font-family="IBM Plex Sans, sans-serif">';
      for (const n of s.noder) {
        if (!n.op) continue;
        const o = this.ffNode(s, n.op), fejl = fejlSted === 'k:' + n.id;
        const x1 = o.x + (o.art === 'tavle' ? 32 : 0), y1 = o.y + (n.art === 'daase' ? 0 : 14), y2 = n.y - (n.art === 'daase' ? 0 : 16);
        ud += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + n.x + '" y2="' + y2 + '" style="stroke:' + (fejl ? 'var(--crit)' : 'var(--muted)') + ';stroke-width:' + (fejl ? 4 : 2.5) + '"/>';
        const mx = n.art === 'daase' ? (x1 + n.x) / 2 : x1 + (n.x - x1) * 0.55, my = n.art === 'daase' ? y1 - 9 : y1 + (y2 - y1) * 0.55;
        ud += '<text x="' + mx + '" y="' + my + '" text-anchor="middle" font-size="13" style="fill:var(--muted);' + halo + '">' + n.l + ' m</text>';
      }
      for (const n of s.noder) {
        const valgt = this.ffPunkt === n.id, fejl = fejlSted === 'n:' + n.id;
        const streg = fejl ? 'var(--crit)' : valgt ? 'var(--accent)' : 'var(--ink)', sb = valgt || fejl ? 3.5 : 2;
        const st = 'fill:var(--raised);stroke:' + streg + ';stroke-width:' + sb;
        ud += '<g data-p="' + esc(n.id) + '" style="cursor:pointer" id="ff-p-' + esc(n.id) + '"><title>' + esc(this.ffPunktNavn(n.id)) + '</title>';
        ud += '<circle cx="' + n.x + '" cy="' + n.y + '" r="30" style="fill:transparent"/>';
        if (n.art === 'tavle') {
          ud += '<rect x="' + (n.x - 32) + '" y="' + (n.y - 24) + '" width="64" height="48" rx="3" style="' + st + '"/>';
          ud += '<text x="' + n.x + '" y="' + (n.y - 4) + '" text-anchor="middle" font-size="14" font-weight="600" style="fill:var(--ink)">Tavle</text>';
          ud += '<text x="' + n.x + '" y="' + (n.y + 13) + '" text-anchor="middle" font-size="11" style="fill:var(--muted)">' + s.kar + s.In + ' · RCD</text>';
        } else if (n.art === 'daase') {
          ud += '<circle cx="' + n.x + '" cy="' + n.y + '" r="15" style="' + st + '"/>';
          ud += '<text x="' + n.x + '" y="' + (n.y + 5) + '" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--ink)">' + n.kode + '</text>';
        } else {
          if (n.art === 'fast') ud += '<rect x="' + (n.x - 15) + '" y="' + (n.y - 15) + '" width="30" height="30" rx="2" style="' + st + '"/><text x="' + n.x + '" y="' + (n.y + 5) + '" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--ink)">M</text>';
          else ud += '<circle cx="' + n.x + '" cy="' + n.y + '" r="16" style="' + st + '"/>';
          if (n.art === 'lampe') ud += '<path d="M' + (n.x - 11) + ' ' + (n.y - 11) + 'L' + (n.x + 11) + ' ' + (n.y + 11) + 'M' + (n.x + 11) + ' ' + (n.y - 11) + 'L' + (n.x - 11) + ' ' + (n.y + 11) + '" style="stroke:' + streg + ';stroke-width:2"/>';
          if (n.art === 'stik') ud += '<circle cx="' + (n.x - 6) + '" cy="' + n.y + '" r="2.6" style="fill:var(--ink)"/><circle cx="' + (n.x + 6) + '" cy="' + n.y + '" r="2.6" style="fill:var(--ink)"/>';
          ud += '<text x="' + n.x + '" y="' + (n.y + 34) + '" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--ink)">' + n.kode + '</text>';
          ud += '<text x="' + n.x + '" y="' + (n.y + 50) + '" text-anchor="middle" font-size="11" style="fill:var(--muted)">' + esc(FF_ART[n.art].split(' ')[0]) + '</text>';
        }
        ud += '</g>';
      }
      return ud + '</svg>';
    }
  };
}
