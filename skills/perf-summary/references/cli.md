# 공통 CLI API

실제로 읽은 SKILL.md의 폴더 기준 `scripts/perf-summary.mjs`를 절대경로로 실행한다. 모든 공개 도구는 기존 MCP와 같은 JSON 입력·데이터를 사용한다. 각 명령은 한 번 실행 후 종료하며 수집만 자동 기동한 로컬 작업 프로세스에서 계속된다.

| 명령 | JSON 입력 |
|---|---|
| `check_environment` | `{}` |
| `collect_activity` | `{"year":"2025","orgs":["acme"],"accounts":["alice","bob"]}` 또는 month/since/until |
| `get_activity` | `{"collectionId":"UUID","pageSize":10,"month":"2025-03","repo":"acme/app","cursor":"이전 nextCursor"}` (collectionId 외는 선택) |
| `cancel_collection` | `{"collectionId":"UUID"}` |
| `get_report_context` | `{"mode":"year"}` (year/month/range, 생략 가능) |
| `write_report` | `{"absolutePath":"/사용자작업폴더/report.md","markdown":"# 보고서\n...","overwrite":false}` |

도구 호출은 `<명령> --input '<JSON>'`, 긴 보고서는 `<명령> --input -`로 표준입력 JSON을 사용한다. Windows에서도 절대경로로 `node`와 스크립트를 실행한다. 셸 구문은 호스트에 맞게 사용하고 PR 근거를 셸 코드에 삽입하지 않는다.

`get_activity`는 running/completed/partial/failed/cancelled, `complete`, `progress`, `period`, `accounts`, `issues`, `summary`, `prs`, `commitSummary`, `commitGroups`, `nextCursor`를 반환한다. running에서는 nextPollAfterMs 이상 기다린다. 페이지는 기본 10개·최대 25개이며 근거는 약 32 KiB로 제한한다. summary는 페이지가 아닌 해당 필터 범위 전체의 통계다. 필터 변경 시 cursor를 초기화하고 모든 페이지를 읽는다. issues는 처음 100개와 전체 issueCount 및 issuesTruncated를 제공한다.

동시 수집은 최대 2개, 두 수집 전체의 상세 조회는 최대 4개다. 결과는 최대 20개·완료 후 1시간 미사용까지 메모리에 보관한다. 런타임도 작업 없이 1시간이 지나면 종료한다. 재시작 후에는 재수집한다. 임시 폴더에는 접속 정보만 두며 PR 근거·GitHub 토큰·보고서는 보관하지 않는다. 설치 위치와 런타임 버전별로 프로세스를 구분한다. HTTP 포트·MCP 등록·서비스 설치는 필요 없다.

`--help`, `--version`을 지원한다. 문제 해결 시 `--stop-worker`로 해당 설치의 작업 프로세스를 종료할 수 있지만, 진행 중 수집과 보관 결과도 제거되므로 일반 보고서 실행에서는 사용하지 않는다. 실행 환경이 자식 프로세스나 로컬 IPC를 제한하면 해당 오류를 안내하고 정상 실행 권한을 확보해야 한다. MCP로 조용히 우회하거나 완전한 보고서를 지어내지 않는다.

`commitSummary`는 필터 범위 전체의 확정 커밋 수·작업 묶음 수·PR 연결 확인 필요 수다. `commitGroups`는 페이지별 근거이며 같은 `id`가 여러 페이지에 나타날 수 있다. `association=unknown`은 확정 커밋이 아니며 부분 수집으로 처리한다. `matchingCount`와 `summary`는 기존과 같이 PR만 뜻한다.

저장소 탐색 범위는 계정 소유·협업·조직 구성원 저장소다. 포크의 상위 저장소 PR 연결은 확인하지 못하므로 해당 커밋은 확인 필요로 표시하고 수집을 부분 완료로 처리한다.
