// 가상 협력사 견적서 50건 + 정답 데이터 생성기
// 실행: node data/generator/generate.mjs
// 산출물: data/samples/*.pdf, data/ground-truth/*.json, data/manifest.json
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_DIR = join(ROOT, "generator", "html");
const PDF_DIR = join(ROOT, "samples");
const GT_DIR = join(ROOT, "ground-truth");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---------- 시드 고정 난수 (재현 가능) ----------
let seed = 20261022;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

// ---------- 협력사 20곳 (양식 스타일 배정) ----------
const SUPPLIERS = [
  { name: "대성베어링(주)", biz: "124-81-33021", ceo: "박대성", addr: "경기도 안산시 단원구 산단로 163", contact: "이민호 과장", phone: "031-492-7710", email: "mhlee@dsbearing.co.kr", style: "erp", weight: 6 },
  { name: "한국모터텍 주식회사", biz: "220-88-10457", ceo: "정우성", addr: "인천광역시 남동구 남동동로 221", contact: "김수진 대리", phone: "032-818-3302", email: "sjkim@kmotortech.com", style: "erp", weight: 5 },
  { name: "(주)동양밸브", biz: "305-81-02214", ceo: "오동양", addr: "대전광역시 대덕구 대화로 41", contact: "최영호", phone: "042-934-1180", email: "sales@dyvalve.co.kr", style: "excel", weight: 5 },
  { name: "세진산업", biz: "610-12-48855", ceo: "강세진", addr: "부산광역시 사상구 낙동대로 1270", contact: "강세진 대표", phone: "051-316-9920", email: "sejin1270@naver.com", style: "word", weight: 4 },
  { name: "글로벌파츠코리아(주)", biz: "211-87-55310", ceo: "한지원", addr: "서울특별시 강남구 테헤란로 302", contact: "Jiwon Han", phone: "02-561-7000", email: "jhan@globalpartskr.com", style: "import", weight: 4, usd: true },
  { name: "(주)태양정밀", biz: "134-86-20917", ceo: "윤태양", addr: "경기도 화성시 동탄산단4길 22", contact: "윤미래 주임", phone: "031-371-5540", email: "mr.yoon@taeyangpm.co.kr", style: "excel", weight: 3 },
  { name: "서울센서시스템", biz: "105-87-71123", ceo: "임서울", addr: "서울특별시 금천구 가산디지털1로 168", contact: "박찬호 팀장", phone: "02-2026-4410", email: "chpark@seoulsensor.kr", style: "erp", weight: 3 },
  { name: "(주)신일유압", biz: "503-81-44209", ceo: "신일수", addr: "대구광역시 달서구 성서공단로 55", contact: "신재훈 부장", phone: "053-592-3301", email: "jhshin@shinilhyd.co.kr", style: "word", weight: 3 },
  { name: "미래벨트상사", biz: "131-23-77450", ceo: "조미래", addr: "경기도 부천시 오정로 185", contact: "조미래", phone: "032-672-1199", email: "miraebelt@hanmail.net", style: "simple", weight: 3 },
  { name: "(주)코리아기어", biz: "127-81-66203", ceo: "문기어", addr: "경기도 시흥시 공단1대로 204", contact: "문성민 차장", phone: "031-499-8800", email: "smmoon@koreagear.com", style: "excel", weight: 2 },
  { name: "한양공압(주)", biz: "109-81-20335", ceo: "한양수", addr: "서울특별시 성동구 성수이로 118", contact: "김하늘 사원", phone: "02-468-7733", email: "skykim@hypneu.co.kr", style: "erp", weight: 2 },
  { name: "아이티씨인더스트리", biz: "606-86-09981", ceo: "최아이", addr: "부산광역시 강서구 녹산산단27로 60", contact: "최아이 대표", phone: "051-831-2290", email: "itc@itcind.kr", style: "simple", weight: 2 },
  { name: "(주)제일전기산업", biz: "113-81-54420", ceo: "제일호", addr: "서울특별시 구로구 디지털로 288", contact: "이정민 과장", phone: "02-857-6600", email: "jmlee@jeilelec.co.kr", style: "word", weight: 2 },
  { name: "유니온테크 주식회사", biz: "214-87-83307", ceo: "유니온", addr: "서울특별시 송파구 법원로 128", contact: "Daniel Kim", phone: "02-3431-9900", email: "daniel@uniontech.kr", style: "import", weight: 2, usd: true },
  { name: "대한씰링(주)", biz: "312-81-10087", ceo: "대한민", addr: "충청남도 천안시 서북구 2공단3로 77", contact: "홍길순 대리", phone: "041-558-2201", email: "gshong@daehanseal.co.kr", style: "excel", weight: 1 },
  { name: "경인펌프산업", biz: "137-19-32245", ceo: "경인수", addr: "경기도 김포시 양촌읍 황금로 61", contact: "경인수", phone: "031-996-7781", email: "kipump@daum.net", style: "simple", weight: 1 },
  { name: "(주)에스엠커플링", biz: "126-81-90031", ceo: "송민호", addr: "경기도 안양시 동안구 흥안대로 427", contact: "송민호 이사", phone: "031-424-5520", email: "mhsong@smcoupling.co.kr", style: "word", weight: 1 },
  { name: "부산체인공업(주)", biz: "602-81-23381", ceo: "부산호", addr: "부산광역시 사하구 다산로 118", contact: "장동건 과장", phone: "051-262-8800", email: "dgjang@busanchain.com", style: "erp", weight: 1 },
  { name: "넥스트오토메이션", biz: "215-86-44872", ceo: "넥스트", addr: "경기도 성남시 분당구 판교로 242", contact: "오세훈 매니저", phone: "031-8016-2200", email: "sh.oh@nextauto.kr", style: "import", weight: 1, usd: true },
  { name: "(주)광명스프링", biz: "140-81-70562", ceo: "광명수", addr: "경기도 광명시 하안로 60", contact: "배수지 주임", phone: "02-2688-1177", email: "sjbae@kmspring.co.kr", style: "excel", weight: 1 },
];

// ---------- 품목 카탈로그 ----------
const CATALOG = [
  { name: "볼베어링", specs: ["6205ZZ", "6205-2Z", "6206ZZ", "6308-2RS", "6002ZZ", "6304ZZ"], unit: "EA", price: [2800, 18000] },
  { name: "테이퍼롤러베어링", specs: ["30205", "30208", "32210", "32012"], unit: "EA", price: [9000, 65000] },
  { name: "3상 유도전동기", specs: ["2.2kW 4P 220/380V", "3.7kW 4P 380V", "7.5kW 4P 380V", "0.75kW 4P 220V"], unit: "대", price: [180000, 1450000] },
  { name: "기어드모터", specs: ["0.4kW 1/30", "0.75kW 1/20", "1.5kW 1/15"], unit: "대", price: [220000, 780000] },
  { name: "볼밸브", specs: ["1/2\" SUS304", "3/4\" SUS304", "1\" SUS316", "2\" 황동"], unit: "EA", price: [8500, 96000] },
  { name: "게이트밸브", specs: ["50A 10K FC", "80A 10K FC", "100A 10K FC"], unit: "EA", price: [45000, 280000] },
  { name: "솔레노이드밸브", specs: ["2포트 1/4\" DC24V", "5포트 1/8\" AC220V", "3포트 1/4\" DC24V"], unit: "EA", price: [32000, 118000] },
  { name: "근접센서", specs: ["M12 NPN NO 4mm", "M18 PNP NO 8mm", "M8 NPN 2mm"], unit: "EA", price: [14000, 48000] },
  { name: "포토센서", specs: ["투과형 10m", "반사형 2m", "미러반사형 5m"], unit: "EA", price: [25000, 95000] },
  { name: "V벨트", specs: ["A-45", "A-52", "B-60", "B-75"], unit: "EA", price: [3200, 12500] },
  { name: "타이밍벨트", specs: ["300L 075", "420H 100", "510XL 037"], unit: "EA", price: [8000, 42000] },
  { name: "유압실린더", specs: ["Ø50×200ST", "Ø63×300ST", "Ø80×400ST"], unit: "EA", price: [210000, 890000] },
  { name: "유압펌프", specs: ["PV2R1-10", "A10VSO28", "PV2R2-33"], unit: "대", price: [450000, 2900000] },
  { name: "에어실린더", specs: ["Ø32×100ST", "Ø40×150ST", "Ø50×200ST", "Ø63×250ST"], unit: "EA", price: [38000, 165000] },
  { name: "오일씰", specs: ["TC 25×40×7", "TC 35×52×8", "TC 45×62×8"], unit: "EA", price: [1500, 6500] },
  { name: "오링", specs: ["P-20 NBR", "G-45 NBR", "P-32 FKM"], unit: "EA", price: [300, 2800] },
  { name: "플렉시블커플링", specs: ["JAW L095", "JAW L100", "디스크 Ø56"], unit: "EA", price: [28000, 185000] },
  { name: "롤러체인", specs: ["RS40 3m", "RS50 3m", "RS60 3m"], unit: "EA", price: [22000, 78000] },
  { name: "스프로킷", specs: ["RS40 15T", "RS50 20T", "RS60 17T"], unit: "EA", price: [12000, 65000] },
  { name: "압축스프링", specs: ["Ø1.2×12×50", "Ø2.0×20×80", "Ø3.0×30×100"], unit: "EA", price: [800, 4500] },
  { name: "인버터", specs: ["2.2kW 3상 380V", "5.5kW 3상 380V", "0.75kW 단상 220V"], unit: "대", price: [280000, 1250000] },
  { name: "PLC 모듈", specs: ["DI 16점 DC24V", "DO 16점 릴레이", "AI 4ch"], unit: "EA", price: [95000, 420000] },
  { name: "리니어가이드", specs: ["HGH15CA 500L", "HGH20CA 800L", "HGW25CC 1000L"], unit: "SET", price: [85000, 360000] },
];
const USD_CATALOG = [
  { name: "Servo Motor", specs: ["400W 3000rpm w/ brake", "750W 3000rpm", "1.5kW 2000rpm"], unit: "EA", price: [320, 1480] },
  { name: "Servo Drive", specs: ["400W 220V", "750W 220V", "1.5kW 220V"], unit: "EA", price: [410, 1650] },
  { name: "Ball Screw", specs: ["SFU1605 600mm", "SFU2005 800mm", "SFU2510 1000mm"], unit: "EA", price: [85, 420] },
  { name: "Encoder", specs: ["1024ppr Incremental", "2048ppr Incremental", "17bit Absolute"], unit: "EA", price: [120, 690] },
  { name: "Linear Actuator", specs: ["200mm 1000N", "300mm 2000N"], unit: "EA", price: [240, 980] },
  { name: "Industrial Ethernet Switch", specs: ["8-port unmanaged", "8-port managed", "16-port managed"], unit: "EA", price: [150, 1250] },
  { name: "Pressure Transmitter", specs: ["0-10bar 4-20mA", "0-25bar 4-20mA", "0-100bar 4-20mA"], unit: "EA", price: [180, 520] },
];

const PAYMENT_TERMS = ["현금 (납품 후 30일)", "월말 마감 익월 말 현금", "선금 50% / 잔금 납품 후 30일", "납품 후 60일 어음", "현금결제", "월말마감 익월 25일 현금"];
const DELIVERY = ["발주 후 2주", "발주 후 7일 이내", "발주 후 3~4주", "재고분 즉시 출고", "발주 후 10일", "발주 후 4주 (수입품)", "협의"];
const NOTES = ["", "", "", "VAT 별도", "운송비 별도 (착불)", "견적 수량 변경 시 단가 재협의", "포장비 포함", "주문 제작 품목은 취소 불가", ""];

const BUYER = { name: "한빛산업(주)", dept: "구매팀", contact: "박지훈 대리", phone: "02-1588-2700", addr: "서울특별시 영등포구 여의대로 108" };

const fmtKRW = (n) => n.toLocaleString("ko-KR");
const fmtUSD = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateFormats = [
  (d) => iso(d),
  (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
  (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
  (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ---------- 견적 1건 생성 ----------
function makeQuote(idx, supplier) {
  const usd = !!supplier.usd;
  const catalog = usd ? USD_CATALOG : CATALOG;
  const date = addDays(new Date("2026-10-20"), -between(0, 90));
  const dateFmt = pick(dateFormats);
  const quoteNo = pick([
    `Q${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(between(1, 99))}`,
    `${(supplier.email.split("@")[1].split(".")[0]).slice(0, 3).toUpperCase()}-${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}-${String(between(100, 999))}`,
    `EST-${date.getFullYear()}-${String(between(1000, 9999))}`,
    "",
  ]);
  const nItems = rand() < 0.35 ? between(1, 3) : rand() < 0.8 ? between(3, 8) : between(8, 15);
  const items = [];
  const used = new Set();
  const maxItems = Math.min(nItems, catalog.reduce((s, c) => s + c.specs.length, 0));
  for (let i = 0; i < maxItems; i++) {
    let c, spec, key, tries = 0;
    do { c = pick(catalog); spec = pick(c.specs); key = c.name + "|" + spec; tries++; } while (used.has(key) && tries < 50);
    if (used.has(key)) break;
    used.add(key);
    const qty = pick([1, 2, 2, 4, 5, 6, 10, 10, 12, 20, 24, 30, 50, 100, 200]);
    let unitPrice = between(c.price[0], c.price[1]);
    if (usd) unitPrice = Math.round(unitPrice * 100 + rand() * 100) / 100;
    else unitPrice = Math.round(unitPrice / 100) * 100;
    const amount = usd ? Math.round(qty * unitPrice * 100) / 100 : qty * unitPrice;
    items.push({ name: c.name, spec, qty, unit: c.unit, unitPrice, amount });
  }
  const subtotal = usd ? Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100 : items.reduce((s, it) => s + it.amount, 0);
  const vat = usd ? null : Math.round(subtotal * 0.1);
  const total = usd ? subtotal : subtotal + vat;

  // 유효기간: 날짜형 vs 상대표현
  const validDays = pick([14, 30, 30, 30, 60, 90]);
  const validityRelative = rand() < 0.45;
  const validityText = validityRelative
    ? pick([`견적일로부터 ${validDays}일`, `${validDays}일`, `발행일로부터 ${validDays}일간 유효`])
    : dateFmt(addDays(date, validDays));

  const fxRate = usd ? pick([null, null, 1385.2, 1392.5, 1401.0]) : null;
  const fxNote = usd
    ? fxRate
      ? `환율 적용 기준: ${fxRate.toFixed(1)} KRW/USD (견적일 기준, 참고용). 원화 환산액은 발주일 매매기준율로 재산정.`
      : "USD 견적. 원화 환산은 발주일 서울외국환중개 매매기준율 적용. 부가세 및 관세 별도."
    : null;

  const id = `Q${String(idx + 1).padStart(3, "0")}`;
  const quote = {
    id,
    supplier,
    quoteNo,
    date,
    dateText: dateFmt(date),
    validityText,
    validityDate: validityRelative ? null : iso(addDays(date, validDays)),
    validDays,
    validityRelative,
    items,
    subtotal, vat, total,
    currency: usd ? "USD" : "KRW",
    fxRate, fxNote,
    payment: pick(PAYMENT_TERMS),
    delivery: pick(DELIVERY),
    note: pick(NOTES),
    showBiz: rand() < 0.85,
    showQuoteNo: !!quoteNo,
    contactMode: pick(["phone", "email", "both", "both"]),
  };
  return quote;
}

// ---------- 정답 데이터 ----------
function groundTruth(q) {
  const s = q.supplier;
  return {
    id: q.id,
    file: `${q.id}.pdf`,
    supplier_name: s.name,
    business_number: q.showBiz ? s.biz : null,
    quote_number: q.showQuoteNo ? q.quoteNo : null,
    quote_date: iso(q.date),
    validity: q.validityRelative ? { type: "relative", days: q.validDays, text: q.validityText } : { type: "date", date: q.validityDate, text: q.validityText },
    contact_name: s.contact,
    contact_phone: q.contactMode === "email" ? null : s.phone,
    contact_email: q.contactMode === "phone" ? null : s.email,
    delivery_terms: q.delivery,
    payment_terms: q.payment,
    currency: q.currency,
    fx_rate: q.fxRate,
    // 공문형(word)·간이형(simple) 양식은 단위 열을 인쇄하지 않으므로 정답도 null (문서에 없는 정보를 정답으로 요구하면 안 됨)
    items: q.items.map((it) => ({ name: it.name, spec: it.spec, qty: it.qty, unit: s.style === "word" || s.style === "simple" ? null : it.unit, unit_price: it.unitPrice, amount: it.amount })),
    subtotal: q.subtotal,
    vat: q.vat,
    total: q.total,
    note: q.note || null,
    _meta: { style: s.style, item_count: q.items.length },
  };
}

// ---------- HTML 템플릿 ----------
const BASE_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; color: #111; font-size: 11pt; margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .c { text-align: center; }
`;
const money = (q, n) => (q.currency === "USD" ? `$${fmtUSD(n)}` : fmtKRW(n));
const contactLine = (q) => {
  const s = q.supplier;
  if (q.contactMode === "phone") return `${s.contact} / TEL ${s.phone}`;
  if (q.contactMode === "email") return `${s.contact} / ${s.email}`;
  return `${s.contact} / TEL ${s.phone} / ${s.email}`;
};
const itemRows = (q, withUnit = true, withNo = true) => q.items.map((it, i) => `
  <tr>${withNo ? `<td class="c">${i + 1}</td>` : ""}<td>${it.name}</td><td>${it.spec}</td><td class="num">${it.qty}</td>${withUnit ? `<td class="c">${it.unit}</td>` : ""}<td class="num">${money(q, it.unitPrice)}</td><td class="num">${money(q, it.amount)}</td></tr>`).join("");

const TEMPLATES = {
  // 1. ERP 출력 스타일: 격식, 테두리 꽉 찬 표
  erp: (q) => `<style>${BASE_CSS}
    h1 { text-align:center; letter-spacing: 14px; font-size: 22pt; margin: 0 0 14px; }
    .head td { border: 1px solid #444; padding: 4px 8px; font-size: 10pt; }
    .head th { border: 1px solid #444; background: #eee; padding: 4px 8px; font-size: 10pt; font-weight: 600; width: 90px; }
    .items th { border: 1px solid #444; background: #e4e4e4; padding: 5px; font-size: 10pt; }
    .items td { border: 1px solid #444; padding: 5px; font-size: 10pt; }
    .tot td { font-weight: 700; background: #f7f7f7; }
    .foot { margin-top: 14px; font-size: 10pt; }
    .foot td { padding: 3px 0; vertical-align: top; }
    .stamp { float:right; border: 2px solid #c33; color:#c33; border-radius: 50%; width:54px; height:54px; line-height:54px; text-align:center; font-size:9pt; margin-top:-8px; }
  </style>
  <h1>견 적 서</h1>
  <table class="head"><tr>
    <td style="width:50%; border:none; padding:0; vertical-align:top">
      <table class="head">
        <tr><th>수 신</th><td>${BUYER.name} ${BUYER.dept} 귀중</td></tr>
        <tr><th>담 당</th><td>${BUYER.contact}</td></tr>
        <tr><th>견적일자</th><td>${q.dateText}</td></tr>
        ${q.showQuoteNo ? `<tr><th>견적번호</th><td>${q.quoteNo}</td></tr>` : ""}
        <tr><th>유효기간</th><td>${q.validityText}</td></tr>
      </table>
    </td>
    <td style="width:50%; border:none; padding:0 0 0 8px; vertical-align:top">
      <table class="head">
        <tr><th>공급자</th><td>${q.supplier.name} <span class="stamp">인</span></td></tr>
        ${q.showBiz ? `<tr><th>등록번호</th><td>${q.supplier.biz}</td></tr>` : ""}
        <tr><th>대표자</th><td>${q.supplier.ceo}</td></tr>
        <tr><th>주 소</th><td>${q.supplier.addr}</td></tr>
        <tr><th>담당자</th><td>${contactLine(q)}</td></tr>
      </table>
    </td></tr></table>
  <p style="margin:14px 0 6px">아래와 같이 견적합니다.</p>
  <table class="items">
    <tr><th style="width:5%">No</th><th>품 명</th><th>규 격</th><th style="width:8%">수량</th><th style="width:7%">단위</th><th style="width:14%">단 가</th><th style="width:16%">금 액</th></tr>
    ${itemRows(q)}
    <tr class="tot"><td colspan="6" class="c">공급가액</td><td class="num">${money(q, q.subtotal)}</td></tr>
    ${q.vat !== null ? `<tr class="tot"><td colspan="6" class="c">부가세</td><td class="num">${money(q, q.vat)}</td></tr>` : ""}
    <tr class="tot"><td colspan="6" class="c">합 계</td><td class="num">${money(q, q.total)}</td></tr>
  </table>
  <table class="foot">
    <tr><td style="width:90px">납 기</td><td>${q.delivery}</td></tr>
    <tr><td>결제조건</td><td>${q.payment}</td></tr>
    ${q.fxNote ? `<tr><td>환율</td><td>${q.fxNote}</td></tr>` : ""}
    ${q.note ? `<tr><td>비 고</td><td>${q.note}</td></tr>` : ""}
  </table>`,

  // 2. 엑셀 스타일: 가는 선, 글씨 작음, 합계가 위에 "합계금액: 일금 ..." 형식
  excel: (q) => `<style>${BASE_CSS}
    body { font-size: 10pt; }
    .title { font-size: 20pt; font-weight: 700; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: 10px; }
    .meta td { padding: 2px 6px; font-size: 9.5pt; }
    .sum { border: 1px solid #000; padding: 6px 10px; margin: 10px 0; font-weight: 700; font-size: 11pt; }
    .items th, .items td { border: 1px solid #999; padding: 4px; font-size: 9.5pt; }
    .items th { background: #dde8f5; }
    .items tfoot td { background: #f2f2f2; font-weight: 600; }
    .cond { margin-top: 12px; font-size: 9.5pt; line-height: 1.6; }
  </style>
  <div class="title">견적서 (QUOTATION)</div>
  <table class="meta"><tr>
    <td style="width:50%; vertical-align:top">
      <b>${BUYER.name} ${BUYER.dept} 귀하</b><br>참조: ${BUYER.contact}<br>
      견적일: ${q.dateText}${q.showQuoteNo ? `<br>견적No: ${q.quoteNo}` : ""}<br>유효기간: ${q.validityText}
    </td>
    <td style="width:50%; vertical-align:top">
      <b>${q.supplier.name}</b>${q.showBiz ? ` (사업자번호 ${q.supplier.biz})` : ""}<br>
      ${q.supplier.addr}<br>담당: ${contactLine(q)}
    </td></tr></table>
  <div class="sum">합계금액: 일금 ${q.currency === "USD" ? `US$ ${fmtUSD(q.total)} (부가세 별도)` : `${fmtKRW(q.total)}원정 (부가세 포함)`}</div>
  <table class="items">
    <thead><tr><th>NO</th><th>품명</th><th>규격</th><th>수량</th><th>단위</th><th>단가</th><th>금액</th></tr></thead>
    <tbody>${itemRows(q)}</tbody>
    <tfoot>
      <tr><td colspan="6" class="num">소계 (공급가액)</td><td class="num">${money(q, q.subtotal)}</td></tr>
      ${q.vat !== null ? `<tr><td colspan="6" class="num">V.A.T (10%)</td><td class="num">${money(q, q.vat)}</td></tr>` : ""}
      <tr><td colspan="6" class="num">TOTAL</td><td class="num">${money(q, q.total)}</td></tr>
    </tfoot>
  </table>
  <div class="cond">
    ■ 납기: ${q.delivery}<br>■ 결제: ${q.payment}<br>
    ${q.fxNote ? `■ ${q.fxNote}<br>` : ""}${q.note ? `■ 비고: ${q.note}<br>` : ""}
  </div>`,

  // 3. 워드 스타일: 공문 형식, 서술형 문장, 표가 단순
  word: (q) => `<style>${BASE_CSS}
    body { font-size: 11.5pt; line-height: 1.7; }
    .top { text-align:center; font-size: 18pt; font-weight: 700; margin-bottom: 20px; text-decoration: underline; }
    .items th, .items td { border-bottom: 1px solid #333; padding: 4px 6px; font-size: 10.5pt; }
    .items th { border-top: 2px solid #000; border-bottom: 1px solid #000; }
    .items tr:last-child td { border-bottom: 2px solid #000; }
    .right { text-align: right; }
    .sig { margin-top: 30px; text-align: right; }
  </style>
  <div class="top">견 적 서</div>
  <p>수신: ${BUYER.name} ${BUYER.dept} ${BUYER.contact}<br>발신: ${q.supplier.name} ${q.supplier.contact}<br>일자: ${q.dateText}${q.showQuoteNo ? `<br>문서번호: ${q.quoteNo}` : ""}</p>
  <p>귀사의 일익 번창하심을 기원합니다. 문의하신 품목에 대하여 아래와 같이 견적을 드리오니 검토 부탁드립니다.</p>
  <table class="items">
    <tr><th>품명</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr>
    ${itemRows(q, false, false)}
  </table>
  <p class="right">공급가액 ${money(q, q.subtotal)}${q.vat !== null ? ` / 부가세 ${money(q, q.vat)}` : ""} / <b>합계 ${money(q, q.total)}${q.currency === "USD" ? " (VAT 별도)" : "원"}</b></p>
  <p>1. 유효기간: ${q.validityText}<br>2. 납기: ${q.delivery}<br>3. 결제조건: ${q.payment}${q.fxNote ? `<br>4. ${q.fxNote}` : ""}${q.note ? `<br>${q.fxNote ? 5 : 4}. ${q.note}` : ""}</p>
  <div class="sig">${q.supplier.name}<br>대표이사 ${q.supplier.ceo} (인)<br>${q.showBiz ? `사업자등록번호 ${q.supplier.biz}<br>` : ""}${q.supplier.addr}<br>담당 ${contactLine(q)}</div>`,

  // 4. 간이 양식: 소규모 업체, 정보 최소, 레이아웃 느슨
  simple: (q) => `<style>${BASE_CSS}
    body { font-size: 11pt; }
    h2 { margin: 0 0 4px; }
    .box { border: 1px solid #000; padding: 8px 12px; margin-bottom: 10px; }
    .items td, .items th { padding: 5px 4px; border-bottom: 1px dashed #777; font-size: 10.5pt; }
    .items th { border-bottom: 1px solid #000; text-align: left; }
    .big { font-size: 14pt; font-weight: 700; margin-top: 10px; }
  </style>
  <h2>견적서</h2>
  <div style="font-size:10pt; margin-bottom:10px">${q.dateText}${q.showQuoteNo ? ` &nbsp;|&nbsp; No. ${q.quoteNo}` : ""}</div>
  <div class="box">
    <b>${q.supplier.name}</b>${q.showBiz ? ` &nbsp; ${q.supplier.biz}` : ""}<br>
    ${q.supplier.addr}<br>${contactLine(q)}
  </div>
  <div style="margin-bottom:8px">TO: ${BUYER.name} ${BUYER.contact}님</div>
  <table class="items">
    <tr><th>품목</th><th>규격</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th></tr>
    ${itemRows(q, false, false)}
  </table>
  <div class="big">공급가 ${money(q, q.subtotal)}${q.vat !== null ? ` + 부가세 ${money(q, q.vat)}` : ""} = ${money(q, q.total)}${q.currency === "USD" ? "" : "원"}</div>
  <p style="font-size:10.5pt; margin-top:14px">* 유효기간 ${q.validityText}<br>* 납기 ${q.delivery}<br>* ${q.payment}${q.fxNote ? `<br>* ${q.fxNote}` : ""}${q.note ? `<br>* ${q.note}` : ""}</p>`,

  // 5. 수입업체 스타일: 영문 혼용, USD
  import: (q) => `<style>${BASE_CSS}
    body { font-size: 10.5pt; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2px solid #1a3c6e; padding-bottom: 10px; margin-bottom: 12px; }
    .logo { font-size: 16pt; font-weight: 800; color: #1a3c6e; letter-spacing: 1px; }
    .q { font-size: 20pt; font-weight: 300; text-align:right; }
    .meta td { padding: 2px 8px 2px 0; font-size: 10pt; }
    .items th { background: #1a3c6e; color: #fff; padding: 6px 5px; font-size: 9.5pt; }
    .items td { padding: 5px; border-bottom: 1px solid #ccc; font-size: 9.5pt; }
    .tot { margin-top: 10px; margin-left:auto; width: 45%; }
    .tot td { padding: 4px 8px; font-size: 10.5pt; }
    .tot tr:last-child td { border-top: 2px solid #1a3c6e; font-weight: 700; font-size: 12pt; }
    .terms { margin-top: 16px; font-size: 9.5pt; color: #333; line-height: 1.6; }
  </style>
  <div class="hdr">
    <div><div class="logo">${q.supplier.name}</div><div style="font-size:9.5pt">${q.supplier.addr}<br>${q.showBiz ? `Biz Reg. No. ${q.supplier.biz} &nbsp;` : ""}TEL ${q.supplier.phone}</div></div>
    <div class="q">QUOTATION<br><span style="font-size:10pt">견적서</span></div>
  </div>
  <table class="meta"><tr>
    <td style="width:50%; vertical-align:top"><b>Bill To / 수신</b><br>${BUYER.name} ${BUYER.dept}<br>Attn: ${BUYER.contact}<br>${BUYER.addr}</td>
    <td style="vertical-align:top">
      <b>Date / 견적일:</b> ${q.dateText}<br>
      ${q.showQuoteNo ? `<b>Quote No.:</b> ${q.quoteNo}<br>` : ""}
      <b>Valid Until / 유효기간:</b> ${q.validityText}<br>
      <b>Currency:</b> ${q.currency}<br>
      <b>Sales Rep / 담당:</b> ${contactLine(q)}
    </td></tr></table>
  <table class="items" style="margin-top:12px">
    <tr><th>#</th><th>Description / 품명</th><th>Spec / 규격</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th></tr>
    ${itemRows(q)}
  </table>
  <table class="tot">
    <tr><td>Subtotal / 공급가액</td><td class="num">${money(q, q.subtotal)}</td></tr>
    ${q.vat !== null ? `<tr><td>VAT 10%</td><td class="num">${money(q, q.vat)}</td></tr>` : `<tr><td>VAT</td><td class="num">별도 (Excluded)</td></tr>`}
    <tr><td>Total</td><td class="num">${money(q, q.total)}</td></tr>
  </table>
  <div class="terms">
    <b>Terms &amp; Conditions</b><br>
    Lead time / 납기: ${q.delivery}<br>Payment / 결제조건: ${q.payment}<br>
    ${q.fxNote ? `FX: ${q.fxNote}<br>` : ""}${q.note ? `Remarks: ${q.note}<br>` : ""}
  </div>`,
};

// ---------- 메인 ----------
function main() {
  rmSync(HTML_DIR, { recursive: true, force: true });
  rmSync(PDF_DIR, { recursive: true, force: true });
  rmSync(GT_DIR, { recursive: true, force: true });
  mkdirSync(HTML_DIR, { recursive: true });
  mkdirSync(PDF_DIR, { recursive: true });
  mkdirSync(GT_DIR, { recursive: true });

  // 가중치 기반 협력사 배정 (자주 거래하는 곳이 많이 나오게), 달러 건은 5건으로 고정
  const weighted = SUPPLIERS.flatMap((s) => Array(s.weight).fill(s));
  const usdSuppliers = SUPPLIERS.filter((s) => s.usd);
  const krwWeighted = weighted.filter((s) => !s.usd);
  const picks = [];
  for (let i = 0; i < 45; i++) picks.push(pick(krwWeighted));
  for (let i = 0; i < 5; i++) picks.push(pick(usdSuppliers));
  // 섞기
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }

  const manifest = [];
  picks.forEach((supplier, idx) => {
    const q = makeQuote(idx, supplier);
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${q.id}</title></head><body>${TEMPLATES[supplier.style](q)}</body></html>`;
    const htmlPath = join(HTML_DIR, `${q.id}.html`);
    const pdfPath = join(PDF_DIR, `${q.id}.pdf`);
    writeFileSync(htmlPath, html);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "ignore" });
    const gt = groundTruth(q);
    writeFileSync(join(GT_DIR, `${q.id}.json`), JSON.stringify(gt, null, 2));
    manifest.push({ id: q.id, file: gt.file, supplier: supplier.name, style: supplier.style, currency: q.currency, items: q.items.length, date: gt.quote_date });
    process.stdout.write(`${q.id} ${supplier.style.padEnd(6)} ${q.currency} items=${String(q.items.length).padStart(2)} ${supplier.name}\n`);
  });
  writeFileSync(join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n생성 완료: PDF ${manifest.length}건 -> ${PDF_DIR}`);
}
main();
