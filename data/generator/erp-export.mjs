// 고객사 ERP "견적등록" 화면 목업 스크린샷 + ERP 입력값 내보내기(CSV) 생성
// 실행: node data/generator/erp-export.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GT_DIR = join(ROOT, "ground-truth");
const OUT = join(ROOT, "erp");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pad = (n) => String(n).padStart(2, "0");
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const gts = readdirSync(GT_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(GT_DIR, f), "utf8")));

// 협력사 코드 부여 (ERP 마스터)
const codes = {};
let seq = 1001;
for (const g of gts) if (!codes[g.supplier_name]) codes[g.supplier_name] = `V${seq++}`;

const ENTRY_USERS = ["박지훈", "이소연"];
const rows = [];
let erpNo = 20260700;
for (const g of gts) {
  erpNo += 1 + Math.floor(rand() * 3);
  const usd = g.currency === "USD";
  // 달러 건: 대리가 발주일 환율로 원화 환산 (견적서 환율과 다를 수 있음)
  const fx = usd ? (g.fx_rate ?? 1385 + Math.round(rand() * 20)) + (rand() < 0.5 ? 0 : Math.round(rand() * 8)) : null;
  const toKRW = (v) => (usd ? Math.round(v * fx) : v);
  const validDate = g.validity.type === "date" ? g.validity.date : addDays(g.quote_date, g.validity.days);
  const entryDate = addDays(g.quote_date, Math.floor(rand() * 3));
  const user = ENTRY_USERS[Math.floor(rand() * 2)];
  const subtotalKRW = toKRW(g.subtotal);
  const vatKRW = usd ? Math.round(subtotalKRW * 0.1) : g.vat;
  const remark = [usd ? `USD 견적, 환율 ${fx.toFixed(1)} 적용 (${entryDate} 매매기준율)` : "", g.note ?? ""].filter(Boolean).join(" / ");

  g.items.forEach((it, i) => {
    rows.push({
      ERP견적번호: `E${erpNo}`,
      협력사코드: codes[g.supplier_name],
      협력사명: g.supplier_name,
      사업자번호: g.business_number ?? "",
      협력사견적번호: g.quote_number ?? "",
      견적일자: g.quote_date,
      유효일자: validDate,
      협력사담당자: g.contact_name,
      연락처: g.contact_phone ?? g.contact_email ?? "",
      납기: g.delivery_terms,
      결제조건: g.payment_terms,
      순번: i + 1,
      품명: it.name,
      규격: it.spec,
      수량: it.qty,
      단위: it.unit,
      단가: toKRW(it.unit_price),
      금액: toKRW(it.amount),
      공급가액: subtotalKRW,
      부가세: vatKRW,
      합계: subtotalKRW + vatKRW,
      비고: remark,
      입력자: user,
      입력일시: `${entryDate} ${pad(9 + Math.floor(rand() * 9))}:${pad(Math.floor(rand() * 60))}`,
      _src: g.id,
    });
  });
}

// 사람이 입력하다 생긴 오류를 소량 섞는다 (실무 데이터의 현실)
const typo = (r, field, fn) => { r[field] = fn(r[field]); };
const multi = [...new Set(rows.filter((r) => rows.filter((x) => x._src === r._src).length >= 3).map((r) => r._src))];
typo(rows.find((r) => r._src === multi[3]), "수량", (v) => v * 10);                               // 수량 0 하나 더
typo(rows.find((r) => r._src === multi[7]), "규격", (v) => v.replace(/(\d)$/, "$1 "));            // 규격 끝 공백 (보이지 않는 오류)
typo(rows.filter((r) => r._src === multi[11])[1], "단가", (v) => v + 1000);                      // 단가 오타
const drop = rows.filter((r) => r._src === multi[15]); rows.splice(rows.indexOf(drop[drop.length - 1]), 1); // 마지막 품목 누락

const cols = Object.keys(rows[0]).filter((c) => c !== "_src");
const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
writeFileSync(join(OUT, "erp_quote_export_2026Q3.csv"), csv);
// 파일명 매핑 (고객이 따로 알려준 것으로 간주)
writeFileSync(join(OUT, "erp_to_pdf_mapping.csv"), "﻿" + "ERP견적번호,PDF파일\r\n" + [...new Map(rows.map((r) => [r.ERP견적번호, r._src])).entries()].map(([e, s]) => `${e},${s}.pdf`).join("\r\n"));

// ---------- ERP 견적등록 화면 목업 ----------
const sample = gts.find((g) => g.id === "Q001");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  body { margin:0; font-family: "Apple SD Gothic Neo","Malgun Gothic",sans-serif; font-size: 12px; background:#d4d0c8; color:#000; width:1280px; }
  .title { background: linear-gradient(#0a246a,#a6caf0); color:#fff; padding:4px 8px; font-weight:700; font-size:13px; }
  .menu { background:#ece9d8; padding:3px 8px; border-bottom:1px solid #999; }
  .menu span { margin-right:14px; }
  .tool { background:#ece9d8; padding:4px 8px; border-bottom:1px solid #999; }
  .tool button { font-size:11px; padding:2px 10px; margin-right:4px; border:1px solid #777; background:#f4f4f4; }
  .crumb { padding:4px 10px; color:#333; }
  .form { margin:6px 10px; border:1px solid #888; background:#f6f6f6; }
  .form table { border-collapse:collapse; width:100%; }
  .form th { background:#e3e7ee; border:1px solid #bbb; padding:4px 6px; text-align:right; width:92px; font-weight:600; }
  .form td { border:1px solid #bbb; padding:3px 6px; background:#fff; }
  .form td.req { background:#fff7d6; }
  .inp { display:inline-block; border:1px solid #7a7a7a; background:#fff; padding:2px 4px; min-width:120px; height:14px; }
  .inp.req { background:#fffbe6; }
  .grid { margin:0 10px; border:1px solid #888; }
  .grid table { border-collapse:collapse; width:100%; }
  .grid th { background:#4a6ea9; color:#fff; border:1px solid #2f4f87; padding:4px; font-weight:600; }
  .grid td { border:1px solid #ccc; padding:3px 5px; background:#fff; height:16px; }
  .grid tr:nth-child(even) td { background:#f3f6fb; }
  .grid td.n { text-align:right; }
  .sum { margin:6px 10px; display:flex; justify-content:flex-end; gap:20px; }
  .sum div { border:1px solid #888; background:#fff; padding:4px 10px; min-width:160px; }
  .sum b { display:inline-block; width:60px; }
  .status { background:#ece9d8; border-top:1px solid #999; padding:3px 8px; margin-top:8px; color:#333; }
  .hint { color:#777; font-size:11px; margin:2px 10px; }
</style></head><body>
<div class="title">한빛ERP v7.2 - [구매관리] 견적등록 (PU-0210)</div>
<div class="menu"><span>파일(F)</span><span>편집(E)</span><span>조회(V)</span><span>구매관리(P)</span><span>도움말(H)</span></div>
<div class="tool"><button>신규</button><button>저장(F8)</button><button>삭제</button><button>조회(F3)</button><button>인쇄</button><button>엑셀붙여넣기</button><button>닫기</button></div>
<div class="crumb">구매관리 &gt; 견적관리 &gt; <b>견적등록</b></div>
<div class="form"><table>
  <tr><th>ERP견적번호</th><td><span class="inp">E20260731 (자동채번)</span></td><th>등록일</th><td><span class="inp">2026-10-01</span></td><th>입력자</th><td><span class="inp">박지훈</span></td></tr>
  <tr><th>협력사코드 *</th><td class="req"><span class="inp req">V1004</span> <span style="color:#36c">[찾기]</span></td><th>협력사명</th><td><span class="inp" style="min-width:200px">${sample.supplier_name}</span></td><th>사업자번호</th><td><span class="inp">${sample.business_number}</span></td></tr>
  <tr><th>견적일자 *</th><td class="req"><span class="inp req">${sample.quote_date}</span></td><th>유효일자 *</th><td class="req"><span class="inp req">${sample.validity.date ?? ""}</span></td><th>협력사견적번호</th><td><span class="inp">${sample.quote_number ?? ""}</span></td></tr>
  <tr><th>협력사담당자</th><td><span class="inp">${sample.contact_name}</span></td><th>연락처</th><td><span class="inp">${sample.contact_phone ?? ""}</span></td><th>통화</th><td><span class="inp" style="min-width:60px">KRW</span> <span style="color:#999">(외화 불가, 원화 환산 입력)</span></td></tr>
  <tr><th>납기</th><td><span class="inp" style="min-width:200px">${sample.delivery_terms}</span></td><th>결제조건</th><td colspan="3"><span class="inp" style="min-width:300px">${sample.payment_terms}</span></td></tr>
  <tr><th>비고</th><td colspan="5"><span class="inp" style="min-width:900px">${sample.note ?? ""}</span></td></tr>
</table></div>
<div class="hint">* 노란색은 필수 입력. 품목 그리드는 엑셀에서 복사한 범위를 [엑셀붙여넣기] 버튼 또는 Ctrl+V로 붙여넣을 수 있음 (열 순서: 품명, 규격, 수량, 단위, 단가)</div>
<div class="grid"><table>
  <tr><th style="width:40px">순번</th><th>품명</th><th>규격</th><th style="width:70px">수량</th><th style="width:50px">단위</th><th style="width:110px">단가</th><th style="width:120px">금액</th><th style="width:160px">품목코드(선택)</th></tr>
  ${sample.items.map((it, i) => `<tr><td class="n">${i + 1}</td><td>${it.name}</td><td>${it.spec}</td><td class="n">${it.qty}</td><td>${it.unit}</td><td class="n">${it.unit_price.toLocaleString("ko-KR")}</td><td class="n">${it.amount.toLocaleString("ko-KR")}</td><td></td></tr>`).join("")}
  ${Array.from({ length: 6 }, (_, i) => `<tr><td class="n">${sample.items.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
</table></div>
<div class="sum">
  <div><b>공급가액</b> ${sample.subtotal.toLocaleString("ko-KR")}</div>
  <div><b>부가세</b> ${sample.vat.toLocaleString("ko-KR")}</div>
  <div><b>합계</b> ${(sample.total).toLocaleString("ko-KR")}</div>
</div>
<div class="status">준비 | 사용자: 박지훈(구매팀) | 서버: HBERP-01 | 2026-10-01 10:42</div>
</body></html>`;
const htmlPath = join(OUT, "erp_quote_entry_mock.html");
writeFileSync(htmlPath, html);
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,760", `--screenshot=${join(OUT, "erp_quote_entry_screen.png")}`, `file://${htmlPath}`], { stdio: "ignore" });
console.log(`rows=${rows.length} -> ${OUT}`);
