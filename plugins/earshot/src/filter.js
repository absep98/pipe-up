'use strict';

// The product. Everything else here is plumbing.
//
// Claude Code responses are mostly markdown scaffolding, code, diffs, file
// paths and tool chatter. Reading that verbatim is worse than reading it with
// your eyes, which is why the eight existing TTS hooks aren't useful for long
// sessions. This turns a response into something worth hearing: prose only,
// code described rather than recited, identifiers pronounceable, capped short.

const FILLER_LEAD = /^(sure|okay|ok|alright|great|perfect|got it|done|certainly|absolutely)[\s,!.—-]+/i;

// Words that mean a human is needed. Used by shouldSpeak() in silence mode.
const NEEDS_HUMAN = [
  'failed', 'failing', 'error', 'errors', 'blocked', 'blocker', 'cannot', "can't",
  'unable', 'broken', 'crash', 'crashed', 'denied', 'permission', 'conflict',
  'which would you', 'let me know', 'do you want', 'should i', 'confirm',
  'not sure', 'ambiguous', 'needs your', 'waiting for'
];

const LANG_NAMES = {
  js: 'JavaScript', jsx: 'JavaScript', javascript: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', go: 'Go', golang: 'Go', rs: 'Rust', rust: 'Rust',
  java: 'Java', rb: 'Ruby', sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'PowerShell', powershell: 'PowerShell', sql: 'SQL', json: 'JSON',
  yaml: 'YAML', yml: 'YAML', html: 'HTML', css: 'CSS', diff: 'diff', patch: 'diff'
};

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
 * A path is only worth hearing as its last one or two segments. Nobody needs
 * "see slash learning slash src slash auth slash handler dot ts" spoken at them.
 */
function humanizePath(raw) {
  const cleaned = raw.replace(/[`'"]/g, '').replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (!parts.length) return '';
  const file = parts[parts.length - 1];
  const base = file.replace(/\.[a-z0-9]{1,6}$/i, '');
  return humanizeIdentifier(base);
}

function looksLikePath(s) {
  return /[/\\]/.test(s) || /^[\w.-]+\.[a-z]{1,6}$/i.test(s);
}

// Symbol soup: keep it out of the audio entirely.
function isSymbolic(s) {
  return !/[a-z]/i.test(s) || /^[^a-z0-9]*$/i.test(s);
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

  const stats = { codeBlocks: 0, codeLines: 0, tables: 0, truncated: false, originalChars: 0 };
  if (typeof raw !== 'string' || !raw.trim()) return { text: '', stats };

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
  //    we treat every line as a sentence the TTS engine pauses in the middle of
  //    clauses ("so two. concurrent requests could..."). Must run while the list
  //    and heading markers are still present to detect a genuine new block.
  const BLOCK_START = /^[ \t]*(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>[ \t]?|\|)/;
  s = s.split('\n').reduce((acc, line) => {
    const prev = acc[acc.length - 1];
    const isContinuation = prev !== undefined && prev.trim() && line.trim() &&
      !BLOCK_START.test(line) && !/[.!?:]$/.test(prev.trim());
    if (isContinuation) acc[acc.length - 1] = `${prev.replace(/\s+$/, '')} ${line.trim()}`;
    else acc.push(line);
    return acc;
  }, []).join('\n');

  // 4. Markup that carries no sound.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '');          // horizontal rules
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');                   // images
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');                // links -> text
  s = s.replace(/<https?:\/\/[^>]+>|https?:\/\/\S+/g, 'a link');
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');               // heading markers
  s = s.replace(/^[ \t]*>[ \t]?/gm, '');                        // blockquotes

  // 4. Inline code: keep it only if a human could say it.
  s = s.replace(/`([^`\n]+)`/g, (_m, inner) => {
    const v = inner.trim();
    if (!v || isSymbolic(v)) return '';
    if (looksLikePath(v)) return humanizePath(v);
    if (v.split(/\s+/).length > 4) return '';                   // an inline snippet, not a name
    return humanizeIdentifier(v.replace(/\(\)$/, ''));
  });

  // 5. Emphasis markers, list bullets, checkboxes, leading emoji.
  s = s.replace(/(\*\*\*|\*\*|\*|___|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2');
  s = s.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]*/gm, '');
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2700}-\u{27BF}]/gu, '');

  // 6. Bare paths that were never in backticks.
  s = s.replace(/(?:[\w.-]+[/\\])+[\w.-]+\.[a-z]{1,6}\b/gi, (m) => humanizePath(m));

  // 7. Line-level cleanup, then stitch fragments into sentences so the TTS
  //    engine gets pauses in the right places instead of one long run-on.
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const sentences = [];
  for (let line of lines) {
    line = line.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    if (!line || isSymbolic(line)) continue;
    if (!/[.!?:]$/.test(line)) line += '.';
    sentences.push(line);
  }

  let text = sentences.join(' ').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(FILLER_LEAD, '');
  if (text) text = text[0].toUpperCase() + text.slice(1);

  // 8. Cap it. The whole point is that this is shorter than reading.
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    const clipped = words.slice(0, maxWords).join(' ');
    const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
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

/**
 * Silence-by-default: is this worth interrupting a human for?
 *
 * Both accessibility studies behind this project found the problem is auditory
 * overload, not silence — so the default is to say nothing unless the agent is
 * actually stuck, has failed, or is asking something.
 *
 * @param {string} raw   the assistant's response
 * @returns {{ speak: boolean, reason: string }}
 */
function shouldSpeak(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { speak: false, reason: 'empty' };
  const lower = raw.toLowerCase();

  // A question aimed at the user, not a rhetorical heading.
  const asksUser = /\?\s*$/.test(raw.trim()) || /\?(\s|$)/.test(lower.slice(-400));
  if (asksUser) return { speak: true, reason: 'question' };

  for (const kw of NEEDS_HUMAN) {
    if (lower.includes(kw)) return { speak: true, reason: `flagged: ${kw}` };
  }
  return { speak: false, reason: 'routine progress' };
}

module.exports = { toSpokenText, shouldSpeak, humanizeIdentifier, humanizePath };
