import type { Quote } from "./quote-schema.ts";

/**
 * 고객사 ERP 내보내기(erp_quote_export_2026Q3.csv)와 같은 컬럼 구조로 변환한다.
 * 품목 1줄 = 1행. 헤더 값은 매 행에 반복.
 * ERP 입력 화면의 "엑셀붙여넣기" 열 순서(품명, 규격, 수량, 단위, 단가)는 toPasteBlock()이 따로 만든다.
 */
export const ERP_COLUMNS = [
  "PDF파일", "협력사명", "사업자번호", "협력사견적번호", "견적일자", "유효일자", "유효기간원문",
  "협력사담당자", "연락처", "납기", "결제조건", "통화", "환율",
  "순번", "품명", "규격", "수량", "단위", "단가", "금액",
  "공급가액", "부가세", "합계", "비고", "검토필요필드",
] as const;

export type ErpRow = Record<(typeof ERP_COLUMNS)[number], string | number>;

export function toErpRows(q: Quote, file: string, warnings: string[] = []): ErpRow[] {
  const validDate = q.validity.type === "date" ? (q.validity.date ?? "") : q.validity.type === "relative" && q.validity.days != null ? addDays(q.quote_date, q.validity.days) : "";
  const review = [...q.low_confidence_fields, ...warnings].join("; ");
  return q.items.map((it, i) => ({
    PDF파일: file,
    협력사명: q.supplier_name,
    사업자번호: q.business_number ?? "",
    협력사견적번호: q.quote_number ?? "",
    견적일자: q.quote_date,
    유효일자: validDate,
    유효기간원문: q.validity.text ?? "",
    협력사담당자: q.contact_name ?? "",
    연락처: q.contact_phone ?? q.contact_email ?? "",
    납기: q.delivery_terms ?? "",
    결제조건: q.payment_terms ?? "",
    통화: q.currency,
    환율: q.fx_rate ?? "",
    순번: i + 1,
    품명: it.name,
    규격: it.spec ?? "",
    수량: it.qty,
    단위: it.unit ?? "",
    단가: it.unit_price,
    금액: it.amount,
    공급가액: q.subtotal,
    부가세: q.vat ?? "",
    합계: q.total,
    비고: q.note ?? "",
    검토필요필드: review,
  }));
}

/** ERP 품목 그리드에 Ctrl+V로 붙여넣을 탭 구분 텍스트 (열 순서: 품명, 규격, 수량, 단위, 단가) */
export function toPasteBlock(q: Quote): string {
  return q.items.map((it) => [it.name, it.spec ?? "", it.qty, it.unit ?? "", it.unit_price].join("\t")).join("\n");
}

/**
 * CSV 직렬화.
 * sheets=true면 구글 시트용 수식 컬럼 2개를 덧붙인다:
 *   적용환율  = USD 건이면 GOOGLEFINANCE 현재 환율, KRW 건이면 1
 *   원화금액  = 금액 × 적용환율 (ERP에 넣을 원화 값)
 * 수식은 구글 시트에서 CSV를 가져올 때 자동 계산된다. 엑셀에서는 GOOGLEFINANCE가 없어 #NAME?가 뜨므로 시트 전용.
 */
export function rowsToCsv(rows: ErpRow[], opts: { sheets?: boolean } = {}): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header: string[] = [...ERP_COLUMNS];
  if (opts.sheets) header.push("적용환율", "원화금액");
  const colCur = colLetter(ERP_COLUMNS.indexOf("통화"));
  const colAmt = colLetter(ERP_COLUMNS.indexOf("금액"));
  const colFx = colLetter(ERP_COLUMNS.length); // 적용환율 위치
  const lines = [
    header.join(","),
    ...rows.map((r, i) => {
      const cells = ERP_COLUMNS.map((c) => esc(r[c]));
      if (opts.sheets) {
        const n = i + 2; // 시트 행 번호 (1행은 헤더)
        cells.push(esc(`=IF(${colCur}${n}="USD",GOOGLEFINANCE("CURRENCY:USDKRW"),1)`));
        cells.push(esc(`=ROUND(${colAmt}${n}*${colFx}${n})`));
      }
      return cells.join(",");
    }),
  ];
  return "\ufeff" + lines.join("\r\n"); // BOM: 엑셀에서 한글 깨짐 방지
}

/** 0-based 인덱스 → 스프레드시트 열 문자 (0→A, 25→Z, 26→AA) */
function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
