# 교육자료 PDF 요약 슬라이드 생성기

교육자료 PDF(100페이지 이내)를 올리면 원문 색상을 따른 16:9 요약 슬라이드 4장을 만들고, 브라우저 인쇄로 PDF를 저장합니다. 빌드 과정이 없는 정적 웹페이지이며 pdf.js와 cMap, 폰트 데이터를 `vendor/`에 함께 두어 외부 CDN 요청이 없습니다.

## 실행

ES 모듈과 Web Worker를 쓰므로 `file://`이 아니라 웹 서버로 열어야 합니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 열고 `samples/` 안의 PDF로 확인합니다.

- `sample-개인정보보호교육.pdf`: 정상 흐름 (청록색 원문 → 청록색 슬라이드)
- `test-101페이지.pdf`: 쪽수 초과 거부
- `test-텍스트없음.pdf`: 텍스트 없는 PDF 거부

## 요약 엔진 연결 (PRD 9절 #1)

`js/config.js`에서 `engine`, `endpoint`, `model`만 바꿉니다.

| engine | 용도 |
|---|---|
| `demo` (기본값) | 엔진 확정 전 시연용. 네트워크 없이 원문 문장을 골라 채움. 실제 요약이 아님 |
| `openai` | OpenAI 호환 `/v1/chat/completions` (사내 LLM 서버, vLLM, Ollama) |
| `ollama` | Ollama 네이티브 `/api/chat` |

엔드포인트를 바꾸면 `index.html`의 Content-Security-Policy `connect-src`도 같은 주소로 바꿉니다. 이 설정이 사내 엔진 외의 주소로 나가는 요청을 브라우저에서 차단합니다. 같은 출처의 상대 경로(예: `/llm/v1/chat/completions`)로 두고 사내 서버의 리버스 프록시로 넘기면 CORS와 CSP를 따로 손볼 필요가 없습니다. API 키는 저장소에 넣지 말고 프록시가 붙이게 합니다.

## 동작

1. 파일 확인: 확장자·MIME·`%PDF-` 헤더, 크기 상한, 암호 PDF, 100페이지 초과를 거부
2. 텍스트 추출: 페이지마다 `[p.N]` 머리말을 붙임. 공백 제외 50자 미만이면 스캔 PDF로 보고 거부
3. 색상 추출: 첫 페이지를 렌더링해 흰색·검정·회색을 뺀 픽셀에서 가장 넓은 색상 계열을 강조색, 가장 어두운 색을 제목색으로 사용(흰 바탕 대비 4.5:1 보정). 유채색이 거의 없으면 기본 색상
4. 요약: PRD 부록 프롬프트를 그대로 사용. 24,000자를 넘으면 구간별 메모 → 통합의 2단계 방식. 응답은 장수·`no`·필수 필드·불릿 개수·40자를 검증하고, 문제가 있으면 오류 내용을 알려 1회 재시도. 재시도 후 글자 수만 넘으면 잘라서 표시하고 안내
5. 렌더링: 모델 출력은 `textContent`로만 넣음
6. 저장: `@page { size: 13.333in 7.5in; margin: 0 }` 인쇄 CSS. 인쇄 대화상자에서 ‘PDF로 저장’, 여백 ‘없음’, ‘배경 그래픽’ 켬

## 테스트

```bash
npm test
```

검증, JSON 파싱, 색상 추출, 구간 분할, 시연용 엔진 출력을 확인합니다.

## 구조

```
index.html         화면 + CSP
css/app.css        화면 스타일
css/slides.css     슬라이드와 인쇄 스타일
js/config.js       엔진 설정
js/app.js          화면 흐름
js/pdf-reader.js   PDF 열기, 텍스트 추출, 첫 페이지 렌더링
js/color.js        색상 추출
js/summarize.js    프롬프트, 엔진 호출, 재시도, 2단계 요약
js/validate.js     응답 검증
js/render.js       슬라이드 렌더링
js/demo-engine.js  시연용 엔진
vendor/pdfjs/      pdf.js 4.10.38 (Apache-2.0)
```
