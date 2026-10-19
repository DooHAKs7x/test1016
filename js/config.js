// 요약 엔진 설정. 엔진이 확정되면 이 파일만 고친다. (PRD 8절, 9절 #1)
// 비밀 키는 여기에 넣지 않는다. 키가 필요하면 사내 프록시가 붙이도록 한다.
export const CONFIG = {
  // "openai": OpenAI 호환 /v1/chat/completions (사내 LLM 서버, vLLM, Ollama 모두 지원)
  // "ollama": Ollama 네이티브 /api/chat
  // "demo":   네트워크 없이 브라우저 안에서 원문 문장을 골라 채우는 시연용 엔진
  engine: "demo",

  // 사내 엔드포인트 한 곳. 같은 출처의 상대 경로(/llm/...)로 두면 리버스 프록시로 연결하기 쉽다.
  endpoint: "http://localhost:11434/v1/chat/completions",
  model: "qwen2.5:14b-instruct",

  temperature: 0.2,
  requestTimeoutMs: 240_000,

  // 이 글자 수를 넘으면 구간별 요약 후 통합하는 2단계 방식으로 처리한다.
  singlePassMaxChars: 24_000,
  chunkChars: 12_000,

  maxPages: 100,
  maxFileBytes: 50 * 1024 * 1024, // 9절 #5: 엔진 확정 후 조정
  minTextChars: 50,               // 이보다 적으면 텍스트를 읽을 수 없는 PDF로 본다
  bulletMaxChars: 40,
};
