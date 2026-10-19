// 첫 페이지 렌더링 결과(RGBA 픽셀)에서 제목색과 강조색을 고른다. 모델은 관여하지 않는다. (PRD 5절)
// DOM에 의존하지 않는 순수 함수라 node에서도 테스트할 수 있다.

export const DEFAULT_THEME = { title: "#1f3a5f", accent: "#2f6fd6", isDefault: true };

const MIN_CHROMA_SHARE = 0.003; // 유채색 픽셀이 전체의 0.3% 미만이면 색을 판단하기 어렵다고 본다

export function extractTheme(rgba, width, height) {
  const buckets = new Map();
  let total = 0;
  const step = Math.max(1, Math.floor((width * height) / 120_000)); // 큰 이미지는 표본만 본다

  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    total++;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const { s, l } = rgbToHsl(r, g, b);
    if (s < 0.25 || l > 0.92 || l < 0.08) continue; // 흰 배경, 검은 본문, 회색은 제외
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  }

  const colors = [...buckets.values()]
    .map((c) => {
      const rgb = [c.r / c.n, c.g / c.n, c.b / c.n].map(Math.round);
      return { n: c.n, rgb, ...rgbToHsl(...rgb) };
    })
    .sort((a, b) => b.n - a.n);

  const chromaCount = colors.reduce((s, c) => s + c.n, 0);
  if (!total || chromaCount / total < MIN_CHROMA_SHARE) return { ...DEFAULT_THEME };

  // 비슷한 색상(hue)끼리 묶어 가장 넓게 쓰인 색을 강조색으로 쓴다.
  const families = [];
  for (const c of colors) {
    const fam = families.find((f) => hueDistance(f.h, c.h) < 18);
    if (fam) { fam.n += c.n; fam.members.push(c); } else families.push({ h: c.h, n: c.n, members: [c] });
  }
  families.sort((a, b) => b.n - a.n);
  const main = families[0];
  const accentColor = main.members[0];

  // 제목색: 충분히 쓰인 색 중 가장 어두운 색. 흰 바탕 대비 4.5:1이 안 되면 같은 색상으로 어둡게 한다.
  const significant = colors.filter((c) => c.n >= chromaCount * 0.02);
  const darkest = significant.reduce((d, c) => (c.l < d.l ? c : d), accentColor);
  let title = ensureContrast(darkest.rgb, 4.5);
  let accent = ensureContrast(accentColor.rgb, 3);

  return { title: toHex(title), accent: toHex(accent), isDefault: false };
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastWithWhite(rgb) {
  return 1.05 / (luminance(rgb) + 0.05);
}

function ensureContrast(rgb, ratio) {
  let c = rgb;
  for (let i = 0; i < 20 && contrastWithWhite(c) < ratio; i++) {
    c = c.map((v) => Math.round(v * 0.88));
  }
  return c;
}

function toHex(rgb) {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}
