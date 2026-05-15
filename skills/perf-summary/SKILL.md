---
name: perf-summary
description: GitHub 활동(내가 작성한 PR + 커밋 통계)을 기간/조직별로 집계해 이력서·성과 평가용 Markdown 보고서를 생성합니다. 사용자가 "성과 정리", "기여도 요약", "GitHub 활동 정리", "perf summary", "performance summary" 등을 요청하거나 /perf-summary 명령을 호출했을 때 발동합니다. gh CLI를 사용해 PR(state/리뷰/병합 정보)과 변경 라인·파일·커밋 수를 수집한 뒤 PerformanceSummary/{시작연도}/{since}_{until}.md 에 저장합니다.
---

# Performance Summary Skill

`gh` CLI를 활용해 본인의 GitHub PR과 커밋 통계를 기간별로 집계한 뒤,
이력서/평가 자료에 바로 쓸 수 있는 Markdown 보고서를 생성합니다.

## 입력 인자

| 인자 | 필수 | 설명 |
|---|---|---|
| `--since YYYY-MM-DD` | ✅ | 집계 시작일(포함) |
| `--until YYYY-MM-DD` | ✅ | 집계 종료일(포함) |
| `--org <org>` | △ | 조직명. 쉼표로 여러 개 가능 (`deep-medi-backend,deep-medi-Android`). `--repo` 없으면 필수 |
| `--repo <owner/repo>` | △ | 특정 레포만 집계. `--org`보다 우선. 단독 사용 시 `--org` 생략 가능 |
| `--output <path>` | ❌ | 출력 경로 강제 지정. 미지정 시 기본 경로 사용 |

## 실행 순서

### 1. 사전 점검
- `gh auth status` 로 인증 확인
- `gh api user --jq '.login'` 로 현재 로그인 사용자(`$LOGIN`) 획득
- 인자 검증:
  - `--since`, `--until`가 `YYYY-MM-DD` 형식인지 확인
  - `--repo`도 `--org`도 없으면 사용자에게 어느 쪽을 쓸지 물어볼 것
  - 기간이 너무 길어 1000건을 초과할 위험이 있으면 경고

### 2. PR 수집

레포 지정 시:
```bash
gh search prs \
  --author="$LOGIN" \
  --repo="$REPO" \
  --created="$SINCE..$UNTIL" \
  --limit 1000 \
  --json number,title,state,isDraft,createdAt,closedAt,url,repository,labels
```

조직 지정 시: org별로 반복 (또는 `--owner=$ORG` 사용)

> `gh search prs`의 `--json` 필드는 부족하므로, 각 PR의 상세(additions/deletions/commits/changedFiles/mergedAt 등)는 아래 명령으로 보강:
```bash
gh pr view "$URL" --json number,title,state,createdAt,mergedAt,closedAt,additions,deletions,changedFiles,commits,reviews,url,repository
```
- 너무 많으면 `xargs -P 4` 같은 병렬 호출로 속도 개선
- merged 여부는 `mergedAt != null` 로 판정 (state는 closed지만 mergedAt이 있으면 merged)

### 3. 집계 (Python 또는 jq)

`jq`로도 충분하지만 가독성/속도를 위해 Python 권장:

```python
# 카테고리: merged / open / closed_not_merged / draft
# 합산: PRs, commits, additions, deletions, changedFiles
# 그룹: 레포별
```

### 4. Markdown 렌더링

아래 템플릿으로 작성:

```markdown
# Performance Summary ({since} ~ {until})

> Author: @{login}
> Generated: {now ISO8601}
> Scope: {org or repo list}

## 한눈에 보기

| 지표 | 값 |
|---|---|
| 총 PR | {N}개 (merged {M} / open {O} / closed {C} / draft {D}) |
| 활동 레포 수 | {R}개 |
| 변경 라인 | +{add} / -{del} |
| 변경 파일 | {files}개 |
| 총 커밋 | {commits}개 |

## 레포별 활동

### {owner/repo}
- PR: {N}개 (merged {M})
- 변경: +{add} / -{del} (파일 {f}개)
- 커밋: {c}개
- 주요 PR: [{title}]({url})

## PR 상세

### Merged ({M}개)
| 날짜 | 레포 | 제목 | 변경 |
|---|---|---|---|
| {mergedAt} | {repo} | [{title}]({url}) (#{num}) | +{add}/-{del} |

### Open ({O}개)
...

### Closed (not merged) ({C}개)
...
```

빈 섹션(0개)은 렌더링하지 말 것.

### 5. 저장

기본 경로: `<현재 작업 디렉토리>/PerformanceSummary/{since의 YYYY}/{since}_{until}.md`
- 현재 디렉토리가 이미 `PerformanceSummary` 하위면 그대로 사용
- 디렉토리 없으면 `mkdir -p`
- 같은 파일이 있으면 사용자에게 덮어쓰기 여부 확인
- `--output` 지정 시 그 경로 그대로 사용

### 6. 결과 보고

- 저장 경로
- 핵심 수치(총 PR/merged/추가-삭제 라인)
- 다음 행동 제안 (예: 다른 기간 추가 조회)

## 사용 예시

```
/perf-summary --org deep-medi-Android --since 2025-01-01 --until 2025-12-31
/perf-summary --repo deep-medi-Android/some-repo --since 2025-Q1 --until 2025-Q2
/perf-summary --org deep-medi-backend,deep-medi-Android,deep-medi-SDK --since 2026-01-01 --until 2026-05-15
```

## 주의사항

- **Search API 한도**: `gh search prs`는 결과 최대 1000건. 기간이 길고 활동이 많으면 분기/월 단위로 쪼개서 조회 후 합산
- **Private repo**: `gh auth login --scopes repo` 로 권한이 있어야 보임
- **시간대**: GitHub은 UTC 기준. 한국 시간으로 보고싶다면 사용자에게 확인
- **변경 라인 통계의 한계**: PR에 포함되지 않은 직접 push 커밋은 카운팅 안 됨. PR 워크플로 기준이라는 점을 보고서에 명시
- 너무 큰 PR(자동 생성, 의존성 업데이트 등)은 라벨로 필터링하거나 결과에서 분리 표시 권장

## 비실행 모드

사용자가 단순 미리보기만 원하면 `--dry-run`처럼 동작 — 파일 저장 없이 콘솔에만 출력. 사용자가 `--output none`이나 "저장하지 말고 보여만 줘"라고 하면 이 모드 적용.
