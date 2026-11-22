/* Synk mellem enheder via en hemmelig GitHub Gist. Kort og tilstand flettes pr. id (nyeste "rettet" vinder), loggen er en foreningsmængde.
   Intet slettes nogensinde i Gist'en: slettede kort er gravsten (slettet: true). Metoderne samles i app() i js/app.js. */
let SYNK_T = null;

function APP_SYNK() {
  return {
    synkLaes() { try { const s = JSON.parse(localStorage.getItem(K_SYNK)); if (s && s.token) return Object.assign({ gistId:'', login:'', sidst:'' }, s); } catch (e) {} return null; },
    synkGem() { try { if (this.synk) localStorage.setItem(K_SYNK, JSON.stringify(this.synk)); else localStorage.removeItem(K_SYNK); } catch (e) {} },
    synkMarkoer() { return JSON.stringify({ format:'elskole-sync', app:APP_VERSION, schema:SCHEMA, opdateret:nu() }); },
    async gh(sti, opt) {
      const o = opt || {}, h = { Accept:'application/vnd.github+json', Authorization:'Bearer ' + this.synk.token };
      if (o.body) h['Content-Type'] = 'application/json';
      let r; try { r = await fetch(GH + sti, { method:o.method || 'GET', body:o.body, headers:h, cache:'no-store' }); } catch (e) { throw new Error('Ingen forbindelse til GitHub. Ændringerne er gemt i browseren og sendes, når der er net igen.'); }
      if (!r.ok) {
        const e = new Error(r.status === 401 ? 'GitHub afviste tokenet. Slå synkronisering fra, og forbind med et nyt token.' : r.status === 404 ? 'Gist\'en blev ikke fundet, eller tokenet mangler adgangen gist.'
          : r.status === 403 || r.status === 429 ? 'GitHub afviste forespørgslen (manglende adgang eller for mange kald). Prøv igen om lidt.' : 'GitHub svarede med fejl ' + r.status + '.');
        e.status = r.status; throw e;
      }
      return r.status === 204 ? null : r.json();
    },
    async synkForbind() {
      const token = this.synkTokenInput.trim(); if (!token || this.synkKoerer) return;
      this.synk = { token, gistId:'', login:'', sidst:'' }; this.synkFejl = ''; this.synkKoerer = true;
      try {
        try { this.synk.login = (await this.gh('/user')).login || ''; } catch (e) { if (e.status === 401) throw e; }
        let gid = '';
        for (let side = 1; side <= 10 && !gid; side++) {
          const gs = await this.gh('/gists?per_page=100&page=' + side);
          const g = gs.find(g => g.files && g.files[G_MARK]); if (g) gid = g.id;
          if (gs.length < 100) break;
        }
        if (!gid) gid = (await this.gh('/gists', { method:'POST', body:JSON.stringify({ description:'Elskolen: synkroniserede kort og læring', public:false, files:{ [G_MARK]:{ content:this.synkMarkoer() } } }) })).id;
        this.synk.gistId = gid; this.synkGem(); this.synkTokenInput = '';
      } catch (e) { this.synk = null; this.synkGem(); this.synkFejl = e.message; this.synkKoerer = false; return; }
      this.synkKoerer = false; await this.synkNu();
      if (!this.synkFejl) this.say('Synkronisering slået til. Kort og læring gemmes nu også i din Gist på GitHub.');
    },
    synkAfbryd() { clearTimeout(SYNK_T); this.synk = null; this.synkGem(); this.synkFejl = ''; this.say('Synkronisering slået fra på denne enhed. Data her og i Gist\'en er urørte.'); },
    synkTxt() {
      if (!this.synk) return 'Kun i denne browser';
      if (!this.online) return 'Offline, synkroniserer når der er net';
      if (this.synkFejl) return 'Synkronisering fejlede';
      if (this.synkKoerer) return 'Synkroniserer …';
      return this.synk.sidst ? 'Synkroniseret kl. ' + new Date(this.synk.sidst).toLocaleTimeString('da-DK', { hour:'2-digit', minute:'2-digit' }) : 'Synkroniseres via GitHub';
    },
    synkSenere() { if (!this.synk || this.iSynk) return; clearTimeout(SYNK_T); SYNK_T = setTimeout(() => this.synkNu(), 4000); },
    async synkNu() {
      if (this.synkKoerer) { this.synkIgen = true; return; }
      const s = this.synkLaes(); this.synk = s; if (!s || !s.gistId) return;
      if (navigator.onLine === false) { this.online = false; return; }
      clearTimeout(SYNK_T); this.synkKoerer = true; this.synkFejl = '';
      try { await this.synkKoer(); this.synk.sidst = nu(); this.synkGem(); }
      catch (e) { this.synkFejl = e.message || 'Synkroniseringen mislykkedes.'; }
      finally { this.synkKoerer = false; if (this.synkIgen && this.synk) { this.synkIgen = false; this.synkNu(); } }
    },
    async synkFil(f) {
      if (!f) return null;
      let txt = f.content;
      if (f.truncated || txt == null) { let r = null; try { r = await fetch(f.raw_url, { cache:'no-store' }); } catch (e) {} if (!r || !r.ok) throw new Error('Kunne ikke hente ' + f.filename + ' fra GitHub.'); txt = await r.text(); }
      try { return JSON.parse(txt); } catch (e) { throw new Error(f.filename + ' i Gist\'en kan ikke læses. Intet er ændret.'); }
    },
    async synkKoer() {
      const g = await this.gh('/gists/' + this.synk.gistId), F = g.files || {};
      /* En ældre version må aldrig læse eller skrive data gemt med et nyere skema */
      let mSchema = 0; try { mSchema = Number(JSON.parse(F[G_MARK].content).schema) || 0; } catch (e) {}
      if (mSchema > SCHEMA) { const e = new Error('Data på GitHub er gemt af en nyere version af appen (skema ' + mSchema + ', denne har ' + SCHEMA + '). Genindlæs siden med Ctrl+F5. Indtil da synkroniseres der ikke fra denne enhed.'); e.status = 'skema'; throw e; }
      const rK = ((await this.synkFil(F[G_KORT])) || []).map(normKort), rT = ((await this.synkFil(F[G_TILST])) || []).map(normTilstand);
      const rL = {}, rR = {};
      for (const navn of Object.keys(F)) {
        let m = G_LOG_RE.exec(navn); if (m) rL[m[1]] = ((await this.synkFil(F[navn])) || []).map(normLog);
        m = G_RES_RE.exec(navn); if (m) rR[m[1]] = ((await this.synkFil(F[navn])) || []).map(normResultat);
      }
      const sorter = a => [...a].sort((x, y) => x.id < y.id ? -1 : 1), filer = {};
      this.iSynk = true;
      try {
        /* kort og tilstand */
        const mK = sorter(flet(this.kort, rK)), mT = sorter(flet(Object.values(this.tilst), rT));
        const lokK = new Map(this.kort.map(k => [k.id, k])), nyK = mK.filter(k => lokK.get(k.id) !== k);
        const nyT = mT.filter(t => this.tilst[t.id] !== t);
        if (nyK.length) await this.gemKort(nyK, true);
        if (nyT.length) await this.gemTilst(nyT, true);
        if (hashD(mK) !== hashD(sorter(rK))) filer[G_KORT] = { content:JSON.stringify(mK) };
        if (hashD(mT) !== hashD(sorter(rT))) filer[G_TILST] = { content:JSON.stringify(mT) };
        /* log pr. måned */
        const lokL = {}; for (const l of this.log) (lokL[l.tid.slice(0, 7)] = lokL[l.tid.slice(0, 7)] || []).push(l);
        const hent = [];
        for (const m of new Set([...Object.keys(lokL), ...Object.keys(rL)])) {
          const L = lokL[m] || [], R = rL[m] || [], rid = new Set(R.map(l => l.id)), lid = new Set(L.map(l => l.id));
          hent.push(...R.filter(l => !lid.has(l.id)));
          if (L.some(l => !rid.has(l.id))) filer[G_LOG(m)] = { content:JSON.stringify(sorter([...R, ...L.filter(l => !rid.has(l.id))])) };
        }
        if (hent.length) await this.tilfoejLog(hent);
        /* resultater pr. måned (skema 2), samme princip som loggen */
        const lokR = {}; for (const r of this.resultater) (lokR[r.tid.slice(0, 7)] = lokR[r.tid.slice(0, 7)] || []).push(r);
        const hentR = [];
        for (const m of new Set([...Object.keys(lokR), ...Object.keys(rR)])) {
          const L = lokR[m] || [], R = rR[m] || [], rid = new Set(R.map(x => x.id)), lid = new Set(L.map(x => x.id));
          hentR.push(...R.filter(x => !lid.has(x.id)));
          if (L.some(x => !rid.has(x.id))) filer[G_RES(m)] = { content:JSON.stringify(sorter([...R, ...L.filter(x => !rid.has(x.id))])) };
        }
        if (hentR.length) await this.tilfoejResultat(hentR);
      } finally { this.iSynk = false; }
      if (Object.keys(filer).length) {
        filer[G_MARK] = { content:this.synkMarkoer() };
        await this.gh('/gists/' + this.synk.gistId, { method:'PATCH', body:JSON.stringify({ files:filer }) });
      }
    }
  };
}
