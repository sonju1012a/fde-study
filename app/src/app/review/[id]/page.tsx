import { notFound } from "next/navigation";
import quotes from "@/data/quotes.json";
import type { QuoteRecord } from "@/lib/types";
import { ReviewPanel } from "@/components/ReviewPanel";

const records = quotes as QuoteRecord[];

export function generateStaticParams() {
  return records.map((r) => ({ id: r.id }));
}

export default async function ReviewPage({ params }: PageProps<"/review/[id]">) {
  const { id } = await params;
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) notFound();
  return (
    <ReviewPanel
      record={records[idx]}
      prevId={idx > 0 ? records[idx - 1].id : null}
      nextId={idx < records.length - 1 ? records[idx + 1].id : null}
      position={`${idx + 1} / ${records.length}`}
    />
  );
}
