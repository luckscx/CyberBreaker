import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePersonByLLM } from './llmService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 缓存目录：server/data/gp_cache/ */
const CACHE_DIR = join(__dirname, '..', '..', 'data', 'gp_cache');

export interface PersonQuestion {
  id: number;
  question: string;
  answer: string;
  /** 难度层级：1=模糊 2=稍具体 3=较具体（无送分题） */
  tier: 1 | 2 | 3;
}

export interface PersonCharacter {
  id: string;
  name: string;
  questions: PersonQuestion[];
}

/* ────── 静态 fallback 角色库（LLM 不可用时使用） ────── */

const FALLBACK_CHARACTERS: PersonCharacter[] = [
  {
    id: 'einstein',
    name: '爱因斯坦',
    questions: [
      { id: 1, question: '此人的性别是？', answer: '男性', tier: 1 },
      { id: 2, question: '此人主要活跃在什么领域？', answer: '理论物理学', tier: 1 },
      { id: 3, question: '此人是哪个国家的人？', answer: '出生于德国，后加入美国国籍', tier: 1 },
      { id: 4, question: '此人大约生活在什么年代？', answer: '1879年至1955年', tier: 1 },
      { id: 5, question: '此人是否获得过诺贝尔奖？', answer: '是的，1921年获得诺贝尔物理学奖', tier: 1 },
      { id: 6, question: '此人有什么标志性的外貌特征？', answer: '蓬乱的白色头发，不修边幅的形象', tier: 2 },
      { id: 7, question: '此人曾在哪个国家的专利局任职？', answer: '瑞士伯尔尼专利局', tier: 2 },
      { id: 8, question: '此人曾在哪所著名机构任教？', answer: '普林斯顿高等研究院', tier: 2 },
      { id: 9, question: '此人最著名的理论成就是什么？', answer: '提出了相对论（包括狭义和广义）', tier: 2 },
      { id: 10, question: '此人提出过哪个关于能量与质量的公式？', answer: 'E=mc²', tier: 2 },
      { id: 11, question: '此人因为什么发现获得诺贝尔奖？', answer: '对光电效应的理论解释', tier: 2 },
      { id: 12, question: '此人为何离开祖国定居海外？', answer: '为躲避纳粹迫害而移居美国', tier: 2 },
    ],
  },
  {
    id: 'libai',
    name: '李白',
    questions: [
      { id: 1, question: '此人的性别是？', answer: '男性', tier: 1 },
      { id: 2, question: '此人主要活跃在什么领域？', answer: '文学（诗歌创作）', tier: 1 },
      { id: 3, question: '此人是中国哪个朝代的？', answer: '唐朝', tier: 1 },
      { id: 4, question: '此人最大的个人嗜好是什么？', answer: '饮酒', tier: 1 },
      { id: 5, question: '此人的出生地在哪里？', answer: '碎叶城（今吉尔吉斯斯坦境内）', tier: 1 },
      { id: 6, question: '此人曾担任过什么官职？', answer: '翰林供奉，为皇帝写诗文', tier: 2 },
      { id: 7, question: '此人性格上最大的特点是？', answer: '豪放不羁，蔑视权贵', tier: 2 },
      { id: 8, question: '此人最擅长的诗歌题材是？', answer: '月亮、饮酒、山水与送别', tier: 2 },
      { id: 9, question: '此人最著名的一首思乡诗描写了什么场景？', answer: '夜晚在床前看到月光而思念故乡', tier: 2 },
      { id: 10, question: '此人写过一首关于瀑布的名作，描绘的是哪里？', answer: '庐山瀑布', tier: 2 },
      { id: 11, question: '此人有首名作形容某地地势极为险峻？', answer: '形容四川入关中的蜀道之难', tier: 2 },
      { id: 12, question: '此人的诗歌风格被后人怎样评价？', answer: '浪漫主义，想象力丰富，气势恢宏', tier: 2 },
    ],
  },
  {
    id: 'davinci',
    name: '达芬奇',
    questions: [
      { id: 1, question: '此人的性别是？', answer: '男性', tier: 1 },
      { id: 2, question: '此人主要活跃在哪些领域？', answer: '绘画、科学、工程等多个领域', tier: 1 },
      { id: 3, question: '此人是哪个国家的？', answer: '意大利', tier: 1 },
      { id: 4, question: '此人生活在什么历史时期？', answer: '文艺复兴时期（15至16世纪）', tier: 1 },
      { id: 5, question: '此人为何被称为"全才"？', answer: '在艺术、科学、工程等几乎所有领域都有建树', tier: 1 },
      { id: 6, question: '此人出生在意大利哪个地区？', answer: '托斯卡纳地区的一个小镇', tier: 2 },
      { id: 7, question: '此人有什么个人生活习惯？', answer: '左撇子，据传终身素食', tier: 2 },
      { id: 8, question: '此人的笔记有什么特别之处？', answer: '使用镜像文字书写（从右往左反写）', tier: 2 },
      { id: 9, question: '此人最著名的画作描绘的是？', answer: '一位带有神秘微笑的女性肖像', tier: 2 },
      { id: 10, question: '此人还有一幅关于宗教题材的巨幅壁画？', answer: '描绘耶稣与十二门徒最后聚餐的场景', tier: 2 },
      { id: 11, question: '此人设计过哪些超前于时代的发明？', answer: '直升机、坦克、降落伞等的设计草图', tier: 2 },
      { id: 12, question: '此人除了绘画还研究什么？', answer: '人体解剖、飞行器设计、军事工程', tier: 2 },
    ],
  },
  {
    id: 'napoleon',
    name: '拿破仑',
    questions: [
      { id: 1, question: '此人的性别是？', answer: '男性', tier: 1 },
      { id: 2, question: '此人主要活跃在什么领域？', answer: '军事和政治', tier: 1 },
      { id: 3, question: '此人主要代表哪个国家？', answer: '法国（但出生于科西嘉岛）', tier: 1 },
      { id: 4, question: '此人大约生活在什么年代？', answer: '18世纪末至19世纪初', tier: 1 },
      { id: 5, question: '此人最高达到什么地位？', answer: '称帝，建立了一个庞大帝国', tier: 1 },
      { id: 6, question: '此人在什么历史事件后崛起？', answer: '法国大革命后的动荡时期', tier: 2 },
      { id: 7, question: '此人制定了什么著名的法律？', answer: '一部影响深远的民法典', tier: 2 },
      { id: 8, question: '此人在哪场著名战役中最终失败？', answer: '滑铁卢战役', tier: 2 },
      { id: 9, question: '此人曾被流放到哪些岛屿？', answer: '先是厄尔巴岛，后流放到圣赫勒拿岛', tier: 2 },
      { id: 10, question: '此人在加冕仪式上做了什么惊人之举？', answer: '从教皇手中夺过皇冠亲自戴上', tier: 2 },
      { id: 11, question: '此人远征哪个国家时遭遇惨败？', answer: '俄国（严寒冬季导致大军覆没）', tier: 2 },
      { id: 12, question: '此人失败后引发了哪个著名外交会议？', answer: '维也纳会议（重建欧洲秩序）', tier: 2 },
    ],
  },
  {
    id: 'mozart',
    name: '莫扎特',
    questions: [
      { id: 1, question: '此人的性别是？', answer: '男性', tier: 1 },
      { id: 2, question: '此人主要活跃在什么领域？', answer: '古典音乐作曲', tier: 1 },
      { id: 3, question: '此人是哪个国家的？', answer: '奥地利（出生于萨尔茨堡）', tier: 1 },
      { id: 4, question: '此人大约生活在什么年代？', answer: '1756年至1791年', tier: 1 },
      { id: 5, question: '此人几岁开始展现惊人天赋？', answer: '3至4岁就能弹奏键盘乐器', tier: 1 },
      { id: 6, question: '此人的父亲是什么职业？', answer: '宫廷乐师和音乐教育家', tier: 2 },
      { id: 7, question: '此人童年时有什么特殊经历？', answer: '被父亲带着在欧洲各国宫廷巡回演出', tier: 2 },
      { id: 8, question: '此人去世时多大年纪？', answer: '仅35岁，英年早逝', tier: 2 },
      { id: 9, question: '此人创作了哪些类型的音乐？', answer: '交响曲、歌剧、协奏曲、室内乐等', tier: 2 },
      { id: 10, question: '此人最著名的歌剧之一讲的是什么？', answer: '一个关于魔法笛子的奇幻故事', tier: 2 },
      { id: 11, question: '此人一生创作了大约多少部作品？', answer: '超过600部', tier: 2 },
      { id: 12, question: '此人在音乐史上的地位是？', answer: '古典主义时期最伟大的作曲家之一', tier: 2 },
    ],
  },
];

/* ────── 本地缓存 ────── */

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    console.log('[cache] created %s', CACHE_DIR);
  }
}

/** 保存角色到本地缓存 */
function saveToCache(person: PersonCharacter): void {
  try {
    ensureCacheDir();
    const filename = `${person.id}.json`;
    const filepath = join(CACHE_DIR, filename);
    writeFileSync(filepath, JSON.stringify(person, null, 2), 'utf-8');
    console.log('[cache] saved %s → %s', person.name, filename);
  } catch (e) {
    console.log('[cache] save failed:', e instanceof Error ? e.message : e);
  }
}

/** 从缓存目录随机读一个角色（排除指定名字） */
function loadRandomFromCache(excludeNames?: Set<string>): PersonCharacter | null {
  try {
    ensureCacheDir();
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return null;

    // 加载所有，可选排除
    const candidates: { file: string; person: PersonCharacter }[] = [];
    for (const f of files) {
      try {
        const raw = readFileSync(join(CACHE_DIR, f), 'utf-8');
        const person = JSON.parse(raw) as PersonCharacter;
        if (person.name && person.questions?.length >= 8) {
          if (!excludeNames || !excludeNames.has(person.name)) {
            candidates.push({ file: f, person });
          }
        }
      } catch { /* skip bad files */ }
    }
    if (candidates.length === 0) return null;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    console.log('[cache] loaded %s from %s (pool=%d)', pick.person.name, pick.file, candidates.length);
    return pick.person;
  } catch {
    return null;
  }
}

/** 缓存文件数量 */
function cacheSize(): number {
  try {
    ensureCacheDir();
    return readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/** 从缓存中读取已生成过的人名列表（用于 LLM 提示词去重） */
export function getCachedPersonNames(): string[] {
  try {
    ensureCacheDir();
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    const names: string[] = [];
    for (const f of files) {
      try {
        const raw = readFileSync(join(CACHE_DIR, f), 'utf-8');
        const person = JSON.parse(raw) as PersonCharacter;
        if (person.name?.trim()) names.push(person.name.trim());
      } catch { /* skip */ }
    }
    return names;
  } catch {
    return [];
  }
}

/* ────── 获取角色（LLM → 缓存 → 静态 fallback） ────── */

/**
 * 获取一个角色：
 * 1. 若缓存 ≥5 个，80% 概率直接从缓存取（省时省钱）
 * 2. 否则调用 LLM 生成，成功后自动存缓存
 * 3. LLM 失败则从缓存取
 * 4. 缓存也没有则用内置静态角色
 */
export async function getRandomPerson(): Promise<PersonCharacter> {
  const cached = cacheSize();

  // 缓存充足时80%概率复用（只有20%概率调用LLM）
  if (cached >= 5 && Math.random() < 0.8) {
    const fromCache = loadRandomFromCache();
    if (fromCache) return fromCache;
  }

  // 尝试 LLM 生成（传入已有人名 + 静态角色名，避免重复）
  try {
    const cachedNames = getCachedPersonNames();
    const staticNames = FALLBACK_CHARACTERS.map((c) => c.name);
    const excludeNames = [...new Set([...cachedNames, ...staticNames])];
    const llmResult = await generatePersonByLLM(excludeNames);
    if (llmResult) {
      saveToCache(llmResult);
      return llmResult;
    }
  } catch (e) {
    console.log('[personData] LLM generation failed:', e instanceof Error ? e.message : e);
  }

  // LLM 失败 → 缓存
  const fromCache = loadRandomFromCache();
  if (fromCache) return fromCache;

  // 全部失败 → 静态 fallback
  const idx = Math.floor(Math.random() * FALLBACK_CHARACTERS.length);
  console.log('[personData] using static fallback: %s', FALLBACK_CHARACTERS[idx].name);
  return FALLBACK_CHARACTERS[idx];
}

/* ────── 带权重的候选题选取 ────── */

/**
 * 分层权重：早期偏模糊题(tier1)，后期逐渐出稍具体题(tier2/3)
 */
function tierWeights(askedRatio: number): Record<number, number> {
  if (askedRatio < 0.4) return { 1: 8, 2: 3, 3: 1 };
  if (askedRatio < 0.7) return { 1: 2, 2: 6, 3: 3 };
  return { 1: 1, 2: 3, 3: 6 };
}

/** 按权重随机选 count 个候选题 */
export function pickCandidateQuestions(
  person: PersonCharacter,
  askedIds: Set<number>,
  count = 3,
): PersonQuestion[] {
  const available = person.questions.filter((q) => !askedIds.has(q.id));
  if (available.length === 0) return [];

  const total = person.questions.length;
  const askedRatio = askedIds.size / total;
  const weights = tierWeights(askedRatio);

  // 为每个可用问题计算权重
  const weighted: { q: PersonQuestion; w: number }[] = available.map((q) => ({
    q,
    w: weights[q.tier] ?? 1,
  }));

  // 保证至少有可选项（如果所有权重为 0 则退化为均匀）
  const totalWeight = weighted.reduce((s, x) => s + x.w, 0);
  if (totalWeight === 0) {
    weighted.forEach((x) => (x.w = 1));
  }

  // 不放回加权随机抽样
  const picked: PersonQuestion[] = [];
  const pool = [...weighted];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const poolWeight = pool.reduce((s, x) => s + x.w, 0);
    let rand = Math.random() * poolWeight;
    let chosen = 0;
    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].w;
      if (rand <= 0) { chosen = j; break; }
    }
    picked.push(pool[chosen].q);
    pool.splice(chosen, 1);
  }

  return picked;
}
