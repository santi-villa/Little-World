/** Progress and journal belong to the player, outside the aquarium simulation. */
export interface JournalEntry { timeMinutes: number; text: string }
export interface PlayerState { tutorial: number; journal: JournalEntry[] }
export function createPlayer(tutorial = 4): PlayerState { return { tutorial, journal: [] }; }
