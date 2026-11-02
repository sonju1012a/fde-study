import type { Quote } from "./quote-schema.ts";
import type { Warning } from "./validate.ts";

/** src/data/quotes.json 의 한 건 */
export type QuoteRecord = {
  id: string;
  file: string;
  quote: Quote;
  warnings: Warning[];
  model: string;
};
