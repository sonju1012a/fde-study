import type { Quote } from "./quote-schema.ts";

export type Warning = { field: string; message: string };

/**
 * 추출 결과 검산. LLM이 읽은 값끼리 산술적으로 맞는지 확인한다.
 * 불일치는 "LLM이 잘못 읽었거나" "문서 자체가 틀렸거나" 둘 중 하나이므로 검토자에게 반드시 보여준다.
 */
export function validateQuote(q: Quote): Warning[] {
  const w: Warning[] = [];
  const tol = q.currency === "USD" ? 0.011 : 0.5; // USD는 센트 반올림 허용

  q.items.forEach((it, i) => {
    const expected = it.qty * it.unit_price;
    if (Math.abs(expected - it.amount) > tol) {
      w.push({ field: `items[${i}].amount`, message: `수량×단가(${fmt(expected)}) ≠ 금액(${fmt(it.amount)})` });
    }
  });

  const sum = q.items.reduce((s, it) => s + it.amount, 0);
  if (Math.abs(sum - q.subtotal) > tol) {
    w.push({ field: "subtotal", message: `품목 합(${fmt(sum)}) ≠ 공급가액(${fmt(q.subtotal)})` });
  }

  if (q.vat !== null) {
    if (q.currency === "KRW" && Math.abs(Math.round(q.subtotal * 0.1) - q.vat) > 1) {
      w.push({ field: "vat", message: `부가세(${fmt(q.vat)})가 공급가액의 10%(${fmt(Math.round(q.subtotal * 0.1))})와 다름` });
    }
    if (Math.abs(q.subtotal + q.vat - q.total) > tol) {
      w.push({ field: "total", message: `공급가액+부가세(${fmt(q.subtotal + q.vat)}) ≠ 합계(${fmt(q.total)})` });
    }
  } else if (Math.abs(q.subtotal - q.total) > tol) {
    w.push({ field: "total", message: `부가세 없음인데 공급가액(${fmt(q.subtotal)}) ≠ 합계(${fmt(q.total)})` });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.quote_date)) w.push({ field: "quote_date", message: `날짜 형식 아님: ${q.quote_date}` });
  if (q.business_number && !/^\d{3}-\d{2}-\d{5}$/.test(q.business_number)) w.push({ field: "business_number", message: `사업자번호 형식 아님: ${q.business_number}` });
  if (q.validity.type === "date" && q.validity.date && q.validity.date < q.quote_date) w.push({ field: "validity", message: "유효일자가 견적일보다 빠름" });
  if (q.items.length === 0) w.push({ field: "items", message: "품목이 없음" });
  if (/한빛산업/.test(q.supplier_name)) w.push({ field: "supplier_name", message: "수신처(한빛산업)를 공급사로 읽음" });

  return w;
}

const fmt = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
