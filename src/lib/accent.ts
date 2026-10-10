const TONOS: Record<string, string> = {
  α: 'ά', ε: 'έ', η: 'ή', ι: 'ί', ο: 'ό', υ: 'ύ', ω: 'ώ',
  Α: 'Ά', Ε: 'Έ', Η: 'Ή', Ι: 'Ί', Ο: 'Ό', Υ: 'Ύ', Ω: 'Ώ',
};
const PLAIN: Record<string, string> = Object.fromEntries(Object.entries(TONOS).map(([k, v]) => [v, k]));

/** Ставит/снимает тонос на последней гласной текущего слова перед курсором. */
export function toggleTonos(text: string, caret: number): string {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (/\s/.test(ch)) break;
    const repl = TONOS[ch] ?? PLAIN[ch];
    if (repl) return text.slice(0, i) + repl + text.slice(i + 1);
  }
  return text;
}
