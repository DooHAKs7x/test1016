// 요약 엔진 응답(JSON)의 형식, 장수, 필수 필드, 글자 수를 검증한다. (PRD 3절 2항, 8절)
// DOM에 의존하지 않는 순수 함수라 node에서도 테스트할 수 있다.

const LIMITS = {
  1: { min: 0, max: 4 }, // 교육 목적, 일시, 대상 등
  2: { min: 1, max: 3 },
  3: { min: 1, max: 3 },
  4: { min: 1, max: 5 }, // 적용 포인트(최대 3) + 후속 조치
};
const NEEDS_CHECK_MAX = 5;

// 모델이 코드블록이나 앞뒤 설명을 붙여도 JSON 본문만 꺼낸다.
export function parseModelJson(raw) {
  if (typeof raw !== "string") throw new Error("응답이 문자열이 아닙니다.");
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("응답에서 JSON을 찾을 수 없습니다.");
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new Error(`JSON 구문 오류: ${e.message}`);
  }
}

const isStr = (v) => typeof v === "string";
const charLen = (s) => [...s].length;

// errors: 재시도가 필요한 문제. lengthOnly: 글자 수 초과만 있는 경우(재시도 후에는 잘라서 사용).
export function validateSummary(data, { bulletMaxChars = 40 } = {}) {
  const errors = [];
  const lengthErrors = [];

  if (!data || typeof data !== "object") return { errors: ["최상위가 객체가 아닙니다."], lengthErrors };
  if (!isStr(data.title)) errors.push("title이 문자열이 아닙니다.");
  if (!Array.isArray(data.slides)) {
    errors.push("slides가 배열이 아닙니다.");
    return { errors, lengthErrors };
  }
  if (data.slides.length !== 4) errors.push(`slides가 정확히 4장이어야 하는데 ${data.slides.length}장입니다.`);

  data.slides.slice(0, 4).forEach((slide, i) => {
    const no = i + 1;
    const where = `${no}장`;
    if (!slide || typeof slide !== "object") { errors.push(`${where}이 객체가 아닙니다.`); return; }
    if (slide.no !== no) errors.push(`${where}의 no가 ${no}이어야 합니다.`);
    if (!isStr(slide.heading) || !slide.heading.trim()) errors.push(`${where}의 heading이 비어 있습니다.`);
    if (no === 1 && !isStr(slide.summary)) errors.push("1장의 summary가 문자열이 아닙니다.");

    if (!Array.isArray(slide.bullets) || !slide.bullets.every(isStr)) {
      errors.push(`${where}의 bullets가 문자열 배열이 아닙니다.`);
    } else {
      const filled = slide.bullets.filter((b) => b.trim());
      const { min, max } = LIMITS[no];
      if (filled.length < min) errors.push(`${where}의 bullets가 ${min}개 이상이어야 합니다.`);
      if (filled.length > max) errors.push(`${where}의 bullets가 ${max}개 이하여야 하는데 ${filled.length}개입니다.`);
      filled.forEach((b, j) => {
        if (charLen(b) > bulletMaxChars) {
          lengthErrors.push(`${where} 불릿 ${j + 1}이 ${charLen(b)}자로 ${bulletMaxChars}자를 넘습니다.`);
        }
      });
    }

    if (no === 4) {
      if (slide.needs_check === undefined) {
        errors.push("4장에 needs_check 배열이 없습니다.");
      } else if (!Array.isArray(slide.needs_check) || !slide.needs_check.every(isStr)) {
        errors.push("4장의 needs_check가 문자열 배열이 아닙니다.");
      }
    }
  });

  return { errors, lengthErrors };
}

// 검증을 통과한 데이터를 화면에 쓰기 좋게 정리한다. clip=true면 글자 수 초과 불릿을 자른다.
export function normalizeSummary(data, { bulletMaxChars = 40, clip = false } = {}) {
  const fit = (s) => {
    s = s.trim();
    if (!clip || charLen(s) <= bulletMaxChars) return s;
    return [...s].slice(0, bulletMaxChars - 1).join("") + "…";
  };
  const slides = data.slides.slice(0, 4).map((s, i) => ({
    no: i + 1,
    heading: s.heading.trim(),
    summary: isStr(s.summary) ? s.summary.trim() : "",
    bullets: s.bullets.filter((b) => b.trim()).slice(0, LIMITS[i + 1].max).map(fit),
    needs_check: Array.isArray(s.needs_check)
      ? s.needs_check.filter((b) => isStr(b) && b.trim()).slice(0, NEEDS_CHECK_MAX).map((b) => b.trim())
      : [],
  }));
  return { title: data.title.trim(), slides };
}
