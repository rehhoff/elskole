/* Kort: liste med søgning og filtre, redigering med kildefelt, sletning (gravsten), nulstilling af læring og startkort fra indhold/.
   Metoderne samles i app() i js/app.js. */
const STARTPAKKER = [ { fil:'indhold/start-matematik.json', navn:'Matematik og fysik (startkort)' },
  { fil:'indhold/start-love.json', navn:'Love og myndigheder (startkort)' },
  { fil:'indhold/start-erhverv.json', navn:'Erhverv og industri (startkort)' },
  { fil:'indhold/start-arbejdsmiljo.json', navn:'Arbejdsmiljø (startkort)' } ];

function APP_KORT() {
  return {
    kf: { q:'', emne:'', type:'', status:'', tag:'' }, kRed: null, kSide: 50, startpakker: STARTPAKKER,

    kortStatus(k) {
      const t = this.tilst[k.id]; if (!t) return 'ny';
      if (t.state === 1 || t.state === 3) return 'laerer';
      return new Date(t.due) <= new Date() ? 'forfalden' : 'gentages';
    },
    statusNavn: { ny:'Ny', laerer:'Lærer', forfalden:'Forfalden', gentages:'Gentages' },
    kortListe() {
      this.dataRev;
      const f = this.kf, q = f.q.trim().toLowerCase();
      return this.kort.filter(k => !k.slettet && (!f.emne || k.emne === f.emne) && (!f.type || k.type === f.type) && (!f.tag || k.tags.includes(f.tag))
        && (!f.status || this.kortStatus(k) === f.status)
        && (!q || (k.front + '\n' + k.bag + '\n' + k.tags.join(' ') + '\n' + k.kilde.dok + ' ' + k.kilde.afsnit).toLowerCase().includes(q)))
        .sort((a, b) => a.rettet < b.rettet ? 1 : -1);
    },
    alleTags() { this.dataRev; return [...new Set(this.kort.filter(k => !k.slettet).flatMap(k => k.tags))].sort((a, b) => a.localeCompare(b, 'da')); },
    kildeTxt(k) { const s = k.kilde; return [s.dok, s.afsnit && '§/afsn. ' + s.afsnit, s.udgave && 'udg. ' + s.udgave].filter(Boolean).join(', '); },
    naesteTxt(k) {
      const t = this.tilst[k.id]; if (!t) return '';
      const ms = new Date(t.due) - new Date(); return ms <= 0 ? 'nu' : 'om ' + this.varighedTxt(ms);
    },

    nytKortForm() {
      this.kRed = { ny:true, f:{ type:'fakta', emne:this.kf.emne || 'mat', front:'', bag:'', tagsTxt:'', kilde:{ dok:'', afsnit:'', udgave:'', gyldigFra:'' } } };
      this.modal = 'kort';
    },
    redigerKort(k) {
      const c = JSON.parse(JSON.stringify(k)); c.tagsTxt = k.tags.join(', ');
      this.kRed = { ny:false, f:c }; this.modal = 'kort';
    },
    async gemKortForm(igen) {
      const f = this.kRed.f;
      if (!f.front.trim() || !f.bag.trim()) return this.say('Kortet skal have både forside og bagside.', true);
      const data = Object.assign({}, f, { tags:f.tagsTxt.split(',').map(t => t.trim()).filter(Boolean) }); delete data.tagsTxt;
      await this.gemKort(this.kRed.ny ? nytKort(data) : data);
      this.say(this.kRed.ny ? 'Kortet er oprettet.' : 'Kortet er gemt.');
      if (igen && this.kRed.ny) { const b = this.kRed.f; this.kRed = { ny:true, f:{ type:b.type, emne:b.emne, front:'', bag:'', tagsTxt:b.tagsTxt, kilde:Object.assign({}, b.kilde) } }; this.$nextTick(() => { const e = document.getElementById('k-front'); if (e) e.focus(); }); }
      else this.lukModal();
    },
    sletKort(k) {
      this.spoerg('Slet kortet "' + k.front.slice(0, 60) + '"? Læringshistorikken bevares, men kortet forsvinder fra øvelserne.', async () => {
        await this.gemKort(Object.assign({}, k, { slettet:true })); this.lukModal(); this.say('Kortet er slettet.');
      }, 'Slet');
    },
    nulstilKort(k) {
      this.spoerg('Start forfra med kortet? Det bliver et nyt kort igen. Loggen over tidligere svar bevares.', async () => {
        /* Tilstanden kan ikke bare fjernes, for synk ville hente den igen. Den sættes til et nyt FSRS-kort med ny dato. */
        const c = FSRS.createEmptyCard(new Date()); await this.gemTilst(this.fraKort(k.id, c)); this.say('Kortet starter forfra.');
      }, 'Start forfra');
    },

    /* Startkort: JSON-filer i indhold/ med { navn, kort:[{ id, type, emne, front, bag, tags, kilde }] }.
       Kortenes id'er er faste, så en pakke kan indlæses flere gange uden dubletter. Kort, du selv har rettet, overskrives ikke. */
    async indlaesStartpakke(p) {
      let d = null; try { const r = await fetch(p.fil + '?v=' + APP_VERSION); if (r.ok) d = await r.json(); } catch (e) {}
      if (!d || !Array.isArray(d.kort)) return this.say('Startkortene kunne ikke hentes.', true);
      const kendt = new Set(this.kort.map(k => k.id)), nye = d.kort.filter(k => k && k.id && !kendt.has(k.id)).map(k => nytKort(Object.assign({}, k, { oprindelse:'start:' + p.fil })));
      await this.gemKort(nye); this.say(nye.length ? nye.length + ' startkort tilføjet.' : 'Alle startkort fra pakken findes allerede.');
      if (this.oevStart) this.oevStart();
    }
  };
}
