# Quick Translator (간편 번역기)

채팅 입력창 위에 작은 번역창을 띄워, 입력한 글을 번역한 뒤 채팅창에 넣어주는 실리태번 확장.

## 설치
확장 → Install extension 에 저장소 URL 입력, 또는 이 폴더를
`SillyTavern/public/scripts/extensions/third-party/QuickTranslator/` 에 복사 후 새로고침.

## 사용
- 마법봉 메뉴 → 번역기 (또는 플로팅 버튼 / 설정의 "번역창 열기")
- 입력 후 [번역] 또는 Ctrl+Enter
- [새로 번역]: 같은 원문으로 새 응답 추가 (최대 5개, 넘으면 가장 오래된 것부터 삭제)
- 결과 클릭으로 선택 → [채팅창에 입력]. 더블클릭하면 바로 입력
- 헤더 클릭: 접기/펼치기 (기록 유지) / × 닫기: 기록 완전 삭제
- 번역 기록은 메모리에만 있고 설정 파일·채팅에 저장되지 않음

## 설정 (확장 탭 → 간편 번역기)
- 연결 프로필 + 연결 테스트 (프로필은 Connection Manager에서 만든 것. 미선택 시 현재 API 사용)
- 입력/출력 언어
- 번역 프롬프트: {{text}} {{source}} {{target}} 사용 가능
- 반드시 지시할 사항: 시스템 메시지로 전달
- 최대 토큰, 마법봉 표시, 플로팅 버튼 표시

권장 실리태번 버전: 1.13 이상 (ConnectionManagerRequestService 필요)
