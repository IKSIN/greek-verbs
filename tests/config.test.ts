import { describe, it, expect } from 'vitest';
import { resolveRepoConfig } from '../src/lib/config';

describe('resolveRepoConfig', () => {
  it('derives owner/repo from GitHub Pages URL', () => {
    expect(resolveRepoConfig({ hostname: 'asin.github.io', pathname: '/greek/' }, {})).toEqual({
      owner: 'asin', repo: 'greek', path: 'data/words.json', branch: 'main',
    });
  });
  it('falls back to env in local dev', () => {
    expect(resolveRepoConfig({ hostname: 'localhost', pathname: '/' }, { VITE_GH_OWNER: 'o', VITE_GH_REPO: 'r' }))
      .toMatchObject({ owner: 'o', repo: 'r' });
  });
  it('null when nothing known', () => {
    expect(resolveRepoConfig({ hostname: 'localhost', pathname: '/' }, {})).toBeNull();
    expect(resolveRepoConfig({ hostname: 'asin.github.io', pathname: '/' }, {})).toBeNull();
  });
});
