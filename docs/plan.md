# Samlet plan for Elskolen

Målet er at blive en meget dygtig elektriker: matematik og fysik, dimensionering efter DS/HD 60364, særlige installationer, love og myndigheder, erhverv og industri samt arbejdsmiljø. Anki er god til at huske, men træner ikke anvendelse. Elskolen har tre lag:

1. **Huske:** gentagelse med mellemrum (FSRS) med kildehenvisninger.
2. **Forstå og regne:** opgaver fra en generator med nye tal hver gang og trinvis løsning.
3. **Anvende:** cases fra virkeligheden og fejlfinding med målinger.

## Faser

| Fase | Indhold | Færdig når |
|---|---|---|
| 0 | Skelet: repo, offline-app med service worker begrænset til `/elskole/`, tema, lager, røgtest | Appen kan installeres og køre uden net, og røgtesten giver OK |
| 1 | Kort og gentagelse med FSRS, kortredigering, import af tekstfiler fra Anki, kildefelt | Anki-kortene er flyttet over og øves dagligt |
| 2 | 10 første opgavegeneratorer (Ohm, effekt, 3-faset, ΔU, I<sub>z</sub>, Z<sub>s</sub>, I<sub>k</sub>, RCD) med trinvis løsning | Regneopgaver indgår i dagens økt |
| 3 | Kompetencetræ, beherskelse pr. emne, log over fejltyper | Niveauet pr. emne kan ses |
| 4 | Case-motor med forgreninger og 5 cases, regelbibliotek med versionsfelter | Første case kan gennemføres fra start til slut |
| 5 | Fejlfinding med diagrammer | 3 fejltyper kan findes ved måling |
| 6 | Kobling til El-oversigtsappen (opgaver fra egne projekter), prøvesimulering | |
| 7 (valgfri) | AI-retning af forklaringer med egne ord | Kræver API-nøgle eller lille backend |

## Træningsformer (mål)

- Dagens økt: gentagelser, nye kort og regneopgaver blandet på tværs af emner.
- Opgavegeneratorer med tolerance og typiske fejl ("glemt k<sub>temp</sub>").
- Forklar med egne ord og ret efter tjekliste.
- Cases, fx 11 kW-lader i parcelhus: stikledning, I<sub>k</sub>, RCD-type, 722, anmeldelse, dokumentation.
- Fejlfinding: diagram med skjult fejl, vælg målinger, find fejlen.
- "Hvad er galt her?" med billeder eller diagrammer.
- Prøvesimulering med tid og karakter pr. emne.

## Motivation

Beherskelse pr. emne frem for point, stribe med én tilladt fridag, dine hyppigste misforståelser og en ugentlig "boss-opgave".

## Åbne spørgsmål

- Niveau: svendeprøve, autoriseret elinstallatør eller generel faglig dygtighed?
