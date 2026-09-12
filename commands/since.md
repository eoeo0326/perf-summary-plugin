---
description: 시작일~종료일의 단일 보고서 생성
argument-hint: <YYYY[-MM[-DD]]> [--org <org>] [--repo <owner/repo>] [--account <login>] [--until YYYY[-MM[-DD]]]
---

perf-summary Skill을 since 모드로 실행한다.

- 입력: `$ARGUMENTS`. 첫 positional 인자를 `--since` 값으로 해석한다.
- 기간 인자가 없으면 사용자에게 묻는다.
- 플러그인의 `skills/perf-summary/SKILL.md`를 읽어 공통 입력 해석과 MCP 호출 절차를 따른다.
- `collect_activity`와 `get_report_context`를 사용하며 별도의 셸 수집 로직을 실행하지 않는다.
