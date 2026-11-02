export interface Review {
  recommendationid: string;
  author: {
    steamid: string;
    num_reviews?: number;
    playtime_at_review?: number;
    playtime_forever?: number;
  };
  language: string;
  review: string;
  timestamp_created: number;
  timestamp_updated?: number;
  voted_up: boolean;
  votes_up?: number;
  steam_purchase?: boolean;
  [key: string]: unknown;
}
export interface Query {
  appid: number;
  limit: number;
  start: number | null;
  end: number | null;
}
export interface Game {
  appid: number;
  name: string;
  releaseDate: string | null;
}
export interface ReviewPage {
  reviews: Review[];
  cursor?: string;
  total_matching?: number;
}
export type JobStatus = 'running' | 'paused' | 'complete' | 'limited' | 'error';
export interface Job {
  id: string;
  query: Query;
  game: Game;
  status: JobStatus;
  count: number;
  matching: number | null;
  pages: number;
  cursor: string;
  createdAt: string;
  updatedAt: string;
  message: string;
  retryAt: string | null;
}
export interface Preview {
  game: Game;
  matching: number | null;
  estimatedRequests: number;
  query: Query;
}
