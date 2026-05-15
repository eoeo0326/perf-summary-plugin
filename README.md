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
| `--since YYYY-MM-DD` | ✅ | 집계 시작일(포함) |
| `--until YYYY-MM-DD` | ✅ | 집계 종료일(포함) |
| `--org <org>` | △ | 조직명. 쉼표로 여러 개 가능. `--repo` 없으면 필수 |
| `--repo <owner/repo>` | △ | 특정 레포만. `--org`보다 우선 |
| `--output <path>` | ❌ | 출력 경로 강제 지정 |

## 출력

기본 경로: `<현재 작업 디렉토리>/PerformanceSummary/{YYYY}/{since}_{until}.md`

## 주의사항

- `gh search prs`는 결과 최대 1000건. 활동이 많으면 기간을 분기/월 단위로 쪼개 합산
- Private repo는 `gh auth login --scopes repo` 필요
- PR 워크플로 기준이라 직접 push 커밋은 변경 라인에 누락됨

## 라이선스

MIT
