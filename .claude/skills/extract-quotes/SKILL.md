---
name: extract-quotes
description: 협력사 견적서 PDF(data/samples)를 Claude로 추출해 ERP용 CSV를 만들고 결과를 요약한다. "/extract-quotes", "견적서 추출해줘", "CSV 뽑아줘" 같은 요청에 사용. 인자로 건 ID(Q001 Q008)나 --sheets를 받을 수 있다.
---

# 견적서 추출 실행

PDF → 구조화 데이터 → ERP CSV 파이프라인을 실행하고 결과를 사람이 읽기 좋게 요약한다.

## 절차

1. **API 키 확인.** `app/.env.local`에 `ANTHROPIC_API_KEY=sk-ant-`로 시작하는 줄이 있는지 확인한다. 없으면 실행하지 말고 아래 안내를 보여주고 멈춘다.
   ```bash
   cp app/.env.example app/.env.local   # 그리고 ANTHROPIC_API_KEY 값을 채운다
   ```
2. **실행.** 인자가 있으면 그대로 넘긴다. 인자가 없으면 전체 50건을 돌린다. 출력이 길 수 있으니 마지막 줄 위주로 본다.
   ```bash
   cd app && pnpm extract $ARGUMENTS
   ```
   - 이미 추출된 건은 `app/output/extracted/<ID>.json`이 있으면 건너뛴다. 다시 추출하려면 `FORCE=1`을 앞에 붙인다.
   - 중간에 실패한 건이 있으면 같은 명령을 다시 실행하면 실패 건만 재시도된다.
3. **결과 요약.** `app/output/run-log.json`을 읽고 다음을 표로 정리한다.
   - 성공/실패 건수, 총 비용(USD), 건당 평균 비용과 시간
   - 검산 경고가 있는 건: ID와 경고 필드 (이 건들은 검토자가 반드시 봐야 하는 건)
   - `lowConfidence`가 비어 있지 않은 건: ID와 필드
   - 실패 건: ID와 오류 메시지
4. **산출물 위치 안내.**
   - `app/output/extracted.csv` — ERP 내보내기와 같은 컬럼 구조. 엑셀로 열 수 있음
   - `app/output/extracted.sheets.csv` — `--sheets`를 줬을 때만. 구글 시트에 가져오면 USD 건의 환율과 원화금액이 GOOGLEFINANCE로 자동 계산됨
   - `app/output/extracted/<ID>.paste.txt` — ERP 품목 그리드에 Ctrl+V로 붙여넣는 텍스트 (품명, 규격, 수량, 단위, 단가)
5. 경고 건이 있으면 그중 하나를 골라 PDF 원본(`data/samples/<ID>.pdf`)과 추출 JSON을 나란히 보고, 모델이 틀린 건지 문서가 원래 그런 건지 한 줄로 판단해 준다.

## 주의

- 비용이 드는 작업이다. 50건 전체를 돌리기 전에 2건(`Q001 Q008`)으로 먼저 확인하는 것을 권한다.
- 추출 로직을 바꾼 뒤(프롬프트, 스키마)에는 `FORCE=1`로 다시 돌려야 결과에 반영된다.
- 정확도 평가는 이 스킬의 범위가 아니다. ERP 입력값과의 비교는 별도 평가 스크립트에서 한다.

## API 키가 없을 때

`app/output/extracted/<ID>.json`이 이미 있으면 API 호출 없이 CSV만 다시 만든다. 키가 없는데 JSON도 없는 건은 Claude Code가 PDF를 직접 읽어 같은 JSON 형식으로 작성할 수 있다 (`model: "claude-code-manual"`, usage는 0). 이 경우 비용·시간 수치는 실측이 아니므로 고객 보고에 쓰지 않는다.

## 정확도 평가

추출이 끝나면 `cd app && pnpm eval`로 정답 데이터와 비교한다. `app/output/eval-report.md`에 필드별 정확도와 불일치 목록이 생긴다. 불일치는 "추출 오류"와 "정답 데이터 오류" 둘 다일 수 있으므로 PDF 원본으로 확인한다.
