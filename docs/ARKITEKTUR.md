# Opbygning og datamodel

## Filer

| Fil | Indhold |
|---|---|
| `index.html` | Markup med Alpine-direktiver. Hver fane er en `<template x-if="view==='…'">`, markeret med `<!-- ===== NAVN ===== -->` |
| `css/app.css` | Farvetokens i `:root`, mørkt tema, egne klasser. `css/tailwind.css` bygges (ret den ikke i hånden) |
| `sw.js` | Service worker. Scope = appens mappe. Sider net først, filer med `?v=` cache først, eksterne filer gemmes ved første hentning, GitHub aldrig |
| `js/data.js` | Konstanter, nøgler, `EMNER`, `KORTTYPER`, `normKort`, `normTilstand`, `normLog`, `normIndst`, `nytKort`, `flet`, `hashD` |
| `js/lager.js` | `APP_LAGER()`: IndexedDB, `gemKort`, `gemTilst`, `tilfoejLog`, `fjernLog`, backup |
| `js/synk.js` | `APP_SYNK()`: Gist-synk |
| `js/oev.js` | `APP_OEV()`: FSRS, køen, karakterer, fortryd, statistik |
| `js/kort.js` | `APP_KORT()`: kortliste, filtre, redigering, startpakker |
| `js/import.js` | `APP_IMPORT()`: import af tekstfiler eksporteret fra Anki |
| `js/opgaver.js` | `APP_OPGAVER()`: fase 2, opgavegeneratorer. Præfiks `opg` |
| `js/cases.js` | `APP_CASES()`: fase 4, cases og regelbibliotek. Præfiks `case` |
| `js/fejlfinding.js` | `APP_FEJLFINDING()`: fase 5, fejlfinding med diagrammer. Præfiks `ff` |
| `js/proeve.js` | `APP_PROEVE()`: fase 6, prøvesimulering og læsning af El-oversigtens projekter. Præfiks `proeve`. Se `docs/planer/2026-11-22-fase-6-proeve.md` |
| `js/app.js` | `app()`, `init()`, tema, beskeder, `vis()` (tekst og KaTeX), tastatur |
| `indhold/*.json` | Startpakker: `{ navn, kort:[…] }` med faste id'er |
| `tests/smoke.py` | Røgtest med Playwright |

## Faner

`oev` (Øv, 1), `opgaver` (2), `cases` (3), `fejlfinding` (4), `proeve` (7), `kort` (Kort, 5), `data` (Data og indstillinger, 6). En fane med `kraever` i `views` (`js/app.js`) vises kun, når modulets startmetode (`opgStart`, `caseStart`, `ffStart`) findes. Hvert modul har sin egen markerede blok i `index.html` (fane og dialoger) og i `tests/smoke.py`. Under en øvelse: mellemrum eller Enter viser svaret, 1–4 giver karakter, Z fortryder.

## Datamodel (SCHEMA 2)

**Kort** (IndexedDB `kort`): `{ id, type: fakta|regel|formel, emne, front, bag, tags[], kilde{dok, afsnit, udgave, gyldigFra}, oprindelse, oprettet, rettet, slettet }`. `oprindelse` er fx `anki:<guid>` eller `start:<fil>`.

**Tilstand** (IndexedDB `tilstand`, nøgle = kort-id): FSRS-kortets felter `due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review` plus `rettet`. Mangler den, er kortet nyt. `state`: 0 ny, 1 lærer, 2 gentages, 3 genlærer.

**Log** (IndexedDB `log`): `{ id, kortId, tid, karakter 1–4, ny, foer (state før), varighedMs }`.

**Resultater** (IndexedDB `resultater`, fra skema 2): `{ id, art: opgave|case|fejlfinding, ref, emne, tid, korrekt, score 0–1, fejltype, varighedMs, data{} }`. Kun tilføjes, med `tilfoejResultat()`. `fejltype` er en kort kode (fx `glemt-ktemp`) til fase 3's log over typiske fejl.

**Indstillinger** (`elskole.indstillinger`): `nyePrDag`, `retention`, `maksInterval`.

## Tekst på kort

`vis()` escaper HTML og understøtter `$formel$`, `$$formel$$` (KaTeX), `**fed**` og linjeskift. Rå HTML fra kortene indsættes aldrig.

## Startpakker

`indhold/<navn>.json`: `{ "navn": "…", "kort": [ { "id": "mat-001", "type": "formel", "emne": "mat", "front": "…", "bag": "…", "tags": [], "kilde": { "dok": "", "afsnit": "", "udgave": "", "gyldigFra": "" } } ] }`. Id'erne er faste og må aldrig genbruges til et andet kort. Pakken registreres i `STARTPAKKER` i `js/kort.js`.

## Synk

Gist med `elskole.json` (markør med `schema`), `elskole-kort.json`, `elskole-tilstand.json`, `elskole-log-ÅÅÅÅ-MM.json` og `elskole-resultater-ÅÅÅÅ-MM.json`. Kort og tilstand flettes med `flet()` (nyeste `rettet` vinder), loggen er en foreningsmængde. Kun ændrede filer sendes.
