/* app(): tilstand, init() og fælles brugerflade. Metoder fra lager.js, synk.js, oev.js, kort.js og import.js lægges på med bland().
   Navne skal være unikke på tværs af filerne, fordi de samles i ét objekt. */
function bland(...dele) { const r = {}; for (const d of dele) Object.defineProperties(r, Object.getOwnPropertyDescriptors(d)); return r; }

function app() {
  return bland({
    view: 'oev',
    /* Faner. En fane med "kraever" vises kun, når modulets startmetode findes (fase 2, 4 og 5 bygges hver i sin fil). */
    views: [ { id:'oev', l:'Øv', k:'1' }, { id:'opgaver', l:'Opgaver', k:'2', kraever:'opgStart' }, { id:'cases', l:'Cases', k:'3', kraever:'caseStart' },
      { id:'fejlfinding', l:'Fejlfinding', k:'4', kraever:'ffStart' },
      { id:'kompetence', l:'Kompetence', k:'7', kraever:'kompStart' }, { id:'kort', l:'Kort', k:'5' }, { id:'data', l:'Data og indstillinger', k:'6' } ],
    emner: EMNER, korttyper: KORTTYPER, appVersion: APP_VERSION,
    kort: [], tilst: {}, log: [], resultater: [], indst: normIndst(), dataRev: 0, klar: false,
    storageOk: true, tema: 'auto', toasts: [], confirm: null, modal: null, sidstBackup: '',
    online: navigator.onLine !== false, installPrompt: null, installeret: false, swOk: false,
    synk: null, synkTokenInput: '', synkKoerer: false, synkIgen: false, synkFejl: '', iSynk: false,

    async init() {
      window.__alpineOk = true;
      try { this.tema = localStorage.getItem(K_TEMA) || 'auto'; } catch (e) { this.storageOk = false; }
      this.saetTema();
      const h = (location.hash || '').slice(1); if (this.synligeViews().some(v => v.id === h)) this.view = h;
      window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (this.synligeViews().some(x => x.id === v)) this.view = v; });
      window.addEventListener('online', () => { this.online = true; this.synkNu(); });
      window.addEventListener('offline', () => { this.online = false; });
      window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installPrompt = e; });
      window.addEventListener('appinstalled', () => { this.installeret = true; this.installPrompt = null; });
      this.installeret = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js', { scope:'./' }).then(() => navigator.serviceWorker.ready).then(() => { this.swOk = true; }).catch(() => {});
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      await this.lagerStart();
      this.synk = this.synkLaes();
      this.klar = true;
      if (this.oevStart) this.oevStart();
      if (this.synk) this.synkNu();
    },

    synligeViews() { return this.views.filter(v => !v.kraever || typeof this[v.kraever] === 'function'); },
    gaaTil(v) { this.view = v; if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v); },
    saetTema(t) {
      if (t) { this.tema = t; try { localStorage.setItem(K_TEMA, t); } catch (e) {} }
      if (this.tema === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', this.tema);
    },
    async installer() { if (!this.installPrompt) return; this.installPrompt.prompt(); try { await this.installPrompt.userChoice; } catch (e) {} this.installPrompt = null; },

    say(tekst, fejl) { const id = uid(); this.toasts.push({ id, tekst, fejl:!!fejl }); setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, fejl ? 7000 : 3500); },
    spoerg(tekst, ja, jaTekst) { this.confirm = { tekst, ja, jaTekst:jaTekst || 'Ja' }; },
    async bekraeft() { const c = this.confirm; this.confirm = null; if (c && c.ja) await c.ja(); },

    emneNavn(id) { const e = EMNER.find(x => x.id === id); return e ? e.navn : 'Andet'; },
    emneKort(id) { const e = EMNER.find(x => x.id === id); return e ? e.kort : 'Andet'; },
    datoTxt(iso) { return iso ? new Date(iso).toLocaleDateString('da-DK', { day:'numeric', month:'short', year:'numeric' }) : ''; },

    /* Kortenes tekst: HTML escapes, **fed**, linjeskift, $formel$ og $$formel$$ med KaTeX. */
    vis(t) {
      t = str(t);
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const tex = (s, blok) => { try { return window.katex ? katex.renderToString(s, { displayMode:blok, throwOnError:false, output:'html' }) : '<code>' + esc(s) + '</code>'; } catch (e) { return '<code>' + esc(s) + '</code>'; } };
      const dele = [], re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g; let i = 0, m;
      while ((m = re.exec(t))) { dele.push(esc(t.slice(i, m.index))); dele.push(m[1] != null ? tex(m[1], true) : tex(m[2], false)); i = re.lastIndex; }
      dele.push(esc(t.slice(i)));
      return dele.map((d, j) => j % 2 ? d : d.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')).join('');
    },

    key(e) {
      const t = e.target, skriver = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape') { if (this.confirm) this.confirm = null; else if (this.modal) this.lukModal(); return; }
      if (skriver || e.ctrlKey || e.metaKey || e.altKey || this.confirm || this.modal) return;
      /* Under en øvelse bruges tasterne 1–4 til karakterer. Ellers skifter 1–3 fane. */
      if (this.view === 'oev' && this.oevTast(e)) { e.preventDefault(); return; }
      const v = this.synligeViews().find(x => x.k === e.key);
      if (v) { this.gaaTil(v.id); e.preventDefault(); }
    },
    lukModal() { this.modal = null; }
  }, APP_LAGER(), APP_SYNK(), APP_OEV(), APP_KORT(), APP_IMPORT(), APP_OPGAVER(), APP_CASES(), APP_FEJLFINDING(), APP_KOMPETENCE());
}
