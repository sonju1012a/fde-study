import quotes from "@/data/quotes.json";
import type { QuoteRecord } from "@/lib/types";
import { StatsView } from "@/components/StatsView";

export default function StatsPage() {
  return <StatsView records={quotes as QuoteRecord[]} />;
}
