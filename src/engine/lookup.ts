// src/engine/lookup.ts
import speciesData from '../data/species.json';
import itemsData from '../data/items.json';
import movesData from '../data/moves.json';
import movePpsData from '../data/move_pps.json';
import speciesTypesData from '../data/species_types.json';
import speciesLearnsetsData from '../data/species_learnsets.json';
import speciesAbilitiesData from '../data/species_abilities.json';
import abilitiesData from '../data/abilities.json';
import itemPocketsData from '../data/item_pockets.json';

export const SPECIES_MAP: Record<number, string> = speciesData;
export const ITEMS_MAP: Record<number, string> = itemsData;
export const MOVES_MAP: Record<number, string> = movesData;
export const MOVE_BASE_PP: Record<number, number> = movePpsData as Record<number, number>;
export const SPECIES_TYPES_MAP: Record<number, string> = speciesTypesData as Record<number, string>;
export const SPECIES_LEARNSETS: Record<string, string[]> = speciesLearnsetsData as Record<string, string[]>;
export const SPECIES_ABILITIES_MAP: Record<number, any> = speciesAbilitiesData as Record<number, any>;
export const ABILITIES_MAP: Record<number, string> = abilitiesData as Record<number, string>;
export const ITEM_POCKETS_MAP: Record<number, string> = itemPocketsData as Record<number, string>;

export const MOVE_NAME_TO_ID: Record<string, number> = {};
Object.entries(MOVES_MAP).forEach(([id, name]) => {
  MOVE_NAME_TO_ID[name.toLowerCase().trim()] = parseInt(id, 10);
});

export const NATURES_LIST = [
  { id: 0, name: 'Hardy', mod: '(Neutral)' },
  { id: 1, name: 'Lonely', mod: '(+Atk, -Def)' },
  { id: 2, name: 'Brave', mod: '(+Atk, -Spe)' },
  { id: 3, name: 'Adamant', mod: '(+Atk, -SpA)' },
  { id: 4, name: 'Naughty', mod: '(+Atk, -SpD)' },
  { id: 5, name: 'Bold', mod: '(+Def, -Atk)' },
  { id: 6, name: 'Docile', mod: '(Neutral)' },
  { id: 7, name: 'Relaxed', mod: '(+Def, -Spe)' },
  { id: 8, name: 'Impish', mod: '(+Def, -SpA)' },
  { id: 9, name: 'Lax', mod: '(+Def, -SpD)' },
  { id: 10, name: 'Timid', mod: '(+Spe, -Atk)' },
  { id: 11, name: 'Hasty', mod: '(+Spe, -Def)' },
  { id: 12, name: 'Serious', mod: '(Neutral)' },
  { id: 13, name: 'Jolly', mod: '(+Spe, -SpA)' },
  { id: 14, name: 'Naive', mod: '(+Spe, -SpD)' },
  { id: 15, name: 'Modest', mod: '(+SpA, -Atk)' },
  { id: 16, name: 'Mild', mod: '(+SpA, -Def)' },
  { id: 17, name: 'Quiet', mod: '(+SpA, -Spe)' },
  { id: 18, name: 'Bashful', mod: '(Neutral)' },
  { id: 19, name: 'Rash', mod: '(+SpA, -SpD)' },
  { id: 20, name: 'Calm', mod: '(+SpD, -Atk)' },
  { id: 21, name: 'Gentle', mod: '(+SpD, -Def)' },
  { id: 22, name: 'Sassy', mod: '(+SpD, -Spe)' },
  { id: 23, name: 'Careful', mod: '(+SpD, -SpA)' },
  { id: 24, name: 'Quirky', mod: '(Neutral)' },
];

export const TERA_TYPES_GEN9 = [
  { id: 1, name: 'Normal' }, { id: 2, name: 'Fighting' }, { id: 3, name: 'Flying' },
  { id: 4, name: 'Poison' }, { id: 5, name: 'Ground' }, { id: 6, name: 'Rock' },
  { id: 7, name: 'Bug' }, { id: 8, name: 'Ghost' }, { id: 9, name: 'Steel' },
  { id: 11, name: 'Fire' }, { id: 12, name: 'Water' }, { id: 13, name: 'Grass' },
  { id: 14, name: 'Electric' }, { id: 15, name: 'Psychic' }, { id: 16, name: 'Ice' },
  { id: 17, name: 'Dragon' }, { id: 18, name: 'Dark' }, { id: 19, name: 'Fairy' },
];

export const POKEBALLS_LIST = [
  { id: 1, name: 'Poké Ball', slug: 'poke-ball' },
  { id: 2, name: 'Great Ball', slug: 'great-ball' },
  { id: 3, name: 'Ultra Ball', slug: 'ultra-ball' },
  { id: 4, name: 'Master Ball', slug: 'master-ball' },
  { id: 5, name: 'Premier Ball', slug: 'premier-ball' },
];

export type PocketType = 'Items' | 'Medicine' | 'KeyItems' | 'PokeBalls' | 'TMsHMs' | 'MegaStones' | 'BattleItems' | 'Berries';

const MEDICINE_KEYWORDS = [
  'potion', 'antidote', 'burn heal', 'ice heal', 'awakening', 'paralyze heal', 'full heal', 'max potion',
  'hyper potion', 'super potion', 'full restore', 'revive', 'max revive', 'hp up', 'protein', 'iron', 'carbos',
  'calcium', 'zinc', 'rare candy', 'pp up', 'pp max', 'heal', 'elixir', 'ether', 'energy', 'root', 'powder',
  'soda pop', 'fresh water', 'lemonade', 'moomoo milk', 'berry juice', 'sacred ash', 'lava cookie', 'sweet heart'
];

const BATTLE_KEYWORDS = [
  'x attack', 'x defense', 'x speed', 'x accuracy', 'x sp atk', 'x sp def', 'x sp. atk', 'x sp. def',
  'dire hit', 'guard spec', 'dire hit 2', 'dire hit 3'
];

const EXPLICIT_KEY_ITEMS = new Set(['gs ball', 'tm case', 'berry pouch', 'mach bike', 'acro bike', 'old rod', 'good rod', 'super rod', 'coin case', 'key item', 'town map', 'journal', 'explorer kit', 'pal pad', 'vs seeker', 'dowsing machine', 'poke radar']);

export function classifyItemPocket(itemId: number, name: string): PocketType {
  const n = name.toLowerCase().trim();
  if (EXPLICIT_KEY_ITEMS.has(n) || n.includes('key item') || n.endsWith(' ticket') || n.endsWith(' pass') || n.endsWith(' card')) return 'KeyItems';
  if (/^(tm|hm)\d+/i.test(n) || n.startsWith('tm') || n.startsWith('hm')) return 'TMsHMs';
  if (n.endsWith('ite') || n.includes('mega stone') || n.endsWith('ite x') || n.endsWith('ite y')) return 'MegaStones';
  if (n.endsWith('berry') || n.includes('berry')) return 'Berries';

  if (
    (itemId >= 1 && itemId <= 27) ||
    n.endsWith('ball') ||
    n.endsWith(' ball') ||
    n.includes('poke ball') ||
    n.includes('great ball') ||
    n.includes('ultra ball') ||
    n.includes('master ball')
  ) {
    if (!n.includes('iron ball') && !n.includes('light ball') && !n.includes('smoke ball') && !n.includes('ball capsule') && !n.includes('ball seal')) {
      return 'PokeBalls';
    }
  }

  if (BATTLE_KEYWORDS.some((kw) => n.includes(kw))) return 'BattleItems';

  const mapped = ITEM_POCKETS_MAP[itemId];
  if (mapped && mapped !== 'Items') {
    return mapped as PocketType;
  }

  if (MEDICINE_KEYWORDS.some((kw) => n.includes(kw))) return 'Medicine';
  return 'Items';
}

export function getItemsForPocket(pocket: PocketType): Array<{ id: number; name: string }> {
  return getAlphabeticalItemList().filter((item) => classifyItemPocket(item.id, item.name) === pocket);
}

export function getItemSpriteUrl(itemId: number, name?: string): string {
  if (itemId <= 0) return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
  const itemName = name || getItemName(itemId);
  const n = itemName.toLowerCase().trim();

  if (n.startsWith('hm') || /^(hm)\d+/i.test(n)) {
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/hm-normal.png';
  }
  if (n.startsWith('tm') || /^(tm)\d+/i.test(n)) {
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-normal.png';
  }

  const slug = itemName.toLowerCase().replace(/['.:]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
}

export function getSpeciesName(id: number): string {
  return SPECIES_MAP[id] || `Species #${id}`;
}

export function getItemName(id: number): string {
  if (id === 0) return '(None)';
  return ITEMS_MAP[id] || `Item #${id}`;
}

export function getMoveName(id: number): string {
  if (id === 0) return '(None)';
  return MOVES_MAP[id] || `Move #${id}`;
}

export function getMoveBasePp(moveId: number): number {
  if (moveId <= 0) return 0;
  return MOVE_BASE_PP[moveId] || 20;
}

export function getAllSpeciesList(): Array<{ id: number; name: string }> {
  return Object.entries(SPECIES_MAP)
    .map(([id, name]) => ({ id: parseInt(id, 10), name }))
    .filter((s) => s.id > 0)
    .sort((a, b) => a.id - b.id);
}

export function getAlphabeticalItemList(): Array<{ id: number; name: string }> {
  return Object.entries(ITEMS_MAP)
    .map(([id, name]) => ({ id: parseInt(id, 10), name }))
    .filter((item) => item.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAllMovesList(): Array<{ id: number; name: string; basePp: number }> {
  return Object.entries(MOVES_MAP)
    .map(([id, name]) => ({ id: parseInt(id, 10), name, basePp: getMoveBasePp(parseInt(id, 10)) }))
    .filter((m) => m.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isShadowLugiaSpecies(speciesId: number): boolean {
  return speciesId === 1435;
}

export function getSpeciesAbilities(speciesId: number): Array<{ slot: number; name: string; available: boolean }> {
  const info = SPECIES_ABILITIES_MAP[speciesId];
  const rawList = info?.abilities || [65, 0, 34];
  return [0, 1, 2].map((slot) => {
    const aid = rawList[slot] || 0;
    const name = ABILITIES_MAP[aid] || (aid > 0 ? `Ability #${aid}` : 'None');
    return { slot, name, available: aid > 0 && name !== 'None' };
  });
}

export function getSuggestedEncounterLevel(speciesId: number): number {
  if (speciesId === 1435 || speciesId === 150) return 70;
  if (speciesId >= 1 && speciesId <= 9) return 5;
  return 10;
}

export function getPrimaryTeraTypeId(speciesId: number): number {
  const typeName = SPECIES_TYPES_MAP[speciesId] || 'Normal';
  const found = TERA_TYPES_GEN9.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
  return found ? found.id : 1;
}

export function getSpeciesLearnset(speciesId: number): string[] {
  if (speciesId <= 0) return [];
  const rawName = getSpeciesName(speciesId);
  const cleanName = rawName.toLowerCase().trim();

  if (SPECIES_LEARNSETS[cleanName]) return SPECIES_LEARNSETS[cleanName];
  if (SPECIES_LEARNSETS[String(speciesId)]) return SPECIES_LEARNSETS[String(speciesId)];

  const firstWord = cleanName.split(' ')[0];
  if (SPECIES_LEARNSETS[firstWord]) return SPECIES_LEARNSETS[firstWord];

  const normalized = cleanName.replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[^a-z0-9]/g, '');
  for (const k of Object.keys(SPECIES_LEARNSETS)) {
    if (k.replace(/[^a-z0-9]/g, '') === normalized) {
      return SPECIES_LEARNSETS[k];
    }
  }

  return [];
}

export function getSuggestedMovesForSpecies(speciesId: number): number[] {
  const learnsetNames = getSpeciesLearnset(speciesId);

  const moves: number[] = [];
  for (const moveName of learnsetNames) {
    const moveId = MOVE_NAME_TO_ID[moveName.toLowerCase().trim()];
    if (moveId && moveId > 0 && !moves.includes(moveId)) {
      moves.push(moveId);
      if (moves.length >= 4) break;
    }
  }

  while (moves.length < 4) {
    moves.push(0);
  }

  if (moves[0] === 0) {
    moves[0] = 33;
  }

  return moves;
}

export function getSpriteUrl(speciesId: number, isShiny: boolean): { primary: string; fallback: string } {
  if (isShadowLugiaSpecies(speciesId)) {
    return {
      primary: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/249.png',
      fallback: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/249.png',
    };
  }
  const rawName = getSpeciesName(speciesId);
  const slug = rawName.toLowerCase().replace(/['.:]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const cdn = isShiny ? 'https://play.pokemonshowdown.com/sprites/ani-shiny' : 'https://play.pokemonshowdown.com/sprites/ani';
  return {
    primary: `${cdn}/${slug}.gif`,
    fallback: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`,
  };
}