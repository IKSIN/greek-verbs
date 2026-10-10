import type { Conj, Direction } from './types';
import type { StatusFilter } from './filters';
import type { PracticeStatus } from './practice';

export const CONJ_LABELS: Record<Conj, string> = {
  A: 'A (γράφω)', B1: 'B1 (αγαπάω)', B2: 'B2 (μπορώ)', '-ομαι': '-ομαι (έρχομαι)', irregular: 'неправильный',
};
export const STATUS_LABELS: Record<StatusFilter, string> = {
  new: 'новое', learning: 'учу', learned: 'выучено', hard: 'трудное',
};
export const SOURCE_LABELS: Record<'base' | 'user', string> = { base: 'стартовый набор', user: 'добавлено' };
export const DIRECTION_LABELS: Record<Direction, string> = { 'el-ru': 'EL → RU', 'ru-el': 'RU → EL' };
export const PRACTICE_LABELS: Record<PracticeStatus, string> = {
  'not-started': 'не начато', 'in-progress': 'в процессе', mastered: 'освоено',
};
