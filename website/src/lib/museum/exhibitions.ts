// Exhibition system for the virtual museum
// When The Curator creates an exhibition, works move from galleries to Exhibition Hall
// Works in an active exhibition don't appear in their permanent gallery positions

export interface Exhibition {
  id: number;
  title: string;
  rationale: string; // Curator's statement
  workIds: string[]; // ordered list of work IDs
  publishedDate: string;
}

// Load exhibitions from the data layer
// Currently none exist — The Curator hasn't created any yet
let _exhibitions: Exhibition[] = [];

try {
  // Future: import from data file when exhibitions exist
  // import exhibitionData from "@/data/exhibitions.json";
  // _exhibitions = exhibitionData;
} catch {
  _exhibitions = [];
}

export function getActiveExhibition(): Exhibition | null {
  // Return the most recent exhibition (if any)
  if (_exhibitions.length === 0) return null;
  return _exhibitions[_exhibitions.length - 1];
}

export function isWorkInExhibition(workId: string): boolean {
  const active = getActiveExhibition();
  if (!active) return false;
  return active.workIds.includes(workId);
}

export function getExhibitionWorkIds(): string[] {
  const active = getActiveExhibition();
  if (!active) return [];
  return active.workIds;
}
