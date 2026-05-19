---
description: 해당 월 1일~말일(현재 달이면 오늘까지)을 단일 보고서로 생성
argument-hint: <YYYY-MM> [--org <org>] [--repo <owner/repo>]
---

perf-summary skill 을 month 모드로 실행한다.

- 입력 인자: `$ARGUMENTS`
- 첫 번째 positional 인자는 `YYYY-MM`. 누락되면 사용자에게 묻고 진행
- 미래 달은 SKILL §인자 검증 규칙대로 에러로 종료한다 (`UNTIL` 산출은 §0 month 모드 — 현재 달이면 오늘, 과거 달이면 말일)
- 이후 처리는 `skills/perf-summary/SKILL.md` 의 §0 month 모드 + §1~§6 절차를 그대로 따른다 (입력 다이어트 §2-1 포함)
