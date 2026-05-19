---
description: 시작일부터 종료일(생략 시 오늘)까지의 단일 보고서 생성
argument-hint: <YYYY[-MM[-DD]]> [--until <YYYY[-MM[-DD]]>] [--org <org>] [--repo <owner/repo>]
---

perf-summary skill 을 range 모드로 실행한다.

- 입력 인자: `$ARGUMENTS`
- 첫 번째 positional 인자는 `--since` 값(`YYYY`/`YYYY-MM`/`YYYY-MM-DD`). 누락되면 사용자에게 묻고 진행
- `--until` 누락 시 SKILL 기본 동작(오늘 = `date '+%Y-%m-%d'`)을 따른다
- 부분 형식 정규화·`since <= until` 검증은 SKILL §0 range 모드 / §인자 검증 규칙대로
- 이후 처리는 `skills/perf-summary/SKILL.md` 의 §1~§6 절차를 그대로 따른다 (입력 다이어트 §2-1 포함)
