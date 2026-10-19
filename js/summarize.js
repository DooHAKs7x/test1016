// 요약 엔진 호출, 응답 검증, 1회 재시도, 긴 문서의 2단계 요약. (PRD 3-1절 4단계, 8절)
import { parseModelJson, validateSummary, normalizeSummary } from "./validate.js";
import { demoComplete } from "./demo-engine.js";

// PRD 부록의 요약 프롬프트 초안.
export const SUMMARY_PROMPT = `당신은 교육자료를 내부 공유용 슬라이드로 간결하게 정리하는 전문가입니다.
아래 교육자료 텍스트를 읽고, 정확히 4장의 슬라이드 내용으로 요약하세요.

## 입력
{{document_text}}

## 작성 원칙
1. 문서에 있는 내용만 사용합니다. 추측하거나 없는 내용을 추가하지 않습니다.
2. 핵심만 간소화합니다. 세부 설명, 사례, 반복 내용은 생략합니다.
3. 불릿은 짧은 개조식(명사형 종결)으로 쓰고, 한 줄(40자 이내)로 끝냅니다.
4. 수치, 날짜, 고유명사, 용어는 원문 그대로 유지합니다.
5. 문서에 없는 정보(강사, 일시 등)는 빈 문자열("")로 둡니다.
6. 불명확하거나 해석이 필요한 내용은 4장의 "needs_check"에 적습니다.
7. 슬라이드 제목과 소제목은 원문의 목차와 용어를 따르고, 원문의 구성 순서를 흐름에 반영합니다.
8. 한국어로 작성합니다.

## 슬라이드 구성 (정확히 4장)
1장. 교육 개요: 교육명, 한 줄 요약, 교육 목적, 일시/대상(있을 때만)
2장. 핵심 내용 ①: 가장 중요한 주제 (불릿 3개 이내)
3장. 핵심 내용 ②: 나머지 핵심 주제 (불릿 3개 이내)
4장. 시사점 및 후속 조치: 업무 적용 포인트(최대 3개), 후속 조치, 확인 필요 사항

## 출력 형식
설명이나 마크다운 코드블록 없이 아래 JSON만 출력하세요.

{
  "title": "교육명",
  "slides": [
    {"no": 1, "heading": "교육 개요", "summary": "한 줄 요약", "bullets": ["..."]},
    {"no": 2, "heading": "핵심 내용 ①", "bullets": ["...", "...", "..."]},
    {"no": 3, "heading": "핵심 내용 ②", "bullets": ["...", "...", "..."]},
    {"no": 4, "heading": "시사점 및 후속 조치", "bullets": ["..."], "needs_check": []}
  ]
}`;

// 2단계 방식의 1단계: 구간별 핵심 메모. 원문 표현과 페이지 번호를 유지시켜 통합 단계의 근거로 쓴다.
export const CHUNK_PROMPT = `아래는 교육자료의 일부 구간입니다. 이 구간의 핵심 내용만 개조식으로 뽑으세요.

## 규칙
1. 문서에 있는 내용만 쓰고, 추측하거나 덧붙이지 않습니다.
2. 수치, 날짜, 고유명사, 용어는 원문 그대로 씁니다.
3. 각 줄 앞에 근거 페이지를 [p.N] 형식으로 붙입니다.
4. 목차나 장 제목이 보이면 "목차:"로 시작하는 줄에 그대로 적습니다.
5. 교육명, 일시, 대상, 목적이 보이면 그대로 적습니다.
6. 15줄 이내, 설명 없이 목록만 출력합니다.

## 구간
{{chunk_text}}`;

export function buildPrompt(documentText) {
  return SUMMARY_PROMPT.replace("{{document_text}}", documentText);
}

export function splitIntoChunks(pages, chunkChars) {
  const chunks = [];
  let cur = "";
  for (const p of pages) {
    if (!p.text) continue;
    const block = `[p.${p.no}]\n${p.text}\n\n`;
    if (cur && cur.length + block.length > chunkChars) { chunks.push(cur); cur = ""; }
    // 한 페이지가 구간 크기보다 길면 그대로 잘라 넣는다.
    for (let i = 0; i < block.length; i += chunkChars) {
      const piece = block.slice(i, i + chunkChars);
      if (cur.length + piece.length > chunkChars && cur) { chunks.push(cur); cur = ""; }
      cur += piece;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

// 엔진 호출 지점은 이 함수 하나로 모은다.
async function complete(config, messages, { json = false, signal } = {}) {
  if (config.engine === "demo") return demoComplete(messages);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    let body;
    if (config.engine === "ollama") {
      body = { model: config.model, messages, stream: false, options: { temperature: config.temperature } };
      if (json) body.format = "json";
    } else {
      body = { model: config.model, messages, temperature: config.temperature, stream: false };
      if (json) body.response_format = { type: "json_object" };
    }
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "same-origin",
    });
    if (!res.ok) {
      // 일부 OpenAI 호환 서버는 response_format을 지원하지 않는다. 그 경우 한 번만 빼고 다시 보낸다.
      if (json && config.engine !== "ollama" && res.status === 400) {
        return complete(config, messages, { json: false, signal });
      }
      throw new Error(`요약 엔진 응답 오류 (HTTP ${res.status})`);
    }
    const data = await res.json();
    const text = config.engine === "ollama" ? data?.message?.content : data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("요약 엔진 응답에 본문이 없습니다.");
    return text;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("요약 엔진 응답 시간이 초과되었습니다.");
    if (e instanceof TypeError) throw new Error("요약 엔진에 연결할 수 없습니다. 엔드포인트 설정을 확인해 주세요.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function summarize(pages, config, { onStage, signal } = {}) {
  const fullText = pages.filter((p) => p.text).map((p) => `[p.${p.no}]\n${p.text}`).join("\n\n");
  let documentText = fullText;

  if (config.engine !== "demo" && fullText.length > config.singlePassMaxChars) {
    const chunks = splitIntoChunks(pages, config.chunkChars);
    const notes = [];
    for (let i = 0; i < chunks.length; i++) {
      onStage?.(`구간별 요약 중 (${i + 1}/${chunks.length})`);
      const prompt = CHUNK_PROMPT.replace("{{chunk_text}}", chunks[i]);
      notes.push(`## 구간 ${i + 1}\n` + (await complete(config, [{ role: "user", content: prompt }], { signal })).trim());
    }
    documentText = notes.join("\n\n");
  }

  onStage?.("요약 중");
  const messages = [{ role: "user", content: buildPrompt(documentText) }];
  const opts = { bulletMaxChars: config.bulletMaxChars };
  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) onStage?.("요약 결과 형식 오류, 다시 요청 중");
    const raw = await complete(config, messages, { json: true, signal });
    let data;
    try {
      data = parseModelJson(raw);
    } catch (e) {
      lastProblem = e.message;
      messages.push({ role: "assistant", content: raw }, { role: "user", content: retryMessage([e.message]) });
      continue;
    }
    const { errors, lengthErrors } = validateSummary(data, opts);
    if (!errors.length && !lengthErrors.length) {
      return { summary: normalizeSummary(data, opts), warnings: [], documentText };
    }
    if (attempt === 2 && !errors.length) {
      // 재시도 후 글자 수만 넘는 경우는 실패로 돌리지 않고 잘라서 쓴다.
      return {
        summary: normalizeSummary(data, { ...opts, clip: true }),
        warnings: [`${config.bulletMaxChars}자를 넘는 불릿 ${lengthErrors.length}개를 잘라서 표시했습니다.`],
        documentText,
      };
    }
    lastProblem = [...errors, ...lengthErrors].join(" / ");
    messages.push({ role: "assistant", content: raw }, { role: "user", content: retryMessage([...errors, ...lengthErrors]) });
  }
  throw new Error(`요약 결과가 형식에 맞지 않습니다. 다시 시도해 주세요. (${lastProblem})`);
}

function retryMessage(problems) {
  return `방금 출력에 다음 문제가 있습니다.\n- ${problems.join("\n- ")}\n\n` +
    "같은 작성 원칙을 지켜서 고친 JSON만 다시 출력하세요. 설명이나 코드블록은 넣지 마세요.";
}
