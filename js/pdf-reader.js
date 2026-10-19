// PDF 열기, 텍스트 추출(페이지 번호 포함), 첫 페이지 렌더링. 모두 브라우저 안에서 처리한다.
// cMap과 표준 폰트도 로컬 vendor 폴더에서 읽어 외부 요청이 생기지 않게 한다.
import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

const VENDOR = new URL("../vendor/pdfjs/", import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", VENDOR).href;

export class UserFacingError extends Error {}

export async function openPdf(file, { maxPages, maxFileBytes }) {
  const isPdfName = /\.pdf$/i.test(file.name);
  const isPdfType = !file.type || file.type === "application/pdf";
  if (!isPdfName || !isPdfType) {
    throw new UserFacingError("PDF 파일만 올릴 수 있습니다.");
  }
  if (file.size > maxFileBytes) {
    const mb = Math.round(maxFileBytes / 1024 / 1024);
    throw new UserFacingError(`파일이 너무 큽니다. ${mb}MB 이하의 PDF를 올려 주세요.`);
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(data.subarray(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new UserFacingError("PDF 형식이 아닌 파일입니다.");
  }

  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data,
      cMapUrl: new URL("cmaps/", VENDOR).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("standard_fonts/", VENDOR).href,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") {
      throw new UserFacingError("암호가 걸린 PDF는 처리할 수 없습니다.");
    }
    throw new UserFacingError("PDF를 열 수 없습니다. 파일이 손상되었는지 확인해 주세요.");
  }

  if (doc.numPages > maxPages) {
    await doc.destroy();
    throw new UserFacingError(
      `${doc.numPages}페이지 문서입니다. ${maxPages}페이지 이내의 PDF만 처리할 수 있습니다.`
    );
  }
  return doc;
}

// [p.N] 머리말을 붙인 페이지별 텍스트를 반환한다.
export async function extractText(doc, onProgress) {
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      text += item.hasEOL ? "\n" : "";
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    pages.push({ no: n, text });
    page.cleanup();
    onProgress?.(n, doc.numPages);
  }
  return pages;
}

export function countReadableChars(pages) {
  return pages.reduce((sum, p) => sum + p.text.replace(/\s/g, "").length, 0);
}

export function pagesToPromptText(pages) {
  return pages
    .filter((p) => p.text)
    .map((p) => `[p.${p.no}]\n${p.text}`)
    .join("\n\n");
}

// 색상 분석용으로 첫 페이지를 작게 렌더링한다.
export async function renderFirstPage(doc, targetWidth = 480) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent "print"는 requestAnimationFrame을 쓰지 않아, 처리 중 다른 탭으로 옮겨도 멈추지 않는다.
  await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
  page.cleanup();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
