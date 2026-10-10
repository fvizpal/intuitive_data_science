import { getCollection } from 'astro:content';

/** Reading order. New concepts not listed here follow, in file order. */
const ORDER = [
  'averages-and-spread',
  'correlation',
  'learning-rate',
  'woe-iv',
  'woe-to-scorecard',
  'ks-auc-gini',
];

export async function getOrderedConcepts() {
  const all = await getCollection('concepts');
  const rank = (slug: string) => {
    const i = ORDER.indexOf(slug);
    return i === -1 ? ORDER.length : i;
  };
  return [...all].sort((a, b) => rank(a.data.slug) - rank(b.data.slug));
}
