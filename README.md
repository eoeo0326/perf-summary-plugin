# perf-summary

[![릴리스](https://img.shields.io/github/v/release/eoeo0326/perf-summary-plugin?label=release)](https://github.com/eoeo0326/perf-summary-plugin/releases/latest) [![CI](https://github.com/eoeo0326/perf-summary-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/eoeo0326/perf-summary-plugin/actions/workflows/ci.yml) [![MIT 라이선스](https://img.shields.io/badge/license-MIT-blue)](https://github.com/eoeo0326/perf-summary-plugin/blob/main/LICENSE)

GitHub PR 활동을 **이력서·성과 평가용 한국어 Markdown 보고서**로 정리하는 Claude Code / Codex 공통 스킬입니다.

- **설치 후 바로 실행** — `npx skills`로 설치하며 별도 MCP 등록·빌드가 필요 없습니다.
- **기존 계정으로 수집** — `gh auth login` 인증을 재사용하며 여러 계정을 함께 집계합니다.
- **필요한 기간으로 정리** — 연간·월간·기간별 보고서와 이력서 항목 추천을 제공합니다.

[빠른 시작](#빠른-시작) · [보고서 예시](#보고서-예시) · [사용법과 옵션](#사용법과-옵션) · [집계 기준과 저장](#집계-기준과-저장) · [상세 문서](#업데이트와-상세-문서)

## 빠른 시작

### 1. 준비

**Node.js 22 이상**(권장 24 LTS)과 최신 [GitHub CLI](https://cli.github.com/)가 필요합니다. 조회할 계정으로 로그인합니다.

```bash
gh auth login
```

Private 저장소는 접근 권한과 필요한 조직 SSO 승인이 있어야 합니다. 권한이 부족한 경우 `gh auth refresh -h github.com -s repo`로 갱신합니다.

### 2. 설치

프로젝트 폴더에서 Claude Code와 Codex에 함께 설치합니다.

```bash
npx skills add eoeo0326/perf-summary-plugin --skill perf-summary -a claude-code -a codex
```

모든 프로젝트에서 사용하려면 `-g`를 추가합니다. 복사 설치는 `--copy`를 지원합니다.

### 3. 첫 보고서 실행

**Claude Code** 대화에서 입력합니다.

```text
/perf-summary --month 2026-09
```

**Codex** 대화에서 입력합니다.

```text
$perf-summary --month 2026-09
```

별도 LLM API 키는 필요 없습니다. 보고서 문장은 현재 대화 중인 AI 에이전트가 작성합니다.

## 보고서 예시

> **가상 데이터로 만든 형식 예시입니다.** 실제 보고서에는 기간·계정·집계 범위와 근거 PR 링크가 포함됩니다.

**핵심 요약** — 인증 흐름의 예외 처리를 정리하고 회귀 테스트를 추가했습니다.

| 지표 | 값 |
|---|---|
| 총 PR | 3개 |
| 활동 저장소 | 1개 |
| 변경 라인 | +240 / -80 |

**이력서 항목 추천**

- 인증 오류 처리를 공통화하고 회귀 테스트를 추가해 예외 상황에 대응 — 관련 PR 3개

보고서에는 저장소별 테마 요약과 접을 수 있는 PR 목록도 담깁니다. 연간 종합은 회고·핵심 성취·도메인 분포·키워드·월별 추이를 추가합니다.

## 사용법과 옵션

두 도구는 같은 옵션을 지원합니다. 아래 Codex 예시의 `$perf-summary`를 Claude Code에서는 `/perf-summary`로 바꿔 입력하세요.

```text
$perf-summary --year 2025 --org acme
$perf-summary --month 2026-09 --repo acme/app --output ./reports/september.md
$perf-summary --since 2026-01 --until 2026-09 --account alice,bob --dry-run
```

자연어로도 요청할 수 있습니다: “2025년 GitHub 성과를 월별·연간으로 정리해줘.”

### 기간 선택

| 옵션 | 동작 |
|---|---|
| `--year YYYY` | 월별 보고서 + 연간 종합. 과거 연도 13개, 현재 연도는 현재 월까지 + 종합, 미래 연도 0개 |
| `--month YYYY-MM` | 해당 월 단일 보고서. 현재 월은 오늘까지, 미래 월은 오류 |
| `--since 날짜` | 기간 시작일. 연도만 입력하면 1월 1일, 월만 입력하면 해당 월 1일 |
| `--until 날짜` | 종료일 포함. 생략하면 오늘, 부분 날짜는 해당 연·월 마지막 날 |

`since`·`until`의 날짜는 `YYYY`, `YYYY-MM`, `YYYY-MM-DD` 형식입니다.

`year`·`month`·`since` 중 하나만 사용하며, `until`은 `since`와 함께 씁니다. `--year 2025`는 월별·연간 분할, `--since 2025 --until 2025`는 같은 기간의 단일 보고서입니다.

### 필터와 출력

| 옵션 | 동작 |
|---|---|
| `--org a,b` | 조직 필터. 생략하면 전체 |
| `--repo owner/repo` | 저장소 필터. 조직 조건보다 우선 |
| `--account alice,bob` | 계정 필터. 생략하면 gh에 로그인한 모든 github.com 계정 |
| `--output path` | 단일 보고서 출력 경로. 상대경로는 작업 폴더 기준 |
| `--dry-run` / `--output none` | 파일을 저장하지 않는 미리보기 |

연간 모드에서는 `--output` 경로를 무시하고 기본 경로에 월별·종합 보고서를 만듭니다.

## 집계 기준과 저장

- **PR 생성일 기준**으로 기간과 월을 나눕니다. 시간대는 실행 PC 기준이며 병합 월로 재분류하지 않습니다.
- PR 상태·변경량은 **조회 시점** 기준입니다. 직접 push한 커밋은 제외하며, 커밋·파일 수는 고유 개수가 아닌 PR별 합계입니다.
- GitHub 조회에는 네트워크가 필요하고, 보고서 작성을 위해 PR 근거가 연결된 AI 에이전트에 전달됩니다. GitHub 토큰과 PR 근거는 수집 프로세스의 메모리에 보관합니다.
- 기존 파일은 기본 보존합니다. 덮어쓰기를 허용한 파일만 교체하며, 미리보기는 파일을 쓰지 않습니다.

기본 저장 위치는 **사용자 작업 폴더** 아래입니다.

```text
PerformanceSummary/2025/
├── 2025-01-01_2025-01-31.md
├── …
└── year_2025-01-01_2025-12-31.md
```

이미 `PerformanceSummary` 하위에서 실행하면 같은 루트를 재사용합니다. 설치 폴더나 npm 캐시에는 보고서를 저장하지 않습니다.

수집 누락·실패는 완전한 결과로 표시하지 않습니다. 부분 보고서는 사용자가 요청할 때만 누락을 명시해 작성합니다. [인증·집계 상세](https://github.com/eoeo0326/perf-summary-plugin/blob/main/docs/mcp.md#인증과-데이터-처리)에서 제한과 보관 정책을 확인하세요.

## 업데이트와 상세 문서

```bash
npx skills update
```

기존 플러그인 사용자는 플러그인을 업데이트하면 됩니다. 같은 스킬을 중복 설치할 필요가 없습니다.

| 문서 | 내용 |
|---|---|
| [MCP 및 기존 플러그인](https://github.com/eoeo0326/perf-summary-plugin/blob/main/docs/mcp.md) | 클라이언트별 등록, 플러그인 업데이트, API, 인증·집계 상세 |
| [개발 및 릴리스](https://github.com/eoeo0326/perf-summary-plugin/blob/main/docs/development.md) | 로컬 개발, 스킬 빌드, 설치 검증, 배포 절차 |
| [공통 스킬 지침](https://github.com/eoeo0326/perf-summary-plugin/blob/main/skills/perf-summary/SKILL.md) | 입력 해석과 CLI 실행·보고서 작성 절차 |
| [보고서 작성 지침](https://github.com/eoeo0326/perf-summary-plugin/blob/main/skills/perf-summary/references/report-guidelines.md) | 보고서 템플릿과 통계 해석 규칙 |
| [v1.2.0 릴리스 노트](https://github.com/eoeo0326/perf-summary-plugin/releases/tag/v1.2.0) | 이번 버전의 변경점과 업데이트 안내 |

MCP만 사용하는 경우 [npm 패키지 `perf-summary-mcp@1.2.0`](https://www.npmjs.com/package/perf-summary-mcp/v/1.2.0)를 사용할 수 있습니다.

## 라이선스

[MIT](https://github.com/eoeo0326/perf-summary-plugin/blob/main/LICENSE)
