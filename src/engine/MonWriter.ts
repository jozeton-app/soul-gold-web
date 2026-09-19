// src/engine/MonWriter.ts
import { CONSTANTS } from './constants';
import { encodeGbaString } from './charmap';
import { getSpeciesName, getSuggestedMovesForSpecies, getMoveBasePp, getSuggestedEncounterLevel, getPrimaryTeraTypeId } from './lookup';
import type { DecryptedPokemon } from './SaveParser';

export function createDefaultPokemon(speciesId: number, trainerInfo: { tid: number; sid: number; name: string }): DecryptedPokemon {
  const tid = trainerInfo.tid & 0xFFFF;
  const sid = trainerInfo.sid & 0xFFFF;
  const personality = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  const level = getSuggestedEncounterLevel(speciesId);
  const moves = getSuggestedMovesForSpecies(speciesId);
  const pps = moves.map((m) => getMoveBasePp(m));

  return {
    personality,
    otId: ((sid << 16) | tid) >>> 0,
    nickname: '',
    otName: trainerInfo.name || 'Joze',
    language: 2,
    hiddenNatureModifier: 0,
    isBadEgg: false,
    hasSpecies: true,
    isEgg: false,
    shinyModifier: 0,
    species: speciesId,
    teraType: getPrimaryTeraTypeId(speciesId),
    heldItem: 0,
    pokeball: 1,
    experience: level * level * level,
    moves,
    pps,
    ivs: [Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), Math.floor(Math.random() * 32)],
    evs: [0, 0, 0, 0, 0, 0],
    ppBonuses: [0, 0, 0, 0],
    pokerus: 0,
    metLocation: 88,
    metLevel: level,
    level,
    hp: 40,
    maxHp: 40,
    attack: 25,
    defense: 25,
    speed: 25,
    spAttack: 25,
    spDefense: 25,
    friendship: 70,
    abilityNum: 0,
  };
}

export function clearPokemonSlot(targetBuffer: Uint8Array, offset: number, isParty: boolean): void {
  targetBuffer.fill(0x00, offset, offset + (isParty ? CONSTANTS.MON_SIZE : CONSTANTS.BOX_MON_SIZE));
}

export function packAndWritePokemon(targetBuffer: Uint8Array, offset: number, mon: DecryptedPokemon, isParty: boolean): void {
  const size = isParty ? CONSTANTS.MON_SIZE : CONSTANTS.BOX_MON_SIZE;
  const b = targetBuffer.subarray(offset, offset + size);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);

  view.setUint32(0, mon.personality || 1, true);
  view.setUint32(4, mon.otId, true);

  const gameNick = mon.nickname.trim() || getSpeciesName(mon.species).toUpperCase();
  b.set(encodeGbaString(gameNick.slice(0, 10), 12), 8);

  b[20] = (mon.language & 0x7) | ((mon.hiddenNatureModifier & 0x1F) << 3);
  b[21] = 0x02; // hasSpecies = true

  b.set(encodeGbaString((mon.otName || 'Joze').slice(0, 7), 7), 22);
  view.setUint16(30, (mon.shinyModifier & 0x1) << 14, true);

  const secView = new DataView(b.buffer, b.byteOffset + 32, 44);
  secView.setUint16(0, (mon.species & 0x7FF) | (((mon.teraType || 1) & 0x1F) << 11), true);

  const ballId = Math.max(1, Math.min(63, mon.pokeball || 1));
  secView.setUint16(2, (mon.heldItem & 0x3FF) | ((ballId & 0x3F) << 10), true);
  secView.setUint32(4, mon.experience & 0xFFFFFF, true);

  // PP Bonuses packing
  let ppBonuses = 0;
  if (mon.ppBonuses) {
    for (let i = 0; i < 4; i++) {
      ppBonuses |= (mon.ppBonuses[i] & 0x3) << (2 * i);
    }
  }
  b[32 + 10] = ppBonuses;
  b[32 + 11] = mon.friendship || 70;

  for (let i = 0; i < 4; i++) {
    secView.setUint16(12 + i * 2, (mon.moves[i] || 0) & 0x7FF, true);
  }

  const m3Orig = secView.getUint16(18, true);
  const abilityNum = Math.max(0, Math.min(2, mon.abilityNum || 0));
  secView.setUint16(18, (m3Orig & ~0x3000) | ((abilityNum & 0x3) << 12), true);

  for (let i = 0; i < 4; i++) {
    b[32 + 20 + i] = (mon.pps[i] || 0) & 0x7F;
  }

  for (let i = 0; i < 6; i++) {
    b[32 + 24 + i] = Math.max(0, Math.min(252, mon.evs[i] || 0));
  }

  b[32 + 36] = mon.pokerus & 0xFF;
  b[32 + 37] = mon.metLocation & 0xFF;
  secView.setUint16(38, (mon.metLevel & 0x7F) | (4 << 7), true);

  const ivWord =
    (mon.ivs[0] & 0x1F) |
    ((mon.ivs[1] & 0x1F) << 5) |
    ((mon.ivs[2] & 0x1F) << 10) |
    ((mon.ivs[3] & 0x1F) << 15) |
    ((mon.ivs[4] & 0x1F) << 20) |
    ((mon.ivs[5] & 0x1F) << 25);
  secView.setUint32(40, ivWord & ~(1 << 30), true);

  if (isParty && b.length >= CONSTANTS.MON_SIZE) {
    view.setUint32(76, mon.status || 0, true);
    b[80] = Math.max(1, Math.min(100, mon.level || 5));
    b[81] = 0;

    const hp = mon.maxHp || 40;
    view.setUint16(82, mon.hp !== undefined ? mon.hp : hp, true);
    view.setUint16(84, hp, true);
    view.setUint16(86, mon.attack || 25, true);
    view.setUint16(88, mon.defense || 25, true);
    view.setUint16(90, mon.speed || 25, true);
    view.setUint16(92, mon.spAttack || 25, true);
    view.setUint16(94, mon.spDefense || 25, true);
  }
}