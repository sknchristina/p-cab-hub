# P-CAB Intelligence Hub

Notion 문헌 DB를 기반으로 P-CAB 학술 대시보드를 매주 자동 생성하는 저장소입니다.

```
Notion DB ──> scripts/build.mjs ──> dist/index.html ──> Netlify
                     ↑
            content/narrative.json  (사람이 검토·승인하는 해석 문안)
```

---

## 구조

| 경로 | 역할 | 누가 수정하나 |
|---|---|---|
| `scripts/build.mjs` | Notion 수집 → 분류·집계 → HTML 생성 | 개발 시에만 |
| `content/narrative.json` | **해석 문안** (헤드라인·핵심 메시지·안전성 요약) | **매주 검토·수정** |
| `content/snapshot.json` | 마지막 Notion 수집 결과 (자동 갱신) | 건드리지 않음 |
| `src/template.html` | 화면 디자인·레이아웃 | 디자인 변경 시 |
| `netlify/edge-functions/auth.ts` | 비밀번호 게이트 | 건드리지 않음 |
| `netlify/functions/weekly-rebuild.mts` | 주 1회 자동 재빌드 | 주기 변경 시 |

**자동으로 갱신되는 것** — 문헌 건수, 성분별 분포, Weekly Update 목록, Evidence Landscape 수치, News Archive 분기 통계, Safety Signal 건수

**사람이 작성하는 것** — Overview 3개 메시지, Weekly 트렌드 3항목, Evidence Intelligence 7개 카드, Evidence Landscape 카드 서술, Safety Signal 반기별 요약

---

## 환경변수

Netlify → Site configuration → Environment variables

| Key | 값 | 비고 |
|---|---|---|
| `NOTION_TOKEN` | `ntn_...` | Notion 내부 통합 시크릿. **Secret 체크** |
| `NOTION_DATA_SOURCE` | `3733faba-f0c6-4b77-a20b-6adee26e36c6` | 문헌 DB의 데이터소스 ID |
| `SITE_USER` | `jeil` | 사이트 접속 아이디 |
| `SITE_PASSWORD` | (원하는 값) | 사이트 접속 비밀번호. **Secret 체크** |
| `BUILD_HOOK_URL` | `https://api.netlify.com/build_hooks/...` | 주간 자동 재빌드용. **Secret 체크** |

`NOTION_TOKEN` 이 없으면 `content/snapshot.json` 캐시로 빌드되므로, 토큰 설정 전에도 사이트는 정상 동작합니다.

### Notion 통합 토큰 발급

1. https://www.notion.so/my-integrations → **New integration**
2. 이름 `P-CAB Hub`, 워크스페이스 선택, Capabilities는 **Read content** 만 체크
3. 생성 후 **Internal Integration Secret** 복사 → `NOTION_TOKEN` 에 입력
4. **문헌 DB 페이지 → 우측 상단 ⋯ → Connections → `P-CAB Hub` 추가** (이 단계를 빠뜨리면 403이 납니다)

---

## 주간 운영 흐름

1. **일요일 23:00 UTC (월요일 08:00 KST)** — 스케줄 함수가 빌드 훅 호출
2. Netlify가 `npm run build` 실행 → Notion 재수집 → 숫자·목록 갱신
3. 빌드 로그에 **핵심 요약이 없는 신규 문헌**이 경고로 출력됨
4. 해당 문헌의 요약을 `content/narrative.json` → `weeklySummaries` 에 추가
5. 필요하면 `overview`, `weekTrend.bullets` 등 해석 문안 수정 후 커밋
6. 커밋하면 Netlify가 자동 재배포

> 숫자만 바뀐 주에는 3~5단계를 건너뛰어도 됩니다. 사이트는 이미 최신 수치로 갱신되어 있습니다.

### narrative.json 편집 요령

- `weeklySummaries` 는 **`"PMID:12345678"` 형태의 키**로 문헌과 매칭됩니다.
- 본문에 `<b>강조</b>` 를 쓰면 굵게 표시됩니다.
- 통계값(`87.9%`, `RR 1.10`, `p<0.001`)은 **자동으로 형광 강조**되므로 따로 표시하지 않아도 됩니다.
- 성분명(보노프라잔·테고프라잔 등)도 자동으로 굵게 처리됩니다.

---

## 로컬에서 확인하기

```bash
npm run build              # content/snapshot.json 캐시로 빌드
open dist/index.html

NOTION_TOKEN=ntn_... NOTION_DATA_SOURCE=3733faba-... npm run build   # Notion 실시간 수집
SNAPSHOT_DATE=2026-08-14 npm run build                              # 기준일 고정
```

---

## 주의사항

- 임상 영역 분류와 근거 수준 판정은 **제목·초록 키워드 규칙에 기반한 자동 분류**입니다. 개별 문헌 인용 전 원문 확인이 필요합니다.
- 원본 DB에서 자료유형이 비어 있는 문헌은 「기타」로 집계되므로 지침·메타분석·RCT 건수가 과소평가될 수 있습니다.
- 해석 문안은 대외 활용 전 내부 medical review를 거쳐야 합니다.
