/**
 * LLM 出题服务 —— 调用 OpenAI 兼容接口自动生成猜人名题目
 */

import type { PersonCharacter, PersonQuestion } from './personData.js';

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `按用户要求输出JSON格式结果`;

function buildUserPrompt(excludeNames: string[]): string {
  const excludeLine =
    excludeNames.length > 0
      ? `\n5. **以下人名已经出过题，请勿重复**：${excludeNames.join('、')}\n`
      : '';
  return `请为一个名人生成猜谜题目。
${excludeLine}
规则：
1. 选择一个名人或虚拟角色，中外皆可
2. 生成恰好12个关于此人的问答对
3. 问题和答案中**绝对不能**出现该人的名字、字号、笔名等任何能直接识别身份的称呼
4. 题目整体偏模糊，不要送分题。只分两类：tier=1 表示更模糊（如性别、大领域、年代、地域），tier=2 表示稍具体但仍需推理（如经历、成就、特征，但不要一眼能猜出人的那种）

请严格按以下JSON格式输出，只输出JSON：
{
  "name": "人名（简体中文常用译名或原名）",
  "questions": [
    { "id": 1, "question": "问题文本", "answer": "答案文本", "tier": 1 },
    { "id": 2, "question": "问题文本", "answer": "答案文本", "tier": 1 },
    ...共12题
  ]
}`;
}

interface LLMResponse {
  name: string;
  questions: { id: number; question: string; answer: string; tier: number }[];
}

/**
 * 调用 LLM 生成一套猜人名题目
 * @param excludeNames 已出过的人名列表，会写入 prompt 避免重复
 * @returns PersonCharacter | null (null 表示生成失败)
 */
export async function generatePersonByLLM(excludeNames: string[] = []): Promise<PersonCharacter | null> {
  if (!LLM_API_KEY) {
    console.log('[LLM] no API key configured, skip');
    return null;
  }

  const url = `${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  console.log('[LLM] requesting %s model=%s exclude=%d', url, LLM_MODEL, excludeNames.length);

  const LLM_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS) || 60_000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(excludeNames) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log('[LLM] request failed status=%d body=%s', res.status, body.slice(0, 200));
      return null;
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string; reasoning_content?: string; reasoning?: string } }[];
    };
    const msg = data.choices?.[0]?.message;
    // 兼容多种返回格式：content / reasoning_content / reasoning
    const raw = msg?.content || msg?.reasoning_content || msg?.reasoning || '';
    console.log('[LLM] raw response length=%d %s', raw.length, raw);
    if (!raw) {
      console.log('[LLM] empty response, raw message keys:', msg ? Object.keys(msg) : 'null');
    }

    // 提取 JSON（兼容 markdown 代码块、<think> 推理块等）
    const jsonStr = extractJson(raw);
    if (!jsonStr) {
      console.log('[LLM] failed to extract json, first 300 chars: %s', raw.slice(0, 300));
      return null;
    }

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(jsonStr) as LLMResponse;
    } catch (parseErr) {
      console.log('[LLM] JSON.parse failed: %s, json first 200 chars: %s', (parseErr as Error).message, jsonStr.slice(0, 200));
      return null;
    }
    return validateAndNormalize(parsed);
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.log('[LLM] request timed out (%dms)', LLM_TIMEOUT);
    } else {
      console.log('[LLM] error:', e instanceof Error ? e.message : e);
    }
    return null;
  }
}

/**
 * 从 LLM 原始响应中提取 JSON
 * 兼容：<think>推理块、markdown 代码块、裸 JSON、混合文本
 */
function extractJson(raw: string): string | null {
  // 1) 去除 <think>...</think> 推理块（R1 系列模型）
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // 也处理未闭合的 <think>（模型有时截断）
  const openThink = cleaned.indexOf('<think>');
  if (openThink >= 0) cleaned = cleaned.slice(0, openThink).trim();

  // 2) 尝试提取 ```json ... ``` 或 ``` ... ``` 代码块
  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith('{')) return candidate;
  }

  // 3) 找最外层匹配的 { ... }（含 "name" 和 "questions" 字样的）
  //    通过括号计数找到完整的 JSON 对象
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace >= 0) {
    let depth = 0;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(firstBrace, i + 1);
        // 简单检查是否包含关键字段
        if (candidate.includes('"name"') && candidate.includes('"questions"')) {
          return candidate;
        }
        // 否则继续找下一个 {
        const nextBrace = cleaned.indexOf('{', i + 1);
        if (nextBrace >= 0) {
          // 从新位置重试
          depth = 0;
          for (let j = nextBrace; j < cleaned.length; j++) {
            if (cleaned[j] === '{') depth++;
            else if (cleaned[j] === '}') depth--;
            if (depth === 0) {
              return cleaned.slice(nextBrace, j + 1);
            }
          }
        }
        // 还是返回第一个匹配
        return candidate;
      }
    }
    // 括号没闭合，取到末尾试试
    return cleaned.slice(firstBrace);
  }

  return null;
}

/** 校验并标准化 LLM 输出 */
function validateAndNormalize(data: LLMResponse): PersonCharacter | null {
  if (!data.name || typeof data.name !== 'string') return null;
  if (!Array.isArray(data.questions) || data.questions.length < 8) return null;

  const questions: PersonQuestion[] = [];
  for (let i = 0; i < Math.min(data.questions.length, 12); i++) {
    const q = data.questions[i];
    if (!q.question || !q.answer) continue;
    let tier = Number(q.tier);
    if (![1, 2, 3].includes(tier)) {
      tier = i < 6 ? 1 : 2;
    }
    questions.push({
      id: i + 1,
      question: q.question,
      answer: q.answer,
      tier: tier as 1 | 2 | 3,
    });
  }

  if (questions.length < 8) return null;

  console.log('[LLM] generated person=%s questions=%d', data.name, questions.length);
  return {
    id: `llm_${Date.now()}`,
    name: data.name.trim(),
    questions,
  };
}
