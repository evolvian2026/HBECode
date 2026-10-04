import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { int, pick, rng, type Rng } from './common.js';

/** A MongoDB dataset: collection name → documents (EJSON, so `{ "$date": … }` becomes a Date). */
export const mds = (collections: Record<string, unknown[]>, explanation = ''): DbDataset => ({ setup: { mongodb: JSON.stringify(collections) }, explanation, weight: 1 });

export function mongoQuestion(
  q: Omit<DbQuestionInput, 'type' | 'dialects' | 'compare' | 'starters' | 'solutions' | 'isPractice' | 'mode' | 'timeLimitMs'> & {
    collection: string;
    solution: { pipeline: unknown[] } | { find: Record<string, unknown> };
    timeLimitMs?: number;
  },
): DbQuestionInput {
  const { collection, solution, ...rest } = q;
  const starter = 'pipeline' in solution ? `{\n  "collection": "${collection}",\n  "pipeline": [\n  ]\n}\n` : `{\n  "collection": "${collection}",\n  "find": {\n    "filter": {}\n  }\n}\n`;
  return {
    type: 'db',
    dialects: ['mongodb'],
    isPractice: true,
    mode: 'query',
    ...rest,
    compare: { orderSensitive: true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
    starters: { mongodb: starter },
    solutions: { mongodb: JSON.stringify({ collection, ...solution }, null, 2) },
    timeLimitMs: q.timeLimitMs ?? 2000,
  };
}

// --- movies ------------------------------------------------------------------------------------

export interface Movie {
  _id: number;
  title: string;
  year: number;
  genres: string[];
  runtime: number;
  rating: number;
  votes: number;
  budget: number;
  gross: number;
  director: { name: string; country: string };
  awards: { name: string; won: boolean }[];
}
export const GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Thriller'];
export const COUNTRIES = ['France', 'India', 'Japan', 'Korea', 'UK', 'USA'];
export const AWARDS = ['Best Director', 'Best Film', 'Best Music', 'Best Script'];
const ADJ = ['Silent', 'Golden', 'Broken', 'Hidden', 'Last', 'Crimson', 'Endless', 'Paper', 'Iron', 'Midnight', 'Northern', 'Quiet', 'Rising', 'Second', 'Wild', 'Lost', 'Velvet', 'Burning', 'Frozen', 'Electric'];
const NOUN = ['River', 'Garden', 'Empire', 'Monsoon', 'Letter', 'Harbour', 'Signal', 'Kingdom', 'Orbit', 'Train', 'Mirror', 'Festival', 'Desert', 'Island', 'Promise', 'Lantern', 'Station', 'Voyage', 'Echo', 'Horizon'];
const DIRECTORS = ['A. Rao', 'B. Kim', 'C. Dubois', 'D. Sato', 'E. Clarke', 'F. Mehta', 'G. Park', 'H. Moreau', 'I. Tanaka', 'J. Hughes', 'K. Iyer', 'L. Brooks'];
const DIRECTOR_COUNTRY: Record<string, string> = { 'A. Rao': 'India', 'B. Kim': 'Korea', 'C. Dubois': 'France', 'D. Sato': 'Japan', 'E. Clarke': 'UK', 'F. Mehta': 'India', 'G. Park': 'Korea', 'H. Moreau': 'France', 'I. Tanaka': 'Japan', 'J. Hughes': 'USA', 'K. Iyer': 'India', 'L. Brooks': 'USA' };

function sample<T>(r: Rng, xs: readonly T[], k: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

export interface MovieOpts {
  years?: [number, number];
  maxGenres?: number;
  directors?: number;
  /** Coarse ratings (whole numbers) make ties common. */
  coarse?: boolean;
}
export function movies(seed: number, n: number, o: MovieOpts = {}): Movie[] {
  const r = rng(seed);
  const [y0, y1] = o.years ?? [1995, 2024];
  const titles = sample(r, ADJ.flatMap((a) => NOUN.map((b) => `The ${a} ${b}`)), n);
  const dirs = DIRECTORS.slice(0, o.directors ?? DIRECTORS.length);
  return titles.map((title, i) => {
    const dir = pick(r, dirs);
    const budget = int(r, 2, 200);
    return {
      _id: i + 1,
      title,
      year: int(r, y0, y1),
      genres: sample(r, GENRES, int(r, 1, o.maxGenres ?? 3)).sort(),
      runtime: int(r, 75, 190),
      rating: o.coarse ? int(r, 4, 9) : int(r, 30, 95) / 10,
      votes: int(r, 1, 500) * 100,
      budget,
      gross: Math.round(budget * int(r, 0, 60)) / 10,
      director: { name: dir, country: DIRECTOR_COUNTRY[dir]! },
      awards: sample(r, AWARDS, int(r, 0, 3)).map((name) => ({ name, won: r() < 0.4 })),
    };
  });
}

/** A small hand-written catalogue used by the samples. */
export const MOVIES_A: Movie[] = [
  { _id: 1, title: 'Monsoon Letters', year: 2015, genres: ['Drama', 'Romance'], runtime: 128, rating: 8.1, votes: 42000, budget: 10, gross: 35, director: { name: 'A. Rao', country: 'India' }, awards: [{ name: 'Best Director', won: true }, { name: 'Best Film', won: false }] },
  { _id: 2, title: 'Iron Orbit', year: 2019, genres: ['Action', 'Thriller'], runtime: 141, rating: 6.4, votes: 150000, budget: 150, gross: 410, director: { name: 'J. Hughes', country: 'USA' }, awards: [{ name: 'Best Music', won: false }] },
  { _id: 3, title: 'Paper Garden', year: 2015, genres: ['Comedy'], runtime: 88, rating: 7.2, votes: 9000, budget: 3, gross: 2.5, director: { name: 'C. Dubois', country: 'France' }, awards: [] },
  { _id: 4, title: 'Northern Signal', year: 2008, genres: ['Action', 'Comedy', 'Thriller'], runtime: 104, rating: 7.2, votes: 61000, budget: 40, gross: 95, director: { name: 'B. Kim', country: 'Korea' }, awards: [{ name: 'Best Director', won: false }, { name: 'Best Script', won: true }] },
  { _id: 5, title: 'Quiet Harbour', year: 2003, genres: ['Drama'], runtime: 97, rating: 8.6, votes: 88000, budget: 8, gross: 51, director: { name: 'D. Sato', country: 'Japan' }, awards: [{ name: 'Best Film', won: true }] },
  { _id: 6, title: 'Endless Train', year: 2021, genres: ['Horror', 'Thriller'], runtime: 92, rating: 5.9, votes: 23000, budget: 6, gross: 30, director: { name: 'K. Iyer', country: 'India' }, awards: [] },
];
export const MOVIES_B: Movie[] = [
  { _id: 1, title: 'Golden Desert', year: 2001, genres: ['Action'], runtime: 120, rating: 6.0, votes: 5000, budget: 20, gross: 10, director: { name: 'L. Brooks', country: 'USA' }, awards: [{ name: 'Best Film', won: false }, { name: 'Best Director', won: true }] },
  { _id: 2, title: 'Velvet Echo', year: 2012, genres: ['Drama', 'Romance'], runtime: 85, rating: 7.8, votes: 12000, budget: 2, gross: 9, director: { name: 'F. Mehta', country: 'India' }, awards: [{ name: 'Best Director', won: true }] },
];
export const MOVIE_SCHEMA =
  '**movies**\n\n```json\n{\n  "_id": 1, "title": "Monsoon Letters", "year": 2015,\n  "genres": ["Drama", "Romance"], "runtime": 128, "rating": 8.1, "votes": 42000,\n  "budget": 10, "gross": 35,\n  "director": { "name": "A. Rao", "country": "India" },\n  "awards": [ { "name": "Best Director", "won": true }, { "name": "Best Film", "won": false } ]\n}\n```\n\n' +
  '`title` is unique. `genres` is sorted and has 1–3 entries from Action, Comedy, Drama, Horror, Romance, Thriller. `runtime` is in minutes; `budget` and `gross` are in millions. `awards` lists nominations (possibly none); `won` says whether the nomination was won.';

export const movieSets = (seed: number, specs: [number, MovieOpts][]) => specs.map(([n, o], i) => mds({ movies: movies(seed + i, n, o) }));
