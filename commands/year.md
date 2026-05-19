---
description: 해당 연도(1/1~12/31)를 월별 12개 + 연간 1개 보고서로 분할 생성
argument-hint: <YYYY> [--org <org>] [--repo <owner/repo>]
---

perf-summary skill 을 year 모드로 실행한다.

- 입력 인자: `$ARGUMENTS`
- 첫 번째 positional 인자는 4자리 연도(`YYYY`). 누락되면 사용자에게 묻고 진행
- 나머지는 `--org` / `--repo` 같은 추가 flag 그대로 SKILL 인자 검증으로 전달
- 이후 처리는 `skills/perf-summary/SKILL.md` 의 §0 year 모드 + §1~§8 절차를 그대로 따른다 (입력 다이어트 §2-1 포함)
