# perf-summary

GitHub 활동(내가 작성한 PR + 커밋 통계)을 기간/조직별로 집계해
이력서·성과 평가용 Markdown 보고서를 생성하는 Claude Code Plugin.

## 구성

```
perf-summary-plugin/
├── .claude-plugin/
│   └── plugin.json
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
/perf-summary --year 2025
```

## 설치 (GitHub 배포 후)

`~/.claude/settings.json` 에 다음 항목을 추가하면 됨:

```json
{
  "extraKnownMarketplaces": {
    "perf-summary": {
      "source": {
        "source": "github",
        "repo": "eoeo0326/perf-summary-plugin"
      }
    }
  }
}
```

이후 Claude Code에서:

```
/plugin install perf-summary
```

## 사용 방법

`--year` / `--month` / `--since` 중 **정확히 하나**를 지정. `--until` 은 `--since` 와 같이 쓸 때만 의미가 있음.

### 공통 옵션

모든 모드에 함께 쓸 수 있는 보조 인자.

| 인자 | 필수 | 설명 |
|---|---|---|
| `--org <org>` | ❌ | 조직명. 쉼표로 여러 개 가능. 미지정 시 본인이 PR을 작성한 **모든 조직** |
| `--repo <owner/repo>` | ❌ | 특정 레포만 집계. `--org` 보다 우선. 미지정 시 **모든 레포** |
| `--output <path>` | ❌ | 출력 경로 강제 지정 (단일 보고서 모드 한정. 연간 모드에선 무시) |

### 연간 모드 — `--year YYYY`

해당 연도(1/1 ~ 12/31)를 **월별 12개 + 연간 종합 1개** 보고서로 한 번에 생성. 연간 종합에는 월별 추이 표가 포함됨.

```
/perf-summary --year 2025
/perf-summary --year 2025 --org acme
```

### 월별 모드 — `--month YYYY-MM`

해당 월 1일~말일을 단일 보고서로 생성. 윤년 자동 처리.

```
/perf-summary --month 2025-03
/perf-summary --month 2025-03 --repo acme/web
```

### 기간 모드 — `--since` / `--until`

자유 기간을 단일 보고서로 생성. 두 인자 모두 **연/월/일 부분 형식**을 받으며, `--until` 은 생략 가능.

| 인자 | 필수 | 설명 |
|---|---|---|
| `--since YYYY[-MM[-DD]]` | ✅ | 시작일. `YYYY` → 1/1, `YYYY-MM` → 해당 월 1일, `YYYY-MM-DD` → 그대로 |
| `--until YYYY[-MM[-DD]]` | ❌ | 종료일. `YYYY` → 12/31, `YYYY-MM` → 해당 월 말일, `YYYY-MM-DD` → 그대로. **미지정 시 오늘** |

```
/perf-summary --since 2025-03                       # 2025-03-01 ~ 오늘
/perf-summary --since 2025-03 --until 2025-06       # 2025-03-01 ~ 2025-06-30
/perf-summary --since 2025-01-01 --until 2025-03-15
```

> `--year 2025`(월별 분할 + 연간 종합)와 `--since 2025 --until 2025`(같은 1년 기간이지만 **단일** 보고서)는 출력 구조가 다름.

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
- **레포별 활동** — 변경량 내림차순으로 정렬된 레포별 통계
  - **기간 작업 요약** — 해당 기간 동안 그 레포에서 한 굵직한 작업을 테마별로 묶은 종합 요약 (PR 1건뿐이면 생략)
  - **PR 목록** — PR별 변경 라인·상태와 함께 **PR 본문/커밋 메시지에서 추출한 "작업 내용" 2~4 불릿** 첨부
- **월별 추이** *(연간 모드 한정)* — 연간 종합 보고서 끝에 월별 PR/merged/추가·삭제 라인/커밋 합계 표

## 주의사항

- `gh search prs` 는 결과 최대 1000건. 활동이 많으면 기간을 분기/월 단위로 쪼개 합산 (연간 모드는 자동 처리)
- Private repo 는 `gh auth login --scopes repo` 필요
- PR 워크플로 기준이라 직접 push 커밋은 변경 라인에 누락됨

## 라이선스

MIT
