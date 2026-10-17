/**
 * 초성 of an answer. The same rule as the SQL function fn_crossword_chosung (the database answers the student's
 * request; this copy exists for tests and for any client-side wording check):
 *   all Hangul syllables -> their initial consonants ("사과" -> "ㅅㄱ", double consonants kept: "까치" -> "ㄲㅊ")
 *   all A-Z               -> the first letter only
 *   digits, mixed, empty  -> null (no hint)
 */
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const HANGUL_BASE = 0xac00;
const SYLLABLES_PER_INITIAL = 588; // 21 vowels x 28 finals

export function chosungOf(word: string): string | null {
  if (!word) return null;
  if (/^[가-힣]+$/.test(word)) {
    return Array.from(word)
      .map((ch) => CHO[Math.floor(((ch.codePointAt(0) ?? HANGUL_BASE) - HANGUL_BASE) / SYLLABLES_PER_INITIAL)])
      .join("");
  }
  if (/^[A-Z]+$/.test(word)) return word[0];
  return null;
}
