// 시연용 엔진: 요약 엔진이 정해지기 전에 화면과 PDF 저장 흐름을 확인하기 위한 것이다.
// 네트워크를 쓰지 않고, 원문에서 문장을 골라 그대로 옮긴다(생성하지 않는다).
// 실제 엔진과 같은 경로(JSON 문자열 → 검증)를 타도록 문자열을 반환한다.

const MAX = 40;
const APPLY_WORDS = ["적용", "활용", "개선", "시사점", "후속", "계획", "실천", "도입", "권장", "필요"];

export async function demoComplete(messages) {
  const prompt = messages[0].content;
  const m = prompt.match(/## 입력\n([\s\S]*?)\n\n## 작성 원칙/);
  const text = m ? m[1] : prompt;

  const pages = [];
  text.split(/\[p\.(\d+)\]\n/).forEach((part, i, arr) => {
    if (i % 2 === 1) pages.push({ no: Number(part), text: arr[i + 1] ?? "" });
  });
  if (!pages.length) pages.push({ no: 1, text });

  const lines = [];
  for (const p of pages) {
    for (const raw of p.text.split(/\n|(?<=[.!?。])\s+/)) {
      const line = raw.replace(/^[\s•·\-–▪■□○●◦*]+/, "").replace(/^\d{1,2}[.)]\s+/, "").trim();
      if ([...line].length >= 6) lines.push({ page: p.no, line });
    }
  }

  const title = shortest(lines.filter((l) => l.page === pages[0].no).slice(0, 3)) ?? "교육자료";
  const freq = wordFreq(lines);
  const score = (l) => {
    const words = tokens(l.line);
    return words.reduce((s, w) => s + (freq.get(w) ?? 0), 0) / Math.sqrt(words.length + 1);
  };
  const used = new Set([title]);
  const pick = (pool, n) => {
    const out = [];
    for (const l of [...pool].sort((a, b) => score(b) - score(a))) {
      if (out.length >= n) break;
      if (used.has(l.line) || [...l.line].length > MAX) continue;
      used.add(l.line);
      out.push(l.line);
    }
    return out;
  };

  const mid = pages[Math.floor(pages.length / 2)]?.no ?? 1;
  const first = lines.filter((l) => l.page <= mid && l.page !== pages[0].no || pages.length === 1);
  const second = lines.filter((l) => l.page > mid);
  const summaryLine = lines.find((l) => l.line !== title && [...l.line].length > 12 && [...l.line].length <= 60);

  if (summaryLine) used.add(summaryLine.line);
  const b1 = pick(lines.filter((l) => /목적|일시|대상|기간|장소/.test(l.line)), 3);
  const b2 = pick(first.length ? first : lines, 3);
  const b3 = pick(second.length ? second : lines, 3);
  let b4 = pick(lines.filter((l) => APPLY_WORDS.some((w) => l.line.includes(w))), 3);
  if (!b4.length) b4 = pick(lines, 1);

  return JSON.stringify({
    title,
    slides: [
      { no: 1, heading: "교육 개요", summary: summaryLine?.line ?? "", bullets: b1 },
      { no: 2, heading: "핵심 내용 ①", bullets: b2.length ? b2 : ["(원문에서 고를 문장 없음)"] },
      { no: 3, heading: "핵심 내용 ②", bullets: b3.length ? b3 : ["(원문에서 고를 문장 없음)"] },
      {
        no: 4,
        heading: "시사점 및 후속 조치",
        bullets: b4,
        needs_check: ["시연용 엔진 결과(원문 문장 발췌). 사내 요약 엔진 연결 후 다시 생성 필요"],
      },
    ],
  });
}

function shortest(list) {
  const cands = list.filter((l) => [...l.line].length <= MAX);
  return cands.sort((a, b) => a.line.length - b.line.length)[0]?.line;
}

function tokens(s) {
  return s.split(/[^\p{L}\p{N}]+/u).filter((w) => [...w].length >= 2);
}

function wordFreq(lines) {
  const f = new Map();
  for (const l of lines) for (const w of tokens(l.line)) f.set(w, (f.get(w) ?? 0) + 1);
  return f;
}
