# perf-summary

GitHub PR 활동을 수집·집계해 이력서와 성과 평가용 Markdown 보고서를 만드는 **로컬 MCP 서버 + Claude Code / Codex 플러그인**입니다.

- 공개 npm 패키지: [`perf-summary-mcp`](https://www.npmjs.com/package/perf-summary-mcp), 버전 `1.1.0`
- 실행: 사용자 PC의 Node.js 프로세스, stdio MCP. 운영 서버·HTTP 포트 없음
- 인증: 기존 `gh auth login` 재사용, 다중 계정 지원
- 집계: 사용자 PC 시간대의 **PR 생성일** 기준
- 보고서 문장: 연결한 AI 에이전트가 작성. 별도 LLM API 키 불필요

## 필수 조건

- Node.js **22 이상**, 권장 **24 LTS**
- 최신 [GitHub CLI](https://cli.github.com/) (`gh auth status --json hosts`, `gh auth token --user` 지원)
- 조회할 계정으로 `gh auth login`
- Private repo 접근 권한 및 필요한 조직 SSO 승인. classic OAuth 인증의 repo 범위가 필요하면 `gh auth refresh -h github.com -s repo`

기본으로 `github.com`에 로그인한 모든 계정을 집계합니다. 각 계정의 인증을 개별 API 자식 프로세스에만 적용하므로 `gh auth switch`로 전역 활성 계정을 바꾸지 않습니다. 토큰 환경변수보다 **gh에 저장된 계정**을 사용하며, 서버가 토큰을 파일에 저장하거나 모델에 반환하지 않습니다. GitHub Enterprise와 토큰만 사용하는 인증은 현재 지원하지 않습니다.

로컬 실행이어도 GitHub 조회에는 네트워크가 필요합니다. AI 보고서 작성을 위해 선택한 PR 근거가 연결된 에이전트에 전달됩니다.

## npm으로 설치·등록

기존 플러그인이 동일 MCP를 제공하면 수동 등록을 중복하지 마세요.

### Codex CLI / 앱 / IDE

```bash
codex mcp add perf-summary -- npx -y perf-summary-mcp@1.1.0
codex mcp list
```

또는 `~/.codex/config.toml`이나 신뢰한 프로젝트의 `.codex/config.toml`에 추가합니다.

```toml
[mcp_servers.perf-summary]
command = "npx"
args = ["-y", "perf-summary-mcp@1.1.0"]
startup_timeout_sec = 60
tool_timeout_sec = 120
```

첫 npx 실행에는 패키지 다운로드 시간이 필요합니다. 앱을 다시 시작하거나 새 세션에서 연결을 확인하세요. [공식 문서](https://developers.openai.com/codex/mcp/)

파일 저장 도구는 클라이언트의 쓰기 승인 정책을 따릅니다. 비대화형 Codex에서 승인 정책이 `never`이면 `write_report`가 차단될 수 있습니다. 이 경우 클라이언트의 정상 승인 흐름으로 저장을 허용하거나 미리보기로 사용하세요.

### Claude Code

```bash
claude mcp add --transport stdio --scope user perf-summary -- npx -y perf-summary-mcp@1.1.0
claude mcp list
```

프로젝트에 공유하려면 `--scope project`를 사용합니다. 세션에서는 `/mcp`로 상태를 확인합니다. [공식 문서](https://code.claude.com/docs/en/mcp)

### Cursor / Claude Desktop

Cursor는 `.cursor/mcp.json` 또는 `~/.cursor/mcp.json`에 다음 설정을 추가합니다. Claude Desktop은 해당 앱의 MCP 설정 파일에서 같은 `mcpServers` 구조를 사용합니다.

```json
{
  "mcpServers": {
    "perf-summary": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "perf-summary-mcp@1.1.0"]
    }
  }
}
```

[Cursor 문서](https://cursor.com/docs/mcp)

### VS Code / GitHub Copilot

`.vscode/mcp.json`은 최상위 키가 `servers`입니다.

```json
{
  "servers": {
    "perf-summary": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "perf-summary-mcp@1.1.0"]
    }
  }
}
```

[VS Code 문서](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

### 전역 설치 / Windows / PATH

```bash
npm install -g perf-summary-mcp@1.1.0
perf-summary-mcp --version
```

전역 설치 후 MCP의 `command`를 `perf-summary-mcp`, `args`를 `[]`로 설정할 수 있습니다. `npx` 방식도 npm 캐시를 사용하므로 전역 설치가 필수는 아닙니다.

Windows에서 클라이언트가 `npx`를 직접 실행하지 못하면 다음 설정을 사용합니다.

```json
{
  "command": "cmd",
  "args": ["/d", "/s", "/c", "npx -y perf-summary-mcp@1.1.0"]
}
```

GUI 앱은 터미널의 nvm·셸 PATH를 그대로 상속하지 않을 수 있습니다. 이때 `node`의 절대경로와 전역 설치된 `dist/mcp/server.js`의 절대경로를 등록하세요. `npm root -g`로 설치 폴더를 확인할 수 있습니다. `gh`도 MCP 프로세스의 PATH에서 찾을 수 있어야 합니다. Windows에서는 `gh.exe`가 있는 폴더를 PATH에 포함합니다.

MCP는 앱이 시작하는 자식 프로세스입니다. 별도 터미널에서 서버를 계속 켜둘 필요가 없고 브라우저로 접속하는 localhost 주소도 없습니다. 원격 전용 웹 클라이언트는 사용자 PC의 stdio 프로세스에 직접 연결할 수 없습니다.

## 사용 방법

MCP만 등록해도 자연어로 요청할 수 있습니다.

```text
perf-summary로 2025년 GitHub 성과 보고서를 월별·연간으로 만들어줘
2026년 5월에 acme/app에서 작성한 PR을 정리해줘
alice 계정의 2025-03부터 2025-06까지 성과를 저장하지 말고 보여줘
```

Claude 플러그인은 `/perf-summary:year`, `/perf-summary:month`, `/perf-summary:since`를, Codex Skill은 `$perf-summary`를 제공합니다.

```text
/perf-summary:year 2025 --org acme
/perf-summary:month 2025-03 --repo acme/app
/perf-summary:since 2025-03 --until 2025-06 --account alice,bob
$perf-summary --year 2025
$perf-summary --month 2025-03 --output ./reports/march.md
```

| 옵션 | 동작 |
|---|---|
| `--year YYYY` | 월별 보고서 + 연간 종합. 과거 연도 13개, 현재 연도 현재 월까지 + 종합, 미래 연도 0개 |
| `--month YYYY-MM` | 해당 월 단일 보고서. 현재 월은 오늘까지, 미래 월은 오류 |
| `--since YYYY[-MM[-DD]]` | 단일 기간 시작일. 연도만 입력하면 1월 1일, 월만 입력하면 해당 월 1일 |
| `--until YYYY[-MM[-DD]]` | 단일 기간 종료일. 생략하면 오늘, 부분 날짜는 해당 연·월 마지막 날 |
| `--org a,b` | 조직 필터. 생략하면 전체 |
| `--repo owner/repo` | 레포 필터. 조직 조건보다 우선 |
| `--account alice,bob` | 계정 필터. 생략하면 모든 gh 인증 계정 |
| `--output path` | 단일 보고서 출력 경로. 연간 모드에서는 무시하고 안내 |
| `--dry-run` / `--output none` | 파일을 쓰지 않는 미리보기 |

year/month/since 중 하나만 사용합니다. until은 since에 종속됩니다. `--year 2025`는 월별·연간 분할이며 `--since 2025 --until 2025`는 같은 기간의 단일 보고서입니다.

## MCP 도구 API

| 도구 | 주요 인자 | 결과 |
|---|---|---|
| `check_environment` | 없음 | Node·gh 버전, PC 시간대, 계정별 인증 상태·오류 |
| `collect_activity` | `year` / `month` / `since`, `until?`, `orgs?`, `repo?`, `accounts?` | `collectionId`, 정규화된 `period`, `period.reports` 출력 계획 |
| `get_activity` | `collectionId`, `cursor?`, `month?`, `repo?`, `pageSize?` | 진행 상태, 완료 후 필터 범위 전체의 `summary`, PR 근거 페이지, `nextCursor` |
| `cancel_collection` | `collectionId` | 취소 요청 여부. 실제 종료는 get_activity로 확인 |
| `get_report_context` | `mode?`: year/month/range | 공통 작성 지침과 템플릿 |
| `write_report` | `absolutePath`, `markdown`, `overwrite?` | 저장 여부·경로. 충돌 시 `written:false`, `reason:"exists"` |

기간 값은 모두 문자열입니다. orgs와 accounts는 쉼표 문자열이 아닌 문자열 배열입니다.

```json
{
  "year": "2025",
  "orgs": ["acme"],
  "accounts": ["alice", "bob"]
}
```

수집 흐름:

1. `check_environment` → `get_report_context`로 환경·규칙 확인.
2. `collect_activity`로 시작. 완료까지 블로킹하지 않고 ID를 반환.
3. `get_activity`의 `status:"running"` 동안 `nextPollAfterMs` 이상 기다렸다가 조회.
4. 완료 후 필요한 월·레포별로 `nextCursor`가 없을 때까지 조회. 페이지 기본 10개, 최대 25개이며 PR 근거는 응답당 약 32 KiB로 제한. 필터를 바꾸면 cursor를 초기화.
5. 모델이 근거 기반으로 보고서를 작성하고 작업 폴더 기준 절대경로로 `write_report` 호출.

`status`는 `running`, `completed`, `partial`, `failed`, `cancelled`입니다. **`complete:true`일 때만 완전한 수집 결과**입니다. 실패한 상세 PR은 수치 합계에 포함하지 않고 `issues`와 `progress.failed`에 표시합니다. issues는 처음 100개와 전체 issueCount를 제공하며, 초과 시 issuesTruncated가 true입니다. 인증 실패를 포함한 부분 결과는 사용자가 요청한 경우에만 명시적인 누락 표시와 함께 보고서로 만듭니다.

동시에 최대 2개 수집, 전체 상세 조회 최대 4개, 검색 요청은 수집당 최대 1,000회입니다. GitHub Search의 한도 초과·불완전 응답은 날짜 구간을 분할하고, 더 이상 분할하거나 복구할 수 없으면 누락을 표시합니다. 단일 gh 요청은 45초 제한이며 일시 오류는 최대 3회 시도합니다. API가 요청한 대기가 30초를 넘으면 rate limit 오류를 반환합니다.

결과는 서버 프로세스 메모리에만 보관합니다. 최대 20개 결과를 보관하며, 완료 결과는 1시간 미사용 후 만료됩니다. 프로세스 종료 시 수집도 취소되고 재시작 후에는 재수집해야 합니다.

MCP resource `perf-summary://report-guidelines`와 prompt `performance-summary`도 제공합니다. 이 기능을 지원하지 않는 클라이언트는 get_report_context 도구만 사용해도 됩니다. 서버는 MCP SDK v2 stdio와 기존 initialize 방식의 클라이언트를 지원합니다.

## 보고서와 통계 해석

기본 출력은 **사용자 작업 폴더** 아래입니다.

```text
PerformanceSummary/2025/
├── 2025-01-01_2025-01-31.md
├── ...
└── year_2025-01-01_2025-12-31.md
```

작업 폴더가 이미 PerformanceSummary 하위이면 그 루트를 사용해 중복 경로를 만들지 않습니다. 서버는 프로젝트를 추측하지 않습니다. 에이전트가 전달한 절대 `.md` 경로만 사용하고, 설치 폴더·npm 캐시에는 보고서를 만들지 않습니다. 기존 파일은 기본적으로 보존하며 overwrite=true일 때만 교체합니다.

- TL;DR, 한눈에 보기, 이력서 항목 추천, 레포별 테마 요약과 접힌 PR 목록
- 연간 종합에는 회고·핵심 성취·도메인 분포·키워드·월별 추이 추가
- 공통 규칙: [resources/report-guidelines.md](resources/report-guidelines.md)
- PR의 **생성일**로 포함 여부와 월을 결정합니다. 한국 PC는 Asia/Seoul의 자정 경계를 사용합니다. 병합 월이 달라도 생성 월에 집계합니다.
- PR 상태·전체 변경량은 조회 시점 기준입니다. 과거 기간 보고서를 나중에 다시 만들면 PR 상태와 변경량이 달라질 수 있습니다.
- commits는 GitHub totalCount이며 축약한 메시지 개수가 아닙니다. commits·changedFiles는 PR별 합계이므로 같은 커밋·파일이 여러 PR에 있으면 중복될 수 있습니다. 직접 push 커밋은 제외합니다.
- 수집 시작의 시간대와 시각을 고정합니다. DST와 현지 날짜 경계를 UTC로 변환해 검색하며 같은 경계로 최종 필터링합니다.
- 본문은 callout·테스트 템플릿 제거 후 1,500자, 커밋 제목은 처음 20개·각 200자, 파일 경로는 처음 10개·각 300자까지 제공하고 축약 여부를 표시합니다.
- Release/ 제목 또는 release/ 브랜치의 PR은 본문·메시지·파일 근거 조회를 생략하고 메타데이터만 사용합니다.

## 기존 플러그인 설치·업데이트

### Claude Code

npm 패키지가 먼저 게시되어 있어야 합니다. 플러그인의 루트 `.mcp.json`이 고정 버전 MCP를 등록합니다.

```text
/plugin marketplace add eoeo0326/perf-summary-plugin
/plugin install perf-summary@perf-summary-marketplace
/reload-plugins
```

업데이트:

```text
/plugin marketplace update perf-summary-marketplace
/plugin update perf-summary@perf-summary-marketplace
/reload-plugins
```

로컬 개발은 `claude --plugin-dir .`로 Skill·명령을 확인할 수 있지만, 아직 게시되지 않은 MCP 버전은 [로컬 등록](#로컬-개발과-게시-전-사용)으로 별도 검증하세요.

### Codex

이 저장소에서는 `.agents/skills/perf-summary`를 통해 repo-local Skill을 사용할 수 있습니다. MCP는 별도로 등록해야 하며 새 작업에서 `$perf-summary`를 호출합니다.

Codex 플러그인은 `.codex-plugin/plugin.json`에 공통 Skill과 `.mcp.json`을 선언합니다. 기존 personal marketplace에서 이 저장소를 참조하는 사용자는 플러그인을 업데이트·재설치한 뒤 새 작업에서 사용합니다. 새로 연결할 때는 Codex의 로컬 플러그인 설치 흐름에 따라 이 저장소를 personal marketplace에 등록하세요. 플러그인 버전 변경은 MCP 버전과 함께 관리합니다.

Skill은 입력 해석과 도구 호출을 담당합니다. MCP가 없을 때 과거 bash/awk/Python 수집 절차로 대체하지 않고 설치를 안내합니다.

## 로컬 개발과 게시 전 사용

```bash
npm ci
npm run check
npm run test:package
```

실행 파일 직접 등록(경로는 실제 절대경로로 교체):

```bash
codex mcp add perf-summary -- node /absolute/path/perf-summary-plugin/dist/mcp/server.js
claude mcp add --transport stdio --scope user perf-summary -- node /absolute/path/perf-summary-plugin/dist/mcp/server.js
```

전역 npm 설치를 통한 게시 전 검증도 가능합니다.

```bash
npm pack
npm install -g ./perf-summary-mcp-1.1.0.tgz
perf-summary-mcp --version
```

구성:

```text
src/                날짜·집계·gh 어댑터·수집 관리·저장·MCP 진입점
resources/          모델에 제공하는 공통 보고서 지침
skills/, commands/  기존 에이전트 플러그인의 진입점
scripts/            릴리스 정합성·실제 패키지 설치 검증
test/               날짜·인증·페이지·취소·저장·MCP 테스트
.github/workflows/  Node 22/24 × macOS/Linux/Windows CI
```

`npm run test:package`는 임시 폴더에 실제 tgz를 설치합니다. 개발 의존성·설치 스크립트 없이, 다른 작업 디렉터리에서 실행한 MCP의 도구·resource·prompt·보고서 저장을 검증하고 임시 파일을 정리합니다. 테스트는 GitHub 쓰기 작업이나 인증 전환을 실행하지 않습니다.

## 릴리스 절차

1. 변경 검토 후 `npm run check`, `npm run test:package`와 CI를 통과시킵니다.
2. package.json, 두 플러그인 매니페스트, `.mcp.json`, 설치 안내의 버전을 함께 갱신합니다.
3. `npm whoami`로 게시 계정을 확인합니다. 인증되지 않았다면 별도 터미널에서 `npm login`을 실행합니다.
4. `npm view perf-summary-mcp version`으로 이름 소유권·기존 버전을 확인합니다. 404만으로 이름 예약 가능성이 보장되지는 않습니다.
5. `npm publish --access public`을 실행합니다. prepublishOnly가 검사와 실제 패키지 설치 검증을 다시 실행합니다.
6. `npm view perf-summary-mcp@1.1.0 version` 및 게시 패키지의 npx 실행을 확인합니다.
7. 그 버전을 참조하는 플러그인 변경을 커밋·푸시하고 같은 버전으로 GitHub 릴리스를 만듭니다. npm이 게시되기 전에는 플러그인 릴리스를 공개하지 않습니다.

npm에는 컴파일된 dist, resources, README, LICENSE, package.json만 포함합니다. 토큰·사용자 보고서·개발 로컬 설정은 포함하지 않습니다. 자동 npm 게시 workflow는 만들지 않았으며, 게시 계정의 인증·2FA 또는 npm이 지원하는 trusted publishing 설정이 필요합니다.

## 라이선스

MIT
