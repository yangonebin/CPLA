노무사 학습 플래너

=== 서버 주소 ===

https://cpla.onrender.com

=== 주요 기능 ===

1. 과목별 워드클라우드
   - 1교시: 노동법1, 노동법2
   - 2교시(경영학): 민법, 사회보험법, 경영학
   - "전체" 선택 시 모든 과목 자동 통합

2. 다개년 통합 워드클라우드
   - 최근 3개년 통합
   - 최근 5개년 통합
   - 페이지 연도 기준으로 과거 N년 조회

=== 재배포 전 DB 백업 방법 ===

[주의] Render 무료 플랜은 재배포 시 DB가 초기화됩니다.
재배포 전에 반드시 아래 순서대로 백업하세요.

1. 백업 (재배포 전)
   - 브라우저에서 로그인 후 아래 주소 접속
   - https://cpla.onrender.com/api/backup
   - checklist.db 파일이 자동으로 다운로드됨

2. 재배포
   - GitHub에 코드 푸시하면 Render가 자동으로 재배포

3. 복구 (재배포 후)
   - 브라우저에서 로그인 후 아래 주소 접속
   - https://cpla.onrender.com/restore.html
   - checklist.db 파일 선택 후 "복구하기" 클릭

=== 로컬 실행 ===

node server.js
http://localhost:3000
