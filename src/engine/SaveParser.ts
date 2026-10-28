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
  public isV12: boolean = false;
  public sectorMap: { [id: number]: number } = {};

  constructor(arrayBuffer: ArrayBuffer) {
    this.buffer = new Uint8Array(arrayBuffer);
    this.sb1 = new Uint8Array(CONSTANTS.SB1_SIZE);
    this.sb2 = new Uint8Array(CONSTANTS.SB2_SIZE);
    this.storage = new Uint8Array(CONSTANTS.STORAGE_TOTAL_SIZE);
    this.parseActiveSlot();
  }

  public get totalBoxes(): number {
    return this.isV12 ? CONSTANTS.TOTAL_BOXES_V12 : CONSTANTS.TOTAL_BOXES_V11;
  }

  public get boxMonSize(): number {
    return this.isV12 ? CONSTANTS.BOX_MON_SIZE_V12 : CONSTANTS.BOX_MON_SIZE_V11;
  }

  public getBoxSlotOffset(boxIndex: number, slotIndex: number): number {
    if (this.isV12) {
      const linearIndex = boxIndex * CONSTANTS.BOX_CAPACITY + slotIndex;
      return CONSTANTS.BX21_BOXES_OFFSET + linearIndex * CONSTANTS.BOX_MON_SIZE_V12;
    }
    const boxByteSize = CONSTANTS.BOX_CAPACITY * CONSTANTS.BOX_MON_SIZE_V11; // 2280 (0x8E8)
    if (boxIndex < 15) {
      return CONSTANTS.STORAGE_BOXES_OFFSET + boxIndex * boxByteSize + slotIndex * CONSTANTS.BOX_MON_SIZE_V11;
    } else if (boxIndex === 15) {
      return 0x87B8 + slotIndex * CONSTANTS.BOX_MON_SIZE_V11;
    } else if (boxIndex === 16 || boxIndex === 17) {
      return 0x90B4 + (boxIndex - 16) * boxByteSize + slotIndex * CONSTANTS.BOX_MON_SIZE_V11;
    } else {
      return 0xA298 + slotIndex * CONSTANTS.BOX_MON_SIZE_V11;
    }
  }

  private getBoxNameOffset(boxIndex: number): number {
    if (this.isV12) {
      return CONSTANTS.BX21_BOX_NAMES_OFFSET + boxIndex * 9;
    }
    if (boxIndex < 15) return CONSTANTS.STORAGE_BOX_NAMES_OFFSET + boxIndex * 9;
    if (boxIndex === 15) return 0x90A0;
    if (boxIndex === 16 || boxIndex === 17) return 0xA284 + (boxIndex - 16) * 9;
    return 0xAB80;
  }

  private getBoxWallpaperOffset(boxIndex: number): number {
    if (this.isV12) {
      return CONSTANTS.BX21_BOX_WALLPAPERS_OFFSET + boxIndex;
    }
    if (boxIndex < 15) return CONSTANTS.STORAGE_BOX_WALLPAPERS_OFFSET + boxIndex;
    if (boxIndex === 15) return 0x90A9;
    if (boxIndex === 16 || boxIndex === 17) return 0xA296 + (boxIndex - 16);
    return 0xAB89;
  }

  private parseActiveSlot() {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    const sig0 = view.getUint32(0 * CONSTANTS.SECTOR_SIZE + 0xFF8, true);
    const c0 = view.getUint32(0 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);
    const sig1 = view.getUint32(14 * CONSTANTS.SECTOR_SIZE + 0xFF8, true);
    const c1 = view.getUint32(14 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);

    const valid0 = (sig0 === CONSTANTS.SECTOR_SIGNATURE_V11 || sig0 === CONSTANTS.SECTOR_SIGNATURE_V12) && c0 !== 0xFFFFFFFF;
    const valid1 = (sig1 === CONSTANTS.SECTOR_SIGNATURE_V11 || sig1 === CONSTANTS.SECTOR_SIGNATURE_V12) && c1 !== 0xFFFFFFFF;

    if (valid0 && valid1) {
      this.activeSlot = c1 > c0 ? 1 : 0;
    } else if (valid1) {
      this.activeSlot = 1;
    } else {
      this.activeSlot = 0;
    }

    const activeSig = this.activeSlot === 1 ? sig1 : sig0;
    this.saveCounter = this.activeSlot === 1 ? c1 : c0;
    this.isV12 = activeSig === CONSTANTS.SECTOR_SIGNATURE_V12;

    const baseOffset = 14 * this.activeSlot * CONSTANTS.SECTOR_SIZE;
    this.sectorMap = {};

    for (let i = 0; i < 14; i++) {
      const sOffset = baseOffset + i * CONSTANTS.SECTOR_SIZE;
      const secId = view.getUint16(sOffset + 0xFF4, true);
      const sig = view.getUint32(sOffset + 0xFF8, true);
      if ((sig === CONSTANTS.SECTOR_SIGNATURE_V11 || sig === CONSTANTS.SECTOR_SIGNATURE_V12) && secId < 14) {
        this.sectorMap[secId] = sOffset;
      }
    }

    if (this.sectorMap[0] !== undefined) {
      this.sb2.set(this.buffer.subarray(this.sectorMap[0], this.sectorMap[0] + CONSTANTS.SB2_SIZE));
      const sb2View = new DataView(this.sb2.buffer, this.sb2.byteOffset, this.sb2.byteLength);
      this.encryptionKey = sb2View.getUint32(CONSTANTS.SB2_ENCRYPTION_KEY, true);
    }

    let sb1Pos = 0;
    for (let sid = 1; sid <= 4; sid++) {
      if (this.sectorMap[sid] !== undefined) {
        const chunk = Math.min(CONSTANTS.SECTOR_DATA_SIZE, CONSTANTS.SB1_SIZE - sb1Pos);
        this.sb1.set(this.buffer.subarray(this.sectorMap[sid], this.sectorMap[sid] + chunk), sb1Pos);
        sb1Pos += chunk;
      }
    }

    // Region 1: Logical Sectors 5..13 (0x0000..0x8B7F, 35,712 bytes)
    let storPos = 0;
    for (let sid = CONSTANTS.STORAGE_SECTORS_START; sid <= CONSTANTS.STORAGE_SECTORS_END; sid++) {
      if (this.sectorMap[sid] !== undefined) {
        this.storage.set(
          this.buffer.subarray(this.sectorMap[sid], this.sectorMap[sid] + CONSTANTS.SECTOR_DATA_SIZE),
          storPos
        );
      }
      storPos += CONSTANTS.SECTOR_DATA_SIZE;
    }

    // Region 2: Physical Sector 30 + activeSlot (0x8B80..0x9AFF, 3,968 bytes)
    const s30Offset = (30 + this.activeSlot) * CONSTANTS.SECTOR_SIZE;
    if (s30Offset + CONSTANTS.SECTOR_DATA_SIZE <= this.buffer.length) {
      this.storage.set(this.buffer.subarray(s30Offset, s30Offset + CONSTANTS.SECTOR_DATA_SIZE), 0x8B80);
    }

    // Region 3: Logical Sector 4 offset 0x061A..0x0DB1 (0x9B00..0xA297, 1,944 bytes)
    if (this.sectorMap[4] !== undefined) {
      this.storage.set(this.buffer.subarray(this.sectorMap[4] + 0x061A, this.sectorMap[4] + 0x061A + 0x0798), 0x9B00);
    }

    // Region 4: Physical Sector 28 + activeSlot offset 0x000C.. (0xA298..)
    const s28Offset = (28 + this.activeSlot) * CONSTANTS.SECTOR_SIZE;
    const r4Len = this.isV12 ? 0x0728 : 0x0F28;
    if (s28Offset + 0x000C + r4Len <= this.buffer.length) {
      this.storage.set(this.buffer.subarray(s28Offset + 0x000C, s28Offset + 0x000C + r4Len), 0xA298);
    }
  }

  public getTrainerInfo() {
    const sb2View = new DataView(this.sb2.buffer, this.sb2.byteOffset, this.sb2.byteLength);
    const sb1View = new DataView(this.sb1.buffer, this.sb1.byteOffset, this.sb1.byteLength);
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
    const sb2View = new DataView(this.sb2.buffer, this.sb2.byteOffset, this.sb2.byteLength);
    const sb1View = new DataView(this.sb1.buffer, this.sb1.byteOffset, this.sb1.byteLength);

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
    const sb1View = new DataView(this.sb1.buffer, this.sb1.byteOffset, this.sb1.byteLength);
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
    if (boxIndex < 0 || boxIndex >= this.totalBoxes || slotIndex < 0 || slotIndex >= CONSTANTS.BOX_CAPACITY) {
      return null;
    }
    const offset = this.getBoxSlotOffset(boxIndex, slotIndex);
    const monBytes = this.storage.subarray(offset, offset + this.boxMonSize);
    return this.unpackMon(monBytes, false);
  }

  public getBoxNames(): string[] {
    const names: string[] = [];
    for (let b = 0; b < this.totalBoxes; b++) {
      const off = this.getBoxNameOffset(b);
      const decoded = decodeGbaString(this.storage.subarray(off, off + 9), 9).trim();
      names.push(decoded || `Box ${b + 1}`);
    }
    return names;
  }

  public setBoxName(boxIndex: number, name: string) {
    if (boxIndex >= 0 && boxIndex < this.totalBoxes) {
      const off = this.getBoxNameOffset(boxIndex);
      this.storage.set(encodeGbaString(name.slice(0, 8), 9), off);
    }
  }

  public getBoxWallpapers(): number[] {
    const wallpapers: number[] = [];
    for (let b = 0; b < this.totalBoxes; b++) {
      const off = this.getBoxWallpaperOffset(b);
      wallpapers.push(off < this.storage.length ? this.storage[off] : 0);
    }
    return wallpapers;
  }

  public setBoxWallpaper(boxIndex: number, wallpaperIdx: number) {
    if (boxIndex >= 0 && boxIndex < this.totalBoxes) {
      const off = this.getBoxWallpaperOffset(boxIndex);
      if (off < this.storage.length) this.storage[off] = wallpaperIdx & 0xFF;
    }
  }

  public getCurrentBox(): number {
    const off = this.isV12 ? CONSTANTS.BX21_CURRENT_BOX : CONSTANTS.STORAGE_CURRENT_BOX;
    return this.storage.length > off ? this.storage[off] : 0;
  }

  public setCurrentBox(boxIdx: number) {
    if (boxIdx >= 0 && boxIdx < this.totalBoxes) {
      const off = this.isV12 ? CONSTANTS.BX21_CURRENT_BOX : CONSTANTS.STORAGE_CURRENT_BOX;
      this.storage[off] = boxIdx;
    }
  }

  private unpackMon(b: Uint8Array, isParty: boolean): DecryptedPokemon | null {
    const minSize = this.boxMonSize;
    if (b.length < minSize) return null;

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

    let species = 0;
    let teraType = 1;
    let heldItem = 0;
    let pokeball = 1;
    let experience = 0;
    let friendship = 70;
    let pokerus = 0;
    let metLocation = 0;
    let metLevel = 5;
    let moves: number[] = [0, 0, 0, 0];
    let pps: number[] = [0, 0, 0, 0];
    let ppBonuses: number[] = [0, 0, 0, 0];
    let evs: number[] = [0, 0, 0, 0, 0, 0];
    let ivs: number[] = [0, 0, 0, 0, 0, 0];
    let abilityNum = 0;

    if (this.isV12) {
      // 68-byte BoxPokemon layout (v1.2.x)
      const w0 = view.getUint16(0x20, true);
      species = w0 & 0x7FF;
      teraType = (w0 >>> 11) & 0x1F;

      const w1 = view.getUint16(0x22, true);
      heldItem = w1 & 0x3FF;
      pokeball = (w1 >>> 10) & 0x3F;

      const d24 = view.getUint32(0x24, true);
      experience = d24 & 0xFFFFFF;
      friendship = (d24 >>> 24) & 0xFF;

      pokerus = b[0x28];
      metLocation = b[0x29];
      metLevel = b[0x2B] & 0x7F;

      const m1Word = view.getUint16(0x2C, true);
      const m2Word = view.getUint16(0x2E, true);
      const m34Word = view.getUint32(0x30, true);

      moves = [
        m1Word & 0x7FF,
        m2Word & 0x7FF,
        m34Word & 0x7FF,
        (m34Word >>> 11) & 0x7FF,
      ];

      const ppBonusesByte = ((m1Word >>> 11) & 0x1F) | (((m2Word >>> 11) & 0x07) << 5);
      ppBonuses = [0, 1, 2, 3].map((i) => (ppBonusesByte >>> (2 * i)) & 0x3);

      abilityNum = (b[0x33] >>> 5) & 0x3;

      const ppWord = view.getUint32(0x34, true);
      pps = [
        ppWord & 0x7F,
        (ppWord >>> 7) & 0x7F,
        (ppWord >>> 14) & 0x7F,
        (ppWord >>> 21) & 0x7F,
      ];

      evs = Array.from(b.subarray(0x38, 0x3E));

      const ivWord = view.getUint32(0x40, true);
      ivs = [
        ivWord & 0x1F,
        (ivWord >>> 5) & 0x1F,
        (ivWord >>> 10) & 0x1F,
        (ivWord >>> 15) & 0x1F,
        (ivWord >>> 20) & 0x1F,
        (ivWord >>> 25) & 0x1F,
      ];
    } else {
      // 76-byte BoxPokemon layout (v1.1.x)
      const secView = new DataView(b.buffer, b.byteOffset + 32, 44);
      const w0 = secView.getUint16(0, true);
      species = w0 & 0x7FF;
      teraType = (w0 >> 11) & 0x1F;

      const w1 = secView.getUint16(2, true);
      heldItem = w1 & 0x3FF;
      pokeball = (w1 >> 10) & 0x3F;

      const d4 = secView.getUint32(4, true);
      experience = d4 & 0xFFFFFF;

      const ppBonusesByte = b[32 + 10];
      ppBonuses = [0, 1, 2, 3].map((i) => (ppBonusesByte >> (2 * i)) & 0x3);
      friendship = b[32 + 11] || 70;

      moves = [
        secView.getUint16(12, true) & 0x7FF,
        secView.getUint16(14, true) & 0x7FF,
        secView.getUint16(16, true) & 0x7FF,
        secView.getUint16(18, true) & 0x7FF,
      ];

      pps = [
        secView.getUint8(20) & 0x7F,
        secView.getUint8(21) & 0x7F,
        secView.getUint8(22) & 0x7F,
        secView.getUint8(23) & 0x7F,
      ];

      evs = Array.from(b.subarray(32 + 24, 32 + 30));
      pokerus = b[32 + 36];
      metLocation = b[32 + 37];
      const wMet = secView.getUint16(38, true);
      metLevel = wMet & 0x7F;

      const m3 = secView.getUint16(18, true);
      abilityNum = (m3 >> 12) & 0x3;

      const ivWord = secView.getUint32(40, true);
      ivs = [
        ivWord & 0x1F,
        (ivWord >> 5) & 0x1F,
        (ivWord >> 10) & 0x1F,
        (ivWord >> 15) & 0x1F,
        (ivWord >> 20) & 0x1F,
        (ivWord >> 25) & 0x1F,
      ];
    }

    if (species === 0) return null;

    const fullSpecies = getSpeciesName(species).toUpperCase();
    const baseSpecies = fullSpecies.replace(/\b(MEGA(\s+[XY])?|PRIMAL|GMAX)\b/gi, '').trim();
    const rawNickClean = rawNick.toUpperCase().trim();
    const isDefaultNick = rawNickClean === '' || rawNickClean === fullSpecies || rawNickClean === baseSpecies;

    const approxLevel = Math.max(1, Math.min(100, Math.round(Math.cbrt(Math.max(1, experience)))));

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
      level: metLevel || approxLevel || 5,
      friendship: friendship || 70,
      abilityNum,
    };

    if (isParty && b.length >= CONSTANTS.MON_SIZE) {
      mon.status = view.getUint32(76, true);
      mon.level = b[80] || mon.level;
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
