export type AnswerResult = 'correct' | 'accent' | 'article' | 'wrong';

const ARTICLE = /^(?:ο|η|το|οι|τα)\s+(?=\S)/iu;

export function stripArticle(s: string): string {
  return s.trim().replace(ARTICLE, '');
}

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
  const bare = stripArticle(b);
  if (bare !== b && stripAccents(a) === stripAccents(bare)) return 'article';
  return 'wrong';
}
