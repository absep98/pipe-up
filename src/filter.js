'use strict';

// The product. Everything else here is plumbing.
//
// Claude Code responses are mostly markdown scaffolding, code, diffs, file
// paths and tool chatter. Reading that verbatim is worse than reading it with
// your eyes. This turns a response into something worth hearing: prose only,
// code described rather than recited, identifiers pronounceable, capped short.
//
// And it decides when a human is needed at all (smartSummary): a question, a
// failure, or a blocker. Everything is built on one list of sentences that has
// two views. The SPOKEN view is what the voice says. The DETECT view is what the
// rules read: identifiers are masked there, so `failing_tests.txt` is not a
// failure, while error messages in backticks are kept, so they can be seen.

const FILLER_LEAD = /^(sure|okay|ok|alright|great|perfect|got it|done|certainly|absolutely)[\s,!.—-]+/i;

const LANG_NAMES = {
  js: 'JavaScript', jsx: 'JavaScript', javascript: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', go: 'Go', golang: 'Go', rs: 'Rust', rust: 'Rust',
  java: 'Java', rb: 'Ruby', sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'PowerShell', powershell: 'PowerShell', sql: 'SQL', json: 'JSON',
  yaml: 'YAML', yml: 'YAML', html: 'HTML', css: 'CSS', diff: 'diff', patch: 'diff'
};

// Extensions that add nothing when spoken: "token store", not "token store dot ts".
const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'rb', 'c', 'h', 'cpp',
  'cs', 'sh', 'ps1', 'css', 'html', 'vue', 'kt', 'swift', 'php'
]);

// Markers that survive the markdown-stripping steps, so later steps know what a
// line was. Control characters: they cannot occur in a response.
const HEADING = '\u0004';
const ITEM = '\u0005';
// An inline span carries two views: \u0001 spoken \u0002 detect \u0003
const SPAN = /\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g;
const spokenOf = (s) => s.replace(SPAN, '$1');
const detectOf = (s) => s.replace(SPAN, '$2');

/**
 * Split an identifier into speakable words.
 * user_auth_handler -> "user auth handler"; getUserByID -> "get User By ID"
 */
function humanizeIdentifier(word) {
  return word
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How to say a code token: a path, a file name, a dotted name, a version.
 *   src/auth/token_store.ts -> "token store"      package.json -> "package dot json"
 *   console.log             -> "console dot log"  release/2.4  -> "release 2 point 4"
 */
function speakToken(token) {
  let t = String(token).trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/\(\)$/, '');

  if (/[\\/]/.test(t)) {
    const segs = t.replace(/\\/g, '/').split('/').filter(Boolean);
    let last = segs.pop() || '';
    if (/^v?\d+(?:\.\d+)*$/.test(last) && segs.length) last = `${segs.pop()} ${last}`;
    t = last;
  }

  const ext = /^(.*[A-Za-z].*)\.([A-Za-z0-9]{1,6})$/.exec(t);
  if (ext) t = SOURCE_EXT.has(ext[2].toLowerCase()) ? ext[1] : `${ext[1]} dot ${ext[2]}`;

  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(/(\d+)\.(\d+)/, '$1 point $2'); }
  t = t.replace(/(?<=[A-Za-z0-9])\.(?=[A-Za-z_])/g, ' dot ');

  // No sentence punctuation may survive inside a span: it would split the sentence.
  return humanizeIdentifier(t).replace(/[.!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A path is only worth hearing as its last segment. */
const humanizePath = speakToken;

function looksLikePath(s) {
  return /[/\\]/.test(s) || /^[\w.-]+\.[a-z]{1,6}$/i.test(s);
}

// Symbol soup: keep it out of the audio entirely.
function isSymbolic(s) {
  return !/[a-z]/i.test(s) || /^[^a-z0-9]*$/i.test(s);
}

const ERROR_LIKE = /\b(?:error|exception|failed|denied|cannot|not found|timed out|refused|unable|invalid)\b|\bE[A-Z]{3,}\b|\b[45]\d\d\b/;

/** Text that is safe inside a span: no sentence punctuation, no markup. */
const plain = (v) => v.replace(/[^\w\s:'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

/**
 * An inline code span, as two views.
 *  - A single name or path: spoken humanised; masked as CODE for detection, so a
 *    file called failing_tests.txt is never mistaken for a failure.
 *  - A long snippet: dropped from speech, or "an error message" when it looks
 *    like one. Detection still sees the text, so `ERESOLVE unable to resolve`
 *    counts as the failure it is.
 */
function codeSpan(inner) {
  const v = inner.trim();
  if (!v || isSymbolic(v)) return '';
  const words = v.split(/\s+/);

  if (words.length > 4) {
    return `\u0001${ERROR_LIKE.test(v) ? 'an error message' : ''}\u0002${plain(v)}\u0003`;
  }
  if (words.length === 1) {
    const spoken = looksLikePath(v) || /\./.test(v) ? speakToken(v) : humanizeIdentifier(v.replace(/\(\)$/, ''));
    const detect = /^E[A-Z]{3,}$/.test(v) ? v : 'CODE';
    return `\u0001${plain(spoken)}\u0002${detect}\u0003`;
  }
  const spoken = plain(humanizeIdentifier(v));
  return `\u0001${spoken}\u0002${spoken}\u0003`;
}

function describeCode(blocks) {
  if (!blocks.length) return '';
  const lines = blocks.reduce((n, b) => n + b.lines, 0);
  const langs = [...new Set(blocks.map((b) => b.lang).filter(Boolean))];
  const isDiff = langs.length === 1 && langs[0] === 'diff';

  const what = isDiff ? 'a diff' : blocks.length === 1 ? 'a code block' : `${blocks.length} code blocks`;
  const lang = !isDiff && langs.length === 1 ? ` of ${langs[0]}` : '';
  const size = lines >= 4 ? `, ${lines} lines` : '';
  return `There's ${what}${lang}${size} you'll want to look at.`;
}

// Abbreviations whose full stop does not end a sentence.
const ABBREV_ALWAYS = /\b(?:e\.g|i\.e|vs|cf|approx|incl|fig)\.$/i;
const ABBREV_MID = /\betc\.$/i;

/** Split on sentence ends, but not at "e.g.", "vs.", or a decimal point. */
function splitSentences(text) {
  const out = [];
  for (const piece of text.split(/(?<=[.!?])\s+/)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (ABBREV_ALWAYS.test(spokenOf(prev)) || (ABBREV_MID.test(spokenOf(prev)) && /^[a-z0-9(]/.test(spokenOf(piece))))) {
      out[out.length - 1] = `${prev} ${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out;
}

/**
 * Turn a response into sentences, each with a spoken view and a detect view.
 * @returns {{ sentences: Array<{spoken:string, detect:string, heading:boolean, item:boolean}>, blocks: Array, stats: object }}
 */
function render(raw) {
  const stats = { codeBlocks: 0, codeLines: 0, tables: 0, truncated: false, originalChars: 0 };
  if (typeof raw !== 'string' || !raw.trim()) return { sentences: [], blocks: [], stats };

  stats.originalChars = raw.length;
  let s = raw.replace(/\r\n/g, '\n');

  // 1. Fenced code and diffs come out whole, described rather than recited.
  const blocks = [];
  s = s.replace(/^[ \t]*```([\w+-]*)[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm, (_m, lang, body) => {
    blocks.push({
      lang: LANG_NAMES[lang.toLowerCase()] || (lang ? humanizeIdentifier(lang) : ''),
      lines: body.split('\n').filter((l) => l.trim()).length
    });
    return '\n';
  });
  // An unterminated fence means the response was cut off mid-code. Drop the tail.
  s = s.replace(/^[ \t]*```[\s\S]*$/m, '\n');
  stats.codeBlocks = blocks.length;
  stats.codeLines = blocks.reduce((n, b) => n + b.lines, 0);

  // 2. Tables are visual by nature; announce and drop.
  const tableLines = s.match(/^[ \t]*\|.*\|[ \t]*$/gm) || [];
  if (tableLines.length) {
    stats.tables = 1;
    s = s.replace(/^[ \t]*\|.*\|[ \t]*$/gm, '');
  }

  // 3. Unwrap soft line breaks. Markdown hard-wraps prose mid-sentence, and if
  //    we treat every line as a sentence the voice pauses in the middle of
  //    clauses ("so two. concurrent requests could..."). Must run while the list
  //    and heading markers are still present to detect a genuine new block.
  //    Linear time: parts are collected in an array and joined once. Re-building
  //    a growing string for every wrapped line took ~10s on a 580 KB message.
  const BLOCK_START = /^[ \t]*(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>[ \t]?|\|)/;
  const merged = [];
  let parts = null;
  let last = '';
  for (const line of s.split('\n')) {
    const text = line.trim();
    if (parts && last && text && !BLOCK_START.test(line) && !/[.!?:]$/.test(last)) {
      parts.push(text);
      last = text;
    } else {
      if (parts) merged.push(parts.join(' '));
      parts = [line];
      last = text;
    }
  }
  if (parts) merged.push(parts.join(' '));
  s = merged.join('\n');

  // 4. Markup that carries no sound. Headings and list items leave a marker.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '');          // horizontal rules
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');                   // images
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');                // links -> text
  s = s.replace(/<https?:\/\/[^>]+>|https?:\/\/\S+/g, 'a link');
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, HEADING);          // heading markers
  s = s.replace(/^[ \t]*>[ \t]?/gm, '');                        // blockquotes

  // 5. Inline code: two views.
  s = s.replace(/`([^`\n]+)`/g, (_m, inner) => codeSpan(inner));

  // 6. Emphasis markers, list bullets, checkboxes, leading emoji.
  s = s.replace(/(\*\*\*|\*\*|\*|___|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2');
  s = s.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]*/gm, ITEM);
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, ITEM);
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, ITEM);
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2700}-\u{27BF}]/gu, '');

  // 7. Bare paths that were never in backticks.
  s = s.replace(/(?:[\w.-]+[/\\])+[\w.-]+\.[a-z]{1,6}\b/gi, (m) => `\u0001${plain(speakToken(m))}\u0002CODE\u0003`);

  // 8. Lines into sentences, so the voice gets pauses in the right places and the
  //    rules can look at one sentence at a time.
  const sentences = [];
  for (const rawLine of s.split('\n')) {
    let line = rawLine.trim();
    let heading = false;
    let item = false;
    while (line[0] === HEADING || line[0] === ITEM) {
      if (line[0] === HEADING) heading = true; else item = true;
      line = line.slice(1).trim();
    }
    line = line.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    if (!line || isSymbolic(spokenOf(line))) continue;
    if (!/[.!?:]$/.test(spokenOf(line))) line += '.';

    for (const piece of splitSentences(line)) {
      const spoken = spokenOf(piece).replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
      const detect = detectOf(piece).replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
      if (spoken && !isSymbolic(spoken)) sentences.push({ spoken, detect, heading, item });
    }
  }
  return { sentences, blocks, stats };
}

/**
 * Turn a Claude Code response into speakable prose.
 *
 * @param {string} raw            the assistant's markdown response
 * @param {object} [opts]
 * @param {number} [opts.maxWords=60]     hard cap; trimmed at a sentence boundary
 * @param {boolean} [opts.describeCode=true]  append a one-line "there's a diff" note
 * @returns {{ text: string, stats: object }}
 */
function toSpokenText(raw, opts = {}) {
  const maxWords = opts.maxWords ?? 60;
  const wantCodeNote = opts.describeCode !== false;

  const { sentences, blocks, stats } = render(raw);
  if (!sentences.length && !blocks.length && !stats.tables) return { text: '', stats };

  let text = sentences.map((x) => x.spoken).join(' ').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(FILLER_LEAD, '');
  if (text) text = text[0].toUpperCase() + text.slice(1);

  // Cap it. The whole point is that this is shorter than reading.
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    const clipped = words.slice(0, maxWords).join(' ');
    // Do not end on "e.g." or "vs." as if it were a sentence end.
    const stops = [...clipped.matchAll(/[.!?](?=\s)/g)].map((m) => m.index)
      .filter((i) => !ABBREV_ALWAYS.test(clipped.slice(0, i + 1)));
    const lastStop = stops.length ? stops[stops.length - 1] : -1;
    text = lastStop > clipped.length * 0.4 ? clipped.slice(0, lastStop + 1) : clipped.replace(/[,;:]?$/, '.');
    stats.truncated = true;
  }

  if (wantCodeNote && blocks.length) {
    const note = describeCode(blocks);
    if (note) text = text ? `${text} ${note}` : note;
  }
  if (stats.tables && !stats.codeBlocks) {
    text = text ? `${text} There's a table on screen.` : 'There\'s a table on screen.';
  }

  return { text: text.trim(), stats };
}

// ---------------------------------------------------------------------------
// Smart mode: is a human needed, and what exactly should be said?
// ---------------------------------------------------------------------------

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const isQuestion = (s) => /\?["'”’)\]]*$/.test(s);

/** Keep at most `max` words, preferring the END, which is where the ask usually is. */
function lastWords(text, max) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? text : words.slice(-max).join(' ');
}

// Phrases that mean the agent is stuck, has failed, or needs a human. Specific on
// purpose: bare words such as "error", "permission" or "cannot" turn up in routine
// updates ("added error handling", "users cannot delete the last admin"), and
// matching them made the first version speak about half the time it should not.
//
// Two kinds. STATE patterns are the agent saying it is stuck or needs you ("I can't",
// "I'm stuck", "needs you"): always worth hearing. EVENT patterns describe something
// that went wrong ("the build failed", "it crashed"): worth hearing only if it is
// still standing, and not when the response goes on to say what was done about it.
const STATE_PATTERNS = [
  /\b(?:I(?:'m|\s+am)|we(?:'re|\s+are)|it(?:'s|\s+is)|this\s+is)\s+blocked\b|\bblocked\s+(?:on|by|until|waiting)\b|\bblockers?\b/i,
  // First person only ("I can't find...", "we cannot ship..."), or a sentence that
  // starts with it ("Cannot find module"). "Users cannot delete" is a feature.
  /(?:^|\b(?:I|we)\s+(?:also\s+|still\s+)?)(?:cannot|can(?:'|’)t|couldn(?:'|’)t(?!\s+find\s+(?:any|other|more|another)\b)|could\s+not(?!\s+find\s+(?:any|other|more|another)\b)|unable\s+to)\b/i,
  /\bneeds?\s+(?:your|you)\b|\bwaiting\s+(?:for|on)\s+(?:you|your)\b|\bI(?:'ll|\s+will)\s+need\s+(?:an?|the|your|you|access)\b|\bneeds?\s+(?:CODE|sudo|root|admin)\b/i,
  /\bnot\s+sure\b|\bI(?:'m|\s+am)\s+stuck\b|\bstuck\s+on\b/i,
  /\bstopped\s+here\b|\bI\s+stopped\b/i
];

const EVENT_PATTERNS = [
  /\bfail(?:ed|ing|s)\b/i,
  /\b(?:still|is|are|remains?|looks?|seems?)\s+broken\b|\bnot\s+working\b|\bdoesn(?:'|’)t\s+work\b|\bstopped\s+working\b/i,
  /\bcrash(?:ed|es)\b/i,
  /\b(?:permission|access)\s+denied\b|\bneeds?\s+(?:your\s+)?(?:permission|approval|access)\b|\b(?:unauthorized|forbidden)\b|\b(?:401|403)\b/i,
  /\b(?:merge|rebase)\s+conflicts?\b|\bunresolved\s+conflicts?\b|\bconflicts?\s+(?:remain|left)\b/i,
  /\btimed\s+out\b|\baborted\b|\b(?:tests?|build|ci)\s+(?:is|are)\s+red\b|\bexit(?:ed|s)?\s+(?:with\s+)?(?:code|status)\s+[1-9]\d*\b|\berrors?\s+out\b/i,
  /\bE(?:NOENT|ACCES|PERM|ADDRINUSE|CONNREFUSED|RESOLVE|TIMEDOUT)\b/,
  /\b(?:didn(?:'|’)t|did\s+not|doesn(?:'|’)t|does\s+not|won(?:'|’)t)\s+(?:work|pass|build|compile|start|run|deploy|install|finish|complete|load|launch|publish|apply|connect)\b/i
];

// The response goes on to say what the agent did about it: "I added a migration".
const FIX_ACTION = /\bI\s+(?:also\s+|then\s+)?(?:added|fixed|changed|updated|migrated|patched|replaced|rewrote|switched|re-?ran|ran|regenerated|handled|wrapped|moved|removed|bumped|pinned|upgraded|reverted|increased|lowered|implemented|introduced|guarded|retried)\b/i;

// A clause that reports something already dealt with is not a call for help.
const RESOLVED = /\b(?:fixed|resolved|solved|no\s+longer|used\s+to|previously|now\s+(?:deterministic|stable|passes?|passing|works?|working|green|clean|blocked|fine))\b/i;

// The blocker word is negated, or is about handling it: "no failures", "none of
// the tests failed", "handles crashes", "prevents timeouts".
const NEGATED_BEFORE = /\b(?:(?:no|zero|0|without|never|nothing|not|didn(?:'|’)t|doesn(?:'|’)t|won(?:'|’)t|handl\w*|prevent\w*|avoid\w*|recover\w*|catch\w*)\s+(?:\w+\s+){0,2}|none\s+of\s+(?:\w+\s+){0,4})$/i;

// Later in the same sentence: it worked out.
const SUCCESS = /\b(?:pass(?:es|ed|ing)?|works?|worked|working|green|clean|fine|succe(?:ed|eds|eded|ss)|resolved|fixed|ok|okay|compiles?)\b/i;
const STILL = /\bstill\b|\bnot\b|n['’]t\b|\bno\b/i;

const CLAUSE_SPLIT = /\s*(?:[;—–]|\b(?:but|however|although|though|yet|so|then|while)\b)\s*/i;

function matchesAny(patterns, clause) {
  return patterns.some((re) => {
    for (const m of clause.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))) {
      if (!NEGATED_BEFORE.test(clause.slice(Math.max(0, m.index - 40), m.index))) return true;
    }
    return false;
  });
}

/**
 * Does this sentence report a failure or blocker that is still standing?
 * Returns 'state' (the agent is stuck or needs you), 'event' (something went
 * wrong), or null. Each clause is judged on its own, so "I fixed the import, but
 * the build still fails" is a problem, while "the linter failed, so I ran --fix
 * and it passes now" is not.
 */
function reportsBlocker(detect) {
  const clauses = detect.split(CLAUSE_SPLIT).filter(Boolean);
  let found = null;
  for (let i = 0; i < clauses.length; i++) {
    if (RESOLVED.test(clauses[i])) continue;
    const kind = matchesAny(STATE_PATTERNS, clauses[i]) ? 'state' : matchesAny(EVENT_PATTERNS, clauses[i]) ? 'event' : null;
    if (!kind) continue;
    const recovered = clauses.slice(i + 1).some((c) => SUCCESS.test(c) && !STILL.test(c));
    if (recovered) continue;
    if (kind === 'state') return 'state';
    found = 'event';
  }
  return found;
}

// "Want me to commit this?" is an offer, not a decision you must make now.
const OFFER = /^(?:want\s+me\s+to|would\s+you\s+like\s+me\s+to|shall\s+i|should\s+i|do\s+you\s+want\s+me\s+to)\s+(?:also|go\s+ahead|commit|push|open|create|add|write)\b/i;
const SOFT_OFFER = /^(?:let\s+me\s+know\s+if\s+you(?:'d|\s+would)?\s+(?:like|want)|i\s+(?:can|could)\s+also)\b/i;

// Asks that have no question mark.
const ASK = [
  /\blet\s+me\s+know\s+(?:which|what|whether|how|when|where)\b/i,
  /\b(?:tell|show)\s+me\s+(?:which|what|when|whether|how)\b/i,
  /\bplease\s+(?:run|approve|confirm|provide|paste|send|share|grant|enable|authenticate|log\s+in)\b/i,
  // Something only you can do: "run it yourself", "you'll need to log in".
  /\b(?:run|do|approve|install|enable|set|log\s+in|authenticate|add|paste|provide)\b[^.?!]{0,60}\byourself\b/i,
  /\byou(?:'ll|\s+will|\s+need|\s+have)\s+(?:need\s+)?to\b/i
];

const RHETORICAL_NEXT = /^(?:because|no[,.\s]|yes[,.\s]|it(?:'s|\s+is)|that(?:'s|\s+is)|the\s+(?:reason|answer))\b/i;

/** Is the sentence at i a question aimed at the user, an offer, or neither? */
function classifyQuestion(sents, i) {
  const s = sents[i];
  if (s.heading || !isQuestion(s.detect)) return null;
  // A question quoted from somewhere else ("the error said 'Did you mean X?'").
  if (/["“][^"“”]*\?[^"“”]*["”]/.test(s.detect)) return null;
  // Q: ... A: ... format.
  if (/^q\s*[:.]/i.test(s.detect) && sents.slice(i + 1).some((x) => /^a\s*[:.]/i.test(x.detect))) return null;
  // Asked and answered in the next sentence.
  const next = sents[i + 1];
  if (next && !next.item && wordCount(s.detect) <= 12 && RHETORICAL_NEXT.test(next.detect)) return null;
  // An offer proposes an optional extra. A question that weighs alternatives is a
  // decision, even when it starts the same way ("Should I add it nullable instead?").
  return OFFER.test(s.detect) && !/\b(?:or|instead|rather\s+than|alternatively|otherwise)\b/i.test(s.detect) ? 'offer' : 'ask';
}

/**
 * Silence-by-default, and precise when it does speak.
 *
 * Both accessibility studies behind this project found the problem is auditory
 * overload, not silence, so the default is to say nothing unless the agent is
 * asking you something, has failed, or is stuck. And when it does speak, it says
 * THAT, not the opening of a long response: the question (with its options), or
 * the sentence that reports the failure.
 *
 * @param {string} raw   the assistant's response
 * @returns {{ speak: boolean, kind: 'question'|'blocker'|null, text: string, reason: string }}
 */
function smartSummary(raw) {
  const quiet = { speak: false, kind: null, text: '', reason: 'routine progress' };
  if (typeof raw !== 'string' || !raw.trim()) return { ...quiet, reason: 'empty' };

  // The ask is at the end of a response, so a huge message only needs its tail.
  const { sentences } = render(raw.length > 30000 ? raw.slice(-30000) : raw);
  if (!sentences.length) return quiet;

  // 1. A question for the user.
  const kinds = sentences.map((_, i) => classifyQuestion(sentences, i));
  const lastAsk = kinds.lastIndexOf('ask');
  if (lastAsk !== -1) {
    // Join a run of consecutive questions into one ask.
    let first = lastAsk;
    while (first > 0 && kinds[first - 1] === 'ask') first--;
    const asked = sentences.slice(first, lastAsk + 1).map((x) => x.spoken);

    // Options listed after the question: "Which database? - Postgres - SQLite".
    const options = [];
    for (let i = lastAsk + 1; i < sentences.length && sentences[i].item; i++) {
      options.push(sentences[i].spoken.replace(/[.:]+$/, ''));
    }

    // A very short question is meaningless alone ("OK to proceed?"): add what
    // came before it until it makes sense.
    const lead = [];
    for (let i = first - 1; i >= 0 && wordCount([...lead, ...asked].join(' ')) < 12 && lead.length < 3; i--) {
      if (sentences[i].heading || kinds[i]) break;
      lead.unshift(sentences[i].spoken);
    }

    const optionText = options.length >= 2 && options.length <= 6 ? ` Options: ${options.join('; ')}.` : '';
    let text = [...lead, ...asked].join(' ') + optionText;
    if (wordCount(text) > 45) text = [...lead, ...asked].join(' ');
    if (wordCount(text) > 45) text = asked.join(' ');
    return { speak: true, kind: 'question', text: lastWords(text, 45), reason: 'question' };
  }

  // 2. An ask without a question mark ("let me know which you prefer").
  const asked = sentences.filter((x) => !x.heading && ASK.some((re) => re.test(x.detect)));
  if (asked.length) {
    return { speak: true, kind: 'question', text: lastWords(asked[asked.length - 1].spoken, 45), reason: 'question' };
  }

  // 3. A failure or blocker: say the sentence(s) that report it. A failure the
  //    response goes on to fix ("The app crashed... I added a migration") is the
  //    story of the work, not a call for help. Being stuck always counts.
  const flagged = sentences.map((x, i) => ({ x, i, kind: x.heading ? null : reportsBlocker(x.detect) }));
  const blockers = flagged
    .filter((f) => f.kind === 'state' || (f.kind === 'event' && !sentences.slice(f.i + 1).some((n) => FIX_ACTION.test(n.detect))))
    .map((f) => f.x);
  if (blockers.length) {
    let picked = blockers.slice(-2).map((x) => x.spoken);
    if (wordCount(picked.join(' ')) > 40) picked = picked.slice(-1);
    return { speak: true, kind: 'blocker', text: `Problem: ${lastWords(picked.join(' '), 40)}`, reason: 'blocker' };
  }

  // 4. A closing offer is not worth interrupting for.
  if (kinds.includes('offer') || sentences.some((x) => SOFT_OFFER.test(x.detect))) {
    return { ...quiet, reason: 'offer' };
  }
  return quiet;
}

/** Is this response worth interrupting a human for? */
function shouldSpeak(raw) {
  const { speak, reason } = smartSummary(raw);
  return { speak, reason };
}

module.exports = { toSpokenText, shouldSpeak, smartSummary, humanizeIdentifier, humanizePath };
