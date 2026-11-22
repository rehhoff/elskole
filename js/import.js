/* Import af kort fra tekstfiler eksporteret fra Anki ("Notes in Plain Text") og almindelig CSV/TSV.
   Den rene parser (importTolk, importFeltTilTekst) har ingen afhængigheder. Metoderne (aabnImport, imp*) samles i app() i js/app.js.
   Kolonnenumre i hoved (tagsKol m.fl.) tæller fra 1, som i Ankis hovedlinjer. 0 betyder, at kolonnen ikke er angivet. */

const IMPORT_SEPARATORER = { tab:'\t', semicolon:';', comma:',', space:' ', pipe:'|', colon:':' };
const IMPORT_ENTITETER = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', aelig:'æ', oslash:'ø', aring:'å', AElig:'Æ', Oslash:'Ø', Aring:'Å', deg:'°', micro:'µ', times:'×', divide:'÷', plusmn:'±', ohm:'Ω', Omega:'Ω', sup2:'²', sup3:'³', middot:'·', ndash:'–', mdash:'—', hellip:'…', laquo:'«', raquo:'»', eacute:'é' };

function importAfkod(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return n === 160 ? ' ' : String.fromCodePoint(n); } catch (x) { return m; }
    }
    return Object.prototype.hasOwnProperty.call(IMPORT_ENTITETER, e) ? IMPORT_ENTITETER[e] : m;
  });
}

/* HTML (eller ren tekst, når erHtml er false) fra et Anki-felt til kortenes tekstformat. */
function importFeltTilTekst(html, erHtml) {
  let s = String(html == null ? '' : html).replace(/\r\n?/g, '\n');
  s = s.replace(/\[sound:[^\]]*\]/gi, '');
  const mat = [];
  /* MathJax \(…\) og \[…\] bliver $…$ og $$…$$. Indholdet gemmes som placeholder, så tags og entiteter uden for formlen ikke rammer det. */
  const gem = (inde, dobbelt) => {
    let f = erHtml === false ? inde : importAfkod(inde.replace(/<br\s*\/?>/gi, ' ').replace(/<[a-z\/][^>]*>/gi, ''));
    f = f.trim(); if (!f) return '';
    mat.push(dobbelt ? '$$' + f + '$$' : '$' + f + '$'); return '\u0001' + (mat.length - 1) + '\u0001';
  };
  if (erHtml !== false) s = s.replace(/<img\b[^>]*>/gi, '');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (m, x) => gem(x, true)).replace(/\\\(([\s\S]*?)\\\)/g, (m, x) => gem(x, false));
  if (erHtml !== false) {
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<(div|p|li|tr|h[1-6])\b[^>]*>/gi, '\n').replace(/<\/(div|p|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<(b|strong)\b[^>]*>/gi, '**').replace(/<\/(b|strong)\s*>/gi, '**')
      .replace(/<[a-z\/!][^>]*>/gi, '');
    s = s.replace(/\*\*\s*\*\*/g, '');
    s = importAfkod(s);
  }
  s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => mat[+i]);
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '').trim();
}

/* Tekst → { kolonner, raekker, hoved, billeder, lyde }. Felterne i raekker er rå (ikke omdannet). */
function importTolk(tekst) {
  let t = String(tekst == null ? '' : tekst).replace(/^﻿/, '');
  const hoved = { separator:'', html:null, tagsKol:0, guidKol:0, deckKol:0, notetypeKol:0 };
  let sepNavn = null;
  while (t[0] === '#') {
    const e = t.indexOf('\n'), linje = (e < 0 ? t : t.slice(0, e)).replace(/\r$/, ''); t = e < 0 ? '' : t.slice(e + 1);
    const m = /^#\s*([^:]+?)\s*:(.*)$/.exec(linje); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2], vt = v.trim(), n = parseInt(vt, 10);
    if (k === 'separator') sepNavn = vt.length ? vt : v;
    else if (k === 'html') hoved.html = vt.toLowerCase() === 'true';
    else if (k === 'tags column') hoved.tagsKol = n > 0 ? n : 0;
    else if (k === 'guid column') hoved.guidKol = n > 0 ? n : 0;
    else if (k === 'deck column') hoved.deckKol = n > 0 ? n : 0;
    else if (k === 'notetype column') hoved.notetypeKol = n > 0 ? n : 0;
  }
  let sep;
  if (sepNavn != null) sep = IMPORT_SEPARATORER[sepNavn.toLowerCase()] || (sepNavn.length ? sepNavn[0] : '\t');
  else {
    const proeve = t.split('\n').slice(0, 5).join('\n');
    sep = proeve.includes('\t') ? '\t' : proeve.includes(';') ? ';' : proeve.includes(',') ? ',' : '\t';
  }
  hoved.separator = sep;
  const raekker = []; let ra = [], felt = '', i = 0, n = t.length, nyFelt = true;
  const slutRaekke = () => { ra.push(felt); felt = ''; if (!(ra.length === 1 && ra[0].trim() === '')) raekker.push(ra); ra = []; nyFelt = true; };
  while (i < n) {
    const c = t[i];
    if (nyFelt && c === '"') {
      i++; nyFelt = false;
      while (i < n) {
        if (t[i] === '"') { if (t[i + 1] === '"') { felt += '"'; i += 2; continue; } i++; break; }
        felt += t[i++];
      }
    } else if (c === sep) { ra.push(felt); felt = ''; nyFelt = true; i++; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; i++; slutRaekke(); }
    else { felt += c; nyFelt = false; i++; }
  }
  if (felt !== '' || ra.length) slutRaekke();
  let billeder = 0, lyde = 0;
  for (const r of raekker) for (const f of r) { billeder += (f.match(/<img\b/gi) || []).length; lyde += (f.match(/\[sound:/gi) || []).length; }
  return { kolonner: raekker.reduce((m, r) => Math.max(m, r.length), 0), raekker, hoved, billeder, lyde };
}

function APP_IMPORT() {
  return {
    imp: null,

    aabnImport() {
      this.imp = { tekst:'', fil:'', t:importTolk(''), front:1, bag:2, tags:0, emne:this.kf.emne || 'andet', type:'fakta', ekstra:'anki', html:true, spring:false, kort:[], nye:0, dubl:0, tomme:0 };
      this.modal = 'import';
    },
    impNy(tekst, fil) {
      const t = importTolk(tekst), h = t.hoved, im = this.imp; im.tekst = tekst; im.fil = fil || ''; im.t = t; im.spring = false;
      im.html = h.html != null ? h.html : /<(br|div|b|p|span|strong|img)\b|&[a-z#0-9]+;/i.test(tekst);
      const brugt = new Set([h.guidKol, h.notetypeKol, h.deckKol, h.tagsKol]), frie = [];
      for (let k = 1; k <= t.kolonner; k++) if (!brugt.has(k)) frie.push(k);
      im.front = frie[0] || 1; im.bag = frie[1] || 0; im.tags = h.tagsKol; this.impOpdater();
    },
    impVaelgFil(ev) {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      const l = new FileReader(); l.onload = () => this.impNy(String(l.result), f.name); l.onerror = () => this.say('Filen kunne ikke læses.', true); l.readAsText(f, 'utf-8');
    },
    impKolonner() { return this.imp && this.imp.t ? Array.from({ length: this.imp.t.kolonner }, (_, i) => i + 1) : []; },
    impKolTxt(k) {
      const r = (this.imp && this.imp.t && this.imp.t.raekker[this.imp.spring ? 1 : 0]) || [], v = importFeltTilTekst(r[k - 1] || '', this.imp ? this.imp.html : true).replace(/\s+/g, ' ');
      return 'Kolonne ' + k + (v ? ': ' + (v.length > 30 ? v.slice(0, 30) + '…' : v) : '');
    },
    /* Bygger kortene ud fra valgene og tæller nye og dubletter (mod eksisterende kort og mod resten af filen). */
    impOpdater() {
      const im = this.imp; if (!im) return;
      im.front = +im.front || 0; im.bag = +im.bag || 0; im.tags = +im.tags || 0;
      const h = im.t ? im.t.hoved : null, liste = [], ekstra = String(im.ekstra || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
      let tomme = 0;
      if (im.t && im.front) {
        const rk = im.t.raekker.slice(im.spring ? 1 : 0);
        for (const r of rk) {
          const front = importFeltTilTekst(r[im.front - 1] || '', im.html), bag = im.bag ? importFeltTilTekst(r[im.bag - 1] || '', im.html) : '';
          if (!front || !bag) { tomme++; continue; }
          const tags = [...new Set([...(im.tags ? String(r[im.tags - 1] || '').split(/[\s,;]+/).filter(Boolean) : []), ...ekstra])];
          const guid = h && h.guidKol ? String(r[h.guidKol - 1] || '').trim() : '';
          liste.push({ front, bag, tags, guid, dubl:false });
        }
      }
      const levende = this.kort.filter(k => !k.slettet), oprind = new Set(levende.map(k => k.oprindelse).filter(Boolean)), forsider = new Set(levende.map(k => k.front.trim().toLowerCase()));
      for (const k of liste) {
        const f = k.front.trim().toLowerCase();
        k.dubl = !!((k.guid && oprind.has('anki:' + k.guid)) || forsider.has(f));
        if (!k.dubl) { forsider.add(f); if (k.guid) oprind.add('anki:' + k.guid); }
      }
      im.kort = liste; im.tomme = tomme; im.dubl = liste.filter(k => k.dubl).length; im.nye = liste.length - im.dubl;
    },
    impEksempel() { return this.imp ? this.imp.kort.filter(k => !k.dubl).slice(0, 5) : []; },
    async impImporter() {
      const im = this.imp; if (!im || !im.nye) return this.say('Der er ingen nye kort at importere.', true);
      const nye = im.kort.filter(k => !k.dubl).map(k => nytKort({ type:im.type, emne:im.emne, front:k.front, bag:k.bag, tags:k.tags, oprindelse:k.guid ? 'anki:' + k.guid : 'anki' }));
      const dubl = im.dubl, billeder = im.t ? im.t.billeder : 0, lyde = im.t ? im.t.lyde : 0;
      await this.gemKort(nye);
      if (this.oevStart) this.oevStart();
      this.say(nye.length + ' kort importeret' + (dubl ? ', ' + dubl + ' dubletter sprunget over' : '') + (billeder || lyde ? '. Billeder (' + billeder + ') og lyd (' + lyde + ') er ikke med' : '') + '.');
      this.lukModal();
    }
  };
}
