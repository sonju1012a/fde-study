/**
 * 추출 결과(output/extracted/*.json)를 정답 데이터(data/ground-truth/*.json)와 비교해 정확도를 측정한다.
 * 실행: pnpm eval            (전체)
 *      pnpm eval Q001 Q008  (일부만)
 * 산출물: output/eval-report.md, output/eval-report.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QuoteSchema, type Quote } from "../src/lib/quote-schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const GT_DIR = join(here, "..", "..", "data", "ground-truth");
const OUT = join(here, "..", "output");
const EXTRACTED = join(OUT, "extracted");

const only = new Set(process.argv.slice(2));
const ids = readdirSync(EXTRACTED).filter((f) => /^Q\d+\.json$/.test(f)).map((f) => f.replace(".json", "")).filter((id) => only.size === 0 || only.has(id)).sort();

type Mismatch = { id: string; field: string; expected: unknown; got: unknown };
const HEADER_FIELDS = ["supplier_name", "business_number", "quote_number", "quote_date", "validity", "contact_name", "contact_phone", "contact_email", "delivery_terms", "payment_terms", "currency", "fx_rate", "subtotal", "vat", "total", "note"] as const;
const ITEM_FIELDS = ["name", "spec", "qty", "unit", "unit_price", "amount"] as const;

const norm = (v: unknown): unknown => {
  if (v === undefined || v === "") return null;
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  return v;
};
const eq = (a: unknown, b: unknown): boolean => {
  a = norm(a); b = norm(b);
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
    // validity: type + (date | days). text는 원문 표기 차이가 있어 비교에서 제외
    return eq(ao.type, bo.type) && eq(ao.date ?? null, bo.date ?? null) && eq(ao.days ?? null, bo.days ?? null);
  }
  return a === b;
};

const noteOk = (expected: string | null, got: string | null): boolean => {
  const e = norm(expected) as string | null, g = norm(got) as string | null;
  if (e === null) return true;
  return g !== null && g.includes(e);
};

const fieldHit: Record<string, { ok: number; total: number }> = {};
const bump = (f: string, ok: boolean) => { (fieldHit[f] ??= { ok: 0, total: 0 }).total++; if (ok) fieldHit[f].ok++; };
const mismatches: Mismatch[] = [];
const perDoc: Array<{ id: string; headerErrors: number; itemErrors: number; itemCountOk: boolean; perfect: boolean }> = [];
let itemLines = 0, itemLinesOk = 0;

for (const id of ids) {
  const gtPath = join(GT_DIR, `${id}.json`);
  if (!existsSync(gtPath)) { console.warn(`${id}: 정답 없음, 건너뜀`); continue; }
  const gt = JSON.parse(readFileSync(gtPath, "utf8")) as Quote;
  const got = QuoteSchema.parse(JSON.parse(readFileSync(join(EXTRACTED, `${id}.json`), "utf8")).quote);

  let headerErrors = 0, itemErrors = 0;
  for (const f of HEADER_FIELDS) {
    // note는 자유 텍스트라 정답이 추출값에 포함되어 있으면 정답으로 본다 (정답 null이면 추가 문구가 있어도 통과)
    const ok = f === "note" ? noteOk(gt.note, got.note) : eq(gt[f], got[f]);
    bump(f, ok);
    if (!ok) { headerErrors++; mismatches.push({ id, field: f, expected: gt[f], got: got[f] }); }
  }
  const itemCountOk = gt.items.length === got.items.length;
  bump("items.count", itemCountOk);
  if (!itemCountOk) mismatches.push({ id, field: "items.count", expected: gt.items.length, got: got.items.length });
  const n = Math.max(gt.items.length, got.items.length);
  for (let i = 0; i < n; i++) {
    const g = gt.items[i], o = got.items[i];
    itemLines++;
    if (!g || !o) { itemErrors++; mismatches.push({ id, field: `items[${i}]`, expected: g ?? "(없음)", got: o ?? "(없음)" }); continue; }
    let lineOk = true;
    for (const f of ITEM_FIELDS) {
      const ok = eq(g[f], o[f]);
      bump(`items.${f}`, ok);
      if (!ok) { lineOk = false; mismatches.push({ id, field: `items[${i}].${f}`, expected: g[f], got: o[f] }); }
    }
    if (lineOk) itemLinesOk++; else itemErrors++;
  }
  perDoc.push({ id, headerErrors, itemErrors, itemCountOk, perfect: headerErrors === 0 && itemErrors === 0 && itemCountOk });
}

// ---------- 리포트 ----------
const pct = (ok: number, total: number) => (total ? ((ok / total) * 100).toFixed(1) + "%" : "-");
const perfect = perDoc.filter((d) => d.perfect).length;
const headerTotal = Object.entries(fieldHit).filter(([k]) => !k.startsWith("items.")).reduce((s, [, v]) => ({ ok: s.ok + v.ok, total: s.total + v.total }), { ok: 0, total: 0 });
const itemTotal = Object.entries(fieldHit).filter(([k]) => k.startsWith("items.") && k !== "items.count").reduce((s, [, v]) => ({ ok: s.ok + v.ok, total: s.total + v.total }), { ok: 0, total: 0 });

const lines: string[] = [];
lines.push(`# 추출 정확도 리포트`, ``, `- 평가 대상: ${perDoc.length}건 (추출 결과 중 정답이 있는 건)`, `- 생성 시각: ${new Date().toISOString()}`, ``);
lines.push(`## 요약`, ``, `| 지표 | 값 |`, `|---|---|`);
lines.push(`| 수정 없이 통과한 건 (모든 필드 일치) | ${perfect}/${perDoc.length} (${pct(perfect, perDoc.length)}) |`);
lines.push(`| 헤더 필드 정확도 | ${pct(headerTotal.ok, headerTotal.total)} (${headerTotal.ok}/${headerTotal.total}) |`);
lines.push(`| 품목 필드 정확도 | ${pct(itemTotal.ok, itemTotal.total)} (${itemTotal.ok}/${itemTotal.total}) |`);
lines.push(`| 품목 라인 완전 일치 | ${pct(itemLinesOk, itemLines)} (${itemLinesOk}/${itemLines}) |`);
lines.push(`| 품목 개수 일치 건 | ${pct(fieldHit["items.count"]?.ok ?? 0, fieldHit["items.count"]?.total ?? 0)} |`, ``);
lines.push(`## 필드별 정확도`, ``, `| 필드 | 정확도 | 오류 수 |`, `|---|---|---|`);
for (const [f, v] of Object.entries(fieldHit).sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)) lines.push(`| ${f} | ${pct(v.ok, v.total)} | ${v.total - v.ok} |`);
lines.push(``, `## 불일치 상세 (${mismatches.length}건)`, ``, `| 건 | 필드 | 정답 | 추출 |`, `|---|---|---|---|`);
const show = (v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v); return (s ?? "null").replace(/\|/g, "\\|").slice(0, 60); };
for (const m of mismatches) lines.push(`| ${m.id} | ${m.field} | ${show(m.expected)} | ${show(m.got)} |`);
lines.push(``, `## 건별`, ``, `| 건 | 헤더 오류 | 품목 오류 | 통과 |`, `|---|---|---|---|`);
for (const d of perDoc) lines.push(`| ${d.id} | ${d.headerErrors} | ${d.itemErrors}${d.itemCountOk ? "" : " (개수 불일치)"} | ${d.perfect ? "✅" : "❌"} |`);

writeFileSync(join(OUT, "eval-report.md"), lines.join("\n"));
writeFileSync(join(OUT, "eval-report.json"), JSON.stringify({ perDoc, fieldHit, mismatches }, null, 2));

console.log(lines.slice(0, 12).join("\n"));
console.log(`\n불일치 ${mismatches.length}건. 상세: ${join(OUT, "eval-report.md")}`);
