---
name: perf-summary
description: GitHub 활동(내가 작성한 PR + 커밋 통계)을 기간/조직별로 집계해 이력서·성과 평가용 Markdown 보고서를 생성합니다. 사용자가 "성과 정리", "기여도 요약", "GitHub 활동 정리", "perf summary", "performance summary" 등을 요청하거나 /perf-summary 명령을 호출했을 때 발동합니다. gh CLI를 사용해 PR(state/리뷰/병합 정보)과 변경 라인·파일·커밋 수를 수집한 뒤 PerformanceSummary/{시작연도}/{since}_{until}.md 에 저장합니다. --year/--month 인자로 연·월 단위 일괄 생성도 지원합니다.
---

# Performance Summary Skill

`gh` CLI를 활용해 본인의 GitHub PR과 커밋 통계를 기간별로 집계한 뒤,
이력서/평가 자료에 바로 쓸 수 있는 Markdown 보고서를 생성합니다.

## 입력 인자

| 인자 | 필수 | 설명 |
|---|---|---|
| `--year YYYY` | △ | 해당 연도(1/1~12/31)를 **월별 12개 + 연간 1개** 보고서로 분할 생성. `--month`/`--since`/`--until`과 상호 배타 |
| `--month YYYY-MM` | △ | 해당 월 1일~말일을 **단일 보고서**로 생성. 윤년 자동 처리. `--year`/`--since`/`--until`과 상호 배타 |
| `--since YYYY[-MM[-DD]]` | △ | 집계 시작일(포함). `YYYY`→해당 연 1/1, `YYYY-MM`→해당 월 1일, `YYYY-MM-DD`→그대로. `--year`/`--month` 미사용 시 필수 |
| `--until YYYY[-MM[-DD]]` | ❌ | 집계 종료일(포함). `YYYY`→해당 연 12/31, `YYYY-MM`→해당 월 말일(윤년 자동), `YYYY-MM-DD`→그대로. **미지정 시 오늘** |
| `--org <org>` | ❌ | 조직명. 쉼표로 여러 개 가능 (`deep-medi-backend,deep-medi-Android`). **미지정 시 전체 조직** |
| `--repo <owner/repo>` | ❌ | 특정 레포만 집계. `--org`보다 우선. **미지정 시 전체 레포** |
| `--output <path>` | ❌ | 단일 보고서일 때만 유효. `--year` 모드에선 무시(경고만 출력) |

### 인자 검증

- `--year`/`--month`/`--since` 중 **정확히 하나**가 지정되어야 함 (`--until`은 `--since`에 종속). 모두 비어 있으면 어느 모드를 쓸지 사용자에게 질의
- `--year`/`--month`와 `--since`(또는 `--until`)는 상호 배타 → 동시 사용 시 에러
- `--until` 단독은 무의미 → 에러
- `--year`: `^\d{4}$`
- `--month`: `^\d{4}-(0[1-9]|1[0-2])$`. **현재 달보다 미래 입력 시 에러로 종료** (예: 오늘이 `2026-05`인데 `--month 2026-09` 호출 → 에러)
- `--since`/`--until`: `^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$`
- 부분 형식은 §0에서 정규화한 뒤 `since <= until` 검증
- `--until` 생략 시 `UNTIL=$(date '+%Y-%m-%d')` (오늘, 로컬 타임존)
- `--org`/`--repo`가 둘 다 비어 있어도 **묻지 말고 전체 조회 모드로 진행** (author 필터만 사용)

## 실행 순서

### 0. 모드 판별

1. `--year` 지정 → **year 모드**: `(YYYY-01-01, YYYY-12-31)` + 월별 12쌍 생성
2. `--month` 지정 → **month 모드**:
   - `SINCE = YYYY-MM-01`
   - `UNTIL` 산출:
     - 현재 달(`YYYY-MM` == `$(date '+%Y-%m')`)이면 `UNTIL = $(date '+%Y-%m-%d')` (오늘까지)
     - 과거 달이면 `UNTIL = YYYY-MM-<말일>`
     - 미래 달이면 §인자 검증 규칙에 따라 에러 종료
   - 보고서 제목·파일명·"한눈에 보기" 헤더 등 모든 기간 표기에 정규화된 `SINCE..UNTIL` 그대로 사용 (현재 달이면 자동으로 "오늘까지"가 노출됨)
3. 둘 다 없음 → **range 모드**: `--since`/`--until`을 다음 규칙으로 정규화

   a. `--since` 정규화:
   - `YYYY` → `SINCE=YYYY-01-01`
   - `YYYY-MM` → `SINCE=YYYY-MM-01`
   - `YYYY-MM-DD` → `SINCE=YYYY-MM-DD` (그대로)

   b. `--until` 정규화 (생략 시 오늘):
   - 없음 → `UNTIL=$(date '+%Y-%m-%d')`
   - `YYYY` → `UNTIL=YYYY-12-31`
   - `YYYY-MM` → `UNTIL=YYYY-MM-<말일>` (윤년 자동, 아래 산출식 사용)
   - `YYYY-MM-DD` → `UNTIL=YYYY-MM-DD` (그대로)

월말 산출(macOS 기준):

```bash
LAST=$(date -j -f '%Y-%m-%d' "${YYYY}-${MM}-01" -v+1m -v-1d '+%Y-%m-%d')
# 또는: python3 -c "import calendar,sys;y,m=map(int,sys.argv[1:]);print(calendar.monthrange(y,m)[1])" $YYYY $MM
```

### 1. 사전 점검

- `gh auth status` 로 인증 확인
- `gh api user --jq '.login'` 로 현재 로그인 사용자(`$LOGIN`) 획득
- 인자 검증(위 규칙)
- 기간이 너무 길어 1000건을 초과할 위험이 있으면 경고

### 2. PR 수집

레포 지정 시:
```bash
gh search prs \
  --author="$LOGIN" \
  --repo="$REPO" \
  --created="$SINCE..$UNTIL" \
  --limit 1000 \
  --json number,title,state,isDraft,createdAt,closedAt,url,repository,labels
```

조직 지정 시: org별로 반복 (또는 `--owner=$ORG` 사용)

**전체 모드(org/repo 미지정) 시**: owner/repo 필터를 빼고 `--author`와 `--created`만으로 호출
```bash
gh search prs \
  --author="$LOGIN" \
  --created="$SINCE..$UNTIL" \
  --limit 1000 \
  --json number,title,state,isDraft,createdAt,closedAt,url,repository,labels
```

> `gh search prs`의 `--json` 필드는 부족하므로, 각 PR의 상세(additions/deletions/commits/changedFiles/mergedAt 등)는 아래 명령으로 보강:
```bash
gh pr view "$URL" --json number,title,state,createdAt,mergedAt,closedAt,additions,deletions,changedFiles,commits,reviews,url,repository,body,files
```
- `body`/`files` 는 PR별 "작업 내용" 요약(§3)을 만들기 위해 필요
- `commits` 객체에는 `messageHeadline`·`messageBody` 가 포함됨 (별도 호출 불필요)
- 너무 많으면 `xargs -P 4` 같은 병렬 호출로 속도 개선
- merged 여부는 `mergedAt != null` 로 판정 (state는 closed지만 mergedAt이 있으면 merged)

#### 2-1. 입력 다이어트 (모델 컨텍스트 진입 전 1회 가공)

요약 단계의 병목은 모델 입력 크기다. `gh pr view` 응답을 받은 직후 다음 규칙으로 한 번 잘라 두면 한 달치(약 30 PR) 기준 토큰을 30~50% 절감하면서 출력 품질은 유지된다.

**릴리즈 PR 특수 처리.** PR title이 `Release/` 로 시작하거나 head branch가 `release/*` 인 PR은:
- `gh pr view` 보강 호출에서 `body`,`files`,`commits` 필드를 빼고 메타데이터(`number,title,state,createdAt,mergedAt,closedAt,additions,deletions,changedFiles,url,repository`)만 받음
- 커밋 수가 필요하면 별도로 `gh api graphql` 한 번에 `pullRequest(number).commits { totalCount }` 만 조회. 본문/커밋 메시지/파일 목록은 모델 입력에 절대 포함하지 않음
- 모델은 이 PR들을 §3-1 의 1줄 고정 요약 분기로 처리 (PR title 외 추가 입력 없음)

**일반 PR 응답 가공.** body·commits·files 를 다음과 같이 트리밍해 후속 단계로 넘긴다.
- `body`:
  1. GitHub callout block 제거 — `> [!CAUTION]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!NOTE]` 시작 라인부터 다음 빈 줄 또는 `---` 까지를 잘라낸다
  2. `## 수동 테스트 체크리스트` 또는 `### 테스트 항목` 헤딩이 나타나면 그 이후 본문을 모두 절단 (PR 템플릿의 체크박스·위험도 표가 들어가 있어 토큰 낭비가 큼)
  3. 남은 본문이 1500자를 넘으면 첫 1500자만 사용
- `commits`: `messageHeadline` 만 남기고 `messageBody` 는 drop. 헤드라인 자체에 핵심이 담겨 있어 손실 적음
- `files`: `files[].path` 만, 상위 10개까지. 나머지는 `... (N more)` 한 줄로 축약

### 3. 집계 (Python 또는 jq)

`jq`로도 충분하지만 가독성/속도를 위해 Python 권장:

```python
# 카테고리: merged / open / closed_not_merged / draft
# 합산: PRs, commits, additions, deletions, changedFiles
# 그룹: 레포별
# year 모드에서는 mergedAt(또는 createdAt) 기준으로 월별 버킷팅도 함께
```

#### 3-1. PR별 "작업 내용" 요약 생성

이력서/평가용으로 가장 중요한 부분. 각 PR이 **어떤 작업을 수행했는지**를 2~4 불릿으로 정리한다.

요약 소스(우선순위) — 모두 §2-1 의 입력 다이어트를 거친 가공 결과를 그대로 사용한다:
1. **PR body** (callout 제거, 체크리스트 절단, 1500자 cap 적용된 본문) — 작성자가 직접 정리한 변경 사유·의도. 가장 신뢰도 높음
2. **커밋 메시지** (`commits[].messageHeadline` only — `messageBody` 는 사용하지 않음) — body가 비거나 한 줄짜리일 때 핵심 소스
3. **변경 파일 목록** (`files[].path` 상위 10개) — 어떤 영역(domain/ui/network 등)을 건드렸는지 추론할 때만 보조적으로 활용

작성 가이드:
- 2~4 불릿, 각 한 줄(약 40~80자). "무엇을 / 왜"가 드러나도록
- 평가 자료 톤: "~ 구현", "~ 분리", "~ 마이그레이션", "~ 도입" 같은 명사형 종결
- PR 템플릿 보일러플레이트는 §2-1 가공 단계에서 이미 잘려 있어야 함. 본문 추출 단계에서 다시 확인할 필요 없음
- 커밋 헤드라인이 `WIP`·`fix typo`·`ktlint`·자동 머지뿐이거나 body 가 비어 있으면 의미 있는 요약을 못 뽑는 케이스 — `(요약 생략 — PR 본문/커밋 메시지 정보 부족)` 한 줄로 대체. **억지 요약 금지**
- **릴리즈 PR(`Release/` prefix 또는 `release/*` head) 은 1줄 요약 고정**: `- {버전} 릴리즈 머지` 형식. §2-1 규칙대로 body·files·commits 가 모델 입력에 들어와 있지 않으므로 PR title 의 버전 정보만으로 처리

#### 3-2. 레포 단위 "기간 작업 요약" 생성

각 레포에 대해, 해당 기간 PR들을 모두 훑은 뒤 **이 기간 동안 이 레포에서 한 굵직한 작업**을 테마별로 묶어 종합 요약을 만든다. PR별 요약을 단순 나열하지 말고, **공통 흐름이 보이는 PR들을 한 항목으로 묶고** 단발성 PR은 단발성 그대로 1줄로 둔다.

분량(작업 크기 = 해당 레포의 PR 수 + 변경 라인 합):
- 소규모 (PR 1~2건 또는 변경 ~200라인): 2~4 불릿
- 중규모 (PR 3~6건 또는 변경 ~1000라인): 5~10 불릿
- 대규모 (PR 7건+ 또는 변경 1000라인+): 최대 20 불릿
- **상한 엄수**: 어떤 경우에도 한 레포 요약은 **20 불릿을 초과하지 않음**. 초과하면 묶기를 더 강하게 하거나 마이너한 항목을 떨군다
- 레포에 PR이 1건뿐이면 이 블록은 생략 (해당 PR의 "작업 내용"과 중복)

작성 가이드:
- 시간 순서가 아니라 **테마/모듈 단위**로 묶기
  - 예: `인증 흐름 리팩터링 — Interceptor·Authenticator 책임 분리 및 게스트 측정 카운트 도메인 적용 (#397, #408)`
- 각 불릿 끝에 근거가 된 PR 번호를 `(#123, #124)` 형태로 표기 — 추적 가능성 확보
- 릴리즈/디펜던시 범프성 PR은 별도 항목으로 묶거나 생략
- 어조는 PR별 작업 내용과 동일한 명사형 종결

#### 3-3. "이력서 항목 추천" 생성 — 모든 모드 공통

이력서·평가 자료에 그대로 올릴 만한 굵직한 성취를 별도 섹션으로 정리한다. §3-1·§3-2 결과를 한 단계 더 추상화해 **"무엇을 만들었고 어떤 가치를 냈는지"** 가 드러나는 4~8개 항목을 뽑는다.

추출 가이드:
- 기간 내 활동량이 큰 테마/도메인을 우선 (변경 라인 합 또는 PR 수 기준)
- 단일 PR 단위가 아니라 **레포·도메인 단위로 묶어** 한 항목으로 표현 — 여러 PR이 같은 흐름이면 하나로
- 정량 지표를 최소 1개 동반: 변경 라인, PR 수, 도메인/모듈 범위 등 (예: `PR 12건 · +3,200/-870 라인 · 인증·세션 도메인`)
- 출처 PR 번호를 `(#PR, #PR, ...)` 로 마지막에 명시
- 평가 자료 톤: `~ 구현`, `~ 분리`, `~ 마이그레이션`, `~ 도입`, `~ 자동화` 같은 명사형 종결
- 활동량이 작아 의미 있는 항목 4개를 못 뽑겠으면 가능한 만큼만(최소 2개) 제시. 활동 0건이면 §4 템플릿에서 이 섹션 자체 생략
- 릴리즈/디펜던시 범프 / 단순 typo·lint 성 PR만으로 만들어진 항목은 제외
- year 모드의 연간 보고서에서는 본 §3-3 결과보다 **굵직한 narrative** 가 §9 "연간 종합 서술"로 별도 생성됨 — 두 섹션의 항목이 겹쳐도 무방하지만 §9 가 더 추상적·서사적이어야 함

이 섹션은 **month 모드, range 모드, year 모드의 월별 12개 보고서·연간 보고서 모두**에 항상 포함된다 (활동 0건 보고서 제외).

### 4. Markdown 렌더링

아래 템플릿으로 작성:

```markdown
# Performance Summary ({since} ~ {until})

> Author: @{login}
> Generated: {now ISO8601}
> Scope: {org or repo list, or "전체"}
> 집계 기준: 본인이 생성한 PR(merged/open/closed/draft) — PR 외 직접 push 커밋은 포함되지 않음.

## 한눈에 보기

| 지표 | 값 |
|---|---|
| 총 PR | {N}개 (merged {M} / open {O} / closed {C} / draft {D}) |
| 활동 레포 수 | {R}개 |
| 변경 라인 | +{add} / -{del} |
| 변경 파일 | {files}개 |
| 총 커밋 | {commits}개 |

## 이력서 항목 추천

- {핵심 성취 1 — 정량 지표·범위 동반} (#PR, #PR)
- {핵심 성취 2} (#PR)
- {핵심 성취 3} (#PR, #PR, #PR)
- ... (4~8개 항목, §3-3 결과)

## 레포별 활동

### {owner/repo}

- PR: {N}개 (merged {M} / open {O} / closed {C} / draft {D})
- 변경: +{add} / -{del} (파일 {f}개)
- 커밋: {c}개

**기간 작업 요약**

- {테마 묶음 1} (#PR, #PR)
- {테마 묶음 2} (#PR)
- {단발 작업} (#PR)
- ... (작업 크기에 따라 2~20 불릿)

<details>
<summary><b>PR 목록 ({N}개)</b></summary>

#### [{title}]({url}) (#{number})
- 변경: +{add}/-{del} (파일 {f}개) · {mergedAt or createdAt} {state}
- 작업 내용:
  - {요약 불릿 1}
  - {요약 불릿 2}
  - {요약 불릿 3}

#### [{다음 PR title}]({url}) (#{number})
...

</details>
```

세부 규칙:
- 레포 정렬: 활동량(변경 라인 합) 내림차순. 동률이면 PR 수 → 알파벳 순
- 레포 내 PR 정렬: `mergedAt` → `closedAt` → `createdAt` 순으로 가장 최신이 위
- PR 상태 표기: 메타라인 끝의 ` · {state}` 자리에 노출 (예: `· 2026-05-15 merged`, `· 2026-05-10 open`, `· 2026-05-08 closed`, `· 2026-05-05 draft`)
- 빈 카테고리(0개)는 통계 블록에서 자연스럽게 생략
- 활동이 0건인 레포는 §4에 나타나지 않음 (year 모드의 "활동 없음" 보고서는 §7 규칙 그대로)
- 레포에 PR이 1건뿐이면 "기간 작업 요약" 블록은 생략 (PR "작업 내용"과 중복)
- 별도 `## PR 상세` 섹션은 두지 않음 — 모든 PR은 레포별 활동 하위 `#### PR` 블록으로만 노출
- **PR 목록은 `<details>` 로 접어 둔다** — 보고서를 펼치면 기본은 "기간 작업 요약"까지만 보이고, 필요한 사람만 PR 목록을 펼쳐서 확인. summary 라벨은 `<b>PR 목록 ({N}개)</b>` 로 PR 개수 노출
- GitHub/대부분 마크다운 렌더러에서 `<details>` 내부 마크다운이 정상 파싱되도록 `<summary>` 다음에 빈 줄 1개, `</details>` 앞에 빈 줄 1개를 반드시 둘 것

### 5. 저장

기본 경로: `<현재 작업 디렉토리>/PerformanceSummary/{since의 YYYY}/{since}_{until}.md`
- 현재 디렉토리가 이미 `PerformanceSummary` 하위면 그대로 사용
- 디렉토리 없으면 `mkdir -p`
- 같은 파일이 있으면 사용자에게 덮어쓰기 여부 확인
- `--output` 지정 시 그 경로 그대로 사용 (단일 보고서 모드 한정)

### 6. 결과 보고

- 저장 경로 (year 모드는 13개 경로 전체 또는 디렉토리)
- 핵심 수치(총 PR/merged/추가-삭제 라인)
- 다음 행동 제안 (예: 다른 기간 추가 조회)

### 7. year 모드 추가 처리

year 모드일 때만 §2~§5에 더해 다음을 수행:

1. **PR 수집 최적화**: 가능하면 1년치(`YYYY-01-01..YYYY-12-31`)를 한 번에 받고, `mergedAt`(없으면 `createdAt`) 기준으로 월별 버킷팅. 1000건 초과 위험 시 월별로 분할 호출 fallback.
2. **월별 보고서 12개 생성**: 각 월(`(YYYY-MM-01, YYYY-MM-말일)`)마다 §3~§4를 돌려 `PerformanceSummary/{YYYY}/{YYYY-MM-01}_{YYYY-MM-말일}.md` 저장. 활동이 0건인 달도 빈 보고서를 만들지 말고 `[활동 없음]` 한 줄짜리로 생성 (해당 월에 일했는지 자체가 정보).
3. **연간 종합 보고서 1개 생성**: §4 템플릿으로 1년치 집계를 작성하되, 다음 두 섹션을 추가로 포함.
   - **§9 "연간 종합" 섹션을 "한눈에 보기" 바로 다음, "이력서 항목 추천" 위에 배치** — 서사형 회고 1~2 단락 + 핵심 성취 5~10 항목
   - **마지막에 "월별 추이" 섹션 추가** (§8 참조)
   - 경로: `PerformanceSummary/{YYYY}/{YYYY}-01-01_{YYYY}-12-31.md`
4. **검증**: 월별 합계 = 연간 합계여야 함. 불일치 시 사용자에게 경고.
5. `--output`은 무시하고 경고 출력 (year 모드는 다중 파일 출력이라 단일 경로로 처리 불가).

### 8. 월별 추이 섹션 (year 모드 연간 보고서 전용)

연간 보고서 끝부분에 다음 표를 추가:

```markdown
## 월별 추이

| 월 | PR | merged | +라인 | -라인 | 커밋 |
|---|---|---|---|---|---|
| 01 | 5 | 4 | +1,234 | -120 | 18 |
| 02 | 0 | 0 | +0 | -0 | 0 |
| ... | | | | | |
| 12 | 8 | 7 | +2,100 | -340 | 24 |
| **합계** | **N** | **M** | **+add** | **-del** | **C** |
```

활동이 0건인 달도 0으로 표시(생략 금지).

### 9. 연간 종합 서술 섹션 (year 모드 연간 보고서 전용)

연간 보고서의 "한눈에 보기" 바로 다음, "이력서 항목 추천" 위에 다음 블록을 추가한다. 월별 보고서에는 들어가지 않으며, **§3-3 "이력서 항목 추천"보다 더 굵직한 서사** 를 목표로 한다.

```markdown
## 연간 종합

{1~2 단락, 200~400자의 서사형 회고. 어조는 "올해는 …", "상반기에는 …, 하반기에는 …" 같은 흐름 중심.
핵심 테마/도메인, 기술적 도전, 임팩트가 드러나도록.}

**핵심 성취**

- {임팩트 큰 항목 1 — 정량 지표 동반} (#PR, #PR, ...)
- {임팩트 큰 항목 2} (#PR)
- ... (5~10개)
```

작성 가이드:
- 서사 단락은 단순 "PR 몇 건, 라인 몇 줄"의 나열이 아니라 **"이 사람이 올해 무엇을 만들었고 어떤 방향으로 성장했는가"** 를 보여줘야 함
- 핵심 성취는 §3-3 결과 위에 1 단계 더 추상화된 항목 (예: §3-3 "인증 인터셉터 분리" + "세션 토큰 마이그레이션" → §9에서는 "인증 흐름 전반 재설계 (#A, #B, #C, #D)" 하나로 묶기)
- 정량 지표는 **연 단위 누계**를 우선 (PR 합계, +/-라인 합계, 분기별 흐름)
- 한 분기 이상 공백이 있었다면 그 흐름도 솔직하게 반영 가능 ("3~5월은 …에 집중, 6월부터는 …로 전환")
- 모델 입력으로는 12개월 버킷 집계 + §3-2 레포별 종합 + §3-3 결과를 함께 사용. PR 본문 원문을 다시 읽지 않음 (이미 §2-1 가공·§3-1 요약을 거친 결과를 재활용)
- 활동량이 매우 적은 해 (연간 PR < 10)는 서사 단락 1단락 + 핵심 성취 2~3개로 축소

## 사용 예시

```
/perf-summary --year 2025
/perf-summary --year 2025 --org deep-medi-Android
/perf-summary --month 2026-03
/perf-summary --month 2026-03 --repo deep-medi-Android/some-repo
/perf-summary --month 2026-05                                       # 오늘이 2026-05-19라면 2026-05-01 ~ 2026-05-19
/perf-summary --month 2026-09                                       # (오늘이 2026-05라면) → 에러: 미래 달
/perf-summary --since 2025-01-01 --until 2025-03-15
/perf-summary --since 2025-01-01 --until 2025-03-15                 # org/repo 생략 = 전체

# --since 단축형 / --until 생략
/perf-summary --since 2026                                          # 2026-01-01 ~ 오늘
/perf-summary --since 2026-03                                       # 2026-03-01 ~ 오늘
/perf-summary --since 2026-03-10                                    # 2026-03-10 ~ 오늘
/perf-summary --since 2026-03 --until 2026-04                       # 2026-03-01 ~ 2026-04-30
/perf-summary --since 2025 --until 2025                             # 2025-01-01 ~ 2025-12-31, 단일 보고서

/perf-summary --org deep-medi-backend,deep-medi-Android,deep-medi-SDK --since 2026-01-01 --until 2026-05-15
```

> `--year 2025`(월별 분할 + 연간 종합)와 `--since 2025 --until 2025`(같은 1년 기간이지만 단일 보고서) 는 출력 구조가 다르다.

## 주의사항

- **Search API 한도**: `gh search prs`는 결과 최대 1000건. 기간이 길고 활동이 많으면 분기/월 단위로 쪼개서 조회 후 합산 (year 모드는 자동 처리)
- **Private repo**: `gh auth login --scopes repo` 로 권한이 있어야 보임
- **시간대**: GitHub은 UTC 기준. 한국 시간으로 보고싶다면 사용자에게 확인
- **변경 라인 통계의 한계**: PR에 포함되지 않은 직접 push 커밋은 카운팅 안 됨. PR 워크플로 기준이라는 점을 보고서에 명시
- 너무 큰 PR(자동 생성, 의존성 업데이트 등)은 라벨로 필터링하거나 결과에서 분리 표시 권장

## 비실행 모드

사용자가 단순 미리보기만 원하면 `--dry-run`처럼 동작 — 파일 저장 없이 콘솔에만 출력. 사용자가 `--output none`이나 "저장하지 말고 보여만 줘"라고 하면 이 모드 적용. year 모드에서는 월별 12개 + 연간 1개 미리보기를 모두 출력(길어질 수 있음).
