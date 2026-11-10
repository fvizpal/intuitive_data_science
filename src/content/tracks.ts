/**
 * Single source of truth for tracks: which tracks exist, their order, and
 * which concepts sit in each (in reading order). Pure TypeScript, no Astro
 * imports, so it can be unit-tested and used in the schema.
 *
 * A new page picks one of these tracks. Add a new track only when at least
 * two pages need it.
 */
export interface Track {
  id: string;
  label: string;
  question: string;
  slugs: readonly string[];
}

export const TRACKS = [
  {
    id: 'statistics',
    label: 'Statistics',
    question: 'What does my data say, and how sure can I be?',
    slugs: [
      'averages-and-spread',
      'correlation',
      'distributions',
      'sampling-clt',
      'confidence-intervals',
    ],
  },
  {
    id: 'optimization',
    label: 'Optimization',
    question: 'How does a model learn?',
    slugs: ['learning-rate', 'gradient-descent'],
  },
  {
    id: 'generalization',
    label: 'Generalization',
    question: 'Will this model work on new data, and how do I decide with it?',
    slugs: [
      'bias-variance',
      'validation-cv',
      'regularization',
      'threshold-precision-recall',
    ],
  },
  {
    id: 'credit-risk',
    label: 'Credit risk',
    question: 'How do I build, check and watch a lending score?',
    slugs: ['woe-iv', 'woe-to-scorecard', 'ks-auc-gini', 'psi-drift'],
  },
  {
    id: 'model-families',
    label: 'Model families',
    question: 'What kinds of models are there, and how do they work?',
    slugs: ['decision-trees'],
  },
] as const satisfies readonly Track[];

export type TrackId = (typeof TRACKS)[number]['id'];

/** Track ids as a non-empty tuple, for the content schema enum. */
export const TRACK_IDS = TRACKS.map((t) => t.id) as [TrackId, ...TrackId[]];

/** Every slug in config order: track by track, concept by concept. */
export const ORDERED_SLUGS: string[] = TRACKS.flatMap((t) => [...t.slugs]);

export function trackOf(slug: string): Track | undefined {
  return TRACKS.find((t) => (t.slugs as readonly string[]).includes(slug));
}

/** Previous and next slug inside the concept's own track (never across tracks). */
export function trackNav(slug: string): { prev?: string; next?: string } {
  const track = trackOf(slug);
  if (!track) return {};
  const i = track.slugs.indexOf(slug);
  const prev = track.slugs[i - 1];
  const next = track.slugs[i + 1];
  return {
    ...(prev !== undefined ? { prev } : {}),
    ...(next !== undefined ? { next } : {}),
  };
}

export interface MapTrack {
  id: string;
  label: string;
  question: string;
  slugs: string[];
  /** True when the track has exactly one published page. */
  moreComing: boolean;
}

/**
 * Concept-map data: tracks in config order, concepts in listed order,
 * only published slugs. Tracks with no published page are left out.
 */
export function buildMapData(published: Iterable<string>): MapTrack[] {
  const have = new Set(published);
  return TRACKS.map((t) => {
    const slugs = t.slugs.filter((s) => have.has(s));
    return {
      id: t.id,
      label: t.label,
      question: t.question,
      slugs,
      moreComing: slugs.length === 1,
    };
  }).filter((t) => t.slugs.length > 0);
}
