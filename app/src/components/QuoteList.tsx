"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { QuoteRecord } from "@/lib/types";
import { useReviewStore } from "@/lib/review-store";
import { money } from "@/lib/format";

type Filter = "all" | "pending" | "confirmed" | "flagged";

export function QuoteList({ records }: { records: QuoteRecord[] }) {
  const { store } = useReviewStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => records.map((r) => {
    const st = store[r.id];
    const flagged = r.warnings.length + r.quote.low_confidence_fields.length;
    return { ...r, status: st?.status ?? "pending", edits: st?.changes.length ?? 0, flagged };
  }), [records, store]);

  const filtered = rows.filter((r) => {
    if (filter === "pending" && r.status !== "pending") return false;
    if (filter === "confirmed" && r.status !== "confirmed") return false;
    if (filter === "flagged" && r.flagged === 0) return false;
    if (q && !`${r.id} ${r.quote.supplier_name} ${r.quote.quote_number ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    flagged: rows.filter((r) => r.flagged > 0).length,
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-6">
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">견적서 검토 대기열</h1>
          <p className="text-sm text-gray-500 mt-1">AI가 추출한 값을 확인하고 확정하면 ERP 입력용 CSV로 내보낼 수 있습니다.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="협력사명, 파일명, 견적번호 검색" className="border border-gray-300 rounded-md px-3 py-1.5 w-72 bg-white" />
      </div>

      <div className="flex gap-2 mb-3">
        {([["all", "전체"], ["pending", "검토 대기"], ["confirmed", "확정"], ["flagged", "확인 필요"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-sm border ${filter === k ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
            {label} <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">파일</th>
              <th className="px-4 py-2.5 font-medium">협력사</th>
              <th className="px-4 py-2.5 font-medium">견적일</th>
              <th className="px-4 py-2.5 font-medium text-right">품목</th>
              <th className="px-4 py-2.5 font-medium text-right">합계</th>
              <th className="px-4 py-2.5 font-medium">확인 필요</th>
              <th className="px-4 py-2.5 font-medium">상태</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-gray-700">{r.file}</td>
                <td className="px-4 py-2">{r.quote.supplier_name}{r.quote.currency === "USD" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">USD</span>}</td>
                <td className="px-4 py-2 num text-gray-600">{r.quote.quote_date}</td>
                <td className="px-4 py-2 num text-right">{r.quote.items.length}</td>
                <td className="px-4 py-2 num text-right">{money(r.quote.total, r.quote.currency)}</td>
                <td className="px-4 py-2">
                  {r.warnings.length > 0 && <span className="mr-1 text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">검산 {r.warnings.length}</span>}
                  {r.quote.low_confidence_fields.length > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">자신없음 {r.quote.low_confidence_fields.length}</span>}
                  {r.flagged === 0 && <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-2">
                  {r.status === "confirmed"
                    ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">확정{r.edits > 0 && ` · 수정 ${r.edits}`}</span>
                    : <span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">검토 대기{r.edits > 0 && ` · 수정 ${r.edits}`}</span>}
                </td>
                <td className="px-4 py-2 text-right"><Link href={`/review/${r.id}`} className="text-blue-600 hover:underline">열기</Link></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">해당하는 건이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
