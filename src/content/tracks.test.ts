import { describe, expect, it } from 'vitest';
import { TRACKS, TRACK_IDS, buildMapData, trackNav } from './tracks';

const conceptFiles = import.meta.glob<string>('./concepts/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Slugs listed in the config on purpose but not yet published (none right now). */
const SKIPPED_SLUGS: string[] = [];

function readConcepts() {
  return Object.entries(conceptFiles).map(([file, text]) => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
    const slug = /^slug:\s*(\S+)/m.exec(fm)?.[1];
    const track = /^track:\s*(\S+)/m.exec(fm)?.[1];
    return { file, slug, track };
  });
}

const concepts = readConcepts();
const allListed = TRACKS.flatMap((t) => [...t.slugs]);

describe('tracks config vs concept files', () => {
  it('every concept has a valid track id whose slug list contains the concept', () => {
    expect(concepts.length).toBeGreaterThan(0);
    for (const c of concepts) {
      expect(c.slug, `${c.file} has a slug`).toBeTruthy();
      expect(TRACK_IDS as readonly string[], `${c.file} track "${c.track}"`).toContain(
        c.track,
      );
      const track = TRACKS.find((t) => t.id === c.track)!;
      expect(
        track.slugs as readonly string[],
        `${c.slug} listed in ${track.id}`,
      ).toContain(c.slug);
    }
  });

  it('every concept is in exactly one track, with no duplicates and no missing files', () => {
    expect(new Set(allListed).size).toBe(allListed.length);
    const files = new Set(concepts.map((c) => c.slug));
    for (const c of concepts) {
      const count = TRACKS.filter((t) =>
        (t.slugs as readonly string[]).includes(c.slug!),
      ).length;
      expect(count, `${c.slug} appears in exactly one track`).toBe(1);
    }
    for (const slug of allListed) {
      if (SKIPPED_SLUGS.includes(slug)) continue;
      expect(files.has(slug), `${slug} has a concept file`).toBe(true);
    }
  });

  it('track ids are unique', () => {
    expect(new Set(TRACK_IDS).size).toBe(TRACK_IDS.length);
  });
});

describe('old track id is gone', () => {
  const OLD = [
    /track:\s*models\b/,
    /['"]models['"]/,
    /models track/i,
    /track=models/,
    /#models\b/,
  ];
  // Source, scripts and the two top-level docs. node_modules, dist and .astro are excluded.
  const scanned = {
    ...import.meta.glob<string>(
      ['/src/**/*.{astro,ts,tsx,md,mdx,css,json}', '!/src/**/tracks.test.ts'],
      { query: '?raw', import: 'default', eager: true },
    ),
    ...import.meta.glob<string>(['/scripts/**/*.{md,py,mjs,json}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
    ...import.meta.glob<string>(['/CLAUDE.md', '/README.md'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  };

  it('no concept uses track: models', () => {
    expect(concepts.filter((c) => c.track === 'models')).toEqual([]);
  });

  it('no source or doc file mentions it (outside this test)', () => {
    expect(Object.keys(scanned).length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const [file, text] of Object.entries(scanned)) {
      for (const re of OLD) if (re.test(text)) hits.push(`${file}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('prev/next derived from the config', () => {
  it('forms a simple chain inside each track', () => {
    for (const t of TRACKS) {
      const seen = new Set<string>();
      let cur: string | undefined = t.slugs[0];
      expect(
        trackNav(t.slugs[0] ?? '').prev,
        `${t.id} first has no prev`,
      ).toBeUndefined();
      let steps = 0;
      while (cur !== undefined) {
        expect(seen.has(cur), `${t.id}: cycle at ${cur}`).toBe(false);
        seen.add(cur);
        expect(t.slugs as readonly string[], `${cur} stays inside ${t.id}`).toContain(
          cur,
        );
        const { prev, next } = trackNav(cur);
        if (prev !== undefined) expect(t.slugs as readonly string[]).toContain(prev);
        if (next !== undefined) expect(trackNav(next).prev).toBe(cur);
        cur = next;
        if (++steps > t.slugs.length) throw new Error(`${t.id}: chain longer than track`);
      }
      expect(seen.size).toBe(t.slugs.length);
      const last = t.slugs[t.slugs.length - 1];
      if (last !== undefined) expect(trackNav(last).next).toBeUndefined();
    }
  });

  it('generalization is exactly bias-variance, validation-cv, regularization, threshold-precision-recall', () => {
    const t = TRACKS.find((x) => x.id === 'generalization')!;
    expect([...t.slugs]).toEqual([
      'bias-variance',
      'validation-cv',
      'regularization',
      'threshold-precision-recall',
    ]);
    expect(trackNav('bias-variance')).toEqual({ next: 'validation-cv' });
    expect(trackNav('threshold-precision-recall')).toEqual({ prev: 'regularization' });
  });

  it('gives unknown slugs no links', () => {
    expect(trackNav('nope')).toEqual({});
  });
});

describe('concept map data', () => {
  it('lists every track with a published page in config order', () => {
    const map = buildMapData(allListed);
    expect(map.map((t) => t.id)).toEqual([
      'statistics',
      'optimization',
      'generalization',
      'credit-risk',
      'model-families',
    ]);
    expect(map.map((t) => t.slugs.length)).toEqual([5, 2, 4, 4, 1]);
    expect(map.find((t) => t.id === 'model-families')!.moreComing).toBe(true);
  });

  it('hides a track with zero published pages', () => {
    const map = buildMapData(allListed.filter((s) => s !== 'decision-trees'));
    expect(map.find((t) => t.id === 'model-families')).toBeUndefined();
  });

  it('flags a track with exactly one published page as "More coming"', () => {
    const map = buildMapData([...allListed, 'decision-trees']);
    expect(map.find((t) => t.id === 'optimization')!.moreComing).toBe(false);
    const one = buildMapData(['learning-rate']);
    expect(one).toHaveLength(1);
    expect(one[0]!.id).toBe('optimization');
    expect(one[0]!.moreComing).toBe(true);
  });

  it('only includes published slugs, in listed order', () => {
    const map = buildMapData(['regularization', 'bias-variance']);
    expect(map[0]!.slugs).toEqual(['bias-variance', 'regularization']);
  });
});
