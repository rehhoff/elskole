"""Røgtest af Elskolen i headless Chromium.

Kør fra repoets rod:  python tests/smoke.py
Filerne serveres fra disken under http://app.test/. Alpine, ts-fsrs og KaTeX serveres fra node_modules/
(se CLAUDE.md for, hvordan de hentes). Kræver Python-pakken playwright.
"""
import asyncio, functools, http.server, json, os, re, sys, threading
from pathlib import Path
from playwright.async_api import async_playwright

ROD = Path(__file__).resolve().parent.parent
TYPER = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'}
LIB = {'alpinejs': ROD / 'node_modules/alpinejs/dist/cdn.min.js', 'ts-fsrs': ROD / 'node_modules/ts-fsrs/dist/index.umd.js',
       'katex.min.js': ROD / 'node_modules/katex/katex.min.js', 'katex.min.css': ROD / 'node_modules/katex/katex.min.css'}
URL = 'http://app.test/'
TRIN_MS = int(os.environ.get('SMOKE_TRIN_MS', '15000'))
SAMLET_S = int(os.environ.get('SMOKE_SAMLET_S', '300'))
A = "Alpine.$data(document.querySelector('[x-data]'))"
fejl, kontrol = [], []


def tjek(navn, ok, info=''):
    kontrol.append((navn, bool(ok), info))


async def lib(r):
    u = r.request.url
    for k, f in LIB.items():
        if k in u:
            await r.fulfill(body=f.read_bytes(), content_type=TYPER[f.suffix], headers={'access-control-allow-origin': '*'}); return True
    return False


async def route(r):
    u = r.request.url
    if await lib(r): return
    if u.startswith(URL):
        sti = u[len(URL):].split('?')[0].split('#')[0] or 'index.html'
        fil = (ROD / sti).resolve()
        if ROD in fil.parents and fil.is_file():
            await r.fulfill(body=fil.read_bytes(), content_type=TYPER.get(fil.suffix, 'application/octet-stream'))
        else:
            await r.fulfill(status=404, body='')
    elif u.startswith('https://api.github.com/') or u.startswith('https://gist.test/'):
        await github(r)
    else:
        await r.abort()


# Falsk GitHub-API: én hemmelig Gist delt mellem to "enheder"
GIST = {}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, accept', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS'}


def gist_json():
    return {'id': 'g1', 'files': {n: {'filename': n, 'content': c, 'truncated': False, 'raw_url': 'https://gist.test/raw/' + n} for n, c in GIST.items()}}


async def github(r):
    req, u = r.request, r.request.url
    if req.method == 'OPTIONS':
        return await r.fulfill(status=204, headers=CORS)
    svar = lambda d, s=200: r.fulfill(status=s, body=json.dumps(d), content_type='application/json', headers=CORS)
    if u.endswith('/user'): return await svar({'login': 'test'})
    if '/gists?' in u: return await svar([gist_json()] if GIST else [])
    if u.endswith('/gists') and req.method == 'POST':
        for n, f in json.loads(req.post_data)['files'].items(): GIST[n] = f['content']
        return await svar(gist_json(), 201)
    if u.endswith('/gists/g1') and req.method == 'GET': return await svar(gist_json())
    if u.endswith('/gists/g1') and req.method == 'PATCH':
        for n, f in json.loads(req.post_data)['files'].items():
            if f is None: GIST.pop(n, None)
            else: GIST[n] = f['content']
        return await svar(gist_json())
    await svar({'message': 'ukendt'}, 404)


async def ny_side(b, bredde=1200, hoejde=900, **kw):
    ctx = await b.new_context(viewport={'width': bredde, 'height': hoejde}, service_workers='block', **kw); ctx.set_default_timeout(TRIN_MS)
    await ctx.route('**/*', route)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: fejl.append(str(e)))
    pg.on('console', lambda m: fejl.append('konsol: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await pg.goto(URL); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
    return ctx, pg


async def vent_synk(pg):
    await pg.wait_for_timeout(100)
    await pg.wait_for_function(f"!{A}.synkKoerer")


async def main():
    # 0. Versionen skal være ens fire steder
    v_data = re.search(r"APP_VERSION = '([^']+)'", (ROD / 'js/data.js').read_text(encoding='utf-8')).group(1)
    v_sw = re.search(r"VERSION = '([^']+)'", (ROD / 'sw.js').read_text(encoding='utf-8')).group(1)
    v_pkg = json.loads((ROD / 'package.json').read_text(encoding='utf-8'))['version']
    v_html = set(re.findall(r'\?v=([0-9.]+)', (ROD / 'index.html').read_text(encoding='utf-8')))
    tjek('version ens i data.js, sw.js, package.json og index.html', v_data == v_sw == v_pkg and v_html == {v_data}, (v_data, v_sw, v_pkg, v_html))
    sw = (ROD / 'sw.js').read_text(encoding='utf-8')
    mangler = [f for f in re.findall(r'src="(js/[^"?]+)', (ROD / 'index.html').read_text(encoding='utf-8')) if f not in sw]
    tjek('alle scripts står i SKAL i sw.js', not mangler, mangler)

    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None)

        # 1. Start, tomt lager, opret kort
        ctx, pg = await ny_side(b)
        tom = await pg.evaluate(f"(()=>{{const a={A};return [a.kort.length, a.storageOk, !!document.querySelector('#oev-faerdig'), typeof FSRS.fsrs, !!window.katex]}})()")
        tjek('starter tom med lager, FSRS og KaTeX', tom == [0, True, True, 'function', True], tom)
        await pg.click('#tab-kort'); await pg.click('#k-ny')
        await pg.fill('#k-front', 'Hvad er effekten i et 3-faset system?')
        await pg.fill('#k-bag', '$P = \\sqrt{3} \\cdot U \\cdot I \\cdot \\cos\\varphi$')
        await pg.fill('#k-dok', 'Lærebog'); await pg.click('#k-gem')
        await pg.wait_for_timeout(100)
        r = await pg.evaluate(f"(()=>{{const a={A};return [a.kort.length, a.kort[0].kilde.dok, document.querySelectorAll('#k-tabel tbody tr').length]}})()")
        tjek('kort oprettes med kilde og vises i listen', r == [1, 'Lærebog', 1], r)
        await pg.click('#k-tabel tbody tr'); await pg.wait_for_selector('#k-dialog')
        await pg.fill('#k-front', 'Effekt i 3-faset system?'); await pg.click('#k-gem'); await pg.wait_for_timeout(100)
        r = await pg.evaluate(f"{A}.kort[0].front")
        tjek('kort kan rettes', r == 'Effekt i 3-faset system?', r)

        # 2. Øv: vis svar, karakter, fortryd
        await pg.click('#tab-oev'); await pg.evaluate(f"{A}.oevStart()"); await pg.wait_for_selector('#oev-vis')
        await pg.keyboard.press('Space'); await pg.wait_for_selector('#oev-bag .katex')
        iv = await pg.evaluate(f"{A}.oevIntervaller()")
        tjek('svar vises med formel og intervaller for alle fire karakterer', len(iv) == 4 and all(iv.values()), iv)
        await pg.keyboard.press('3'); await pg.wait_for_timeout(150)
        r = await pg.evaluate(f"(()=>{{const a={A}, k=a.kort[0];return [a.log.length, a.log[0].karakter, a.log[0].ny, !!a.tilst[k.id], a.tilst[k.id].reps]}})()")
        tjek('karakteren gemmes i log og tilstand', r == [1, 3, True, True, 1], r)
        await pg.keyboard.press('z'); await pg.wait_for_timeout(150)
        r = await pg.evaluate(f"(()=>{{const a={A}, k=a.kort[0];return [a.log.length, !!a.tilst[k.id], a.oevId === k.id, a.oevVist]}})()")
        tjek('fortryd fjerner svaret igen', r == [0, False, True, True], r)
        await pg.keyboard.press('4'); await pg.wait_for_timeout(150)
        r = await pg.evaluate(f"(()=>{{const a={A}, k=a.kort[0];return [a.log.length, a.tilst[k.id].state, a.oevId, a.stat().idag, a.stat().stribe]}})()")
        tjek('"Let" sender kortet til gentagelse senere og tæller i dag', r == [1, 2, '', 1, 1], r)

        # 3. Data overlever genindlæsning (IndexedDB)
        await pg.reload(); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"(()=>{{const a={A};return [a.kort.length, a.log.length, Object.keys(a.tilst).length]}})()")
        tjek('kort, log og tilstand er gemt efter genindlæsning', r == [1, 1, 1], r)

        # 3b. Import fra Anki-tekstfiler gennem dialogen
        async def importer(tekst):
            await pg.click('#tab-kort'); await pg.click('#k-import'); await pg.wait_for_selector('#imp-dialog')
            await pg.fill('#imp-tekst', tekst); await pg.wait_for_timeout(100)
            tael = await pg.inner_text('#imp-tael')
            if await pg.is_enabled('#imp-ok'): await pg.click('#imp-ok')
            else: await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(200)
            return tael
        foer = await pg.evaluate(f"{A}.kort.length")
        anki = ('#separator:tab\n#html:true\n#guid column:1\n#tags column:4\n'
                'g1\tHvad er <b>effekt</b>?<br>Skriv formlen\t\\(P = U \\cdot I\\) &amp; mere<img src="x.png">[sound:a.mp3]\tel kabler\n'
                'g2\t"Linje1\nLinje2 med ""citat"" og\ttab"\t\\[x^2 &lt; 4\\]\tel\n')
        tael = await importer(anki)
        r = await pg.evaluate(f"(()=>{{const a={A};return a.kort.filter(k=>k.oprindelse.startsWith('anki:')).map(k=>[k.oprindelse,k.front,k.bag,k.tags.join('|')])}})()")
        tjek('Anki-fil med hovedlinjer, HTML og MathJax importeres gennem dialogen',
             r == [['anki:g1', 'Hvad er **effekt**?\nSkriv formlen', '$P = U \\cdot I$ & mere', 'el|kabler|anki'],
                   ['anki:g2', 'Linje1\nLinje2 med "citat" og\ttab', '$$x^2 < 4$$', 'el|anki']] and tael.startswith('2 nye') and 'Billeder (1)' in tael and 'lyd (1)' in tael, (r, tael))
        tael = await importer(anki)
        r = await pg.evaluate(f"{A}.kort.length")
        tjek('samme Anki-fil igen giver kun dubletter', r == foer + 2 and tael.startswith('0 nye') and '2 dubletter' in tael, (r, foer, tael))
        await importer('Forside;Bagside\nSpørgsmål A;Svar A\n"x;y";z')
        r = await pg.evaluate(f"{A}.kort.filter(k=>k.oprindelse==='anki').map(k=>[k.front,k.bag])")
        tjek('semikolon-CSV uden hovedlinjer importeres', r == [['Forside', 'Bagside'], ['Spørgsmål A', 'Svar A'], ['x;y', 'z']], r)
        tael = await importer('Spørgsmål A;Anden\nNy forside;Ny bagside')
        r = await pg.evaluate(f"{A}.kort.filter(k=>k.oprindelse==='anki').map(k=>k.front)")
        tjek('dubletter på forsiden springes over ved import uden guid', r == ['Forside', 'Spørgsmål A', 'x;y', 'Ny forside'] and tael.startswith('1 nye kort, 1 dubletter'), (r, tael))

        # 4. Startkort (hvis pakken findes)
        if (ROD / 'indhold/start-matematik.json').exists():
            n = len(json.loads((ROD / 'indhold/start-matematik.json').read_text(encoding='utf-8'))['kort'])
            foer = await pg.evaluate(f"{A}.kort.length")
            await pg.evaluate(f"{A}.indlaesStartpakke({A}.startpakker[0])"); await pg.wait_for_timeout(200)
            await pg.evaluate(f"{A}.indlaesStartpakke({A}.startpakker[0])"); await pg.wait_for_timeout(200)
            r = await pg.evaluate(f"{A}.kort.length")
            tjek('startkort indlæses én gang uden dubletter', r - foer == n, (r, foer, n))
            ugyldig = await pg.evaluate(f"(()=>{{const a={A};return a.kort.filter(k=>k.oprindelse.startsWith('start:')).filter(k=>/katex-error/.test(a.vis(k.front)+a.vis(k.bag))).map(k=>k.id)}})()")
            tjek('alle startkort har gyldige formler', not ugyldig, ugyldig)

        # 5. Backup: hent data, ryd lager, indlæs igen
        bk = await pg.evaluate(f"JSON.stringify({A}.backupData())")
        await ctx.close()
        ctx, pg = await ny_side(b)
        await pg.evaluate(f"{A}.indlaesBackup(JSON.parse({json.dumps(bk)}))"); await pg.wait_for_timeout(200)
        r = await pg.evaluate(f"(()=>{{const a={A};return [a.kort.length, a.log.length, Object.keys(a.tilst).length]}})()")
        d = json.loads(bk)
        tjek('backup indlæses i en tom browser', r == [len(d['kort']), len(d['log']), len(d['tilstand'])], (r, len(d['kort'])))
        await pg.evaluate(f"{A}.indlaesBackup(JSON.parse({json.dumps(bk)}))"); await pg.wait_for_timeout(200)
        r2 = await pg.evaluate(f"{A}.kort.length")
        tjek('samme backup to gange giver ingen dubletter', r2 == r[0], r2)

        # 6. Synk mellem to enheder
        await pg.evaluate(f"(()=>{{const a={A}; a.synkTokenInput='tok'; return a.synkForbind()}})()"); await vent_synk(pg)
        r = await pg.evaluate(f"[{A}.synkFejl, {A}.synk && {A}.synk.gistId]")
        tjek('synk forbinder og sender data til Gist', r == ['', 'g1'] and 'elskole-kort.json' in GIST and any(k.startswith('elskole-log-') for k in GIST), (r, list(GIST)))
        ctx2, pg2 = await ny_side(b)
        await pg2.evaluate(f"(()=>{{const a={A}; a.synkTokenInput='tok'; return a.synkForbind()}})()"); await vent_synk(pg2)
        r = await pg2.evaluate(f"(()=>{{const a={A};return [a.kort.length, a.log.length, Object.keys(a.tilst).length]}})()")
        tjek('anden enhed henter kort, log og tilstand', r == [len(d['kort']), len(d['log']), len(d['tilstand'])], r)
        # enhed 2 sletter et kort og opretter et nyt; enhed 1 får begge dele
        await pg2.evaluate(f"(async()=>{{const a={A}; await a.gemKort(Object.assign({{}}, a.kort[0], {{slettet:true}})); await a.gemKort(nytKort({{front:'Ny fra 2', bag:'b'}})); await a.synkNu()}})()"); await vent_synk(pg2)
        await pg.evaluate(f"{A}.synkNu()"); await vent_synk(pg)
        r = await pg.evaluate(f"(()=>{{const a={A};return [a.kort.filter(k=>!k.slettet).length, a.kort.some(k=>k.front==='Ny fra 2'), a.synkFejl]}})()")
        tjek('sletning og nyt kort synkroniseres til den anden enhed', r == [len(d['kort']), True, ''], r)
        # resultater (skema 2) synkroniseres som loggen
        await pg.evaluate(f"(async()=>{{const a={A}; await a.tilfoejResultat({{art:'opgave', ref:'test', emne:'mat', korrekt:false, fejltype:'glemt-ktemp'}}); await a.synkNu()}})()"); await vent_synk(pg)
        await pg2.evaluate(f"{A}.synkNu()"); await vent_synk(pg2)
        r = await pg2.evaluate(f"(()=>{{const a={A};return [a.resultater.length, a.resultater[0] && a.resultater[0].fejltype, a.synkFejl]}})()")
        tjek('resultater synkroniseres til den anden enhed', r == [1, 'glemt-ktemp', ''] and any(k.startswith('elskole-resultater-') for k in GIST), r)
        # nyere skema i Gist'en: der må hverken læses eller skrives
        foer = dict(GIST); GIST['elskole.json'] = json.dumps({'format': 'elskole-sync', 'schema': 999})
        await pg.evaluate(f"(async()=>{{const a={A}; await a.gemKort(nytKort({{front:'x', bag:'y'}})); await a.synkNu()}})()"); await vent_synk(pg)
        r = await pg.evaluate(f"{A}.synkFejl")
        tjek('nyere skema i Gist blokerer synk', 'nyere version' in r and GIST['elskole-kort.json'] == foer['elskole-kort.json'], r)
        await ctx.close(); await ctx2.close()

        # 6b. Opgradering fra skema 1: IndexedDB version 1 med tre tabeller og et kort. Efter start findes kortet, tabellen resultater og en automatisk backup.
        ctx = await b.new_context(viewport={'width': 1200, 'height': 900}, service_workers='block'); ctx.set_default_timeout(TRIN_MS)
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: fejl.append(str(e)))
        await pg.goto(URL + 'findes-ikke')
        await pg.evaluate("""new Promise(ok => { const r = indexedDB.open('elskole', 1);
          r.onupgradeneeded = () => { for (const s of ['kort', 'tilstand', 'log']) r.result.createObjectStore(s, { keyPath:'id' }); };
          r.onsuccess = () => { const tx = r.result.transaction('kort', 'readwrite');
            tx.objectStore('kort').put({ id:'gl1', type:'fakta', emne:'mat', front:'Gammelt kort', bag:'b', tags:[], kilde:{}, oprettet:'2026-11-01T00:00:00Z', rettet:'2026-11-01T00:00:00Z' });
            tx.oncomplete = () => { r.result.close(); localStorage.setItem('elskole.meta', JSON.stringify({ schema:1 })); ok(); }; }; })""")
        await pg.goto(URL); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"(async()=>{{const a={A}; await a.tilfoejResultat({{art:'case', ref:'x'}}); return [a.kort.map(k=>k.front), a.resultater.length, !!localStorage.getItem('elskole.backup'), JSON.parse(localStorage.getItem('elskole.meta')).schema]}})()")
        tjek('opgradering fra skema 1 bevarer kortene, tilføjer resultater og tager backup', r == [['Gammelt kort'], 1, True, 2], r)
        await ctx.close()

        # ===== FASE 2: OPGAVER (js/opgaver.js) =====

        # ===== FASE 4: CASES (js/cases.js) =====

        # ===== FASE 5: FEJLFINDING (js/fejlfinding.js) =====
        ctx, pg = await ny_side(b)
        r = await pg.evaluate(f"""(()=>{{const a={A}; const ens = JSON.stringify(a.ffLavScenarie(42)) === JSON.stringify(a.ffLavScenarie(42));
          const typer = new Set(); for (let s = 1; s <= 300; s++) typer.add(a.ffLavScenarie(s).fejl.type);
          return [ens, [...typer].sort().join(',') === a.ffFejltyper.map(f=>f.id).sort().join(','), a.ffFejltyper.length]}})()""")
        tjek('fejlfinding: samme seed giver samme scenarie, og alle fejltyper forekommer', r == [True, True, 7], r)
        r = await pg.evaluate(f"""(()=>{{const a={A}, galt=[];
          for (let seed = 1; seed <= 60; seed++) {{ const s = a.ffLavScenarie(seed);
            for (const n of s.noder) {{ const zs = a.ffModel(s, n.id, 'zs', true, null).v, rcd = a.ffModel(s, n.id, 'rcd', true, null).v;
              const iso = ['iso-lpe','iso-npe','iso-ln'].every(m => a.ffModel(s, n.id, m, false, null).tekst === '> 999 MΩ');
              const pol = a.ffModel(s, n.id, 'pol', true, null).tekst === 'Korrekt';
              if (!(zs <= a.ffZsGraense(s) && rcd <= 300 && iso && pol)) galt.push([seed, n.id, zs]); }}
            if (s.noder.length < 4 || s.noder.length > 8) galt.push([seed, 'antal', s.noder.length]); }}
          return galt}})()""")
        tjek('fejlfinding: det fejlfri anlæg overholder kravene', not r, r[:5])
        r = await pg.evaluate(f"""(()=>{{const a={A}, ud={{}};
          for (const f of a.ffFejltyper) {{ ud[f.id] = 0;
            for (let seed = 1; seed <= 15; seed++) {{ const s = a.ffLavScenarie(seed * 7919, {{ fejl:f.id }});
              const afg = a.ffAfgoerende(s);
              /* med stoej: mindst én af de afgoerende maalinger afviger stadig tydeligt fra fejlfri med stoej */
              const ok = afg.some(x => {{ const lev = a.ffMaaleTilstand(x.m); return [0,1,2].every(g => a.ffAfviger(x.m, a.ffMaalModel(s, x.p, x.m, lev, s.fejl, g), a.ffMaalModel(s, x.p, x.m, lev, null, g))); }});
              if (s.fejl.type === f.id && ok) ud[f.id]++; }} }}
          return ud}})()""")
        tjek('fejlfinding: hver fejltype giver målinger (med støj), der adskiller den fra fejlfri', all(v == 15 for v in r.values()) and len(r) == 7, r)
        r = await pg.evaluate(f"""(()=>{{const a={A};
          const s = a.ffLavScenarie(5, {{ fejl:'afbrudt-pe', sted:'n:D1' }});
          const v = (sted, type) => a.ffVurder(s, {{ type:type || 'afbrudt-pe', sted }}, [], 0);
          const s2 = a.ffLavScenarie(5, {{ fejl:'iso-lpe', sted:'n:D1' }});
          const v2 = sted => a.ffVurder(s2, {{ type:'iso-lpe', sted }}, [], 0).stedOk;
          const s3 = a.ffLavScenarie(5, {{ fejl:'daarlig-forb', sted:'n:D1' }});
          return [s.fejl.sted, v('n:D1').korrekt, v('k:D1').korrekt, v('n:F1').korrekt, v('n:D1', 'afbrudt-n').korrekt, v('n:D1', 'afbrudt-n').fejltype,
            v2('n:D1'), v2('k:D1'), a.ffVurder(s3, {{ type:'daarlig-forb', sted:'k:D1' }}, [], 0).stedOk, v('n:D1').score]}})()""")
        tjek('fejlfinding: ens placeringer godkendes, forkerte afvises', r == ['n:D1', True, True, False, False, 'ff-type:afbrudt-pe>afbrudt-n', True, False, False, 1], r)

        # Gennem brugerfladen: afbrudt PE i dåse 1
        await pg.click('#tab-fejlfinding'); await pg.wait_for_selector('#v-fejlfinding #ff-diagram svg')
        await pg.evaluate(f"{A}.ffNyt(11, {{ fejl:'afbrudt-pe', sted:'n:D1' }})"); await pg.wait_for_timeout(100)
        await pg.click('#ff-p-D1'); await pg.wait_for_timeout(50)
        r = await pg.evaluate(f"[{A}.ffPunkt, document.querySelector('#ff-punkt').value]")
        tjek('fejlfinding: klik i diagrammet vælger målepunkt', r == ['D1', 'D1'], r)
        await pg.click('#ff-m-u-lpe'); await pg.wait_for_selector('#ff-sidste')
        u = await pg.evaluate(f"{A}.ffSidste().v")
        await pg.click('#ff-m-iso-lpe'); await pg.wait_for_timeout(50)
        r = await pg.evaluate(f"[{A}.ffSikFejl, {A}.ffSidste().fare, document.querySelector('#ff-sidste').className.includes('warn'), document.querySelectorAll('#ff-tabel tbody tr').length]")
        tjek('fejlfinding: isolation på spændingsførende anlæg giver tydelig fejl og tæller', r == [1, True, True, 2] and u < 30, (r, u))
        await pg.click('#ff-frakobl'); await pg.wait_for_selector('#ff-sik-dialog')
        r = await pg.evaluate("[document.querySelector('#ff-sik-ok').disabled, document.querySelector('#ff-r1').disabled, document.querySelectorAll('#ff-sik-dialog input[type=checkbox]').length]")
        await pg.click('#ff-r0'); await pg.click('#ff-r1'); await pg.click('#ff-r2'); await pg.click('#ff-r3')
        r2 = await pg.evaluate("document.querySelector('#ff-sik-ok').disabled")
        await pg.click('#ff-r1')  # fjern et kryds: de efterfølgende fjernes også
        r3 = await pg.evaluate(f"[...{A}.ffTjek]")
        for i in range(1, 5): await pg.click(f'#ff-r{i}')
        await pg.click('#ff-sik-ok'); await pg.wait_for_timeout(100)
        r4 = await pg.evaluate(f"[{A}.ffLevende, {A}.modal, !!document.querySelector('#ff-sik-dialog')]")
        tjek('fejlfinding: sikkerhedstjeklisten håndhæves i rækkefølge', r == [True, True, 5] and r2 is True and r3 == [True, False, False, False, False] and r4 == [False, None, False], (r, r2, r3, r4))
        await pg.select_option('#ff-punkt', 'T'); await pg.click('#ff-m-pe')
        t1 = await pg.inner_text('#ff-sidste')
        await pg.select_option('#ff-punkt', 'D1'); await pg.click('#ff-m-pe')
        t2 = await pg.inner_text('#ff-sidste')
        await pg.click('#ff-m-zs'); t3 = await pg.inner_text('#ff-sidste')
        tjek('fejlfinding: kontinuitet måles spændingsløst og viser afbrydelsen', 'OL' not in t1 and 'OL' in t2 and 'Ingen spænding' in t3, (t1, t2, t3))
        await pg.select_option('#ff-type', 'afbrudt-pe'); await pg.select_option('#ff-sted', 'k:D1')
        foer = await pg.evaluate(f"{A}.resultater.length")
        await pg.click('#ff-diagnose'); await pg.wait_for_selector('#ff-svar')
        r = await pg.evaluate(f"""(()=>{{const a={A}, x=a.resultater[a.resultater.length-1];
          return [a.resultater.length, x.art, x.ref, x.emne, x.korrekt, x.score, x.fejltype, x.data.seed, x.data.maalinger.length, x.data.sikkerhedsfejl,
            document.querySelector('#ff-svar').innerText.includes('Kontinuitet PE'), !!document.querySelector('#ff-diagnose'), document.querySelector('#ff-m-u-ln').disabled]}})()""")
        tjek('fejlfinding: scenarie gennemføres, og resultatet gemmes med fradrag for sikkerhedsfejl',
             r == [foer + 1, 'fejlfinding', 'afbrudt-pe', 'dim', True, 0.75, 'ff-sikkerhed', 11, 5, 1, True, False, True], r)
        await pg.reload(); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"{A}.resultater.filter(x => x.art === 'fejlfinding').length")
        tjek('fejlfinding: resultatet er gemt efter genindlæsning', r == 1, r)
        await ctx.close()

        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.gaaTil('fejlfinding')"); await pg.wait_for_selector('#ff-diagram svg')
        bredder = []
        for seed in [3, 4, 9]:
            await pg.evaluate(f"{A}.ffNyt({seed})"); await pg.wait_for_timeout(80)
            bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.click('#ff-m-u-ln'); await pg.wait_for_timeout(50)
        bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.click('#ff-frakobl'); await pg.wait_for_selector('#ff-sik-dialog')
        bredder.append(await pg.evaluate("document.querySelector('#ff-sik-dialog').getBoundingClientRect().width"))
        bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.keyboard.press('Escape')
        await pg.evaluate(f"(()=>{{const a={A}; a.ffDiag = {{ type:'iso-lpe', sted:'n:D1' }}; return a.ffDiagnose()}})()"); await pg.wait_for_selector('#ff-svar')
        bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        tjek('fejlfinding: mobil 375 px uden vandret rulning', all(x <= 375 for x in bredder), bredder)
        await ctx.close()

        # 7. Mobil: ingen vandret rulning, dialog passer
        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.gemKort(nytKort({{front:'Et langt spørgsmål om korrektionsfaktorer for kabler i jord og luft', bag:'$$I_z = I_t \\\\cdot k_{{temp}} \\\\cdot k_{{samlet}}$$'}}))")
        bredder = []
        for v in ['oev', 'kort', 'data']:
            await pg.evaluate(f"{A}.gaaTil('{v}')"); await pg.wait_for_timeout(100)
            bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.evaluate(f"{A}.gaaTil('kort')"); await pg.click('#k-ny'); await pg.wait_for_timeout(100)
        bredder.append(await pg.evaluate("document.querySelector('#k-dialog').getBoundingClientRect().width"))
        tjek('mobil 375 px: ingen vandret rulning i nogen fane', all(x <= 375 for x in bredder), bredder)
        await ctx.close()

        # 8. Mørkt tema
        ctx, pg = await ny_side(b, color_scheme='dark')
        r = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
        tjek('mørkt tema følger systemet', r == 'rgb(19, 23, 26)', r)
        await ctx.close()

        # 9. Offline-app med service worker på localhost
        class Stille(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        class Server(http.server.ThreadingHTTPServer):
            request_queue_size = 128
            daemon_threads = True
        srv = Server(('127.0.0.1', 0), functools.partial(Stille, directory=str(ROD)))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        lok = 'http://127.0.0.1:%d/' % srv.server_address[1]
        async def lok_route(r):
            if await lib(r): return
            if r.request.url.startswith(lok): await r.continue_()
            else: await r.abort()
        ctx = await b.new_context(viewport={'width': 1200, 'height': 900}, service_workers='allow'); ctx.set_default_timeout(TRIN_MS)
        await ctx.route('**/*', lok_route)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: fejl.append('offline: ' + str(e)))
        await pg.goto(lok); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        klar = await pg.evaluate("Promise.race([navigator.serviceWorker.ready.then(()=>new Promise(f=>setTimeout(()=>f(!!navigator.serviceWorker.controller),300))), new Promise(f=>setTimeout(()=>f(false),10000))])")
        if not klar:
            await pg.reload(); await pg.wait_for_timeout(500); klar = await pg.evaluate("!!navigator.serviceWorker.controller")
        await pg.evaluate(f"{A}.gemKort(nytKort({{front:'offline', bag:'ok'}}))")
        await ctx.set_offline(True); await pg.reload()
        await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"(()=>{{const a={A};return [a.appVersion, a.kort.length, a.online, typeof FSRS, getComputedStyle(document.querySelector('header')).display]}})()")
        tjek('offline: appen starter uden net med data, FSRS og styling', klar and r == [v_data, 1, False, 'object', 'flex'], (klar, r))
        await ctx.close(); srv.shutdown()

        await b.close()

    for navn, ok, info in kontrol:
        print(('OK    ' if ok else 'FEJL  ') + navn + ('' if ok else f'  {info}'))
    for f in fejl:
        print('JS-FEJL ' + f)
    if fejl or not all(ok for _, ok, _ in kontrol):
        sys.exit(1)
    print('OK')


async def med_tidsgraense():
    try:
        await asyncio.wait_for(main(), timeout=SAMLET_S)
    except (asyncio.TimeoutError, TimeoutError):
        for navn, ok, info in kontrol:
            print(('OK    ' if ok else 'FEJL  ') + navn + ('' if ok else f'  {info}'))
        print(f'FEJL  røgtesten blev stoppet efter {SAMLET_S} s. Sidste færdige tjek: {kontrol[-1][0] if kontrol else "intet"}.')
        sys.exit(1)


asyncio.run(med_tidsgraense())
