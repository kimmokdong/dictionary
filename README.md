# 디지털 국어사전

초등학생용 종이 사전처럼 넘기고, 색인을 잡고, 옆면을 훑어 낱말을 찾는 웹 국어사전입니다. 서버·가입 없이 주소 하나로 씁니다.

- 기획: [기획서_v2.md](기획서_v2.md)
- 데이터 출처와 라이선스: [data/build/ATTRIBUTION.md](data/build/ATTRIBUTION.md) (CC BY-SA 2.0 KR)
- 글꼴: Pretendard ([assets/fonts/Pretendard-LICENSE.txt](assets/fonts/Pretendard-LICENSE.txt))

## 실행

정적 파일이라 아무 웹 서버로나 열면 됩니다.

```bash
python -m http.server 8765
```

## 데이터 다시 만들기

`data/build/`는 만들어 둔 결과물입니다. 다시 만들려면 원자료를 `data/raw/`에 넣고 실행합니다(원자료는 용량이 커서 저장소에 없습니다).

- `data/raw/krdict/krdict_json.zip`: 한국어기초사전 전체 내려받기(JSON), https://krdict.korean.go.kr
- `data/raw/nikl-vocab/`: 국어 기초 어휘 선정 및 어휘 등급화 목록, https://www.korean.go.kr

```bash
npm install
npm run build:data
npm test
```
