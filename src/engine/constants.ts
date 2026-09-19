// src/engine/constants.ts
export const CONSTANTS = {
  SECTOR_SIZE: 4096,
  SECTOR_DATA_SIZE: 3968,
  SECTOR_SIGNATURE: 0x08012025,

  SB2_SIZE: 2864,  // 0xB30
  SB1_SIZE: 15444, // 0x3C54

  SB2_PLAYER_NAME: 0x00,
  SB2_PLAYER_GENDER: 0x08,
  SB2_TRAINER_ID: 0x0A,
  SB2_PLAY_TIME_HOURS: 0x0E,
  SB2_PLAY_TIME_MINS: 0x10,
  SB2_PLAY_TIME_SECS: 0x11,
  SB2_ENCRYPTION_KEY: 0xB4,

  SB1_PARTY_COUNT: 0x234,
  SB1_PARTY: 0x238,
  SB1_MONEY: 0x478,
  SB1_COINS: 0x47C,
  SB1_BAG: 0x548,

  PARTY_SIZE: 6,
  MON_SIZE: 96,
  BOX_MON_SIZE: 76,

  TOTAL_BOXES: 14,
  BOX_CAPACITY: 30,
  STORAGE_SECTORS_START: 5,
  STORAGE_SECTORS_END: 13,
  STORAGE_TOTAL_SIZE: 35712,
  STORAGE_CURRENT_BOX: 0x0000,
  STORAGE_BOXES_OFFSET: 0x0004,
  STORAGE_BOX_NAMES_OFFSET: 0x859C,
  STORAGE_BOX_WALLPAPERS_OFFSET: 0x8623,

  BAG_POCKETS: {
    Items: { offset: 0, count: 150 },
    Medicine: { offset: 600, count: 65 },
    KeyItems: { offset: 860, count: 50 },
    PokeBalls: { offset: 1060, count: 27 },
    TMsHMs: { offset: 1168, count: 128 },
    MegaStones: { offset: 1680, count: 35 },
    BattleItems: { offset: 1820, count: 100 },
    Berries: { offset: 2220, count: 70 },
  }
};