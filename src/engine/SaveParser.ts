// src/engine/SaveParser.ts
import { CONSTANTS } from './constants';
import { decodeGbaString, encodeGbaString } from './charmap';
import { getSpeciesName } from './lookup';

export type DecryptedPokemon = {
  personality: number;
  otId: number;
  nickname: string;
  otName: string;
  language: number;
  hiddenNatureModifier: number;
  isBadEgg: boolean;
  hasSpecies: boolean;
  isEgg: boolean;
  shinyModifier: number;
  species: number;
  teraType: number;
  heldItem: number;
  pokeball: number;
  experience: number;
  moves: number[];
  pps: number[];
  evs: number[];
  ivs: number[];
  ppBonuses: number[];
  pokerus: number;
  metLocation: number;
  metLevel: number;
  level: number;
  hp?: number;
  maxHp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  spAttack?: number;
  spDefense?: number;
  status?: number;
  friendship?: number;
  abilityNum?: number;
};

export interface BagItem {
  id: number;
  quantity: number;
}

export class SoulGoldSave {
  public buffer: Uint8Array;
  public sb1: Uint8Array;
  public sb2: Uint8Array;
  public storage: Uint8Array;
  public activeSlot: number = 0;
  public saveCounter: number = 0;
  public encryptionKey: number = 0;

  constructor(arrayBuffer: ArrayBuffer) {
    this.buffer = new Uint8Array(arrayBuffer);
    this.sb1 = new Uint8Array(CONSTANTS.SB1_SIZE);
    this.sb2 = new Uint8Array(CONSTANTS.SB2_SIZE);
    this.storage = new Uint8Array(CONSTANTS.STORAGE_TOTAL_SIZE);
    this.parseActiveSlot();
  }

  private parseActiveSlot() {
    const view = new DataView(this.buffer.buffer);
    const c0 = view.getUint32(0 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);
    const c1 = view.getUint32(14 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);
    this.activeSlot = c1 > c0 ? 1 : 0;
    this.saveCounter = Math.max(c0, c1);

    const baseOffset = 14 * this.activeSlot * CONSTANTS.SECTOR_SIZE;
    const sectorMap: { [id: number]: number } = {};

    for (let i = 0; i < 14; i++) {
      const sOffset = baseOffset + i * CONSTANTS.SECTOR_SIZE;
      const secId = view.getUint16(sOffset + 0xFF4, true);
      const sig = view.getUint32(sOffset + 0xFF8, true);
      if (sig === CONSTANTS.SECTOR_SIGNATURE && secId < 14) {
        sectorMap[secId] = sOffset;
      }
    }

    if (sectorMap[0] !== undefined) {
      this.sb2.set(this.buffer.subarray(sectorMap[0], sectorMap[0] + CONSTANTS.SB2_SIZE));
      const sb2View = new DataView(this.sb2.buffer);
      this.encryptionKey = sb2View.getUint32(CONSTANTS.SB2_ENCRYPTION_KEY, true);
    }

    let sb1Pos = 0;
    for (let sid = 1; sid <= 4; sid++) {
      if (sectorMap[sid] !== undefined) {
        const chunk = Math.min(CONSTANTS.SECTOR_DATA_SIZE, CONSTANTS.SB1_SIZE - sb1Pos);
        this.sb1.set(this.buffer.subarray(sectorMap[sid], sectorMap[sid] + chunk), sb1Pos);
        sb1Pos += chunk;
      }
    }

    let storPos = 0;
    for (let sid = CONSTANTS.STORAGE_SECTORS_START; sid <= CONSTANTS.STORAGE_SECTORS_END; sid++) {
      if (sectorMap[sid] !== undefined) {
        const chunk = Math.min(CONSTANTS.SECTOR_DATA_SIZE, CONSTANTS.STORAGE_TOTAL_SIZE - storPos);
        this.storage.set(this.buffer.subarray(sectorMap[sid], sectorMap[sid] + chunk), storPos);
        storPos += chunk;
      }
    }
  }

  public getTrainerInfo() {
    const sb2View = new DataView(this.sb2.buffer);
    const sb1View = new DataView(this.sb1.buffer);
    const nameBytes = this.sb2.subarray(CONSTANTS.SB2_PLAYER_NAME, CONSTANTS.SB2_PLAYER_NAME + 8);

    const rawMoney = sb1View.getUint32(CONSTANTS.SB1_MONEY, true);
    const money = ((rawMoney ^ this.encryptionKey) >>> 0) & 0xFFFFFFFF;

    const rawCoins = sb1View.getUint16(CONSTANTS.SB1_COINS, true);
    const coins = (rawCoins ^ (this.encryptionKey & 0xFFFF)) & 0xFFFF;

    return {
      name: decodeGbaString(nameBytes, 8),
      gender: this.sb2[CONSTANTS.SB2_PLAYER_GENDER] === 1 ? 'Girl' : 'Boy',
      genderCode: this.sb2[CONSTANTS.SB2_PLAYER_GENDER],
      tid: sb2View.getUint16(CONSTANTS.SB2_TRAINER_ID, true),
      sid: sb2View.getUint16(CONSTANTS.SB2_TRAINER_ID + 2, true),
      money: Math.min(999999, Math.max(0, money)),
      coins: Math.min(9999, Math.max(0, coins)),
    };
  }

  public setTrainerInfo(data: { name: string; gender: number; tid: number; sid: number; money: number; coins: number }) {
    const sb2View = new DataView(this.sb2.buffer);
    const sb1View = new DataView(this.sb1.buffer);

    this.sb2.set(encodeGbaString(data.name.slice(0, 7), 8), CONSTANTS.SB2_PLAYER_NAME);
    this.sb2[CONSTANTS.SB2_PLAYER_GENDER] = data.gender & 0x1;

    sb2View.setUint16(CONSTANTS.SB2_TRAINER_ID, data.tid & 0xFFFF, true);
    sb2View.setUint16(CONSTANTS.SB2_TRAINER_ID + 2, data.sid & 0xFFFF, true);

    const clampedMoney = Math.min(999999, Math.max(0, data.money));
    const storeMoney = (clampedMoney ^ this.encryptionKey) >>> 0;
    sb1View.setUint32(CONSTANTS.SB1_MONEY, storeMoney, true);

    const clampedCoins = Math.min(9999, Math.max(0, data.coins));
    const storeCoins = (clampedCoins ^ (this.encryptionKey & 0xFFFF)) & 0xFFFF;
    sb1View.setUint16(CONSTANTS.SB1_COINS, storeCoins, true);
  }

  public getPocketItems(pocketKey: keyof typeof CONSTANTS.BAG_POCKETS): BagItem[] {
    const info = CONSTANTS.BAG_POCKETS[pocketKey];
    if (!info) return [];
    const base = CONSTANTS.SB1_BAG + info.offset;
    const items: BagItem[] = [];
    const view = new DataView(this.sb1.buffer, this.sb1.byteOffset + base, info.count * 4);
    const encHword = this.encryptionKey & 0xFFFF;

    for (let i = 0; i < info.count; i++) {
      const id = view.getUint16(i * 4, true);
      const rawQty = view.getUint16(i * 4 + 2, true);
      if (id !== 0) {
        const qty = (rawQty ^ encHword) & 0xFFFF;
        items.push({ id, quantity: qty });
      }
    }
    return items;
  }

  public setPocketItems(pocketKey: keyof typeof CONSTANTS.BAG_POCKETS, items: BagItem[]) {
    const info = CONSTANTS.BAG_POCKETS[pocketKey];
    if (!info) return;
    const base = CONSTANTS.SB1_BAG + info.offset;
    const view = new DataView(this.sb1.buffer, this.sb1.byteOffset + base, info.count * 4);
    const encHword = this.encryptionKey & 0xFFFF;

    for (let i = 0; i < info.count; i++) {
      if (i < items.length) {
        const it = items[i];
        const encQty = (it.quantity ^ encHword) & 0xFFFF;
        view.setUint16(i * 4, it.id & 0xFFFF, true);
        view.setUint16(i * 4 + 2, encQty, true);
      } else {
        view.setUint16(i * 4, 0, true);
        view.setUint16(i * 4 + 2, 0, true);
      }
    }
  }

  public getParty(): DecryptedPokemon[] {
    const sb1View = new DataView(this.sb1.buffer);
    const count = Math.min(sb1View.getUint32(CONSTANTS.SB1_PARTY_COUNT, true), CONSTANTS.PARTY_SIZE);
    const party: DecryptedPokemon[] = [];

    for (let i = 0; i < count; i++) {
      const monOffset = CONSTANTS.SB1_PARTY + i * CONSTANTS.MON_SIZE;
      const monBytes = this.sb1.subarray(monOffset, monOffset + CONSTANTS.MON_SIZE);
      const mon = this.unpackMon(monBytes, true);
      if (mon && mon.species > 0) party.push(mon);
    }
    return party;
  }

  public getBoxPokemon(boxIndex: number, slotIndex: number): DecryptedPokemon | null {
    if (boxIndex < 0 || boxIndex >= CONSTANTS.TOTAL_BOXES || slotIndex < 0 || slotIndex >= CONSTANTS.BOX_CAPACITY) {
      return null;
    }
    const linearIndex = boxIndex * CONSTANTS.BOX_CAPACITY + slotIndex;
    const offset = CONSTANTS.STORAGE_BOXES_OFFSET + linearIndex * CONSTANTS.BOX_MON_SIZE;
    const monBytes = this.storage.subarray(offset, offset + CONSTANTS.BOX_MON_SIZE);
    return this.unpackMon(monBytes, false);
  }

  public getBoxNames(): string[] {
    const names: string[] = [];
    for (let b = 0; b < CONSTANTS.TOTAL_BOXES; b++) {
      const off = CONSTANTS.STORAGE_BOX_NAMES_OFFSET + b * 9;
      names.push(decodeGbaString(this.storage.subarray(off, off + 9), 9));
    }
    return names;
  }

  public setBoxName(boxIndex: number, name: string) {
    if (boxIndex >= 0 && boxIndex < CONSTANTS.TOTAL_BOXES) {
      const off = CONSTANTS.STORAGE_BOX_NAMES_OFFSET + boxIndex * 9;
      this.storage.set(encodeGbaString(name.slice(0, 8), 9), off);
    }
  }

  public getBoxWallpapers(): number[] {
    const wallpapers: number[] = [];
    for (let b = 0; b < CONSTANTS.TOTAL_BOXES; b++) {
      const off = CONSTANTS.STORAGE_BOX_WALLPAPERS_OFFSET + b;
      wallpapers.push(off < this.storage.length ? this.storage[off] : 0);
    }
    return wallpapers;
  }

  public setBoxWallpaper(boxIndex: number, wallpaperIdx: number) {
    if (boxIndex >= 0 && boxIndex < CONSTANTS.TOTAL_BOXES) {
      const off = CONSTANTS.STORAGE_BOX_WALLPAPERS_OFFSET + boxIndex;
      if (off < this.storage.length) this.storage[off] = wallpaperIdx & 0xFF;
    }
  }

  public getCurrentBox(): number {
    return this.storage.length > CONSTANTS.STORAGE_CURRENT_BOX ? this.storage[CONSTANTS.STORAGE_CURRENT_BOX] : 0;
  }

  public setCurrentBox(boxIdx: number) {
    if (boxIdx >= 0 && boxIdx < CONSTANTS.TOTAL_BOXES) {
      this.storage[CONSTANTS.STORAGE_CURRENT_BOX] = boxIdx;
    }
  }

  private unpackMon(b: Uint8Array, isParty: boolean): DecryptedPokemon | null {
    if (b.length < CONSTANTS.BOX_MON_SIZE) return null;

    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const personality = view.getUint32(0, true);
    const otId = view.getUint32(4, true);

    if (personality === 0 && otId === 0) return null;

    const rawNick = decodeGbaString(b.subarray(8, 20), 12);
    const b20 = b[20];
    const language = b20 & 0x7;
    const hiddenNatureModifier = (b20 >> 3) & 0x1F;

    const b21 = b[21];
    const isBadEgg = Boolean(b21 & 0x1);
    const hasSpecies = Boolean(b21 & 0x2);
    const isEgg = Boolean(b21 & 0x4);

    const otName = decodeGbaString(b.subarray(22, 29), 7);
    const w30 = view.getUint16(30, true);
    const shinyModifier = (w30 >> 14) & 0x1;

    const secView = new DataView(b.buffer, b.byteOffset + 32, 44);
    const w0 = secView.getUint16(0, true);
    const species = w0 & 0x7FF;
    const teraType = (w0 >> 11) & 0x1F;

    const w1 = secView.getUint16(2, true);
    const heldItem = w1 & 0x3FF;
    const pokeball = (w1 >> 10) & 0x3F;

    const d4 = secView.getUint32(4, true);
    const experience = d4 & 0xFFFFFF;

    const ppBonusesByte = b[32 + 10];
    const ppBonuses = [0, 1, 2, 3].map((i) => (ppBonusesByte >> (2 * i)) & 0x3);

    const moves = [
      secView.getUint16(12, true) & 0x7FF,
      secView.getUint16(14, true) & 0x7FF,
      secView.getUint16(16, true) & 0x7FF,
      secView.getUint16(18, true) & 0x7FF,
    ];

    const pps = [
      secView.getUint8(20) & 0x7F,
      secView.getUint8(21) & 0x7F,
      secView.getUint8(22) & 0x7F,
      secView.getUint8(23) & 0x7F,
    ];

    const evs = Array.from(b.subarray(32 + 24, 32 + 30));
    const pokerus = b[32 + 36];
    const metLocation = b[32 + 37];
    const wMet = secView.getUint16(38, true);
    const metLevel = wMet & 0x7F;

    const m3 = secView.getUint16(18, true);
    const abilityNum = (m3 >> 12) & 0x3;

    const ivWord = secView.getUint32(40, true);
    const ivs = [
      ivWord & 0x1F,
      (ivWord >> 5) & 0x1F,
      (ivWord >> 10) & 0x1F,
      (ivWord >> 15) & 0x1F,
      (ivWord >> 20) & 0x1F,
      (ivWord >> 25) & 0x1F,
    ];

    const fullSpecies = getSpeciesName(species).toUpperCase();
    const baseSpecies = fullSpecies.replace(/\b(MEGA(\s+[XY])?|PRIMAL|GMAX)\b/gi, '').trim();
    const rawNickClean = rawNick.toUpperCase().trim();
    const isDefaultNick = rawNickClean === '' || rawNickClean === fullSpecies || rawNickClean === baseSpecies;

    const mon: DecryptedPokemon = {
      personality,
      otId,
      nickname: isDefaultNick ? '' : rawNick,
      otName,
      language,
      hiddenNatureModifier,
      isBadEgg,
      hasSpecies,
      isEgg,
      shinyModifier,
      species,
      teraType: teraType || 1,
      heldItem,
      pokeball: pokeball || 1,
      experience,
      moves,
      pps,
      evs,
      ivs,
      ppBonuses,
      pokerus,
      metLocation,
      metLevel,
      level: 5,
      friendship: b[32 + 11] || 70,
      abilityNum,
    };

    if (isParty && b.length >= CONSTANTS.MON_SIZE) {
      mon.status = view.getUint32(76, true);
      mon.level = b[80];
      mon.hp = view.getUint16(82, true);
      mon.maxHp = view.getUint16(84, true);
      mon.attack = view.getUint16(86, true);
      mon.defense = view.getUint16(88, true);
      mon.speed = view.getUint16(90, true);
      mon.spAttack = view.getUint16(92, true);
      mon.spDefense = view.getUint16(94, true);
    }

    return mon;
  }
}