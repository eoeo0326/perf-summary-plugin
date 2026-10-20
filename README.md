# perf-summary

[![릴리스](https://img.shields.io/github/v/release/eoeo0326/perf-summary-plugin?label=release)](https://github.com/eoeo0326/perf-summary-plugin/releases/latest) [![CI](https://github.com/eoeo0326/perf-summary-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/eoeo0326/perf-summary-plugin/actions/workflows/ci.yml) [![MIT 라이선스](https://img.shields.io/badge/license-MIT-blue)](https://github.com/eoeo0326/perf-summary-plugin/blob/main/LICENSE)

GitHub PR 활동을 정리하는 **perf-summary**와 성과 자료로 이력서를 작성하는 **resume-builder**를 제공하는 Claude Code / Codex 공통 스킬 모음입니다.

- **설치 후 바로 실행** — `npx skills`로 설치하며 별도 MCP 등록·빌드가 필요 없습니다.
- **기존 계정으로 수집** — `gh auth login` 인증을 재사용하며 여러 계정을 함께 집계합니다.
- **필요한 기간으로 정리** — 연간·월간·기간별 보고서와 이력서 항목 추천을 제공합니다.
- **이력서 작성** — PerformanceSummary 전체를 검토해 구성·내용을 추천하고 생성 일시가 표시된 Markdown·HTML 샘플을 만듭니다.

[빠른 시작](#빠른-시작) · [이력서 작성](#이력서-작성--resume-builder) · [보고서 예시](#보고서-예시) · [사용법과 옵션](#사용법과-옵션) · [집계 기준과 저장](#집계-기준과-저장) · [상세 문서](#업데이트와-상세-문서)

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

## 이력서 작성 — resume-builder

기존 성과 자료로 이력서를 만들려면 새 스킬을 설치합니다. 두 스킬은 개별 설치할 수 있습니다.

```bash
npx skills add eoeo0326/perf-summary-plugin --skill resume-builder -a claude-code -a codex
```

```text
$resume-builder PerformanceSummary 전체로 이력서 만들어줘.
$resume-builder --no-html
$resume-builder 이 공고에 맞춰 이력서 구성과 내용을 추천해줘. Markdown만 만들어줘.
```

Claude Code에서는 `$resume-builder` 대신 `/resume-builder`를 사용합니다. `--no-html`과 “Markdown만”, “HTML 제외”는 이 스킬의 출력 선택이며 기존 perf-summary CLI 옵션이 아닙니다.

전체 보고서를 검토해 중복 PR과 상태를 대조하고, 근거가 강한 경험으로 섹션 순서·내용·분량을 추천합니다. 공고가 없으면 범용 기본형을 작성합니다. 대표 성과의 의미·조건이 불명확하면 필요한 PR만 추가 확인하며, 원격 접근이 안 되면 로컬에서 확인한 범위로 작성하고 질문을 분리합니다. 이름·근무 기간·학력·수치를 추정하지 않습니다.

기본 결과는 사용자 작업 폴더의 `ResumeDrafts/YYYY-MM-DD_HHmmss/` 아래 `recommendations.md`, `evidence.md`, `resume.md`, `resume.html`입니다. 사용자 지정 경로를 우선하고 기존 결과는 보존합니다. 모든 문서 제목 아래에 같은 **생성 일시와 시간대**가 표시되며, HTML 인쇄에도 남습니다. 자료 수록 종료일과 조회 시점은 근거 문서에 별도 기록합니다. 추천만 요청하면 추천·근거 문서만 작성합니다.

`--no-html`이면 HTML 생성·변환기 실행을 생략합니다. Markdown만 작성할 때 Node.js·gh·MCP는 필수가 아닙니다. HTML 변환에는 Node.js 22 이상이 필요하며 파서는 번들에 포함됩니다. Markdown을 정본으로 변환하므로 두 형식의 본문과 날짜가 같습니다. 외부 스크립트·폰트를 사용하지 않으며 화면·A4 인쇄를 지원합니다.

두 스킬은 [이력서 작성 공통 원칙](https://github.com/eoeo0326/perf-summary-plugin/blob/main/docs/resume-writing-principles.md)을 공유합니다. 내부 용어와 중복을 줄이고 문제·기여·결과를 설명하며, 수치를 강제하지 않습니다. PR·변경 라인 수는 활동 통계로 유지하고 이력서 성과의 순위·가치로 대신하지 않습니다. 두 스킬을 함께 업데이트하면 동일한 원칙 사본을 사용합니다. 이 저장소는 `PerformanceSummary/`와 `ResumeDrafts/`를 Git에서 제외합니다.

## 보고서 예시

> **가상 데이터로 만든 형식 예시입니다.** 실제 보고서에는 기간·계정·집계 범위와 근거 PR 링크가 포함됩니다.

**핵심 요약** — 인증 흐름의 예외 처리를 정리하고 회귀 테스트를 추가했습니다.

| 지표 | 값 |
|---|---|
| 총 PR | 3개 |
| 활동 저장소 | 1개 |
| 변경 라인 | +240 / -80 |

**이력서 항목 추천**

- 인증 만료 때 요청이 서로 기다려 통신이 멈추는 문제를 분석하고, 토큰 갱신을 전용 통신 경로로 분리해 해결했습니다.

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
| [이력서 작성 스킬](https://github.com/eoeo0326/perf-summary-plugin/blob/main/skills/resume-builder/SKILL.md) | 전체 성과 검토, 구성·내용 추천, Markdown·HTML 샘플 |
| [이력서 작성 공통 원칙](https://github.com/eoeo0326/perf-summary-plugin/blob/main/docs/resume-writing-principles.md) | 두 스킬이 공유하는 성과 선정·검증·서술 원칙의 정본 |
| [v1.2.0 릴리스 노트](https://github.com/eoeo0326/perf-summary-plugin/releases/tag/v1.2.0) | 이번 버전의 변경점과 업데이트 안내 |

MCP만 사용하는 경우 [npm 패키지 `perf-summary-mcp@1.2.0`](https://www.npmjs.com/package/perf-summary-mcp/v/1.2.0)를 사용할 수 있습니다.

## 라이선스

[MIT](https://github.com/eoeo0326/perf-summary-plugin/blob/main/LICENSE)
