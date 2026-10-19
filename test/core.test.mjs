// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, validateSummary, normalizeSummary } from "../js/validate.js";
import { extractTheme, contrastWithWhite } from "../js/color.js";
import { splitIntoChunks, buildPrompt } from "../js/summarize.js";
import { demoComplete } from "../js/demo-engine.js";

const good = () => ({
  title: "정보보안 기본 교육",
  slides: [
    { no: 1, heading: "교육 개요", summary: "보안 수칙 요약", bullets: ["목적: 사고 예방"] },
    { no: 2, heading: "핵심 내용 ①", bullets: ["비밀번호 90일 주기 변경", "MFA 필수"] },
    { no: 3, heading: "핵심 내용 ②", bullets: ["피싱 메일 신고 절차"] },
    { no: 4, heading: "시사점 및 후속 조치", bullets: ["팀 점검표 배포"], needs_check: [] },
  ],
});

test("코드블록과 앞뒤 설명이 붙은 JSON도 읽는다", () => {
  const raw = "다음과 같습니다.\n```json\n" + JSON.stringify(good()) + "\n```";
  assert.equal(parseModelJson(raw).title, "정보보안 기본 교육");
  assert.throws(() => parseModelJson("JSON 없음"));
});

test("정상 응답은 오류가 없다", () => {
  const r = validateSummary(good());
  assert.deepEqual(r, { errors: [], lengthErrors: [] });
});

test("장수, no, 불릿 개수, needs_check 누락을 잡는다", () => {
  const d = good();
  d.slides.pop();
  assert.ok(validateSummary(d).errors.some((e) => e.includes("4장")));

  const d2 = good();
  d2.slides[1].bullets = ["a", "b", "c", "d"];
  d2.slides[2].no = 9;
  delete d2.slides[3].needs_check;
  const errs = validateSummary(d2).errors.join("|");
  assert.match(errs, /2장의 bullets가 3개 이하/);
  assert.match(errs, /3장의 no/);
  assert.match(errs, /needs_check/);
});

test("40자 초과는 lengthErrors로 분리하고 clip 시 잘린다", () => {
  const d = good();
  d.slides[1].bullets[0] = "가".repeat(45);
  const r = validateSummary(d);
  assert.equal(r.errors.length, 0);
  assert.equal(r.lengthErrors.length, 1);
  const n = normalizeSummary(d, { clip: true });
  assert.equal([...n.slides[1].bullets[0]].length, 40);
});

test("색상: 남색 머리띠가 있는 페이지에서 남색 계열을 고른다", () => {
  const w = 100, h = 100, px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < 15; y++) for (let x = 0; x < w; x++) px.set([20, 60, 140, 255], (y * w + x) * 4);
  const t = extractTheme(px, w, h);
  assert.equal(t.isDefault, false);
  const [r, g, b] = t.accent.match(/\w\w/g).map((v) => parseInt(v, 16));
  assert.ok(b > r && b > g);
  assert.ok(contrastWithWhite([r, g, b]) >= 3);
});

test("색상: 흑백 문서는 기본 색상", () => {
  const px = new Uint8ClampedArray(50 * 50 * 4).fill(255);
  for (let i = 0; i < 500; i++) px.set([0, 0, 0, 255], i * 4);
  assert.equal(extractTheme(px, 50, 50).isDefault, true);
});

test("구간 분할은 페이지 표시를 유지하고 크기를 지킨다", () => {
  const pages = Array.from({ length: 10 }, (_, i) => ({ no: i + 1, text: "내용 ".repeat(300) }));
  const chunks = splitIntoChunks(pages, 2000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 2000));
  assert.ok(chunks[0].startsWith("[p.1]"));
});

test("시연용 엔진 출력이 검증을 통과한다", async () => {
  const text = "[p.1]\n2026 정보보안 교육\n교육 목적: 보안 사고 예방\n대상: 전 직원\n\n" +
    "[p.2]\n비밀번호는 90일마다 변경합니다.\n다중 인증(MFA)을 반드시 사용합니다.\n\n" +
    "[p.3]\n피싱 메일은 보안팀에 즉시 신고합니다.\n업무 PC에 보안 패치를 적용합니다.";
  const raw = await demoComplete([{ role: "user", content: buildPrompt(text) }]);
  const r = validateSummary(JSON.parse(raw));
  assert.deepEqual(r.errors, []);
});
