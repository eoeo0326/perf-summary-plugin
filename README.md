# perf-summary

GitHub 활동(내가 작성한 PR + 커밋 통계)을 기간/조직별로 집계해
이력서·성과 평가용 Markdown 보고서를 생성하는 Claude Code Plugin / Codex Skill·Plugin.

## 구성

```
perf-summary-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .codex-plugin/
│   └── plugin.json          # Codex Plugin manifest
├── .agents/
│   └── skills/
│       └── perf-summary/
│           └── SKILL.md     # Codex repo-local Skill forwarding
├── commands/
│   ├── year.md              # Claude: /perf-summary:year
│   ├── month.md             # Claude: /perf-summary:month
│   └── since.md             # Claude: /perf-summary:since
└── skills/
    └── perf-summary/
        └── SKILL.md         # 공통 canonical Skill 지침
```

## 필수 조건

- `gh` CLI 설치 및 인증 (`gh auth login`)
- 조회 대상 조직/레포에 대한 권한
- Private repo 조회가 필요하면 `gh auth login --scopes repo`

## Claude Code 설치/업데이트/사용법

### 로컬 테스트

플러그인 루트에서:

```bash
claude --plugin-dir .
```

세션 안에서:

```text
/perf-summary:year 2025
```

### 설치

#### 마켓플레이스 등록

```text
/plugin marketplace add eoeo0326/perf-summary-plugin
```

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

#### 플러그인 설치

```text
/plugin install perf-summary@perf-summary-marketplace
```

#### 플러그인 Reload

```text
/reload-plugins
```

### 업데이트

#### 마켓플레이스 업데이트

```text
/plugin marketplace update perf-summary-marketplace
```

#### 플러그인 업데이트

```text
/plugin update perf-summary@perf-summary-marketplace
```

변경사항이 바로 보이지 않으면 `/reload-plugins` 후 새 세션에서 다시 호출한다.

### 사용 방법

Claude Code에서는 두 가지 방식 중 편한 쪽을 사용한다.

- **모드별 단축 명령** — `/perf-summary:year`, `/perf-summary:month`, `/perf-summary:since`
- **단일 진입점** — `/perf-summary --year`, `/perf-summary --month`, `/perf-summary --since`

```text
/perf-summary:year 2025
/perf-summary:year 2025 --org acme
/perf-summary:month 2025-03
/perf-summary:month 2025-03 --repo acme/web
/perf-summary:since 2025-03 --until 2025-06
/perf-summary --year 2025
```

## Codex 설치/업데이트/사용법

Codex에서는 Claude Code의 `/perf-summary:year` 같은 namespaced slash command를 기본 사용법으로 제공하지 않는다.
대신 `$perf-summary` Skill 호출 또는 자연어 요청을 사용한다.

### 설치 없이 repo-local Skill로 사용

이 저장소를 Codex에서 열면 `.agents/skills/perf-summary`를 통해 repo-local Skill로 사용할 수 있다.
새 thread에서 `$perf-summary`를 명시 호출하거나 자연어로 요청한다.

```text
$perf-summary --year 2025
$perf-summary --month 2026-05
$perf-summary --since 2025-03 --until 2025-06
perf-summary 스킬로 2025년 GitHub 활동 보고서 만들어줘
```

Skill 목록에 보이지 않으면 Codex에서 새 thread를 열거나 Skills를 다시 로드한다.

### Codex Plugin으로 설치

이 저장소는 `.codex-plugin/plugin.json`을 포함하므로 Codex Plugin으로도 설치할 수 있다.
로컬 개발 중에는 personal marketplace에 이 플러그인 디렉터리를 연결해 테스트하는 방식이 가장 단순하다.

1. 플러그인 소스를 personal marketplace 기본 위치에 연결한다.

```bash
mkdir -p ~/plugins ~/.agents/plugins
ln -sfn "$(pwd)" ~/plugins/perf-summary
```

2. `~/.agents/plugins/marketplace.json`에 `perf-summary` entry를 추가한다.
   파일이 없다면 아래 형태로 만들고, 이미 있다면 `plugins` 배열에 entry만 추가한다.

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "perf-summary",
      "source": {
        "source": "local",
        "path": "./plugins/perf-summary"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

3. Codex 앱의 **Plugins** 화면 또는 Codex CLI의 `/plugins`에서 `personal` marketplace의 `perf-summary`를 설치/활성화한다.
4. 새 thread에서 `$perf-summary`를 호출한다.

### Codex 업데이트

사용 방식에 따라 업데이트 방법이 다르다.

- **repo-local Skill 사용**: 이 저장소를 최신 상태로 `git pull` 한 뒤 새 Codex thread에서 다시 사용한다.
- **personal marketplace Plugin 사용**: 플러그인 소스가 symlink로 연결되어 있으면 파일 변경은 원본 저장소를 따라간다. Codex가 이전 플러그인 캐시를 계속 쓰면 `.codex-plugin/plugin.json`의 `version`에 build metadata를 갱신한다.

예:

```json
{
  "version": "0.7.0+codex.local-20260607-210000"
}
```

그다음 Codex 앱의 **Plugins** 화면 또는 CLI `/plugins`에서 플러그인을 다시 설치/활성화하고, 새 thread에서 테스트한다.

> 참고: `~/.codex/prompts` 기반 `/prompts:...` 커스텀 프롬프트로 로컬 단축어를 만들 수도 있지만, Codex에서는 deprecated 기능이고 저장소/플러그인으로 공유되지 않는다. 기본 사용법은 `$perf-summary` Skill 호출이다.

## 공통 옵션

모든 모드에 함께 쓸 수 있는 보조 인자.

> **다중 GitHub 계정** — `gh auth login` 으로 등록된 모든 계정의 PR 을 기본으로 통합 집계한다. 특정 계정만 보고 싶으면 `--account <login>` (쉼표로 다중) 로 좁힐 수 있다. 실행 중 active 계정이 일시적으로 전환되지만 종료(또는 `Ctrl-C`) 시 원래 active 로 자동 복원된다.

| 인자                            | 필수 | 설명                                                                |
|-------------------------------|----|-------------------------------------------------------------------|
| `--org <org>`                 | ❌  | 조직명. 쉼표로 여러 개 가능. 미지정 시 본인이 PR을 작성한 **모든 조직**                     |
| `--repo <owner/repo>`         | ❌  | 특정 레포만 집계. `--org` 보다 우선. 미지정 시 **모든 레포**                         |
| `--account <login>[,<login>]` | ❌  | 집계 대상 gh 계정 login. 쉼표로 여러 개. **미지정 시 `gh auth status` 의 모든 계정 자동 집계** |
| `--output <path>`             | ❌  | 출력 경로 강제 지정 (단일 보고서 모드 한정. 연간 모드에선 무시)                            |

## 모드별 사용법

### 연간 모드

해당 연도(1/1 ~ 12/31)를 **월별 12개 + 연간 종합 1개** 보고서로 한 번에 생성한다.
연간 종합에는 월별 추이 표가 포함된다.

```text
# Claude Code
/perf-summary:year 2025
/perf-summary:year 2025 --org acme
/perf-summary --year 2025

# Codex
$perf-summary --year 2025
$perf-summary --year 2025 --org acme
```

### 월별 모드

해당 월 1일~말일을 단일 보고서로 생성한다. 윤년은 자동 처리한다.

- **현재 달**(오늘이 속한 달)을 입력하면 기간이 **오늘까지**로 잘리고 파일명/제목에도 반영된다.
- **미래 달**은 에러로 종료한다.

```text
# Claude Code
/perf-summary:month 2025-03
/perf-summary:month 2025-03 --repo acme/web
/perf-summary --month 2025-03

# Codex
$perf-summary --month 2025-03
$perf-summary --month 2025-03 --repo acme/web
```

### 기간 모드

자유 기간을 단일 보고서로 생성한다. `--since` 와 `--until` 모두 **연/월/일 부분 형식**을 받으며, `--until` 은 생략 가능하다.

| 인자                                         | 필수 | 설명                                                          |
|--------------------------------------------|----|-------------------------------------------------------------|
| 첫 번째 positional / `--since YYYY[-MM[-DD]]` | ✅  | 시작일. `YYYY` → 1/1, `YYYY-MM` → 해당 월 1일, `YYYY-MM-DD` → 그대로 |
| `--until YYYY[-MM[-DD]]`                   | ❌  | 종료일. 생략 시 오늘. `YYYY` → 12/31, `YYYY-MM` → 해당 월 말일       |

```text
# Claude Code
/perf-summary:since 2025-03
/perf-summary:since 2025-03 --until 2025-06
/perf-summary --since 2025-03 --until 2025-06

# Codex
$perf-summary --since 2025-03
$perf-summary --since 2025-03 --until 2025-06
```

> `/perf-summary:year 2025`(월별 분할 + 연간 종합)와 `/perf-summary:since 2025 --until 2025`(같은 1년 기간이지만 **단일** 보고서)는 출력 구조가 다르다.

## 출력

기본 출력 위치는 현재 작업 디렉토리 하위 `PerformanceSummary/` 폴더.

```
PerformanceSummary/
└── {YYYY}/
    ├── {since}_{until}.md          # 기간/월별 모드: 한 개
    └── ...                         # 연간 모드: 월별 12개 + 연간 종합 1개
```

`--output <path>` 를 주면 그 경로로 저장한다. 연간 모드에서는 `--output`을 무시한다.

## 보고서 구성

- **한눈에 보기** — 총 PR 수(merged/open/closed/draft), 활동 레포 수, 변경 라인·파일·커밋 합계
- **연간 종합** *(연간 모드 한정)* — 1년 흐름을 1~2 단락 서사형 회고로 정리 + 핵심 성취 5~10 항목
- **이력서 항목 추천** — 모든 보고서에 포함. 이력서·평가 자료에 그대로 올릴 만한 4~8 굵직한 성취. 정량 지표(라인·PR 수·도메인)와 출처 PR 번호 동반
- **레포별 활동** — 변경량 내림차순으로 정렬된 레포별 통계
  - **기간 작업 요약** — 해당 기간 동안 그 레포에서 한 굵직한 작업을 테마별로 묶은 종합 요약. PR 1건뿐이면 생략
  - **PR 목록** — 기본은 접힘(`<details>`)으로 노출. PR별 변경 라인·상태와 함께 PR 본문/커밋 메시지에서 추출한 작업 내용 2~4 불릿 첨부
- **월별 추이** *(연간 모드 한정)* — 연간 종합 보고서 끝에 월별 PR/merged/추가·삭제 라인/커밋 합계 표

`연간 종합` 과 `이력서 항목 추천` 은 PR 본문/커밋 메시지에서 직접 정량 지표와 함께 추출한 narrative 라, 이력서·평가 자료에 그대로 옮겨 쓸 수 있도록 작성된다.

## 주의사항

- `gh search prs` 는 결과 최대 1000건. 활동이 많으면 기간을 분기/월 단위로 쪼개 합산한다. 연간 모드는 자동 처리한다.
- Private repo 는 `gh auth login --scopes repo` 필요.
- PR 워크플로 기준이라 직접 push 커밋은 변경 라인에 누락된다.
- Codex Plugin에는 MCP 서버가 포함되어 있지 않다. 현재 구현은 Skill 지침을 따라 Codex가 로컬 `gh` CLI를 실행하는 방식이다.

## 라이선스

MIT
