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

```bash
claude --plugin-dir /Users/hyun/Desktop/김재현/이력서/perf-summary-plugin
```

세션 안에서:

```
/perf-summary:perf-summary --org deep-medi-Android --since 2025-01-01 --until 2025-12-31
```

## 설치 (GitHub 배포 후)

`~/.claude/settings.json` 에 다음 항목을 추가하면 됨:

```json
{
  "extraKnownMarketplaces": {
    "perf-summary": {
      "source": {
        "source": "github",
        "repo": "eoeo0326-deepmedi/perf-summary-plugin"
      }
    }
  }
}
```

이후 Claude Code에서:

```
/plugin install perf-summary
```

## 인자

| 인자 | 필수 | 설명 |
|---|---|---|
| `--year YYYY` | △ | 해당 연도를 월별 12개 + 연간 1개 보고서로 분할 생성 |
| `--month YYYY-MM` | △ | 해당 월 1일~말일을 단일 보고서로 생성 (윤년 자동) |
| `--since YYYY[-MM[-DD]]` | △ | 집계 시작일. `YYYY`→1/1, `YYYY-MM`→해당 월 1일, `YYYY-MM-DD`→그대로. `--year`/`--month` 미사용 시 필수 |
| `--until YYYY[-MM[-DD]]` | ❌ | 집계 종료일. `YYYY`→12/31, `YYYY-MM`→해당 월 말일(윤년 자동), `YYYY-MM-DD`→그대로. **미지정 시 오늘** |
| `--org <org>` | ❌ | 조직명. 쉼표로 여러 개. 미지정 시 전체 조직 |
| `--repo <owner/repo>` | ❌ | 특정 레포만. `--org`보다 우선. 미지정 시 전체 레포 |
| `--output <path>` | ❌ | 출력 경로 강제 지정 (단일 보고서 모드 한정) |

`--year`/`--month`/(`--since`+`--until`) 중 정확히 하나만 지정.

## 출력

- range/month 모드: `<현재 작업 디렉토리>/PerformanceSummary/{YYYY}/{since}_{until}.md` 한 개
- year 모드: `<현재 작업 디렉토리>/PerformanceSummary/{YYYY}/` 아래에 월별 12개 + 연간 종합 1개
  - 예: `2025-01-01_2025-01-31.md`, …, `2025-12-01_2025-12-31.md`, `2025-01-01_2025-12-31.md`(연간)

## 주의사항

- `gh search prs`는 결과 최대 1000건. 활동이 많으면 기간을 분기/월 단위로 쪼개 합산
- Private repo는 `gh auth login --scopes repo` 필요
- PR 워크플로 기준이라 직접 push 커밋은 변경 라인에 누락됨

## 라이선스

MIT
