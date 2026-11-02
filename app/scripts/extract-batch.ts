/**
 * data/samples/*.pdf 전부를 추출해서 output/ 아래에 결과를 남긴다.
 * 실행: pnpm extract                 (전체)
 *      pnpm extract Q001 Q008        (일부만)
 *      pnpm extract --sheets         (구글 시트용 환율 수식 컬럼 포함)
 *      FORCE=1 pnpm extract          (이미 추출한 건도 다시)
 * 필요: app/.env.local 에 ANTHROPIC_API_KEY
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, extractQuote, MODEL } from "../src/lib/extract.ts";
import { validateQuote } from "../src/lib/validate.ts";
import { toErpRows, rowsToCsv, toPasteBlock, type ErpRow } from "../src/lib/erp-csv.ts";
import { QuoteSchema } from "../src/lib/quote-schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(here, "..", "..", "data", "samples");
const OUT = join(here, "..", "output");
const OUT_JSON = join(OUT, "extracted");
mkdirSync(OUT_JSON, { recursive: true });

const args = process.argv.slice(2);
const sheets = args.includes("--sheets");
const only = new Set(args.filter((a) => !a.startsWith("--")));
const files = readdirSync(SAMPLES).filter((f) => f.endsWith(".pdf") && (only.size === 0 || only.has(f.replace(".pdf", "")))).sort();
if (files.length === 0) { console.error("대상 PDF가 없습니다."); process.exit(1); }

// API 클라이언트는 실제로 필요할 때만 만든다 (키 없이도 이미 추출된 JSON으로 CSV 생성 가능)
let client: ReturnType<typeof createClient> | null = null;
const getClient = () => (client ??= createClient());
const CONCURRENCY = 4;
const allRows: ErpRow[] = [];
const log: Array<Record<string, unknown>> = [];
let done = 0;

async function processOne(file: string) {
  const id = file.replace(".pdf", "");
  const jsonPath = join(OUT_JSON, `${id}.json`);
  try {
    let result;
    if (existsSync(jsonPath) && !process.env.FORCE) {
      result = JSON.parse(readFileSync(jsonPath, "utf8"));
      result.quote = QuoteSchema.parse(result.quote); // 손으로 만든 JSON도 스키마를 지키는지 검사
    } else {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("추출 결과 JSON이 없고 ANTHROPIC_API_KEY도 없음. 키를 넣거나 output/extracted/에 JSON을 넣어야 함");
      result = await extractQuote(getClient(), readFileSync(join(SAMPLES, file)));
      writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    }
    const warnings = validateQuote(result.quote);
    const rows = toErpRows(result.quote, file, warnings.map((w) => `${w.field}: ${w.message}`));
    allRows.push(...rows);
    writeFileSync(join(OUT_JSON, `${id}.paste.txt`), toPasteBlock(result.quote));
    log.push({ id, ok: true, items: result.quote.items.length, warnings: warnings.length, lowConfidence: result.quote.low_confidence_fields, ...result.usage, elapsedMs: result.elapsedMs });
    done++;
    console.log(`[${done}/${files.length}] ${id}  items=${result.quote.items.length}  warn=${warnings.length}  $${result.usage.costUsd.toFixed(4)}  ${(result.elapsedMs / 1000).toFixed(1)}s${warnings.length ? "  ⚠ " + warnings.map((w) => w.field).join(",") : ""}`);
  } catch (e) {
    done++;
    const msg = e instanceof Error ? e.message : String(e);
    log.push({ id, ok: false, error: msg });
    console.error(`[${done}/${files.length}] ${id}  실패: ${msg}`);
  }
}

async function main() {
// 동시 실행 (rate limit 고려해 4개씩)
const queue = [...files];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await processOne(queue.shift()!); }));

allRows.sort((a, b) => String(a.PDF파일).localeCompare(String(b.PDF파일)) || Number(a.순번) - Number(b.순번));
writeFileSync(join(OUT, "extracted.csv"), rowsToCsv(allRows));
if (sheets) writeFileSync(join(OUT, "extracted.sheets.csv"), rowsToCsv(allRows, { sheets: true }));
writeFileSync(join(OUT, "run-log.json"), JSON.stringify({ model: MODEL, ranAt: new Date().toISOString(), results: log }, null, 2));

const ok = log.filter((l) => l.ok);
const cost = ok.reduce((s, l) => s + Number(l.costUsd ?? 0), 0);
const avgMs = ok.length ? ok.reduce((s, l) => s + Number(l.elapsedMs ?? 0), 0) / ok.length : 0;
console.log(`\n완료: ${ok.length}/${files.length}건 성공, 품목 ${allRows.length}행, 비용 $${cost.toFixed(3)} (건당 $${(cost / Math.max(ok.length, 1)).toFixed(4)}), 평균 ${(avgMs / 1000).toFixed(1)}s`);
console.log(`CSV: ${join(OUT, "extracted.csv")}${sheets ? `\n구글 시트용: ${join(OUT, "extracted.sheets.csv")}` : ""}`);
}

main();
