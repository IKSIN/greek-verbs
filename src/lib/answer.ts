export type AnswerResult = 'correct' | 'accent' | 'wrong';

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('el')
    .replace(/σ(?=$|[\s.,!?;:])/g, 'ς');
}

export function checkAnswer(input: string, expected: string): AnswerResult {
  const a = normalize(input);
  const b = normalize(expected);
  if (!a) return 'wrong';
  if (a === b) return 'correct';
  if (stripAccents(a) === stripAccents(b)) return 'accent';
  return 'wrong';
}
