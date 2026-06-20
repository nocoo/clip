/**
 * In-memory bookmark store with seed data and deterministic IDs.
 * Reset between test runs via `reset()`.
 */

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  tags: string[];
  notes: string | null;
  archived: boolean;
  createdAt: string;
}

const SEED: Bookmark[] = [
  {
    id: "bm_1",
    url: "https://bun.sh",
    title: "Bun",
    tags: ["runtime", "js"],
    notes: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "bm_2",
    url: "https://hono.dev",
    title: "Hono",
    tags: ["framework", "js"],
    notes: "minimal web framework",
    archived: false,
    createdAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "bm_3",
    url: "https://zod.dev",
    title: "Zod",
    tags: ["validation", "ts"],
    notes: null,
    archived: true,
    createdAt: "2026-01-03T00:00:00Z",
  },
];

let items: Bookmark[] = [];
let nextId = 1;

export function reset(): void {
  items = SEED.map((b) => ({ ...b, tags: [...b.tags] }));
  nextId = items.length + 1;
}

export function list(filter: {
  tag?: string;
  archived?: boolean;
  limit?: number;
}): Bookmark[] {
  let out = items;
  if (filter.tag !== undefined) {
    out = out.filter((b) => b.tags.includes(filter.tag as string));
  }
  if (filter.archived !== undefined) {
    out = out.filter((b) => b.archived === filter.archived);
  }
  if (filter.limit !== undefined) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

export function get(id: string): Bookmark | null {
  return items.find((b) => b.id === id) ?? null;
}

export function create(input: {
  url: string;
  title: string;
  tags?: string[];
  notes?: string | null;
}): Bookmark {
  const bm: Bookmark = {
    id: `bm_${nextId++}`,
    url: input.url,
    title: input.title,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    archived: false,
    createdAt: new Date().toISOString(),
  };
  items.push(bm);
  return bm;
}

export function update(
  id: string,
  patch: Partial<Pick<Bookmark, "url" | "title" | "tags" | "notes">>,
): Bookmark | null {
  const bm = get(id);
  if (!bm) return null;
  if (patch.url !== undefined) bm.url = patch.url;
  if (patch.title !== undefined) bm.title = patch.title;
  if (patch.tags !== undefined) bm.tags = patch.tags;
  if (patch.notes !== undefined) bm.notes = patch.notes;
  return bm;
}

export function remove(id: string): boolean {
  const i = items.findIndex((b) => b.id === id);
  if (i < 0) return false;
  items.splice(i, 1);
  return true;
}

export function archive(id: string): Bookmark | null {
  const bm = get(id);
  if (!bm) return null;
  bm.archived = true;
  return bm;
}

export function tags(): string[] {
  return Array.from(new Set(items.flatMap((b) => b.tags))).sort();
}

reset();
