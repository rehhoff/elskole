# Fase 6: prøvesimulering og kobling til El-oversigtsappen

Dato: 2026-11-22. Branch: `claude/fase6-proeve-3a2109`. Modul: `js/proeve.js` (`APP_PROEVE`, præfiks `proeve`, globale navne `PROEVE_`).

## Mål

1. **Prøvesimulering:** en tidsbegrænset prøve med en blanding af kort, regler, regneopgaver og cases. Karakter og gennemgang bagefter. Resultatet gemmes med `tilfoejResultat()`.
2. **Kobling til El-oversigtsappen:** Elskolen læser ejerens projekter (samme origin) og laver regneopgaver ud fra hans egne grupper og kabler. Kun læsning og links. Elskolen skriver aldrig til El-oversigtsappens nøgler, databaser eller caches.

## Niveau (åbent punkt 2 i STATUS.md)

Ejeren har siden valgt autorisation som elinstallatør (2026-11-23), så `aut` er standard. Niveauet er stadig et valg i fanen, og hvert niveau er blot et sæt standardværdier i `PROEVE_NIVEAUER` øverst i `js/proeve.js`:

| id | Navn | Minutter | Kort | Regler | Opgaver | Cases | Højeste opgaveniveau | Emner |
|---|---|---|---|---|---|---|---|---|
| `svend` | Svendeprøve (elektriker) | 60 | 8 | 2 | 5 | 1 | 2 | mat, dim, saer, arb |
| `aut` | Autoriseret elinstallatør | 90 | 6 | 5 | 4 | 2 | 3 | dim, saer, love, erhv, arb |
| `gen` | Generel faglig dygtighed | 45 | 6 | 3 | 4 | 1 | 3 | alle |
| `hurtig` | Kort test | 15 | 4 | 1 | 2 | 0 | 2 | alle |

Sammensætningen er et bud, ikke den officielle prøveform, og appen siger det. Brugeren kan rette minutter og antal. Valget gemmes kun på enheden i `elskole.proeve` (localStorage, ikke synkroniseret). Når ejeren har besluttet sig, rettes tabellen, og evt. fjernes de andre niveauer.

## Prøvens forløb

- **Opbygning** (`proeveByg`): kort fra kortlisten (ikke slettede), regler fra `indhold/regler.json`, opgaver fra `OPG_GENERATORER` (og evt. projektopgaver), cases fra `CASE_FILER`. Filtreres på niveauets emner; er der for få, fyldes op fra alle emner.
- **Under prøven:** frit valg af spørgsmål (forrige, næste, numre). Ingen facit undervejs, undtagen kort og regler, hvor man selv vurderer sig efter at have set svaret. Regler med `verificeret:false` vises som "Ikke kontrolleret mod kilden". En case kører gennem case-motoren fra fase 4 (`caseBegynd`, `caseSvar*`, `caseVidere`) uden feedback, og man kan ikke gå til et andet spørgsmål midt i en case.
- **Tid:** nedtælling. Når tiden er gået, afsluttes prøven automatisk. Ubesvaret giver 0. 0 minutter = uden tid.
- **Point:** kort 1, regel 1, opgave 2 (gange opgavens score), case 3 (gange casens score).
- **Karakter:** vejledende omregning af procent til 7-trinsskalaen (`PROEVE_SKALA`: 92 % = 12, 80 % = 10, 65 % = 7, 50 % = 4, 40 % = 02, 20 % = 00, ellers −3). Bestået ved 02. Desuden procent pr. emne.
- **Gennemgang:** hvert spørgsmål med dit svar, facit, typisk fejl, trinvis løsning eller casens gennemgang.

## Hvad gemmes

- Hver besvaret opgave: `art:'opgave'` som i fase 2, `data.proeve` = prøvens id. Projektopgaver har `ref` `proj-du` eller `proj-zs`.
- Hver gennemført case: gemmes af `caseAfslut()` i fase 4 som en almindelig case.
- Prøven samlet: ét resultat med `ref:'proeve'`, `score` = procent, `korrekt` = bestået, `data:{ proeve:id, niveau, navn, minutter, karakter, tidUd, emner:{ emne:[point, maks] }, del:[[art, ref, emne, point, maks]] }`.

**Mangler i datamodellen:** `RESULTAT_ARTER` i `js/data.js` kender ikke `'proeve'`, og `normResultat()` ville gøre en ukendt art til `'opgave'`. Fase 6 må ikke ændre `data.js`, så modulet bruger `PROEVE_ART = RESULTAT_ARTER.includes('proeve') ? 'proeve' : 'case'`. Indtil hovedsessionen tilføjer `'proeve'`, gemmes prøven som `art:'case'`, `ref:'proeve'`, `emne:'andet'`. Case-fanen tæller kun forsøg pr. case-id, så den påvirkes ikke. Historikken læser begge former.

## Kobling til El-oversigtsappen

- Læser `tavleoversigt.projekter` (`{ liste:[{ id, navn }] }`) og `tavleoversigt.p.<id>` med `localStorage.getItem`. Intet andet. Ingen `setItem`, `removeItem`, IndexedDB eller caches.
- Projektopgaver (`proeveProjGeneratorer`):
  - `proj-zs`: gruppe med karakteristik B/C/D og `In` > 0: udkoblingsstrøm og største Zs (samme formel som generatoren `zs`).
  - `proj-du`: brugsgenstand med effekt, længde og tværsnit på et kobberkabel (PVC, XLPE, brandkabel): strøm og spændingsfald på netop det kabelstykke, 1-faset eller 3-faset efter gruppen (samme formler som `du1`/`du3`, cos φ = 1).
- Link til El-oversigtsappen (`../`, dvs. `https://rehhoff.github.io/`).
- Røgtesten lægger et projekt i `tavleoversigt.*`, kører en hel prøve og kontrollerer, at alle `tavleoversigt.*`-værdier er uændrede, og at ingen nye er kommet til.

## Filer

- `js/proeve.js` (ny), `index.html` (blok `PRØVE (fase 6, js/proeve.js)` og script-tag), `js/app.js` (fane og `APP_PROEVE()` i `bland()`), `sw.js` (`SKAL`), `tests/smoke.py` (`# ===== FASE 6 … =====`), `docs/ARKITEKTUR.md`.

## Til hovedsessionen ved merge

- Fanen hedder `proeve` med tasten `7`. Fase 3 kan have valgt samme tast: ret én af dem.
- Overvej at tilføje `'proeve'` til `RESULTAT_ARTER`. En ældre app med samme `SCHEMA` vil normalisere en `'proeve'` til `'opgave'`; tjek om synk så kan skrive den forkerte art tilbage, og hæv i så fald `SCHEMA`.
- Fase 3 (kompetencetræ) bør springe resultater med `ref:'proeve'` over eller vise dem for sig.
