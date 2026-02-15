/**
 * 测试 LLM 出题服务
 * 用法: pnpm test:llm
 */
import 'dotenv/config';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePersonByLLM } from '../room/llmService.js';
import { pickCandidateQuestions, getCachedPersonNames, type PersonCharacter } from '../room/personData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'data', 'gp_cache');

const TIER_LABELS: Record<number, string> = {
  1: '模糊',
  2: '稍具体',
  3: '较具体',
  4: '其他', // 兼容旧缓存
};

function printPerson(person: PersonCharacter) {
  console.log('');
  console.log('═'.repeat(50));
  console.log(`  答案人名: ${person.name}`);
  console.log(`  题目数量: ${person.questions.length}`);
  console.log('═'.repeat(50));

  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  for (const q of person.questions) {
    tierCounts[q.tier as 1 | 2 | 3] = (tierCounts[q.tier as 1 | 2 | 3] || 0) + 1;
  }
  console.log(`  层级分布: T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]}`);
  console.log('─'.repeat(50));

  for (const q of person.questions) {
    const tag = `[T${q.tier} ${TIER_LABELS[q.tier]}]`;
    console.log(`  #${String(q.id).padStart(2, '0')} ${tag}`);
    console.log(`       Q: ${q.question}`);
    console.log(`       A: ${q.answer}`);
  }

  // 模拟选题权重
  console.log('');
  console.log('─'.repeat(50));
  console.log('  模拟选题（展示不同进度下的权重偏好）：');
  const askedIds = new Set<number>();
  const stages = [0, 4, 8, 12];
  for (const n of stages) {
    // 临时设置 askedIds 大小来模拟进度
    askedIds.clear();
    for (let i = 1; i <= n; i++) askedIds.add(i);
    const picks = pickCandidateQuestions(person, askedIds, 3);
    const pickInfo = picks.map(p => `#${p.id}(T${p.tier})`).join(', ');
    console.log(`  已问${String(n).padStart(2)}题 → 候选: ${pickInfo}`);
  }
  console.log('═'.repeat(50));
}

async function main() {
  console.log('');
  console.log('[test] LLM 出题测试');
  console.log('[test] LLM_BASE_URL =', process.env.LLM_BASE_URL || '(未配置)');
  console.log('[test] LLM_MODEL    =', process.env.LLM_MODEL || '(未配置)');
  console.log('[test] LLM_API_KEY  =', process.env.LLM_API_KEY ? `${process.env.LLM_API_KEY.slice(0, 8)}...` : '(未配置)');
  console.log('');

  // 显示缓存状态
  const cachedFiles = existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))
    : [];
  console.log('[test] 本地缓存   =', cachedFiles.length, '个角色',
    cachedFiles.length > 0 ? `(${cachedFiles.map(f => f.replace('.json', '')).join(', ')})` : '');
  console.log('');

  if (!process.env.LLM_API_KEY) {
    console.log('[test] ⚠ 未配置 LLM_API_KEY，请在 server/.env 中设置');
    process.exit(1);
  }

  const excludeNames = getCachedPersonNames();
  if (excludeNames.length > 0) {
    console.log('[test] 已排除人名 =', excludeNames.join('、'));
  }
  console.log('[test] 正在调用 LLM 生成题目...');
  const start = Date.now();
  const person = await generatePersonByLLM(excludeNames);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!person) {
    console.log(`[test] ✗ 生成失败 (${elapsed}s)`);
    process.exit(1);
  }

  console.log(`[test] ✓ 生成成功 (${elapsed}s)`);

  // 自动存缓存
  try {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const cachePath = join(CACHE_DIR, `${person.id}.json`);
    writeFileSync(cachePath, JSON.stringify(person, null, 2), 'utf-8');
    console.log(`[test] 已缓存 → ${cachePath}`);
  } catch (e) {
    console.log('[test] 缓存写入失败:', e instanceof Error ? e.message : e);
  }

  printPerson(person);

  // 校验：检查问题/答案中是否泄露人名
  const nameLeaks = person.questions.filter(
    q => q.question.includes(person.name) || q.answer.includes(person.name)
  );
  if (nameLeaks.length > 0) {
    console.log('');
    console.log(`[test] ⚠ 发现 ${nameLeaks.length} 题泄露了人名「${person.name}」:`);
    for (const q of nameLeaks) {
      console.log(`  #${q.id}: Q=${q.question} / A=${q.answer}`);
    }
  } else {
    console.log(`\n[test] ✓ 无人名泄露`);
  }
}

main().catch((e) => {
  console.error('[test] fatal:', e);
  process.exit(1);
});
