/**
 * 파이프라인 산출물(output/extracted/*.json)과 원본 PDF를 웹 앱이 쓰는 위치로 복사한다.
 *   output/extracted/*.json  → src/data/quotes.json (검산 결과 포함, 하나로 합침)
 *   ../data/samples/*.pdf    → public/samples/
 * 실행: pnpm sync-data
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QuoteSchema } from "../src/lib/quote-schema.ts";
import { validateQuote } from "../src/lib/validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const EXTRACTED = join(APP, "output", "extracted");
const SAMPLES = join(APP, "..", "data", "samples");
mkdirSync(join(APP, "src", "data"), { recursive: true });
mkdirSync(join(APP, "public", "samples"), { recursive: true });

const ids = readdirSync(EXTRACTED).filter((f) => /^Q\d+\.json$/.test(f)).map((f) => f.replace(".json", "")).sort();
const records = ids.map((id) => {
  const raw = JSON.parse(readFileSync(join(EXTRACTED, `${id}.json`), "utf8"));
  const quote = QuoteSchema.parse(raw.quote);
  copyFileSync(join(SAMPLES, `${id}.pdf`), join(APP, "public", "samples", `${id}.pdf`));
  return { id, file: `${id}.pdf`, quote, warnings: validateQuote(quote), model: raw.model ?? "unknown" };
});
writeFileSync(join(APP, "src", "data", "quotes.json"), JSON.stringify(records, null, 1));
console.log(`동기화 완료: ${records.length}건 → src/data/quotes.json, public/samples/`);
