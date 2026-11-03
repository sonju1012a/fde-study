# FDE 포트폴리오 프로젝트: 견적서 자동 추출 + 검토 시스템

Forward Deployed Engineer(FDE) 전환을 위한 포트폴리오. 가상의 고객사 과제를 받아
요구사항 정의부터 배포, 케이스 스터디까지 FDE의 실제 업무 흐름을 그대로 재현한다.

## 디렉토리 구조

```
FDE/
├── docs/        # 요구사항, 설계, 케이스 스터디 (FDE 산출물)
│   ├── 01-scenario.md       # 가상 고객사와 문제 정의
│   ├── 02-requirements.md   # 요구사항 문서 (PRD)
│   └── ...                  # 이후 설계/평가/회고 문서
├── data/        # 샘플 견적서 PDF + 정답 데이터 (평가셋)
└── app/         # Next.js + TypeScript 애플리케이션
```

## 로드맵

- [x] **Phase 1. 문제 정의** — 가상 고객사 설정, 요구사항 발굴, 성공 기준 합의
- [x] **Phase 2. 데이터 준비** — 샘플 견적서 PDF 생성, 정답 데이터(ground truth) 작성
- [x] **Phase 3. 추출 파이프라인** — Claude API로 PDF에서 구조화 데이터 추출
- [x] **Phase 4. 검토 UI** — 추출 결과를 사람이 확인/수정/확정하는 화면
- [~] **Phase 5. 평가(evals)** — 필드별 정확도 측정, 실패 케이스 분석, 프롬프트 개선 루프
- [ ] **Phase 6. 배포** — Vercel 배포, 환경변수/비용 관리
- [x] **Phase 7. 케이스 스터디** — 문제 → 접근 → 결과 → 배운 점 정리

## 기술 스택

- Next.js (App Router) + TypeScript + Tailwind CSS
- Anthropic SDK (`@anthropic-ai/sdk`), Claude Opus 5
- Zod (스키마 검증), 평가 스크립트는 Node로 실행

## 실행

```bash
cd app
pnpm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
pnpm dev
```

## 파이프라인 실행

```bash
cd app
pnpm extract              # data/samples/*.pdf → output/extracted.csv (+ 건별 JSON, 붙여넣기 텍스트)
pnpm extract --sheets     # 구글 시트용 환율 수식 컬럼 포함
pnpm eval                 # 추출 결과 vs data/ground-truth 정확도 → output/eval-report.md
pnpm data-profile <파일>   # 고객 데이터(CSV/JSON) 품질 진단 → output/profile/<이름>.md
```

Claude Code 안에서는 `/extract-quotes`로 실행과 결과 요약을, `/data-profile <파일>`로 데이터 진단과 고객 질문 목록 작성을 한 번에 할 수 있다.

## 검토 UI

```bash
cd app
pnpm sync-data            # output/extracted/*.json + PDF → src/data, public/samples (추출 결과가 바뀌면 다시 실행)
pnpm dev                  # http://localhost:3000
```

- `/` 목록: 상태·경고별 필터, 검색
- `/review/[id]` 검토: 왼쪽 원본 PDF, 오른쪽 추출 필드. 검산 경고와 AI가 자신 없다고 표시한 필드는 노란색, 수정한 값은 파란 테두리. 확정하면 잠기고 CSV·ERP 붙여넣기 텍스트를 내보낼 수 있다.
- `/stats` 통계: 필드별·협력사별 수정 횟수, 수정 없이 확정된 비율, 평균 검토 시간. 운영 피드백 루프의 원천 데이터.
- 검토 상태는 브라우저 localStorage에 저장한다 (프로토타입). 운영에서는 `src/lib/review-store.ts`의 인터페이스를 유지한 채 DB로 교체한다.
