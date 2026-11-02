import { z } from "zod";

/**
 * 견적서에서 추출하는 데이터 스키마.
 * data/ground-truth/*.json 및 ERP 입력값과 같은 구조를 유지해서 평가와 CSV 변환이 단순해지게 한다.
 */
export const LineItemSchema = z.object({
  name: z.string().describe("품명. 문서에 적힌 그대로"),
  spec: z.string().nullable().describe("규격. 없으면 null"),
  qty: z.number().describe("수량"),
  unit: z.string().nullable().describe("단위 (EA, SET, 대 등). 없으면 null"),
  unit_price: z.number().describe("단가. 문서 통화 기준 숫자만"),
  amount: z.number().describe("금액. 문서에 적힌 값 그대로 (계산하지 말 것)"),
});

export const ValiditySchema = z.object({
  type: z.enum(["date", "relative", "unknown"]).describe("date: 날짜로 명시 / relative: '견적일로부터 N일' 같은 상대 표현 / unknown: 없음"),
  date: z.string().nullable().describe("type=date일 때 YYYY-MM-DD. 아니면 null"),
  days: z.number().nullable().describe("type=relative일 때 일수. 아니면 null"),
  text: z.string().nullable().describe("문서에 적힌 원문 표현"),
});

export const QuoteSchema = z.object({
  supplier_name: z.string().describe("공급사(견적을 보낸 회사) 상호. 수신처인 한빛산업이 아님"),
  business_number: z.string().nullable().describe("공급사 사업자등록번호. 000-00-00000 형식으로 정규화. 없으면 null"),
  quote_number: z.string().nullable().describe("공급사가 부여한 견적번호/문서번호. 없으면 null"),
  quote_date: z.string().describe("견적일자. YYYY-MM-DD로 정규화"),
  validity: ValiditySchema,
  contact_name: z.string().nullable().describe("공급사 담당자 이름(직급 포함 가능)"),
  contact_phone: z.string().nullable().describe("공급사 담당자 전화번호"),
  contact_email: z.string().nullable().describe("공급사 담당자 이메일"),
  delivery_terms: z.string().nullable().describe("납기 조건 원문"),
  payment_terms: z.string().nullable().describe("결제 조건 원문"),
  currency: z.enum(["KRW", "USD"]).describe("문서의 금액 통화"),
  fx_rate: z.number().nullable().describe("문서에 환율이 명시되어 있으면 그 값(KRW/USD). 없으면 null"),
  items: z.array(LineItemSchema).describe("품목 라인 전부. 하나도 빠뜨리지 말 것"),
  subtotal: z.number().describe("공급가액(소계). 문서에 적힌 값"),
  vat: z.number().nullable().describe("부가세. 문서에 금액이 있으면 그 값, '별도'로만 표기되면 null"),
  total: z.number().describe("합계. 문서에 적힌 값"),
  note: z.string().nullable().describe("비고/특이사항. 납기·결제 외의 조건"),
  low_confidence_fields: z.array(z.string()).describe("읽기 애매했거나 추정한 필드명 목록 (예: 'items[2].spec', 'validity'). 확실하면 빈 배열"),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
