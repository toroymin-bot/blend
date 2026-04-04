# Blend Daily Report - GAS 설정 가이드

## 1단계: Google Apps Script 프로젝트 생성

1. https://script.google.com 접속
2. **새 프로젝트** 클릭
3. 프로젝트 이름: `Blend Daily Report`
4. `BlendDailyReport.gs` 내용을 Code.gs에 붙여넣기

## 2단계: API 키 설정

1. GAS 에디터 → **프로젝트 설정** (톱니바퀴)
2. **스크립트 속성** 섹션에서 추가:

| 속성 | 값 | 필수 |
|------|---|------|
| `GEMINI_API_KEY` | Google AI Studio에서 발급 (aistudio.google.com/apikey) | 필수 |

## 3단계: 트리거 설정

1. GAS 에디터 → **트리거** (시계 아이콘)
2. **트리거 추가** 클릭
3. 설정:
   - 실행할 함수: `sendBlendDailyReport`
   - 이벤트 소스: 시간 기반
   - 트리거 유형: 일 타이머
   - 시간: 오전 3시~4시 (Claude 작업 완료 후)

## 4단계: 테스트

1. GAS 에디터에서 `testSendReport` 함수 실행
2. roy@ai4min.com으로 테스트 메일 수신 확인

## 데이터 업데이트 방식

### 방법 1: 스크립트 속성에 직접 저장 (수동)
GAS 에디터 → 프로젝트 설정 → 스크립트 속성에 `BLEND_REPORT_DATA` 추가

### 방법 2: Web App으로 배포 (자동)
1. GAS 에디터 → 배포 → 새 배포
2. 유형: 웹 앱
3. 실행 주체: 나
4. 액세스 권한: 누구나
5. 배포 URL을 복사
6. Claude Code 스케줄 태스크에서 작업 후 POST 요청:
```
curl -X POST "DEPLOY_URL" \
  -H "Content-Type: application/json" \
  -d '{"dayNumber":2,"files":30,"lines":4000,...}'
```

## itnews와 같은 구조

| 항목 | itnews | Blend |
|------|--------|-------|
| GAS 함수 | sendDailyNewsDigest | sendBlendDailyReport |
| 발송 시간 | 오전 8시 | 오전 3시 |
| 수신자 | toroymin@gmail.com | roy@ai4min.com |
| Gemini | 뉴스 요약 | 작업 현황 요약 |
| TTS | 한국어+영어 MP3 | 없음 (추후 추가 가능) |
