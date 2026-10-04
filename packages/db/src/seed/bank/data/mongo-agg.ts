import type { DbQuestionInput } from '@hbe/shared';
import { customerTotals } from '../../questions/db-questions.js';
import { int, pick, rng } from './common.js';
import { MOVIE_SCHEMA, MOVIES_A, MOVIES_B, mds, mongoQuestion, movies, movieSets } from './mongo-common.js';

const A = (explanation: string) => mds({ movies: MOVIES_A }, explanation);
const B = (explanation: string) => mds({ movies: MOVIES_B }, explanation);
const common = { schemaDisplay: MOVIE_SCHEMA, collection: 'movies' } as const;

// --- Easy --------------------------------------------------------------------------------------

const genreCounts = mongoQuestion({
  ...common,
  title: 'Movies per Genre',
  statement: 'Count the movies in each genre (a movie counts once for each of its genres). Return `{ genre, movies }` (no `_id`), sorted by `movies` (most first), then `genre`.',
  difficulty: 'easy',
  tags: ['mongodb', 'aggregation', '$unwind', '$group'],
  samples: [A('Thriller appears in 3 movies; Action, Comedy and Drama in 2; Horror and Romance in 1.'), B('Each genre appears once, so they are sorted by name.')],
  hidden: movieSets(1501, [[1, {}], [5, { maxGenres: 1 }], [20, {}], [50, {}], [100, {}], [10, { maxGenres: 2 }], [300, {}], [35, { maxGenres: 1 }]]),
  solution: {
    pipeline: [{ $unwind: '$genres' }, { $group: { _id: '$genres', movies: { $sum: 1 } } }, { $project: { _id: 0, genre: '$_id', movies: 1 } }, { $sort: { movies: -1, genre: 1 } }],
  },
});

const avgByYear = mongoQuestion({
  ...common,
  title: 'Average Rating per Year',
  statement: 'For every release year, return `{ year, avg_rating }` (no `_id`) where `avg_rating` is the average `rating` of that year\'s movies rounded to 2 decimals with `$round`. Sort by `year`.',
  difficulty: 'easy',
  tags: ['mongodb', 'aggregation', '$avg', '$round'],
  samples: [A('2015 has two movies: (8.1 + 7.2) / 2 = 7.65. Every other year has one movie.'), B('One movie per year.')],
  hidden: movieSets(1511, [[1, {}], [6, { years: [2020, 2021] }], [20, { years: [2010, 2014] }], [60, {}], [100, { years: [2000, 2003] }], [12, { coarse: true }], [300, {}], [40, { years: [2018, 2018] }]]),
  solution: {
    pipeline: [
      { $group: { _id: '$year', avg: { $avg: '$rating' } } },
      { $project: { _id: 0, year: '$_id', avg_rating: { $round: ['$avg', 2] } } },
      { $sort: { year: 1 } },
    ],
  },
});

const votesByCountry = mongoQuestion({
  ...common,
  title: 'Votes by Director Country',
  statement: 'Total the `votes` of all movies by the country of their director. Return `{ country, votes }` (no `_id`), sorted by `votes` (most first), then `country`.',
  difficulty: 'easy',
  tags: ['mongodb', 'aggregation', '$sum', 'nested-fields'],
  samples: [A('USA 150000, Japan 88000, India 42000 + 23000 = 65000, Korea 61000, France 9000.'), B('India 12000, USA 5000.')],
  hidden: movieSets(1521, [[1, {}], [6, { directors: 2 }], [20, {}], [50, { directors: 6 }], [120, {}], [10, {}], [300, {}], [30, { directors: 4 }]]),
  solution: {
    pipeline: [{ $group: { _id: '$director.country', votes: { $sum: '$votes' } } }, { $project: { _id: 0, country: '$_id', votes: 1 } }, { $sort: { votes: -1, country: 1 } }],
  },
});

const hoursMinutes = mongoQuestion({
  ...common,
  title: 'Runtime in Hours and Minutes',
  statement:
    'For every movie return `{ title, hours, minutes }` (no `_id`): its `runtime` split into whole hours and the remaining minutes (128 → 2 h 8 min). Sort by `runtime` (longest first), then `title`.',
  difficulty: 'easy',
  tags: ['mongodb', 'aggregation', '$project', 'arithmetic'],
  samples: [A('Iron Orbit runs 141 minutes = 2 h 21 min and comes first; Paper Garden (88 = 1 h 28 min) is last.'), B('120 minutes is exactly 2 h 0 min.')],
  hidden: movieSets(1531, [[1, {}], [4, {}], [15, {}], [40, {}], [90, {}], [8, {}], [250, {}], [30, {}]]),
  solution: {
    pipeline: [
      { $sort: { runtime: -1, title: 1 } },
      { $project: { _id: 0, title: 1, hours: { $floor: { $divide: ['$runtime', 60] } }, minutes: { $mod: ['$runtime', 60] } } },
    ],
  },
});

// --- Moderate ----------------------------------------------------------------------------------

type Review = { _id: number; movie_id: number; stars: number };
function reviews(seed: number, movieCount: number, n: number): Review[] {
  const r = rng(seed);
  // Skewed towards low ids so some movies get many reviews and others none.
  return Array.from({ length: n }, (_, i) => ({ _id: i + 1, movie_id: 1 + Math.floor(movieCount * r() * r()), stars: int(r, 1, 5) }));
}
const REVIEW_SCHEMA = `${MOVIE_SCHEMA}\n\n**reviews**\n\n\`\`\`json\n{ "_id": 1, "movie_id": 5, "stars": 4 }\n\`\`\`\n\n\`movie_id\` refers to \`movies._id\`; \`stars\` is 1–5.`;
const reviewedMovies = mongoQuestion({
  schemaDisplay: REVIEW_SCHEMA,
  collection: 'reviews',
  title: 'Review Summary per Movie',
  statement:
    'For every movie with at least one review, return `{ title, reviews, avg_stars }` (no `_id`): the number of reviews and the average `stars` rounded to 1 decimal with `$round`. Sort by `reviews` (most first), then `title`. You may start from either collection.',
  difficulty: 'moderate',
  tags: ['mongodb', 'aggregation', '$lookup'],
  samples: [
    mds({ movies: MOVIES_A, reviews: [{ _id: 1, movie_id: 1, stars: 5 }, { _id: 2, movie_id: 1, stars: 4 }, { _id: 3, movie_id: 2, stars: 3 }, { _id: 4, movie_id: 5, stars: 5 }, { _id: 5, movie_id: 5, stars: 4 }, { _id: 6, movie_id: 5, stars: 4 }] }, 'Quiet Harbour: 3 reviews averaging 4.33 → 4.3; Monsoon Letters: 2 reviews, 4.5; Iron Orbit: 1 review, 3. Movies without reviews are left out.'),
    mds({ movies: MOVIES_B, reviews: [{ _id: 1, movie_id: 2, stars: 2 }] }, 'Only Velvet Echo has a review.'),
  ],
  hidden: [[1, 1], [5, 3], [10, 30], [30, 100], [60, 50], [20, 0], [150, 600], [40, 200]].map(([m, n], i) => mds({ movies: movies(1541 + i, m!), reviews: reviews(1541 + i, m!, n!) })),
  solution: {
    pipeline: [
      { $group: { _id: '$movie_id', reviews: { $sum: 1 }, avg: { $avg: '$stars' } } },
      { $lookup: { from: 'movies', localField: '_id', foreignField: '_id', as: 'movie' } },
      { $unwind: '$movie' },
      { $project: { _id: 0, title: '$movie.title', reviews: 1, avg_stars: { $round: ['$avg', 1] } } },
      { $sort: { reviews: -1, title: 1 } },
    ],
  },
});

const decades = mongoQuestion({
  ...common,
  title: 'Movies per Decade',
  statement:
    'Group the movies by decade (2003 → 2000, 2015 → 2010). Return `{ decade, movies, best }` (no `_id`): the number of movies in that decade and the highest `rating` among them. Sort by `decade`; decades without movies do not appear.',
  difficulty: 'moderate',
  tags: ['mongodb', 'aggregation', '$group', 'arithmetic'],
  samples: [A('2000: 2 movies (best 8.6); 2010: 3 movies (best 8.1); 2020: 1 movie (5.9).'), B('One movie in each of 2000 and 2010.')],
  hidden: movieSets(1551, [[1, {}], [5, { years: [1999, 2001] }], [20, {}], [60, { years: [1980, 2024] }], [100, {}], [10, { years: [2010, 2019] }], [300, { years: [1970, 2024] }], [30, { years: [2009, 2011] }]]),
  solution: {
    pipeline: [
      { $group: { _id: { $subtract: ['$year', { $mod: ['$year', 10] }] }, movies: { $sum: 1 }, best: { $max: '$rating' } } },
      { $project: { _id: 0, decade: '$_id', movies: 1, best: 1 } },
      { $sort: { decade: 1 } },
    ],
  },
});

const bestPerGenre = mongoQuestion({
  ...common,
  title: 'Best Movie in Each Genre',
  statement:
    'For every genre, find its highest-rated movie; ties go to the movie with more `votes`, then to the `title` that sorts first. Return `{ genre, title, rating }` (no `_id`), sorted by `genre`.',
  difficulty: 'moderate',
  tags: ['mongodb', 'aggregation', '$sort', '$first'],
  samples: [
    A('Comedy: Northern Signal and Paper Garden are both 7.2; Northern Signal has more votes. Drama: Quiet Harbour (8.6). Romance: Monsoon Letters.'),
    B('Velvet Echo is the best drama and the best romance.'),
  ],
  hidden: movieSets(1561, [[1, {}], [4, { coarse: true }], [15, {}], [40, { coarse: true }], [100, {}], [8, { maxGenres: 1 }], [300, { coarse: true }], [30, {}]]),
  solution: {
    pipeline: [
      { $unwind: '$genres' },
      { $sort: { rating: -1, votes: -1, title: 1 } },
      { $group: { _id: '$genres', title: { $first: '$title' }, rating: { $first: '$rating' } } },
      { $project: { _id: 0, genre: '$_id', title: 1, rating: 1 } },
      { $sort: { genre: 1 } },
    ],
  },
});

// --- Hard --------------------------------------------------------------------------------------

type Invoice = { _id: number; customer: string; placed: { $date: string }; amount: number; status: 'paid' | 'cancelled' };
const CUST = ['acme', 'birla', 'cipla', 'dabur', 'emami', 'futura'];
const inv = (id: number, customer: string, iso: string, amount: number, status: Invoice['status'] = 'paid'): Invoice => ({ _id: id, customer, placed: { $date: iso }, amount, status });
function invoices(seed: number, n: number, months: number, customers: number): Invoice[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const m = int(r, 0, months - 1);
    const d = new Date(Date.UTC(2024, m, int(r, 1, 28), int(r, 0, 23), int(r, 0, 59)));
    return inv(i + 1, pick(r, CUST.slice(0, customers)), d.toISOString(), int(r, 1, 200) * 5, r() < 0.2 ? 'cancelled' : 'paid');
  });
}
const monthly = mongoQuestion({
  schemaDisplay:
    '**invoices**\n\n```json\n{ "_id": 1, "customer": "acme", "placed": ISODate("2024-01-05T10:00:00Z"), "amount": 100, "status": "paid" }\n```\n\n`placed` is a date (UTC). `status` is `paid` or `cancelled`.',
  collection: 'invoices',
  title: 'Monthly Paid Revenue',
  statement:
    'For **paid** invoices, group by the month of `placed` (in UTC) and return `{ month, revenue, customers }` (no `_id`): `month` as text `YYYY-MM`, the sum of `amount`, and the number of **distinct** customers billed that month. Sort by `month`.',
  difficulty: 'hard',
  tags: ['mongodb', 'aggregation', 'dates', '$addToSet'],
  samples: [
    mds({ invoices: [inv(1, 'acme', '2024-01-05T10:00:00Z', 100), inv(2, 'birla', '2024-01-20T09:00:00Z', 50), inv(3, 'acme', '2024-01-31T23:30:00Z', 70), inv(4, 'acme', '2024-02-01T00:10:00Z', 30), inv(5, 'birla', '2024-02-11T12:00:00Z', 999, 'cancelled')] }, '2024-01: 100 + 50 + 70 = 220 from 2 customers (acme twice counts once). 2024-02: only acme\'s 30; birla\'s invoice was cancelled.'),
    mds({ invoices: [inv(1, 'cipla', '2023-12-31T23:59:00Z', 10), inv(2, 'cipla', '2024-01-01T00:00:00Z', 20)] }, 'One minute apart but in different months (and years).'),
  ],
  hidden: [[1, 1, 1], [5, 2, 2], [20, 3, 4], [60, 6, 6], [150, 12, 6], [12, 1, 3], [400, 18, 6], [40, 4, 2]].map(([n, m, c], i) => mds({ invoices: invoices(1571 + i, n!, m!, c!) })),
  solution: {
    pipeline: [
      { $match: { status: 'paid' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$placed' } }, revenue: { $sum: '$amount' }, who: { $addToSet: '$customer' } } },
      { $project: { _id: 0, month: '$_id', revenue: 1, customers: { $size: '$who' } } },
      { $sort: { month: 1 } },
    ],
  },
});

type Sale = { _id: number; store: string; day: number; amount: number };
function storeSales(seed: number, stores: number, daysPerStore: number): Sale[] {
  const r = rng(seed);
  const out: Sale[] = [];
  for (const store of ['east', 'north', 'south', 'west'].slice(0, stores)) {
    let d = int(r, 1, 3);
    for (let k = 0; k < daysPerStore; k++) {
      out.push({ _id: 0, store, day: d, amount: int(r, 0, 100) * 10 });
      d += int(r, 1, 3);
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.map((s, i) => ({ ...s, _id: i + 1 }));
}
const running = mongoQuestion({
  schemaDisplay: '**sales**\n\n```json\n{ "_id": 1, "store": "east", "day": 3, "amount": 50 }\n```\n\nEach store has at most one document per `day`; documents are stored in no particular order.',
  collection: 'sales',
  title: 'Running Total and Best Day per Store',
  statement:
    'For every document return `{ store, day, amount, running, best }` (no `_id`): `running` is the store\'s total `amount` up to and including that day, and `best` is the store\'s highest single-day `amount` up to and including that day. Sort by `store`, then `day`.',
  difficulty: 'hard',
  tags: ['mongodb', 'aggregation', '$setWindowFields'],
  samples: [
    mds({ sales: [{ _id: 1, store: 'east', day: 1, amount: 100 }, { _id: 2, store: 'west', day: 4, amount: 10 }, { _id: 3, store: 'east', day: 3, amount: 150 }, { _id: 4, store: 'east', day: 2, amount: 20 }, { _id: 5, store: 'west', day: 1, amount: 5 }] }, 'east: running 100, 120, 270; best 100, 100, 150. west: running 5, 15; best 5, 10.'),
    mds({ sales: [{ _id: 1, store: 'north', day: 7, amount: 30 }] }, 'A single day.'),
  ],
  hidden: [[1, 1], [1, 5], [2, 10], [3, 30], [4, 60], [4, 2], [4, 200], [2, 40]].map(([s, d], i) => mds({ sales: storeSales(1581 + i, s!, d!) })),
  solution: {
    pipeline: [
      {
        $setWindowFields: {
          partitionBy: '$store',
          sortBy: { day: 1 },
          output: {
            running: { $sum: '$amount', window: { documents: ['unbounded', 'current'] } },
            best: { $max: '$amount', window: { documents: ['unbounded', 'current'] } },
          },
        },
      },
      { $project: { _id: 0, store: 1, day: 1, amount: 1, running: 1, best: 1 } },
      { $sort: { store: 1, day: 1 } },
    ],
  },
});

export const MONGO_AGG: DbQuestionInput[] = [genreCounts, avgByYear, votesByCountry, hoursMinutes, customerTotals, reviewedMovies, decades, bestPerGenre, monthly, running];
