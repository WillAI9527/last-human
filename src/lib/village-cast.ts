import type { Persona, Player, PlayerMind } from "@/types/game";

export interface Villager {
  id: string;
  name: string;
  occupation: string;
  gender: "male" | "female";
  ageBand: string;
  temperament: string;
  voiceId: string;
}

/** Fixed 24-person cast. Role is assigned separately and must not change these fields. */
export const VILLAGERS: readonly Villager[] = [
  { id: "m-01", name: "老汉斯", occupation: "铁匠", gender: "male", ageBand: "45–55", temperament: "嗓门大，认准了就不松口", voiceId: "male-qn-badao" },
  { id: "m-02", name: "菲利克斯", occupation: "邮差", gender: "male", ageBand: "25–35", temperament: "消息灵通，爱记谁跟谁走得近", voiceId: "Chinese (Mandarin)_Southern_Young_Man" },
  { id: "m-03", name: "老约翰", occupation: "老教堂司事", gender: "male", ageBand: "55+", temperament: "话少，记性极好", voiceId: "Chinese (Mandarin)_Humorous_Elder" },
  { id: "m-04", name: "马蒂亚斯", occupation: "磨坊主", gender: "male", ageBand: "40–50", temperament: "精于算计，先看利害", voiceId: "Chinese (Mandarin)_Reliable_Executive" },
  { id: "m-05", name: "维克多医生", occupation: "医生", gender: "male", ageBand: "35–45", temperament: "讲证据，说话慢条斯理", voiceId: "Chinese (Mandarin)_Gentleman" },
  { id: "m-06", name: "奥托", occupation: "旅店老板", gender: "male", ageBand: "40–50", temperament: "八面玲珑，谁都不得罪", voiceId: "Chinese (Mandarin)_Radio_Host" },
  { id: "m-07", name: "小托比", occupation: "报童", gender: "male", ageBand: "18–20", temperament: "冲动，爱抢话", voiceId: "Chinese (Mandarin)_Straightforward_Boy" },
  { id: "m-08", name: "卡斯帕", occupation: "猎人", gender: "male", ageBand: "30–40", temperament: "观察细，出手果断", voiceId: "lengdan_xiongzhang" },
  { id: "m-09", name: "艾米尔", occupation: "钟表匠", gender: "male", ageBand: "35–45", temperament: "抠细节，爱复盘时间线", voiceId: "male-qn-jingying" },
  { id: "m-10", name: "安塞姆神父", occupation: "神父", gender: "male", ageBand: "50+", temperament: "劝和，但关键时刻很硬", voiceId: "Chinese (Mandarin)_Male_Announcer" },
  { id: "m-11", name: "卢西安", occupation: "流浪画家", gender: "male", ageBand: "25–35", temperament: "凭直觉和神态判断人", voiceId: "Chinese (Mandarin)_Lyrical_Voice" },
  { id: "m-12", name: "优素福", occupation: "北非商人", gender: "male", ageBand: "35–45", temperament: "善谈判，喜欢拉票", voiceId: "Chinese (Mandarin)_Unrestrained_Young_Man" },
  { id: "f-01", name: "克拉拉", occupation: "女教师", gender: "female", ageBand: "25–35", temperament: "条理清晰，爱总结", voiceId: "Chinese (Mandarin)_News_Anchor" },
  { id: "f-02", name: "玛尔塔", occupation: "寡妇", gender: "female", ageBand: "45–55", temperament: "多疑，不轻易信人", voiceId: "Chinese (Mandarin)_Wise_Women" },
  { id: "f-03", name: "莉泽尔", occupation: "裁缝", gender: "female", ageBand: "30–40", temperament: "心细，抓语气里的破绽", voiceId: "danya_xuejie" },
  { id: "f-04", name: "葛蕾塔", occupation: "旅店老板娘", gender: "female", ageBand: "40–50", temperament: "爽快，爱带节奏", voiceId: "Chinese (Mandarin)_Kind-hearted_Antie" },
  { id: "f-05", name: "阿加莎修女", occupation: "修女", gender: "female", ageBand: "30–40", temperament: "温和克制，很少表态", voiceId: "Chinese (Mandarin)_Sweet_Lady" },
  { id: "f-06", name: "薇拉", occupation: "草药师", gender: "female", ageBand: "30–40", temperament: "神秘，说话留半句", voiceId: "wumei_yujie" },
  { id: "f-07", name: "小安娜", occupation: "牧羊女", gender: "female", ageBand: "18–22", temperament: "单纯，容易被说服", voiceId: "Chinese (Mandarin)_Warm_Girl" },
  { id: "f-08", name: "林晓", occupation: "东亚药剂学徒", gender: "female", ageBand: "20–25", temperament: "外乡人，谨慎旁观", voiceId: "female-shaonv" },
  { id: "f-09", name: "罗莎", occupation: "面包师", gender: "female", ageBand: "30–40", temperament: "热心肠，护着熟人", voiceId: "Chinese (Mandarin)_Warm_Bestie" },
  { id: "f-10", name: "老贝尔塔", occupation: "老接生婆", gender: "female", ageBand: "60+", temperament: "见多识广，一针见血", voiceId: "Chinese (Mandarin)_Kind-hearted_Elder" },
  { id: "f-11", name: "伊尔莎局长", occupation: "邮局女局长", gender: "female", ageBand: "45–55", temperament: "强势，喜欢主持局面", voiceId: "Chinese (Mandarin)_Mature_Woman" },
  { id: "f-12", name: "阿玛拉", occupation: "非洲小提琴手", gender: "female", ageBand: "25–35", temperament: "敏感，听感派", voiceId: "female-yujie" },
] as const;

const SEAT_NUMBER = /\d+\s*号/;

export function villagerAvatarPath(id: string): string {
  return `/avatars/villagers/${id}.webp`;
}

export function isVillagerAvatarId(value: string | undefined | null): value is string {
  return typeof value === "string" && /^(?:m|f)-\d{2}$/.test(value);
}

function midpointAge(ageBand: string): number {
  const range = ageBand.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const plus = ageBand.match(/(\d+)\s*\+/);
  if (plus) return Number(plus[1]) + 5;
  return 40;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Draw N distinct villagers. Role assignment stays independent of this draw. */
export function drawVillagers(count: number, random: () => number = Math.random): Villager[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  if (count > VILLAGERS.length) {
    throw new Error(`Village cast only has ${VILLAGERS.length} villagers`);
  }
  return shuffle(VILLAGERS, random).slice(0, count);
}

export function personaForVillager(villager: Villager): Persona {
  const basicInfo = `${villager.occupation}。${villager.temperament}`;
  if (SEAT_NUMBER.test(villager.name) || SEAT_NUMBER.test(basicInfo)) {
    throw new Error(`Villager persona must not contain a seat number: ${villager.id}`);
  }
  return {
    styleLabel: villager.occupation,
    voiceRules: [villager.temperament, "只讨论这场狼人杀，不聊村外的事"],
    mbti: "ISTJ",
    gender: villager.gender,
    age: midpointAge(villager.ageBand),
    ageBand: villager.ageBand,
    occupation: villager.occupation,
    temperament: villager.temperament,
    basicInfo,
    voiceId: villager.voiceId,
  };
}

export function playerMindForVillager(villager: Villager): PlayerMind {
  return {
    courage: villager.temperament,
    memoryBias: "更记得发言原话和票型，不记村外的事",
    suspicionThreshold: "听到前后矛盾才改口",
    selfProtection: "先把自己的说法说圆，再决定站边",
    logicDepth: "只根据桌上的发言、票和已公布的结果",
    tablePresence: villager.temperament,
  };
}

export function characterFromVillager(villager: Villager) {
  return {
    displayName: villager.name,
    avatarSeed: villager.id,
    persona: personaForVillager(villager),
    playerMind: playerMindForVillager(villager),
  };
}

/** Text other players may see. Identical for every role this villager might hold. */
export function publicPersonaText(player: Player): string {
  const persona = player.agentProfile?.persona;
  if (!persona) return player.displayName;
  const bits = [persona.occupation, persona.ageBand, persona.temperament].filter(Boolean);
  return bits.length ? `${player.displayName}（${bits.join("，")}）` : player.displayName;
}

export function publicUiData(player: Player) {
  const persona = player.agentProfile?.persona;
  return {
    displayName: player.displayName,
    occupation: persona?.occupation ?? "",
    temperament: persona?.temperament ?? "",
    ageBand: persona?.ageBand ?? "",
    gender: persona?.gender ?? "",
    avatar: isVillagerAvatarId(player.avatarSeed) ? villagerAvatarPath(player.avatarSeed) : (player.avatarSeed ?? ""),
    voiceId: persona?.voiceId ?? "",
  };
}
