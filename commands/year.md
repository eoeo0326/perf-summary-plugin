---
description: 해당 연도의 월별 보고서와 연간 종합 생성
argument-hint: <YYYY> [--org <org>] [--repo <owner/repo>] [--account <login>]
---

perf-summary Skill을 year 모드로 실행한다.

- 입력: `$ARGUMENTS`. 첫 positional 인자를 `--year` 값으로 해석한다.
- 기간 인자가 없으면 사용자에게 묻는다.
- 플러그인의 `skills/perf-summary/SKILL.md`를 읽어 공통 입력 해석과 CLI 실행 절차를 따른다.
- 공통 스킬에 포함된 CLI의 `plan`, `collect_activity`, `get_report_context`를 사용한다. 별도 MCP 등록을 요구하거나 임의의 셸 수집 로직으로 대체하지 않는다.
