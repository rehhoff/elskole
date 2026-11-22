/* Fase 2: opgavegeneratorer (regneopgaver med nye tal hver gang og trinvis løsning). Fanen "Opgaver" vises, når opgStart() findes.
   Metoder og felter starter med "opg", så de ikke støder sammen med andre filer i bland(). Resultater gemmes med this.tilfoejResultat().
   Alt, der ligger i globalt scope (uden for APP_OPGAVER), starter med OPG_ eller opg.

   Generator: { id, navn, emne, niveau 1–3, lav(rng) }. lav() giver { tekst, svar:[{ id, navn, enhed, vaerdi, tol }], trin:[…],
   typiskeFejl:[{ fejltype, svar, vaerdi, forklaring }], inddata }. inddata er de rå tal og bruges kun af røgtesten.
   Tekst, trin og forklaringer vises med vis(): $formel$ er KaTeX, tal i teksten skrives med decimalkomma (OPG_T), i formler med {,} (OPG_M).
   Forudsætninger: ρ = 0,0225 Ω·mm²/m, 230/400 V, cos φ = 1, medmindre opgaven siger andet (som El-oversigtsappen). Alt er vejledende. */

/* ---------- Seedet tilfældighed (mulberry32): samme seed giver samme opgave ---------- */
function opgRng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.heltal = (lav, hoej) => lav + Math.floor(r() * (hoej - lav + 1));
  r.vael = liste => liste[Math.floor(r() * liste.length)];
  r.trin = (lav, hoej, skridt) => Math.round((lav + skridt * Math.floor(r() * (Math.round((hoej - lav) / skridt) + 1))) * 1e6) / 1e6;
  return r;
}

/* ---------- Tal og tekst ---------- */
const OPG_RHO = 0.0225, OPG_S3 = Math.sqrt(3), OPG_TOL = 0.02;
const OPG_R = String.raw;
const OPG_SIG = (x, n) => Number(Number(x).toPrecision(n || 3));
const OPG_T = (x, n) => String(OPG_SIG(x, n || 3)).replace('.', ',');           // i almindelig tekst: 4,7
const OPG_M = (x, n) => String(OPG_SIG(x, n || 3)).replace('.', '{,}');         // i en formel: 4{,}7
const OPG_STD_SIKRING = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
const OPG_KURVE = { B:5, C:10, D:20 };

/* Korte, stabile fejlkoder (fase 3 bygger på dem). Nye koder må tilføjes, gamle må aldrig omdøbes. */
const OPG_FEJLNAVNE = {
  'glemt-faktor2':'Glemt faktor 2 (frem og tilbage)', 'faktor2-for-meget':'Faktor 2 brugt, hvor den ikke hører hjemme', 'glemt-sqrt3':'Glemt √3',
  'sqrt3-forkert':'√3 brugt forkert', 'sqrt3-i-1faset':'√3 brugt i et 1-faset udtryk', 'forkert-spaending':'Forkert spænding (230 V mod 400 V)',
  'glemt-cosphi':'Glemt cos φ', 'cosphi-vendt':'cos φ ganget, hvor der skal divideres (eller omvendt)', 'kva-kw':'kVA forvekslet med kW',
  'enhed-1000':'Enhed forvekslet (faktor 1000)', 'mm2-radius':'mm² forvekslet med radius', 'byttet-formel':'Formlen vendt forkert',
  'glemt-ktemp':'Glemt k_temp', 'glemt-ksamlet':'Glemt k_samlet', 'divideret-med-k':'Divideret med korrektionsfaktorerne i stedet for at gange',
  'glemt-23':'Glemt faktoren 2/3', 'forkert-kurve':'Forkert udløserkurve (B/C/D)', 'glemt-tillaeg':'Glemt tillægget for lederens temperatur',
  'forkert-tillaeg':'Forkert tillæg (PVC 1,2 mod XLPE 1,28)', 'glemt-pe':'Glemt PE-lederens modstand', 'glemt-ze':'Glemt Z_e',
  'glemt-cmin':'Glemt c_min = 0,95', 'cos-for-tan':'cos brugt i stedet for tan', 'glemt-maalcos':'Glemt den ønskede cos φ',
  'forkert-sikring':'Forkert valg af sikring (rundet op eller ikke standardværdi)'
};

/* ---------- Generatorer ---------- */
function opgSvar(id, navn, enhed, vaerdi, tol) { return { id, navn, enhed, vaerdi, tol: tol || OPG_TOL }; }
function opgFejl(fejltype, svar, vaerdi, forklaring) { return { fejltype, svar, vaerdi, forklaring }; }

const OPG_GENERATORER = [
  /* 1. Ohms lov */
  { id:'ohm', navn:'Ohms lov', emne:'mat', niveau:1, lav(r) {
    const v = r.vael(['I', 'U', 'R']), kilo = r.vael([false, true]), U0 = r.vael([12, 24, 48, 110, 230, 400]);
    const Rv = kilo ? r.vael([1, 1.5, 2.2, 3.3, 4.7, 6.8, 10, 22]) : r.vael([10, 15, 22, 33, 47, 68, 100, 150, 220, 330, 470]);   // i den viste enhed
    const Iv = kilo ? r.vael([0.5, 1, 2, 5, 10, 20, 30]) : r.vael([0.5, 1, 2, 4, 6, 10, 13, 16]);                                  // i den viste enhed
    const Ru = kilo ? 'kΩ' : 'Ω', Iu = kilo ? 'mA' : 'A', Rohm = kilo ? Rv * 1000 : Rv, Ia = kilo ? Iv / 1000 : Iv;
    const tR = OPG_T(Rv), tI = OPG_T(Iv), mR = OPG_M(Rv), mI = OPG_M(Iv), mU = OPG_M(U0);
    const eR = kilo ? OPG_R`\text{k}\Omega` : OPG_R`\Omega`, eI = kilo ? OPG_R`\text{mA}` : OPG_R`\text{A}`;
    if (v === 'I') {
      const I = U0 / Rohm * (kilo ? 1000 : 1);
      return { tekst:`En modstand på $R = ${mR}\\,${eR}$ er tilsluttet $U = ${mU}\\,\\text{V}$. Hvor stor er strømmen?`, inddata:{ variant:'I', U:U0, R:Rohm, kilo },
        svar:[opgSvar('i', 'Strømmen I', Iu, I)],
        trin:[OPG_R`Ohms lov: $U = R \cdot I$, så $I = \dfrac{U}{R}$.`, `Brug ${kilo ? 'kΩ sammen med mA' : 'Ω sammen med A'}, så bliver enhederne rigtige uden omregning${kilo ? ' (V / kΩ = mA)' : ''}.`,
          OPG_R`$I = \dfrac{${mU}\,\text{V}}{${mR}\,${eR}} = ${OPG_M(I)}\,${eI}$`],
        typiskeFejl:[opgFejl('byttet-formel', 'i', Rohm / U0 * (kilo ? 1000 : 1), OPG_R`Du har regnet $R/U$ i stedet for $U/R$.`),
          opgFejl('enhed-1000', 'i', I * 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.'), opgFejl('enhed-1000', 'i', I / 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.')] };
    }
    if (v === 'U') {
      const U = Rohm * Ia;
      return { tekst:`Gennem en modstand på $R = ${mR}\\,${eR}$ løber $I = ${mI}\\,${eI}$. Hvor stor er spændingen over modstanden?`, inddata:{ variant:'U', R:Rohm, I:Ia, kilo },
        svar:[opgSvar('u', 'Spændingen U', 'V', U)],
        trin:[OPG_R`Ohms lov: $U = R \cdot I$.`, `Brug ${kilo ? 'kΩ sammen med mA' : 'Ω sammen med A'}.`, OPG_R`$U = ${mR}\,${eR} \cdot ${mI}\,${eI} = ${OPG_M(U)}\,\text{V}$`],
        typiskeFejl:[opgFejl('byttet-formel', 'u', Iv / Rv, OPG_R`Du har regnet $I/R$ i stedet for $R \cdot I$.`),
          opgFejl('enhed-1000', 'u', U * 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.'), opgFejl('enhed-1000', 'u', U / 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.')] };
    }
    const R = U0 / Iv;
    return { tekst:`Over en belastning er der $U = ${mU}\\,\\text{V}$, og der løber $I = ${mI}\\,${eI}$. Hvor stor er modstanden?`, inddata:{ variant:'R', U:U0, I:Ia, kilo },
      svar:[opgSvar('r', 'Modstanden R', Ru, R)],
      trin:[OPG_R`Ohms lov: $U = R \cdot I$, så $R = \dfrac{U}{I}$.`, `Brug ${kilo ? 'V sammen med mA, så fås kΩ' : 'V sammen med A, så fås Ω'}.`, OPG_R`$R = \dfrac{${mU}\,\text{V}}{${mI}\,${eI}} = ${OPG_M(R)}\,${eR}$`],
      typiskeFejl:[opgFejl('byttet-formel', 'r', Iv / U0, OPG_R`Du har regnet $I/U$ i stedet for $U/I$.`),
        opgFejl('enhed-1000', 'r', R * 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.'), opgFejl('enhed-1000', 'r', R / 1000, 'Enheden er forvekslet: kΩ og mA hænger sammen, Ω og A hænger sammen.')] };
  } },

  /* 2. Effekt, 1-faset */
  { id:'effekt1', navn:'Effekt, 1-faset', emne:'mat', niveau:1, lav(r) {
    const U = 230, cos = r.vael([1, 0.95, 0.9, 0.85, 0.8, 0.75]), cosTxt = cos === 1 ? '$\\cos\\varphi = 1$' : `$\\cos\\varphi = ${OPG_M(cos)}$`;
    if (r.vael(['I', 'P']) === 'I') {
      const P = r.trin(0.4, 3.6, 0.2), I = P * 1000 / (U * cos);
      return { tekst:`En 1-faset forbruger på ${OPG_T(P)} kW, ${cosTxt}, er tilsluttet 230 V. Hvor stor er strømmen?`, inddata:{ variant:'I', P, cos },
        svar:[opgSvar('i', 'Strømmen I', 'A', I)],
        trin:[OPG_R`$P = U \cdot I \cdot \cos\varphi$, så $I = \dfrac{P}{U \cdot \cos\varphi}$.`, `Omregn effekten til watt: ${OPG_T(P)} kW = ${OPG_T(P * 1000)} W.`,
          OPG_R`$I = \dfrac{${OPG_M(P * 1000)}\,\text{W}}{230\,\text{V} \cdot ${OPG_M(cos)}} = ${OPG_M(I)}\,\text{A}$`],
        typiskeFejl:[opgFejl('glemt-cosphi', 'i', P * 1000 / U, OPG_R`Du har ikke divideret med $\cos\varphi$.`), opgFejl('cosphi-vendt', 'i', P * 1000 * cos / U, OPG_R`Du har ganget med $\cos\varphi$ i stedet for at dividere.`),
          opgFejl('enhed-1000', 'i', I / 1000, 'Du har brugt kW som om det var W.'), opgFejl('forkert-spaending', 'i', P * 1000 / (400 * cos), 'Du har brugt 400 V. Et 1-faset udtag er 230 V.')] };
    }
    const I = r.vael([2, 3, 4, 5, 6, 8, 10, 13, 16]), P = U * I * cos / 1000;
    return { tekst:`En 1-faset forbruger trækker ${OPG_T(I)} A fra 230 V, ${cosTxt}. Hvor stor er den optagne effekt i kW?`, inddata:{ variant:'P', I, cos },
      svar:[opgSvar('p', 'Effekten P', 'kW', P)],
      trin:[OPG_R`$P = U \cdot I \cdot \cos\varphi$.`, OPG_R`$P = 230\,\text{V} \cdot ${OPG_M(I)}\,\text{A} \cdot ${OPG_M(cos)} = ${OPG_M(P * 1000)}\,\text{W}$`, `Omregn til kW: ${OPG_T(P)} kW.`],
      typiskeFejl:[opgFejl('glemt-cosphi', 'p', U * I / 1000, OPG_R`Du har ikke ganget med $\cos\varphi$.`), opgFejl('cosphi-vendt', 'p', U * I / cos / 1000, OPG_R`Du har divideret med $\cos\varphi$ i stedet for at gange.`),
        opgFejl('enhed-1000', 'p', P * 1000, 'Svaret er i W, men du skulle give det i kW.'), opgFejl('forkert-spaending', 'p', 400 * I * cos / 1000, 'Du har brugt 400 V. Et 1-faset udtag er 230 V.')] };
  } },

  /* 3. Effekt og strøm, 3-faset med cos φ */
  { id:'effekt3', navn:'Effekt og strøm, 3-faset', emne:'mat', niveau:2, lav(r) {
    const cos = r.vael([0.75, 0.8, 0.82, 0.85, 0.88, 0.9, 0.92]), mc = OPG_M(cos);
    if (r.vael(['PI', 'SP']) === 'PI') {
      const P = r.vael([2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22]), I = P * 1000 / (OPG_S3 * 400 * cos), S = P / cos;
      return { tekst:`En 3-faset motor optager ${OPG_T(P)} kW fra 3 × 400 V med $\\cos\\varphi = ${mc}$. Find strømmen og den tilsyneladende effekt.`, inddata:{ variant:'PI', P, cos },
        svar:[opgSvar('i', 'Strømmen I', 'A', I), opgSvar('s', 'Tilsyneladende effekt S', 'kVA', S)],
        trin:[OPG_R`$P = \sqrt{3} \cdot U \cdot I \cdot \cos\varphi$, så $I = \dfrac{P}{\sqrt{3} \cdot U \cdot \cos\varphi}$ (U er hovedspændingen, 400 V).`,
          OPG_R`$I = \dfrac{${OPG_M(P * 1000)}\,\text{W}}{\sqrt{3} \cdot 400\,\text{V} \cdot ${mc}} = ${OPG_M(I)}\,\text{A}$`,
          OPG_R`$S = \dfrac{P}{\cos\varphi} = \dfrac{${OPG_M(P)}\,\text{kW}}{${mc}} = ${OPG_M(S)}\,\text{kVA}$`],
        typiskeFejl:[opgFejl('glemt-sqrt3', 'i', P * 1000 / (400 * cos), OPG_R`Du har glemt $\sqrt{3}$.`), opgFejl('sqrt3-forkert', 'i', P * 1000 / (3 * 400 * cos), OPG_R`Du har brugt 3 i stedet for $\sqrt{3}$.`),
          opgFejl('sqrt3-forkert', 'i', P * 1000 * OPG_S3 / (400 * cos), OPG_R`Du har ganget med $\sqrt{3}$ i stedet for at dividere.`), opgFejl('glemt-cosphi', 'i', P * 1000 / (OPG_S3 * 400), OPG_R`Du har ikke divideret med $\cos\varphi$.`),
          opgFejl('cosphi-vendt', 'i', P * 1000 * cos / (OPG_S3 * 400), OPG_R`Du har ganget med $\cos\varphi$ i stedet for at dividere.`), opgFejl('forkert-spaending', 'i', P * 1000 / (OPG_S3 * 230 * cos), 'Du har brugt 230 V. I formlen med √3 er det hovedspændingen, 400 V.'),
          opgFejl('enhed-1000', 'i', I / 1000, 'Du har brugt kW som om det var W.'),
          opgFejl('kva-kw', 's', P, 'Du har givet kW (P) som svar. kVA er den tilsyneladende effekt S.'), opgFejl('cosphi-vendt', 's', P * cos, OPG_R`Du har ganget med $\cos\varphi$. $S = P / \cos\varphi$.`)] };
    }
    const S = r.vael([5, 10, 16, 25, 40, 63, 100]), P = S * cos, I = S * 1000 / (OPG_S3 * 400);
    return { tekst:`En 3-faset forbruger er opgivet til ${OPG_T(S)} kVA ved 3 × 400 V med $\\cos\\varphi = ${mc}$. Find den virkelige effekt og strømmen.`, inddata:{ variant:'SP', S, cos },
      svar:[opgSvar('p', 'Virkelig effekt P', 'kW', P), opgSvar('i', 'Strømmen I', 'A', I)],
      trin:[OPG_R`kVA er den tilsyneladende effekt $S$. Den virkelige effekt er $P = S \cdot \cos\varphi = ${OPG_M(S)}\,\text{kVA} \cdot ${mc} = ${OPG_M(P)}\,\text{kW}$.`,
        OPG_R`Strømmen følger af $S$, ikke af $P$: $I = \dfrac{S}{\sqrt{3} \cdot U} = \dfrac{${OPG_M(S * 1000)}\,\text{VA}}{\sqrt{3} \cdot 400\,\text{V}} = ${OPG_M(I)}\,\text{A}$`],
      typiskeFejl:[opgFejl('kva-kw', 'p', S, 'Du har brugt kVA som om det var kW.'), opgFejl('cosphi-vendt', 'p', S / cos, OPG_R`Du har divideret med $\cos\varphi$. $P = S \cdot \cos\varphi$.`),
        opgFejl('kva-kw', 'i', P * 1000 / (OPG_S3 * 400), 'Du har regnet strømmen ud fra kW. Strømmen følger af kVA (S).'), opgFejl('glemt-sqrt3', 'i', S * 1000 / 400, OPG_R`Du har glemt $\sqrt{3}$.`),
        opgFejl('enhed-1000', 'i', I / 1000, 'Du har brugt kVA som om det var VA.')] };
  } },

  /* 4. Ledermodstand */
  { id:'ledermodstand', navn:'Ledermodstand', emne:'dim', niveau:1, lav(r) {
    const L = r.trin(5, 120, 5), A = r.vael([1.5, 2.5, 4, 6, 10, 16, 25]), R1 = OPG_RHO * L / A, R2 = 2 * R1;
    return { tekst:`Et kobberkabel har tværsnittet ${OPG_T(A)} mm² og er ${OPG_T(L)} m langt. Brug $\\rho = 0{,}0225\\,\\Omega\\cdot\\text{mm}^2/\\text{m}$. Find modstanden i én leder og i fase og nul samlet (frem og tilbage).`, inddata:{ L, A },
      svar:[opgSvar('r1', 'Modstand i én leder', 'Ω', R1), opgSvar('r2', 'Fase og nul samlet', 'Ω', R2)],
      trin:[OPG_R`$R = \dfrac{\rho \cdot L}{A}$ (længden i m, tværsnittet i mm²).`, OPG_R`Én leder: $R = \dfrac{0{,}0225 \cdot ${OPG_M(L)}}{${OPG_M(A)}} = ${OPG_M(R1)}\,\Omega$`,
        OPG_R`Strømmen går ud i faseleder og tilbage i nul, så sløjfen er to ledere: $R = 2 \cdot ${OPG_M(R1)} = ${OPG_M(R2)}\,\Omega$`],
      typiskeFejl:[opgFejl('mm2-radius', 'r1', OPG_RHO * L / (Math.PI * A * A), `Du har brugt ${OPG_T(A)} mm² som radius. Tværsnitsarealet er allerede opgivet i mm², og det skal bruges direkte.`),
        opgFejl('faktor2-for-meget', 'r1', R2, 'Du har allerede ganget med 2. Spørgsmålet gælder én leder.'),
        opgFejl('glemt-faktor2', 'r2', R1, 'Du har kun regnet én leder. Sløjfen er frem og tilbage, altså to ledere.'),
        opgFejl('mm2-radius', 'r2', 2 * OPG_RHO * L / (Math.PI * A * A), OPG_R`Du har brugt mm² som radius.`)] };
  } },

  /* 5. ΔU, 1-faset */
  { id:'du1', navn:'Spændingsfald, 1-faset', emne:'dim', niveau:2, lav(r) {
    const L = r.trin(10, 80, 5), A = r.vael([1.5, 2.5, 4, 6, 10]), I = r.vael([6, 10, 13, 16, 20, 25]), dU = 2 * OPG_RHO * L * I / A, p = dU / 230 * 100;
    return { tekst:`En 1-faset gruppe (230 V, $\\cos\\varphi = 1$) er ${OPG_T(L)} m lang, kablet er ${OPG_T(A)} mm² kobber, og strømmen er ${OPG_T(I)} A. Brug $\\rho = 0{,}0225\\,\\Omega\\cdot\\text{mm}^2/\\text{m}$. Find spændingsfaldet i volt og i procent.`, inddata:{ L, A, I },
      svar:[opgSvar('du', 'Spændingsfald ΔU', 'V', dU), opgSvar('pct', 'Spændingsfald', '%', p)],
      trin:[OPG_R`1-faset går strømmen frem og tilbage: $\Delta U = \dfrac{2 \cdot \rho \cdot L \cdot I}{A}$.`,
        OPG_R`$\Delta U = \dfrac{2 \cdot 0{,}0225 \cdot ${OPG_M(L)} \cdot ${OPG_M(I)}}{${OPG_M(A)}} = ${OPG_M(dU)}\,\text{V}$`, OPG_R`$\dfrac{${OPG_M(dU)}\,\text{V}}{230\,\text{V}} \cdot 100 = ${OPG_M(p)}\,\%$`,
        p > 3 ? 'Det er over 3 %, som er grænsen for lys.' + (p > 5 ? ' Det er også over 5 %.' : ' Til andet end lys er grænsen 5 %.') : 'Det er under 3 %.'],
      typiskeFejl:[opgFejl('glemt-faktor2', 'du', dU / 2, 'Du har glemt faktor 2: strømmen går både frem og tilbage.'), opgFejl('sqrt3-i-1faset', 'du', OPG_S3 * OPG_RHO * L * I / A, OPG_R`Du har brugt $\sqrt{3}$. Den hører til 3-faset. 1-faset er det $2 \cdot L$.`),
        opgFejl('mm2-radius', 'du', 2 * OPG_RHO * L * I / (Math.PI * A * A), 'Du har brugt mm² som radius.'),
        opgFejl('glemt-faktor2', 'pct', p / 2, 'Du har glemt faktor 2: strømmen går både frem og tilbage.'), opgFejl('sqrt3-i-1faset', 'pct', OPG_S3 * OPG_RHO * L * I / A / 230 * 100, OPG_R`Du har brugt $\sqrt{3}$ i et 1-faset udtryk.`),
        opgFejl('forkert-spaending', 'pct', dU / 400 * 100, 'Du har delt med 400 V. 1-faset er det 230 V.'), opgFejl('mm2-radius', 'pct', 2 * OPG_RHO * L * I / (Math.PI * A * A) / 230 * 100, 'Du har brugt mm² som radius.')] };
  } },

  /* 6. ΔU, 3-faset */
  { id:'du3', navn:'Spændingsfald, 3-faset', emne:'dim', niveau:2, lav(r) {
    const L = r.trin(10, 150, 5), A = r.vael([2.5, 4, 6, 10, 16, 25, 35, 50]), I = r.vael([10, 16, 20, 25, 32, 40, 50, 63]), dU = OPG_S3 * OPG_RHO * L * I / A, p = dU / 400 * 100;
    return { tekst:`En 3-faset gruppe (3 × 400 V, $\\cos\\varphi = 1$) er ${OPG_T(L)} m lang, kablet er ${OPG_T(A)} mm² kobber, og strømmen er ${OPG_T(I)} A pr. fase. Brug $\\rho = 0{,}0225\\,\\Omega\\cdot\\text{mm}^2/\\text{m}$. Find spændingsfaldet i volt og i procent.`, inddata:{ L, A, I },
      svar:[opgSvar('du', 'Spændingsfald ΔU', 'V', dU), opgSvar('pct', 'Spændingsfald', '%', p)],
      trin:[OPG_R`3-faset ved symmetrisk last: $\Delta U = \dfrac{\sqrt{3} \cdot \rho \cdot L \cdot I}{A}$ (mellem faserne, 400 V).`,
        OPG_R`$\Delta U = \dfrac{\sqrt{3} \cdot 0{,}0225 \cdot ${OPG_M(L)} \cdot ${OPG_M(I)}}{${OPG_M(A)}} = ${OPG_M(dU)}\,\text{V}$`, OPG_R`$\dfrac{${OPG_M(dU)}\,\text{V}}{400\,\text{V}} \cdot 100 = ${OPG_M(p)}\,\%$`,
        p > 3 ? 'Det er over 3 %, som er grænsen for lys.' + (p > 5 ? ' Det er også over 5 %.' : ' Til andet end lys er grænsen 5 %.') : 'Det er under 3 %.'],
      typiskeFejl:[opgFejl('faktor2-for-meget', 'du', 2 * OPG_RHO * L * I / A, OPG_R`Du har brugt 2 (den 1-fasede formel). 3-faset er det $\sqrt{3}$.`), opgFejl('glemt-sqrt3', 'du', OPG_RHO * L * I / A, OPG_R`Du har glemt $\sqrt{3}$.`),
        opgFejl('mm2-radius', 'du', OPG_S3 * OPG_RHO * L * I / (Math.PI * A * A), 'Du har brugt mm² som radius.'),
        opgFejl('faktor2-for-meget', 'pct', 2 * OPG_RHO * L * I / A / 400 * 100, OPG_R`Du har brugt 2 i stedet for $\sqrt{3}$.`), opgFejl('glemt-sqrt3', 'pct', OPG_RHO * L * I / A / 400 * 100, OPG_R`Du har glemt $\sqrt{3}$.`),
        opgFejl('forkert-spaending', 'pct', dU / 230 * 100, 'Du har delt med 230 V. 3-faset ΔU måles mellem faserne, så det er 400 V.'), opgFejl('mm2-radius', 'pct', OPG_S3 * OPG_RHO * L * I / (Math.PI * A * A) / 400 * 100, 'Du har brugt mm² som radius.')] };
  } },

  /* 7. Iz med korrektionsfaktorer */
  { id:'iz', navn:'Strømværdi Iz med korrektionsfaktorer', emne:'dim', niveau:3, lav(r) {
    let iso, n, metode, i, temp, kredse, It, kt, ks, Iz;
    do {
      iso = r.vael(['PVC', 'XLPE']); n = r.vael([2, 3]); metode = r.vael(['A2', 'B2', 'C', 'E']); i = r.heltal(0, 8); temp = r.vael([25, 35, 40, 45, 50]); kredse = r.vael([2, 3, 4, 6]);
      It = OPG_IZ_TAB[iso][n][metode][i]; kt = OPG_KTEMP[iso][temp]; ks = OPG_KSAMLET[kredse]; Iz = Math.round(It * kt * ks * 10) / 10;
    } while (Iz < 8);
    const A = OPG_IZ_TV[i], In = Math.max(...OPG_STD_SIKRING.filter(x => x <= Iz)), opNaeste = OPG_STD_SIKRING.find(x => x > Iz);
    const isoTxt = iso === 'PVC' ? 'PVC-isoleret (70 °C)' : 'XLPE-isoleret (90 °C)', mkt = OPG_M(kt, 3), mks = OPG_M(ks, 3);
    const stdFra = z => Math.max(0, ...OPG_STD_SIKRING.filter(x => x <= z));
    const fejlIz = (kode, v, tekst) => [opgFejl(kode, 'iz', v, tekst), opgFejl(kode, 'in', stdFra(v), tekst)];
    return { tekst:`Et ${isoTxt} flerlederkabel, ${n} belastede ledere, ${OPG_T(A)} mm² kobber, ligger efter metode ${metode} i luft. Omgivelsestemperaturen er ${temp} °C, og kablet ligger sammen med ${kredse} kredse i alt, bundtet. Fra DS/HD 60364-5-52 anneks B er tabelværdien $I_t = ${OPG_M(It)}\\,\\text{A}$, $k_{temp} = ${mkt}$ og $k_{samlet} = ${mks}$. Find den korrigerede strømværdi og den største almindelige sikring.`,
      inddata:{ iso, n, metode, i, A, temp, kredse, It, kt, ks },
      svar:[opgSvar('iz', 'Strømværdi $I_z$', 'A', Iz, 0.015), opgSvar('in', 'Største sikring $I_n$', 'A', In, 0.001)],
      trin:[OPG_R`$I_z = I_t \cdot k_{temp} \cdot k_{samlet}$. Begge faktorer er under 1, når temperaturen er over 30 °C, eller kablerne ligger sammen, så strømværdien bliver mindre end tabelværdien.`,
        OPG_R`$I_z = ${OPG_M(It)}\,\text{A} \cdot ${mkt} \cdot ${mks} = ${OPG_M(Iz)}\,\text{A}$`,
        OPG_R`Sikringen skal opfylde $I_n \le I_z$. Vælg den største almindelige sikring, der ikke overstiger ${OPG_T(Iz)} A: ${OPG_T(In)} A.`,
        `Kilder: tabelværdi fra B.52.2–B.52.5 og B.52.10/B.52.12, k_temp fra B.52.14 og k_samlet fra B.52.17 (vejledende, kontrollér altid i standarden).`],
      typiskeFejl:[...fejlIz('glemt-ktemp', It * ks, OPG_R`Du har glemt $k_{temp}$.`), ...fejlIz('glemt-ksamlet', It * kt, OPG_R`Du har glemt $k_{samlet}$.`),
        ...fejlIz('divideret-med-k', It / (kt * ks), 'Du har divideret med faktorerne i stedet for at gange. Faktorerne sænker strømværdien, når forholdene er dårligere end tabellen.'),
        ...(opNaeste ? [opgFejl('forkert-sikring', 'in', opNaeste, OPG_R`Du har rundet op. Sikringen må ikke være større end $I_z$.`)] : []), opgFejl('forkert-sikring', 'in', Iz, OPG_R`$I_n$ skal være en almindelig sikringsstørrelse (6, 10, 13, 16, 20, 25 A …), ikke selve $I_z$.`)] };
  } },

  /* 8. Største Zs for udkobling */
  { id:'zs', navn:'Største Zs for udkobling', emne:'dim', niveau:2, lav(r) {
    const In = r.vael([6, 10, 13, 16, 20, 25, 32, 40, 50, 63]), kurve = r.vael(['B', 'C', 'D']), U0 = 230, k = OPG_KURVE[kurve], Ia = k * In, Zs = 2 / 3 * U0 / Ia;
    const andre = ['B', 'C', 'D'].filter(x => x !== kurve);
    return { tekst:`En gruppe har en automatsikring ${kurve}${In} (karakteristik ${kurve}, ${OPG_T(In)} A), $U_0 = 230\\,\\text{V}$. Find udkoblingsstrømmen $I_a$ og den største sløjfeimpedans $Z_s$, hvor sikringen kobler ud ved en måling.`, inddata:{ In, kurve, k },
      svar:[opgSvar('ia', 'Udkoblingsstrøm $I_a$', 'A', Ia), opgSvar('zs', 'Største $Z_s$', 'Ω', Zs)],
      trin:[OPG_R`$I_a = k \cdot I_n$ med $k = 5$ for B, $10$ for C og $20$ for D. Her: $I_a = ${k} \cdot ${OPG_M(In)}\,\text{A} = ${OPG_M(Ia)}\,\text{A}$`,
        OPG_R`Målt værdi skal opfylde $Z_s \le \dfrac{2}{3} \cdot \dfrac{U_0}{I_a}$ (de 2/3 giver plads til, at lederne er varmere, end da der blev målt).`,
        OPG_R`$Z_s \le \dfrac{2}{3} \cdot \dfrac{${OPG_M(U0)}\,\text{V}}{${OPG_M(Ia)}\,\text{A}} = ${OPG_M(Zs)}\,\Omega$`],
      typiskeFejl:[...andre.map(x => opgFejl('forkert-kurve', 'ia', OPG_KURVE[x] * In, `Du har brugt faktoren for karakteristik ${x}. Her er det ${kurve} (k = ${k}).`)),
        opgFejl('glemt-23', 'zs', U0 / Ia, OPG_R`Du har glemt faktoren $2/3$.`), opgFejl('forkert-spaending', 'zs', 2 / 3 * 400 / Ia, 'Du har brugt 400 V. U₀ er fase mod jord, 230 V.'),
        ...andre.map(x => opgFejl('forkert-kurve', 'zs', 2 / 3 * U0 / (OPG_KURVE[x] * In), `Du har brugt faktoren for karakteristik ${x}. Her er det ${kurve} (k = ${k}).`))] };
  } },

  /* 9. Ik,min */
  { id:'ik', navn:'Mindste kortslutningsstrøm Ik,min', emne:'dim', niveau:3, lav(r) {
    const Ze = r.vael([0.15, 0.2, 0.3, 0.4, 0.5, 0.8]), L = r.trin(10, 100, 5), A = r.vael([1.5, 2.5, 4, 6, 10]), iso = r.vael(['PVC', 'XLPE']), m = iso === 'PVC' ? 1.2 : 1.28, mAnden = iso === 'PVC' ? 1.28 : 1.2;
    const In = r.vael([10, 13, 16, 20, 25]), kurve = r.vael(['B', 'C', 'D']), k = OPG_KURVE[kurve], Ia = k * In;
    const R = OPG_RHO * L / A * m, Ik = 0.95 * 230 / (Ze + 2 * R), andre = ['B', 'C', 'D'].filter(x => x !== kurve);
    return { tekst:`Yderst på en gruppe er kablet ${OPG_T(A)} mm² kobber, ${OPG_T(L)} m, ${iso}-isoleret. PE-lederen har samme tværsnit. Tavlens $Z_e = ${OPG_M(Ze)}\\,\\Omega$. Sikringen er ${kurve}${In}. Brug $\\rho = 0{,}0225\\,\\Omega\\cdot\\text{mm}^2/\\text{m}$, $c_{min} = 0{,}95$ og $U_0 = 230\\,\\text{V}$. Find den mindste kortslutningsstrøm og udkoblingsstrømmen.`,
      inddata:{ Ze, L, A, iso, m, In, kurve, k },
      svar:[opgSvar('ik', 'Mindste kortslutningsstrøm $I_{k,min}$', 'A', Ik), opgSvar('ia', 'Udkoblingsstrøm $I_a$', 'A', Ia)],
      trin:[OPG_R`Ledermodstand ved høj temperatur: $R = \dfrac{\rho \cdot L}{A} \cdot m$ med $m = 1{,}2$ for PVC og $1{,}28$ for XLPE. Her ${iso}: $R = \dfrac{0{,}0225 \cdot ${OPG_M(L)}}{${OPG_M(A)}} \cdot ${OPG_M(m)} = ${OPG_M(R)}\,\Omega$ (fase, og det samme for PE).`,
        OPG_R`$I_{k,min} = \dfrac{0{,}95 \cdot U_0}{Z_e + R_{fase} + R_{PE}} = \dfrac{0{,}95 \cdot 230}{${OPG_M(Ze)} + ${OPG_M(R)} + ${OPG_M(R)}} = ${OPG_M(Ik)}\,\text{A}$`,
        OPG_R`$I_a = ${k} \cdot ${OPG_M(In)}\,\text{A} = ${OPG_M(Ia)}\,\text{A}$ (${kurve}).`,
        Ik >= Ia ? OPG_R`$I_{k,min} \ge I_a$: sikringen kobler ud i tide.` : OPG_R`$I_{k,min} < I_a$: sikringen kobler ikke sikkert ud. Kortere kabel, større tværsnit eller en anden sikring.`],
      typiskeFejl:[opgFejl('glemt-pe', 'ik', 0.95 * 230 / (Ze + R), 'Du har kun regnet faselederen med. Strømmen går også tilbage gennem PE.'),
        opgFejl('glemt-ze', 'ik', 0.95 * 230 / (2 * R), OPG_R`Du har glemt $Z_e$ (tavlens impedans).`), opgFejl('glemt-tillaeg', 'ik', 0.95 * 230 / (Ze + 2 * OPG_RHO * L / A), `Du har glemt tillægget ${OPG_T(m)} for lederens temperatur.`),
        opgFejl('forkert-tillaeg', 'ik', 0.95 * 230 / (Ze + 2 * OPG_RHO * L / A * mAnden), `Du har brugt tillægget ${OPG_T(mAnden)}. For ${iso} er det ${OPG_T(m)}.`),
        opgFejl('glemt-cmin', 'ik', 230 / (Ze + 2 * R), OPG_R`Du har glemt $c_{min} = 0{,}95$.`), opgFejl('forkert-spaending', 'ik', 0.95 * 400 / (Ze + 2 * R), 'Du har brugt 400 V. U₀ er 230 V.'),
        ...andre.map(x => opgFejl('forkert-kurve', 'ia', OPG_KURVE[x] * In, `Du har brugt faktoren for karakteristik ${x}. Her er det ${kurve} (k = ${k}).`))] };
  } },

  /* 10. Kondensatoreffekt til kompensering */
  { id:'kompensering', navn:'Kondensatoreffekt til kompensering', emne:'dim', niveau:3, lav(r) {
    const P = r.vael([10, 15, 20, 30, 40, 55, 75, 100]), c1 = r.vael([0.6, 0.65, 0.7, 0.75, 0.8, 0.85]), c2 = r.vael([0.9, 0.95, 0.98]);
    const t1 = Math.tan(Math.acos(c1)), t2 = Math.tan(Math.acos(c2)), Qc = P * (t1 - t2), Ic = Qc * 1000 / (OPG_S3 * 400), S1 = P / c1;
    return { tekst:`En 3-faset belastning på ${OPG_T(P)} kW har $\\cos\\varphi = ${OPG_M(c1)}$ ved 3 × 400 V. Den skal kompenseres til $\\cos\\varphi = ${OPG_M(c2)}$. Find kondensatorbatteriets effekt og den strøm, det trækker.`, inddata:{ P, c1, c2 },
      svar:[opgSvar('qc', 'Kondensatoreffekt $Q_c$', 'kvar', Qc, 0.03), opgSvar('ic', 'Kondensatorstrøm', 'A', Ic, 0.03)],
      trin:[OPG_R`Den virkelige effekt $P$ ændres ikke ved kompensering. Kun den reaktive effekt falder: $Q_c = P \cdot (\tan\varphi_1 - \tan\varphi_2)$.`,
        OPG_R`$\tan\varphi_1 = \tan(\arccos ${OPG_M(c1)}) = ${OPG_M(t1, 4)}$ og $\tan\varphi_2 = \tan(\arccos ${OPG_M(c2)}) = ${OPG_M(t2, 4)}$`,
        OPG_R`$Q_c = ${OPG_M(P)}\,\text{kW} \cdot (${OPG_M(t1, 4)} - ${OPG_M(t2, 4)}) = ${OPG_M(Qc)}\,\text{kvar}$`,
        OPG_R`$I_c = \dfrac{Q_c}{\sqrt{3} \cdot U} = \dfrac{${OPG_M(Qc * 1000)}\,\text{var}}{\sqrt{3} \cdot 400\,\text{V}} = ${OPG_M(Ic)}\,\text{A}$`],
      typiskeFejl:[opgFejl('cos-for-tan', 'qc', P * (c2 - c1), OPG_R`Du har brugt $\cos\varphi$ i stedet for $\tan\varphi$.`), opgFejl('kva-kw', 'qc', S1 * (t1 - t2), 'Du har brugt den tilsyneladende effekt (kVA) i stedet for P (kW).'),
        opgFejl('glemt-maalcos', 'qc', P * t1, OPG_R`Du har glemt den ønskede $\cos\varphi$: der skal kun fjernes en del af den reaktive effekt, ikke hele.`),
        opgFejl('glemt-sqrt3', 'ic', Qc * 1000 / 400, OPG_R`Du har glemt $\sqrt{3}$.`), opgFejl('enhed-1000', 'ic', Ic / 1000, 'Du har brugt kvar som om det var var.')] };
  } }
];

/* Tabeller til generator 7 (delmængde af El-oversigtsappens data.js: kobber, luft 30 °C, metode A2/B2/C/E, 1,5–50 mm²).
   DS/HD 60364-5-52 anneks B: B.52.2–B.52.5 og B.52.10/B.52.12 (tabelværdier), B.52.14 (k_temp, luft), B.52.17 (k_samlet, bundtet). Vejledende. */
const OPG_IZ_TV = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
const OPG_IZ_TAB = {
  PVC: {
    2: { A2:[14, 18.5, 25, 32, 43, 57, 75, 92, 110], B2:[16.5, 23, 30, 38, 52, 69, 90, 111, 133], C:[19.5, 27, 36, 46, 63, 85, 112, 138, 168], E:[22, 30, 40, 51, 70, 94, 119, 148, 180] },
    3: { A2:[13, 17.5, 23, 29, 39, 52, 68, 83, 99], B2:[15, 20, 27, 34, 46, 62, 80, 99, 118], C:[17.5, 24, 32, 41, 57, 76, 96, 119, 144], E:[18.5, 25, 34, 43, 60, 80, 101, 126, 153] }
  },
  XLPE: {
    2: { A2:[18.5, 25, 33, 42, 57, 76, 99, 121, 145], B2:[22, 30, 40, 51, 69, 91, 119, 146, 175], C:[24, 33, 45, 58, 80, 107, 138, 171, 209], E:[26, 36, 49, 63, 86, 115, 149, 185, 225] },
    3: { A2:[16.5, 22, 30, 38, 51, 68, 89, 109, 130], B2:[19.5, 26, 35, 44, 60, 80, 105, 128, 154], C:[22, 30, 40, 52, 71, 96, 119, 147, 179], E:[23, 32, 42, 54, 75, 100, 127, 158, 192] }
  }
};
const OPG_KTEMP = {
  PVC:  { 25:1.06, 35:0.94, 40:0.87, 45:0.79, 50:0.71 },
  XLPE: { 25:1.04, 35:0.96, 40:0.91, 45:0.87, 50:0.82 }
};
const OPG_KSAMLET = { 2:0.80, 3:0.70, 4:0.65, 6:0.57 };

/* ---------- Opgave ud fra generator og seed (ren funktion, bruges af appen og af røgtesten) ---------- */
function opgLavOpgave(gen, seed) {
  const o = gen.lav(opgRng(seed));
  o.svar = o.svar.map(s => Object.assign({ tol: OPG_TOL }, s));
  /* En typisk fejl, der ligner det rigtige svar, kan ikke kendes fra det og fjernes. */
  o.typiskeFejl = (o.typiskeFejl || []).map(f => Object.assign({ svar: o.svar[0].id }, f)).filter(f => {
    const s = o.svar.find(x => x.id === f.svar);
    return s && Number.isFinite(f.vaerdi) && f.vaerdi > 0 && Math.abs(f.vaerdi - s.vaerdi) / s.vaerdi > 2 * s.tol;
  });
  return o;
}

/* Dansk tal: "1,5", "1.5", "1 234,5" og "1.234,5" accepteres. Giver NaN, hvis det ikke er et tal. */
function opgLaes(tekst) {
  let t = String(tekst == null ? '' : tekst).trim().replace(/\s+/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
const opgNaer = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

/* Tjekker indtastede svar ({ svar-id: tekst }) mod en opgave. Ren funktion. */
function opgTjekSvar(opg, ind) {
  const del = opg.svar.map(s => { const v = opgLaes(ind[s.id]); return { id:s.id, ind:v, gyldig:Number.isFinite(v), ok:Number.isFinite(v) && opgNaer(v, s.vaerdi, s.tol) }; });
  if (del.some(d => !d.gyldig)) return { gyldig:false, del };
  const korrekt = del.every(d => d.ok), score = del.filter(d => d.ok).length / del.length;
  let fejl = null;
  if (!korrekt) fejl = opg.typiskeFejl.find(f => { const d = del.find(x => x.id === f.svar), s = opg.svar.find(x => x.id === f.svar); return d && !d.ok && opgNaer(d.ind, f.vaerdi, s.tol); }) || null;
  return { gyldig:true, del, korrekt, score, fejltype:fejl ? fejl.fejltype : '', forklaring:fejl ? fejl.forklaring : '' };
}

const OPG_DAGSMAAL = 5;

function APP_OPGAVER() {
  return {
    opgGeneratorer: OPG_GENERATORER, opgFejlNavne: OPG_FEJLNAVNE, opgDagsmaal: OPG_DAGSMAAL,
    opgValg: 'blandet',        // 'blandet' | 'emne:<id>' | 'gen:<id>'
    opgAkt: null,              // { gen, seed, opg, start }
    opgInd: {},                // indtastede svar pr. svar-id
    opgRes: null,              // resultatet af tjekket
    opgInfoTekst: 'Forudsætninger: ρ = 0,0225 Ω·mm²/m, 230 V og 3 × 400 V, cos φ = 1, medmindre opgaven siger andet. Tabelværdier og regler er vejledende og hentet fra DS/HD 60364-5-52 anneks B (se opgaven). Kontrollér altid i standarden.',

    /* Start en ny opgave. valg er valgfrit: 'blandet', 'emne:<id>' eller 'gen:<id>'. */
    opgStart(valg) {
      if (valg) this.opgValg = valg;
      const gen = this.opgVaelg(); if (!gen) return;
      this.opgNy(gen.id, opgNytSeed());
    },
    opgNy(genId, seed) {
      const gen = OPG_GENERATORER.find(g => g.id === genId); if (!gen) return;
      this.opgAkt = { gen:gen.id, seed, opg:opgLavOpgave(gen, seed), start:Date.now() };
      this.opgInd = {}; this.opgRes = null;
      this.$nextTick && this.$nextTick(() => { const f = document.querySelector('#v-opgaver input[data-opg-svar]'); if (f) f.focus(); });
    },
    opgSkift(valg) { this.opgValg = valg; this.opgStart(); },
    opgKandidater() {
      const v = this.opgValg;
      if (v.startsWith('gen:')) return OPG_GENERATORER.filter(g => g.id === v.slice(4));
      if (v.startsWith('emne:')) return OPG_GENERATORER.filter(g => g.emne === v.slice(5));
      return OPG_GENERATORER;
    },
    /* Vægt: jo lavere træfsikkerhed (seneste 10 forsøg, med et neutralt udgangspunkt), jo oftere. Samme generator ikke to gange i træk. */
    opgVaegt(genId) {
      const f = this.resultater.filter(r => r.art === 'opgave' && r.ref === genId).slice(-10), ret = f.filter(r => r.korrekt).length;
      return 1 - (ret + 1) / (f.length + 2) + 0.1;
    },
    opgVaelg() {
      let k = this.opgKandidater(); if (!k.length) return null;
      if (k.length > 1 && this.opgAkt) k = k.filter(g => g.id !== this.opgAkt.gen);
      const w = k.map(g => this.opgVaegt(g.id)), sum = w.reduce((a, b) => a + b, 0);
      let x = Math.random() * sum;
      for (let i = 0; i < k.length; i++) { x -= w[i]; if (x <= 0) return k[i]; }
      return k[k.length - 1];
    },
    opgGen() { return this.opgAkt ? OPG_GENERATORER.find(g => g.id === this.opgAkt.gen) : null; },

    async opgTjek() {
      if (!this.opgAkt || this.opgRes) return;
      const t = opgTjekSvar(this.opgAkt.opg, this.opgInd);
      if (!t.gyldig) return this.say('Skriv et tal i alle felter (med komma, fx 4,7).', true);
      this.opgRes = t;
      const gen = this.opgGen(), svar = {};
      for (const d of t.del) svar[d.id] = d.ind;
      await this.tilfoejResultat({ art:'opgave', ref:gen.id, emne:gen.emne, korrekt:t.korrekt, score:t.score, fejltype:t.fejltype, varighedMs:Date.now() - this.opgAkt.start, data:{ seed:this.opgAkt.seed, svar } });
    },
    opgTast(e) { if (e.key === 'Enter') { e.preventDefault(); if (this.opgRes) this.opgStart(); else this.opgTjek(); } },

    opgFmt(v) { return String(OPG_SIG(v, 3)).replace('.', ','); },
    opgFejlNavn(kode) { return OPG_FEJLNAVNE[kode] || kode; },
    opgDel(id) { return this.opgRes ? this.opgRes.del.find(d => d.id === id) : null; },
    opgOk(id) { const d = this.opgDel(id); return !!d && d.ok; },

    /* Oversigt pr. generator: forsøg, træfsikkerhed og hyppigste fejl */
    opgStat() {
      const alle = this.resultater.filter(r => r.art === 'opgave');
      return OPG_GENERATORER.map(g => {
        const f = alle.filter(r => r.ref === g.id), ret = f.filter(r => r.korrekt).length, fejl = {};
        for (const r of f) if (r.fejltype) fejl[r.fejltype] = (fejl[r.fejltype] || 0) + 1;
        const top = Object.entries(fejl).sort((a, b) => b[1] - a[1])[0];
        return { id:g.id, navn:g.navn, emne:g.emne, niveau:g.niveau, forsoeg:f.length, rigtige:ret, pct:f.length ? Math.round(ret / f.length * 100) : null, topFejl:top ? this.opgFejlNavn(top[0]) + ' (' + top[1] + ')' : '' };
      });
    },
    /* Dagens regneopgaver: dagsmålet minus dagens forsøg */
    opgIDag() { const d = dagNoegle(new Date()); return this.resultater.filter(r => r.art === 'opgave' && dagNoegle(r.tid) === d).length; },
    opgDagAntal() { return Math.max(0, OPG_DAGSMAAL - this.opgIDag()); },
    opgGaaTilDag() { this.gaaTil('opgaver'); this.opgStart('blandet'); }
  };
}

function opgNytSeed() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 2147483647) + 1; } catch (e) { return Math.floor(Math.random() * 2147483646) + 1; }
}
