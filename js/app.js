// 화면 흐름: 업로드 → 검증 → 텍스트 추출 → 색상 추출 → 요약 → 미리보기 → PDF 저장. (PRD 3-1절)
import { CONFIG } from "./config.js";
import {
  openPdf, extractText, countReadableChars, renderFirstPage, UserFacingError,
} from "./pdf-reader.js";
import { extractTheme, DEFAULT_THEME } from "./color.js";
import { summarize } from "./summarize.js";
import { renderSlides, applyTheme } from "./render.js";

const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("file-input");
const statusEl = $("status");
const errorEl = $("error");
const noticeEl = $("notice");
const deck = $("deck");
const saveBtn = $("save-btn");
const themeEl = $("theme");

let busy = false;
let currentTitle = "";
const baseTitle = document.title;

$("engine-label").textContent =
  CONFIG.engine === "demo" ? "시연용 엔진 (원문 발췌, 네트워크 미사용)" : `${CONFIG.model} · ${new URL(CONFIG.endpoint, location.href).host}`;
if (CONFIG.engine === "demo") $("engine-label").classList.add("is-demo");

function setStatus(text, state = "working") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}
function showNotice(msgs) {
  noticeEl.textContent = msgs.join(" ");
  noticeEl.hidden = !msgs.length;
}

function resetOutput() {
  showError("");
  showNotice([]);
  deck.replaceChildren();
  deck.hidden = true;
  $("empty").hidden = false;
  saveBtn.disabled = true;
  themeEl.hidden = true;
}

async function handleFile(file) {
  if (busy || !file) return;
  busy = true;
  dropzone.classList.add("is-busy");
  resetOutput();
  const started = performance.now();
  let doc;

  try {
    setStatus("파일 확인 중");
    doc = await openPdf(file, CONFIG);

    setStatus(`텍스트 추출 중 (0/${doc.numPages})`);
    const pages = await extractText(doc, (n, total) => setStatus(`텍스트 추출 중 (${n}/${total})`));
    if (countReadableChars(pages) < CONFIG.minTextChars) {
      throw new UserFacingError(
        "PDF에서 텍스트를 읽을 수 없습니다. 이미지로만 된 스캔 PDF는 지원하지 않습니다."
      );
    }

    setStatus("색상 추출 중");
    let theme = { ...DEFAULT_THEME };
    try {
      const img = await renderFirstPage(doc);
      theme = extractTheme(img.data, img.width, img.height);
    } catch (e) {
      console.warn("색상 추출 실패, 기본 색상 사용", e);
    }
    await doc.destroy();
    doc = null;

    const { summary, warnings } = await summarize(pages, CONFIG, { onStage: (s) => setStatus(s) });

    applyTheme(document.documentElement, theme);
    showTheme(theme);
    renderSlides(deck, summary);
    deck.hidden = false;
    $("empty").hidden = true;
    currentTitle = summary.title;
    saveBtn.disabled = false;

    const notes = [...warnings];
    if (theme.isDefault) notes.push("원문에서 주요 색상을 판단하기 어려워 기본 색상을 사용했습니다.");
    showNotice(notes);

    const sec = Math.round((performance.now() - started) / 1000);
    setStatus(`완료 · ${pages.length}페이지 · ${sec}초`, "done");
  } catch (e) {
    console.error(e);
    showError(e instanceof UserFacingError ? e.message : e.message || "처리 중 오류가 발생했습니다.");
    setStatus("실패", "error");
  } finally {
    if (doc) doc.destroy();
    busy = false;
    dropzone.classList.remove("is-busy");
    fileInput.value = "";
  }
}

function showTheme(theme) {
  $("swatch-title").style.background = theme.title;
  $("swatch-accent").style.background = theme.accent;
  $("theme-text").textContent = theme.isDefault
    ? "기본 색상"
    : `원문 색상 · 제목 ${theme.title} · 강조 ${theme.accent}`;
  themeEl.hidden = false;
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
dropzone.addEventListener("click", () => !busy && fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileInput.click(); }
});
for (const type of ["dragenter", "dragover"]) {
  dropzone.addEventListener(type, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); });
}
for (const type of ["dragleave", "drop"]) {
  dropzone.addEventListener(type, () => dropzone.classList.remove("is-over"));
}
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files?.length > 1) { showError("PDF 파일은 한 번에 하나만 올릴 수 있습니다."); return; }
  handleFile(files?.[0]);
});
// 업로드 영역 밖에 떨어뜨려 브라우저가 파일을 열어 버리는 것을 막는다.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

saveBtn.addEventListener("click", () => {
  // 브라우저 인쇄 대화상자의 기본 파일 이름으로 쓰인다.
  document.title = `${currentTitle || "교육"} 요약`.replace(/[\\/:*?"<>|]/g, " ");
  window.print();
});
window.addEventListener("afterprint", () => { document.title = baseTitle; });
