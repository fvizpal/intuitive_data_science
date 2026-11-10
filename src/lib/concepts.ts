import { getCollection } from 'astro:content';
import { ORDERED_SLUGS } from '../content/tracks';

/** Reading order comes from src/content/tracks.ts. Unlisted concepts follow, in file order. */
export async function getOrderedConcepts() {
  const all = await getCollection('concepts');
  const rank = (slug: string) => {
    const i = ORDERED_SLUGS.indexOf(slug);
    return i === -1 ? ORDERED_SLUGS.length : i;
  };
  return [...all].sort((a, b) => rank(a.data.slug) - rank(b.data.slug));
}
