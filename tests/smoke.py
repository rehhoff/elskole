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

        # ===== FASE 5: FEJLFINDING (js/fejlfinding.js) =====

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
