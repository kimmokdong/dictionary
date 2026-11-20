// 국어사전 배열 순서와 색인 구간 계산.

export const TABS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 초성 19개(ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ) → 색인 탭 14개. 쌍자음은 홑자음 구간에 든다.
const CHO_TO_TAB = [0, 0, 1, 2, 2, 3, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13];

// 유니코드 한글 음절(가~힣)은 초성→중성→종성 순으로 배열되어 있어 코드값 순서가 곧 사전 순서다.
// 한글 음절이 아닌 문자(띄어쓰기, 붙임표 등)는 비교에서 뺀다.
export function sortKey(word) {
  return word.normalize('NFC').replace(/[^가-힣]/g, '');
}

const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// 빈 종성 자리도 남겨야 '가게'가 '각'보다 먼저인 음절 순서를 설명할 수 있다.
export function jamoSlots(word) {
  return [...sortKey(word)].flatMap((ch) => {
    const n = ch.charCodeAt(0) - 0xac00;
    return [CHO[Math.floor(n / 588)], JUNG[Math.floor(n % 588 / 28)], JONG[n % 28]];
  });
}
export const decompose = (word) => jamoSlots(word).filter(Boolean);

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0; // 한글 음절은 모두 BMP라 코드 단위 비교로 충분하다
}

// 표기가 같으면 어깨번호 순.
export function compareEntries(a, b) {
  return cmpStr(a.key, b.key) || a.ohn - b.ohn || cmpStr(a.id, b.id);
}

export function tabIndex(word) {
  const cp = sortKey(word).charCodeAt(0);
  if (!(cp >= 0xac00 && cp <= 0xd7a3)) return -1;
  return CHO_TO_TAB[Math.floor((cp - 0xac00) / 588)];
}
