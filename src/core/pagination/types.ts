export interface PageQuery {
  cursor?: string;
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
