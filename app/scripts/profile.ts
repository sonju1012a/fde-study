/**
 * 고객 데이터(CSV / JSON)를 받아 컬럼별 타입·결측·고유값·형식·이상치를 진단한다.
 * 외부 의존성 없음. 고객 환경에 그대로 복사해서 돌릴 수 있게 유지한다.
 *
 * 실행: pnpm data-profile <파일> [<파일> ...] [옵션]
 *   --sep=,          구분자 강제 (기본: , ; tab | 중 자동 감지)
 *   --key=A,B        이 컬럼 조합이 유일키인지 검증
 *   --limit=1000     앞에서 N행만 읽기 (대용량 1차 확인용)
 *   --top=5          상위 빈도값 개수
 *   --out=output/profile   산출물 폴더
 *   --path=items     JSON에서 이 경로의 배열 원소들을 행으로 사용 (예: 견적 JSON의 품목 배열)
 *   --merge=이름      입력 파일 전부를 하나로 합쳐 <이름>.md 한 장으로 출력 (같은 구조의 JSON 50개 등)
 *
 * 산출물: <out>/<파일명>.md (사람용), <out>/<파일명>.json (후속 처리용)
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ───────────────────────── 인자 ─────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const opt = (name: string, def = ""): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const OUT = resolve(here, "..", opt("out", "output/profile"));
const SEP = opt("sep") === "tab" ? "\t" : opt("sep");
const KEY = opt("key") ? opt("key").split(",").map((s) => s.trim()) : null;
const LIMIT = Number(opt("limit", "0")) || 0;
const TOP = Number(opt("top", "5")) || 5;
const PATH = opt("path");
const MERGE = opt("merge");

if (files.length === 0) {
  console.error("사용법: pnpm data-profile <csv|json 파일...> [--sep=,] [--key=A,B] [--limit=N] [--top=5] [--out=dir] [--path=items] [--merge=이름]");
  process.exit(1);
}

// ───────────────────────── 파싱 ─────────────────────────
type Row = Record<string, string | null>;

function detectSep(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const cands = [",", ";", "\t", "|"];
  let best = ",", bestN = -1;
  for (const c of cands) {
    const n = firstLine.split(c).length;
    if (n > bestN) { best = c; bestN = n; }
  }
  return best;
}

/** RFC4180 호환. BOM, CRLF, 따옴표 안 줄바꿈과 "" 이스케이프 처리 */
function parseCsv(text: string, sep: string): { header: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (LIMIT && rows.length > LIMIT) break;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() ?? []).map((h, i) => h.trim() || `(열${i + 1})`);
  return { header, rows };
}

function flatten(obj: unknown, prefix = "", into: Record<string, string | null> = {}): Record<string, string | null> {
  if (obj === null || obj === undefined) { into[prefix || "(value)"] = null; return into; }
  if (Array.isArray(obj)) { into[prefix] = `[배열 ${obj.length}개]`; return into; }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, into);
    return into;
  }
  into[prefix] = String(obj);
  return into;
}

function load(path: string): { header: string[]; rows: Row[]; sep: string | null; ragged: number } {
  const text = readFileSync(path, "utf8");
  const ext = extname(path).toLowerCase();
  if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") {
    let items: unknown[];
    if (ext === ".json") {
      const parsed = JSON.parse(text.replace(/^﻿/, ""));
      items = Array.isArray(parsed) ? parsed : [parsed];
    } else items = text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    if (PATH) {
      const dig = (o: unknown): unknown => PATH.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);
      items = items.flatMap((it) => { const v = dig(it); return Array.isArray(v) ? v : v === undefined ? [] : [v]; });
      if (items.length === 0) throw new Error(`--path=${PATH} 에 배열이 없음`);
    }
    if (LIMIT) items = items.slice(0, LIMIT);
    const flat = items.map((it) => flatten(it));
    const header = [...new Set(flat.flatMap((r) => Object.keys(r)))];
    const rows = flat.map((r) => Object.fromEntries(header.map((h) => [h, r[h] ?? null])));
    return { header, rows, sep: null, ragged: 0 };
  }
  const sep = SEP || detectSep(text.slice(0, 4000));
  const { header, rows: raw } = parseCsv(text, sep);
  const ragged = raw.filter((r) => r.length !== header.length).length;
  const rows = raw.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
  return { header, rows, sep, ragged };
}

// ───────────────────────── 값 분류 ─────────────────────────
const PLACEHOLDERS = new Set(["-", "--", "n/a", "na", "null", "none", "없음", "해당없음", "미정", "tbd", "?", "nan", "#n/a", "#ref!", "#value!"]);
type Kind = "null" | "integer" | "number" | "date" | "datetime" | "boolean" | "string";

const RE_INT = /^-?\d{1,3}(,\d{3})+$|^-?\d+$/;
const RE_NUM = /^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+\.\d+$/;
const RE_DATE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;
const RE_DATETIME = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})(:\d{2})?/;
const RE_BOOL = /^(true|false|y|n|yes|no|예|아니오|o|x)$/i;

function classify(v: string | null): { kind: Kind; num?: number; date?: Date } {
  if (v === null) return { kind: "null" };
  const t = v.trim();
  if (t === "" || PLACEHOLDERS.has(t.toLowerCase())) return { kind: "null" };
  const tm = RE_DATETIME.exec(t);
  if (tm) {
    const d = new Date(Date.UTC(+tm[1], +tm[2] - 1, +tm[3], +tm[4], +tm[5], tm[6] ? +tm[6].slice(1) : 0));
    if (!isNaN(+d) && +tm[2] <= 12 && +tm[3] <= 31 && +tm[4] < 24) return { kind: "datetime", date: d };
  }
  const dm = RE_DATE.exec(t);
  if (dm) {
    const d = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
    if (!isNaN(+d) && +dm[2] <= 12 && +dm[3] <= 31) return { kind: "date", date: d };
  }
  if (RE_INT.test(t)) return { kind: "integer", num: Number(t.replace(/,/g, "")) };
  if (RE_NUM.test(t)) return { kind: "number", num: Number(t.replace(/,/g, "")) };
  if (RE_BOOL.test(t)) return { kind: "boolean" };
  return { kind: "string" };
}

/** 값의 형식 지문: 숫자→9, 영문→A, 한글→가, 나머지는 그대로. "124-81-33021" → "999-99-99999" */
function shape(v: string): string {
  return v.trim().replace(/[0-9]/g, "9").replace(/[A-Za-z]/g, "A").replace(/[가-힣]/g, "가").replace(/9+/g, "9").replace(/A+/g, "A").replace(/가+/g, "가").slice(0, 40);
}

// ───────────────────────── 컬럼 통계 ─────────────────────────
type Issue = { level: "높음" | "중간" | "낮음"; column: string | null; message: string };

type ColStat = {
  name: string;
  type: Kind | "mixed" | "empty";
  kinds: Record<string, number>;
  total: number; nulls: number; nullRate: number;
  placeholders: number;
  distinct: number; distinctRate: number;
  top: Array<{ value: string; count: number }>;
  examples: string[];
  min?: number | string; max?: number | string; mean?: number; median?: number;
  zeros?: number; negatives?: number; outliers?: number;
  lenMin?: number; lenMax?: number; lenMean?: number;
  shapes: Array<{ shape: string; count: number }>;
  categories?: Array<{ value: string; count: number }>;
  whitespace: number;
  isUniqueKey: boolean;
};

function profileColumn(name: string, values: Array<string | null>): { stat: ColStat; issues: Issue[] } {
  const total = values.length;
  const kinds: Record<string, number> = {};
  const freq = new Map<string, number>();
  const nums: number[] = [];
  const dates: Date[] = [];
  const lens: number[] = [];
  const shapes = new Map<string, number>();
  let nulls = 0, placeholders = 0, whitespace = 0;
  const examples: string[] = [];

  for (const v of values) {
    const c = classify(v);
    kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    if (c.kind === "null") {
      nulls++;
      if (v !== null && v.trim() !== "" ) placeholders++;
      continue;
    }
    const raw = v as string;
    if (raw !== raw.trim() || /\s{2,}/.test(raw)) whitespace++;
    const t = raw.trim();
    freq.set(t, (freq.get(t) ?? 0) + 1);
    if (examples.length < 3 && !examples.includes(t)) examples.push(t);
    if (c.num !== undefined) nums.push(c.num);
    if (c.date) dates.push(c.date);
    if (c.kind === "string") { lens.push(t.length); const s = shape(t); shapes.set(s, (shapes.get(s) ?? 0) + 1); }
  }

  const nonNull = total - nulls;
  const issues: Issue[] = [];
  const kindEntries = Object.entries(kinds).filter(([k]) => k !== "null").sort((a, b) => b[1] - a[1]);
  let type: ColStat["type"];
  if (nonNull === 0) type = "empty";
  else {
    const [major] = kindEntries[0];
    // integer+number 섞임은 그냥 number. 그 외 소수 타입이 5% 이상이면 mixed
    const minor = kindEntries.slice(1).filter(([k]) => !(k === "integer" && major === "number") && !(k === "number" && major === "integer"));
    const minorN = minor.reduce((s, [, n]) => s + n, 0);
    if (minorN / nonNull >= 0.05) {
      type = "mixed";
      issues.push({ level: "높음", column: name, message: `타입 혼재: ${kindEntries.map(([k, n]) => `${k} ${n}`).join(", ")}. 숫자/날짜 컬럼에 문자열이 섞여 있으면 ERP 입력 시 거부됨` });
    } else if (minorN > 0) {
      type = major === "integer" && kinds.number ? "number" : (major as Kind);
      if (major !== "string") issues.push({ level: "중간", column: name, message: `${major} 컬럼에 다른 타입 ${minorN}건 (${minor.map(([k, n]) => `${k} ${n}`).join(", ")}). "협의", "별도" 같은 문구가 숫자 자리에 들어간 전형적 사례. 변환 규칙 필요` });
    } else type = major === "integer" && kinds.number ? "number" : (major as Kind);
  }

  const stat: ColStat = {
    name, type, kinds, total, nulls, nullRate: total ? nulls / total : 0, placeholders,
    distinct: freq.size, distinctRate: nonNull ? freq.size / nonNull : 0,
    top: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([value, count]) => ({ value, count })),
    examples,
    shapes: [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([shape, count]) => ({ shape, count })),
    categories: freq.size > 0 && freq.size <= 20 && nonNull >= 10 ? [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })) : undefined,
    whitespace,
    isUniqueKey: nonNull === total && freq.size === total && total > 1,
  };

  const numeric = type === "integer" || type === "number" || type === "mixed";
  if (nums.length && numeric) {
    const sorted = [...nums].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    stat.min = sorted[0]; stat.max = sorted[sorted.length - 1];
    stat.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    stat.median = q(0.5);
    stat.zeros = nums.filter((n) => n === 0).length;
    stat.negatives = nums.filter((n) => n < 0).length;
    stat.outliers = iqr > 0 ? nums.filter((n) => n < q1 - 3 * iqr || n > q3 + 3 * iqr).length : 0;
    if (stat.negatives) issues.push({ level: "중간", column: name, message: `음수 ${stat.negatives}건 (최소 ${stat.min}). 반품/취소 표현인지 입력 오류인지 확인 필요` });
    // 금액 컬럼은 원래 분포가 넓다. 중앙값 대비 1000배 이상 벌어질 때만 단위 혼용(원/천원) 의심
    if (stat.outliers && stat.median && (stat.max as number) / Math.max(stat.median, 1) >= 1000) issues.push({ level: "중간", column: name, message: `극단값 ${stat.outliers}건, 최대값이 중앙값의 ${Math.round((stat.max as number) / stat.median).toLocaleString()}배. 단위 혼용(원/천원)이나 자릿수 오타 가능성` });
    if (stat.zeros && stat.zeros / nums.length >= 0.1) issues.push({ level: "낮음", column: name, message: `0값 ${stat.zeros}건 (${pct(stat.zeros / nums.length)}). 미입력을 0으로 저장하는 시스템인지 확인` });
  } else if (nums.length && type === "string") {
    issues.push({ level: "낮음", column: name, message: `문자열 컬럼인데 숫자로만 된 값 ${nums.length}건 (예: ${nums.slice(0, 3).join(", ")}). 엑셀을 거치면 앞자리 0이 사라지거나 지수 표기로 바뀔 수 있음` });
  }
  if (dates.length && (type === "date" || type === "datetime")) {
    const sorted = [...dates].sort((a, b) => +a - +b);
    stat.min = sorted[0].toISOString().slice(0, type === "datetime" ? 16 : 10);
    stat.max = sorted[sorted.length - 1].toISOString().slice(0, type === "datetime" ? 16 : 10);
    const future = dates.filter((d) => +d > Date.now() + 366 * 86400e3).length;
    const ancient = dates.filter((d) => d.getUTCFullYear() < 2000).length;
    if (future) issues.push({ level: "중간", column: name, message: `1년 이상 미래 날짜 ${future}건. 연도 오타 가능성` });
    if (ancient) issues.push({ level: "중간", column: name, message: `2000년 이전 날짜 ${ancient}건. 기본값(1900-01-01 등) 가능성` });
  }
  if (lens.length) {
    stat.lenMin = Math.min(...lens); stat.lenMax = Math.max(...lens);
    stat.lenMean = lens.reduce((a, b) => a + b, 0) / lens.length;
  }

  if (nonNull > 0 && [...freq.keys()].every((k) => /^\[배열 \d+개\]$/.test(k))) issues.push({ level: "낮음", column: name, message: `중첩 배열 컬럼. 원소를 행으로 펼쳐 보려면 --path=${name} 로 다시 실행` });
  if (nonNull === 0) issues.push({ level: "낮음", column: name, message: "전부 비어 있음. 매핑에서 제외하거나 고객에게 용도 확인" });
  else if (stat.nullRate >= 0.5) issues.push({ level: "중간", column: name, message: `결측 ${pct(stat.nullRate)}. 필수 필드라면 원천 시스템에서 안 들어오는 것, 선택 필드라면 기본값 정책 필요` });
  else if (stat.nullRate >= 0.02) issues.push({ level: "낮음", column: name, message: `결측 ${pct(stat.nullRate)}. 선택 입력 필드로 보임. 매핑 대상이면 결측 시 기본값 정책 필요` });
  else if (stat.nullRate > 0) issues.push({ level: "낮음", column: name, message: `결측 ${nulls}건 (${pct(stat.nullRate)}). 거의 다 채워져 있어 누락된 몇 건은 입력 실수일 가능성` });
  if (placeholders) issues.push({ level: "중간", column: name, message: `"-", "없음", "N/A" 같은 대체 문자 ${placeholders}건. 빈값과 같은 뜻인지 고객 확인 후 정규화` });
  if (whitespace) issues.push({ level: "낮음", column: name, message: `앞뒤 공백 또는 이중 공백 ${whitespace}건. 조인·매칭 전 trim 필요` });
  if (nonNull > 1 && freq.size === 1) issues.push({ level: "낮음", column: name, message: `값이 하나뿐 ("${stat.top[0].value}"). 상수 컬럼. 필터 조건이거나 추출 범위가 좁은 것` });
  if (type === "string" && stat.shapes.length > 1 && nonNull >= 10) {
    const [first, ...rest] = stat.shapes;
    const restN = rest.reduce((s, x) => s + x.count, 0);
    // 자유 텍스트(품명, 비고)는 형식이 다양한 게 정상. 코드·번호처럼 생긴 컬럼(주 형식에 숫자 포함 또는 이름에 번호/코드/연락처 등)만 본다
    const codeLike = /9/.test(first.shape) || /번호|코드|code|id$|^id|no$|전화|연락처|tel|phone|mail|메일|우편|zip|사업자|계좌/i.test(name);
    if (codeLike && first.count / nonNull >= 0.7 && restN / nonNull >= 0.02) {
      issues.push({ level: "중간", column: name, message: `형식 불일치: 주 형식 "${first.shape}" ${first.count}건 외에 ${rest.map((r) => `"${r.shape}" ${r.count}`).join(", ")}. 코드·번호 컬럼이면 정규화 규칙 필요` });
    }
  }
  if (stat.categories && stat.categories.length >= 2 && stat.categories.length <= 20 && (stat.lenMean ?? 99) <= 4) {
    const scripts = new Set(stat.categories.map((c) => (/[가-힣]/.test(c.value) ? "한글" : /[A-Za-z]/.test(c.value) ? "영문" : "기타")));
    if (scripts.size > 1) issues.push({ level: "낮음", column: name, message: `코드값에 한글·영문이 섞임 (${stat.categories.map((c) => c.value).join(", ")}). 코드 테이블 기준으로 통일 필요` });
  }
  return { stat, issues };
}

// ───────────────────────── 테이블 통계 ─────────────────────────
/** 금액처럼 생긴 숫자 컬럼. 값이 우연히 다 달라도 키로 보지 않는다 */
const amountLike = (s: ColStat) => (s.type === "integer" || s.type === "number") && ((typeof s.max === "number" && s.max >= 10000) || /금액|가액|세|합계|단가|price|amount|total|vat|sum/i.test(s.name));

function findKeys(header: string[], rows: Row[], stats: ColStat[]): { single: string[]; pairs: string[][] } {
  const single = stats.filter((s) => s.isUniqueKey && !amountLike(s)).map((s) => s.name);
  const pairs: string[][] = [];
  if (single.length === 0 && rows.length > 1) {
    // 고유값이 어느 정도 있는 컬럼끼리만 조합 (상수·자유텍스트 제외)
    // 거의 유일한 컬럼(금액, 타임스탬프)은 아무거나 붙여도 유일해지므로 제외. 코드·순번처럼 반복되는 컬럼끼리만 조합
    const cands = stats.filter((s) => s.nulls === 0 && s.distinct >= 2 && s.distinctRate <= 0.5 && s.type !== "empty" && s.type !== "datetime" && !amountLike(s) && !(s.type === "string" && (s.lenMean ?? 0) > 30)).map((s) => s.name);
    for (let i = 0; i < cands.length && pairs.length < 5; i++) {
      for (let j = i + 1; j < cands.length && pairs.length < 5; j++) {
        const seen = new Set<string>();
        let ok = true;
        for (const r of rows) {
          const k = `${r[cands[i]]} ${r[cands[j]]}`;
          if (seen.has(k)) { ok = false; break; }
          seen.add(k);
        }
        if (ok) pairs.push([cands[i], cands[j]]);
      }
    }
  }
  return { single, pairs };
}

function checkKey(rows: Row[], key: string[]): { ok: boolean; dupGroups: number; dupRows: number; sample: string[] } {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = key.map((c) => (r[c] ?? "").trim()).join(" | ");
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  return { ok: dups.length === 0, dupGroups: dups.length, dupRows: dups.reduce((s, [, n]) => s + n, 0), sample: dups.slice(0, 3).map(([k, n]) => `${k} (${n}건)`) };
}

function duplicateRows(header: string[], rows: Row[]): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const r of rows) {
    const k = header.map((h) => (r[h] ?? "").trim()).join(" ");
    if (seen.has(k)) dup++; else seen.add(k);
  }
  return dup;
}

/** 열 A의 값이 열 B의 값을 1:1로 결정하는지 (예: 협력사코드 → 협력사명). 깨지면 마스터 불일치 */
function functionalDeps(rows: Row[], stats: ColStat[]): Array<{ from: string; to: string; violations: number; sample: string }> {
  const out: Array<{ from: string; to: string; violations: number; sample: string }> = [];
  const codeLike = stats.filter((s) => s.distinct >= 2 && s.distinct < rows.length * 0.9 && (s.type === "string" || s.type === "integer"));
  for (const a of codeLike) {
    if (a.nulls > 0) continue;
    for (const b of codeLike) {
      if (a === b || b.distinct < a.distinct * 0.5 || b.distinct > a.distinct * 1.5) continue;
      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        const k = (r[a.name] ?? "").trim(), v = (r[b.name] ?? "").trim();
        if (v === "" || classify(v).kind === "null") continue;
        (map.get(k) ?? map.set(k, new Set()).get(k)!).add(v);
      }
      const bad = [...map.entries()].filter(([, s]) => s.size > 1);
      if (bad.length > 0 && bad.length <= map.size * 0.2) {
        out.push({ from: a.name, to: b.name, violations: bad.length, sample: `${bad[0][0]} → ${[...bad[0][1]].slice(0, 3).join(" / ")}` });
      }
    }
  }
  return out.slice(0, 10);
}

// ───────────────────────── 출력 ─────────────────────────
const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 1)}%`;
const fmtNum = (n: number | undefined) => n === undefined ? "" : Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const short = (s: string, n = 24) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function renderMd(file: string, meta: { rows: number; cols: number; sep: string | null; bytes: number; limited: boolean }, stats: ColStat[], issues: Issue[], keys: ReturnType<typeof findKeys>, keyCheck: ReturnType<typeof checkKey> | null, dupRows: number, fds: ReturnType<typeof functionalDeps>): string {
  const L: string[] = [];
  L.push(`# 데이터 프로파일: ${basename(file)}`, "");
  L.push(`- 파일: \`${MERGE ? `${files.length}개 파일 병합 (${files[0]} …)` : file}\` (${(meta.bytes / 1024).toFixed(1)} KB${meta.sep ? `, 구분자 \`${meta.sep === "\t" ? "tab" : meta.sep}\`` : ", JSON"}${PATH ? `, 경로 \`${PATH}\`` : ""})`);
  L.push(`- 행 ${meta.rows.toLocaleString()} × 열 ${meta.cols}${meta.limited ? ` (앞 ${LIMIT}행만 읽음)` : ""}`);
  L.push(`- 완전 중복 행: ${dupRows}건`);
  if (keyCheck) L.push(`- 지정 키 \`${KEY!.join(" + ")}\`: ${keyCheck.ok ? "유일함 ✅" : `중복 ${keyCheck.dupGroups}그룹 / ${keyCheck.dupRows}행 ❌ (예: ${keyCheck.sample.join("; ")})`}`);
  if (keys.single.length) L.push(`- 단일 유일키 후보: ${keys.single.map((k) => `\`${k}\``).join(", ")}`);
  else if (keys.pairs.length) L.push(`- 단일 유일키 없음. 조합 키 후보: ${keys.pairs.map((p) => `\`${p.join(" + ")}\``).join(", ")}`);
  else L.push(`- 유일키 후보를 찾지 못함 (단일·2개 조합 기준). 고객에게 키 정의 확인 필요`);
  L.push("");

  const high = issues.filter((i) => i.level === "높음"), mid = issues.filter((i) => i.level === "중간"), low = issues.filter((i) => i.level === "낮음");
  L.push(`## 이슈 요약 (높음 ${high.length} / 중간 ${mid.length} / 낮음 ${low.length})`, "");
  for (const lv of [high, mid, low]) for (const i of lv) L.push(`- **${i.level}** ${i.column ? `\`${i.column}\` ` : ""}${i.message}`);
  if (issues.length === 0) L.push("- 발견된 이슈 없음");
  L.push("");

  if (fds.length) {
    L.push("## 마스터 정합성 (코드 → 이름 매핑이 깨진 곳)", "");
    L.push("| 기준 컬럼 | 종속 컬럼 | 깨진 키 수 | 예시 |", "|---|---|---|---|");
    for (const f of fds) L.push(`| ${esc(f.from)} | ${esc(f.to)} | ${f.violations} | ${esc(short(f.sample, 60))} |`);
    L.push("", "같은 코드에 이름이 여러 개면 마스터 테이블이 바뀌었거나 수기 입력이 섞인 것. 어느 쪽이 정답인지 고객 확인.", "");
  }

  L.push("## 컬럼 요약", "");
  L.push("| # | 컬럼 | 타입 | 결측 | 고유값 | 범위 / 길이 | 예시 | 비고 |", "|---|---|---|---|---|---|---|---|");
  stats.forEach((s, i) => {
    const range = s.min !== undefined ? `${typeof s.min === "number" ? fmtNum(s.min) : s.min} ~ ${typeof s.max === "number" ? fmtNum(s.max) : s.max}` : s.lenMin !== undefined ? `${s.lenMin}~${s.lenMax}자` : "";
    const notes: string[] = [];
    if (s.isUniqueKey) notes.push("유일");
    if (s.distinct === 1 && s.nulls < s.total) notes.push("상수");
    if (s.placeholders) notes.push(`대체문자 ${s.placeholders}`);
    if (s.whitespace) notes.push(`공백 ${s.whitespace}`);
    if (s.type === "mixed") notes.push("타입혼재");
    L.push(`| ${i + 1} | ${esc(s.name)} | ${s.type} | ${pct(s.nullRate)} | ${s.distinct.toLocaleString()} | ${esc(range)} | ${esc(s.examples.map((e) => short(e)).join(", "))} | ${notes.join(", ")} |`);
  });
  L.push("");

  L.push("## 컬럼 상세", "");
  for (const s of stats) {
    L.push(`### ${s.name}`, "");
    L.push(`- 타입: ${s.type}${Object.keys(s.kinds).length > 1 ? ` (${Object.entries(s.kinds).map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}`);
    L.push(`- 결측 ${s.nulls}/${s.total} (${pct(s.nullRate)})${s.placeholders ? `, 그중 대체문자 ${s.placeholders}` : ""} · 고유값 ${s.distinct} (비결측 대비 ${pct(s.distinctRate)})`);
    if (s.mean !== undefined) L.push(`- 수치: 최소 ${fmtNum(s.min as number)} · 중앙 ${fmtNum(s.median)} · 평균 ${fmtNum(s.mean)} · 최대 ${fmtNum(s.max as number)} · 0값 ${s.zeros} · 음수 ${s.negatives} · 극단값 ${s.outliers}`);
    else if (s.min !== undefined) L.push(`- 기간: ${s.min} ~ ${s.max}`);
    if (s.lenMin !== undefined) L.push(`- 길이: ${s.lenMin}~${s.lenMax}자 (평균 ${s.lenMean!.toFixed(1)})`);
    if (s.shapes.length) L.push(`- 형식: ${s.shapes.map((x) => `\`${x.shape}\` ${x.count}`).join(", ")}`);
    if (s.categories) L.push(`- 코드값 전체 (${s.categories.length}개): ${s.categories.map((t) => `${short(t.value, 30)} (${t.count})`).join(" · ")}`);
    else if (s.top.length) L.push(`- 상위값: ${s.top.map((t) => `${short(t.value, 30)} (${t.count})`).join(" · ")}`);
    L.push("");
  }
  return L.join("\n");
}

// ───────────────────────── 메인 ─────────────────────────
mkdirSync(OUT, { recursive: true });
const summaryLines: string[] = [];

type Loaded = ReturnType<typeof load> & { path: string; bytes: number };
const inputs: Loaded[] = [];
for (const f of files) {
  const path = resolve(f);
  try { inputs.push({ ...load(path), path, bytes: statSync(path).size }); } catch (e) { console.error(`${f}: 읽기 실패 - ${(e as Error).message}`); process.exitCode = 1; }
}
if (MERGE && inputs.length > 0) {
  const header = [...new Set(inputs.flatMap((i) => i.header))];
  const rows = inputs.flatMap((i) => i.rows.map((r) => Object.fromEntries(header.map((h) => [h, r[h] ?? null]))));
  const merged: Loaded = { header, rows, sep: inputs[0].sep, ragged: inputs.reduce((s, i) => s + i.ragged, 0), path: resolve(OUT, `${MERGE}.merged`), bytes: inputs.reduce((s, i) => s + i.bytes, 0) };
  inputs.splice(0, inputs.length, merged);
}

for (const data of inputs) {
  const { header, rows, sep, path } = data;
  if (rows.length === 0) { console.error(`${basename(path)}: 데이터 행이 없음`); continue; }

  const results = header.map((h) => profileColumn(h, rows.map((r) => r[h] ?? null)));
  const stats = results.map((r) => r.stat);
  const issues = results.flatMap((r) => r.issues);
  const dup = duplicateRows(header, rows);
  if (dup) issues.unshift({ level: "높음", column: null, message: `완전 중복 행 ${dup}건. 원천에서 두 번 내보냈거나 조인이 잘못된 것` });
  if (data.ragged) issues.unshift({ level: "높음", column: null, message: `열 개수가 헤더와 다른 행 ${data.ragged}건. 따옴표 없는 쉼표나 줄바꿈이 값에 섞인 것. 구분자(--sep)나 원천 내보내기 설정 확인` });
  const keys = findKeys(header, rows, stats);
  const keyCheck = KEY && KEY.every((k) => header.includes(k)) ? checkKey(rows, KEY) : null;
  if (KEY && KEY.some((k) => !header.includes(k))) console.warn(`${basename(path)}: --key 컬럼 없음 (${KEY.filter((k) => !header.includes(k)).join(", ")}), 키 검증 건너뜀`);
  if (keyCheck && !keyCheck.ok) issues.unshift({ level: "높음", column: null, message: `지정 키 ${KEY!.join("+")} 가 유일하지 않음 (${keyCheck.dupGroups}그룹 중복)` });
  const fds = functionalDeps(rows, stats);
  for (const fd of fds) issues.push({ level: "중간", column: fd.from, message: `\`${fd.from}\` 하나에 \`${fd.to}\` 가 여러 개인 키 ${fd.violations}건 (예: ${short(fd.sample, 50)})` });

  const meta = { rows: rows.length, cols: header.length, sep, bytes: data.bytes, limited: LIMIT > 0 && rows.length >= LIMIT };
  const md = renderMd(path, meta, stats, issues, keys, keyCheck, dup, fds);
  const stem = MERGE ? MERGE : basename(path, extname(path));
  writeFileSync(join(OUT, `${stem}.md`), md);
  writeFileSync(join(OUT, `${stem}.json`), JSON.stringify({ file: path, meta, keys, keyCheck, duplicateRows: dup, functionalDeps: fds, issues, columns: stats }, null, 2));

  const high = issues.filter((i) => i.level === "높음").length, mid = issues.filter((i) => i.level === "중간").length, low = issues.filter((i) => i.level === "낮음").length;
  summaryLines.push(`${basename(path)}: ${rows.length}행 × ${header.length}열, 이슈 높음 ${high} / 중간 ${mid} / 낮음 ${low} → ${join(OUT, `${stem}.md`)}`);
}

console.log(summaryLines.join("\n"));
