# CLAUDE.md: Elskolen

Webapp til træning i elektrikerfaget: gentagelse med mellemrum (FSRS), senere regneopgaver, cases og fejlfinding. Ejer: Alexander. Brugerfladen er på dansk.

- Udgives på GitHub Pages som `https://rehhoff.github.io/elskole/` (repoet `rehhoff/elskole`, gren `main`, mappe `/`). Repoet er offentligt: skriv ingen personlige oplysninger i filer eller commits.
- **Samme origin som El-oversigtsappen** (`rehhoff.github.io`). localStorage, IndexedDB og caches deles derfor med den. Alle nøgler starter med `elskole.`, IndexedDB hedder `elskole`, caches hedder `elskole-*`, og service workeren har scope `./` (= `/elskole/`). Rør aldrig andres nøgler eller caches.
- Ét lille byggetrin: Tailwind bygges med `python tools/byg_css.py` (v3.4.17). Biblioteker med fast version: Alpine.js 3.14.1 og KaTeX 0.16.9 fra cdnjs, ts-fsrs 5.2.3 fra jsdelivr (global `FSRS`). Almindelige scripts, der deler globalt scope, i denne rækkefølge:
  - `js/data.js`: `APP_VERSION`, `SCHEMA`, lagernøgler, `EMNER`, `norm*()`, `flet()`, `hashD()`.
  - `js/lager.js` (`APP_LAGER`), `js/synk.js` (`APP_SYNK`), `js/oev.js` (`APP_OEV`), `js/kort.js` (`APP_KORT`), `js/import.js` (`APP_IMPORT`).
  - `js/app.js`: `app()`, `init()`, fælles brugerflade. `bland()` samler metoderne. Navne skal være unikke på tværs af filerne.
- Opbygning og datamodel: `docs/ARKITEKTUR.md`. Samlet plan: `docs/plan.md`. Delplaner: `docs/planer/`. Historik: `CHANGELOG.md`.

## 1. Data må aldrig gå tabt

1. Omdøb eller fjern aldrig nøglerne `elskole.meta`, `elskole.tema`, `elskole.indstillinger`, `elskole.sync`, `elskole.backup`, IndexedDB-databasen `elskole` (tabellerne `kort`, `tilstand`, `log`) eller Gist-filerne `elskole.json`, `elskole-kort.json`, `elskole-tilstand.json`, `elskole-log-ÅÅÅÅ-MM.json`.
2. Ændres datamodellen: udvid `normKort()`, `normTilstand()` eller `normLog()` med standardværdier og migrering, og hæv `SCHEMA`. Første start efter en hævning gemmer en backup i `elskole.backup`. Tilføj et tjek i `tests/smoke.py` med data i det gamle format.
3. Kort slettes aldrig fysisk: de får `slettet: true` (gravsten), så sletningen kan synkroniseres. Loggen tilføjes kun til; den eneste sletning er Fortryd af det sidste svar.
4. Synk: en app med lavere `SCHEMA` end Gist-markøren må hverken læse eller skrive.
5. Kort og tilstand flettes pr. id, hvor nyeste `rettet` vinder. Sæt altid `rettet` ved ændringer (det gør `gemKort()` og `gemTilst()`).

## 2. Arbejdsgang

Som i El-oversigtsappen: branch fra `main`, ret koden i samme stil, byg CSS ved nye Tailwind-klasser (klassenavne skal stå hele i koden), hæv versionen fire steder ved merge (`APP_VERSION` i `js/data.js`, alle `?v=` i `index.html`, `VERSION` i `sw.js`, `version` i `package.json`), afsnit øverst i `CHANGELOG.md`, røgtesten skal slutte med `OK`, commit på dansk. En ny fil i `js/` eller `css/` skal også stå i `SKAL` i `sw.js`.

Røgtest på Alexanders Windows-PC (ingen npm, Python hedder `python`):
```
pip install playwright
python -m playwright install chromium
mkdir -p node_modules/alpinejs/dist node_modules/ts-fsrs/dist node_modules/katex
curl -sfL https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js -o node_modules/alpinejs/dist/cdn.min.js
curl -sfL https://cdn.jsdelivr.net/npm/ts-fsrs@5.2.3/dist/index.umd.js -o node_modules/ts-fsrs/dist/index.umd.js
curl -sfL https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js -o node_modules/katex/katex.min.js
curl -sfL https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css -o node_modules/katex/katex.min.css
python tools/byg_css.py
python tests/smoke.py
```
Sæt `PYTHONIOENCODING=utf-8`, hvis æ, ø og å giver fejl i konsollen.

## 3. Faglige regler

- Indholdet er vejledende, og appen siger det. Kort, der bygger på en lov, bekendtgørelse eller standard, skal have en kilde (`kilde.dok`, `kilde.afsnit`, `kilde.udgave`, `kilde.gyldigFra`).
- DS-standarder er ophavsretligt beskyttede: skriv med egne ord og henvis til afsnittet. Citér ikke standardtekst. Love og bekendtgørelser fra retsinformation.dk må citeres.
- Opfind aldrig paragraf- eller afsnitsnumre. Er du i tvivl, så lad feltet stå tomt.
- Emnernes id'er (`mat`, `dim`, `saer`, `love`, `erhv`, `arb`, `andet`) må ikke omdøbes.
