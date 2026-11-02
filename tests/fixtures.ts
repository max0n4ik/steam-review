import type { Review } from '../shared/types.ts';

// Entirely synthetic records. No downloaded Steam data belongs in this repository.
export function review(id: number, options: Partial<Review> = {}): Review {
  return {
    recommendationid: String(id),
    author: {
      steamid: String(10000000000000000n + BigInt(id)),
      num_reviews: id,
      playtime_at_review: 60 + id,
    },
    language: 'english',
    review: 'A fictional review used only for tests.',
    timestamp_created: 1700000000 + id,
    voted_up: true,
    ...options,
  };
}
