# Railway 영구 스토리지 설정 가이드

## 문제점
Railway는 기본적으로 ephemeral filesystem을 사용하여 재배포 시 모든 파일이 삭제됩니다.
SQLite 데이터베이스가 재배포마다 초기화되는 문제가 발생합니다.

## 해결 방법: Railway Volume 사용

### 1. Railway 프로젝트에서 Volume 생성

1. Railway 대시보드에서 프로젝트 선택
2. **Variables** 탭 클릭
3. **+ New Variable** 클릭
4. 하단의 **+ Add Volume** 클릭
5. Volume 설정:
   - **Mount Path**: `/data` 입력
   - **Name**: `database-volume` (또는 원하는 이름)
6. **Add** 클릭

### 2. 환경 변수 설정

Volume을 생성하면 자동으로 `RAILWAY_VOLUME_MOUNT_PATH` 환경 변수가 생성됩니다.

확인 방법:
1. Railway 대시보드 → Variables 탭
2. `RAILWAY_VOLUME_MOUNT_PATH=/data` 확인

### 3. 코드 수정 (이미 적용됨)

```javascript
// server.js에 이미 적용됨
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'checklist.db')
    : './checklist.db';
```

### 4. 재배포

1. Git push 또는 Railway에서 수동 재배포
2. 로그에서 확인:
   ```
   📁 데이터베이스 경로: /data/checklist.db
   ```

### 5. 확인

- 재배포 후에도 데이터가 유지되는지 확인
- Volume에 저장된 파일은 재배포 시에도 보존됩니다

## 대안: PostgreSQL 사용 (추천)

더 안정적인 방법은 Railway PostgreSQL을 사용하는 것입니다:

1. Railway 대시보드에서 **+ New** → **Database** → **Add PostgreSQL**
2. 자동으로 `DATABASE_URL` 환경 변수 생성됨
3. 코드를 PostgreSQL 사용하도록 변경 (별도 작업 필요)

## 참고사항

- Volume은 프로젝트당 최대 100GB까지 무료
- SQLite는 소규모 프로젝트에 적합
- 트래픽이 많으면 PostgreSQL 권장
