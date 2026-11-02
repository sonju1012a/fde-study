import quotes from "@/data/quotes.json";
import type { QuoteRecord } from "@/lib/types";
import { QuoteList } from "@/components/QuoteList";

export default function Home() {
  return <QuoteList records={quotes as QuoteRecord[]} />;
}
