---
description: 해당 월 보고서 생성, 현재 달은 오늘까지
argument-hint: <YYYY-MM> [--org <org>] [--repo <owner/repo>] [--account <login>]
---

perf-summary Skill을 month 모드로 실행한다.

- 입력: `$ARGUMENTS`. 첫 positional 인자를 `--month` 값으로 해석한다.
- 기간 인자가 없으면 사용자에게 묻는다.
- 플러그인의 `skills/perf-summary/SKILL.md`를 읽어 공통 입력 해석과 MCP 호출 절차를 따른다.
- `collect_activity`와 `get_report_context`를 사용하며 별도의 셸 수집 로직을 실행하지 않는다.
