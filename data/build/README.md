# data/build 스키마

`npm run build:data`가 만든다. 직접 고치지 않는다.

## entries/entries-NNNN.json
정렬 순서대로 500개씩. `seq`(정렬 순번, 0부터)로 참조한다. NNNN = floor(seq / 500).

| 필드 | 뜻 |
|---|---|
| seq | 정렬 순번 |
| id | 한국어기초사전 표제어 ID |
| w | 표제어 |
| hn | 다시 매긴 어깨번호 (0이면 표시 안 함) |
| ohn | 기초사전 원래 어깨번호 |
| pos | 품사 |
| grade | 기초 어휘 등급 (1 학령 전, 2 초1~2, 3 초3~4, 4 초5~6) |
| origin | 원어 (있을 때만) |
| senses[] | `id`, `def` 뜻풀이, `ex[]` 예문, `rel[]` 관련어(`type` 유의어/반대말, `w`) |

## notes/notes-NNNN.json
entries와 같은 순서로 500개씩. NNNN = floor(seq / 500). 조판에는 사용하지 않는다.

- `seq`, `w`, `hn`, `pos`, `grade`: entries와 같은 표제어 정보
- `pronunciation[]`: 발음 표기(표제어와 같은 발음은 생략)
- `forms[]`: 활용의 `w` 표기, `short[]` 준말 표기. 최대 4개
- `origin`: 원자료의 원어(있을 때만)
- `kind`: 어종(고유어·한자어·외래어·혼종어). 국립국어원 어휘 목록에서 가져오며, 원어로 가릴 수 없는 동형어끼리 어종이 다르거나 원어와 어긋나면 비우고, 원어가 한자뿐인 혼종어는 한자어로 고친다
- `senses[]`: 지면과 같은 뜻 순번 `n`(1부터), `sentences[]` 문장 최대 2개, `dialogue[]` 대화 1개의 발화별 원문
- `phrases[]`: 같은 기초사전 ID의 관용구·속담 최대 5개. `type`, `w` 표현, `def` 첫 뜻풀이
- `derived[]`: 파생어 표기 최대 5개
- `related[]`: 비슷한말·반대말의 `type`, `w`, 수록된 경우 첫 표제어의 `seq`

지면에 실린 예문은 제외한다. 빈 배열은 해당 정보가 없음을 뜻한다.
report/summary.json의 `notes.entriesWithInfo`는 정보가 있는 항목 수, `notes.totalBytes`는 notes 전체 바이트 수다.

## games/quick-find.json · games/open-once.json · games/base-form.json · games/word-kind.json
`data/games/quick-find.json`(낱말 빨리 찾기), `data/games/open-once.json`(한 번에 펼치기), `data/games/base-form.json`(기본형 탐정), `data/games/word-kind.json`(우리말 분류)의 문제 세트에 `seq`(entries 정렬 순번)를 추가한다.
한 번에 펼치기는 8세트·세트당 10문제이며 `level`은 쉬움(색인 사용) 또는 어려움(색인 없이)이다.
기본형 탐정은 9세트·세트당 5문제이며 `level`은 쉬움(1~3), 보통(4~6), 어려움(7~9)이다.
`before` + `form` + `after`가 문제 문장이고, `form`만 굵게 표시한다. `w`·`id`는 정답 표제어, `tip`은 정답 뒤 풀이이다.
우리말 분류는 9세트·세트당 8문제이며 `kind`는 정답 어종, `tip`은 정답 뒤 풀이(있을 때만)이다.
문제의 `id` 또는 `w`가 사전과 맞지 않거나 `kind`가 어휘 목록의 어종과 다르면 기존 빌드 결과를 지우기 전에 실패한다.
원본 문제 파일은 수정하지 않는다.

## {normal|large|xlarge}/index.json
`pageCount`, `fontSize`, `lineHeight`, `entryGap`, `indent`, `textWidth`, `textHeight`,
`kinds`(줄 조각 종류별 글꼴·배율), `sections[]`(색인 탭별 `start`/`end` 쪽과 쪽 수),
`entryPage[seq]`(표제어가 시작하는 쪽, 1부터), `guides[쪽-1]`(길잡이 낱말 [첫, 끝]).

## {size}/pages-NNNN.json
40쪽씩. NNNN = floor((쪽-1) / 40). 쪽마다:

- `n` 쪽 번호(1부터, 홀수가 오른쪽 면)
- `g` 길잡이 낱말 [첫, 끝]
- `l[]` 줄 목록. 줄마다:
  - `e` 이 줄이 속한 표제어의 seq
  - `r` 조각 목록 `[종류, 글]`. 종류: h 표제어, s 어깨번호, p 품사, n 뜻번호, d 뜻풀이, l 꼬리표, x 예문, r 관련어
  - `h`: 1이면 표제어가 시작하는 줄, `i`: 1이면 들여 쓰는 줄, `g`: 1이면 줄 앞에 항목 간격(`entryGap`)

## 앱이 지켜야 할 것
줄바꿈은 여기서 확정했다. 앱은 줄을 한 줄씩 `white-space: pre`로 그리고 다시 줄바꿈하지 않는다.
글꼴은 `assets/fonts`의 Pretendard를 쓰고 `font-kerning: none; letter-spacing: 0`으로 둔다.
