/* Elskolen: konstanter, lagernøgler, emner, datamodel (norm*) og små hjælpere. Indlæses før de andre scripts. */
const APP_VERSION = '0.2.0';
const SCHEMA = 2;  // 2: tabellen resultater (opgaver, cases, fejlfinding)

/* Lagernøgler. Appen ligger på samme origin som El-oversigtsappen (rehhoff.github.io), så ALLE nøgler skal starte med "elskole.".
   Omdøb eller fjern dem aldrig (se CLAUDE.md afsnit 1). */
const K_META = 'elskole.meta';          // { schema, sidstBackup }
const K_TEMA = 'elskole.tema';          // 'auto' | 'light' | 'dark'
const K_INDST = 'elskole.indstillinger';
const K_SYNK = 'elskole.sync';          // { token, gistId, login, sidst }
const K_BACKUP = 'elskole.backup';      // seneste automatiske backup (JSON-tekst)
const IDB_NAVN = 'elskole', IDB_VER = 2; // tabeller: kort, tilstand, log, resultater (fra version 2)

/* Gist-synk: markør plus én fil pr. slags data og én logfil pr. måned. Formatet må kun udvides. */
const GH = 'https://api.github.com';
const G_MARK = 'elskole.json', G_KORT = 'elskole-kort.json', G_TILST = 'elskole-tilstand.json', G_LOG = m => 'elskole-log-' + m + '.json';
const G_LOG_RE = /^elskole-log-(\d{4}-\d{2})\.json$/;
const G_RES = m => 'elskole-resultater-' + m + '.json', G_RES_RE = /^elskole-resultater-(\d{4}-\d{2})\.json$/;

/* Faste emner (kompetencetræets rødder). id'erne må ikke omdøbes, da kortene peger på dem. */
const EMNER = [
  { id:'mat', navn:'Matematik og fysik', kort:'Mat/fys' },
  { id:'dim', navn:'Dimensionering (DS/HD 60364)', kort:'Dimensionering' },
  { id:'saer', navn:'Særlige installationer (del 7)', kort:'Særlige' },
  { id:'love', navn:'Love og myndigheder', kort:'Love' },
  { id:'erhv', navn:'Erhverv og industri', kort:'Erhverv' },
  { id:'arb', navn:'Arbejdsmiljø', kort:'Arbejdsmiljø' },
  { id:'andet', navn:'Andet', kort:'Andet' }
];
const EMNE_IDS = EMNER.map(e => e.id);
const KORTTYPER = { fakta:'Fakta', regel:'Regel', formel:'Formel' };

const STD_INDST = { nyePrDag:10, retention:0.9, maksInterval:3650 };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function nu() { return new Date().toISOString(); }
function dagNoegle(d) { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function str(v) { return v == null ? '' : String(v); }

/* Kort: { id, type, emne, front, bag, tags[], kilde{dok,afsnit,udgave,gyldigFra}, oprindelse, oprettet, rettet, slettet }
   slettet er en gravsten, så sletningen kan synkroniseres. Kortet fjernes ikke fra lageret. */
function nytKort(f) {
  const t = nu();
  return normKort(Object.assign({ id:uid(), oprettet:t, rettet:t }, f || {}));
}
function normKort(k) {
  k = k && typeof k === 'object' ? k : {};
  const ki = k.kilde && typeof k.kilde === 'object' ? k.kilde : {};
  return {
    id: str(k.id) || uid(),
    type: KORTTYPER[k.type] ? k.type : 'fakta',
    emne: EMNE_IDS.includes(k.emne) ? k.emne : 'andet',
    front: str(k.front), bag: str(k.bag),
    tags: Array.isArray(k.tags) ? [...new Set(k.tags.map(t => str(t).trim()).filter(Boolean))] : [],
    kilde: { dok:str(ki.dok), afsnit:str(ki.afsnit), udgave:str(ki.udgave), gyldigFra:str(ki.gyldigFra) },
    oprindelse: str(k.oprindelse),
    oprettet: str(k.oprettet) || nu(), rettet: str(k.rettet) || str(k.oprettet) || nu(),
    slettet: !!k.slettet
  };
}

/* Tilstand: FSRS-kortets felter pr. kort-id plus rettet. Datoer gemmes som ISO-tekst. Mangler den, er kortet nyt. */
function normTilstand(t) {
  t = t && typeof t === 'object' ? t : {};
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  return { id:str(t.id), due:str(t.due) || nu(), stability:n(t.stability), difficulty:n(t.difficulty), elapsed_days:n(t.elapsed_days),
    scheduled_days:n(t.scheduled_days), learning_steps:n(t.learning_steps), reps:n(t.reps), lapses:n(t.lapses), state:n(t.state),
    last_review:t.last_review ? str(t.last_review) : '', rettet:str(t.rettet) || nu() };
}

/* Log: ét svar. Kun tilføjes, aldrig rettes. karakter 1 = Igen, 2 = Svært, 3 = Godt, 4 = Let. */
function normLog(l) {
  l = l && typeof l === 'object' ? l : {};
  return { id:str(l.id) || uid(), kortId:str(l.kortId), tid:str(l.tid) || nu(), karakter:Math.min(4, Math.max(1, Number(l.karakter) || 3)),
    ny:!!l.ny, varighedMs:Math.max(0, Number(l.varighedMs) || 0), foer:Number.isFinite(Number(l.foer)) ? Number(l.foer) : 0 };
}

/* Resultat: ét forsøg på en opgave, en case eller en fejlfinding. Kun tilføjes, aldrig rettes (som log).
   art: 'opgave' | 'case' | 'fejlfinding'. ref: generatorens, casens eller scenariets id. emne: et af EMNER.
   korrekt: om forsøget lykkedes. score: 0–1. fejltype: kort kode for den typiske fejl, fx 'glemt-ktemp' (tom, når korrekt).
   data: frit objekt til modulets egne detaljer (opgavens tal, valgte trin …). Holdes lille. */
const RESULTAT_ARTER = ['opgave', 'case', 'fejlfinding'];
function normResultat(r) {
  r = r && typeof r === 'object' ? r : {};
  return { id:str(r.id) || uid(), art:RESULTAT_ARTER.includes(r.art) ? r.art : 'opgave', ref:str(r.ref), emne:EMNE_IDS.includes(r.emne) ? r.emne : 'andet',
    tid:str(r.tid) || nu(), korrekt:!!r.korrekt, score:Math.min(1, Math.max(0, Number(r.score) || (r.korrekt ? 1 : 0))), fejltype:str(r.fejltype),
    varighedMs:Math.max(0, Number(r.varighedMs) || 0), data:r.data && typeof r.data === 'object' ? r.data : {} };
}

function normIndst(s) {
  s = Object.assign({}, STD_INDST, s && typeof s === 'object' ? s : {});
  return { nyePrDag:Math.min(200, Math.max(0, Math.round(Number(s.nyePrDag)) || 0)), retention:Math.min(0.97, Math.max(0.7, Number(s.retention) || 0.9)),
    maksInterval:Math.min(36500, Math.max(30, Math.round(Number(s.maksInterval)) || 3650)) };
}

/* Stabil hash af et objekt (bruges i synk til at se, om noget er ændret) */
function hashD(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }

/* Fletning: nyeste "rettet" vinder pr. id. Bruges til kort og tilstand ved synk og import af backup. */
function flet(a, b) {
  const m = new Map(); for (const x of a) m.set(x.id, x);
  for (const x of b) { const y = m.get(x.id); if (!y || str(x.rettet) > str(y.rettet)) m.set(x.id, x); }
  return [...m.values()];
}
