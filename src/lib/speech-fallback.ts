/** In-character lines used only when a seat never produces a public speech. */

const GENERIC_FALLBACK_LINES = [
  "我再听听，这轮先过。",
  "信息还不够，我先不站边。",
  "让我再对一下前面的话。",
  "我这轮没什么要补充的。",
  "先听后面的人怎么说。",
  "我暂时没把握，先放一放。",
  "票先不急，我再看看。",
  "这轮我就听到这里。",
] as const;

const VILLAGER_FALLBACK_LINES: Record<string, readonly string[]> = {
  老汉斯: ["我再听听，先过。", "我还没听死，这轮先不拍板。", "嗓门先收着，下轮再说。"],
  菲利克斯: ["我再对一下谁跟谁一趟，先过。", "信还没对完，这轮先听。", "我记一下，先不表态。"],
  老约翰: ["我再回想一遍，先过。", "话少，这轮先听你们说。", "我还没记全，先不插嘴。"],
  马蒂亚斯: ["这笔账还没算清，先过。", "利害没看明白，我先不站。", "先听完，再算该跟谁。"],
  维克多医生: ["证据还不够，我先不诊断。", "让我再核对一遍，先过。", "现在下结论太早。"],
  奥托: ["我先两边都听听，这轮过。", "店里的事我懂，桌上的还没听全。", "谁也不得罪，我先过。"],
  小托比: ["我嘴快，这轮偏要先忍住。", "还没听完，我先不抢话。", "等一下，我再听两句。"],
  卡斯帕: ["林子里的动静我还没看清，先过。", "先观察，这轮不下手。", "我再看一眼脚印。"],
  艾米尔: ["时间对不上，我先不表态。", "让我再把顺序捋一遍。", "细节还差一截，先过。"],
  安塞姆神父: ["先别吵，我再听一会儿。", "这轮我劝自己先闭嘴。", "话还没说圆，我先过。"],
  卢西安: ["神态我还没看准，先过。", "直觉还模糊，这轮不画结论。", "我再看两眼，先听。"],
  优素福: ["买卖没谈拢，这轮先不拉票。", "我再听听价，先过。", "现在站队太急。"],
  克拉拉: ["我还没总结完，先过。", "条理还乱，这轮先听。", "等我把今天的话归归类。"],
  玛尔塔: ["我谁都不急着信，先过。", "疑点还在，这轮不表态。", "先听，我不会轻易点头。"],
  莉泽尔: ["语气里还有线头，我先不剪。", "破绽没抓死，这轮先过。", "我再听一遍用词。"],
  葛蕾塔: ["节奏先不带了，我听一轮。", "这轮我歇口气，先过。", "话赶话容易错，我先停。"],
  阿加莎修女: ["我很少抢着表态，这轮也一样。", "先安静听完。", "我再想想，先过。"],
  薇拉: ["话留半句，这轮先到这。", "药味还没闻清，先不说。", "我再听听。"],
  小安娜: ["我有点乱，先听你们的。", "先别催我站边。", "我再想想，这轮过。"],
  林晓: ["我是外乡人，先看清再说。", "这轮我旁观。", "不熟的事，我不抢话。"],
  罗莎: ["熟人的话我还没对完，先过。", "先护着别乱咬，我再听。", "这轮我不多嘴。"],
  老贝尔塔: ["我见得多，也不会没听完就定案。", "先过，一句就能说死的话我还没听到。", "让我再看一眼。"],
  伊尔莎局长: ["这轮先不主持，我听。", "局面还乱，我先不拍板。", "等发言齐了再说。"],
  阿玛拉: ["调子还不准，我先不拉弦。", "我再听，这轮过。", "感觉还没齐。"],
};

export function fallbackLinesFor(name: string): readonly string[] {
  return VILLAGER_FALLBACK_LINES[name] ?? GENERIC_FALLBACK_LINES;
}

/** Random unused line for this game. The same sentence is not picked twice. */
export function pickFallbackSpeech(
  name: string,
  used: readonly string[] = [],
  random: () => number = Math.random,
): { line: string; used: string[] } {
  const own = VILLAGER_FALLBACK_LINES[name] ?? [];
  const pool = [...own, ...GENERIC_FALLBACK_LINES];
  const unused = pool.filter((line, index) => !used.includes(line) && pool.indexOf(line) === index);
  const source = unused.length > 0 ? unused : GENERIC_FALLBACK_LINES;
  const roll = random();
  const index = Math.min(source.length - 1, Math.max(0, Math.floor((Number.isFinite(roll) ? roll : 0) * source.length)));
  const line = source[index] ?? GENERIC_FALLBACK_LINES[0];
  return { line, used: used.includes(line) ? [...used] : [...used, line] };
}
