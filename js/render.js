// 요약 JSON을 16:9 HTML 슬라이드 4장으로 그린다. 모델 출력은 textContent로만 넣는다.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bulletList(items, className = "bullets") {
  const ul = el("ul", className);
  for (const item of items) ul.append(el("li", "", item));
  return ul;
}

function frame(no, heading, meta) {
  const slide = el("section", `slide slide-${no}`);
  slide.setAttribute("aria-label", `슬라이드 ${no}: ${heading}`);
  slide.append(el("div", "slide-bar"));
  const header = el("header", "slide-header");
  header.append(el("span", "slide-no", String(no).padStart(2, "0")), el("h2", "slide-heading", heading));
  const body = el("div", "slide-body");
  const footer = el("footer", "slide-footer");
  footer.append(el("span", "", meta.title), el("span", "", `${no} / 4`));
  slide.append(header, body, footer);
  return { slide, body };
}

export function renderSlides(container, summary) {
  container.replaceChildren();
  const meta = { title: summary.title };
  const [s1, s2, s3, s4] = summary.slides;

  // 1장: 교육 개요
  {
    const { slide, body } = frame(1, s1.heading, meta);
    body.append(el("h1", "deck-title", summary.title));
    if (s1.summary) body.append(el("p", "deck-summary", s1.summary));
    if (s1.bullets.length) body.append(bulletList(s1.bullets, "bullets bullets-compact"));
    container.append(slide);
  }

  // 2, 3장: 핵심 내용
  for (const s of [s2, s3]) {
    const { slide, body } = frame(s.no, s.heading, meta);
    body.append(bulletList(s.bullets, "bullets bullets-key"));
    container.append(slide);
  }

  // 4장: 시사점 및 후속 조치 + 확인 필요
  {
    const { slide, body } = frame(4, s4.heading, meta);
    const cols = el("div", "two-col");
    const left = el("div", "col");
    left.append(el("h3", "col-title", "업무 적용 · 후속 조치"), bulletList(s4.bullets));
    const right = el("div", "col col-check");
    right.append(el("h3", "col-title", "확인 필요"));
    right.append(s4.needs_check.length ? bulletList(s4.needs_check) : el("p", "muted", "없음"));
    cols.append(left, right);
    body.append(cols);
    container.append(slide);
  }
}

export function applyTheme(root, theme) {
  root.style.setProperty("--slide-title", theme.title);
  root.style.setProperty("--slide-accent", theme.accent);
}
