import { describe, it, expect } from 'vitest';
import { toggleTonos } from '../src/lib/accent';

describe('toggleTonos', () => {
  it('accents vowel right before caret', () => expect(toggleTonos('γρα', 3)).toBe('γρά'));
  it('accents the last vowel of current word', () => expect(toggleTonos('γραφ', 4)).toBe('γράφ'));
  it('removes an existing tonos', () => expect(toggleTonos('γρά', 3)).toBe('γρα'));
  it('works mid-string', () => expect(toggleTonos('γραφω', 3)).toBe('γράφω'));
  it('uppercase', () => expect(toggleTonos('Ω', 1)).toBe('Ώ'));
  it('no vowel in current word -> unchanged', () => expect(toggleTonos('θα γρ', 5)).toBe('θα γρ'));
  it('empty -> unchanged', () => expect(toggleTonos('', 0)).toBe(''));
});
