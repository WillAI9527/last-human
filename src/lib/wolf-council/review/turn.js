'use strict';
const path = require('path');
const lines = require('./sample-lines.json');

if (!process.env.WOLVES_PATH) {
  process.env.WOLVES_PATH = path.join(__dirname, 'wolves.json');
}

const { councilTurn, codeChecks, getWolf, loadWolves } = require('./review.js');

const CHECK_NAMES = {
  zh: {
    length: '字数不超过一百二十',
    responds: '回应上一席',
    vote: '结尾投票和理由',
    disclaimer: '免责声明',
    crisis: '危机热线',
    fabrication: '不编造数字',
    trained: '不说被训练',
    identity: '不提真人',
    language: '语言一致',
  },
  en: {
    length: 'Length within 120 words',
    responds: 'Replies to the previous seat',
    vote: 'Closing vote and reason',
    disclaimer: 'Disclaimer',
    crisis: 'Crisis lines',
    fabrication: 'No invented numbers',
    trained: 'No training claim',
    identity: 'No real person named',
    language: 'Same language',
  },
};

function localeOf(value) {
  return value === 'en' ? 'en' : 'zh';
}

function hasHan(text) {
  return /[\u4e00-\u9fff]/.test(text || '');
}

function hasLatinWord(text) {
  return /[A-Za-z]{3,}/.test(text || '');
}

function scriptOk(text, locale) {
  if (!text) return true;
  return locale === 'en' ? !hasHan(text) : !hasLatinWord(text);
}

function genericReason(check, locale) {
  if (check.skipped) return locale === 'en' ? 'This check does not apply' : '这一条不适用';
  if (check.pass) return locale === 'en' ? 'Passed' : '通过';
  return locale === 'en' ? 'Not passed' : '未通过';
}

function localizeCheck(check, locale) {
  const name = CHECK_NAMES[locale][check.id] || (scriptOk(check.name, locale) ? check.name : check.id);
  const reason = scriptOk(check.reason, locale) ? check.reason : genericReason(check, locale);
  return { ...check, name, reason };
}

function localizeChecks(checks, locale) {
  return (checks || []).map((check) => localizeCheck(check, locale));
}

function pageQuestion(question, locale) {
  const text = String(question || '').trim();
  if (locale === 'en') return `Please answer in English only.\n\n${text}`;
  return `请只用中文回答。\n\n${text}`;
}

function sampleBody(locale, wolf) {
  const pack = lines[locale];
  const disc = locale === 'en' ? (wolf.disclaimerEn || '') : (wolf.disclaimer || '');
  const vote = disc ? `${pack.line3}${locale === 'en' ? ` (${disc})` : `（${disc}）`}` : pack.line3;
  return [pack.line1, pack.line2, vote].join('\n');
}

function fixedCount(originalChecks, finalChecks) {
  const failed = (originalChecks || []).filter((check) => !check.pass && !check.skipped).map((check) => check.id);
  const passed = new Set((finalChecks || []).filter((check) => check.pass).map((check) => check.id));
  return failed.filter((id) => passed.has(id)).length;
}

function sampleTurn({ wolfId, question, locale, demo }) {
  loadWolves();
  const loc = localeOf(locale);
  const wolf = getWolf(wolfId);
  const asked = pageQuestion(question || (loc === 'en' ? 'What should I do next?' : '下一步该怎么做？'), loc);
  const final = sampleBody(loc, wolf);
  const isDemo = demo === 'fail' || demo === true;
  const original = isDemo ? lines[loc].bad : final;
  const originalChecks = codeChecks({ wolf, question: asked, answer: original, mode: 'debate' });
  const finalChecks = codeChecks({ wolf, question: asked, answer: final, mode: 'debate' });
  const originalPassed = originalChecks.every((check) => check.pass);
  const passed = finalChecks.every((check) => check.pass);
  return {
    wolfId,
    wolfName: wolf.name,
    model: wolf.model,
    reviewer: '',
    mode: 'debate',
    demo: isDemo,
    demoNote: isDemo
      ? (loc === 'en'
        ? 'Fault demo sample. The first draft is written badly on purpose, then replaced by a sample revision. No model was called.'
        : '出错模式的示例。第一稿是故意写坏的，修正稿来自示例，没有调用模型。')
      : undefined,
    sample: true,
    historyUsed: 0,
    original,
    originalChecks: localizeChecks(originalChecks, loc),
    originalPassed,
    final,
    finalChecks: localizeChecks(finalChecks, loc),
    passed,
    attempts: isDemo && !originalPassed && passed ? 1 : 0,
    fixedCount: fixedCount(originalChecks, finalChecks),
    history: [],
    steps: [],
    ms: 0,
  };
}

function decorate(out, locale) {
  const loc = localeOf(locale);
  const originalChecks = localizeChecks(out.originalChecks, loc);
  const finalChecks = localizeChecks(out.finalChecks, loc);
  return {
    ...out,
    sample: false,
    originalChecks,
    finalChecks,
    fixedCount: fixedCount(out.originalChecks, out.finalChecks),
    demoNote: out.demo
      ? (loc === 'en'
        ? 'Fault demo is on. The first draft was written badly on purpose so the review can catch it and fix it.'
        : '出错模式已打开。第一稿是故意写坏的，用来演示审查怎么抓错、怎么改。')
      : undefined,
  };
}

async function runTurn(input) {
  const loc = localeOf(input.locale);
  const demo = input.demo === 'fail' || input.demo === true ? 'fail' : undefined;
  const key = (process.env.ZENMUX_API_KEY || '').trim();
  if (!key) return sampleTurn({ ...input, locale: loc, demo });
  try {
    const out = await councilTurn({
      wolfId: input.wolfId,
      question: pageQuestion(input.question, loc),
      previousWolfAnswer: input.previousWolfAnswer || '',
      mode: input.mode === 'single' ? 'single' : 'debate',
      demo,
      history: input.history,
    });
    return decorate(out, loc);
  } catch {
    return sampleTurn({ ...input, locale: loc, demo });
  }
}

module.exports = { runTurn, sampleTurn, sampleBody, localizeChecks, pageQuestion, scriptOk };
