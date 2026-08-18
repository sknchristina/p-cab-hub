#!/usr/bin/env node
/**
 * P-CAB Intelligence Hub — 빌드 스크립트
 *
 *   Notion DB  →  분류·집계  →  content/narrative.json 병합  →  dist/index.html
 *
 * 환경변수
 *   NOTION_TOKEN        Notion 내부 통합 시크릿 (필수)
 *   NOTION_DATA_SOURCE  데이터소스 ID (필수)
 *   SNAPSHOT_DATE       기준일 강제 지정 (선택, 기본값 = 오늘)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist");

const TOKEN = process.env.NOTION_TOKEN;
const DS = process.env.NOTION_DATA_SOURCE;
const TODAY = process.env.SNAPSHOT_DATE || new Date().toISOString().slice(0, 10);

/* ══════════════════════ 1. Notion 수집 ══════════════════════ */

async function fetchAll() {
  const cache = path.join(ROOT, "content", "snapshot.json");
  if (!TOKEN || !DS) {
    if (fs.existsSync(cache)) {
      console.warn("⚠ NOTION_TOKEN/NOTION_DATA_SOURCE 미설정 — 캐시 스냅샷으로 빌드합니다.");
      return JSON.parse(fs.readFileSync(cache, "utf8"));
    }
    throw new Error("NOTION_TOKEN 과 NOTION_DATA_SOURCE 환경변수가 필요합니다.");
  }

  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${DS}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const j = await res.json();
    rows.push(...j.results.map(normalize));
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);

  console.log(`✓ Notion에서 ${rows.length}건 수집`);
  fs.writeFileSync(cache, JSON.stringify(rows));
  return rows;
}

const plain = (p) =>
  !p ? "" :
  p.type === "title" ? p.title.map((t) => t.plain_text).join("") :
  p.type === "rich_text" ? p.rich_text.map((t) => t.plain_text).join("") :
  p.type === "select" ? (p.select?.name ?? "") :
  p.type === "url" ? (p.url ?? "") :
  p.type === "date" ? (p.date?.start ?? "") : "";

function normalize(page) {
  const p = page.properties;
  return {
    t: plain(p["제목"]),
    a: plain(p["저자"]),
    j: plain(p["저널정보"]),
    pd: plain(p["출판일자"]),
    rd: plain(p["등록일"]),
    c: plain(p["카테고리"]) || "미분류",
    ty: plain(p["자료유형"]) || "etc.",
    s: plain(p["초록요약"]),
    id: plain(p["PMID_DOI"]),
    u: plain(p["링크"]),
  };
}

/* ══════════════════════ 2. 분류 규칙 ══════════════════════ */

const DRUGS = {
  vonoprazan: "보노프라잔", tegoprazan: "테고프라잔", fexuprazan: "펙수프라잔",
  keverprazan: "케베프라잔", zastaprazan: "자스타프라잔", anaprazole: "아나프라졸",
  revaprazan: "레바프라잔", soraprazan: "소라프라잔", linaprazan: "리나프라잔",
  "jp-1366": "자스타프라잔",
};
const DRUGS_KO = ["보노프라잔", "테고프라잔", "펙수프라잔", "케베프라잔", "케베르프라잔",
  "자스타프라잔", "아나프라졸", "레바프라잔", "리나프라잔"];
const FIX = { 케베르프라잔: "케베프라잔" };

const PPI_KEYS = ["ppi", "proton pump inhibitor", "esomeprazole", "omeprazole", "lansoprazole",
  "rabeprazole", "pantoprazole", "dexlansoprazole", "ilaprazole", "프로톤펌프", "양성자펌프",
  "에소메프라졸", "오메프라졸", "란소프라졸", "라베프라졸", "판토프라졸", "일라프라졸",
  "산분비억제", "산억제"];

const SAFE_KEYS = ["safety", "adverse", "이상반응", "안전성", "부작용", "risk of", "위험",
  "hypergastrin", "고가스트린", "gastrin", "가스트린", "fracture", "골절", "dementia", "치매",
  "kidney", "renal", "신장", "신손상", "pneumonia", "폐렴", "clostridi", "c. difficile",
  "gastric cancer", "위암", "polyp", "용종", "atroph", "위축", "hypomagnes", "저마그네슘",
  "magnesium", "vitamin b12", "osteoporo", "골다공", "mortality", "사망", "cardiovascular",
  "심혈관", "sibo", "microbiome", "미생물", "장내세균", "drug interaction", "약물상호작용",
  "clopidogrel", "클로피도그렐", "hepato", "간독성", "liver injury", "carcinoid", "ecl",
  "neuroendocrine", "신경내분비", "tolerability", "내약성", "discontinu", "중단", "withdrawal",
  "반동", "rebound", "pharmacovigilance", "약물감시", "faers", "부작용보고"];

const AREAS = [
  ["미란성 식도염 치료", ["erosive esophagitis", "erosive reflux", "미란성 식도염", "미란성식도염",
    "erosive gerd", "los angeles grade", "mucosal break", "esophagitis healing", "reflux esophagitis"]],
  ["비미란성 역류질환(NERD)·증상조절", ["non-erosive", "nonerosive", " nerd", "비미란성",
    "heartburn", "가슴쓰림", "reflux symptom", "역류 증상"]],
  ["유지요법", ["maintenance therapy", "maintenance treatment", "유지요법", "유지 요법",
    "on-demand", "on demand", "relapse", "재발 예방", "재발률"]],
  ["H. pylori 제균 병용", ["eradication", "제균", "helicobacter", "h. pylori", "triple therapy",
    "quadruple therapy", "삼제요법", "사제요법"]],
  ["소화성궤양 치료", ["peptic ulcer", "gastric ulcer", "duodenal ulcer", "위궤양", "십이지장궤양",
    "소화성궤양", "소화성 궤양"]],
  ["NSAID 관련 위장관 보호", ["nsaid", "aspirin", "antiplatelet", "anticoagulant", "항혈소판",
    "항응고", "아스피린", "gastroprotect", "위장관 보호", "위점막 보호", "dapt"]],
  ["상부위장관 출혈·ESD 후 궤양", ["gastrointestinal bleeding", "upper gi bleeding", "위장관 출혈",
    "위장관출혈", "endoscopic submucosal dissection", "post-esd", "rebleeding", "재출혈",
    "출혈 위험", "hemorrhage"]],
  ["안전성·장기투여", ["long-term safety", "장기 안전성", "hypergastrinemia", "고가스트린",
    "gastrin", "adverse event profile", "이상반응 프로파일", "enterochromaffin", "위점막 변화",
    "atrophic gastritis", "위축성 위염", "fundic gland polyp", "안전성 프로파일", "장기 투여",
    "장기투여", "chronic use", "long-term use"]],
  ["약동학·약력학·DDI", ["pharmacokinetic", "pharmacodynamic", "cyp2c19", "cyp3a",
    "drug-drug interaction", "drug interaction", "약물상호작용", "약동학", "약력학",
    "ph holding", "intragastric ph", "위내 ph", "산분비 억제", "acid suppression",
    "bioequivalence", "생물학적 동등성"]],
  ["식도외 증상·기타 적응증", ["laryngopharyngeal", "extraesophageal", "chronic cough", "asthma",
    "globus", "인후두", "식도외", "barrett", "functional dyspepsia", "기능성 소화불량"]],
];

const HIGH = new Set(["Guideline", "NMA", "Meta", "Systematic Review"]);

function tag(rows) {
  for (const r of rows) {
    const blob = `${r.t} ${r.s} ${r.j}`.toLowerCase();
    const set = new Set();
    for (const [en, ko] of Object.entries(DRUGS)) if (blob.includes(en)) set.add(ko);
    for (const ko of DRUGS_KO) if (blob.includes(ko.toLowerCase())) set.add(FIX[ko] || ko);
    r.d = [...set].sort();
    r.p = r.d.length > 0 || ["p-cab", "pcab", "potassium-competitive", "칼륨 경쟁적", "칼륨경쟁적"]
      .some((k) => blob.includes(k)) ? 1 : 0;
    const ab = `${r.t} ${r.s}`.toLowerCase();
    r.ar = AREAS.filter(([, kws]) => kws.some((k) => ab.includes(k))).map(([n]) => n);
    r.isPPI = PPI_KEYS.some((k) => ab.includes(k));
    r.isSafe = SAFE_KEYS.some((k) => ab.includes(k));
  }
  return rows;
}

/* ══════════════════════ 3. 집계 ══════════════════════ */

const cnt = (arr) => arr.reduce((m, k) => (m.set(k, (m.get(k) || 0) + 1), m), new Map());
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ---- PubMed E-utilities (DB 미등록 가이드라인 보강용) ---- */
async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

function normalizePubDate(s) {
  if (!s) return "";
  const MON = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const m = s.match(/(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/);
  if (!m) return "";
  const [, y, mon, day] = m;
  return `${y}-${mon ? (MON[mon] || "01") : "01"}-${day ? day.padStart(2, "0") : "01"}`;
}

/* efetch(rettype=abstract) 텍스트에서 PMID별 초록 본문을 추출 */
function parseAbstracts(text) {
  const out = {};
  const parts = text.split(/\nPMID:\s*(\d+)\.?/);
  for (let i = 0; i < parts.length - 1; i += 2) {
    const id = parts[i + 1].trim();
    const blocks = parts[i].split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
    const aIdx = blocks.findIndex((b) => /^abstract$/i.test(b));
    out[id] = aIdx !== -1
      ? blocks.slice(aIdx + 1).join(" ")
      : blocks.reduce((a, b) => (b.length > a.length ? b : a), "");
  }
  return out;
}

/* PubMed에서 term 조건에 맞는 최신 문헌을 검색해 가이드라인 카드 형태로 반환.
   Notion DB에 등록되지 않은 최신 국내외 가이드라인도 항상 노출하기 위한 보강 로직.
   네트워크 오류·타임아웃 시 빈 배열을 반환해 빌드가 죽지 않도록 함. */
async function fetchPubmedGuidelines(term, limit, nar) {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  try {
    const esUrl = `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&sort=pub+date&tool=p-cab-hub-build&term=${encodeURIComponent(term)}`;
    const esJson = await (await fetchWithTimeout(esUrl)).json();
    const ids = esJson.esearchresult?.idlist ?? [];
    if (!ids.length) return [];

    const suUrl = `${base}/esummary.fcgi?db=pubmed&retmode=json&tool=p-cab-hub-build&id=${ids.join(",")}`;
    const suJson = await (await fetchWithTimeout(suUrl)).json();

    let abstracts = {};
    try {
      const efUrl = `${base}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=text&tool=p-cab-hub-build&id=${ids.join(",")}`;
      abstracts = parseAbstracts(await (await fetchWithTimeout(efUrl)).text());
    } catch { /* 초록 수집 실패 시 제목만으로 진행 */ }

    return ids.map((id) => {
      const s = suJson.result?.[id];
      if (!s || !s.title) return null;
      const abs = abstracts[id] || "";
      const note = nar.guidelineNotes?.[`PMID:${id}`]
        ?? (abs ? abs.split(/(?<=다)\.\s|(?<=음)\.\s|\.\s/).slice(0, 2).join(". ")
                : "PubMed 초록 수집에 실패했습니다 — 문서 바로가기에서 원문을 확인해주세요.");
      return {
        t: s.title.replace(/\.$/, ""),
        j: s.fulljournalname || s.source || "",
        pd: normalizePubDate(s.pubdate || s.sortpubdate),
        u: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        drugs: [], zas: false, note, pmid: id,
      };
    }).filter(Boolean);
  } catch (e) {
    console.warn(`⚠ PubMed 가이드라인 수집 실패 (${e.message}) — DB 등록분만 표시합니다.`);
    return [];
  }
}

async function analyze(rows, nar) {
  const pcab = rows.filter((r) => r.p);
  const win = [addDays(TODAY, -10), TODAY];

  /* ---- Weekly (최근 10일 출판, P-CAB 또는 PPI 관련) ---- */
  const seen = new Set();
  let dup = 0;
  const weekly = rows
    .filter((r) => r.pd >= win[0] && r.pd <= win[1] && (r.p || r.isPPI))
    .sort((a, b) => b.pd.localeCompare(a.pd))
    .filter((r) => {
      const k = r.t.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 70);
      if (seen.has(k)) { dup++; return false; }
      seen.add(k); return true;
    })
    .map((r) => {
      const pmid = (r.id.match(/(\d{7,9})/) || [])[1];
      const sum = nar.weeklySummaries?.[`PMID:${pmid}`] ?? nar.weeklySummaries?.[r.t.slice(0, 60)]
        ?? r.s.split(/(?<=다)\.\s|\.\s/).slice(0, 2).join(". ");
      return { ...r, sum };
    });

  /* ---- Guidelines (GERD · H.pylori 최신 가이드라인) ---- */
  const pmidOf = (r) => (r.id.match(/(\d{7,9})/) || [])[1];
  const guideList = (test) => rows
    .filter((r) => r.ty === "Guideline" && test(r))
    .sort((a, b) => b.pd.localeCompare(a.pd))
    .map((r) => {
      const pmid = pmidOf(r);
      const note = nar.guidelineNotes?.[`PMID:${pmid}`] ?? nar.guidelineNotes?.[r.t.slice(0, 60)]
        ?? r.s.split(/(?<=다)\.\s|(?<=음)\.\s|\.\s/).slice(0, 2).join(". ");
      // 바로가기는 PMID가 있으면 항상 PubMed로 연결, 없을 때만 등록된 링크(u) 사용
      const u = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : r.u;
      return { t: r.t, j: r.j, pd: r.pd, u, drugs: r.d,
               zas: r.d.includes("자스타프라잔"), note, pmid };
    });
  const isGerd = (r) => r.c === "GERD" || r.ar.includes("미란성 식도염 치료")
    || r.ar.includes("비미란성 역류질환(NERD)·증상조절");
  const isHp = (r) => r.c === "Helicobacter pylori" || r.ar.includes("H. pylori 제균 병용");

  const gerdFromDb = guideList(isGerd);
  const hpFromDb = guideList(isHp);

  // Notion DB에 없는 최신 국내외 GERD 가이드라인을 PubMed에서 직접 보강
  const GERD_PUBMED_QUERY = '(("gastroesophageal reflux"[MeSH Terms] OR "gastroesophageal reflux disease"[Title] '
    + 'OR GERD[Title]) AND (guideline[Publication Type] OR practice guideline[Publication Type] '
    + 'OR consensus development conference[Publication Type]))';
  const gerdDbPmids = new Set(gerdFromDb.map((g) => g.pmid).filter(Boolean));
  const gerdFromPubmed = (await fetchPubmedGuidelines(GERD_PUBMED_QUERY, 15, nar))
    .filter((g) => !gerdDbPmids.has(g.pmid));

  const stripPmid = ({ pmid, ...g }) => g;
  const gerd = [...gerdFromDb, ...gerdFromPubmed]
    .sort((a, b) => (b.pd || "").localeCompare(a.pd || ""))
    .slice(0, 20)
    .map(stripPmid);
  const guidelines = { gerd, hp: hpFromDb.map(stripPmid) };


  /* ---- News Archive (완료 연도는 연간, 진행 중인 올해는 분기) ---- */
  const CUR_YEAR = +TODAY.slice(0, 4);
  const Q = new Map();
  for (const r of rows) {
    if (!r.pd || r.pd.slice(0, 7) > TODAY.slice(0, 7) || r.pd < "2024-01-01") continue;
    const y = +r.pd.slice(0, 4);
    const k = y < CUR_YEAR ? `${y}` : `${y} Q${Math.floor((+r.pd.slice(5, 7) - 1) / 3) + 1}`;
    if (!Q.has(k)) Q.set(k, []);
    Q.get(k).push(r);
  }
  const QM = { 1: "1~3월", 2: "4~6월", 3: "7~9월", 4: "10~12월" };
  const ORD = { Guideline: 0, NMA: 1, Meta: 2, "Systematic Review": 3 };
  const TYKO = { Guideline: "가이드라인", NMA: "NMA", Meta: "메타분석",
    "Systematic Review": "체계적 문헌고찰", RCT: "RCT", Review: "종설", "etc.": "기타" };

  const archive = [...Q.keys()].sort().reverse().map((k) => {
    const s = Q.get(k), p = s.filter((r) => r.p);
    const hiList = s.filter((r) => HIGH.has(r.ty)).sort((a, b) => (ORD[a.ty] ?? 9) - (ORD[b.ty] ?? 9));
    const rct = s.filter((r) => r.ty === "RCT").length;
    const cats = top(cnt(s.map((r) => r.c)), 3);
    const drugs = top(cnt(p.flatMap((r) => r.d)), 4);
    const areas = top(cnt(p.flatMap((r) => r.ar)), 3);
    const isAnnual = /^\d{4}$/.test(k);
    const yr = k.slice(0, 4);
    let period;
    if (isAnnual) {
      period = `${yr}년`;
    } else {
      const q = +k.slice(-1);
      const partial = k === `${TODAY.slice(0, 4)} Q${Math.floor((+TODAY.slice(5, 7) - 1) / 3) + 1}`;
      period = `${yr}년 ${QM[q]}${partial ? ` (${+TODAY.slice(5, 7)}월까지)` : ""}`;
    }
    const pct = Math.round((p.length / s.length) * 100);
    const gl = s.filter((r) => r.ty === "Guideline").length;
    const nma = s.filter((r) => r.ty === "NMA").length;
    const meta = s.filter((r) => r.ty === "Meta" || r.ty === "Systematic Review").length;
    const chipsB = [];
    if (gl) chipsB.push([`${gl}건`, "가이드라인"]);
    if (nma) chipsB.push([`${nma}건`, "NMA"]);
    if (meta) chipsB.push([`${meta}건`, "Meta · SR"]);
    const sent = (x, n = 78) => {
      const t0 = (x || "").split(/(?<=다)\.\s|(?<=음)\.\s|\.\s/)[0].trim().replace(/\.$/, "");
      if (t0.length <= n) return t0;
      const cut = t0.slice(0, n), sp = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","));
      return (sp > 40 ? cut.slice(0, sp) : cut) + "…";
    };
    return {
      m: k, period, n: s.length, p: p.length, hi: hiList.length, rct, cats, drugs,
      hA: `${cats[0]?.[0] ?? "—"} 중심 ${isAnnual ? "연도" : "분기"} — 전체 ${s.length}건 중 P-CAB 관련 ${p.length}건(${pct}%)`,
      chipsA: [[`${s.length}건`, "전체 출판"], [`${p.length}건`, "P-CAB 관련"],
               [`${hiList.length} / ${rct}건`, "지침·메타분석 / RCT"]],
      ptsA: [
        "카테고리 — " + cats.map(([a, b]) => `${a} ${b}건`).join(" · "),
        ...(areas.length ? ["P-CAB 임상영역 — " + areas.map(([a, b]) => `${a} ${b}건`).join(" · ")] : []),
        ...(drugs.length ? ["성분별 — " + drugs.map(([a, b]) => `${a} ${b}건`).join(" · ")] : []),
      ],
      hB: gl ? `가이드라인 ${gl}건 발표 — 권고 변화가 이 분기의 핵심`
        : nma ? `NMA ${nma}건 — 계열·요법 간 비교 근거 축적`
        : meta ? `메타분석·체계적 문헌고찰 ${meta}건 중심` : "지침·메타분석 없이 원저·관찰연구 위주",
      chipsB: chipsB.length ? chipsB : [[`${hiList.length}건`, "지침·메타분석"]],
      ptsB: hiList.slice(0, 3).map((r) => `<b>${TYKO[r.ty] ?? "기타"}</b> — ${sent(r.s)}`),
      refsB: hiList.slice(0, 3).map((r) => ({
        t: `${r.t.slice(0, 92)}${r.t.length > 92 ? "…" : ""} (${r.pd.slice(0, 7)} · ${r.ty})`, u: r.u })),
    };
  });

  /* ---- Safety Signal (누적) ---- */
  const safeCount = { PPI: 0, PCAB: 0, ZAS: 0 };
  for (const r of rows) {
    if (!r.pd || r.pd < "2024-01-01" || r.pd > TODAY || !r.isSafe) continue;
    if (r.d.includes("자스타프라잔")) safeCount.ZAS++;
    if (r.p) safeCount.PCAB++; else if (r.isPPI) safeCount.PPI++;
  }
  const NAME = { PPI: "PPI", PCAB: "P-CAB 계열", ZAS: "자스타프라잔" };
  const safety = {
    period: `2024년 1월 ~ ${TODAY.slice(0, 4)}년 ${+TODAY.slice(5, 7)}월 (누적)`,
    groups: ["PPI", "PCAB", "ZAS"].map((id) => ({
      id, name: NAME[id], n: safeCount[id],
      items: nar.safety?.[id] ?? [],
    })),
  };

  /* ---- 결과 ---- */
  const drugTot = top(cnt(pcab.flatMap((r) => r.d)), 20);
  return {
    gen: TODAY, win, total: rows.length, pcab: pcab.length,
    zas: rows.filter((r) => r.d.includes("자스타프라잔")).length,
    drugs: drugTot,
    weekly: weekly.map(({ isPPI, isSafe, ar, ...r }) => r),
    weekly_dup: dup,
    weekTrend: {
      stats: [["총 문헌", String(weekly.length), "건"],
              ["RCT", String(weekly.filter((r) => r.ty === "RCT").length), "건"],
              ["P-CAB 관련", String(weekly.filter((r) => r.p).length), "건"],
              ["최다 주제", top(cnt(weekly.map((r) => r.c)), 1)[0]?.[0] ?? "—", ""]],
      bullets: nar.weekTrend?.bullets ?? [],
    },
    overview: nar.overview ?? [],
    intel: nar.intel ?? { class: [], prod: [], caveat: [] },
    archive, safety, guidelines,
  };
}

/* ══════════════════════ 4. 렌더 ══════════════════════ */

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function render(data) {
  const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const marker = "/* ==== DATA ==== */";
  if (!tpl.includes(marker)) throw new Error("template.html 에 DATA 자리표시자가 없습니다.");
  let html = tpl.replace(marker, `window.APP=${JSON.stringify(data)};`);

  // GitHub Pages 비번 게이트 — SITE_PASSWORD가 설정된 경우에만 해시를 주입.
  // 해시만 클라이언트 코드에 노출되므로 평문보다는 낫지만, 서버 인증이 아니라는 점은 동일함.
  const pwMarker = "/* ==== PW_HASH ==== */";
  if (!html.includes(pwMarker)) throw new Error("template.html 에 PW_HASH 자리표시자가 없습니다.");
  const pw = process.env.SITE_PASSWORD || "";
  const pwHash = pw ? await sha256Hex(pw) : "";
  html = html.replace(pwMarker, `window.PW_HASH=${JSON.stringify(pwHash)};`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  return html.length;
}

/* ══════════════════════ 실행 ══════════════════════ */

const nar = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "narrative.json"), "utf8"));
const rows = tag(await fetchAll());
const data = await analyze(rows, nar);
const size = await render(data);

console.log(`✓ 빌드 완료 — 기준일 ${TODAY}`);
console.log(`  전체 ${data.total}건 · P-CAB ${data.pcab}건 · 자스타프라잔 ${data.zas}건`);
console.log(`  Weekly ${data.weekly.length}건(중복 ${data.weekly_dup}건 제외) · Archive 구간 ${data.archive.length}개 · Safety 누적 그룹 ${data.safety.groups.length}개`);
console.log(`  dist/index.html — ${Math.round(size / 1024)} KB`);

const missing = data.weekly.filter((r) => !r.sum || r.sum.length < 20);
if (missing.length) {
  console.warn(`⚠ 핵심 요약이 없는 신규 문헌 ${missing.length}건 — content/narrative.json 의 weeklySummaries 에 추가하세요:`);
  for (const r of missing) console.warn(`   "PMID:${(r.id.match(/(\d{7,9})/) || [])[1] ?? "?"}": "…"   ← ${r.t.slice(0, 70)}`);
}
