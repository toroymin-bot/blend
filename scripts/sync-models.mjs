#!/usr/bin/env node
/**
 * Blend Model Sync Script
 * 매 3시간마다 Anthropic / OpenAI / Google API에서 최신 모델 목록을 가져와
 * model-registry.ts를 자동 업데이트하고 Vercel에 재배포합니다.
 *
 * Usage: node scripts/sync-models.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..');
const REGISTRY_PATH = resolve(PROJECT_DIR, 'src/modules/models/model-registry.ts');
const LOG_PATH = resolve(PROJECT_DIR, 'scripts/sync-models.log');
const DRY_RUN = process.argv.includes('--dry-run');

// ── 로그 ─────────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const existing = existsSync(LOG_PATH) ? readFileSync(LOG_PATH, 'utf-8') : '';
    const lines = existing.split('\n').filter(Boolean);
    // 최근 500줄만 유지
    const trimmed = lines.slice(-499).concat(line).join('\n') + '\n';
    writeFileSync(LOG_PATH, trimmed);
  } catch {}
}

// ── API 키 로드 (Vercel env pull) ─────────────────────────────────────────────
function loadKeys() {
  const ENV_TMP = resolve(PROJECT_DIR, '.env.sync-tmp');
  try {
    log('Pulling env vars from Vercel...');
    execSync(`cd "${PROJECT_DIR}" && vercel env pull "${ENV_TMP}" --yes 2>/dev/null`, { stdio: 'pipe' });
    const content = readFileSync(ENV_TMP, 'utf-8');
    const get = (name) => {
      const m = content.match(new RegExp(`NEXT_PUBLIC_${name}="([^"\\n]+)"`));
      return m ? m[1].trim() : null;
    };
    const keys = {
      anthropic: get('ANTHROPIC_API_KEY'),
      openai: get('OPENAI_API_KEY'),
      google: get('GOOGLE_API_KEY'),
    };
    try { execSync(`rm -f "${ENV_TMP}"`); } catch {}
    return keys;
  } catch (e) {
    try { execSync(`rm -f "${ENV_TMP}"`); } catch {}
    log(`Warning: Could not pull env vars: ${e.message}`);
    return { anthropic: null, openai: null, google: null };
  }
}

// ── OpenAI 모델 조회 ──────────────────────────────────────────────────────────
async function fetchOpenAIModels(apiKey) {
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    // 채팅 모델만 필터 (embedding, tts, dalle, whisper 제외)
    const EXCLUDE = /embed|tts|dall-e|whisper|transcri|realtime|audio|search|computer/i;
    const INCLUDE = /^(gpt-|o1|o3|o4)/;
    return data
      .filter(m => INCLUDE.test(m.id) && !EXCLUDE.test(m.id))
      .map(m => ({
        id: m.id,
        provider: 'openai',
        created: m.created,
      }));
  } catch (e) {
    log(`OpenAI fetch error: ${e.message}`);
    return [];
  }
}

// ── Anthropic 모델 조회 ───────────────────────────────────────────────────────
async function fetchAnthropicModels(apiKey) {
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    return data.map(m => ({ id: m.id, provider: 'anthropic', displayName: m.display_name }));
  } catch (e) {
    log(`Anthropic fetch error: ${e.message}`);
    return [];
  }
}

// ── Google Gemini 모델 조회 ───────────────────────────────────────────────────
async function fetchGoogleModels(apiKey) {
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { models } = await res.json();
    const EXCLUDE = /embed|aqa|retrieval|code-|vision\b/i;
    return (models || [])
      .filter(m => {
        const id = m.name.replace('models/', '');
        const methods = m.supportedGenerationMethods || [];
        return methods.includes('generateContent') && !EXCLUDE.test(id);
      })
      .map(m => ({
        id: m.name.replace('models/', ''),
        provider: 'google',
        displayName: m.displayName,
        inputPrice: m.inputTokenPricePerMillion,
        outputPrice: m.outputTokenPricePerMillion,
        contextLength: m.inputTokenLimit,
      }));
  } catch (e) {
    log(`Google fetch error: ${e.message}`);
    return [];
  }
}

// ── 모델 ID → 사람이 읽기 좋은 이름 변환 ─────────────────────────────────────
function humanizeName(id, provider, displayName) {
  if (displayName) return displayName;
  if (provider === 'openai') {
    return id
      .replace('gpt-', 'GPT-')
      .replace('-mini', ' Mini')
      .replace('-preview', ' Preview')
      .replace(/-(\d{4})$/, '')           // 날짜 suffix 제거
      .replace(/-/g, ' ')
      .replace(/\b(\w)/g, c => c.toUpperCase())
      .trim();
  }
  if (provider === 'anthropic') {
    return id
      .replace('claude-', 'Claude ')
      .replace(/-(\d{8})$/, '')           // 날짜 suffix 제거
      .replace(/-/g, ' ')
      .replace(/\b(\w)/g, c => c.toUpperCase())
      .trim();
  }
  if (provider === 'google') {
    return id
      .replace('gemini-', 'Gemini ')
      .replace('models/', '')
      .replace(/-/g, ' ')
      .replace(/\b(\w)/g, c => c.toUpperCase())
      .replace(/ Exp$/i, ' (Exp)')
      .replace(/ Preview.*/i, ' Preview')
      .trim();
  }
  return id;
}

// ── 모델 ID 기반 기본 가격 추정 ───────────────────────────────────────────────
function guessPrice(id, provider) {
  id = id.toLowerCase();
  if (provider === 'openai') {
    if (/o3/.test(id) && !/mini/.test(id)) return { in: 10, out: 40 };
    if (/o4-mini|o3-mini|o1-mini/.test(id)) return { in: 1.1, out: 4.4 };
    if (/o1/.test(id)) return { in: 15, out: 60 };
    if (/gpt-4\.1$|gpt-4o$/.test(id)) return { in: 2.5, out: 10 };
    if (/gpt-4\.1-mini|gpt-4o-mini/.test(id)) return { in: 0.15, out: 0.6 };
    if (/gpt-4/.test(id)) return { in: 2, out: 8 };
    return { in: 0.5, out: 1.5 };
  }
  if (provider === 'anthropic') {
    if (/opus/.test(id)) return { in: 15, out: 75 };
    if (/sonnet/.test(id)) return { in: 3, out: 15 };
    if (/haiku/.test(id)) return { in: 0.8, out: 4 };
    return { in: 3, out: 15 };
  }
  if (provider === 'google') {
    if (/2\.5-pro/.test(id)) return { in: 1.25, out: 10 };
    if (/2\.5-flash/.test(id)) return { in: 0.15, out: 0.6 };
    if (/2\.0-flash-lite/.test(id)) return { in: 0.075, out: 0.3 };
    if (/2\.0-flash/.test(id)) return { in: 0.1, out: 0.4 };
    if (/1\.5-pro/.test(id)) return { in: 1.25, out: 5 };
    if (/1\.5-flash/.test(id)) return { in: 0.075, out: 0.3 };
    return { in: 0.1, out: 0.4 };
  }
  return { in: 1, out: 3 };
}

// ── 모델 ID 기반 기능 추정 ─────────────────────────────────────────────────────
function guessFeatures(id, provider) {
  const features = ['streaming'];
  const lc = id.toLowerCase();
  // vision
  if (!/^(o3$|o1$)/.test(lc)) features.push('vision');
  // thinking (reasoning)
  if (/o1|o3|o4|thinking|exp/.test(lc)) features.push('thinking');
  if (provider === 'anthropic' && /opus|sonnet/.test(lc)) features.push('thinking');
  if (provider === 'google' && /2\.5/.test(lc)) features.push('thinking');
  // function_calling
  if (provider === 'openai' || (provider === 'anthropic')) features.push('function_calling');
  return [...new Set(features)];
}

// ── 날짜 suffix 여부 판별 ─────────────────────────────────────────────────────
function isDateSuffixed(id) {
  return /-\d{4}-\d{2}-\d{2}$/.test(id) || /-\d{8}$/.test(id);
}

// ── 신규 모델을 활성화할지 결정 ───────────────────────────────────────────────
function shouldEnable(id) {
  const lc = id.toLowerCase();
  // 날짜 고정 버전 / 실험적 / preview / legacy → 항상 disabled
  if (isDateSuffixed(lc)) return false;
  if (/exp$|preview|legacy|001$|002$/.test(lc)) return false;
  // 최신 주요 모델만 enabled
  if (/gpt-4\.1|gpt-4o|o3|o4-mini/.test(lc)) return true;
  if (/claude-(opus|sonnet|haiku)/.test(lc)) return true;
  if (/gemini-2\.(5|0)/.test(lc)) return true;
  return false;
}

// ── 설명 생성 (초등학생도 이해할 수 있는 한국어) ────────────────────────────────
function guessDescription(id, provider) {
  const lc = id.toLowerCase();

  if (provider === 'openai') {
    if (/o3$/.test(lc)) return '수학·논리 최고 수준 추론';
    if (/o4-mini/.test(lc)) return '추론 특화 — o3보다 빠르고 저렴';
    if (/o3-mini/.test(lc)) return '어려운 문제를 빠르게 푸는 추론 AI';
    if (/o1-pro/.test(lc)) return 'o1 최고급 — 가장 어려운 문제용';
    if (/o1-mini/.test(lc)) return '추론 경량판 — 빠르고 저렴';
    if (/o1$/.test(lc)) return '깊게 생각해서 정확하게 답하는 AI';
    // GPT-5 계열 — 모델명 세분화
    if (/gpt-5/.test(lc) && /chat-latest/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `항상 최신 GPT-${ver}로 자동 연결`;
    }
    if (/gpt-5/.test(lc) && /codex-max/.test(lc)) return '어려운 코딩도 거뜬한 GPT-5 최강판';
    if (/gpt-5/.test(lc) && /codex-mini/.test(lc)) return 'GPT-5 코딩 경량판 — 빠르고 저렴';
    if (/gpt-5/.test(lc) && /codex/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `GPT-${ver} 코딩 전문 버전`;
    }
    if (/gpt-5/.test(lc) && /pro/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `GPT-${ver} 최고급 — 가장 강력`;
    }
    if (/gpt-5/.test(lc) && /nano/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `GPT-${ver} 초소형 — 번개처럼 빠름`;
    }
    if (/gpt-5/.test(lc) && /mini/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `GPT-${ver} 경량판 — 빠르고 저렴`;
    }
    if (/gpt-5/.test(lc)) {
      const ver = lc.match(/gpt-(5[\d.]*)/)?.[1] || '5';
      return `GPT-${ver} 기본형 — 글·코딩 모두 능숙`;
    }
    if (/gpt-4\.1-nano/.test(lc)) return 'GPT-4.1 초소형 — 가장 작고 빠름';
    if (/gpt-4\.1-mini/.test(lc)) return 'GPT-4.1 경량 — 빠르고 저렴';
    if (/gpt-4\.1$/.test(lc)) return '코딩·분석 최강 — 가장 최신 GPT-4';
    if (/gpt-4o-mini/.test(lc)) return '가볍고 빠른 일상 대화용';
    if (/gpt-4o$/.test(lc)) return '글·이미지 모두 잘 이해하는 AI';
    if (/gpt-4-turbo/.test(lc)) return '빠른 GPT-4 터보 기본형';
    if (/gpt-4/.test(lc)) return '강력한 GPT-4 기본형';
    if (/gpt-3\.5.*instruct/.test(lc)) return '명령을 잘 따르는 구형 GPT-3.5';
    if (/gpt-3\.5.*16k/.test(lc)) return '긴 문서도 처리하는 구형 GPT-3.5';
    if (/gpt-3\.5/.test(lc)) return '초저가 — 단순 질문·번역용';
    if (/image/.test(lc)) return '텍스트로 그림을 그려주는 AI';
  }

  if (provider === 'anthropic') {
    if (/opus/.test(lc)) return '긴 글 읽고 깊이 분석하는 최고급 AI';
    if (/sonnet/.test(lc)) return '코딩·글쓰기 모두 잘하는 AI';
    if (/haiku/.test(lc)) return '빠르고 가벼운 클로드 축소판';
  }

  if (provider === 'google') {
    if (/2\.5-pro/.test(lc)) return '책 한 권도 한 번에 읽는 구글 최강 AI';
    if (/2\.5-flash/.test(lc) && /image/.test(lc)) return '그림을 직접 그려주는 AI';
    if (/2\.5-flash/.test(lc)) return '빠르고 저렴한 구글 최신 AI';
    if (/2\.0-flash-lite/.test(lc)) return '구글에서 가장 저렴한 AI';
    if (/2\.0-flash/.test(lc) && /image/.test(lc)) return '그림 그리는 빠른 AI';
    if (/2\.0-flash/.test(lc)) return '빠른 구글 AI — 일상 작업용';
    if (/1\.5-pro/.test(lc)) return '200만 글자도 한 번에 읽는 AI';
    if (/1\.5-flash/.test(lc)) return '빠른 구글 1.5 AI';
    if (/3-pro/.test(lc)) return '구글 최신 프로급 AI';
    if (/3-flash/.test(lc) || /3\.1-flash/.test(lc)) return '구글 3세대 빠른 AI';
    if (/image/.test(lc)) return '그림을 직접 그려주는 AI';
    if (/flash/.test(lc)) return '번개처럼 빠른 구글 AI';
    if (/pro/.test(lc)) return '전문가 수준의 구글 AI';
  }

  if (provider === 'deepseek') {
    if (/reasoner|r1/.test(lc)) return '수학·코딩 문제를 깊이 생각하는 AI';
    if (/v3|chat/.test(lc)) return 'GPT급 성능을 10분의 1 가격에';
    return '중국발 저렴한 고성능 AI';
  }

  if (provider === 'groq') {
    if (/70b|large/.test(lc)) return '빠르고 똑똑한 Llama 대형 AI';
    if (/8b|instant/.test(lc)) return '초고속 초저가 소형 AI';
    if (/mixtral/.test(lc)) return '여러 전문가가 협력하는 AI';
    if (/gemma/.test(lc)) return '구글이 만든 가벼운 오픈 AI';
    return '초고속 무료 AI';
  }

  // 마지막 fallback — 모델 이름에서 특징 유추
  if (/nano|tiny|small|mini|lite/.test(lc)) return '작고 빠른 경량 AI';
  if (/large|pro|plus|max|ultra/.test(lc)) return '크고 강력한 고성능 AI';
  if (/image|vision|visual/.test(lc)) return '그림을 이해하고 그리는 AI';
  if (/code|coder/.test(lc)) return '코딩을 잘하는 AI';
  if (/instruct/.test(lc)) return '명령을 잘 따르는 AI';
  if (/flash|turbo|fast/.test(lc)) return '빠르게 답하는 AI';
  return `새로 나온 ${provider.toUpperCase()} AI`;
}

// ── 현재 레지스트리에서 모델 ID 목록 추출 ────────────────────────────────────
function parseRegistryIds(content) {
  const ids = [];
  const re = /id:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}

// ── 레지스트리에서 특정 모델 enabled 상태 변경 ────────────────────────────────
function setModelEnabled(content, id, enabled) {
  // id 다음 줄들에서 enabled: true/false 를 찾아 변경
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(id:\\s*'${escapedId}'[\\s\\S]*?enabled:\\s*)(true|false)`,
    'g'
  );
  return content.replace(re, `$1${enabled}`);
}

// ── 레지스트리에 새 모델 항목 추가 ───────────────────────────────────────────
function addModelEntry(content, model) {
  const { id, provider, name, inputPrice, outputPrice, contextLength, features, description, enabled } = model;
  const featStr = features.map(f => `'${f}'`).join(', ');
  const entry = `  {\n    id: '${id}',\n    name: '${name}',\n    provider: '${provider}',\n    contextLength: ${contextLength || 128000},\n    inputPrice: ${inputPrice},\n    outputPrice: ${outputPrice},\n    features: [${featStr}],\n    description: '${description}',\n    enabled: ${enabled},\n  },`;

  // 해당 provider 섹션 마지막 항목 뒤에 삽입
  const providerComment = {
    openai: '// ── OpenAI',
    anthropic: '// ── Anthropic',
    google: '// ── Google',
  }[provider];
  const nextProviderComment = {
    openai: '// ── Anthropic',
    anthropic: '// ── Google',
    google: '];',
  }[provider];

  const sectionEnd = content.indexOf(nextProviderComment);
  if (sectionEnd === -1) return content;

  // section 끝 바로 전 },  다음에 삽입
  const insertAt = content.lastIndexOf('},', sectionEnd) + 2;
  return content.slice(0, insertAt) + '\n' + entry + content.slice(insertAt);
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  log('=== Blend Model Sync 시작 ===');
  if (DRY_RUN) log('[DRY RUN 모드 — 실제 변경 없음]');

  const keys = loadKeys();
  log(`Keys loaded: anthropic=${!!keys.anthropic}, openai=${!!keys.openai}, google=${!!keys.google}`);

  // 모든 provider에서 병렬 조회
  const [openaiModels, anthropicModels, googleModels] = await Promise.all([
    fetchOpenAIModels(keys.openai),
    fetchAnthropicModels(keys.anthropic),
    fetchGoogleModels(keys.google),
  ]);

  log(`API 조회 완료: OpenAI=${openaiModels.length}, Anthropic=${anthropicModels.length}, Google=${googleModels.length}`);

  const allApiModels = [...openaiModels, ...anthropicModels, ...googleModels];
  const apiIds = new Set(allApiModels.map(m => m.id));

  // 현재 레지스트리 읽기
  let content = readFileSync(REGISTRY_PATH, 'utf-8');
  const registryIds = new Set(parseRegistryIds(content));

  let changed = false;
  const addedModels = [];
  const disabledModels = [];
  const reenabledModels = [];

  // 1. 레지스트리에 있지만 API에 없는 모델 → disabled
  for (const id of registryIds) {
    if (!apiIds.has(id)) {
      const wasEnabled = new RegExp(`id:\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?enabled:\\s*true`).test(content);
      if (wasEnabled) {
        log(`  ⛔ 비활성화: ${id} (API에서 사라짐)`);
        content = setModelEnabled(content, id, false);
        disabledModels.push(id);
        changed = true;
      }
    }
  }

  // 2a. 날짜 suffix 모델이 enabled 상태면 → 비활성화
  for (const id of registryIds) {
    if (isDateSuffixed(id)) {
      const wasEnabled = new RegExp(`id:\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?enabled:\\s*true`).test(content);
      if (wasEnabled) {
        log(`  🔕 날짜 버전 비활성화: ${id}`);
        content = setModelEnabled(content, id, false);
        changed = true;
      }
    }
  }

  // 2b. 기존 모델 중 제네릭/중복 설명 → 개선된 설명으로 교체
  const STALE_DESC = /신규 모델|새로 나온|뭐든 잘하는 AI/;
  for (const apiModel of allApiModels) {
    if (!registryIds.has(apiModel.id)) continue;
    const placeholderRe = new RegExp(
      `(id:\\s*'${apiModel.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?description:\\s*')(.*?)(')`,
      'g'
    );
    content = content.replace(placeholderRe, (match, pre, desc, post) => {
      if (STALE_DESC.test(desc)) {
        const newDesc = guessDescription(apiModel.id, apiModel.provider);
        if (newDesc !== desc) {
          log(`  📝 설명 업데이트: ${apiModel.id} → "${newDesc}"`);
          changed = true;
          return `${pre}${newDesc}${post}`;
        }
      }
      return match;
    });
  }

  // 2. API에 있지만 레지스트리에 없는 모델 → 추가
  for (const apiModel of allApiModels) {
    if (registryIds.has(apiModel.id)) {
      // 이미 있는 모델이 API에 돌아왔는데 disabled 상태라면 → 그대로 둠 (사용자가 의도적으로 끈 것일 수 있음)
      continue;
    }
    const price = guessPrice(apiModel.id, apiModel.provider);
    const newModel = {
      id: apiModel.id,
      provider: apiModel.provider,
      name: humanizeName(apiModel.id, apiModel.provider, apiModel.displayName),
      inputPrice: apiModel.inputPrice ?? price.in,
      outputPrice: apiModel.outputPrice ?? price.out,
      contextLength: apiModel.contextLength ?? 128000,
      features: guessFeatures(apiModel.id, apiModel.provider),
      description: guessDescription(apiModel.id, apiModel.provider),
      enabled: shouldEnable(apiModel.id),
    };
    log(`  ✅ 신규 추가: ${newModel.id} (enabled=${newModel.enabled})`);
    content = addModelEntry(content, newModel);
    addedModels.push(newModel.id);
    changed = true;
  }

  if (!changed) {
    log('변경사항 없음. 배포 스킵.');
    log('=== 완료 ===\n');
    return;
  }

  // 변경 요약
  log(`\n변경 요약:`);
  if (addedModels.length) log(`  추가: ${addedModels.join(', ')}`);
  if (disabledModels.length) log(`  비활성화: ${disabledModels.join(', ')}`);
  if (reenabledModels.length) log(`  재활성화: ${reenabledModels.join(', ')}`);

  if (DRY_RUN) {
    log('[DRY RUN] 변경 내용 미적용.');
    log('=== 완료 ===\n');
    return;
  }

  // 레지스트리 저장
  writeFileSync(REGISTRY_PATH, content);
  log('model-registry.ts 저장 완료.');

  // Git commit
  try {
    execSync(`cd "${PROJECT_DIR}" && git add src/modules/models/model-registry.ts`, { stdio: 'pipe' });
    const summary = [
      addedModels.length ? `add ${addedModels.length} model(s)` : '',
      disabledModels.length ? `disable ${disabledModels.length} deprecated` : '',
    ].filter(Boolean).join(', ');
    execSync(`cd "${PROJECT_DIR}" && git commit -m "chore: sync models — ${summary}"`, { stdio: 'pipe' });
    log('Git commit 완료.');
  } catch (e) {
    log(`Git commit 경고 (무시 가능): ${e.message}`);
  }

  // Vercel 배포
  log('Vercel 배포 시작...');
  try {
    const result = execSync(`cd "${PROJECT_DIR}" && vercel deploy --prod 2>&1`, {
      encoding: 'utf-8',
      timeout: 180000,
    });
    const urlMatch = result.match(/Aliased:\s*(https:\/\/\S+)/);
    log(`배포 완료${urlMatch ? ': ' + urlMatch[1] : ''}`);
  } catch (e) {
    log(`배포 실패: ${e.message}`);
    process.exit(1);
  }

  log('=== 완료 ===\n');
}

main().catch(e => {
  log(`치명적 오류: ${e.message}`);
  process.exit(1);
});
