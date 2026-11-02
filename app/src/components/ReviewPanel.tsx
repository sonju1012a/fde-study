"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Quote, LineItem } from "@/lib/quote-schema";
import type { QuoteRecord } from "@/lib/types";
import { validateQuote } from "@/lib/validate";
import { toErpRows, rowsToCsv, toPasteBlock } from "@/lib/erp-csv";
import { useReviewStore } from "@/lib/review-store";
import { labelOf, money } from "@/lib/format";

type Props = { record: QuoteRecord; prevId: string | null; nextId: string | null; position: string };

/** "items[2].qty" 같은 경로로 값을 읽고 쓴다 */
function getPath(obj: unknown, path: string): unknown {
  return path.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}
function setPath(obj: Quote, path: string, value: unknown): Quote {
  const next = structuredClone(obj) as unknown as Record<string, unknown>;
  const keys = path.split(/\.|\[|\]/).filter(Boolean);
  let cur: Record<string, unknown> = next;
  keys.slice(0, -1).forEach((k) => { cur = cur[k] as Record<string, unknown>; });
  cur[keys[keys.length - 1]] = value;
  return next as unknown as Quote;
}

export function ReviewPanel({ record, prevId, nextId, position }: Props) {
  const { get, open, setField, confirm, reopen, reset } = useReviewStore();
  const state = get(record.id);
  const quote = state?.quote ?? record.quote;
  const status = state?.status ?? "pending";
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { open(record.id, record.quote); }, [record.id, record.quote, open]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t); }, [toast]);

  const warnings = useMemo(() => validateQuote(quote), [quote]);
  const flagged = useMemo(() => {
    const m = new Map<string, string>();
    quote.low_confidence_fields.forEach((f) => m.set(f, "AI가 자신 없다고 표시한 필드"));
    warnings.forEach((w) => m.set(w.field, w.message));
    return m;
  }, [quote, warnings]);
  const edited = (path: string) => JSON.stringify(getPath(quote, path) ?? null) !== JSON.stringify(getPath(record.quote, path) ?? null);
  const locked = status === "confirmed";

  const change = (path: string, value: unknown) => {
    if (locked) return;
    const from = getPath(quote, path);
    if (JSON.stringify(from ?? null) === JSON.stringify(value ?? null)) return;
    setField(record.id, path, from ?? null, value ?? null, setPath(quote, path, value));
  };
  const changeItems = (items: LineItem[], field: string, from: unknown, to: unknown) => {
    if (locked) return;
    setField(record.id, field, from, to, { ...quote, items });
  };

  const copyPaste = async () => {
    await navigator.clipboard.writeText(toPasteBlock(quote));
    setToast("품목 표를 복사했습니다. ERP 품목 그리드에 Ctrl+V 하세요.");
  };
  const downloadCsv = () => {
    const csv = rowsToCsv(toErpRows(quote, record.file, warnings.map((w) => `${w.field}: ${w.message}`)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${record.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const cls = (path: string, extra = "") =>
    `w-full border rounded px-2 py-1 bg-white disabled:bg-gray-50 disabled:text-gray-500 ${flagged.has(path) ? "border-amber-400 bg-amber-50" : edited(path) ? "border-blue-400" : "border-gray-300"} ${extra}`;
  const Field = ({ path, label, type = "text", nullable = false, numeric = false }: { path: string; label: string; type?: string; nullable?: boolean; numeric?: boolean }) => {
    const v = getPath(quote, path) as string | number | null;
    return (
      <label className="block">
        <span className="text-xs text-gray-500 flex items-center gap-1">{label}{edited(path) && <span className="text-blue-600">· 수정됨</span>}{flagged.has(path) && <span className="text-amber-600" title={flagged.get(path)}>· 확인</span>}</span>
        <input type={type} disabled={locked} value={v ?? ""} className={cls(path, "mt-0.5" + (numeric ? " num text-right" : ""))}
          onChange={(e) => {
            const raw = e.target.value;
            if (numeric) change(path, raw === "" ? (nullable ? null : 0) : Number(raw));
            else change(path, raw === "" && nullable ? null : raw);
          }} />
      </label>
    );
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-4">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← 목록</Link>
        <h1 className="font-semibold text-lg">{record.file} <span className="text-gray-400 font-normal text-sm ml-1">{position}</span></h1>
        <span className="text-gray-600">{quote.supplier_name}</span>
        {status === "confirmed"
          ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">확정됨 {state?.confirmedAt && new Date(state.confirmedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</span>
          : <span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">검토 대기</span>}
        <div className="ml-auto flex items-center gap-2">
          {prevId ? <Link href={`/review/${prevId}`} className="px-2 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50">← 이전</Link> : <span className="px-2 py-1 text-sm border border-gray-200 rounded text-gray-300">← 이전</span>}
          {nextId ? <Link href={`/review/${nextId}`} className="px-2 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50">다음 →</Link> : <span className="px-2 py-1 text-sm border border-gray-200 rounded text-gray-300">다음 →</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 왼쪽: 원본 PDF */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 flex justify-between"><span>원본 문서</span><a href={`/samples/${record.file}`} target="_blank" className="text-blue-600 hover:underline">새 창에서 열기</a></div>
            <iframe src={`/samples/${record.file}#toolbar=0&view=FitH`} title={record.file} className="w-full" style={{ height: "calc(100vh - 140px)" }} />
          </div>
        </div>

        {/* 오른쪽: 추출 결과 */}
        <div className="space-y-4">
          {(warnings.length > 0 || quote.low_confidence_fields.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-amber-800 mb-1">확인이 필요한 항목 {flagged.size}개</div>
              <ul className="space-y-0.5 text-amber-900">
                {warnings.map((w) => <li key={"w" + w.field}><span className="font-medium">{labelOf(w.field)}</span>: {w.message}</li>)}
                {quote.low_confidence_fields.filter((f) => !warnings.some((w) => w.field === f)).map((f) => <li key={"l" + f}><span className="font-medium">{labelOf(f)}</span>: AI가 자신 없다고 표시함. 원본과 대조하세요.</li>)}
              </ul>
            </div>
          )}

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium mb-3">공급사 · 견적 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field path="supplier_name" label="협력사명" />
              <Field path="business_number" label="사업자번호" nullable />
              <Field path="quote_number" label="협력사 견적번호" nullable />
              <Field path="quote_date" label="견적일자" type="date" />
              <div>
                <span className="text-xs text-gray-500 flex items-center gap-1">유효기간{edited("validity") && <span className="text-blue-600">· 수정됨</span>}{flagged.has("validity") && <span className="text-amber-600">· 확인</span>}</span>
                <div className="flex gap-2 mt-0.5">
                  <select disabled={locked} value={quote.validity.type} className={cls("validity", "w-28")} onChange={(e) => change("validity", { ...quote.validity, type: e.target.value })}>
                    <option value="date">날짜</option><option value="relative">견적일+N일</option><option value="unknown">없음</option>
                  </select>
                  {quote.validity.type === "date" && <input type="date" disabled={locked} value={quote.validity.date ?? ""} className={cls("validity")} onChange={(e) => change("validity", { ...quote.validity, date: e.target.value || null })} />}
                  {quote.validity.type === "relative" && <input type="number" disabled={locked} value={quote.validity.days ?? ""} placeholder="일수" className={cls("validity", "num")} onChange={(e) => change("validity", { ...quote.validity, days: e.target.value === "" ? null : Number(e.target.value) })} />}
                </div>
                {quote.validity.text && <div className="text-[11px] text-gray-400 mt-0.5">원문: {quote.validity.text}</div>}
              </div>
              <Field path="contact_name" label="담당자" nullable />
              <Field path="contact_phone" label="연락처 (전화)" nullable />
              <Field path="contact_email" label="연락처 (이메일)" nullable />
              <Field path="delivery_terms" label="납기" nullable />
              <Field path="payment_terms" label="결제조건" nullable />
              <div>
                <span className="text-xs text-gray-500">통화</span>
                <select disabled={locked} value={quote.currency} className={cls("currency", "mt-0.5")} onChange={(e) => change("currency", e.target.value)}><option>KRW</option><option>USD</option></select>
              </div>
              {quote.currency === "USD" && <Field path="fx_rate" label="문서 기재 환율 (KRW/USD)" numeric nullable />}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">품목 <span className="text-gray-400 font-normal text-sm">{quote.items.length}개</span></h2>
              <div className="flex gap-2">
                <button onClick={copyPaste} className="text-sm px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50">ERP 붙여넣기용 복사</button>
                {!locked && <button onClick={() => changeItems([...quote.items, { name: "", spec: null, qty: 0, unit: null, unit_price: 0, amount: 0 }], `items[${quote.items.length}]`, null, "(추가)")} className="text-sm px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50">+ 행 추가</button>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr><th className="w-7 pb-1 text-left">#</th><th className="pb-1 text-left">품명</th><th className="pb-1 text-left">규격</th><th className="w-20 pb-1 text-right">수량</th><th className="w-16 pb-1 text-left">단위</th><th className="w-28 pb-1 text-right">단가</th><th className="w-32 pb-1 text-right">금액</th><th className="w-7"></th></tr>
                </thead>
                <tbody>
                  {quote.items.map((it, i) => {
                    const p = (f: keyof LineItem) => `items[${i}].${f}`;
                    const cell = (f: keyof LineItem, numeric = false, nullable = false) => (
                      <input disabled={locked} value={it[f] ?? ""} title={flagged.get(p(f))} className={cls(p(f), numeric ? "num text-right" : "")}
                        onChange={(e) => { const raw = e.target.value; change(p(f), numeric ? (raw === "" ? (nullable ? null : 0) : Number(raw)) : raw === "" && nullable ? null : raw); }} />
                    );
                    return (
                      <tr key={i} className="align-top">
                        <td className="py-0.5 pr-1 text-gray-400 num">{i + 1}</td>
                        <td className="py-0.5 pr-1">{cell("name")}</td>
                        <td className="py-0.5 pr-1">{cell("spec", false, true)}</td>
                        <td className="py-0.5 pr-1">{cell("qty", true)}</td>
                        <td className="py-0.5 pr-1">{cell("unit", false, true)}</td>
                        <td className="py-0.5 pr-1">{cell("unit_price", true)}</td>
                        <td className="py-0.5 pr-1">{cell("amount", true)}</td>
                        <td className="py-0.5">{!locked && <button title="행 삭제" onClick={() => changeItems(quote.items.filter((_, j) => j !== i), `items[${i}]`, it, "(삭제)")} className="text-gray-300 hover:text-red-600 px-1">×</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-100">
              <Field path="subtotal" label="공급가액" numeric />
              <Field path="vat" label={quote.currency === "USD" ? "부가세 (별도면 비움)" : "부가세"} numeric nullable />
              <Field path="total" label="합계" numeric />
            </div>
            <div className="text-xs text-gray-500 mt-2 num">품목 합 {money(quote.items.reduce((s, x) => s + (Number(x.amount) || 0), 0), quote.currency)} · 공급가액 {money(quote.subtotal, quote.currency)}{quote.vat != null && ` + 부가세 ${money(quote.vat, quote.currency)}`} = 합계 {money(quote.total, quote.currency)}</div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block">
              <span className="text-xs text-gray-500">비고{edited("note") && <span className="text-blue-600"> · 수정됨</span>}</span>
              <textarea disabled={locked} value={quote.note ?? ""} rows={2} className={cls("note", "mt-0.5")} onChange={(e) => change("note", e.target.value || null)} />
            </label>
          </section>

          {/* 확정 바 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-2 flex-wrap">
            {!locked ? (
              <>
                <button onClick={() => confirm(record.id)} className="px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800">확정</button>
                <button onClick={() => { reset(record.id, record.quote); setToast("AI 추출 원본으로 되돌렸습니다."); }} className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50">원본으로 되돌리기</button>
              </>
            ) : (
              <button onClick={() => reopen(record.id)} className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50">확정 취소</button>
            )}
            <button onClick={downloadCsv} className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50">CSV 다운로드</button>
            <span className="text-xs text-gray-500 ml-auto">수정 {state?.changes.length ?? 0}건 · 노란색은 확인 필요, 파란 테두리는 수정한 값</span>
          </div>

          {state && state.changes.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-medium mb-2 text-sm">수정 이력</h2>
              <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-y-auto">
                {[...state.changes].reverse().map((c, i) => (
                  <li key={i} className="flex gap-2"><span className="text-gray-400 num shrink-0">{new Date(c.at).toLocaleTimeString("ko-KR", { hour12: false })}</span><span className="font-medium shrink-0">{labelOf(c.field)}</span><span className="line-through text-gray-400 truncate">{fmt(c.from)}</span><span>→</span><span className="truncate">{fmt(c.to)}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>}
    </div>
  );
}

const fmt = (v: unknown) => (v == null ? "(없음)" : typeof v === "object" ? JSON.stringify(v) : String(v));
