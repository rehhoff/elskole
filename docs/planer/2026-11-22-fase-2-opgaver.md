# Plan: fase 2, opgavegeneratorer

Status: færdig 2026-11-22 (røgtesten giver OK) (egen session og branch `claude/fase2-opgaver-66f089`, udført af Sonnet).

## Filer

| Fil | Ændring |
|---|---|
| `js/opgaver.js` | `APP_OPGAVER()`: generatorer, seedet PRNG, tjek af svar, valg af opgave, statistik. Alle navne med præfiks `opg` |
| `index.html` | Blokkene `OPGAVER` (fane) og `DIALOGER: OPGAVER` samt ét samlet kort i Øv-sektionen (blok `OPGAVER: DAGENS REGNEOPGAVER`) |
| `tests/smoke.py` | Blokken `FASE 2: OPGAVER` |
| denne plan | |

Ikke ændret: `js/data.js`, `js/lager.js`, `js/synk.js`, `js/oev.js`, `SCHEMA`, version, `CHANGELOG.md`. Resultater gemmes med `tilfoejResultat()`.

## Generator

`{ id, navn, emne, niveau 1–3, lav(rng) }`. `lav()` returnerer `{ tekst, svar:[{ id, navn, enhed, vaerdi, tol }], trin:[…], typiskeFejl:[{ fejltype, svar, vaerdi, forklaring }], inddata }`. `svar` i en typisk fejl peger på det svar, den gælder (standard: det første). `inddata` er de rå input og bruges af røgtesten til en uafhængig kontrolberegning. `rng` er en seedet PRNG (mulberry32) med `rng()` (0–1), `rng.heltal(a, b)`, `rng.vael(liste)` og `rng.trin(a, b, skridt)`. Samme seed giver samme opgave.

Typiske fejl, hvis værdi ligger inden for 2 × tolerancen fra det rigtige svar, fjernes, så en rigtig besvarelse aldrig kan ligne en fejl.

## Fejltyper (korte, stabile koder til fase 3)

`glemt-faktor2`, `faktor2-for-meget`, `glemt-sqrt3`, `sqrt3-forkert`, `sqrt3-i-1faset`, `forkert-spaending`, `glemt-cosphi`, `cosphi-vendt`, `kva-kw`, `enhed-1000`, `mm2-radius`, `byttet-formel`, `glemt-ktemp`, `glemt-ksamlet`, `divideret-med-k`, `glemt-23`, `forkert-kurve`, `glemt-tillaeg`, `forkert-tillaeg`, `glemt-pe`, `glemt-ze`, `glemt-cmin`, `cos-for-tan`, `glemt-maalcos`, `forkert-sikring`.

## Generatorer (10)

1. Ohms lov (U, I eller R; ofte kΩ/mA)
2. Effekt 1-faset (I ud fra P og cos φ, eller P ud fra I)
3. 3-faset effekt og strøm med cos φ (P → I og S, eller S → P og I)
4. Ledermodstand (R for én leder og for fase+nul-sløjfen)
5. ΔU 1-faset (V og %, 230 V)
6. ΔU 3-faset (V og %, 400 V)
7. I<sub>z</sub> med k<sub>temp</sub> og k<sub>samlet</sub> (DS/HD 60364-5-52 anneks B, luft; største sikring)
8. Største Z<sub>s</sub> for udkobling (I<sub>a</sub> og Z<sub>s</sub>, B/C/D)
9. I<sub>k,min</sub> (ledermodstand × 1,2 PVC / 1,28 XLPE, PE i samme tværsnit)
10. Kondensatoreffekt til kompensering (Q<sub>c</sub> og kondensatorstrøm)

Tabelværdier og forudsætninger er taget fra El-oversigtsappen (`js/data.js`, `CLAUDE.md` afsnit 4): ρ = 0,0225 Ω·mm²/m, 230/400 V, cos φ = 1 medmindre opgaven siger andet. I<sub>z</sub>-tabellen er en delmængde (luft, metode A2/B2/C/E, 1,5–50 mm², PVC og XLPE) og er tjekket mod El-oversigtsappens tabel i røgtesten.

## Fanen Opgaver

- Valg: blandet efter svagheder (standard), et emne eller én generator.
- Opgaveteksten vises med `vis()`. Svar skrives med dansk decimalkomma (punktum og mellemrum accepteres også). Enter tjekker.
- Retning: korrekt hvis alle svar er inden for tolerancen. Ellers vises den trinvise løsning og den genkendte typiske fejl. Et forsøg gemmes: `art:'opgave', ref:generator-id, emne, korrekt, score (andel rigtige svar), fejltype, varighedMs, data:{ seed, svar }`.
- "Blandet efter svagheder": vægten er 1 − (rigtige + 1) / (forsøg + 2) over de seneste 10 forsøg pr. generator, plus 0,1, og den samme generator vælges ikke to gange i træk.
- Oversigt pr. generator: forsøg, træfsikkerhed og de hyppigste fejl.
- Dagens økt: kort i Øv-fanen, "Dagens regneopgaver (n)" med n = dagsmål (5) minus dagens forsøg. Det fører til fanen og starter en blandet opgave. `js/oev.js` er uændret.

## Røgtest

- Hver generator giver gyldige, endelige tal og KaTeX uden `katex-error` (tekst, trin og forklaringer) over 300 seeds.
- Uafhængig Python-beregning af alle svar og typiske fejl fra `inddata` for alle seeds; I<sub>z</sub>-tabellen sammenlignes med El-oversigtsappen, hvis den ligger ved siden af.
- Rigtigt svar godkendes, en typisk fejl genkendes, og resultatet gemmes med seed og fejltype. Samme seed giver samme opgave.

## Ønsker til datamodellen

Ingen. `normResultat()` rummer det, der skal bruges.
