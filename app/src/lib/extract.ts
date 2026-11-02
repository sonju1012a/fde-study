import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { QuoteSchema, type Quote } from "./quote-schema.ts";

export const MODEL = "claude-opus-5";

// USD per 1M tokens (claude-opus-5)
const PRICE = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

const SYSTEM_PROMPT = `당신은 한국 제조업 구매팀을 위해 협력사 견적서(PDF)에서 데이터를 추출하는 시스템입니다.
추출 결과는 사람이 검토한 뒤 ERP에 입력됩니다. 정확하게 읽는 것이 최우선이고, 모르면 추정하지 말고 null과 low_confidence_fields로 표시하세요.

규칙:
- 공급사는 "견적을 보낸 회사"입니다. 수신처인 한빛산업(주)는 절대 공급사가 아닙니다.
- 금액은 문서에 적힌 값을 그대로 옮기세요. 계산해서 채우지 마세요. (검산은 시스템이 따로 합니다)
- 숫자는 통화 기호, 쉼표, "원" 없이 숫자만 넣으세요. USD는 소수점 둘째 자리까지.
- 통화는 문서 기준입니다. USD 견적을 원화로 바꾸지 마세요. 환율이 적혀 있으면 fx_rate에만 기록하세요.
- 날짜는 YYYY-MM-DD로 정규화하세요. (2026.9.5 / 2026년 9월 5일 / 2026/09/05 → 2026-09-05)
- 유효기간이 "견적일로부터 30일", "30일", "발행일로부터 30일간 유효"처럼 상대 표현이면 type=relative, days=30으로 하고 날짜를 계산하지 마세요.
- 사업자등록번호는 000-00-00000 형식으로 정규화하세요.
- 품목 라인은 하나도 빠뜨리지 마세요. 품명과 규격은 문서 표기 그대로 두세요 (6205ZZ를 6205-2Z로 바꾸지 말 것).
- 부가세가 금액으로 적혀 있으면 그 값을, "별도"/"Excluded"로만 되어 있으면 null을 넣으세요.
- 납기, 결제조건, 비고는 원문 표현을 유지하세요.`;

export type ExtractResult = {
  quote: Quote;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number };
  elapsedMs: number;
  model: string;
};

export function createClient() {
  return new Anthropic();
}

/** PDF 1건을 Claude에 보내 구조화 데이터로 추출한다. */
export async function extractQuote(client: Anthropic, pdf: Buffer, opts?: { effort?: "low" | "medium" | "high" }): Promise<ExtractResult> {
  const started = Date.now();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: opts?.effort ?? "medium", format: zodOutputFormat(QuoteSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: "이 견적서에서 데이터를 추출하세요." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`모델이 요청을 거부함: ${response.stop_details?.explanation ?? "(설명 없음)"}`);
  }
  if (!response.parsed_output) {
    throw new Error(`구조화 출력 파싱 실패 (stop_reason=${response.stop_reason})`);
  }

  const u = response.usage;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const costUsd =
    (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + cacheRead * PRICE.cacheRead + cacheWrite * PRICE.cacheWrite) / 1_000_000;

  return {
    quote: response.parsed_output,
    usage: { input: u.input_tokens, output: u.output_tokens, cacheRead, cacheWrite, costUsd },
    elapsedMs: Date.now() - started,
    model: response.model,
  };
}
