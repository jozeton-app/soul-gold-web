// src/engine/SaveWriter.ts
import { CONSTANTS } from './constants';

const EXPECTED_SECTOR_SIZES: { [id: number]: number } = {
  0: CONSTANTS.SB2_SIZE,
  1: CONSTANTS.SECTOR_DATA_SIZE,
  2: CONSTANTS.SECTOR_DATA_SIZE,
  3: CONSTANTS.SECTOR_DATA_SIZE,
  4: 3540,
};
for (let i = 5; i < 14; i++) {
  EXPECTED_SECTOR_SIZES[i] = CONSTANTS.SECTOR_DATA_SIZE;
}

function calcSectorChecksum(data: Uint8Array, size: number): number {
  let chk = 0;
  const numDwords = Math.floor(size / 4);
  const view = new DataView(data.buffer, data.byteOffset, size);
  for (let i = 0; i < numDwords; i++) {
    chk = (chk + view.getUint32(i * 4, true)) >>> 0;
  }
  return ((chk >>> 16) + chk) & 0xFFFF;
}

export function exportUpdatedSave(
  originalBuffer: Uint8Array,
  activeSlot: number,
  sb1: Uint8Array,
  sb2: Uint8Array,
  storage: Uint8Array
): Uint8Array {
  const rawData = new Uint8Array(originalBuffer);
  const view = new DataView(rawData.buffer);

  const c0 = view.getUint32(0 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);
  const c1 = view.getUint32(14 * CONSTANTS.SECTOR_SIZE + 0xFFC, true);
  const baseCounter = Math.max(c0, c1);

  let slot0Counter = 0;
  let slot1Counter = 0;

  if (activeSlot === 0) {
    if (baseCounter % 2 === 1) {
      slot0Counter = baseCounter + 1;
      slot1Counter = baseCounter;
    } else {
      slot0Counter = baseCounter + 2;
      slot1Counter = baseCounter + 1;
    }
  } else {
    if (baseCounter % 2 === 0) {
      slot1Counter = baseCounter + 1;
      slot0Counter = baseCounter;
    } else {
      slot1Counter = baseCounter + 2;
      slot0Counter = baseCounter + 1;
    }
  }

  const activeCounter = activeSlot === 0 ? slot0Counter : slot1Counter;
  const backupSlot = 1 - activeSlot;
  const backupCounter = backupSlot === 0 ? slot0Counter : slot1Counter;

  const sectorDataMap: { [sid: number]: Uint8Array } = {};
  for (let sid = 0; sid < 14; sid++) {
    const sec = new Uint8Array(CONSTANTS.SECTOR_SIZE);

    if (sid === 0) {
      sec.set(sb2.subarray(0, CONSTANTS.SB2_SIZE), 0);
    } else if (sid >= 1 && sid <= 4) {
      const start = (sid - 1) * CONSTANTS.SECTOR_DATA_SIZE;
      const end = Math.min(start + CONSTANTS.SECTOR_DATA_SIZE, CONSTANTS.SB1_SIZE);
      sec.set(sb1.subarray(start, end), 0);
    } else if (sid >= CONSTANTS.STORAGE_SECTORS_START && sid <= CONSTANTS.STORAGE_SECTORS_END) {
      const start = (sid - CONSTANTS.STORAGE_SECTORS_START) * CONSTANTS.SECTOR_DATA_SIZE;
      const end = Math.min(start + CONSTANTS.SECTOR_DATA_SIZE, CONSTANTS.STORAGE_TOTAL_SIZE);
      sec.set(storage.subarray(start, end), 0);
    }
    sectorDataMap[sid] = sec;
  }

  for (let sid = 0; sid < 14; sid++) {
    const physIdx = 14 * activeSlot + sid;
    const sec = new Uint8Array(sectorDataMap[sid]);
    const expSize = EXPECTED_SECTOR_SIZES[sid] || CONSTANTS.SECTOR_DATA_SIZE;
    const chk = calcSectorChecksum(sec.subarray(0, expSize), expSize);

    const sView = new DataView(sec.buffer);
    sView.setUint16(0xFF4, sid, true);
    sView.setUint16(0xFF6, chk, true);
    sView.setUint32(0xFF8, CONSTANTS.SECTOR_SIGNATURE, true);
    sView.setUint32(0xFFC, activeCounter, true);

    rawData.set(sec, physIdx * CONSTANTS.SECTOR_SIZE);
  }

  for (let sid = 0; sid < 14; sid++) {
    const physIdx = 14 * backupSlot + sid;
    const sec = new Uint8Array(sectorDataMap[sid]);
    const expSize = EXPECTED_SECTOR_SIZES[sid] || CONSTANTS.SECTOR_DATA_SIZE;
    const chk = calcSectorChecksum(sec.subarray(0, expSize), expSize);

    const sView = new DataView(sec.buffer);
    sView.setUint16(0xFF4, sid, true);
    sView.setUint16(0xFF6, chk, true);
    sView.setUint32(0xFF8, CONSTANTS.SECTOR_SIGNATURE, true);
    sView.setUint32(0xFFC, backupCounter, true);

    rawData.set(sec, physIdx * CONSTANTS.SECTOR_SIZE);
  }

  view.setUint32(28 * CONSTANTS.SECTOR_SIZE + 0xFFC, slot0Counter, true);
  view.setUint32(30 * CONSTANTS.SECTOR_SIZE + 0xFFC, slot0Counter, true);
  view.setUint32(29 * CONSTANTS.SECTOR_SIZE + 0xFFC, slot1Counter, true);
  view.setUint32(31 * CONSTANTS.SECTOR_SIZE + 0xFFC, slot1Counter, true);

  return rawData;
}