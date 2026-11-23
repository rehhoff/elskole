# Status: projektets hukommelse

**Læs denne fil først i hver ny session.** Den siger, hvor projektet står, hvad der venter, og hvilke beslutninger og ønsker ejeren allerede har givet, så de ikke skal forklares igen. Opdatér den, før en opgave afsluttes (se `CLAUDE.md`, "Hukommelse").

Sidst opdateret: 2026-11-22.

## Kort fortalt

Elskolen er en dansk webapp, der skal gøre ejeren til en meget dygtig elektriker: matematik og fysik, dimensionering (DS/HD 60364), særlige installationer, love og myndigheder, erhverv og arbejdsmiljø. Den afløser og udvider Anki med opgaver, cases og fejlfinding. Samlet plan: `docs/plan.md`.

- Live: https://rehhoff.github.io/elskole/ (GitHub Pages fra `main` i `rehhoff/elskole`). Udgivet version: **0.3.0**. Version **0.4.0** (skema 3, resultatarten `proeve`) er merget på `main`, men ikke pushet.
- Lokal mappe på ejerens PC: `Desktop\GROUND\elskole`.
- Søsterapp: El-oversigtsappen (`rehhoff/rehhoff.github.io`, lokalt `Desktop\GROUND\rehhoff.github.io`). Separat repo og separat app, men samme origin. Se "Samme origin" nedenfor.

## Faser

| Fase | Indhold | Status |
|---|---|---|
| 0 | Skelet, offline-app, lager, røgtest | Færdig, udgivet i 0.1.0 |
| 1 | FSRS-kort, kortredigering med kilde, Anki-import, 51 startkort i matematik og fysik | Færdig, udgivet i 0.1.0 |
| – | Forberedelse til parallelle faser: skema 2 (`resultater`), faner og modulpladser | På `main`, del af 0.2.0 |
| 2 | Opgavegeneratorer (10 stk., 25 fejlkoder) | Udgivet i 0.2.0 |
| 4 | Cases (5) og regelbibliotek (28 regler, alle `verificeret:false`) | Udgivet i 0.2.0 |
| 5 | Fejlfinding (7 fejltyper, 10 målinger, 5 sikkerhedsregler) | Udgivet i 0.2.0 |
| 3 | Kompetencetræ og log over typiske fejl (fanen Kompetence, tast 7) | Udgivet i 0.3.0 |
| 6 | Kobling til El-oversigtsappen (kun læsning), prøvesimulering (fanen Prøve, tast 8) | Udgivet i 0.3.0. Niveauet kan vælges i fanen, indtil åbent punkt 2 er afgjort |
| 7 | AI-retning af forklaringer | Kræver ejerens beslutning om API-nøgle eller backend |

Erfaring fra merge: `css/tailwind.css` løses ved at tage én side og bygge igen med `python tools/byg_css.py`. Når to faser tilføjer blokke samme sted i `index.html`, så tjek, at hver blok har sin egen `</section></template>`. Ved merge af fase 3 og 6 manglede den, og appen startede ikke.


## Åbne punkter for ejeren

1. **Faglig kontrol af fase 4.** Sessionen var mindst sikker på disse påstande, og de skal tjekkes mod kilden, før reglerne sættes til `verificeret:true`:
   - 701: zone 1 ved bruser uden kar (1,2 m fra udløbet?) og om der er en zone 2
   - 701: RCD ≤ 30 mA for alle grupper til baderum og undtagelserne (SELV, elektrisk adskillelse)
   - 701: stikkontakter uden for zonerne, skærm eller net ved gulvvarme, SELV i zone 0 (12 V AC / 30 V DC)
   - 701: hvornår supplerende potentialudligning kræves
   - Badeværelse-casen: om en renovering udløser krav om RCD i en ældre installation
   - 704: RCD ≤ 500 mA for stikkontakter over 32 A, tavler efter DS/EN 61439-4 med afbryder, der kan låses
   - 722: hvordan kravet om RDC-DD er formuleret, og om 6 mA DC-registrering i laderen gør type A tilstrækkelig
   - 712: skiltenes placering, og hvornår kravet om type B bortfalder
   - Netselskabet: hvornår ladere og små solcelleanlæg skal meldes, plombering af hovedsikringer
   - Autorisationsloven: hvad kvalitetsledelsessystemet kræver af dokumentation til kunden
   - Selektivitet: henvist til DS/HD 60364-5-53 uden afsnit
2. **Niveau:** svendeprøve, autoriseret elinstallatør eller generel faglig dygtighed? Ikke besvaret. Det afgør prioriteringen af emner og prøvesimuleringen (fase 6).
3. **Fase 7:** API-nøgle i browseren eller lille backend? Ikke besluttet.

## Beslutninger og ønsker fra ejeren

- **Sprog:** al brugerflade, dokumentation og commit-beskeder på dansk.
- **To separate apps:** Elskolen og El-oversigtsappen må aldrig ligge i samme repo.
- **Samme origin:** løst ved, at begge service workere kun håndterer egne adresser. El-oversigtsappen fik rettelsen i 10.26.1 (`EGNE` i dens `sw.js`). Elskolen bruger kun nøgler, databaser og caches, der starter med `elskole`.
- **Undersessioner og modeller (2026-11-22):** Opus kun til planlægning, Sonnet til kodning. Afvig kun, hvis det er nødvendigt. Brug parallelle sessioner, hvor opgaver kan køre uafhængigt. Vær så token-effektiv som muligt, men korrekt udførelse går forud.
- **Hvis en undersession ikke kan starte** (mappen ikke godkendt med "Trust repository" i Claude Desktop), så sig det til ejeren og lav opgaven med Sonnet-subagenter i stedet.
- **Merge og push:** spørg ejeren, før faser merges til `main` og før push. Ejeren har sagt ja til hver udgivelse indtil nu.
- **Faglig ærlighed:** opfind aldrig paragraf- eller afsnitsnumre; markér usikkert indhold og vis det i appen.

## Kendte forhold i miljøet

- Windows-PC, ingen npm, Python hedder `python`. `gh` er ikke logget ind: brug almindelig `git push`, og ejeren opretter repos og slår Pages til selv.
- `node_modules/` er ikke i git. Hent bibliotekerne med kommandoerne i `CLAUDE.md` afsnit 2 før røgtesten.
- Claude Desktop kopierer ikke `.git` og `node_modules`, når en session flyttes til en anden mappe. De skal kopieres eller hentes igen.

## Historik i korte træk

- 2026-11-22: Plan lagt. Fase 0–1 bygget og udgivet som 0.1.0. El-oversigtsappen 10.26.1 udgivet med rettelse af service workeren. Forberedelse til parallelle faser committet. Fase 2, 4 og 5 bygget i tre sessioner og udgivet som 0.2.0.
- 2026-11-23: Fase 3 (Sonnet) og fase 6 (planlagt af Opus, kodet af Sonnet) udgivet som 0.3.0. Skema 3 med resultatarten `proeve` merget som 0.4.0 (kodet af Sonnet, gennemgået af Opus).
