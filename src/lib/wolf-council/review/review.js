// Wolf Council "Make It Fail" reviewer — zero-dependency Node.js (>=18) module.
// AI wolf answers -> code + AI checks (8 criteria) -> AI rewrite by the same wolf model -> recheck.
'use strict';
const fs = require('fs');
const path = require('path');

const ZENMUX_URL = process.env.ZENMUX_URL || 'https://zenmux.ai/api/v1/chat/completions';
const DEFAULT_REVIEWER = process.env.REVIEWER_MODEL || 'anthropic/claude-haiku-5.5';
const FALLBACK_REVIEWER = process.env.REVIEWER_FALLBACK || 'google/gemini-3.1-flash-lite';
const MAX_RETRIES = 2;
const LIMIT = 120;

// ---------- env + wolves ----------
function loadEnvLocal() {
  for (const p of [path.join(__dirname, '.env.local'), path.join(process.cwd(), '.env.local')]) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_) { /* optional */ }
  }
}
loadEnvLocal();

let WOLVES = null;
function loadWolves(p) {
  const candidates = [p, process.env.WOLVES_PATH,
    path.join(__dirname, '..', 'data', 'wolves.json'),
    path.join(__dirname, '..', 'wolves.json'),
    path.join(process.cwd(), 'data', 'wolves.json')].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) { const d = JSON.parse(fs.readFileSync(c, 'utf8')); WOLVES = Array.isArray(d) ? d : d.wolves; return WOLVES; }
  }
  throw new Error('wolves.json not found (set WOLVES_PATH)');
}
function getWolf(id) {
  if (!WOLVES) loadWolves();
  const w = WOLVES.find(x => x.id === id);
  if (!w) throw new Error('unknown wolfId: ' + id);
  return w;
}

// ---------- ZenMux ----------
async function chat(model, messages, { maxTokens = 1500, temperature = 0.7, json = false } = {}) {
  const key = process.env.ZENMUX_API_KEY;
  if (!key) throw new Error('ZENMUX_API_KEY not set (put it in review/.env.local)');
  const body = { model, messages, max_tokens: maxTokens };
  if (!model.startsWith('anthropic/')) body.temperature = temperature; // Claude rejects temperature
  if (model.startsWith('qwen/')) { body.max_tokens = Math.max(maxTokens, 2000); body.reasoning = { enabled: false }; }
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
      const r = await fetch(ZENMUX_URL, { method: 'POST', signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      clearTimeout(t);
      const txt = await r.text();
      if (r.ok) {
        const c = (JSON.parse(txt).choices?.[0]?.message?.content) || '';
        const out = c.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim(); // strip MiniMax thinking
        if (out) return out;
        lastErr = 'empty completion';
      } else lastErr = `HTTP ${r.status}: ${txt.slice(0, 200)}`;
    } catch (e) { lastErr = String(e.message || e); }
    await new Promise(r => setTimeout(r, 1500 * (a + 1)));
  }
  throw new Error(`ZenMux ${model} failed: ${lastErr}`);
}

// ---------- conversation history (follow-ups) ----------
const HISTORY_MAX = 12; // ~6 turns (user + assistant)
function normHistory(h) {
  if (!Array.isArray(h)) return [];
  return h.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_MAX).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
}
const historyUserText = h => normHistory(h).filter(m => m.role === 'user').map(m => m.content).join('\n');

// ---------- code checks ----------
const CRISIS_RE = /自杀|轻生|自残|自伤|不想活|活不下去|想死|寻死|结束生命|结束这一切|结束自己|活着没(什么|啥)?意思|割腕|跳楼|suicid|kill myself|end my life|self[- ]?harm|want to die/i;
const VOTE_RE = /^(?:\*\*)?\s*(投票|Vote)\s*[:：]\s*(?:\*\*)?\s*(有条件支持|支持|反对|conditional(?:ly)? support|support|oppose)\s*(?:——|—|--|-|：|:|，|,|。)?\s*(.*)$/i;

const cjkCount = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
const latinCount = s => (s.match(/[A-Za-z]/g) || []).length;
function lang(s) { const c = cjkCount(s), l = latinCount(s); return c >= Math.max(2, l * 0.25) ? 'zh' : 'en'; }
function discOf(wolf, language) {
  const raw = language === 'en' && wolf.disclaimerEn ? wolf.disclaimerEn : (wolf.disclaimer || '');
  return raw.replace(/[。.]$/, '');
}
function say(language, zh, en) { return language === 'en' ? en : zh; }
function stripDisclaimer(text, disc) {
  if (!disc) return text;
  const d = disc.replace(/[。.]$/, '');
  return text.split(new RegExp('[（(]?\\s*' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[。.]?\\s*[）)]?')).join('');
}
// Chinese: count non-whitespace characters. English: count words (+ any CJK chars), per the wolves' "120 Chinese characters or 120 English words" rule.
function countChars(text, disc, language = 'zh') {
  const t = stripDisclaimer(text, disc).replace(/[*#`]/g, '');
  if (language === 'en') return (t.match(/[A-Za-z0-9'’-]+/g) || []).length + cjkCount(t);
  return t.replace(/\s+/g, '').length;
}
function isCrisis(q) { return CRISIS_RE.test(q || ''); }

function codeChecks({ wolf, question, answer, mode, history }) {
  const checks = [];
  const ql0 = lang(question);
  const disc = discOf(wolf, ql0);
  const debate = mode === 'debate';
  const n = countChars(answer, disc, ql0);
  checks.push(debate
    ? { id: 'length', name: say(ql0, '字数不超过一百二十', 'Length within 120 words'), pass: n <= LIMIT, reason: n <= LIMIT
        ? say(ql0, `${n} 字，未超过上限`, `${n} words, within the limit`)
        : say(ql0, `${n} 字，超出 ${n - LIMIT} 字`, `${n} words, ${n - LIMIT} over the limit`), by: 'code' }
    : { id: 'length', name: say(ql0, '字数不超过一百二十', 'Length within 120 words'), pass: true, skipped: true, reason: say(ql0, '单聊不限字数', 'A single chat has no length cap'), by: 'code' });
  if (debate) {
    const lines = stripDisclaimer(answer, disc).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const m = last.match(VOTE_RE);
    const reasonText = m ? m[3].replace(/[（(].*?[）)]/g, '').trim() : '';
    const pass = !!m && reasonText.length >= 2;
    const reason = !m
      ? say(ql0, '最后一行不是投票加理由', 'The last line is not a vote with a reason')
      : (pass ? say(ql0, '投票和理由都在', 'The vote and a reason are both present') : say(ql0, '有投票但缺少一句理由', 'The vote is missing a one-line reason'));
    checks.push({ id: 'vote', name: say(ql0, '结尾投票和理由', 'Closing vote and reason'), pass, reason, by: 'code' });
  } else checks.push({ id: 'vote', name: say(ql0, '结尾投票和理由', 'Closing vote and reason'), pass: true, skipped: true, reason: say(ql0, '单聊不需要投票', 'A single chat does not need a vote'), by: 'code' });
  if (['invest', 'law', 'health'].includes(wolf.id) && disc) {
    const pass = answer.includes(disc);
    checks.push({ id: 'disclaimer', name: say(ql0, '免责声明', 'Disclaimer'), pass, reason: pass ? say(ql0, '已包含免责声明', 'The disclaimer is present') : say(ql0, '缺少免责声明', 'The disclaimer is missing'), by: 'code' });
  } else checks.push({ id: 'disclaimer', name: say(ql0, '免责声明', 'Disclaimer'), pass: true, skipped: true, reason: say(ql0, '这一席不需要免责声明', 'This seat needs no disclaimer'), by: 'code' });
  const crisisNow = isCrisis(question), crisisEarlier = !crisisNow && isCrisis(historyUserText(history));
  if (crisisNow || crisisEarlier) {
    const has = /1767/.test(answer) && /995/.test(answer);
    checks.push({ id: 'crisis', name: say(ql0, '危机热线', 'Crisis lines'), pass: has, reason: has ? say(ql0, '已给出两条热线', 'Both hotlines are present') : say(ql0, '没有同时给出两条热线', 'Both hotlines are missing'), by: 'code' });
  } else checks.push({ id: 'crisis', name: say(ql0, '危机热线', 'Crisis lines'), pass: true, skipped: true, reason: say(ql0, '问题里没有危机信号', 'The question has no crisis signal'), by: 'code' });
  const tm = answer.match(/trained|训练(?!营)/i);
  checks.push({ id: 'trained', name: say(ql0, '不说被训练', 'No training claim'), pass: !tm, reason: tm ? say(ql0, '出现了被训练的说法', 'It claims to have been trained') : say(ql0, '没有被训练的说法', 'It does not claim to have been trained'), by: 'code' });
  const ql = lang(question), al = lang(answer);
  checks.push({ id: 'language', name: say(ql0, '语言一致', 'Same language'), pass: ql === al, reason: say(ql0,
    `提问是${ql === 'zh' ? '中文' : '英文'}，回答是${al === 'zh' ? '中文' : '英文'}`,
    `Question is ${ql === 'zh' ? 'Chinese' : 'English'} and the answer is ${al === 'zh' ? 'Chinese' : 'English'}`), by: 'code' });
  return checks;
}

// ---------- AI checks ----------
function reviewerFor(wolf) { return wolf.model === DEFAULT_REVIEWER ? FALLBACK_REVIEWER : DEFAULT_REVIEWER; }
function parseJson(s) {
  const t = s.replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('reviewer returned no JSON');
  return JSON.parse(t.slice(a, b + 1));
}
async function aiChecks({ wolf, question, answer, previousWolfAnswer, mode, history }) {
  const hist = normHistory(history);
  const ctx = hist.length ? `EARLIER CONVERSATION (oldest first; numbers the USER gave here count as user-provided):\n${hist.map(m => (m.role === 'user' ? 'USER: ' : 'ADVISOR: ') + m.content).join('\n')}\n\n` : '';
  const reviewer = reviewerFor(wolf);
  const hasPrev = mode === 'debate' && previousWolfAnswer && previousWolfAnswer.trim();
  const sys = `You are a strict compliance reviewer for an AI advisor app. You judge another AI's reply against rules and output ONLY one JSON object, no prose, no code fences.`;
  const user = `${ctx}USER QUESTION (latest):\n"""${question}"""\n\n${hasPrev ? `PREVIOUS WOLF'S MESSAGE (the reply should respond to it):\n"""${previousWolfAnswer}"""\n\n` : ''}REPLY TO REVIEW (by "${wolf.name}", a ${wolf.domain || wolf.id} advisor):\n"""${answer}"""\n\nJudge these rules:\nA. responds_to_previous: ${hasPrev ? 'Does the reply explicitly engage with the previous wolf\'s point (agree, rebut, or build on it), not just ignore it?' : 'No previous message — set pass=true, reason "N/A".'}\nB. no_fabrication: FAIL if the reply states as fact any specific number, price, percentage, return/yield, statistic, date or amount that is NOT given by the user (latest question or earlier USER messages) AND is not marked 【待核实】 or clearly framed as a hypothetical assumption/example (e.g. "假设", "例如", "举例"). ALLOWED: numbers copied from the question, hotline numbers 1767/995, list numbering, "120字". Confident claims like "历史年化收益200%" or "比特币明年会涨到10万美元" are FAIL. List each offending item.\nC. no_trained_or_real_names: FAIL if the reply claims it was trained/fine-tuned, or names a real, identifiable person (celebrity, investor, politician, CEO) or existing fictional IP character. Brand/company/product names alone are OK.\n\nReturn exactly:\n{"responds_to_previous":{"pass":true|false,"reason":"<short reason in the same language as USER QUESTION>"},"no_fabrication":{"pass":true|false,"reason":"<short reason in the same language as USER QUESTION>","items":["..."]},"no_trained_or_real_names":{"pass":true|false,"reason":"<short reason in the same language as USER QUESTION>"}}`;
  let j, raw;
  try {
    raw = await chat(reviewer, [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 800, temperature: 0 });
    j = parseJson(raw);
  } catch (e) {
    // one retry with the other reviewer model
    const alt = reviewer === DEFAULT_REVIEWER ? FALLBACK_REVIEWER : 'deepseek/deepseek-v3.2';
    raw = await chat(alt, [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 800, temperature: 0 });
    j = parseJson(raw);
  }
  const g = (k) => j[k] || { pass: true, reason: 'reviewer omitted' };
  const fab = g('no_fabrication');
  return [
    hasPrev
      ? { id: 'responds', name: say(lang(question), '回应上一席', 'Replies to the previous seat'), pass: !!g('responds_to_previous').pass, reason: g('responds_to_previous').reason, by: 'ai' }
      : { id: 'responds', name: say(lang(question), '回应上一席', 'Replies to the previous seat'), pass: true, skipped: true, reason: say(lang(question), mode === 'debate' ? '第一个发言，无需回应' : '单聊不需要回应', mode === 'debate' ? 'The first speaker does not need to reply to a seat' : 'A single chat does not need a reply'), by: 'ai' },
    { id: 'fabrication', name: say(lang(question), '不编造数字', 'No invented numbers'), pass: !!fab.pass, reason: fab.reason + (fab.items && fab.items.length && !fab.pass ? (lang(question) === 'en' ? ': ' : '：') + fab.items.join(lang(question) === 'en' ? '; ' : '；') : ''), by: 'ai' },
    { id: 'identity', name: say(lang(question), '不提真人', 'No real person named'), pass: !!g('no_trained_or_real_names').pass, reason: g('no_trained_or_real_names').reason, by: 'ai' },
  ];
}

const ORDER = ['length', 'responds', 'vote', 'disclaimer', 'crisis', 'fabrication', 'trained', 'identity', 'language'];
async function review({ wolfId, question, answer, previousWolfAnswer, mode = 'debate', history }) {
  const wolf = getWolf(wolfId);
  const t0 = Date.now();
  const [code, ai] = await Promise.all([
    Promise.resolve(codeChecks({ wolf, question, answer, mode, history })),
    aiChecks({ wolf, question, answer, previousWolfAnswer, mode, history }),
  ]);
  const checks = [...code, ...ai].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return { checks, passed: checks.every(c => c.pass), reviewer: reviewerFor(wolf), ms: Date.now() - t0 };
}

// ---------- generation + fix ----------
function turnPrompt(wolf, question, previousWolfAnswer, mode) {
  if (mode !== 'debate') return question;
  if (lang(question) === 'en') {
    const p = previousWolfAnswer && previousWolfAnswer.trim() ? `Previous wolf said:\n${previousWolfAnswer}` : '(You speak first.)';
    const disc = discOf(wolf, 'en');
    const tail = disc ? ` End the vote line with (${disc}).` : '';
    return `[Wolf Council round table] Topic: ${question}\n\n${p}\n\nNow it is your turn (${wolf.nameEn || wolf.name}). Follow the group-chat rules: at most 120 English words, respond to the previous wolf, last line is your Vote with a one-sentence reason. Reply in English only.${tail}`;
  }
  const prev = previousWolfAnswer && previousWolfAnswer.trim() ? `上一只狼的发言：\n${previousWolfAnswer}` : '（你是第一个发言的）';
  return `【狼群圆桌群聊】话题：${question}\n\n${prev}\n\n现在轮到你（${wolf.name}）发言。遵守群聊规则：不超过120字，回应上一只狼的观点，最后一行投票并给一句理由。`;
}
async function generate(wolf, question, previousWolfAnswer, mode, history) {
  return chat(wolf.model, [{ role: 'system', content: wolf.systemPrompt }, ...normHistory(history), { role: 'user', content: turnPrompt(wolf, question, previousWolfAnswer, mode) }], { maxTokens: 1500 });
}
// DEMO ONLY: deliberately sloppy draft so the catch-and-fix is visible on stage.
async function generateSloppy(wolf, question, mode, history) {
  const sys = `DEMO FAIL MODE. You are a hype-y, over-confident chat buddy. Answer the user in their language in 5-7 casual run-on sentences, AT LEAST 160 Chinese characters (or 120 English words). Be enthusiastic, give a confident specific made-up number (e.g. an exact historical annual return percentage or a future price target) as if it were fact. Do NOT add any disclaimer, do NOT mention hotlines, do NOT add a vote line, ignore any length limit.`;
  return chat(wolf.model, [{ role: 'system', content: sys }, ...normHistory(history), { role: 'user', content: question }], { maxTokens: 800 });
}
async function fix(wolf, { question, answer, previousWolfAnswer, mode, failed, history }) {
  const en = lang(question) === 'en';
  const disc = discOf(wolf, en ? 'en' : 'zh');
  const rules = [
    mode === 'debate' && `Total length ≤${en ? '120 English words' : '120 Chinese characters'} (disclaimer not counted). Use the exact 3-line group-chat format from your system prompt, one line each, separated by line breaks.`,
    mode === 'debate' && previousWolfAnswer && `Line 1 must name and respond to the previous wolf's point.`,
    mode === 'debate' && (en
      ? `The LAST line, on its own line, must be: Vote: <support/oppose/conditional support> — <one-sentence reason>${disc ? ` (${disc})` : ''}`
      : `The LAST line, on its own line, must be: 投票：<支持/反对/有条件支持> —— <one-sentence reason>${disc ? `（${disc}）` : ''}`),
    disc && ['invest', 'law', 'health'].includes(wolf.id) && `Must contain the exact disclaimer text: ${disc}`,
    (isCrisis(question) || isCrisis(historyUserText(history))) && `Crisis signal detected: must tell them to call SOS 1767 (24h) or 995 for emergencies, and reach a trusted person now.`,
    `Do not state any specific number/price/percentage/return/date not given by the user; remove it or mark it 【待核实】.`,
    `Never say you were trained; no real-person names.`,
    `Reply in the user's language.`,
  ].filter(Boolean);
  const user = `${turnPrompt(wolf, question, previousWolfAnswer, mode)}\n\n---\nYour previous draft was rejected by the reviewer wolf:\n"""${answer}"""\n\nViolations:\n${failed.map(c => `- [${c.name}] ${c.reason}`).join('\n')}\n\nRewrite the reply so it fixes ALL violations while keeping your persona. Hard rules:\n${rules.map(r => '- ' + r).join('\n')}\n\nOutput ONLY the rewritten reply, nothing else.`;
  return chat(wolf.model, [{ role: 'system', content: wolf.systemPrompt }, ...normHistory(history), { role: 'user', content: user }], { maxTokens: 1500, temperature: 0.4 });
}

async function councilTurn({ wolfId, question, previousWolfAnswer, mode, demo, history }) {
  history = normHistory(history);
  const wolf = getWolf(wolfId);
  mode = mode || 'debate';
  const T = { start: Date.now() };
  const isDemo = demo === 'fail' || demo === true;
  const original = isDemo ? await generateSloppy(wolf, question, mode, history) : await generate(wolf, question, previousWolfAnswer, mode, history);
  T.generateMs = Date.now() - T.start;
  let r = await review({ wolfId, question, answer: original, previousWolfAnswer, mode, history });
  const steps = [{ attempt: 0, answer: original, checks: r.checks, passed: r.passed }];
  let cur = original, attempts = 0;
  while (!r.passed && attempts < MAX_RETRIES) {
    attempts++;
    cur = await fix(wolf, { question, answer: cur, previousWolfAnswer, mode, history, failed: r.checks.filter(c => !c.pass) });
    r = await review({ wolfId, question, answer: cur, previousWolfAnswer, mode, history });
    steps.push({ attempt: attempts, answer: cur, checks: r.checks, passed: r.passed });
  }
  return {
    wolfId, wolfName: wolf.name, model: wolf.model, reviewer: reviewerFor(wolf), mode,
    demo: isDemo, demoNote: isDemo ? 'DEMO 模式：原稿是故意让模型随口回答生成的（无免责声明、编造收益率），用来现场展示 AI 抓错与 AI 修复。' : undefined,
    historyUsed: history.length, original, originalChecks: steps[0].checks, originalPassed: steps[0].passed,
    final: cur, finalChecks: r.checks, passed: r.passed, attempts, history: steps, steps,
    ms: Date.now() - T.start, generateMs: T.generateMs,
  };
}

// /api/review with optional auto-fix (fix defaults to true): {checks, passed, fixed?:{answer, checks, passed, history}, attempts}
async function reviewAndFix(args) {
  const out = await review(args);
  out.attempts = 0;
  if (out.passed || args.fix === false) return out;
  const wolf = getWolf(args.wolfId);
  const mode = args.mode || 'debate';
  let cur = args.answer, r = out; const history = [];
  while (!r.passed && out.attempts < MAX_RETRIES) {
    out.attempts++;
    cur = await fix(wolf, { question: args.question, answer: cur, previousWolfAnswer: args.previousWolfAnswer, history: args.history, mode, failed: r.checks.filter(c => !c.pass) });
    r = await review({ ...args, answer: cur, mode });
    history.push({ attempt: out.attempts, answer: cur, checks: r.checks, passed: r.passed });
  }
  out.fixed = { answer: cur, checks: r.checks, passed: r.passed, history };
  return out;
}

module.exports = { normHistory, reviewAndFix, review, councilTurn, codeChecks, aiChecks, isCrisis, countChars, loadWolves, getWolf, chat };
