"use client";
import { useMemo, useState } from "react";
import type { QuoteRecord } from "@/lib/types";
import { useReviewStore } from "@/lib/review-store";
import { FIELD_LABELS } from "@/lib/format";

/** 운영 피드백 루프의 첫 화면: 검토자가 뭘 얼마나 고쳤는지 본다 */
export function StatsView({ records }: { records: QuoteRecord[] }) {
  const { store, clearAll } = useReviewStore();
  const [armed, setArmed] = useState(false);

  const s = useMemo(() => {
    const states = Object.entries(store);
    const confirmed = states.filter(([, v]) => v.status === "confirmed");
    const changes = states.flatMap(([id, v]) => v.changes.map((c) => ({ id, ...c })));
    const byField: Record<string, number> = {};
    for (const c of changes) {
      const key = c.field.replace(/^items\[\d+\]\.(\w+)$/, "items.$1").replace(/^items\[\d+\]$/, "items");
      byField[key] = (byField[key] ?? 0) + 1;
    }
    const bySupplier: Record<string, { docs: number; edits: number }> = {};
    for (const [id, v] of states) {
      const name = records.find((r) => r.id === id)?.quote.supplier_name ?? id;
      bySupplier[name] ??= { docs: 0, edits: 0 };
      bySupplier[name].docs++;
      bySupplier[name].edits += v.changes.length;
    }
    const durations = confirmed.map(([, v]) => (v.openedAt && v.confirmedAt ? (new Date(v.confirmedAt).getTime() - new Date(v.openedAt).getTime()) / 1000 : null)).filter((x): x is number => x != null);
    const avgSec = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const untouched = confirmed.filter(([, v]) => v.changes.length === 0).length;
    const flaggedTotal = records.reduce((n, r) => n + r.warnings.length + r.quote.low_confidence_fields.length, 0);
    return { opened: states.length, confirmed: confirmed.length, untouched, changes, byField, bySupplier, avgSec, flaggedTotal };
  }, [store, records]);

  const exportLog = async () => {
    await navigator.clipboard.writeText(JSON.stringify(s.changes, null, 2));
  };

  return (
    <div className="max-w-screen-xl mx-auto px-5 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">검토 통계</h1>
        <p className="text-sm text-gray-500 mt-1">검토자가 AI 추출값을 얼마나 고쳤는지 기록합니다. 자주 고치는 필드와 협력사가 다음 개선 대상입니다.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["전체 건", records.length],
          ["열어본 건", s.opened],
          ["확정 건", s.confirmed],
          ["수정 없이 확정", s.confirmed ? `${s.untouched} (${Math.round((s.untouched / s.confirmed) * 100)}%)` : "-"],
          ["평균 검토 시간", s.avgSec == null ? "-" : s.avgSec < 90 ? `${Math.round(s.avgSec)}초` : `${(s.avgSec / 60).toFixed(1)}분`],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-white border border-gray-200 rounded-lg p-4"><div className="text-xs text-gray-500">{k}</div><div className="text-2xl font-semibold num mt-1">{v}</div></div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-medium mb-2">필드별 수정 횟수 <span className="text-gray-400 text-sm font-normal">총 {s.changes.length}</span></h2>
          {Object.keys(s.byField).length === 0 ? <p className="text-sm text-gray-400">아직 수정 기록이 없습니다.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(s.byField).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                  <tr key={f} className="border-t border-gray-100"><td className="py-1.5">{FIELD_LABELS[f] ?? f}</td><td className="py-1.5 text-right num">{n}</td>
                    <td className="py-1.5 w-1/2"><div className="h-2 bg-gray-100 rounded"><div className="h-2 bg-amber-400 rounded" style={{ width: `${(n / s.changes.length) * 100}%` }} /></div></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-medium mb-2">협력사별</h2>
          {Object.keys(s.bySupplier).length === 0 ? <p className="text-sm text-gray-400">아직 열어본 건이 없습니다.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500"><tr><th className="text-left font-medium pb-1">협력사</th><th className="text-right font-medium pb-1">열어본 건</th><th className="text-right font-medium pb-1">수정</th><th className="text-right font-medium pb-1">건당</th></tr></thead>
              <tbody>
                {Object.entries(s.bySupplier).sort((a, b) => b[1].edits / b[1].docs - a[1].edits / a[1].docs).map(([name, v]) => (
                  <tr key={name} className="border-t border-gray-100"><td className="py-1.5">{name}</td><td className="py-1.5 text-right num">{v.docs}</td><td className="py-1.5 text-right num">{v.edits}</td><td className="py-1.5 text-right num">{(v.edits / v.docs).toFixed(1)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-medium mb-1">AI가 스스로 표시한 확인 필요 항목</h2>
        <p className="text-sm text-gray-600">전체 {records.length}건 중 검산 경고 또는 자신 없음 표시가 있는 항목 <b className="num">{s.flaggedTotal}</b>개. 이 항목들이 실제로 수정됐는지 비교하면 "AI의 자기 평가가 믿을 만한지"를 알 수 있습니다.</p>
      </section>

      <div className="flex gap-2 items-center">
        <button onClick={exportLog} className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm">수정 이력 JSON 복사</button>
        {!armed
          ? <button onClick={() => setArmed(true)} className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm text-gray-500">검토 데이터 초기화…</button>
          : <><button onClick={() => { clearAll(); setArmed(false); }} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm">정말 초기화</button><button onClick={() => setArmed(false)} className="text-sm text-gray-500">취소</button></>}
        <span className="text-xs text-gray-400 ml-auto">저장 위치: 이 브라우저 (localStorage). 운영에서는 DB로 교체.</span>
      </div>
    </div>
  );
}
