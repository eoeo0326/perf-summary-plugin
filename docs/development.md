# 개발 및 릴리스

[README로 돌아가기](../README.md)

소스를 수정하거나 배포를 준비할 때 사용하는 안내입니다. 일반 사용자는 [빠른 시작](../README.md#빠른-시작)으로 설치하면 됩니다.

[개발 환경](#개발-환경) · [게시 전 MCP 등록](#게시-전-mcp-등록) · [스킬 개발](#스킬-개발) · [릴리스 절차](#릴리스-절차)

## 개발 환경

저장소를 내려받은 폴더에서 실행합니다. Node.js 22 이상과 npm이 필요합니다.

```bash
npm ci
npm run check
npm run test:package
npm run test:skills
```

### 저장소 구성

```text
src/                날짜·집계·gh 어댑터·수집 관리·저장·MCP 진입점
resources/          정본에서 생성한 MCP용 보고서 지침·공통 원칙
skills/             perf-summary·resume-builder 정본·독립 실행 번들
docs/resume-writing-principles.md  두 스킬이 공유하는 작성 원칙 정본
commands/           기존 Claude 플러그인 호환 명령
scripts/            릴리스 정합성·실제 패키지 설치 검증
test/               날짜·인증·페이지·취소·저장·MCP 테스트
.github/workflows/  Node 22/24 × macOS/Linux/Windows CI
```

`npm run test:package`는 임시 폴더에 실제 tgz를 설치합니다. 개발 의존성·설치 스크립트 없이, 다른 작업 디렉터리에서 실행한 MCP의 도구·resource·prompt·보고서 저장을 검증하고 임시 파일을 정리합니다. 테스트는 GitHub 쓰기 작업이나 인증 전환을 실행하지 않습니다.


## 게시 전 MCP 등록

실행 파일을 직접 등록합니다. 경로는 실제 절대경로로 교체하세요.

```bash
codex mcp add perf-summary -- node /absolute/path/perf-summary-plugin/dist/mcp/server.js
claude mcp add --transport stdio --scope user perf-summary -- node /absolute/path/perf-summary-plugin/dist/mcp/server.js
```

전역 npm 설치를 통한 게시 전 검증도 가능합니다.

```bash
npm pack
npm install -g ./perf-summary-mcp-1.2.0.tgz
perf-summary-mcp --version
```


## 스킬 개발

정본 지침은 `skills/perf-summary`에서, 실행 코드는 `src/cli`와 기존 공통 모듈에서 수정합니다. `npm run build:skill`이 의존성을 포함한 실행 번들·라이선스와 기존 MCP용 지침 사본을 생성합니다. 생성된 번들은 Git에 함께 포함해야 `npx skills` 설치 후 빌드 없이 실행됩니다. `npm run check:skill`과 CI가 생성물의 최신 상태를 확인합니다.

이력서 작성 스킬은 `skills/resume-builder`, HTML 변환 소스는 `src/resume`에서 관리합니다. 공통 원칙은 `docs/resume-writing-principles.md`만 편집합니다. 빌드가 두 스킬의 references와 MCP resources에 동일한 원칙을 복사합니다. 사본은 직접 편집하지 않습니다. `get_report_context`는 보고서 지침과 원칙 전문을 합쳐 반환하고 기존 resource·prompt도 같은 내용을 제공합니다.

`resume-builder`는 에이전트가 전체 로컬 자료를 읽고 추천·근거·이력서 Markdown을 작성하는 스킬입니다. 새 GitHub 수집기나 LLM 실행 엔진을 추가하지 않습니다. HTML은 marked를 포함한 `render-resume.mjs`로 변환하고 기존 파일은 덮어쓰지 않습니다. `--no-html`은 스킬 단계에서 변환기 실행 자체를 생략합니다. 개인 산출물은 `ResumeDrafts/` 아래에 두며 Git에서 제외합니다.

`npm run test:skills`는 임시 프로젝트에서 실제 skills CLI로 Claude·Codex용 두 스킬을 각각 링크·복사 설치하고, 소스 저장소·개발 의존성·MCP 없이 실행합니다. fixture 기반 CLI/MCP 동등성 검증은 `npm test`에 포함됩니다. CLI API는 [references/cli.md](../skills/perf-summary/references/cli.md)를 참고하세요.

프로젝트 설치 시 Codex는 `.agents/skills`, Claude Code는 `.claude/skills`에서 스킬을 찾습니다. 실행 파일·지침·라이선스가 스킬 폴더에 포함되므로 설치 후 소스 저장소나 `node_modules`를 참조하지 않습니다.

스킬 CLI는 자동으로 로컬 수집 프로세스를 시작합니다. Unix socket 또는 Windows named pipe로 통신하며 HTTP 포트를 열지 않습니다. 임시 폴더에는 접속 정보만 저장하고 GitHub 토큰과 PR 근거는 메모리에 보관합니다. 진행 조회·취소·근거 페이지 조회를 지원하고, 1시간 유휴 후 자동 종료합니다. 프로세스가 종료되면 재수집해야 합니다.

## 릴리스 절차

1. 패키지·잠금 파일, 두 플러그인 매니페스트, `.mcp.json`, README와 이 문서·MCP 안내의 고정 버전 예시를 함께 갱신합니다.
2. `npm run build:skill`로 실행 번들·라이선스·지침 사본을 갱신하고 생성물을 변경사항에 포함합니다.
3. [릴리스 노트 템플릿](../.github/RELEASE_TEMPLATE.md)을 복사해 `docs/releases/v<버전>.md`를 작성합니다. **GitHub Release 제목은 `v<버전>`만** 사용하고 변경 요약과 설치·업데이트 안내는 본문에 담습니다. [v1.2.0 노트](releases/v1.2.0.md)를 참고하세요.
4. `npm run check`, `npm run test:package`, `npm run test:skills`와 CI를 통과시킵니다. 릴리스 PR을 검토·머지한 커밋에서 배포합니다.
5. `npm whoami`로 게시 계정을 확인합니다. 인증되지 않았다면 별도 터미널에서 `npm login`을 실행합니다.
6. `npm view perf-summary-mcp version`으로 이름 소유권·기존 버전을 확인합니다. 404만으로 이름 예약 가능성이 보장되지는 않습니다.
7. `npm publish --access public`을 실행합니다. `prepublishOnly`가 검사와 실제 패키지·스킬 설치 검증을 다시 실행합니다.
8. 아래 명령으로 공개 버전과 배포 파일 실행을 확인합니다. 게시 직후 처리·캐시 반영에 시간이 걸릴 수 있으므로 공개 조회 전 같은 버전을 다시 게시하지 않습니다.

   ```bash
   npm view perf-summary-mcp@1.2.0 version
   npx -y https://registry.npmjs.org/perf-summary-mcp/-/perf-summary-mcp-1.2.0.tgz --version
   ```

9. 배포 커밋에 같은 버전의 태그를 만들고 릴리스 노트를 본문으로 GitHub Release를 공개합니다. npm 배포 파일을 확인하기 전에는 GitHub Release를 공개하지 않습니다.

npm에는 컴파일된 `dist`, `resources`, README, LICENSE, package.json만 포함합니다. 토큰·사용자 보고서·개발 로컬 설정은 포함하지 않습니다. 자동 npm 게시 workflow는 없으며, 게시 계정의 인증·2FA 또는 npm이 지원하는 trusted publishing 설정이 필요합니다.
