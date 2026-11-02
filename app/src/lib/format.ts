import type { Quote } from "./quote-schema.ts";

export const money = (n: number | null | undefined, currency: Quote["currency"] = "KRW") =>
  n == null ? "-" : currency === "USD" ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${n.toLocaleString("ko-KR")}원`;

export const FIELD_LABELS: Record<string, string> = {
  supplier_name: "협력사명", business_number: "사업자번호", quote_number: "협력사 견적번호", quote_date: "견적일자",
  validity: "유효기간", contact_name: "담당자", contact_phone: "연락처(전화)", contact_email: "연락처(이메일)",
  delivery_terms: "납기", payment_terms: "결제조건", currency: "통화", fx_rate: "환율", subtotal: "공급가액",
  vat: "부가세", total: "합계", note: "비고", items: "품목",
  "items.name": "품명", "items.spec": "규격", "items.qty": "수량", "items.unit": "단위", "items.unit_price": "단가", "items.amount": "금액",
};
export const labelOf = (field: string) => {
  const m = field.match(/^items\[(\d+)\]\.(\w+)$/);
  if (m) return `품목 ${Number(m[1]) + 1} ${FIELD_LABELS[`items.${m[2]}`] ?? m[2]}`;
  return FIELD_LABELS[field] ?? field;
};
