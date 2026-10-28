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

export function clearPokemonSlot(targetBuffer: Uint8Array, offset: number, isParty: boolean, isV12: boolean = false): void {
  const boxSize = isV12 ? CONSTANTS.BOX_MON_SIZE_V12 : CONSTANTS.BOX_MON_SIZE_V11;
  targetBuffer.fill(0x00, offset, offset + (isParty ? CONSTANTS.MON_SIZE : boxSize));
}

export function packAndWritePokemon(targetBuffer: Uint8Array, offset: number, mon: DecryptedPokemon, isParty: boolean, isV12: boolean = false): void {
  const boxSize = isV12 ? CONSTANTS.BOX_MON_SIZE_V12 : CONSTANTS.BOX_MON_SIZE_V11;
  const size = isParty ? CONSTANTS.MON_SIZE : boxSize;
  const b = targetBuffer.subarray(offset, offset + size);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);

  view.setUint32(0, mon.personality || 1, true);
  view.setUint32(4, mon.otId, true);

  const gameNick = mon.nickname.trim() || getSpeciesName(mon.species).toUpperCase();
  b.set(encodeGbaString(gameNick.slice(0, 10), 12), 8);

  b[20] = (mon.language & 0x7) | ((mon.hiddenNatureModifier & 0x1F) << 3);
  b[21] = (b[21] & 0xF8) | 0x02; // hasSpecies = true, preserve default-nick/ribbon bits

  b.set(encodeGbaString((mon.otName || 'Joze').slice(0, 7), 7), 22);
  const w30Orig = view.getUint16(30, true);
  view.setUint16(30, (w30Orig & ~(1 << 14)) | ((mon.shinyModifier & 0x1) << 14), true);

  let ppBonuses = 0;
  if (mon.ppBonuses) {
    for (let i = 0; i < 4; i++) {
      ppBonuses |= (mon.ppBonuses[i] & 0x3) << (2 * i);
    }
  }

  const ballId = Math.max(1, Math.min(63, mon.pokeball || 1));
  const abilityNum = Math.max(0, Math.min(2, mon.abilityNum || 0));
  const ivWord =
    ((mon.ivs[0] & 0x1F) |
      ((mon.ivs[1] & 0x1F) << 5) |
      ((mon.ivs[2] & 0x1F) << 10) |
      ((mon.ivs[3] & 0x1F) << 15) |
      ((mon.ivs[4] & 0x1F) << 20) |
      ((mon.ivs[5] & 0x1F) << 25)) >>> 0;

  if (isV12) {
    // 68-byte BoxPokemon layout (v1.2.x)
    view.setUint16(0x20, (mon.species & 0x7FF) | (((mon.teraType || 1) & 0x1F) << 11), true);
    view.setUint16(0x22, (mon.heldItem & 0x3FF) | ((ballId & 0x3F) << 10), true);

    const exp24 = mon.experience & 0xFFFFFF;
    const friend8 = (mon.friendship ?? 70) & 0xFF;
    view.setUint32(0x24, (exp24 | (friend8 << 24)) >>> 0, true);

    b[0x28] = mon.pokerus & 0xFF;
    b[0x29] = mon.metLocation & 0xFF;
    b[0x2B] = (b[0x2B] & 0x80) | (mon.metLevel & 0x7F);

    const m1 = (mon.moves[0] || 0) & 0x7FF;
    const m2 = (mon.moves[1] || 0) & 0x7FF;
    const m3 = (mon.moves[2] || 0) & 0x7FF;
    const m4 = (mon.moves[3] || 0) & 0x7FF;

    view.setUint16(0x2C, m1 | ((ppBonuses & 0x1F) << 11), true);
    view.setUint16(0x2E, m2 | (((ppBonuses >>> 5) & 0x07) << 11), true);

    const orig30 = view.getUint32(0x30, true);
    const originsHigh = orig30 & 0x1FC00000; // preserve bits 22..28
    const new30 = (m3 | (m4 << 11) | originsHigh | ((abilityNum & 0x3) << 29)) >>> 0;
    view.setUint32(0x30, new30, true);

    const origMetGame = (view.getUint32(0x34, true) >>> 28) & 0xF;
    const metGame = origMetGame || 4;
    const ppWord =
      (((mon.pps[0] || 0) & 0x7F) |
        (((mon.pps[1] || 0) & 0x7F) << 7) |
        (((mon.pps[2] || 0) & 0x7F) << 14) |
        (((mon.pps[3] || 0) & 0x7F) << 21) |
        (metGame << 28)) >>> 0;
    view.setUint32(0x34, ppWord, true);

    for (let i = 0; i < 6; i++) {
      b[0x38 + i] = Math.max(0, Math.min(252, mon.evs[i] || 0));
    }
    b[0x3E] = b[0x3E] & 0x3F; // ROM validator requires b[0x3E] <= 0x3F
    b[0x3F] = 0;

    // ROM validator requires top 2 bits of 0x40..0x43 to be 0 (b[0x43] <= 0x3F)
    view.setUint32(0x40, ivWord & 0x3FFFFFFF, true);

    if (isParty && b.length >= CONSTANTS.MON_SIZE) {
      // ROM validator requires bytes 0x44..0x4B to be all 0x00
      b.fill(0x00, 0x44, 0x4C);
    }
  } else {
    // 76-byte BoxPokemon layout (v1.1.x)
    const secView = new DataView(b.buffer, b.byteOffset + 32, 44);
    secView.setUint16(0, (mon.species & 0x7FF) | (((mon.teraType || 1) & 0x1F) << 11), true);
    secView.setUint16(2, (mon.heldItem & 0x3FF) | ((ballId & 0x3F) << 10), true);
    secView.setUint32(4, mon.experience & 0xFFFFFF, true);

    b[32 + 10] = ppBonuses;
    b[32 + 11] = mon.friendship || 70;

    for (let i = 0; i < 4; i++) {
      secView.setUint16(12 + i * 2, (mon.moves[i] || 0) & 0x7FF, true);
    }

    const m3Orig = secView.getUint16(18, true);
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
    secView.setUint32(40, ivWord & ~(1 << 30), true);
  }

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
