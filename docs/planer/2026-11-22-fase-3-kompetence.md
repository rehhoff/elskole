# Fase 3: kompetencetræ og log over typiske fejl

Modul: `js/kompetence.js` (`APP_KOMPETENCE`, præfiks `komp`). Fane: "Kompetence" (`kompStart`). Ingen ændring af `SCHEMA`, `data.js`, `lager.js` eller `synk.js`: alt udregnes af data, der allerede findes (kort, tilstand, resultater).

## Kompetencetræ

Rødder er `EMNER`. Under `mat`, `dim` og `saer` ligger delemner (`KOMP_TRAE`). Hvert delemne peger på:

- kort via tags (kun `mat` har tags i startpakken), 
- opgavegeneratorer (`ref` i resultater med `art:'opgave'`),
- cases (`ref` = case-id),
- fejlfindingstyper (`ref` = fejltype).

Et emne beregnes af alle kort og resultater med det `emne`, så intet falder ud, selv om det ikke er knyttet til et delemne. Emner uden delemner (`love`, `erhv`, `arb`, `andet`) vises kun med kort og eventuelle resultater.

## Beherskelse

Hver kilde giver en værdi 0–1 og en vægt:

| Kilde | Værdi | Vægt |
|---|---|---|
| Kort | Sum af hukommelsessandsynlighed R for sete kort, delt med alle kort. R = 0,9^(dage siden sidste svar / stabilitet) (FSRS: stabilitet er det antal dage, hvor R falder til 90 %). Nye kort tæller 0 | min(1, kort / 5) |
| Opgaver, cases, fejlfinding | Vægtet gennemsnit af `score` i de seneste 10 forsøg, nyeste vægter mest (0,8 pr. trin) | min(1, forsøg / 3) |

Samlet beherskelse = vægtet gennemsnit af kilderne, der har data. Ingen data = "Ingen data". Niveau: ≥ 85 % Stærk, ≥ 65 % God, ≥ 40 % Under opbygning, ellers Svag. Tallene er en rettesnor, ikke en prøve.

## Log over typiske fejl

Grupperes pr. (art, fejlkode) fra `resultater.fejltype`. Visning: antal i perioden (30 dage, 90 dage, alt), andel, tendens (denne periode mod forrige), de seneste 8 uger som søjler og sidst set. Opgavekoder får klartekst fra `OPG_FEJLNAVNE`, fejlfindingskoder fra `FF_FEJL`, casekoder gøres læsbare af koden.

Hver fejl har en træningsknap:

- opgavefejl: generatorerne, hvis `typiskeFejl` indeholder koden (findes ved at køre `lav()` med 40 seeds pr. generator) plus generatoren i resultaterne, 
- casefejl: casen, hvor fejlen er set, 
- fejlfinding: `ff-type:X>Y` træner fejltypen X, de øvrige koder en tilfældig fejl.

## Test

Blok `# ===== FASE 3 … =====` i `tests/smoke.py`: beherskelse ud fra syntetiske kort og resultater, tendens, kode-til-generator-map, fane og træningsknapper.
