# perf-summary

GitHub 활동(내가 작성한 PR + 커밋 통계)을 기간/조직별로 집계해
이력서·성과 평가용 Markdown 보고서를 생성하는 Claude Code Plugin.

## 구성

```
perf-summary-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── commands/
│   ├── year.md         # /perf-summary:year
│   ├── month.md        # /perf-summary:month
│   └── since.md        # /perf-summary:since
└── skills/
    └── perf-summary/
        └── SKILL.md
```

## 필수 조건

- `gh` CLI 설치 및 인증 (`gh auth login`)
- 조회 대상 조직/레포에 대한 권한

## 로컬 테스트

플러그인 루트에서:

```bash
claude --plugin-dir .
```

세션 안에서:

```
/perf-summary:year 2025
```

## 설치

Claude Code 세션에서 다음 두 줄로 설치:

```
/plugin marketplace add eoeo0326/perf-summary-plugin
/plugin install perf-summary@perf-summary-marketplace
```

첫 줄은 이 GitHub 레포를 마켓플레이스로 등록하고, 두 번째 줄이 실제 플러그인을 설치한다.

업데이트는 `/plugin marketplace update perf-summary-marketplace` 후 `/plugin update perf-summary@perf-summary-marketplace`.

<details>
<summary>또는 settings.json에 사전 등록</summary>

`~/.claude/settings.json` 에 다음을 추가하면 `/plugin marketplace add` 단계를 생략할 수 있다.

```json
{
  "extraKnownMarketplaces": {
    "perf-summary-marketplace": {
      "source": {
        "source": "github",
        "repo": "eoeo0326/perf-summary-plugin"
      }
    }
  }
}
```

이후 `/plugin install perf-summary@perf-summary-marketplace`.

</details>

## 사용 방법

호출은 두 가지 방식 중 편한 쪽:

- **모드별 단축 명령** — `/perf-summary:year`, `/perf-summary:month`, `/perf-summary:since`. 슬래시 입력 후 Tab/Space 로 명령을 선택하면 인자 placeholder 가 회색 hint 로 노출됨
- **단일 진입점** — `/perf-summary --year`, `--month`, `--since` 형식. `--year` / `--month` / `--since` 중 **정확히 하나**를 지정

두 방식은 동일하게 동작하며, 이하 예시는 단축 명령 형태로 표기.

### 공통 옵션

모든 모드에 함께 쓸 수 있는 보조 인자.

| 인자 | 필수 | 설명 |
|---|---|---|
| `--org <org>` | ❌ | 조직명. 쉼표로 여러 개 가능. 미지정 시 본인이 PR을 작성한 **모든 조직** |
| `--repo <owner/repo>` | ❌ | 특정 레포만 집계. `--org` 보다 우선. 미지정 시 **모든 레포** |
| `--output <path>` | ❌ | 출력 경로 강제 지정 (단일 보고서 모드 한정. 연간 모드에선 무시) |

### 연간 모드 — `/perf-summary:year YYYY`

해당 연도(1/1 ~ 12/31)를 **월별 12개 + 연간 종합 1개** 보고서로 한 번에 생성. 연간 종합에는 월별 추이 표가 포함됨.

```
/perf-summary:year 2025
/perf-summary:year 2025 --org acme
/perf-summary --year 2025                # 단일 진입점 형식 (동일 동작)
```

### 월별 모드 — `/perf-summary:month YYYY-MM`

해당 월 1일~말일을 단일 보고서로 생성. 윤년 자동 처리.

- **현재 달**(오늘이 속한 달)을 입력하면 기간이 **오늘까지**로 잘리고 파일명/제목에도 반영됨
- **미래 달**은 에러로 종료

```
/perf-summary:month 2025-03
/perf-summary:month 2025-03 --repo acme/web
/perf-summary:month 2026-05              # 오늘이 2026-05-19라면 2026-05-01 ~ 2026-05-19
/perf-summary --month 2025-03            # 단일 진입점 형식 (동일 동작)
```

### 기간 모드 — `/perf-summary:since YYYY[-MM[-DD]] [--until ...]`

자유 기간을 단일 보고서로 생성. `--since` 와 `--until` 모두 **연/월/일 부분 형식**을 받으며, `--until` 은 생략 가능 (생략 시 오늘).

| 인자 | 필수 | 설명 |
|---|---|---|
| 첫 번째 positional / `--since YYYY[-MM[-DD]]` | ✅ | 시작일. `YYYY` → 1/1, `YYYY-MM` → 해당 월 1일, `YYYY-MM-DD` → 그대로 |
| `--until YYYY[-MM[-DD]]` | ❌ | 종료일. `YYYY` → 12/31, `YYYY-MM` → 해당 월 말일, `YYYY-MM-DD` → 그대로. **미지정 시 오늘** |

```
/perf-summary:since 2025-03                          # 2025-03-01 ~ 오늘
/perf-summary:since 2025-03 --until 2025-06          # 2025-03-01 ~ 2025-06-30
/perf-summary:since 2025-01-01 --until 2025-03-15
/perf-summary --since 2025-03 --until 2025-06        # 단일 진입점 형식 (동일 동작)
```

> `/perf-summary:year 2025`(월별 분할 + 연간 종합)와 `/perf-summary:since 2025 --until 2025`(같은 1년 기간이지만 **단일** 보고서)는 출력 구조가 다름.

## 출력

기본 출력 위치는 현재 작업 디렉토리 하위 `PerformanceSummary/` 폴더.

```
PerformanceSummary/
└── {YYYY}/
    ├── {since}_{until}.md          # 기간/월별 모드: 한 개
    └── ...                         # 연간 모드: 월별 12개 + 연간 종합 1개
```

`--output <path>` 를 주면 그 경로로 저장 (연간 모드 제외).

## 보고서 구성

- **한눈에 보기** — 총 PR 수(merged/open/closed/draft), 활동 레포 수, 변경 라인·파일·커밋 합계
- **연간 종합** *(연간 모드 한정)* — 1년 흐름을 1~2 단락 서사형 회고로 정리 + 핵심 성취 5~10 항목
- **이력서 항목 추천** — 모든 보고서에 포함. 이력서·평가 자료에 그대로 올릴 만한 4~8 굵직한 성취. 정량 지표(라인·PR 수·도메인)와 출처 PR 번호 동반
- **레포별 활동** — 변경량 내림차순으로 정렬된 레포별 통계
  - **기간 작업 요약** — 해당 기간 동안 그 레포에서 한 굵직한 작업을 테마별로 묶은 종합 요약 (PR 1건뿐이면 생략)
  - **PR 목록** — 기본은 접힘(`<details>`)으로 노출, 필요 시 펼쳐서 확인. PR별 변경 라인·상태와 함께 **PR 본문/커밋 메시지에서 추출한 "작업 내용" 2~4 불릿** 첨부
- **월별 추이** *(연간 모드 한정)* — 연간 종합 보고서 끝에 월별 PR/merged/추가·삭제 라인/커밋 합계 표

`연간 종합` 과 `이력서 항목 추천` 은 PR 본문/커밋 메시지에서 직접 정량 지표와 함께 추출한 narrative 라, 이력서·평가 자료에 그대로 옮겨 쓸 수 있도록 작성된다.

## 주의사항

- `gh search prs` 는 결과 최대 1000건. 활동이 많으면 기간을 분기/월 단위로 쪼개 합산 (연간 모드는 자동 처리)
- Private repo 는 `gh auth login --scopes repo` 필요
- PR 워크플로 기준이라 직접 push 커밋은 변경 라인에 누락됨

## 라이선스

MIT
