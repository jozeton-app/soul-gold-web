// src/engine/SaveWriter.ts
import { CONSTANTS } from './constants';
import type { SoulGoldSave } from './SaveParser';

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

function calcChecksum(data: Uint8Array, size: number, seed: number = 0): number {
  let chk = seed >>> 0;
  const numDwords = Math.floor(size / 4);
  const view = new DataView(data.buffer, data.byteOffset, size);
  for (let i = 0; i < numDwords; i++) {
    chk = (chk + view.getUint32(i * 4, true)) >>> 0;
  }
  return ((chk >>> 16) + (chk & 0xFFFF)) & 0xFFFF;
}

export function exportUpdatedSave(save: SoulGoldSave): Uint8Array {
  const out = new Uint8Array(save.buffer);
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);

  const activeSlot = save.activeSlot;
  const isV12 = save.isV12;
  const sigVal = isV12 ? CONSTANTS.SECTOR_SIGNATURE_V12 : CONSTANTS.SECTOR_SIGNATURE_V11;
  const saveCounter = save.saveCounter;
  const sectorMap = save.sectorMap;

  const s28Off = (28 + activeSlot) * CONSTANTS.SECTOR_SIZE;
  const s30Off = (30 + activeSlot) * CONSTANTS.SECTOR_SIZE;

  // 1. Write SaveBlock2 (Logical Sector 0)
  if (sectorMap[0] !== undefined) {
    out.set(save.sb2.subarray(0, CONSTANTS.SB2_SIZE), sectorMap[0]);
  }

  // 2. Write SaveBlock1 (Logical Sectors 1..3 and first part of Sector 4)
  for (let sid = 1; sid <= 3; sid++) {
    if (sectorMap[sid] !== undefined) {
      const start = (sid - 1) * CONSTANTS.SECTOR_DATA_SIZE;
      out.set(save.sb1.subarray(start, start + CONSTANTS.SECTOR_DATA_SIZE), sectorMap[sid]);
    }
  }

  if (sectorMap[4] !== undefined) {
    const start4 = 3 * CONSTANTS.SECTOR_DATA_SIZE;
    const sb1Sec4Len = isV12 ? CONSTANTS.SB1_SEC4_SIZE_V12 : 3540;
    out.set(save.sb1.subarray(start4, start4 + sb1Sec4Len), sectorMap[4]);
  }

  // 3. Recompute PC Storage Checksums and Scatter 4-Region Virtual Buffer
  const storView = new DataView(save.storage.buffer, save.storage.byteOffset, save.storage.byteLength);

  if (isV12) {
    // Recompute BX21 main checksum over virtual storage [0x0010 .. 0xA9C0] (43,440 bytes)
    const bxChk = calcChecksum(save.storage.subarray(0x0010, CONSTANTS.BX21_TOTAL_SIZE), CONSTANTS.BX21_TOTAL_SIZE - 0x0010);
    storView.setUint16(0x0008, bxChk, true);
    storView.setUint16(0x000A, (~bxChk) & 0xFFFF, true);

    // Region 1 -> Logical Sectors 5..13
    for (let sid = 5; sid <= 13; sid++) {
      if (sectorMap[sid] !== undefined) {
        const st = (sid - 5) * CONSTANTS.SECTOR_DATA_SIZE;
        out.set(save.storage.subarray(st, st + CONSTANTS.SECTOR_DATA_SIZE), sectorMap[sid]);
      }
    }

    // Region 2 -> Physical Sector 30 + activeSlot [0x0000..0x0F80]
    out.set(save.storage.subarray(0x8B80, 0x8B80 + 0x0F80), s30Off);

    // Region 3 -> Logical Sector 4 [0x061A..0x0DB2]
    if (sectorMap[4] !== undefined) {
      out.set(save.storage.subarray(0x9B00, 0x9B00 + 0x0798), sectorMap[4] + 0x061A);
    }

    // Region 4 -> Physical Sector 28 + activeSlot [0x000C..0x0734]
    out.set(save.storage.subarray(0xA298, 0xA298 + 0x0728), s28Off + 0x000C);

    // Recompute Aux BX21 checksum on Physical Sector 28 + activeSlot over [0x000C..0x0D68] (0x0D5C bytes)
    const auxChk = calcChecksum(out.subarray(s28Off + 0x000C, s28Off + 0x000C + 0x0D5C), 0x0D5C);
    outView.setUint16(s28Off + 0x0008, auxChk, true);
    outView.setUint16(s28Off + 0x000A, (~auxChk) & 0xFFFF, true);
  } else {
    // v1.1.x: Recompute BX17/18 checksum at storage[0x90B0..0x90B3] if header is present
    const hdr18 = storView.getUint32(0x90AC, true);
    if (hdr18 === 0x38315842 || hdr18 === 0x39315842) {
      const seed = hdr18 === 0x39315842 ? 0x39315842 : 0;
      const bx18Chk = calcChecksum(save.storage.subarray(0x90B4, 0xA298), 0x11E4, seed);
      storView.setUint16(0x90B0, bx18Chk, true);
      storView.setUint16(0x90B2, (~bx18Chk) & 0xFFFF, true);
    }

    // Region 1 -> Logical Sectors 5..13
    for (let sid = 5; sid <= 13; sid++) {
      if (sectorMap[sid] !== undefined) {
        const st = (sid - 5) * CONSTANTS.SECTOR_DATA_SIZE;
        out.set(save.storage.subarray(st, st + CONSTANTS.SECTOR_DATA_SIZE), sectorMap[sid]);
      }
    }

    // Region 2 -> Physical Sector 30 + activeSlot [0x0000..0x0F80]
    out.set(save.storage.subarray(0x8B80, 0x8B80 + 0x0F80), s30Off);

    // Region 3 -> Logical Sector 4 [0x061A..0x0DB2]
    if (sectorMap[4] !== undefined) {
      out.set(save.storage.subarray(0x9B00, 0x9B00 + 0x0798), sectorMap[4] + 0x061A);
    }

    // Region 4 -> Physical Sector 28 + activeSlot [0x000C..0x0F34]
    out.set(save.storage.subarray(0xA298, 0xA298 + 0x0F28), s28Off + 0x000C);

    // Recompute BX19 checksum on Physical Sector 28 + activeSlot over [0x000C..0x0F34] (0x0F28 bytes)
    if (outView.getUint32(s28Off, true) === 0x39315842) {
      const auxChk = calcChecksum(out.subarray(s28Off + 0x000C, s28Off + 0x000C + 0x0F28), 0x0F28);
      outView.setUint16(s28Off + 0x0008, auxChk, true);
      outView.setUint16(s28Off + 0x000A, (~auxChk) & 0xFFFF, true);
    }
  }

  // 4. Recompute Sector Footer Checksums (+0xFF6) for Logical Sectors 0..13
  for (let sid = 0; sid < 14; sid++) {
    const sOff = sectorMap[sid];
    if (sOff !== undefined) {
      const expSize = EXPECTED_SECTOR_SIZES[sid] || CONSTANTS.SECTOR_DATA_SIZE;
      const chk = calcChecksum(out.subarray(sOff, sOff + expSize), expSize);
      outView.setUint16(sOff + 0xFF4, sid, true);
      outView.setUint16(sOff + 0xFF6, chk, true);
      outView.setUint32(sOff + 0xFF8, sigVal, true);
      outView.setUint32(sOff + 0xFFC, saveCounter, true);
    }
  }

  // 5. Recompute Sector Footer Checksums (+0xFF6) for Physical Sectors 28 + activeSlot and 30 + activeSlot
  const extraSectors: Array<{ physSec: number; chkSize: number }> = [
    { physSec: 28 + activeSlot, chkSize: CONSTANTS.SECTOR_DATA_SIZE },
    { physSec: 30 + activeSlot, chkSize: isV12 ? CONSTANTS.SECTOR_DATA_SIZE : 0x052C },
  ];

  for (const { physSec, chkSize } of extraSectors) {
    const pOff = physSec * CONSTANTS.SECTOR_SIZE;
    const existingSig = outView.getUint32(pOff + 0xFF8, true);
    if (existingSig === CONSTANTS.SECTOR_SIGNATURE_V11 || existingSig === CONSTANTS.SECTOR_SIGNATURE_V12) {
      const sChk = calcChecksum(out.subarray(pOff, pOff + chkSize), chkSize);
      outView.setUint16(pOff + 0xFF4, physSec, true);
      outView.setUint16(pOff + 0xFF6, sChk, true);
      outView.setUint32(pOff + 0xFF8, sigVal, true);
      outView.setUint32(pOff + 0xFFC, saveCounter, true);
    }
  }

  return out;
}
