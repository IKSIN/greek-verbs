export interface RepoConfig { owner: string; repo: string; path: string; branch: string }

const PATH = 'data/words.json';
const BRANCH = 'main';

export function resolveRepoConfig(
  loc: { hostname: string; pathname: string },
  env: { VITE_GH_OWNER?: string; VITE_GH_REPO?: string },
): RepoConfig | null {
  const m = loc.hostname.match(/^([^.]+)\.github\.io$/i);
  const firstSeg = loc.pathname.split('/').filter(Boolean)[0];
  if (m && firstSeg) return { owner: m[1], repo: firstSeg, path: PATH, branch: BRANCH };
  if (env.VITE_GH_OWNER && env.VITE_GH_REPO) {
    return { owner: env.VITE_GH_OWNER, repo: env.VITE_GH_REPO, path: PATH, branch: BRANCH };
  }
  return null;
}
