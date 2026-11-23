"""Røgtest af Elskolen i headless Chromium.

Kør fra repoets rod:  python tests/smoke.py
Filerne serveres fra disken under http://app.test/. Alpine, ts-fsrs og KaTeX serveres fra node_modules/
(se CLAUDE.md for, hvordan de hentes). Kræver Python-pakken playwright.
"""
import asyncio, functools, http.server, json, math, os, re, sys, threading
from pathlib import Path
from playwright.async_api import async_playwright

ROD = Path(__file__).resolve().parent.parent
TYPER = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'}
LIB = {'alpinejs': ROD / 'node_modules/alpinejs/dist/cdn.min.js', 'ts-fsrs': ROD / 'node_modules/ts-fsrs/dist/index.umd.js',
       'katex.min.js': ROD / 'node_modules/katex/katex.min.js', 'katex.min.css': ROD / 'node_modules/katex/katex.min.css'}
URL = 'http://app.test/'
TRIN_MS = int(os.environ.get('SMOKE_TRIN_MS', '15000'))
SKEMA = 3   # skal følge SCHEMA i js/data.js
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

        # 4. Startkort: alle pakker i STARTPAKKER
        pakker = re.findall(r"fil:'(indhold/start-[^']+\.json)'", (ROD / 'js/kort.js').read_text(encoding='utf-8'))
        tjek('startpakkerne findes og står i SKAL i sw.js', pakker and all((ROD / f).exists() and Path(f).stem.replace('start-', '') in sw for f in pakker), pakker)
        alle_id = []
        for i, f in enumerate(pakker):
            d = json.loads((ROD / f).read_text(encoding='utf-8'))['kort']
            alle_id += [k['id'] for k in d]
            ugyldige = [k.get('id') for k in d if k.get('emne') not in ('mat', 'dim', 'saer', 'love', 'erhv', 'arb', 'andet') or k.get('type') not in ('fakta', 'regel', 'formel') or not k.get('front') or not k.get('bag') or set(k.get('kilde', {})) != {'dok', 'afsnit', 'udgave', 'gyldigFra'}]
            tjek('startkort i %s har gyldigt emne, type, tekst og kilde' % f, not ugyldige, ugyldige)
            n = len(d)
            foer = await pg.evaluate(f"{A}.kort.length")
            await pg.evaluate(f"{A}.indlaesStartpakke({A}.startpakker[{i}])"); await pg.wait_for_timeout(200)
            await pg.evaluate(f"{A}.indlaesStartpakke({A}.startpakker[{i}])"); await pg.wait_for_timeout(200)
            r = await pg.evaluate(f"{A}.kort.length")
            tjek('startkort fra %s indlæses én gang uden dubletter' % f, r - foer == n, (r, foer, n))
        tjek("startkortenes id'er er unikke på tværs af pakkerne", len(alle_id) == len(set(alle_id)), len(alle_id))
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
        tjek('opgradering fra skema 1 bevarer kortene, tilføjer resultater og tager backup', r == [['Gammelt kort'], 1, True, SKEMA], r)
        await ctx.close()

        # 6c. Opgradering fra skema 2: en gammel prøverække (art 'case', ref 'proeve') bliver art 'proeve', resten er uændret, og der tages backup
        ctx = await b.new_context(viewport={'width': 1200, 'height': 900}, service_workers='block'); ctx.set_default_timeout(TRIN_MS)
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: fejl.append(str(e)))
        await pg.goto(URL + 'findes-ikke')
        await pg.evaluate("""new Promise(ok => { const r = indexedDB.open('elskole', 2);
          r.onupgradeneeded = () => { for (const s of ['kort', 'tilstand', 'log', 'resultater']) r.result.createObjectStore(s, { keyPath:'id' }); };
          r.onsuccess = () => { const tx = r.result.transaction(['kort', 'resultater'], 'readwrite');
            tx.objectStore('kort').put({ id:'gl2', type:'fakta', emne:'mat', front:'Kort fra skema 2', bag:'b', tags:[], kilde:{}, oprettet:'2026-11-01T00:00:00Z', rettet:'2026-11-01T00:00:00Z' });
            tx.objectStore('resultater').put({ id:'p1', art:'case', ref:'proeve', emne:'andet', tid:'2026-11-20T10:00:00Z', korrekt:true, score:0.8, fejltype:'', varighedMs:5000, data:{ karakter:'10' } });
            tx.objectStore('resultater').put({ id:'c1', art:'case', ref:'case-x', emne:'mat', tid:'2026-11-20T11:00:00Z', korrekt:false, score:0, fejltype:'', varighedMs:1, data:{} });
            tx.oncomplete = () => { r.result.close(); localStorage.setItem('elskole.meta', JSON.stringify({ schema:2 })); ok(); }; }; })""")
        await pg.goto(URL); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"(async()=>{{const a={A}; const p=a.resultater.find(x=>x.id==='p1'), c=a.resultater.find(x=>x.id==='c1'); const rå = await new Promise(ok => {{ const q = indexedDB.open('elskole'); q.onsuccess = () => {{ const g = q.result.transaction('resultater').objectStore('resultater').get('p1'); g.onsuccess = () => {{ q.result.close(); ok(g.result); }}; }}; }}); return [p.art, p.ref, p.score, p.data.karakter, c.art, rå.art, !!localStorage.getItem('elskole.backup'), JSON.parse(localStorage.getItem('elskole.meta')).schema]}})()")
        tjek('opgradering fra skema 2 omskriver prøverækker til art proeve og tager backup', r == ['proeve', 'proeve', 0.8, '10', 'case', 'proeve', True, SKEMA], r)
        await ctx.close()

        # ===== FASE 2: OPGAVER (js/opgaver.js) =====
        # Uafhængig beregning af alle svar og typiske fejl ud fra opgavens rå tal (inddata), pr. generator.
        RHO, S3 = 0.0225, math.sqrt(3)
        K = {'B': 5, 'C': 10, 'D': 20}
        STD = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]

        def opg_fac(rod):
            """El-oversigtsappens tabeller (hvis repoet ligger ved siden af): (IZT, K_TEMP luft, bundtet k pr. antal kredse)."""
            kand = [os.environ.get('EL_OVERSIGT', ''), str(rod.parents[3] / 'rehhoff.github.io'), str(rod.parent / 'rehhoff.github.io')]
            for k in kand:
                f = Path(k) / 'js' / 'data.js' if k else None
                if f and f.is_file():
                    t = f.read_text(encoding='utf-8')
                    def blok(navn):
                        a = t.index('const ' + navn + ' = {'); b = t.index('\n};', a) + 2
                        return json.loads(re.sub(r'([{,]\s*)([A-Za-z0-9]+):', r'\1"\2":', t[a + len('const ' + navn + ' = '):b]))
                    lag = re.search(r"bundt: \{ navn:'[^']*', k:\[([^\]]*)\]", t).group(1)
                    return blok('IZT'), blok('K_TEMP')['luft'], [float(x) for x in lag.split(',')]
            return None

        def opg_py(g, d):
            """Giver ({svar-id: værdi}, [(fejltype, svar-id, værdi)]) uden at bruge appens kode."""
            s, f = {}, []
            if g == 'ohm':
                sk = 1000 if d['kilo'] else 1
                if d['variant'] == 'I':
                    s['i'] = d['U'] / d['R'] * sk; f += [('byttet-formel', 'i', d['R'] / d['U'] * sk), ('enhed-1000', 'i', s['i'] * 1000), ('enhed-1000', 'i', s['i'] / 1000)]
                elif d['variant'] == 'U':
                    s['u'] = d['R'] * d['I']; f += [('byttet-formel', 'u', d['I'] * sk / (d['R'] / sk)), ('enhed-1000', 'u', s['u'] * 1000), ('enhed-1000', 'u', s['u'] / 1000)]
                else:
                    s['r'] = d['U'] / d['I'] / sk; f += [('byttet-formel', 'r', d['I'] * sk / d['U']), ('enhed-1000', 'r', s['r'] * 1000), ('enhed-1000', 'r', s['r'] / 1000)]
            elif g == 'effekt1':
                c = d['cos']
                if d['variant'] == 'I':
                    P = d['P'] * 1000; s['i'] = P / (230 * c)
                    f += [('glemt-cosphi', 'i', P / 230), ('cosphi-vendt', 'i', P * c / 230), ('enhed-1000', 'i', s['i'] / 1000), ('forkert-spaending', 'i', P / (400 * c))]
                else:
                    I = d['I']; s['p'] = 230 * I * c / 1000
                    f += [('glemt-cosphi', 'p', 230 * I / 1000), ('cosphi-vendt', 'p', 230 * I / c / 1000), ('enhed-1000', 'p', s['p'] * 1000), ('forkert-spaending', 'p', 400 * I * c / 1000)]
            elif g == 'effekt3':
                c = d['cos']
                if d['variant'] == 'PI':
                    P = d['P'] * 1000; s['i'] = P / (S3 * 400 * c); s['s'] = d['P'] / c
                    f += [('glemt-sqrt3', 'i', P / (400 * c)), ('sqrt3-forkert', 'i', P / (3 * 400 * c)), ('sqrt3-forkert', 'i', P * S3 / (400 * c)), ('glemt-cosphi', 'i', P / (S3 * 400)),
                          ('cosphi-vendt', 'i', P * c / (S3 * 400)), ('forkert-spaending', 'i', P / (S3 * 230 * c)), ('enhed-1000', 'i', s['i'] / 1000),
                          ('kva-kw', 's', d['P']), ('cosphi-vendt', 's', d['P'] * c)]
                else:
                    S = d['S']; s['p'] = S * c; s['i'] = S * 1000 / (S3 * 400)
                    f += [('kva-kw', 'p', S), ('cosphi-vendt', 'p', S / c), ('kva-kw', 'i', S * c * 1000 / (S3 * 400)), ('glemt-sqrt3', 'i', S * 1000 / 400), ('enhed-1000', 'i', s['i'] / 1000)]
            elif g == 'ledermodstand':
                L, A = d['L'], d['A']; s['r1'] = RHO * L / A; s['r2'] = 2 * s['r1']
                f += [('mm2-radius', 'r1', RHO * L / (math.pi * A ** 2)), ('faktor2-for-meget', 'r1', s['r2']), ('glemt-faktor2', 'r2', s['r1']), ('mm2-radius', 'r2', 2 * RHO * L / (math.pi * A ** 2))]
            elif g == 'du1':
                L, A, I = d['L'], d['A'], d['I']; s['du'] = 2 * RHO * L * I / A; s['pct'] = s['du'] / 230 * 100
                for sv, n in (('du', 1), ('pct', 100 / 230)):
                    f += [('glemt-faktor2', sv, RHO * L * I / A * n), ('sqrt3-i-1faset', sv, S3 * RHO * L * I / A * n), ('mm2-radius', sv, 2 * RHO * L * I / (math.pi * A ** 2) * n)]
                f += [('forkert-spaending', 'pct', s['du'] / 400 * 100)]
            elif g == 'du3':
                L, A, I = d['L'], d['A'], d['I']; s['du'] = S3 * RHO * L * I / A; s['pct'] = s['du'] / 400 * 100
                for sv, n in (('du', 1), ('pct', 100 / 400)):
                    f += [('faktor2-for-meget', sv, 2 * RHO * L * I / A * n), ('glemt-sqrt3', sv, RHO * L * I / A * n), ('mm2-radius', sv, S3 * RHO * L * I / (math.pi * A ** 2) * n)]
                f += [('forkert-spaending', 'pct', s['du'] / 230 * 100)]
            elif g == 'iz':
                if opg_tabeller:
                    IZT, KT, KS = opg_tabeller
                    TV = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120]
                    assert TV[d['i']] == d['A'], 'tværsnit'
                    It = IZT[d['iso']][str(d['n'])][d['metode']][d['i']]; kt = KT[d['iso']][str(d['temp'])]; ks = KS[[1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 20].index(d['kredse'])]
                    assert (It, kt, ks) == (d['It'], d['kt'], d['ks']), ('tabel', (It, kt, ks), (d['It'], d['kt'], d['ks']))
                It, kt, ks = d['It'], d['kt'], d['ks']
                std = lambda z: max([x for x in STD if x <= z] or [0])
                s['iz'] = round(It * kt * ks * 10) / 10; s['in'] = std(s['iz'])
                for kode, z in (('glemt-ktemp', It * ks), ('glemt-ksamlet', It * kt), ('divideret-med-k', It / (kt * ks))):
                    f += [(kode, 'iz', z), (kode, 'in', std(z))]
                nxt = [x for x in STD if x > s['iz']]
                if nxt: f += [('forkert-sikring', 'in', nxt[0])]
                f += [('forkert-sikring', 'in', s['iz'])]
            elif g == 'zs':
                In, k = d['In'], K[d['kurve']]; s['ia'] = k * In; s['zs'] = 2 / 3 * 230 / s['ia']
                for x in 'BCD':
                    if x != d['kurve']: f += [('forkert-kurve', 'ia', K[x] * In), ('forkert-kurve', 'zs', 2 / 3 * 230 / (K[x] * In))]
                f += [('glemt-23', 'zs', 230 / s['ia']), ('forkert-spaending', 'zs', 2 / 3 * 400 / s['ia'])]
            elif g == 'ik':
                m = {'PVC': 1.2, 'XLPE': 1.28}[d['iso']]; ma = {'PVC': 1.28, 'XLPE': 1.2}[d['iso']]; assert m == d['m']
                r0 = RHO * d['L'] / d['A']; R = r0 * m; Ze = d['Ze']; s['ik'] = 0.95 * 230 / (Ze + 2 * R); s['ia'] = K[d['kurve']] * d['In']
                f += [('glemt-pe', 'ik', 0.95 * 230 / (Ze + R)), ('glemt-ze', 'ik', 0.95 * 230 / (2 * R)), ('glemt-tillaeg', 'ik', 0.95 * 230 / (Ze + 2 * r0)),
                      ('forkert-tillaeg', 'ik', 0.95 * 230 / (Ze + 2 * r0 * ma)), ('glemt-cmin', 'ik', 230 / (Ze + 2 * R)), ('forkert-spaending', 'ik', 0.95 * 400 / (Ze + 2 * R))]
                f += [('forkert-kurve', 'ia', K[x] * d['In']) for x in 'BCD' if x != d['kurve']]
            elif g == 'kompensering':
                P, c1, c2 = d['P'], d['c1'], d['c2']
                t = lambda c: math.sqrt(1 - c * c) / c
                s['qc'] = P * (t(c1) - t(c2)); s['ic'] = s['qc'] * 1000 / (S3 * 400)
                f += [('cos-for-tan', 'qc', P * (c2 - c1)), ('kva-kw', 'qc', P / c1 * (t(c1) - t(c2))), ('glemt-maalcos', 'qc', P * t(c1)),
                      ('glemt-sqrt3', 'ic', s['qc'] * 1000 / 400), ('enhed-1000', 'ic', s['ic'] / 1000)]
            return s, f

        def naer(a, b, tol=1e-9): return abs(a - b) <= tol * max(1, abs(b))

        opg_tabeller = opg_fac(ROD)
        ctx, pg = await ny_side(b)
        await pg.click('#tab-opgaver')
        ids = await pg.evaluate("OPG_GENERATORER.map(g => g.id)")
        meta = await pg.evaluate("OPG_GENERATORER.map(g => [g.id, g.navn, g.emne, g.niveau])")
        tjek('mindst 10 generatorer med id, navn, emne og niveau 1–3', len(ids) >= 10 and len(set(ids)) == len(ids) and all(m[2] in ['mat', 'dim', 'saer', 'love', 'erhv', 'arb', 'andet'] and m[3] in (1, 2, 3) and m[1] for m in meta), meta)
        tjek('fanen Opgaver vises, når opgStart findes', await pg.evaluate("!!document.querySelector('#tab-opgaver') && !!document.querySelector('#v-opgaver')"))
        # 300 seeds pr. generator: gyldige tal, KaTeX uden fejl, facit og typiske fejl stemmer med Python
        data = await pg.evaluate("""(() => { const ud = {}, a = Alpine.$data(document.querySelector('[x-data]'));
            for (const g of OPG_GENERATORER) { ud[g.id] = [];
              for (let seed = 1; seed <= 300; seed++) { const o = opgLavOpgave(g, seed * 7919);
                const html = [o.tekst, ...o.trin, ...o.typiskeFejl.map(f => f.forklaring), ...o.svar.map(s => s.navn)].map(t => a.vis(t)).join('');
                ud[g.id].push({ seed:seed * 7919, svar:o.svar, fejl:o.typiskeFejl, inddata:o.inddata, trin:o.trin.length, fejlHtml:/katex-error/.test(html), udenKatex:!/katex/.test(a.vis(o.tekst)), tekstDollar:(o.tekst.match(/\\$/g) || []).length % 2 }); } }
            return ud; })()""")
        daarlige, fejlkoder, antal_fejl = [], set(), {}
        for g, liste in data.items():
            for o in liste:
                try:
                    s, f = opg_py(g, o['inddata'])
                    if o['fejlHtml'] or o['udenKatex'] or o['tekstDollar'] or o['trin'] < 2: raise AssertionError('katex/tekst/trin')
                    if sorted(x['id'] for x in o['svar']) != sorted(s): raise AssertionError('svar-id')
                    for x in o['svar']:
                        if not (math.isfinite(x['vaerdi']) and x['vaerdi'] > 0 and 0 < x['tol'] < 0.1 and x['navn'] and x['enhed']): raise AssertionError('ugyldigt svar ' + str(x))
                        if not naer(x['vaerdi'], s[x['id']]): raise AssertionError(('facit', x['id'], x['vaerdi'], s[x['id']]))
                    for x in o['fejl']:
                        sv = next(y for y in o['svar'] if y['id'] == x['svar'])
                        if not any(k == x['fejltype'] and i == x['svar'] and naer(x['vaerdi'], v) for k, i, v in f): raise AssertionError(('fejl', x['fejltype'], x['svar'], x['vaerdi']))
                        if abs(x['vaerdi'] - sv['vaerdi']) / sv['vaerdi'] <= 2 * sv['tol'] or not x['forklaring']: raise AssertionError(('fejl ligner facit', x))
                        fejlkoder.add(x['fejltype']); antal_fejl[g] = antal_fejl.get(g, 0) + 1
                except Exception as e:
                    daarlige.append((g, o['seed'], str(e)[:200]))
        tjek('alle generatorer: gyldige tal, KaTeX uden katex-error, facit og typiske fejl stemmer med uafhængig Python-beregning (300 seeds hver)', not daarlige, daarlige[:5])
        tjek('hver generator har typiske fejl, og alle koder er kendte', all(antal_fejl.get(g, 0) > 100 for g in ids) and fejlkoder <= set(await pg.evaluate("Object.keys(OPG_FEJLNAVNE)")), (antal_fejl, fejlkoder))
        tjek('Iz-tabellen er sammenlignet med El-oversigtsappen' if opg_tabeller else 'Iz-tabellen (El-oversigtsappen ligger ikke ved siden af; sæt EL_OVERSIGT for at sammenligne)', True)
        r = await pg.evaluate("(() => OPG_GENERATORER.every(g => JSON.stringify(opgLavOpgave(g, 12345)) === JSON.stringify(opgLavOpgave(g, 12345)) && JSON.stringify(opgLavOpgave(g, 12345)) !== JSON.stringify(opgLavOpgave(g, 54321))))()")
        tjek('samme seed giver samme opgave, andet seed en anden', r)
        # Rigtigt svar godkendes, en typisk fejl genkendes (for alle generatorer, med dansk decimalkomma)
        r = await pg.evaluate("""(() => { const ud = [], dk = v => String(Number(v.toPrecision(4))).replace('.', ',');
            for (const g of OPG_GENERATORER) for (let seed = 1; seed <= 60; seed++) { const o = opgLavOpgave(g, seed * 31337);
              const ret = {}; for (const s of o.svar) ret[s.id] = dk(s.vaerdi);
              const t = opgTjekSvar(o, ret); if (!t.korrekt || t.score !== 1 || t.fejltype) ud.push([g.id, seed, 'rigtigt', JSON.stringify(t)]);
              for (const f of o.typiskeFejl) { const ind = Object.assign({}, ret, { [f.svar]: dk(f.vaerdi) }), t2 = opgTjekSvar(o, ind), tol = o.svar.find(s => s.id === f.svar).tol;
                const mulige = o.typiskeFejl.filter(x => x.svar === f.svar && Math.abs(x.vaerdi - Number(f.vaerdi.toPrecision(4))) <= tol * x.vaerdi).map(x => x.fejltype);
                if (t2.korrekt || !mulige.includes(t2.fejltype) || t2.score >= 1 || !t2.forklaring) ud.push([g.id, seed, f.fejltype, JSON.stringify(t2)]); }
              if (opgTjekSvar(o, Object.assign({}, ret, { [o.svar[0].id]: 'abc' })).gyldig) ud.push([g.id, seed, 'tekst accepteret']); }
            return ud.slice(0, 5); })()""")
        tjek('rigtigt svar godkendes og typisk fejl genkendes for alle generatorer', not r, r)
        r = await pg.evaluate("[opgLaes('1,5'), opgLaes('1.5'), opgLaes(' 1 234,5 '), opgLaes('1.234,5'), opgLaes(''), opgLaes('x'), opgLaes('1,2,3')].map(v => Number.isNaN(v) ? null : v)")
        tjek('dansk decimalkomma læses rigtigt', r == [1.5, 1.5, 1234.5, 1234.5, None, None, None], r)
        await ctx.close()

        # Gennem brugerfladen: opgave, rigtigt svar, typisk fejl, gemte resultater, oversigt og dagens økt
        ctx, pg = await ny_side(b)
        r = await pg.evaluate("document.querySelector('#oev-opg-titel').textContent")
        tjek('Øv-fanen viser Dagens regneopgaver (5) fra start', r == 'Dagens regneopgaver (5)', r)
        await pg.click('#oev-opg-start'); await pg.wait_for_selector('#opg-tekst')
        r = await pg.evaluate(f"[{A}.view, {A}.opgValg, !!{A}.opgAkt, location.hash]")
        tjek('kortet i Øv fører til fanen Opgaver med en blandet opgave', r == ['opgaver', 'blandet', True, '#opgaver'], r)
        await pg.select_option('#opg-valg', 'gen:du1'); await pg.wait_for_selector('#opg-svar-du')
        opg = await pg.evaluate(f"(()=>{{const a={A}; return {{gen:a.opgAkt.gen, seed:a.opgAkt.seed, svar:a.opgAkt.opg.svar}}}})()")
        tjek('valg af generator giver en opgave af den type med KaTeX', opg['gen'] == 'du1' and await pg.evaluate("!!document.querySelector('#opg-tekst .katex') && !document.querySelector('#opg-tekst .katex-error')"), opg['gen'])
        fmt = lambda v: str(float('%.4g' % v)).replace('.', ',')
        for sv in opg['svar']: await pg.fill('#opg-svar-' + sv['id'], fmt(sv['vaerdi']))
        await pg.keyboard.press('Enter'); await pg.wait_for_selector('#opg-feedback'); await pg.wait_for_timeout(100)
        r = await pg.evaluate(f"(()=>{{const a={A}, x=a.resultater[0]; return [a.resultater.length, x.art, x.ref, x.emne, x.korrekt, x.score, x.fejltype, x.data.seed, Object.keys(x.data.svar).join(), x.varighedMs >= 0, document.querySelector('#opg-resultat').textContent, !!document.querySelector('#opg-trin') && document.querySelector('#opg-trin').offsetParent === null]}})()")
        tjek('rigtigt svar giver Rigtigt og gemmes som resultat med seed', r == [1, 'opgave', 'du1', 'dim', True, 1, '', opg['seed'], 'du,pct', True, 'Rigtigt!', True], r)
        await pg.click('#opg-naeste'); await pg.wait_for_function(f"{A}.opgRes === null && {A}.opgAkt.seed !== {opg['seed']}")
        # ny opgave med kendt seed: svar med en typisk fejl
        await pg.evaluate(f"{A}.opgNy('du1', 4242)")
        opg = await pg.evaluate(f"(()=>{{const a={A}; return {{gen:a.opgAkt.gen, seed:a.opgAkt.seed, svar:a.opgAkt.opg.svar, fejl:a.opgAkt.opg.typiskeFejl}}}})()")
        f0 = next(x for x in opg['fejl'] if x['fejltype'] == 'glemt-faktor2' and x['svar'] == 'du')
        await pg.fill('#opg-svar-du', fmt(f0['vaerdi'])); await pg.fill('#opg-svar-pct', fmt(next(s['vaerdi'] for s in opg['svar'] if s['id'] == 'pct')))
        await pg.click('#opg-tjek'); await pg.wait_for_selector('#opg-fejl'); await pg.wait_for_timeout(100)
        r = await pg.evaluate(f"(()=>{{const a={A}, x=a.resultater[a.resultater.length-1]; return [a.resultater.length, x.korrekt, x.score, x.fejltype, x.data.seed, document.querySelector('#opg-resultat').textContent, document.querySelector('#opg-fejl').textContent.includes('faktor 2'), document.querySelector('#opg-trin').offsetParent !== null, document.querySelectorAll('#opg-trin li').length >= 3, !!document.querySelector('#opg-trin .katex'), !document.querySelector('#opg-feedback .katex-error'), document.querySelector('#opg-ok-du').textContent.startsWith('Rigtigt svar:')]}})()")
        tjek('typisk fejl genkendes, trinvis løsning og facit vises, og forsøget gemmes med fejltype', r == [2, False, 0.5, 'glemt-faktor2', 4242, 'Delvist rigtigt', True, True, True, True, True, True], r)
        # oversigt pr. generator
        r = await pg.evaluate(f"(()=>{{const s={A}.opgStat().find(x=>x.id==='du1'); return [s.forsoeg, s.rigtige, s.pct, s.topFejl, document.querySelectorAll('#opg-stat .meter').length]}})()")
        tjek('oversigten viser forsøg, træfsikkerhed og hyppigste fejl pr. generator', r[:3] == [2, 1, 50] and 'Glemt faktor 2' in r[3] and r[4] >= 10, r)
        # dagens økt tæller ned, og resultaterne overlever genindlæsning
        await pg.click('#tab-oev'); await pg.wait_for_timeout(100)
        r = await pg.evaluate("document.querySelector('#oev-opg-titel').textContent")
        tjek('Dagens regneopgaver tæller ned', r == 'Dagens regneopgaver (3)', r)
        await pg.reload(); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await pg.evaluate(f"[{A}.resultater.length, {A}.resultater.every(x => x.art === 'opgave'), {A}.opgDagAntal()]")
        tjek('opgaveresultater er gemt efter genindlæsning', r == [2, True, 3], r)
        # blandet efter svagheder: svag generator vælges oftere end sikker
        await pg.evaluate(f"(async()=>{{const a={A}; for (let i=0;i<10;i++) {{ await a.tilfoejResultat({{art:'opgave', ref:'ohm', emne:'mat', korrekt:true, score:1}}); await a.tilfoejResultat({{art:'opgave', ref:'zs', emne:'dim', korrekt:false, score:0, fejltype:'glemt-23'}}); }} a.opgAkt = null; a.opgValg = 'blandet'}})()")
        r = await pg.evaluate(f"(()=>{{const a={A}, t={{}}; for (let i=0;i<1500;i++) {{ const g=a.opgVaelg().id; t[g]=(t[g]||0)+1; }} return [t.zs, t.ohm, a.opgVaegt('zs') > a.opgVaegt('ohm')]}})()")
        tjek('blandet efter svagheder vælger den svage generator oftere end den sikre', r[2] and r[0] > 2 * r[1], r)
        await pg.evaluate(f"{A}.opgSkift('emne:mat')")
        r = await pg.evaluate(f"(()=>{{const a={A}, t=new Set(); for (let i=0;i<60;i++) t.add(a.opgVaelg().emne); return [...t]}})()")
        tjek('valg af emne giver kun opgaver i det emne', r == ['mat'], r)
        await ctx.close()

        # Mobil: ingen vandret rulning i fanen Opgaver, også med løsning og fejl
        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.gaaTil('opgaver')"); await pg.wait_for_selector('#opg-tekst')
        bredder = []
        for gid in ids:
            await pg.evaluate(f"{A}.opgNy('{gid}', 777)"); await pg.wait_for_timeout(30)
            for sv in await pg.evaluate(f"{A}.opgAkt.opg.svar.map(s=>s.id)"): await pg.fill('#opg-svar-' + sv, '1')
            await pg.click('#opg-tjek'); await pg.wait_for_selector('#opg-trin'); await pg.wait_for_timeout(30)
            bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        tjek('mobil 375 px: ingen vandret rulning i fanen Opgaver', all(x <= 375 for x in bredder), bredder)
        await ctx.close()

        # ===== FASE 4: CASES (js/cases.js) =====
        # Casefilerne og regelbiblioteket: alle henvisninger findes, alle trin kan nås og alle veje ender i slut
        cjs = (ROD / 'js/cases.js').read_text(encoding='utf-8')
        cfiler = ['indhold/cases/%s.json' % n for n in re.findall(r"'([^']+)'", re.search(r"CASE_FILER = \[([^\]]*)\]", cjs).group(1))]
        regler = json.loads((ROD / 'indhold/regler.json').read_text(encoding='utf-8'))['regler']
        rid = {r['id'] for r in regler}
        prob = [] if len(rid) == len(regler) else ['dubletter i regel-id']
        rfelter = {'id', 'titel', 'emne', 'dok', 'afsnit', 'udgave', 'gyldigFra', 'resume', 'tags', 'url', 'verificeret'}
        for r in regler:
            if rfelter - set(r): prob.append((r.get('id'), 'mangler', sorted(rfelter - set(r))))
            if not isinstance(r.get('verificeret'), bool): prob.append((r.get('id'), 'verificeret skal være true/false'))
        cases = []
        for f in cfiler:
            c = json.loads((ROD / f).read_text(encoding='utf-8')); cases.append(c); T = c['trin']; ud = {}
            if c.get('emne') not in ('mat', 'dim', 'saer', 'love', 'erhv', 'arb', 'andet'): prob.append((f, 'ukendt emne'))
            if c['start'] not in T: prob.append((f, 'start findes ikke'))
            for tid, t in T.items():
                typ = t.get('type')
                if typ == 'valg':
                    ud[tid] = [s.get('til') for s in t['svar']]
                    prob += [(f, tid, i, 'svar mangler felt') for i, s in enumerate(t['svar']) if not (s.get('tekst') and 'point' in s and s.get('feedback'))]
                elif typ == 'tal':
                    ud[tid] = [t.get('rigtigTil') or t.get('til'), t.get('forkertTil') or t.get('til')]
                    if not isinstance(t.get('facit'), (int, float)) or not isinstance(t.get('tol'), (int, float)): prob.append((f, tid, 'facit/tol'))
                    prob += [(f, tid, 'typisk fejl ligger inden for facit') for x in t.get('typiske', []) if abs(x['vaerdi'] - t['facit']) <= t['tol']]
                elif typ == 'flere':
                    ud[tid] = [t.get('til')]
                    if not any(m.get('rigtig') for m in t['muligheder']): prob.append((f, tid, 'ingen rigtige'))
                elif typ == 'slut': ud[tid] = []
                else: prob.append((f, tid, 'ukendt type', typ))
                prob += [(f, tid, 'til findes ikke', u) for u in ud.get(tid, []) if u not in T]
                prob += [(f, tid, 'regel findes ikke', r) for r in t.get('regler', []) if r not in rid]
            set_, kø = set(), [c['start']]
            while kø:
                x = kø.pop()
                if x in set_ or x not in T: continue
                set_.add(x); kø += ud.get(x, [])
            if set(T) - set_: prob.append((f, 'trin kan ikke nås', sorted(set(T) - set_)))
            slut = {x for x in T if T[x].get('type') == 'slut'}; naar = set(slut); ændret = True
            while ændret:
                ændret = False
                for x in T:
                    if x not in naar and any(u in naar for u in ud.get(x, [])): naar.add(x); ændret = True
            if set(T) - naar: prob.append((f, 'trin uden vej til slut', sorted(set(T) - naar)))
        swtxt = (ROD / 'sw.js').read_text(encoding='utf-8')
        prob += [(f, 'mangler i SKAL i sw.js') for f in ['indhold/regler.json'] + cfiler if Path(f).stem not in swtxt]
        tjek('casefiler og regelbibliotek er gyldige (til, regler, nåbarhed, slut, sw.js)', not prob and len(cases) == 5, prob)
        tjek('alle regler er markeret som ikke kontrolleret', all(r['verificeret'] is False for r in regler), [r['id'] for r in regler if r['verificeret'] is not False])

        ctx, pg = await ny_side(b)
        await pg.click('#tab-cases')
        await pg.wait_for_function(f"{A}.caseListe.length === {len(cases)} && {A}.caseRegler.length === {len(regler)}")
        ugyldig = await pg.evaluate(f"""(()=>{{const a={A}, ud=[];
          const gaa=(o,sti)=>{{ if (typeof o==='string') {{ if (/katex-error/.test(a.vis(o))) ud.push(sti); }} else if (o && typeof o==='object') for (const k in o) gaa(o[k], sti+'.'+k); }};
          a.caseListe.forEach(c=>gaa(c,c.id)); a.caseRegler.forEach(r=>gaa(r,r.id)); return ud}})()""")
        tjek('ingen katex-error i cases og regler', not ugyldig, ugyldig)

        async def spil(cid, rigtigt):
            await pg.click(f'#case-start-{cid}'); await pg.wait_for_selector('#case-trin')
            for _ in range(60):
                t = await pg.evaluate(f"(()=>{{const a={A}; return a.caseAktiv.slut ? null : JSON.parse(JSON.stringify(a.caseTrin()))}})()")
                if t is None: break
                if t['type'] == 'valg':
                    pts = [s['point'] for s in t['svar']]
                    await pg.click('#case-svar-%d' % (pts.index(max(pts)) if rigtigt else pts.index(min(pts))))
                elif t['type'] == 'tal':
                    v = t['facit'] if rigtigt else (t.get('typiske') or [{'vaerdi': t['facit'] * 3 + 1}])[0]['vaerdi']
                    await pg.fill('#case-tal', str(v).replace('.', ',')); await pg.click('#case-tjek')
                elif t['type'] == 'flere':
                    for i, m in enumerate(t['muligheder']):
                        if bool(m['rigtig']) == rigtigt: await pg.check(f'#case-flere-{i}')
                    await pg.click('#case-tjek')
                await pg.click('#case-videre')
            await pg.wait_for_selector('#case-slut'); await pg.wait_for_timeout(100)
            return await pg.evaluate(f"(()=>{{const a={A}, r=a.resultater[a.resultater.length-1]; return [r.art, r.ref, r.emne, r.korrekt, r.score, r.fejltype, r.data.vej.map(v=>v.t), document.querySelectorAll('.case-gennemgang').length, document.querySelector('#case-score').textContent]}})()")

        # Regel-dialog fra et trin
        await pg.click('#case-start-case-elbil-11kw'); await pg.click('#case-trin button.tag'); await pg.wait_for_selector('#case-regel-dialog')
        r = await pg.inner_text('#case-regel-dialog')
        tjek('regel åbnes fra et trin og viser "Ikke kontrolleret mod kilden"', 'Ikke kontrolleret mod kilden' in r and 'DS/HD 60364-7-722' in r, r[:200])
        await pg.keyboard.press('Escape'); await pg.click('#case-luk'); await pg.click('#bekraeft-ja')
        r = await pg.evaluate(f"[{A}.caseAktiv, {A}.resultater.length]")
        tjek('afbrudt case gemmer intet resultat', r == [None, 0], r)

        alle = []
        for c in cases:
            r = await spil(c['id'], True); alle.append(r)
            await pg.click('#case-luk')
        tjek('alle 5 cases kan gennemføres med alle rigtige og giver score 1', all(x[0] == 'case' and x[3] is True and x[4] == 1 and x[5] == '' and x[7] == len(x[6]) and x[8].strip() == '100 %' for x in alle)
             and [x[1] for x in alle] == [c['id'] for c in cases], alle)
        r = await spil('case-elbil-11kw', False)
        tjek('forkerte svar i elbil-casen giver konsekvenstrin, score 0 og fejltype', r[3] is False and r[4] == 0 and r[5] == 'glemt-sqrt3' and 't2k' in r[6], r)
        await pg.click('#case-luk')
        r = await pg.evaluate(f"(()=>{{const a={A}; return [a.caseForsoeg('case-elbil-11kw').length, a.caseBedste('case-elbil-11kw'), document.querySelector('#case-liste').textContent.includes('2 forsøg · bedste 100 %')]}})()")
        tjek('listen viser antal forsøg og bedste score pr. case', r == [2, 1, True], r)

        # Regelbibliotek: søgning og "Lav kort"
        await pg.click('#case-vis-regler'); await pg.fill('#case-regel-soeg', '7-722'); await pg.wait_for_timeout(100)
        n722 = len([x for x in regler if '7-722' in x['dok']])
        vist = await pg.evaluate("[document.querySelectorAll('.case-regel').length, [...document.querySelectorAll('.case-regel')].every(e => e.textContent.includes('Ikke kontrolleret mod kilden'))]")
        tjek('søgning i regelbiblioteket og mærket "ikke kontrolleret"', vist == [n722, True] and n722 > 0, (vist, n722))
        foer = await pg.evaluate(f"{A}.kort.length")
        await pg.click('.case-lav-kort'); await pg.wait_for_timeout(150)
        await pg.evaluate(f"{A}.caseLavKort({A}.caseReglerListe()[0])"); await pg.wait_for_timeout(150)
        r = await pg.evaluate(f"(()=>{{const a={A}, k=a.kort.filter(k=>k.oprindelse.startsWith('regel:')); return [a.kort.length, k.length, k[0] && k[0].type, k[0] && k[0].emne, k[0] && k[0].kilde.dok, k[0] && /katex-error/.test(a.vis(k[0].front)+a.vis(k[0].bag)), document.querySelector('.case-lav-kort').disabled]}})()")
        tjek('"Lav kort" opretter ét regelkort med kilde og emne', r == [foer + 1, 1, 'regel', 'saer', 'DS/HD 60364-7-722', False, True], r)
        await ctx.close()

        # Mobil: Cases-fanen uden vandret rulning
        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.gaaTil('cases')"); await pg.wait_for_function(f"{A}.caseListe.length === {len(cases)}")
        bredder = [await pg.evaluate("document.documentElement.scrollWidth")]
        await pg.click('#case-start-case-elbil-11kw'); await pg.wait_for_timeout(100); bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.evaluate(f"{A}.caseVis='regler'"); await pg.wait_for_timeout(100); bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        tjek('mobil 375 px: Cases-fanen uden vandret rulning', all(x <= 375 for x in bredder), bredder)
        await ctx.close()

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

        # ===== FASE 3: KOMPETENCE (js/kompetence.js) =====
        ctx, pg = await ny_side(b)
        r = await pg.evaluate("""(()=>{const nu = Date.now(), dag = 86400000, iso = d => new Date(nu - d * dag).toISOString();
          return [Math.round(kompHuskSandsynlighed({ state:2, stability:10, last_review:iso(10) }, nu) * 1000) / 1000,
            kompHuskSandsynlighed({ state:0, stability:10, last_review:iso(1) }, nu), kompHuskSandsynlighed(undefined, nu),
            kompForsoegVaerdi([{ score:0 }, { score:1 }]) > 0.5, kompForsoegVaerdi([]), kompNiveau(0.9).navn, kompNiveau(0.5).navn, kompNiveau(0.1).navn, kompNiveau(null)]})()""")
        tjek('kompetence: hukommelse 90 % ved stabilitet, nye kort 0, nyeste forsøg vægter mest, niveauer', r == [0.9, 0, 0, True, None, 'Stærk', 'Under opbygning', 'Svag', None], r)
        r = await pg.evaluate(f"{A}.kompTrae().map(e => [e.id, e.beh, e.delemner.length]).join('|')")
        tjek('kompetence: uden data har alle emner "ingen data"', r == 'mat,,6|dim,,6|saer,,4|love,,0|erhv,,0|arb,,0|andet,,0', r)

        # Syntetiske data: to matematikkort (ét set, ét nyt) og tre rigtige Ohm-opgaver
        await pg.evaluate("""(async()=>{const a = Alpine.$data(document.querySelector('[x-data]')), nu = Date.now(), dag = 86400000, iso = d => new Date(nu - d * dag).toISOString();
          await a.gemKort([nytKort({ id:'k-a', emne:'mat', tags:['ohm'], front:'a', bag:'a' }), nytKort({ id:'k-b', emne:'mat', tags:['ohm'], front:'b', bag:'b' }), nytKort({ id:'k-c', emne:'mat', tags:['ukendt'], front:'c', bag:'c' })]);
          await a.gemTilst(normTilstand({ id:'k-a', state:2, stability:10, reps:3, last_review:iso(0) }));
          const r = (art, ref, emne, score, fejltype, dage) => ({ art, ref, emne, korrekt:!fejltype, score, fejltype, tid:iso(dage) });
          await a.tilfoejResultat([r('opgave', 'ohm', 'mat', 1, '', 3), r('opgave', 'ohm', 'mat', 1, '', 2), r('opgave', 'ohm', 'mat', 1, '', 1),
            r('opgave', 'effekt3', 'mat', 0, 'glemt-sqrt3', 5), r('opgave', 'effekt3', 'mat', 0, 'glemt-sqrt3', 4), r('opgave', 'effekt3', 'mat', 0, 'glemt-sqrt3', 3), r('opgave', 'effekt3', 'mat', 0, 'glemt-sqrt3', 40),
            r('case', 'case-badevaerelse', 'saer', 0.4, 'rcd-type-ac', 2), r('fejlfinding', 'afbrudt-pe', 'dim', 0, 'ff-type:afbrudt-pe>afbrudt-n', 1)]);})()""")
        r = await pg.evaluate("""(()=>{const a = Alpine.$data(document.querySelector('[x-data]')), t = a.kompTrae(), mat = t.find(e => e.id === 'mat'), ohm = mat.delemner.find(d => d.id === 'ohm'), saer = t.find(e => e.id === 'saer');
          const r2 = x => Math.round(x * 100) / 100;
          return [r2(mat.kilder.kort.v), mat.kilder.kort.sete, mat.kilder.kort.n, mat.kilder.opgave.n, r2(ohm.kilder.kort.v), ohm.kilder.kort.n, r2(ohm.kilder.opgave.v), ohm.kilder.opgave.n,
            r2(ohm.beh), ohm.niveau.navn, mat.delemner.some(d => d.id === 'oevrigt' && d.kilder.kort.n === 1), saer.delemner.find(d => d.id === 'bad').kilder.case.n, saer.beh != null]})()""")
        tjek('kompetence: beherskelse samler kort og opgaver pr. emne og delemne (også øvrige kort)', r == [0.33, 1, 3, 7, 0.5, 2, 1, 3, 0.86, 'Stærk', True, 1, True], r)
        r = await pg.evaluate("""(()=>{const a = Alpine.$data(document.querySelector('[x-data]')), l = a.kompFejlLog(), s = l.find(x => x.kode === 'glemt-sqrt3');
          a.kompPeriode = '30'; const l30 = a.kompFejlLog().find(x => x.kode === 'glemt-sqrt3'); a.kompPeriode = 'alt'; const lAlt = a.kompFejlLog().find(x => x.kode === 'glemt-sqrt3'); a.kompPeriode = '90';
          a.kompArtFilter = 'case'; const kun = a.kompFejlLog().map(x => x.kode); a.kompArtFilter = '';
          return [l.length, s.antal, l30.antal, l30.forrige, l30.tendens, lAlt.antal, s.gens.includes('effekt3'), s.navn, l.find(x => x.art === 'case').caseId, l.find(x => x.art === 'fejlfinding').navn.includes('Afbrudt PE'), kun.join(), l[0].kode, a.kompTotalFejl(), s.uger.length]})()""")
        tjek('kompetence: fejllog grupperer, tæller pr. periode, viser tendens og finder opgavetype', r == [3, 4, 3, 1, 'op', 4, True, 'Glemt √3', 'case-badevaerelse', True, 'rcd-type-ac', 'glemt-sqrt3', 6, 8], r)
        r = await pg.evaluate("""(()=>{const m = {}; for (const g of OPG_GENERATORER) for (const f of Alpine.$data(document.querySelector('[x-data]')).kompGenForKode('glemt-ktemp')) m[f] = 1;
          const a = Alpine.$data(document.querySelector('[x-data]')); const alle = Object.keys(OPG_FEJLNAVNE).filter(k => !a.kompGenForKode(k).length);
          return [Object.keys(m).join(), alle]})()""")
        tjek('kompetence: alle 25 fejlkoder fra fase 2 kan føres tilbage til en generator', r == ['iz', []], r)

        await pg.click('#tab-kompetence'); await pg.wait_for_selector('#v-kompetence #komp-trae')
        r = await pg.evaluate("[document.querySelector('#komp-emne-mat .komp-pct').textContent, document.querySelectorAll('.komp-fejl-raekke').length, document.querySelector('#komp-svageste') != null]")
        tjek('kompetence: fanen viser træ og fejllog', r[0] != '–' and r[1] == 3 and r[2], r)
        await pg.click('#komp-vis-mat'); await pg.wait_for_selector('#komp-del-mat-ohm', state='visible')
        await pg.select_option('#komp-art', 'opgave'); await pg.wait_for_timeout(100)
        r = await pg.evaluate("document.querySelectorAll('.komp-fejl-raekke').length")
        tjek('kompetence: filter på art virker', r == 1, r)
        await pg.click('.komp-fejl-raekke button:has-text("Træn:")'); await pg.wait_for_selector('#v-opgaver #opg-kort')
        r = await pg.evaluate(f"[{A}.view, {A}.opgAkt.gen]")
        tjek('kompetence: "Træn" åbner den opgavetype, der træner fejlen', r == ['opgaver', 'effekt3'] or (r[0] == 'opgaver' and r[1] in ('effekt3', 'effekt1')), r)
        await pg.click('#tab-kompetence'); await pg.select_option('#komp-art', 'fejlfinding'); await pg.click('.komp-fejl-raekke button:has-text("Træn fejlfinding")')
        await pg.wait_for_selector('#v-fejlfinding #ff-diagram svg')
        r = await pg.evaluate(f"[{A}.view, {A}.ffScen.fejl.type]")
        tjek('kompetence: fejl i fejlfinding træner den rigtige fejltype', r == ['fejlfinding', 'afbrudt-pe'], r)
        await ctx.close()

        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.tilfoejResultat({{ art:'opgave', ref:'effekt3', emne:'mat', score:0, fejltype:'glemt-sqrt3' }})")
        await pg.evaluate(f"{A}.gaaTil('kompetence')"); await pg.wait_for_selector('#komp-fejl .komp-fejl-raekke'); await pg.click('#komp-vis-dim'); await pg.wait_for_timeout(100)
        r = await pg.evaluate("document.documentElement.scrollWidth")
        tjek('kompetence: mobil 375 px uden vandret rulning', r <= 375, r)
        await ctx.close()


        # ===== FASE 6: PRØVE OG KOBLING TIL EL-OVERSIGTEN (js/proeve.js) =====
        ctx, pg = await ny_side(b)
        E = lambda js: pg.evaluate(js.replace('@A', A))
        r = await E("[proeveKarakter(95), proeveKarakter(80), proeveKarakter(79.9), proeveKarakter(40), proeveKarakter(39), proeveKarakter(5), PROEVE_NIVEAUER.length]")
        tjek('prøve: karakterskalaen omregner procent til 7-trinsskalaen', r == ['12', '10', '7', '02', '00', '-3', 4], r)
        SNAP = "(()=>{const o={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(k.startsWith('tavleoversigt.')) o[k]=localStorage.getItem(k);} return JSON.stringify(o)})()"
        EL = {'projekt': {'navn': 'Villa$1'}, 'grupper': [{'id': 'g1', 'nr': 1, 'navn': 'Lys', 'kar': 'B', 'In': 10, 'faser': 1, 'fase': 'L1'},
              {'id': 'g2', 'nr': 2, 'navn': 'Kraft', 'kar': 'C', 'In': 16, 'faser': 3, 'fase': 'L1'}],
              'enheder': [{'id': 'e1', 'gruppeId': 'g1', 'navn': 'Spots', 'effekt': 500, 'kabel': 'PVC', 'tv': 1.5, 'laengde': 20},
              {'id': 'e2', 'gruppeId': 'g2', 'navn': 'Ovn', 'effekt': 7200, 'kabel': 'XLPE', 'tv': 2.5, 'laengde': 15, 'fase': ''},
              {'id': 'e3', 'gruppeId': 'g1', 'navn': 'Stik', 'effekt': 0, 'kabel': 'PVC', 'tv': 1.5, 'laengde': 9}]}
        await pg.evaluate("([i, p]) => { localStorage.setItem('tavleoversigt.projekter', i); localStorage.setItem('tavleoversigt.p.p1', p); localStorage.setItem('tavleoversigt.tema', 'auto'); }",
                          [json.dumps({'aktiv': 'p1', 'liste': [{'id': 'p1', 'navn': 'Villa'}]}), json.dumps(EL)])
        for n in range(3): await E(f"@A.gemKort(nytKort({{front:'Prøvekort {n}', bag:'Svar $x^2$', emne:'mat'}}))")
        snap0 = await pg.evaluate(SNAP)
        await pg.click('#tab-proeve'); await pg.wait_for_selector('#proeve-start'); await pg.wait_for_function(f"{A}.proeveEl.fundet")
        r = await E("(()=>{const a=@A; return [a.proeveEl.projekter, a.proeveEl.zs.length, a.proeveEl.du.length, JSON.stringify(a.proeveEl).includes('$'), a.caseRegler.length > 0]})()")
        tjek('prøve: El-oversigtens projekt læses (2 sikringer, 2 kabler, kabel med effekt 0 springes over)', r == [1, 2, 2, False, True], r)
        r = await E("""(()=>{const a=@A, t=(g,s)=>opgLavOpgave(g,s), z=a.proeveEl.zs.map(c=>t(proeveProjZs(c),1)), d=a.proeveEl.du.map(c=>t(proeveProjDu(c),1));
          const fe = opgTjekSvar(d[0], { i:d[0].svar[0].vaerdi, pct:d[0].svar[1].vaerdi / 2 });
          return [z.map(o=>o.svar.map(s=>s.vaerdi)), d.map(o=>o.svar.map(s=>s.vaerdi)), fe.fejltype, d[1].tekst.includes('3-faset'), d[0].tekst.includes('Villa1')]})()""")
        s3 = math.sqrt(3); i1 = 500 / 230; i3 = 7200 / (s3 * 400)
        fa = [[[50, 2 / 3 * 230 / 50], [160, 2 / 3 * 230 / 160]], [[i1, 2 * 0.0225 * 20 * i1 / 1.5 / 230 * 100], [i3, s3 * 0.0225 * 15 * i3 / 2.5 / 400 * 100]]]
        ok = r[2] == 'glemt-faktor2' and r[3] and r[4] and all(abs(x - y) / y < 1e-9 for lst, ex in zip(r[0] + r[1], fa[0] + fa[1]) for x, y in zip(lst, ex))
        tjek('prøve: projektopgaverne regner som Python (Zs, strøm og spændingsfald, 1- og 3-faset) og kender typisk fejl', ok, (r, fa))

        # En hel prøve gennem brugerfladen
        await pg.select_option('#proeve-niveau', 'gen')
        await pg.fill('#proeve-min', '10'); await pg.fill('#proeve-n-kort', '2'); await pg.fill('#proeve-n-regler', '1'); await pg.fill('#proeve-n-opg', '3'); await pg.fill('#proeve-n-cases', '1')
        await pg.click('#proeve-begynd'); await pg.wait_for_selector('#proeve-koer')
        r = await E("(()=>{const a=@A, p=a.proeveAkt; return [p.items.map(x=>x.art).join(','), p.items.filter(x=>x.art==='opgave' && x.ref.startsWith('proj-')).length, p.min, JSON.parse(localStorage.getItem('elskole.proeve')).ind.opg]})()")
        tjek('prøve: opbygningen følger indstillingerne og blander projektopgaver ind', r[0] == 'kort,kort,regel,opgave,opgave,opgave,case' and r[1] == 1 and r[2:] == [10, 3], r)
        await pg.wait_for_selector('#proeve-tid')
        await pg.click('#proeve-vis'); await pg.wait_for_selector('#proeve-bag .katex'); await pg.click('#proeve-v-1')
        await pg.click('#proeve-nr-1'); await pg.click('#proeve-vis'); await pg.click('#proeve-v-0')
        await pg.click('#proeve-naeste'); await pg.click('#proeve-vis'); await pg.wait_for_selector('#proeve-bag')
        r = await E("[@A.proeveAkt.items[2].r.verificeret, document.querySelector('#proeve-sp .warn') && document.querySelector('#proeve-sp .warn').offsetParent !== null]")
        tjek('prøve: en regel, der ikke er kontrolleret, vises som ikke kontrolleret', r == [False, True], r)
        await pg.click('#proeve-v-05')
        await pg.click('#proeve-nr-3'); await pg.wait_for_selector('#proeve-svar-' + (await E("@A.proeveAkt.items[3].opg.svar[0].id")))
        await E("""(()=>{const p=@A.proeveAkt; for (const i of [3, 5]) { const it=p.items[i]; for (const s of it.opg.svar) it.ind[s.id] = String(s.vaerdi).replace('.', ','); } })()""")
        await pg.click('#proeve-nr-6'); await pg.click('#proeve-case-start'); await pg.wait_for_selector('#proeve-case-tekst')
        await pg.click('#proeve-nr-0'); await pg.wait_for_timeout(100)
        r2 = await E("@A.proeveAkt.nu")
        tjek('prøve: man kan ikke forlade en case midt i', r2 == 6, r2)
        await E("""(()=>{const a=@A, it=a.proeveAkt.items[6]; for (let n = 0; n < 60 && it.state === 'igang'; n++) { const c=a.caseAktiv, t=a.caseTrin();
          if (t.type === 'tal') c.tal = String(t.facit).replace('.', ','); else if (t.type === 'flere') c.flere = t.muligheder.map(m => !!m.rigtig);
          a.proeveCaseSvar(it, 0); } })()""")
        await pg.wait_for_selector('#proeve-case-faerdig')
        await pg.click('#proeve-aflever'); await pg.wait_for_selector('[role=alertdialog]')
        tekst = await pg.inner_text('[role=alertdialog]')
        await E("@A.bekraeft()"); await pg.wait_for_selector('#proeve-slut'); await pg.wait_for_timeout(150)
        r = await E("""(()=>{const a=@A, p=a.proeveAkt, c=p.items[6], ventet = 1 + 0 + 0.5 + 2 + 0 + 2 + c.score * 3, pr = a.resultater.filter(x => x.ref === 'proeve');
          return [Math.abs(p.res.point - ventet) < 0.02, p.res.maks, pr.length, pr.length && pr[0].data.del.length, pr.length && pr[0].data.karakter === p.res.karakter,
            a.resultater.filter(x => x.art === 'opgave' && x.data.proeve === p.id).length, c.state, document.querySelector('#proeve-karakter').textContent === p.res.karakter, document.querySelectorAll('.proeve-gennemgang').length]})()""")
        tjek('prøve: afleveret prøve giver point, karakter og gennemgang, og resultaterne gemmes', r[0] and r[1] == 12 and r[2] == 1 and r[3] == 7 and r[4] and r[5] == 2 and r[6] == 'faerdig' and r[7] and r[8] == 7 and 'ubesvarede' in tekst, (r, tekst))
        r = await E("(()=>{const a=@A, h=a.proeveHistorik(); return [h.length, h[0].karakter === a.proeveAkt.res.karakter, a.resultater.some(x => x.art === 'case' && x.ref === a.proeveAkt.items[6].ref)]})()")
        tjek('prøve: historikken viser prøven, og casen gemmes som almindelig case', r == [1, True, True], r)
        snap1 = await pg.evaluate(SNAP)
        tjek('prøve: El-oversigtens nøgler er uændrede efter hele prøven (kun læsning)', snap0 == snap1 and len(json.loads(snap1)) == 3, (len(snap0), len(snap1)))
        await pg.click('#proeve-ny'); await pg.wait_for_selector('#proeve-hist')

        # Tiden løber ud: prøven afleveres af sig selv, ubesvaret giver 0 point
        await pg.fill('#proeve-min', '1'); await pg.fill('#proeve-n-cases', '0')
        await pg.click('#proeve-begynd'); await pg.wait_for_selector('#proeve-koer')
        await E("@A.proeveAkt.slutTid = Date.now() + 300")
        await pg.wait_for_selector('#proeve-slut')
        r = await E("(()=>{const a=@A, p=a.proeveAkt; return [p.tidUd, p.res.point, p.res.karakter, a.resultater.filter(x => x.ref === 'proeve').length, a.resultater.filter(x => x.art === 'opgave').length]})()")
        tjek('prøve: når tiden løber ud, afleveres automatisk med 0 point og ingen opgaveforsøg for ubesvarede', r == [True, 0, '-3', 2, 2], r)
        await pg.reload(); await pg.wait_for_function(f"window.__alpineOk && {A}.klar")
        r = await E("@A.resultater.filter(x => x.ref === 'proeve').length")
        tjek('prøve: resultaterne er gemt efter genindlæsning', r == 2, r)
        await ctx.close()

        ctx, pg = await ny_side(b, 375, 812, is_mobile=True, has_touch=True)
        await pg.evaluate(f"{A}.gaaTil('proeve')"); await pg.wait_for_selector('#proeve-start'); bredder = [await pg.evaluate("document.documentElement.scrollWidth")]
        await pg.click('#proeve-begynd'); await pg.wait_for_selector('#proeve-koer'); bredder.append(await pg.evaluate("document.documentElement.scrollWidth"))
        tjek('prøve: mobil 375 px uden vandret rulning', all(x <= 375 for x in bredder), bredder)
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
