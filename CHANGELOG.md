# Ændringer

## 0.3.0 · 2026-11-23 · Claude Opus 5.5 og Claude Sonnet 5.5
- Fase 3, kompetence (`docs/planer/2026-11-22-fase-3-kompetence.md`): fanen Kompetence (tast 7) med kompetencetræ pr. emne og delemne ud fra kort, opgaver, cases og fejlfinding, de svageste områder og en log over typiske fejl med henvisning til træning.
- Fase 6, prøve (`docs/planer/2026-11-22-fase-6-proeve.md`): fanen Prøve (tast 8) med tidsbegrænset prøvesimulering af kort, opgaver og cases, karakter på 7-trinsskalaen og gennemgang. Niveauet kan vælges, fordi det ikke er afgjort endnu. Regneopgaver kan bygges ud fra projekter i El-oversigtsappen, som kun læses.

## 0.2.0 · 2026-11-22 · Claude Opus 5.5
Skema 2 (tabellen `resultater`), faner og modulpladser til parallelle faser. Derudover tre faser bygget i hver sin session:
- Fase 2, opgaver (`docs/planer/2026-11-22-fase-2-opgaver.md`): 10 opgavegeneratorer med trinvis løsning og 25 koder for typiske fejl.
- Fase 4, cases (`docs/planer/2026-11-22-fase-4-cases.md`): 5 cases med forgreninger og et regelbibliotek med 28 regler. Ingen af reglerne er fagligt kontrolleret endnu (`verificeret:false`), og appen viser det.
- Fase 5, fejlfinding (`docs/planer/2026-11-22-fase-5-fejlfinding.md`): 7 fejltyper, 10 målinger, diagram og en sikkerhedstjekliste med 5 regler.

## 0.1.0 · 2026-11-22 · Claude Opus 5.5
Fase 0 og 1 (`docs/planer/2026-11-22-fase-0-1.md`):
- Skelet: offline-app med service worker begrænset til appens mappe, lyst og mørkt tema, installation, røgtest.
- Lager i IndexedDB (kort, tilstand, log), indstillinger i localStorage, backupfil med fletning.
- Synk via hemmelig Gist: kort og tilstand flettes pr. id, loggen pr. måned, skemaspærre.
- Øv: FSRS-planlægning (ts-fsrs 5.2.3), forfaldne og nye kort blandet på tværs af emner, visning af intervaller, tastatur, fortryd, stribe, beherskelse pr. emne.
- Kort: liste med søgning og filtre, redigering med kildefelt og formelvisning, sletning som gravsten, start forfra.
- Import af tekstfiler fra Anki ("Notes in Plain Text") og CSV/TSV: HTML og MathJax omdannes, kolonnevalg, eksempel, dubletter springes over (Claude Sonnet 5.5).
- Startpakke med 51 kort i matematik og fysik, regneeksempler kontrolleret med Python (Claude Sonnet 5.5).
