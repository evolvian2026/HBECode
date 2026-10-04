import type { DbQuestionInput } from '@hbe/shared';
import { MOVIE_SCHEMA, MOVIES_A, MOVIES_B, mds, mongoQuestion, movieSets } from './mongo-common.js';

const A = mds({ movies: MOVIES_A }, '');
const B = mds({ movies: MOVIES_B }, '');
const sampleA = (explanation: string) => ({ ...A, explanation });
const sampleB = (explanation: string) => ({ ...B, explanation });
const common = { schemaDisplay: MOVIE_SCHEMA, collection: 'movies' } as const;

// --- Easy --------------------------------------------------------------------------------------

const releasedIn = mongoQuestion({
  ...common,
  title: 'Movies Released in 2015',
  statement: 'Return `{ title }` (no `_id`) for every movie released in **2015**, sorted by `title` (A→Z). Use `find`.',
  difficulty: 'easy',
  tags: ['mongodb', 'find', 'filter'],
  samples: [sampleA('Monsoon Letters and Paper Garden are from 2015.'), sampleB('No movie is from 2015: no documents.')],
  hidden: movieSets(1401, [[1, { years: [2015, 2015] }], [10, { years: [2014, 2016] }], [30, { years: [2010, 2020] }], [60, { years: [2013, 2017] }], [5, { years: [1995, 2000] }], [120, {}], [200, { years: [2015, 2016] }], [40, { years: [2012, 2018] }]]),
  solution: { find: { filter: { year: 2015 }, projection: { _id: 0, title: 1 }, sort: { title: 1 } } },
});

const dramas = mongoQuestion({
  ...common,
  title: 'All the Dramas',
  statement: 'Return `{ title, year }` (no `_id`) for every movie whose `genres` include **Drama**, oldest first; movies from the same year are sorted by `title`.',
  difficulty: 'easy',
  tags: ['mongodb', 'find', 'arrays'],
  samples: [sampleA('Quiet Harbour (2003), then Monsoon Letters (2015).'), sampleB('Only Velvet Echo is a drama.')],
  hidden: movieSets(1411, [[1, { maxGenres: 1 }], [8, {}], [25, { years: [2010, 2012] }], [50, {}], [100, { maxGenres: 1 }], [12, { maxGenres: 3 }], [250, { years: [2000, 2004] }], [35, {}]]),
  solution: { find: { filter: { genres: 'Drama' }, projection: { _id: 0, title: 1, year: 1 }, sort: { year: 1, title: 1 } } },
});

const topRated = mongoQuestion({
  ...common,
  title: 'Three Best-Rated Movies',
  statement:
    'Return `{ title, rating }` (no `_id`) for the three highest-rated movies (fewer if there are fewer movies). Ties on `rating` go to the movie with more `votes`, then to the `title` that sorts first.',
  difficulty: 'easy',
  tags: ['mongodb', 'find', 'sort', 'limit'],
  samples: [sampleA('Quiet Harbour 8.6, Monsoon Letters 8.1, then Northern Signal beats Paper Garden (both 7.2) on votes.'), sampleB('Only two movies exist.')],
  hidden: movieSets(1421, [[1, {}], [3, { coarse: true }], [10, {}], [40, { coarse: true }], [80, {}], [200, { coarse: true }], [6, { coarse: true }], [30, {}]]),
  solution: { find: { filter: {}, projection: { _id: 0, title: 1, rating: 1 }, sort: { rating: -1, votes: -1, title: 1 }, limit: 3 } },
});

const goodNoughties = mongoQuestion({
  ...common,
  title: 'Good Movies From the 2000s',
  statement:
    'Return `{ title, year, rating }` (no `_id`) for movies released from 2000 to 2009 (inclusive) with a `rating` of at least 7. Sort by `rating` (highest first), then `title`.',
  difficulty: 'easy',
  tags: ['mongodb', 'find', 'range'],
  samples: [sampleA('Quiet Harbour (2003, 8.6) and Northern Signal (2008, 7.2). Paper Garden is rated 7.2 but is from 2015.'), sampleB('Golden Desert is from 2001 but rated only 6.0: no documents.')],
  hidden: movieSets(1431, [[1, { years: [2005, 2005] }], [10, { years: [1998, 2011] }], [30, {}], [60, { years: [1999, 2010] }], [100, { coarse: true }], [8, { years: [2009, 2010] }], [250, {}], [40, { years: [2000, 2001] }]]),
  solution: { find: { filter: { year: { $gte: 2000, $lte: 2009 }, rating: { $gte: 7 } }, projection: { _id: 0, title: 1, year: 1, rating: 1 }, sort: { rating: -1, title: 1 } } },
});

// --- Moderate ----------------------------------------------------------------------------------

const shortOrFunny = mongoQuestion({
  ...common,
  title: 'Short or Funny, Not From the USA or UK',
  statement:
    'Return `{ title, runtime }` (no `_id`) for movies that are a **Comedy** or run under **90** minutes (or both), and whose director is **not** from the USA or the UK. Sort by `runtime`, then `title`.',
  difficulty: 'moderate',
  tags: ['mongodb', 'find', '$or', '$nin'],
  samples: [sampleA('Paper Garden (comedy, 88 min, France) and Northern Signal (comedy, Korea). Endless Train runs 92 minutes and is not a comedy.'), sampleB('Velvet Echo runs 85 minutes; its director is from India.')],
  hidden: movieSets(1441, [[1, { maxGenres: 1 }], [10, {}], [30, { directors: 6 }], [60, {}], [100, { maxGenres: 2 }], [15, { directors: 4 }], [250, {}], [40, { maxGenres: 1 }]]),
  solution: {
    find: {
      filter: { $or: [{ genres: 'Comedy' }, { runtime: { $lt: 90 } }], 'director.country': { $nin: ['USA', 'UK'] } },
      projection: { _id: 0, title: 1, runtime: 1 },
      sort: { runtime: 1, title: 1 },
    },
  },
});

const indianDirectors = mongoQuestion({
  ...common,
  title: 'Well-Rated Movies by Indian Directors',
  statement:
    'Return `{ title, director, rating }` (no `_id`) for movies whose director is from **India** and that are rated at least **6**, where `director` is the director\'s **name** (a string, not the nested object). Sort by `rating` (highest first), then `title`.',
  difficulty: 'moderate',
  tags: ['mongodb', 'find', 'nested-fields', 'projection'],
  samples: [sampleA('Monsoon Letters (A. Rao, 8.1). Endless Train is by an Indian director but rated 5.9.'), sampleB('Velvet Echo by F. Mehta.')],
  hidden: movieSets(1451, [[1, { directors: 1 }], [10, {}], [30, { coarse: true }], [60, {}], [120, { directors: 6 }], [15, { directors: 1, coarse: true }], [250, {}], [40, {}]]),
  solution: { find: { filter: { 'director.country': 'India', rating: { $gte: 6 } }, projection: { _id: 0, title: 1, director: '$director.name', rating: 1 }, sort: { rating: -1, title: 1 } } },
});

const actionThrillers = mongoQuestion({
  ...common,
  title: 'Three-Genre Action Thrillers',
  statement:
    'Return `{ title, year }` (no `_id`) for movies tagged with **both** Action and Thriller that have **exactly three** genres. Sort by `year` (newest first), then `title`.',
  difficulty: 'moderate',
  tags: ['mongodb', 'find', '$all', '$size'],
  samples: [sampleA('Northern Signal is Action, Comedy and Thriller. Iron Orbit has both but only two genres.'), sampleB('No movie qualifies.')],
  hidden: movieSets(1461, [[3, {}], [20, {}], [50, {}], [100, {}], [150, { years: [2010, 2014] }], [30, {}], [300, {}], [80, { years: [2000, 2005] }]]),
  solution: { find: { filter: { genres: { $all: ['Action', 'Thriller'], $size: 3 } }, projection: { _id: 0, title: 1, year: 1 }, sort: { year: -1, title: 1 } } },
});

const secondPage = mongoQuestion({
  ...common,
  title: 'Second Page of the Catalogue',
  statement:
    'The catalogue lists movies newest first (by `year`), and movies from the same year by `title`. Pages hold **2** movies. Return page **2** (the 3rd and 4th movies) as `{ title, year }` (no `_id`); it may be short or empty.',
  difficulty: 'moderate',
  tags: ['mongodb', 'find', 'pagination', 'skip'],
  samples: [sampleA('Order: Endless Train, Iron Orbit, Monsoon Letters, Paper Garden, … — page 2 is Monsoon Letters and Paper Garden (both 2015, by title).'), sampleB('Only two movies: page 2 is empty.')],
  hidden: movieSets(1471, [[3, {}], [4, { years: [2010, 2011] }], [10, {}], [30, { years: [2000, 2002] }], [60, {}], [5, { years: [2020, 2020] }], [200, {}], [25, {}]]),
  solution: { find: { filter: {}, projection: { _id: 0, title: 1, year: 1 }, sort: { year: -1, title: 1 }, skip: 2, limit: 2 } },
});

// --- Hard --------------------------------------------------------------------------------------

const wonBestDirector = mongoQuestion({
  ...common,
  title: 'Won Best Director',
  statement:
    'Return `{ title }` (no `_id`) for every movie that **won** the "Best Director" award: its `awards` contain one entry whose `name` is "Best Director" **and** whose `won` is true. Sort by `title`.',
  difficulty: 'hard',
  tags: ['mongodb', 'find', '$elemMatch'],
  samples: [
    sampleA('Monsoon Letters won Best Director. Northern Signal was nominated for Best Director (not won) and won Best Script, so it does not count.'),
    sampleB('Both movies won Best Director.'),
  ],
  hidden: movieSets(1481, [[2, {}], [10, {}], [30, {}], [60, {}], [100, {}], [20, {}], [250, {}], [45, {}]]),
  solution: { find: { filter: { awards: { $elemMatch: { name: 'Best Director', won: true } } }, projection: { _id: 0, title: 1 }, sort: { title: 1 } } },
});

const bigEarners = mongoQuestion({
  ...common,
  title: 'Earned Three Times the Budget',
  statement:
    'Return `{ title, multiple }` (no `_id`) for movies whose `gross` is at least **3 ×** their `budget`, where `multiple` is `gross / budget` rounded to 1 decimal with `$round`. Sort by `title`. Use `find` (a projection may contain expressions).',
  difficulty: 'hard',
  tags: ['mongodb', 'find', '$expr', 'projection'],
  samples: [sampleA('Endless Train 30/6 = 5, Monsoon Letters 35/10 = 3.5, Quiet Harbour 51/8 = 6.375 → 6.4. Iron Orbit only made 2.7×.'), sampleB('Velvet Echo made 9/2 = 4.5×; Golden Desert lost money.')],
  hidden: movieSets(1491, [[1, {}], [10, {}], [30, {}], [60, {}], [100, {}], [15, {}], [250, {}], [40, {}]]),
  solution: {
    find: {
      filter: { $expr: { $gte: ['$gross', { $multiply: [3, '$budget'] }] } },
      projection: { _id: 0, title: 1, multiple: { $round: [{ $divide: ['$gross', '$budget'] }, 1] } },
      sort: { title: 1 },
    },
  },
});

export const MONGO_QUERIES: DbQuestionInput[] = [releasedIn, dramas, topRated, goodNoughties, shortOrFunny, indianDirectors, actionThrillers, secondPage, wonBestDirector, bigEarners];
