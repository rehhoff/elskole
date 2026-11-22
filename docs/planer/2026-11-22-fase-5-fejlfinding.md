# Plan: fase 5, fejlfinding med diagram og målinger

Branch: `claude/fase5-fejlfinding-f93a04`. Filer: `js/fejlfinding.js` (præfiks `ff`/`FF_`), blokkene FEJLFINDING og DIALOGER: FEJLFINDING i `index.html`, blokken FASE 5 i `tests/smoke.py`. Ingen ændringer i datamodel, `SCHEMA`, version eller `CHANGELOG.md`. `js/fejlfinding.js` står allerede i `SKAL` i `sw.js`.

## Scenarie

Et scenarie bygges ud fra et seed (mulberry32), så samme seed altid giver samme installation, fejl og målestøj.

- **Gruppe:** automatsikring B (af og til C) 10, 13 eller 16 A, RCD 30 mA type A, U<sub>0</sub> = 230 V, Z<sub>e</sub> ved tavlen 0,15–0,55 Ω (skal måles).
- **Kabel:** 3G1,5 mm² (3G2,5 mm² ved 16 A). Tavle → dåse 1 (8–25 m), evt. dåse 1 → dåse 2 (5–15 m), dåse → forbruger (2–10 m).
- **Forbrugere:** 2–5 stikkontakter, lampeudtag og højst ét fast tilsluttet apparat, fordelt på 1–2 dåser.
- **Fejl:** én skjult fejl fra skabelonerne nedenfor, med placering i et kabelstykke (`k:X` = kablet ind til X), en dåse (`n:D1`) eller en forbruger (`n:F2`).

| Skabelon (`ref`) | Fejl | Mulige steder | Viser sig ved |
|---|---|---|---|
| `iso-lpe` | Isolationsfejl L–PE (0,03–0,4 MΩ) | kabel, dåse, forbruger | Isolation L–PE < 1 MΩ |
| `iso-npe` | Isolationsfejl N–PE | kabel, dåse, forbruger | Isolation N–PE < 1 MΩ |
| `afbrudt-pe` | Afbrudt PE | kabel, dåse, forbruger | PE-kontinuitet OL, ingen Z<sub>s</sub>, RCD-test kan ikke køre, stiktester "PE mangler" |
| `afbrudt-n` | Afbrudt N | kabel, dåse, forbruger | L–N ≈ 0 V og N–PE ≈ 230 V, stiktester "N mangler" |
| `byttet-ln` | L og N byttet | dåse, forbruger | L–PE ≈ 0 V og N–PE ≈ 230 V, polaritet "L og N byttet" |
| `byttet-npe` | N og PE byttet | dåse, forbruger | PE-kontinuitet OL, men Z<sub>s</sub> måles, og RCD udløser ikke. Stiktesteren viser "korrekt" |
| `daarlig-forb` | Dårlig forbindelse (0,8–2,5 Ω) på L eller PE | dåse | Z<sub>s</sub> (og ved PE kontinuiteten) højere end beregnet |

## Målinger

Brugeren vælger et punkt (tavle, dåse eller forbruger) i diagrammet eller listen og en måling:

- Spænding L–N, L–PE, N–PE (spændingsløst: 0 V, som er kontrollen af spændingsløshed).
- Kontinuitet i PE fra tavlens PE-skinne til punktet (kræver spændingsløs).
- Isolation L–PE, N–PE og L–N ved 500 V DC (kræver spændingsløs). Krav ≥ 1 MΩ, fejlfri > 999 MΩ.
- Z<sub>s</sub> = Z<sub>e</sub> + R<sub>L</sub> + R<sub>PE</sub>, R = ρ·l/A med ρ = 0,0225 Ω·mm²/m. Grænse 2/3 · U<sub>0</sub>/I<sub>a</sub> (I<sub>a</sub> = 5·I<sub>n</sub> for B, 10·I<sub>n</sub> for C).
- RCD-test ved 1 × IΔn: fejlfri 15–40 ms, krav ≤ 300 ms.
- Polaritet med stiktester (tre lamper).

Støj: spænding ±2 V, modstande ±3 %, isolation ±5 %, RCD ±3 ms. Hver gentagelse af samme måling giver ny støj, men deterministisk ud fra seed.

**Placering:** Kontinuitet, spænding, Z<sub>s</sub>, RCD og polaritet påvirkes på punkter efter fejlen (fejlen ligger på vejen fra tavlen). Isolationsmåling på et punkt måler installationen fra punktet og ud (som om forbindelsen er løsnet dér). Derfor kan isolationsfejl i et kabel skilles fra fejl i dåsen for enden af det.

**Ens steder:** To placeringer, som giver præcis de samme målinger overalt (fx afbrudt PE i kablet til dåse 1 og i dåse 1), kan ikke skelnes. Diagnosen godkendes, når den valgte placering er tilladt for fejltypen og giver samme målinger som den sande.

## Sikkerhed

Anlægget starter spændingsførende. "Gør spændingsløs" åbner en tjekliste med de fem sikkerhedsregler fra DS/EN 50110-1 med egne ord, som skal krydses af i rækkefølge. Isolations- og kontinuitetsmåling på et spændingsførende anlæg giver en tydelig fejl, ingen måleværdi og fradrag i point. Z<sub>s</sub>, RCD og polaritet kræver spænding; uden spænding melder testeren det (ingen fare). "Sæt spænding på" nulstiller tjeklisten.

## Diagnose og score

Brugeren vælger fejltype og placering. Score (0–1): fejltype 0,5, placering 0,3, få målinger 0,2 (fuld ved ≤ 8, 0 ved ≥ 25, kun ved rigtig type), minus 0,25 pr. sikkerhedsfejl. `korrekt` = type og placering rigtige. Bagefter vises den sande fejl, fejltypens forklaring, brugerens målinger, der afveg fra et fejlfrit anlæg, og de målinger, der afslører fejlen (forventet → med fejl).

Gemmes med `tilfoejResultat({ art:'fejlfinding', ref:skabelon, emne:'dim', korrekt, score, fejltype, varighedMs, data:{ seed, maalinger, fejl, sted, valgt, sikkerhedsfejl } })`. `fejltype` følger `ARKITEKTUR.md`: kode for brugerens fejl (`ff-type:<sand>><valgt>`, `ff-placering`, `ff-sikkerhed`), tom når alt er rigtigt.

## Røgtest (blok FASE 5)

- Samme seed giver samme scenarie, og alle syv fejltyper forekommer.
- Fejlfri model overholder kravene (isolation, Z<sub>s</sub>, RCD) for mange seeds.
- Hver fejltype giver mindst én måling med støj, der adskiller den fra fejlfri, for 15 seeds hver.
- Ens steder godkendes, forkerte afvises.
- Gennem brugerfladen: isolationsmåling på spændingsførende anlæg giver fejl og fradrag, tjeklisten kan ikke springes over, scenariet gennemføres, og resultatet gemmes.
- 375 px: ingen vandret rulning i fanen og dialogen.

## Forenklinger

Ingen belastningsstrømme (spændingsfald under last indgår ikke), Z<sub>s</sub> uden reaktans, samme tværsnit i L, N og PE, forbrugerne er tilsluttet og tændt under spændingsmåling og frakoblet under isolationsmåling, svævende PE vises som lav spænding, isolationsfejl er for små til at udløse RCD'en, og N–PE-sløjfen behandles som L–PE-sløjfen ved byttet N og PE.
