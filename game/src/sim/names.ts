/**
 * The recruitment pool.
 *
 * ## Why this is a source file and not a text file
 *
 * The owner asked for "a basic text file or something that has a list of
 * hundreds of names". It cannot be a file the game fetches: the whole premise
 * is one asset (`public/music/theme.mp3`) and nothing else -- every sprite
 * plotted, every sound synthesised, every inch of terrain derived. A
 * `names.txt` in `public/` would be the second, and it would also mean a
 * mission could start before the roster knew what anyone was called.
 *
 * So it is the same thing compiled in. Edit the array; that is the text file.
 *
 * ## The rules a name has to obey
 *
 * **Six characters in the pool.** Every entry below is six or fewer, which
 * leaves room for ` JR.` and the numerals when the war outlives the list.
 *
 * **Twelve once suffixed.** `sanitiseName` caps *player-typed* names at nine,
 * and the obvious move is to assume that is the roster's limit -- it is not.
 * It was measured: `SCOUSE XVIII` renders in the sidebar with room to spare
 * before the rank, so twelve is the ceiling and nine was a rule about a
 * different thing. Both numbers are asserted by `test/campaign.test.mjs`
 * rather than trusted, because the symptom of getting it wrong is a screen
 * nobody looks at until somebody dies on it.
 *
 * **Uppercase, no punctuation in the pool.** Every other name in the game is.
 *
 * ## The order matters at the front and nowhere else
 *
 * The first twelve are the original's names in the original's order. Jools and
 * Jops lead every squad because they led every squad in 1993, and the ten
 * behind them are the ones the game expects you to spend. Past that it is a
 * pool, and the order is only the order somebody typed it in.
 */

/** No pool entry may be longer than this, so a suffix still fits. */
export const NAMES_MAX = 6;

/**
 * The widest a finished name may be, suffix included.
 *
 * Measured in the real sidebar, not inferred from `sanitiseName`. If a suffix
 * is ever added that pushes past this, the test fails rather than the roster.
 */
export const NAME_MAX_RENDERED = 12;

const POOL: readonly string[] = [
  // The originals, in order. Do not reorder these twelve.
  'JOOLS', 'JOPS', 'STOO', 'RJ', 'GARY', 'ANDY',
  'BUZZ', 'TEDDY', 'HAWK', 'MAC', 'FRANK', 'WILL',

  // The rest of the first draft, kept because they are already on people's
  // Boot Hills and a name that vanishes from the pool is a name that can be
  // handed out twice.
  'CHRIS', 'DAVE', 'ROB', 'JIM', 'KEV', 'PAUL',
  'NOBBY', 'TAFF', 'SCOUSE', 'SMUDGE', 'DUSTY', 'BROCK',
  'HAGGIS', 'PIKE', 'WALKER', 'JONES', 'FRAZER', 'BILKO',
  'DOYLE', 'HUDSON', 'DRAKE', 'APONE',

  // Squaddie nicknames: the ones a section actually uses, which are almost
  // never the name on the paperwork.
  'CHALKY', 'DUTCH', 'GINGE', 'JOCK', 'LOFTY', 'BLONDY',
  'PADDY', 'RAMBO', 'RATTY', 'SHORTY', 'SPUD', 'STICKY',
  'TINY', 'TOMBO', 'WIGGY', 'BUNNY', 'CHIEF', 'CURLY',
  'DODGER', 'FLASH', 'GRUMPY', 'HAPPY', 'LURCH', 'MOOSE',
  'NUTTY', 'PIGGY', 'PORKY', 'RUSTY', 'SHARKY', 'SLIM',
  'SNOWY', 'SPARKY', 'STUMPY', 'TANK', 'TITCH', 'WHEELS',
  'BADGER', 'BEANS', 'BONES', 'BRICK', 'CHOPS', 'CRUMBS',
  'DINGER', 'FLAPS', 'GIZMO', 'HOOTER', 'JAFFA', 'KIPPER',
  'MUFFIN', 'NIPPER', 'ODDBOD', 'PICKLE', 'RHUBRB', 'SCRAPS',
  'SHUNT', 'SPANNR', 'TICKER', 'WOBBLE', 'ZIPPO', 'BUNGLE',

  // Short surnames, which is what the roster wants: they read as men rather
  // than as jokes, and a squad of nothing but nicknames stops being funny by
  // the third mission.
  'ABBOT', 'ADAMS', 'ALLEN', 'ARCHER', 'ASHBY', 'ATKINS',
  'BAKER', 'BANKS', 'BARLOW', 'BARNES', 'BATES', 'BAXTER',
  'BEALE', 'BELL', 'BENNET', 'BERRY', 'BEST', 'BIRCH',
  'BISHOP', 'BLAKE', 'BOLTON', 'BOND', 'BOOTH', 'BOWEN',
  'BOYCE', 'BOYD', 'BRADY', 'BRIGGS', 'BROOKS', 'BROWN',
  'BRYANT', 'BUCK', 'BURKE', 'BURNS', 'BUTLER', 'BYRNE',
  'CAIN', 'CARR', 'CARTER', 'CASEY', 'CHAPEL', 'CLARK',
  'CLARKE', 'CLAY', 'CLEGG', 'COBB', 'COLE', 'COLLIN',
  'COOK', 'COOPER', 'COX', 'CRAIG', 'CRANE', 'CROSS',
  'CROWE', 'CURTIS', 'DALE', 'DALTON', 'DAVIES', 'DAWSON',
  'DAY', 'DEAN', 'DENNIS', 'DIXON', 'DODD', 'DOWNS',
  'DRURY', 'DUNN', 'DYER', 'EATON', 'EDGAR', 'ELLIS',
  'ELTON', 'EVANS', 'FAIRLY', 'FARR', 'FIELD', 'FINCH',
  'FISHER', 'FLYNN', 'FORD', 'FOSTER', 'FOWLER', 'FOX',
  'FRENCH', 'FROST', 'FULLER', 'GALE', 'GARNER', 'GIBBS',
  'GILL', 'GLOVER', 'GODDEN', 'GOULD', 'GRAHAM', 'GRANT',
  'GRAVES', 'GRAY', 'GREEN', 'GREGG', 'GRIMES', 'HALL',
  'HAMER', 'HANLEY', 'HARDY', 'HARPER', 'HARRIS', 'HART',
  'HAYES', 'HEATH', 'HENRY', 'HERON', 'HICKS', 'HILL',
  'HOBBS', 'HODGE', 'HOLDEN', 'HOLT', 'HOOPER', 'HOPE',
  'HORNE', 'HOWARD', 'HOWE', 'HUGHES', 'HUNT', 'HUNTER',
  'HURST', 'HYDE', 'INGRAM', 'IRVINE', 'JACKS', 'JARVIS',
  'JEFFS', 'JENNER', 'JOYCE', 'JUDD', 'KANE', 'KEANE',
  'KEATS', 'KEELER', 'KELLY', 'KEMP', 'KENT', 'KERR',
  'KIDD', 'KING', 'KIRK', 'KNIGHT', 'LAMB', 'LANE',
  'LANG', 'LARK', 'LAWSON', 'LEACH', 'LEE', 'LEIGH',
  'LEWIS', 'LLOYD', 'LOCK', 'LOCKE', 'LOGAN', 'LONG',
  'LOWE', 'LUCAS', 'LYNCH', 'LYONS', 'MADDOX', 'MALONE',
  'MANN', 'MARSH', 'MASON', 'MAY', 'MAYES', 'MCBAIN',
  'MCCOY', 'MCLEAN', 'MEAD', 'MERCER', 'MILES', 'MILLER',
  'MILLS', 'MOODY', 'MOON', 'MOORE', 'MORAN', 'MORGAN',
  'MORRIS', 'MOSS', 'MOULD', 'MUNRO', 'MURPHY', 'MURRAY',
  'NASH', 'NEAL', 'NELSON', 'NEWMAN', 'NOBLE', 'NOLAN',
  'NORRIS', 'NORTON', 'NUNN', 'OAKES', 'ODELL', 'OGDEN',
  'OLIVER', 'ORTON', 'OSMAN', 'OWEN', 'PAGE', 'PALMER',
  'PARKER', 'PARR', 'PATON', 'PAYNE', 'PEARCE', 'PECK',
  'PERRY', 'PETERS', 'PHILIP', 'PILE', 'PITT', 'POOLE',
  'POPE', 'PORTER', 'POTTER', 'POWELL', 'PRATT', 'PRICE',
  'PRIOR', 'PUGH', 'QUINN', 'RAINE', 'RAMSEY', 'RAND',
  'RANKIN', 'READ', 'REEVES', 'REID', 'REYNER', 'RHODES',
  'RICE', 'RIDLEY', 'RILEY', 'RIVERS', 'ROACH', 'ROBSON',
  'ROGERS', 'ROOKE', 'ROSE', 'ROSS', 'ROWE', 'RUSSEL',
  'RYAN', 'SANDS', 'SAVAGE', 'SAYER', 'SCOTT', 'SEARLE',
  'SHARP', 'SHAW', 'SHEEHY', 'SHIELD', 'SHORT', 'SIMS',
  'SLADE', 'SLOAN', 'SMART', 'SMITH', 'SNOW', 'SPEARS',
  'SPICER', 'STACEY', 'STARK', 'STEELE', 'STOKES', 'STONE',
  'STOTT', 'STRONG', 'SUMNER', 'SUTTON', 'SWAIN', 'SWIFT',
  'TALBOT', 'TATE', 'TAYLOR', 'TERRY', 'THORN', 'TILLEY',
  'TODD', 'TOMLIN', 'TOWNS', 'TRAVIS', 'TUCKER', 'TURNER',
  'TWIGG', 'TYSON', 'UNWIN', 'VANCE', 'VAUGHN', 'VERNON',
  'VICKER', 'VINCE', 'WADE', 'WAGNER', 'WALSH', 'WARD',
  'WARNER', 'WARREN', 'WATSON', 'WATTS', 'WEAVER', 'WEBB',
  'WEBLEY', 'WELCH', 'WELLS', 'WEST', 'WHEELR', 'WHITE',
  'WILDE', 'WILKES', 'WINTER', 'WOLFE', 'WOOD', 'WOODS',
  'WRAY', 'WREN', 'WRIGHT', 'WYATT', 'YATES', 'YOUNG',
];

/*
 * Checked, not trusted.
 *
 * Two properties this list has to have, and both are the kind that rot the
 * moment somebody adds a name in a hurry:
 *
 *   - **Nothing longer than NAMES_MAX**, or a suffixed name overflows the
 *     roster column.
 *   - **No duplicates.** `nameAt` is the only reason "a name is never
 *     reissued" is provable rather than hopeful: two different indices must
 *     never produce the same string. One repeated entry breaks that silently,
 *     and the symptom is two men on the hill with the same name a fortnight
 *     later.
 *
 * `test/campaign.test.mjs` asserts both, so a bad entry fails `npm run check`
 * rather than a save file.
 */
export const RECRUITS: readonly string[] = POOL;

/**
 * What a name gets called on its second and later tours.
 *
 * The war outliving the list is a good problem, and the old answer to it was
 * `RECRUIT 41`, which is exactly the thing this whole roster exists not to be:
 * the original turned casualties back into counters by reissuing names, and a
 * numbered recruit is a counter that has stopped pretending.
 *
 * So the pool goes round again wearing a suffix. `SMITH` falls, and one day
 * `SMITH JR.` turns up, and after him `SMITH III`. That is a different name --
 * which keeps the never-reissue rule exactly as it was, since the rule is
 * about the string -- and it is a small piece of the world rather than an
 * apology for running out.
 *
 * Past the ladder it keeps counting in plain numerals, which stay short: a
 * campaign that gets to `SMITH 22` has earned the joke.
 */
export const SUFFIXES: readonly string[] = [
  'JR.', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];

/**
 * The `n`th name the war ever hands out, counting from zero.
 *
 * Deterministic and total: pass any number, get a name. That is what lets the
 * campaign store one integer (`issued`) rather than a list, and what makes the
 * "never reissued" rule provable rather than hopeful -- two different `n`
 * cannot produce the same string.
 */
export function nameAt(n: number): string {
  const pool = RECRUITS.length;
  if (n < pool) return RECRUITS[n];
  const lap = Math.floor(n / pool) - 1;
  const base = RECRUITS[n % pool];
  const suffix = SUFFIXES[lap] ?? `${lap + 2}`;
  return `${base} ${suffix}`;
}
