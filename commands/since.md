---
description: 시작일~종료일의 단일 보고서 생성
argument-hint: <YYYY[-MM[-DD]]> [--org <org>] [--repo <owner/repo>] [--account <login>] [--until YYYY[-MM[-DD]]]
---

perf-summary Skill을 since 모드로 실행한다.

- 입력: `$ARGUMENTS`. 첫 positional 인자를 `--since` 값으로 해석한다.
- 기간 인자가 없으면 사용자에게 묻는다.
- 플러그인의 `skills/perf-summary/SKILL.md`를 읽어 공통 입력 해석과 CLI 실행 절차를 따른다.
- 공통 스킬에 포함된 CLI의 `plan`, `collect_activity`, `get_report_context`를 사용한다. 별도 MCP 등록을 요구하거나 임의의 셸 수집 로직으로 대체하지 않는다.
