// src/main.ts
import './style.css';
import { SoulGoldSave } from './engine/SaveParser';
import type { DecryptedPokemon, BagItem } from './engine/SaveParser';
import {
  getSpeciesName,
  getItemName,
  getAllSpeciesList,
  getAlphabeticalItemList,
  getAllMovesList,
  getMoveBasePp,
  getSpeciesAbilities,
  isShadowLugiaSpecies,
  getSpeciesLearnset,
  NATURES_LIST,
  TERA_TYPES_GEN9,
  POKEBALLS_LIST,
  getItemsForPocket,
  getItemSpriteUrl,
  getSpriteUrl,
  type PocketType,
} from './engine/lookup';
import { exportUpdatedSave } from './engine/SaveWriter';
import { packAndWritePokemon, clearPokemonSlot, createDefaultPokemon } from './engine/MonWriter';
import { CONSTANTS } from './engine/constants';

let currentSave: SoulGoldSave | null = null;
let currentBox: number = 0;
let inspectingSlot: { type: 'party' | 'box'; index: number } | null = null;
let slotPendingCreation: { type: 'party' | 'box'; index: number } | null = null;
let activeBagPocket: PocketType = 'Items';

// Backup snapshot for Undo button in Inspector
let inspectorBackupIvs: number[] = [31, 31, 31, 31, 31, 31];
let inspectorBackupEvs: number[] = [0, 0, 0, 0, 0, 0];

const allSpecies = getAllSpeciesList();
const alphabeticalItems = getAlphabeticalItemList();
const allMoves = getAllMovesList();
const app = document.querySelector<HTMLDivElement>('#app')!;

function isMonShiny(mon: DecryptedPokemon): boolean {
  if (isShadowLugiaSpecies(mon.species)) return false;
  const p1 = (mon.personality >>> 16) & 0xFFFF;
  const p2 = mon.personality & 0xFFFF;
  const tid = mon.otId & 0xFFFF;
  const sid = (mon.otId >>> 16) & 0xFFFF;
  return Boolean(((tid ^ sid ^ p1 ^ p2) < 8) !== Boolean(mon.shinyModifier & 1));
}

function makePersonalityShiny(currentPid: number, otId: number): number {
  const tid = otId & 0xFFFF;
  const sid = (otId >>> 16) & 0xFFFF;
  const desiredXor = tid ^ sid;
  const origNature = currentPid % 25;
  const origAbilityBit = currentPid & 1;

  for (let high = 0; high <= 0xFFFF; high++) {
    const low = (high ^ desiredXor) & 0xFFFF;
    const testPid = ((high << 16) | low) >>> 0;
    if (testPid % 25 === origNature && (testPid & 1) === origAbilityBit && ((tid ^ sid ^ (testPid >>> 16) ^ (testPid & 0xFFFF)) < 8)) {
      return testPid;
    }
  }
  return (currentPid ^ 0x00010000) >>> 0;
}

function makePersonalityNonShiny(currentPid: number, otId: number): number {
  const tid = otId & 0xFFFF;
  const sid = (otId >>> 16) & 0xFFFF;
  const desiredXor = tid ^ sid;
  const origNature = currentPid % 25;
  const origAbilityBit = currentPid & 1;

  for (let high = 0; high <= 0xFFFF; high++) {
    const low = (high ^ desiredXor ^ 0x000F) & 0xFFFF;
    const testPid = ((high << 16) | low) >>> 0;
    if (testPid % 25 === origNature && (testPid & 1) === origAbilityBit && ((tid ^ sid ^ (testPid >>> 16) ^ (testPid & 0xFFFF)) >= 8)) {
      return testPid;
    }
  }
  return (currentPid ^ 0x00080000) >>> 0;
}

function setPersonalityNature(currentPid: number, targetNature: number): number {
  const base = currentPid - (currentPid % 25);
  return (base + targetNature) >>> 0;
}

function itemExistsAnywhereInBag(itemId: number, currentPocket: string, currentSlotIdx: number): boolean {
  for (const p of Object.keys(tempPocketItems)) {
    const list = tempPocketItems[p] || [];
    for (let i = 0; i < list.length; i++) {
      if (p === currentPocket && i === currentSlotIdx) continue;
      if (list[i].id === itemId) return true;
    }
  }
  return false;
}

app.innerHTML = `
  <div style="max-width: 1200px; margin: 20px auto; padding: 0 16px;">
    <header style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 14px;">
        <img src="./soulgold_icon.png" style="width: 48px; height: 48px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);" alt="SoulGold Logo" />
        <div>
          <h1 style="margin: 0; font-size: 1.6rem; color: #facc15; font-weight: 700;">Pokémon SoulGold Save Editor</h1>
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
            <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">By Jozeton</span>
            <button id="btn-kofi" style="background: #291938; color: #ff5e5b; border: 1px solid #ff5e5b; padding: 2px 10px; border-radius: 12px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">☕ Support on Ko-fi</button>
          </div>
          <div style="font-size: 0.8rem; color: #f87171; font-weight: 600; margin-top: 4px;">⚠️ Warning: Only works on version 1.14 save files.</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="btn-reimport" style="background: #334155; color: #facc15; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: none; font-weight: 600; font-size: 0.85rem;">📂 Load Different .sav</button>
          <button id="btn-export" style="background: #2563eb; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; display: none; font-weight: 600; font-size: 0.85rem;">💾 Save & Download .sav</button>
        </div>
        <button id="btn-global-apply" style="background: #10b981; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; display: none; font-weight: 600; font-size: 0.85rem;">Apply Changes</button>
      </div>
    </header>

    <div id="drop-zone" style="border: 2px dashed #475569; border-radius: 12px; padding: 60px 20px; text-align: center; cursor: pointer; background: #1e293b;">
      <p style="margin: 0; font-size: 1.1rem; color: #e2e8f0;">Drop your <strong>.sav</strong> file here, or click to browse</p>
      <span style="font-size: 0.8rem; color: #94a3b8;">Supports 128 KB GBA Flash saves (SoulGold v1.14)</span>
      <input type="file" id="file-input" accept=".sav" style="display: none;" />
    </div>

    <input type="file" id="file-reimport" accept=".sav" style="display: none;" />

    <div id="editor-workspace" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; border: 1px solid #334155; padding: 14px 20px; border-radius: 8px; margin-bottom: 20px;">
        <div id="trainer-bar"></div>
        <div style="display: flex; gap: 10px;">
          <button id="btn-open-bag" style="background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">🎒 Bag & Items</button>
          <button id="btn-edit-trainer" style="background: #334155; color: #facc15; border: 1px solid #475569; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">✏ Edit Trainer</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 340px 1fr; gap: 24px;">
        <aside style="background: #1e293b; border: 1px solid #334155; padding: 16px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h3 style="margin: 0; font-size: 1.05rem;">Party Pokémon</h3>
            <span id="party-badge" style="background: #0f172a; border: 1px solid #334155; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;"></span>
          </div>
          <div id="party-slots" style="display: flex; flex-direction: column; gap: 10px;"></div>
        </aside>

        <main style="background: #1e293b; border: 1px solid #334155; padding: 16px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <button id="btn-prev-box" style="padding: 6px 16px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">◀</button>
            <h3 id="box-title" style="margin: 0; font-size: 1.1rem; color: #93c5fd;">Box 1</h3>
            <button id="btn-next-box" style="padding: 6px 16px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶</button>
          </div>
          <div id="box-slots" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px;"></div>
        </main>
      </div>

      <div id="mon-inspector" style="margin-top: 24px; background: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 8px; display: none;"></div>
    </div>

    <!-- Trainer Modal -->
    <div id="trainer-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 100;">
      <div style="background: #1e293b; border: 1px solid #475569; border-radius: 10px; width: 420px; padding: 24px;">
        <h3 style="margin-top: 0; color: #facc15;">Edit Trainer & Wallet</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8;">Trainer Name</label>
            <input type="text" id="tr-name" maxlength="7" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div>
              <label style="font-size: 0.8rem; color: #94a3b8;">Gender</label>
              <select id="tr-gender" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
                <option value="0">Boy</option>
                <option value="1">Girl</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.8rem; color: #94a3b8;">Money ($)</label>
              <input type="number" id="tr-money" min="0" max="999999" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: #94a3b8;">Coins</label>
              <input type="number" id="tr-coins" min="0" max="9999" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;" />
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button id="btn-cancel-trainer" style="background: #334155; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
          <button id="btn-save-trainer" style="background: #10b981; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- Bag Modal -->
    <div id="bag-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); justify-content: center; align-items: center; z-index: 100;">
      <div style="background: #1e293b; border: 1px solid #475569; border-radius: 12px; width: 840px; max-width: 95vw; height: 640px; max-height: 90vh; padding: 20px 24px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #facc15; font-size: 1.2rem;">🎒 Player's Bag</h3>
          <span id="bag-pocket-counter" style="font-size: 0.8rem; color: #94a3b8; background: #0f172a; padding: 4px 10px; border-radius: 6px; font-weight: 600;"></span>
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 12px; border-bottom: 1px solid #334155; padding-bottom: 10px; flex-wrap: wrap;">
          ${(Object.keys(CONSTANTS.BAG_POCKETS) as PocketType[]).map(
            (p) => `<button class="bag-tab ${p === 'Items' ? 'active' : ''}" data-pocket="${p}" style="background: ${p === 'Items' ? '#0284c7' : '#334155'}; color: ${p === 'Items' ? 'white' : '#94a3b8'}; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem;">${p}</button>`
          ).join('')}
        </div>
        <div id="bag-slots-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;"></div>
        <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #334155; padding-top: 12px; margin-top: 12px; gap: 10px;">
          <button id="btn-cancel-bag" style="background: #334155; color: #94a3b8; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer;">Cancel</button>
          <button id="btn-save-bag" style="background: #10b981; color: white; border: none; padding: 8px 22px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Bag</button>
        </div>
      </div>
    </div>

    <!-- Create Mon Modal -->
    <div id="add-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 100;">
      <div style="background: #1e293b; border: 1px solid #475569; border-radius: 10px; width: 440px; padding: 24px;">
        <h3 style="margin-top: 0; color: #facc15;">Add New Pokémon</h3>
        <input type="text" id="add-species-search" autocomplete="off" placeholder="e.g. Torchic, Bulbasaur..." style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 10px; border-radius: 6px; box-sizing: border-box;" />
        <div id="add-match-status" style="font-size: 0.8rem; color: #94a3b8; margin-top: 8px; min-height: 20px;"></div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button id="btn-cancel-add" style="background: #334155; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
          <button id="btn-confirm-add" style="background: #10b981; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600;">Create Pokémon</button>
        </div>
      </div>
    </div>
    <div id="toast-container" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 10px;"></div>
    
    <!-- Ko-fi Modal -->
    <div id="kofi-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 10000;">
      <div style="background: #1e293b; border: 1px solid #475569; border-radius: 12px; width: 380px; max-width: 90vw; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.6);">
        <div style="padding: 12px 16px; background: #0f172a; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155;">
          <h3 style="margin: 0; font-size: 1rem; color: #facc15;">☕ Support Jozeton</h3>
          <button id="btn-close-kofi" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.2rem;">✕</button>
        </div>
        <div style="padding: 0; height: 550px; overflow-y: auto; background: #f9f9f9;">
          <iframe id='kofiframe' src='https://ko-fi.com/jozeton/?hidefeed=true&widget=true&embed=true&preview=true' style='border:none;width:100%;padding:4px;background:#f9f9f9;' height='712' title='jozeton'></iframe>
        </div>
      </div>
    </div>
  </div>
`;

const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileReimport = document.getElementById('file-reimport') as HTMLInputElement;
const btnReimport = document.getElementById('btn-reimport') as HTMLButtonElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const btnGlobalApply = document.getElementById('btn-global-apply') as HTMLButtonElement;
const btnPrevBox = document.getElementById('btn-prev-box') as HTMLButtonElement;
const btnNextBox = document.getElementById('btn-next-box') as HTMLButtonElement;

function showToast(message: string) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.style.background = '#10b981';
  toast.style.color = 'white';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '6px';
  toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '0.9rem';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.3s ease-in-out';
  toast.innerText = message;
  
  container.appendChild(toast);
  
  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  
  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

const addModal = document.getElementById('add-modal')!;
const addSpeciesSearch = document.getElementById('add-species-search') as HTMLInputElement;
const addMatchStatus = document.getElementById('add-match-status') as HTMLElement;
const btnCancelAdd = document.getElementById('btn-cancel-add')!;
const btnConfirmAdd = document.getElementById('btn-confirm-add')!;

const trainerModal = document.getElementById('trainer-modal')!;
const btnEditTrainer = document.getElementById('btn-edit-trainer')!;
const btnCancelTrainer = document.getElementById('btn-cancel-trainer')!;
const btnSaveTrainer = document.getElementById('btn-save-trainer')!;

const bagModal = document.getElementById('bag-modal')!;
const btnOpenBag = document.getElementById('btn-open-bag')!;
const btnCancelBag = document.getElementById('btn-cancel-bag')!;
const btnSaveBag = document.getElementById('btn-save-bag')!;
const bagSlotsContainer = document.getElementById('bag-slots-container')!;
const bagPocketCounter = document.getElementById('bag-pocket-counter')!;
const kofiModal = document.getElementById('kofi-modal')!;
const btnKofi = document.getElementById('btn-kofi')!;
const btnCloseKofi = document.getElementById('btn-close-kofi')!;

btnKofi.addEventListener('click', () => {
  kofiModal.style.display = 'flex';
});

btnCloseKofi.addEventListener('click', () => {
  kofiModal.style.display = 'none';
});

kofiModal.addEventListener('click', (e) => {
  if (e.target === kofiModal) kofiModal.style.display = 'none';
});

let tempPocketItems: { [p: string]: BagItem[] } = {};

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#facc15'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#475569'; });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#475569';
  if (e.dataTransfer?.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) handleFile(fileInput.files[0]);
});

btnReimport.addEventListener('click', () => fileReimport.click());
fileReimport.addEventListener('change', () => {
  if (fileReimport.files?.length) {
    handleFile(fileReimport.files[0]);
    fileReimport.value = '';
  }
});

async function handleFile(file: File) {
  const buffer = await file.arrayBuffer();
  currentSave = new SoulGoldSave(buffer);
  currentBox = 0;
  inspectingSlot = null;
  slotPendingCreation = null;
  document.getElementById('mon-inspector')!.style.display = 'none';
  renderWorkspace();
}

function renderWorkspace() {
  if (!currentSave) return;
  const trainer = currentSave.getTrainerInfo();
  document.getElementById('editor-workspace')!.style.display = 'block';
  btnExport.style.display = 'inline-block';
  btnReimport.style.display = 'inline-block';
  btnGlobalApply.style.display = 'inline-block';
  dropZone.style.display = 'none';

  document.getElementById('trainer-bar')!.innerHTML = `
    <div>
      Trainer: <strong style="color: #60a5fa;">${trainer.name}</strong> 
      <span style="color: #94a3b8; font-size: 0.9rem;">(${trainer.gender})</span> &nbsp;•&nbsp; 
      Money: <strong style="color: #10b981;">$${trainer.money.toLocaleString()}</strong> &nbsp;•&nbsp; 
      Coins: <strong style="color: #facc15;">${trainer.coins.toLocaleString()}</strong>
    </div>
  `;
  renderParty();
  renderBox();
}

function renderParty() {
  if (!currentSave) return;
  const party = currentSave.getParty();
  document.getElementById('party-badge')!.textContent = `${party.length} / 6`;
  const partySlots = document.getElementById('party-slots')!;
  partySlots.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    partySlots.appendChild(createCard(party[i] || null, 'party', i));
  }
}

function renderBox() {
  if (!currentSave) return;
  document.getElementById('box-title')!.textContent = `Box ${currentBox + 1}`;
  const boxSlots = document.getElementById('box-slots')!;
  boxSlots.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    boxSlots.appendChild(createCard(currentSave.getBoxPokemon(currentBox, i), 'box', i));
  }
}

function createCard(mon: DecryptedPokemon | null, type: 'party' | 'box', index: number): HTMLElement {
  const div = document.createElement('div');
  const isInspecting = inspectingSlot?.type === type && inspectingSlot?.index === index;
  div.setAttribute('data-type', type);
  div.setAttribute('data-index', String(index));
  div.setAttribute('data-box', String(currentBox));

  if (mon) {
    div.className = 'card-slot';
    div.setAttribute('draggable', 'true');
    if (isInspecting) div.style.borderColor = '#60a5fa';
    const speciesName = getSpeciesName(mon.species);
    const displayName = mon.nickname.trim() || speciesName;
    const shiny = isMonShiny(mon);
    const { primary, fallback } = getSpriteUrl(mon.species, shiny);

    div.innerHTML = `
      <img src="${primary}" class="pixel-art" alt="${speciesName}" style="width: 44px; height: 44px; object-fit: contain; pointer-events: none;" onerror="this.src='${fallback}'" />
      <div style="flex: 1; min-width: 0; pointer-events: none;">
        <div style="font-weight: 600; color: #f1f5f9; display: flex; justify-content: space-between;">
          <span>${displayName}</span>
          <span style="font-size: 0.75rem; color: #94a3b8;">Lv.${mon.level}</span>
        </div>
        <div style="font-size: 0.72rem; color: #93c5fd;">${speciesName} ${shiny ? '✨' : ''}</div>
      </div>
    `;
    div.addEventListener('click', (e) => { e.stopPropagation(); handleSlotInteraction(type, index, mon); });
  } else {
    div.className = 'card-slot card-empty';
    div.innerHTML = `<span style="font-size: 0.75rem; color: #64748b; pointer-events: none;">+ Add</span>`;
    div.addEventListener('click', (e) => { e.stopPropagation(); handleSlotInteraction(type, index, null); });
  }

  // Drag and Drop handlers
  div.addEventListener('dragstart', (e) => {
    if (!mon) return;
    div.classList.add('dragging');
    e.dataTransfer?.setData('application/json', JSON.stringify({ type, index, box: currentBox }));
  });

  div.addEventListener('dragend', () => {
    div.classList.remove('dragging');
    document.querySelectorAll('.card-slot').forEach((c) => c.classList.remove('drag-over'));
  });

  div.addEventListener('dragover', (e) => {
    e.preventDefault();
    div.classList.add('drag-over');
  });

  div.addEventListener('dragleave', () => {
    div.classList.remove('drag-over');
  });

  div.addEventListener('drop', (e) => {
    e.preventDefault();
    div.classList.remove('drag-over');
    const dataStr = e.dataTransfer?.getData('application/json');
    if (!dataStr) return;
    try {
      const src = JSON.parse(dataStr);
      swapOrMovePokemon(src, { type, index, box: currentBox });
    } catch (err) {
      console.error(err);
    }
  });

  return div;
}

function swapOrMovePokemon(
  src: { type: 'party' | 'box'; index: number; box: number },
  dest: { type: 'party' | 'box'; index: number; box: number }
) {
  if (!currentSave) return;
  if (src.type === dest.type && src.index === dest.index && (src.type === 'party' || src.box === dest.box)) return;

  const partyList = currentSave.getParty();
  const srcIsParty = src.type === 'party';
  const destIsParty = dest.type === 'party';

  const srcMon = srcIsParty ? partyList[src.index] || null : currentSave.getBoxPokemon(src.box, src.index);
  const destMon = destIsParty ? partyList[dest.index] || null : currentSave.getBoxPokemon(dest.box, dest.index);

  if (!srcMon) return;

  if (srcIsParty && !destIsParty && partyList.length <= 1 && !destMon) {
    alert("Cannot move your last Pokémon to the storage box!");
    return;
  }

  const srcOffset = srcIsParty
    ? CONSTANTS.SB1_PARTY + src.index * CONSTANTS.MON_SIZE
    : CONSTANTS.STORAGE_BOXES_OFFSET + (src.box * CONSTANTS.BOX_CAPACITY + src.index) * CONSTANTS.BOX_MON_SIZE;

  const destOffset = destIsParty
    ? CONSTANTS.SB1_PARTY + dest.index * CONSTANTS.MON_SIZE
    : CONSTANTS.STORAGE_BOXES_OFFSET + (dest.box * CONSTANTS.BOX_CAPACITY + dest.index) * CONSTANTS.BOX_MON_SIZE;

  const srcBuffer = srcIsParty ? currentSave.sb1 : currentSave.storage;
  const destBuffer = destIsParty ? currentSave.sb1 : currentSave.storage;

  if (destMon) {
    packAndWritePokemon(destBuffer, destOffset, srcMon, destIsParty);
    packAndWritePokemon(srcBuffer, srcOffset, destMon, srcIsParty);
  } else {
    packAndWritePokemon(destBuffer, destOffset, srcMon, destIsParty);
    clearPokemonSlot(srcBuffer, srcOffset, srcIsParty);

    if (srcIsParty) {
      const remainingParty = currentSave.getParty();
      for (let i = 0; i < 6; i++) {
        const off = CONSTANTS.SB1_PARTY + i * CONSTANTS.MON_SIZE;
        if (i < remainingParty.length) {
          packAndWritePokemon(currentSave.sb1, off, remainingParty[i], true);
        } else {
          clearPokemonSlot(currentSave.sb1, off, true);
        }
      }
    }
  }

  updatePartyCount();
  if (inspectingSlot) {
    document.getElementById('mon-inspector')!.style.display = 'none';
    inspectingSlot = null;
  }
  renderParty();
  renderBox();
}

function handleSlotInteraction(type: 'party' | 'box', index: number, mon: DecryptedPokemon | null) {
  if (mon) {
    inspectingSlot = { type, index };
    inspectorBackupIvs = [...mon.ivs];
    inspectorBackupEvs = [...mon.evs];
    renderInspector(mon, type, index);
    renderParty();
    renderBox();
    return;
  }
  slotPendingCreation = { type, index };
  addSpeciesSearch.value = '';
  addMatchStatus.textContent = '';
  addModal.style.display = 'flex';
  addSpeciesSearch.focus();
}

addSpeciesSearch.addEventListener('input', () => {
  const query = addSpeciesSearch.value.trim().toLowerCase();
  if (!query) { addMatchStatus.textContent = ''; return; }
  const match = allSpecies.find((s) => s.name.toLowerCase().includes(query));
  addMatchStatus.innerHTML = match ? `Will generate: <strong style="color: #60a5fa;">${match.name}</strong>` : `<span style="color: #ef4444;">No species found</span>`;
});

addSpeciesSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAddPokemon(); } });
btnConfirmAdd.addEventListener('click', submitAddPokemon);
btnCancelAdd.addEventListener('click', () => { addModal.style.display = 'none'; slotPendingCreation = null; });

function submitAddPokemon() {
  const query = addSpeciesSearch.value.trim().toLowerCase();
  const match = allSpecies.find((s) => s.name.toLowerCase() === query) || allSpecies.find((s) => s.name.toLowerCase().includes(query));
  if (match && slotPendingCreation) {
    const trainer = currentSave!.getTrainerInfo();
    const newMon = createDefaultPokemon(match.id, trainer);
    const isParty = slotPendingCreation.type === 'party';
    const targetBuffer = isParty ? currentSave!.sb1 : currentSave!.storage;
    const targetOffset = isParty ? CONSTANTS.SB1_PARTY + slotPendingCreation.index * CONSTANTS.MON_SIZE : CONSTANTS.STORAGE_BOXES_OFFSET + (currentBox * CONSTANTS.BOX_CAPACITY + slotPendingCreation.index) * CONSTANTS.BOX_MON_SIZE;
    packAndWritePokemon(targetBuffer, targetOffset, newMon, isParty);
    if (isParty) updatePartyCount();
    addModal.style.display = 'none';
    slotPendingCreation = null;
    renderParty();
    renderBox();
  }
}

btnEditTrainer.addEventListener('click', () => {
  if (!currentSave) return;
  const tr = currentSave.getTrainerInfo();
  (document.getElementById('tr-name') as HTMLInputElement).value = tr.name;
  (document.getElementById('tr-gender') as HTMLSelectElement).value = String(tr.genderCode);
  (document.getElementById('tr-money') as HTMLInputElement).value = String(tr.money);
  (document.getElementById('tr-coins') as HTMLInputElement).value = String(tr.coins);
  trainerModal.style.display = 'flex';
});

btnCancelTrainer.addEventListener('click', () => { trainerModal.style.display = 'none'; });

function commitTrainerChanges() {
  if (!currentSave) return;
  const tr = currentSave.getTrainerInfo();
  const nameInp = document.getElementById('tr-name') as HTMLInputElement;
  const genderInp = document.getElementById('tr-gender') as HTMLSelectElement;
  const moneyInp = document.getElementById('tr-money') as HTMLInputElement;
  const coinsInp = document.getElementById('tr-coins') as HTMLInputElement;
  if (nameInp && moneyInp && coinsInp && genderInp) {
    currentSave.setTrainerInfo({
      name: nameInp.value,
      gender: parseInt(genderInp.value, 10) || 0,
      tid: tr.tid,
      sid: tr.sid,
      money: parseInt(moneyInp.value, 10) || 0,
      coins: parseInt(coinsInp.value, 10) || 0,
    });
  }
}

btnSaveTrainer.addEventListener('click', () => {
  commitTrainerChanges();
  trainerModal.style.display = 'none';
  renderWorkspace();
});

btnOpenBag.addEventListener('click', () => {
  if (!currentSave) return;
  (Object.keys(CONSTANTS.BAG_POCKETS) as PocketType[]).forEach((p) => {
    tempPocketItems[p] = currentSave!.getPocketItems(p);
  });
  activeBagPocket = 'Items';
  updateBagModalView();
  bagModal.style.display = 'flex';
});

btnCancelBag.addEventListener('click', () => { bagModal.style.display = 'none'; });

function commitBagChanges() {
  if (!currentSave) return;
  (Object.keys(CONSTANTS.BAG_POCKETS) as PocketType[]).forEach((p) => {
    currentSave!.setPocketItems(p, tempPocketItems[p] || []);
  });
}

btnSaveBag.addEventListener('click', () => {
  commitBagChanges();
  bagModal.style.display = 'none';
});

document.querySelectorAll('.bag-tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pocket = target.getAttribute('data-pocket') as PocketType;
    if (pocket) {
      activeBagPocket = pocket;
      document.querySelectorAll('.bag-tab').forEach((t) => {
        (t as HTMLElement).style.background = '#334155';
        (t as HTMLElement).style.color = '#94a3b8';
      });
      target.style.background = '#0284c7';
      target.style.color = 'white';
      updateBagModalView();
    }
  });
});

function addItemToActivePocket(itemId: number, quantity: number = 1) {
  const currentList = tempPocketItems[activeBagPocket] || [];
  const cap = CONSTANTS.BAG_POCKETS[activeBagPocket].count;

  if (itemExistsAnywhereInBag(itemId, activeBagPocket, -1)) {
    const existing = currentList.find((it) => it.id === itemId);
    if (existing) {
      existing.quantity = Math.min(999, existing.quantity + quantity);
    } else {
      alert(`"${getItemName(itemId)}" is already present in another pocket of your bag!`);
      return;
    }
    updateBagModalView();
    return;
  }

  if (currentList.length >= cap) {
    alert(`Pocket reached max capacity (${cap} slots).`);
    return;
  }

  currentList.push({ id: itemId, quantity: Math.min(999, Math.max(1, quantity)) });
  tempPocketItems[activeBagPocket] = currentList;
  updateBagModalView();
}

function updateBagModalView() {
  const items = tempPocketItems[activeBagPocket] || [];
  const cap = CONSTANTS.BAG_POCKETS[activeBagPocket].count;
  bagPocketCounter.textContent = `${items.length} / ${cap} slots`;

  const pocketItemsList = getItemsForPocket(activeBagPocket);
  const inBagItemIds = new Set(items.map((s) => s.id));

  let htmlContent = `
    <!-- Section 1: In Bag -->
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <h4 style="margin: 0; color: #60a5fa; font-size: 0.95rem;">📦 Items Currently In Bag (${items.length})</h4>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${activeBagPocket === 'PokeBalls' ? '<button id="btn-add-999-masterballs" style="background: #7c3aed; color: white; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.75rem;">🔮 Add 999 Master Balls</button>' : ''}
          ${activeBagPocket === 'Medicine' ? '<button id="btn-add-999-rarecandies" style="background: #ec4899; color: white; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.75rem;">🍬 Add 999 Rare Candies</button>' : ''}
          <span style="font-size: 0.75rem; color: #94a3b8;">Max capacity: ${cap}</span>
        </div>
      </div>
  `;

  if (items.length === 0) {
    htmlContent += `
      <div style="text-align: center; color: #64748b; padding: 20px; font-size: 0.85rem;">
        Your ${activeBagPocket} pocket is currently empty. Use the section below to search and add items.
      </div>
    `;
  } else {
    htmlContent += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
    htmlContent += items.map((slot, idx) => {
      const isUnique = activeBagPocket === 'KeyItems' || activeBagPocket === 'MegaStones';
      const itemName = getItemName(slot.id);
      const spriteUrl = getItemSpriteUrl(slot.id, itemName);

      return `
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 0.72rem; color: #64748b; font-weight: 600; width: 20px;">#${idx + 1}</span>
          <div style="width: 28px; height: 28px; background: #0f172a; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid #334155;">
            <img src="${spriteUrl}" style="width: 20px; height: 20px; object-fit: contain;" alt="${itemName}" onerror="this.style.opacity='0'" />
          </div>
          <span style="flex: 2; font-weight: 600; color: #f1f5f9; font-size: 0.85rem;">${itemName}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.72rem; color: #94a3b8; font-weight: 500;">Qty (max 999)</span>
            <input type="number" class="bag-qty-input" data-idx="${idx}" min="1" max="999" value="${isUnique ? 1 : slot.quantity}" ${isUnique ? 'disabled readonly style="width: 50px; background: #0f172a; border: 1px solid #334155; color: #facc15; padding: 4px; border-radius: 4px; text-align: center; font-size: 0.8rem;"' : 'style="width: 70px; background: #0f172a; border: 1px solid #475569; color: white; padding: 4px; border-radius: 4px; text-align: center; font-size: 0.8rem;"'} />
          </div>
          <button class="btn-clear-bag-slot" data-idx="${idx}" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.75rem;" title="Remove from bag">🗑 Remove</button>
        </div>
      `;
    }).join('');
    htmlContent += `</div>`;
  }
  htmlContent += `</div>`;

  // Section 2: Search as you type Available Items
  if (items.length < cap) {
    htmlContent += `
      <div style="background: #0f172a; border: 1px dashed #334155; border-radius: 8px; padding: 14px; margin-top: 10px;">
        <h4 style="margin: 0 0 8px 0; color: #facc15; font-size: 0.9rem;">🔍 Add Available Item to ${activeBagPocket} (Search As You Type)</h4>
        <input type="text" id="bag-search-input" placeholder="Type to search item... (e.g. Master Ball, Potion)" autocomplete="off" style="width: 100%; background: #1e293b; border: 1px solid #475569; color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; box-sizing: border-box;" />
        <div id="bag-search-results" style="margin-top: 8px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;"></div>
      </div>
    `;
  }

  bagSlotsContainer.innerHTML = htmlContent;

  // Add 999 Master Balls button handler
  document.getElementById('btn-add-999-masterballs')?.addEventListener('click', () => {
    addItemToActivePocket(4, 999);
  });

  // Add 999 Rare Candies button handler
  document.getElementById('btn-add-999-rarecandies')?.addEventListener('click', () => {
    addItemToActivePocket(102, 999);
  });

  // Live Search As You Type Handler
  const searchInput = document.getElementById('bag-search-input') as HTMLInputElement;
  const searchResultsBox = document.getElementById('bag-search-results') as HTMLElement;

  const renderSearchResults = (query: string) => {
    if (!searchResultsBox) return;
    const q = query.trim().toLowerCase();
    const availableItemsList = pocketItemsList.filter((it) => !inBagItemIds.has(it.id));
    const matches = q
      ? availableItemsList.filter((it) => it.name.toLowerCase().includes(q))
      : availableItemsList.slice(0, 15);

    if (matches.length === 0) {
      searchResultsBox.innerHTML = `<div style="font-size: 0.8rem; color: #94a3b8; padding: 6px;">No matching available items found</div>`;
      return;
    }

    searchResultsBox.innerHTML = matches.map((it) => `
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${getItemSpriteUrl(it.id, it.name)}" style="width: 22px; height: 22px; object-fit: contain;" alt="${it.name}" onerror="this.style.opacity='0'" />
          <span style="font-size: 0.85rem; color: #f1f5f9; font-weight: 500;">${it.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" id="qty-add-${it.id}" min="1" max="999" value="1" style="width: 55px; background: #0f172a; border: 1px solid #475569; color: white; padding: 4px; border-radius: 4px; font-size: 0.8rem; text-align: center;" />
          <button class="btn-quick-add-item" data-id="${it.id}" style="background: #0284c7; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.78rem;">+ Add</button>
        </div>
      </div>
    `).join('');

    searchResultsBox.querySelectorAll('.btn-quick-add-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.target as HTMLElement).getAttribute('data-id') || '0', 10);
        const qtyInp = document.getElementById(`qty-add-${id}`) as HTMLInputElement;
        const qty = qtyInp ? Math.min(999, Math.max(1, parseInt(qtyInp.value, 10) || 1)) : 1;
        if (id > 0) addItemToActivePocket(id, qty);
      });
    });
  };

  if (searchInput) {
    renderSearchResults('');
    searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
  }

  bagSlotsContainer.querySelectorAll('.bag-qty-input').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLElement).getAttribute('data-idx') || '0', 10);
      let qty = parseInt((e.target as HTMLInputElement).value, 10) || 1;
      if (qty > 999) {
        qty = 999;
        (e.target as HTMLInputElement).value = '999';
      }
      tempPocketItems[activeBagPocket][idx].quantity = Math.max(1, qty);
    });
  });

  bagSlotsContainer.querySelectorAll('.btn-clear-bag-slot').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).getAttribute('data-idx') || '0', 10);
      tempPocketItems[activeBagPocket].splice(idx, 1);
      updateBagModalView();
    });
  });
}

function updatePartyCount() {
  if (!currentSave) return;
  let count = 0;
  for (let i = 0; i < 6; i++) {
    const off = CONSTANTS.SB1_PARTY + i * CONSTANTS.MON_SIZE;
    const view = new DataView(currentSave.sb1.buffer, currentSave.sb1.byteOffset + off);
    if (view.getUint32(0, true) !== 0 || view.getUint32(4, true) !== 0) count++;
  }
  const sb1View = new DataView(currentSave.sb1.buffer, currentSave.sb1.byteOffset);
  sb1View.setUint32(CONSTANTS.SB1_PARTY_COUNT, count, true);
}

function buildMoveSelectOptions(speciesId: number, currentMoveId: number): string {
  const learnset = getSpeciesLearnset(speciesId);
  const learnsetSet = new Set(learnset.map((m) => m.toLowerCase().trim()));
  const learnsetMoves = allMoves.filter((m) => m.id > 0 && learnsetSet.has(m.name.toLowerCase().trim()));
  const otherMoves = allMoves.filter((m) => m.id === 0 || !learnsetSet.has(m.name.toLowerCase().trim()));

  let html = `<option value="0" ${currentMoveId === 0 ? 'selected' : ''}>(None)</option>`;
  if (learnsetMoves.length > 0) {
    html += `<optgroup label="★ Compatible / Learnset Moves" style="background-color: #1e293b; color: #34d399; font-weight: bold;">`;
    learnsetMoves.forEach((m) => {
      html += `<option value="${m.id}" class="learnable-move-option" ${m.id === currentMoveId ? 'selected' : ''} style="background-color: #064e3b; color: #a7f3d0; font-weight: 600;">★ ${m.name}</option>`;
    });
    html += `</optgroup>`;
  }
  html += `<optgroup label="All Other Moves" style="background-color: #1e293b; color: #94a3b8;">`;
  otherMoves.forEach((m) => { if (m.id > 0) html += `<option value="${m.id}" ${m.id === currentMoveId ? 'selected' : ''} style="background-color: #0f172a; color: #f8fafc;">${m.name}</option>`; });
  html += `</optgroup>`;
  return html;
}

function commitInspectorChanges() {
  if (!currentSave || !inspectingSlot) return;
  const type = inspectingSlot.type;
  const index = inspectingSlot.index;
  const isParty = type === 'party';
  const mon = isParty ? currentSave.getParty()[index] : currentSave.getBoxPokemon(currentBox, index);
  if (!mon) return;

  const pokeballEl = document.getElementById('edit-pokeball') as HTMLSelectElement;
  const heldItemEl = document.getElementById('edit-held-item') as HTMLSelectElement;
  const levelEl = document.getElementById('edit-level') as HTMLInputElement;
  const abilityEl = document.getElementById('edit-ability') as HTMLSelectElement;
  const teraEl = document.getElementById('edit-tera') as HTMLSelectElement;
  const natureEl = document.getElementById('edit-nature') as HTMLSelectElement;

  if (pokeballEl) mon.pokeball = parseInt(pokeballEl.value, 10);
  if (heldItemEl) mon.heldItem = parseInt(heldItemEl.value, 10) || 0;
  if (levelEl) mon.level = parseInt(levelEl.value, 10);
  if (abilityEl) mon.abilityNum = parseInt(abilityEl.value, 10) || 0;
  if (teraEl) mon.teraType = parseInt(teraEl.value, 10) || 1;
  if (natureEl) {
    const natId = parseInt(natureEl.value, 10) || 0;
    mon.personality = setPersonalityNature(mon.personality, natId);
  }

  for (let i = 0; i < 4; i++) {
    const moveSel = document.getElementById(`edit-move-${i}`) as HTMLSelectElement;
    const ppInp = document.getElementById(`edit-pp-${i}`) as HTMLInputElement;
    const ppBonusSel = document.getElementById(`edit-ppbonus-${i}`) as HTMLSelectElement;
    if (moveSel) mon.moves[i] = parseInt(moveSel.value, 10) || 0;
    if (ppInp) mon.pps[i] = parseInt(ppInp.value, 10) || getMoveBasePp(mon.moves[i]);
    if (ppBonusSel) mon.ppBonuses[i] = parseInt(ppBonusSel.value, 10) || 0;
  }

  for (let i = 0; i < 6; i++) {
    const ivInp = document.getElementById(`edit-iv-${i}`) as HTMLInputElement;
    const evInp = document.getElementById(`edit-ev-${i}`) as HTMLInputElement;
    if (ivInp) mon.ivs[i] = parseInt(ivInp.value, 10) || 0;
    if (evInp) mon.evs[i] = parseInt(evInp.value, 10) || 0;
  }

  const targetBuffer = isParty ? currentSave.sb1 : currentSave.storage;
  const targetOffset = isParty
    ? CONSTANTS.SB1_PARTY + index * CONSTANTS.MON_SIZE
    : CONSTANTS.STORAGE_BOXES_OFFSET + (currentBox * CONSTANTS.BOX_CAPACITY + index) * CONSTANTS.BOX_MON_SIZE;
  packAndWritePokemon(targetBuffer, targetOffset, mon, isParty);
}

function renderInspector(mon: DecryptedPokemon, type: 'party' | 'box', index: number) {
  const inspector = document.getElementById('mon-inspector')!;
  inspector.style.display = 'block';

  const speciesName = getSpeciesName(mon.species);
  const shiny = isMonShiny(mon);
  const { primary, fallback } = getSpriteUrl(mon.species, shiny);
  const currentBallId = mon.pokeball || 1;
  const abilities = getSpeciesAbilities(mon.species);

  inspector.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="width: 140px; height: 140px; background: #0f172a; border-radius: 12px; border: 1px solid #334155; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
          <img id="hero-sprite" src="${primary}" class="pixel-art" style="width: 120px; height: 120px; object-fit: contain;" alt="${speciesName}" onerror="this.src='${fallback}'" />
          <span id="inspector-shiny-badge" style="position: absolute; top: 6px; right: 6px; font-size: 1.2rem; cursor: pointer; background: rgba(15,23,42,0.8); padding: 2px 6px; border-radius: 6px;" title="Toggle Shiny">${shiny ? '✨' : '☆'}</span>
        </div>
        <div>
          <h2 style="margin: 0; font-size: 1.5rem; color: #60a5fa;">${mon.nickname || speciesName}</h2>
          <span style="font-size: 0.85rem; color: #94a3b8; display: block; margin-top: 4px;">${speciesName} (Level ${mon.level})</span>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="btn-delete-mon" style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">🗑 Release</button>
        <button id="btn-close-insp" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.4rem;">✕</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 24px;">
      <!-- Column 1: Core Details -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="position: relative;">
          <label style="font-size: 0.8rem; color: #94a3b8;">Search Species</label>
          <input type="text" id="insp-species" value="${speciesName}" autocomplete="off" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px; box-sizing: border-box;" />
          <div id="insp-suggestions" style="display: none; position: absolute; left: 0; right: 0; top: 100%; background: #1e293b; border: 1px solid #475569; max-height: 160px; overflow-y: auto; z-index: 50;"></div>
        </div>

        <div>
          <label style="font-size: 0.8rem; color: #94a3b8;">Ability</label>
          <select id="edit-ability" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
            ${abilities.map((ab) => `<option value="${ab.slot}" ${!ab.available ? 'disabled style="color: #64748b;"' : ''} ${mon.abilityNum === ab.slot ? 'selected' : ''}>${ab.name}${!ab.available ? '(None)' : ''}</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="font-size: 0.8rem; color: #94a3b8;">Nature</label>
          <select id="edit-nature" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
            ${NATURES_LIST.map((n) => `<option value="${n.id}" ${(mon.personality % 25) === n.id ? 'selected' : ''}>${n.name}${n.mod}</option>`).join('')}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8;">Tera Type</label>
            <select id="edit-tera" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
              ${TERA_TYPES_GEN9.map((t) => `<option value="${t.id}" ${(mon.teraType || 1) === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8;">Level</label>
            <input type="number" id="edit-level" value="${mon.level}" min="1" max="100" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8;">Poké Ball</label>
            <select id="edit-pokeball" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
              ${POKEBALLS_LIST.map((b) => `<option value="${b.id}" ${currentBallId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8;">Held Item</label>
            <select id="edit-held-item" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 6px; border-radius: 4px;">
              <option value="0" ${(mon.heldItem || 0) === 0 ? 'selected' : ''}>(None)</option>
              ${alphabeticalItems.map((it) => `<option value="${it.id}" ${it.id === mon.heldItem ? 'selected' : ''}>${it.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Column 2: Moves & PP Up -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <h4 style="margin: 0; color: #facc15;">Moves & PP Up</h4>
        ${[0, 1, 2, 3].map((i) => {
          const curMove = mon.moves[i];
          const curPp = mon.pps[i];
          const ppBonus = mon.ppBonuses?.[i] || 0;
          return `
            <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155;">
              <select id="edit-move-${i}" style="width: 100%; background: #1e293b; border: 1px solid #475569; color: white; padding: 5px; border-radius: 4px; font-size: 0.8rem; margin-bottom: 4px;">
                ${buildMoveSelectOptions(mon.species, curMove)}
              </select>
              <div style="display: flex; gap: 8px; align-items: center;">
                <div style="flex: 1;">
                  <span style="font-size: 0.7rem; color: #94a3b8;">PP</span>
                  <input type="number" id="edit-pp-${i}" value="${curPp}" min="0" max="99" style="width: 100%; background: #1e293b; border: 1px solid #475569; color: white; padding: 2px; font-size: 0.75rem;" />
                </div>
                <div style="flex: 1;">
                  <span style="font-size: 0.7rem; color: #94a3b8;">PP Up (+0-3)</span>
                  <select id="edit-ppbonus-${i}" style="width: 100%; background: #1e293b; border: 1px solid #475569; color: white; padding: 2px; font-size: 0.75rem;">
                    <option value="0" ${ppBonus === 0 ? 'selected' : ''}>+0</option>
                    <option value="1" ${ppBonus === 1 ? 'selected' : ''}>+1</option>
                    <option value="2" ${ppBonus === 2 ? 'selected' : ''}>+2</option>
                    <option value="3" ${ppBonus === 3 ? 'selected' : ''}>+3</option>
                  </select>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Column 3: Stats, IVs, EVs, Quick Actions -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="margin: 0; color: #facc15;">IVs & EVs</h4>
          <div style="display: flex; gap: 6px;">
            <button id="btn-max-ivs" style="background: #3b82f6; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">⭐ Max IVs</button>
            <button id="btn-undo-ivs" style="background: #475569; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">↩ Undo</button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          ${['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'].map((stat, idx) => `
            <div>
              <label style="font-size: 0.65rem; color: #94a3b8;">${stat} (IV / EV)</label>
              <input type="number" id="edit-iv-${idx}" value="${mon.ivs[idx]}" min="0" max="31" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 3px; font-size: 0.75rem; box-sizing: border-box;" title="IV" />
              <input type="number" id="edit-ev-${idx}" value="${mon.evs[idx]}" min="0" max="252" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: #38bdf8; padding: 3px; font-size: 0.75rem; box-sizing: border-box; margin-top: 2px;" title="EV" />
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
      <button id="btn-save-mon" style="background: #10b981; color: white; border: none; padding: 8px 24px; border-radius: 6px; cursor: pointer; font-weight: 600;">Apply Changes</button>
    </div>
  `;

  const heroSpriteEl = document.getElementById('hero-sprite') as HTMLImageElement;
  const inspSpecies = document.getElementById('insp-species') as HTMLInputElement;
  const suggestionsBox = document.getElementById('insp-suggestions') as HTMLElement;
  const shinyBadge = document.getElementById('inspector-shiny-badge') as HTMLElement;

  const refreshSprite = () => {
    const isShiny = isMonShiny(mon);
    const { primary, fallback } = getSpriteUrl(mon.species, isShiny);
    heroSpriteEl.src = primary;
    heroSpriteEl.onerror = () => { heroSpriteEl.src = fallback; };
    shinyBadge.textContent = isShiny ? '✨' : '☆';
  };

  shinyBadge.addEventListener('click', () => {
    if (isMonShiny(mon)) {
      mon.personality = makePersonalityNonShiny(mon.personality, mon.otId);
      mon.shinyModifier = 0;
    } else {
      mon.personality = makePersonalityShiny(mon.personality, mon.otId);
    }
    refreshSprite();
    renderParty();
    renderBox();
  });

  for (let i = 0; i < 4; i++) {
    const moveSel = document.getElementById(`edit-move-${i}`) as HTMLSelectElement;
    const ppBonusSel = document.getElementById(`edit-ppbonus-${i}`) as HTMLSelectElement;
    const ppInp = document.getElementById(`edit-pp-${i}`) as HTMLInputElement;

    const updatePpCalculated = () => {
      const mId = parseInt(moveSel.value, 10) || 0;
      const bonus = parseInt(ppBonusSel.value, 10) || 0;
      const basePp = getMoveBasePp(mId);
      const maxPp = Math.floor(basePp * (1 + 0.2 * bonus));
      if (ppInp) ppInp.value = String(maxPp);
      mon.pps[i] = maxPp;
      mon.ppBonuses[i] = bonus;
    };

    moveSel?.addEventListener('change', updatePpCalculated);
    ppBonusSel?.addEventListener('change', updatePpCalculated);
  }

  inspSpecies.addEventListener('input', () => {
    const q = inspSpecies.value.trim().toLowerCase();
    if (!q) { suggestionsBox.style.display = 'none'; return; }
    const filtered = allSpecies.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
    if (!filtered.length) { suggestionsBox.style.display = 'none'; return; }
    suggestionsBox.innerHTML = filtered.map((s) => `<div class="species-opt" data-id="${s.id}" style="padding: 6px 10px; cursor: pointer; border-bottom: 1px solid #334155;">${s.name}</div>`).join('');
    suggestionsBox.style.display = 'block';

    suggestionsBox.querySelectorAll('.species-opt').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-id') || '0', 10);
        if (id) {
          mon.species = id;
          inspSpecies.value = getSpeciesName(id);
          suggestionsBox.style.display = 'none';
          refreshSprite();
          for (let i = 0; i < 4; i++) {
            const mSel = document.getElementById(`edit-move-${i}`) as HTMLSelectElement;
            if (mSel) mSel.innerHTML = buildMoveSelectOptions(id, 0);
          }
        }
      });
    });
  });

  document.getElementById('btn-max-ivs')?.addEventListener('click', () => {
    for (let i = 0; i < 6; i++) {
      const ivInp = document.getElementById(`edit-iv-${i}`) as HTMLInputElement;
      if (ivInp) ivInp.value = '31';
    }
  });

  document.getElementById('btn-undo-ivs')?.addEventListener('click', () => {
    for (let i = 0; i < 6; i++) {
      const ivInp = document.getElementById(`edit-iv-${i}`) as HTMLInputElement;
      const evInp = document.getElementById(`edit-ev-${i}`) as HTMLInputElement;
      if (ivInp) ivInp.value = String(inspectorBackupIvs[i]);
      if (evInp) evInp.value = String(inspectorBackupEvs[i]);
    }
  });

  document.getElementById('btn-close-insp')?.addEventListener('click', () => {
    inspector.style.display = 'none';
    inspectingSlot = null;
    renderParty();
    renderBox();
  });

  document.getElementById('btn-delete-mon')?.addEventListener('click', () => {
    if (!currentSave) return;
    const isParty = type === 'party';
    if (isParty && currentSave.getParty().length <= 1) {
      alert("Cannot release your last Pokémon!");
      return;
    }
    if (!confirm(`Are you sure you want to release ${mon.nickname || speciesName}?`)) return;

    const targetBuffer = isParty ? currentSave.sb1 : currentSave.storage;
    const targetOffset = isParty ? CONSTANTS.SB1_PARTY + index * CONSTANTS.MON_SIZE : CONSTANTS.STORAGE_BOXES_OFFSET + (currentBox * CONSTANTS.BOX_CAPACITY + index) * CONSTANTS.BOX_MON_SIZE;
    clearPokemonSlot(targetBuffer, targetOffset, isParty);

    if (isParty) {
      for (let i = index; i < 5; i++) {
        const currOff = CONSTANTS.SB1_PARTY + i * CONSTANTS.MON_SIZE;
        const nextOff = CONSTANTS.SB1_PARTY + (i + 1) * CONSTANTS.MON_SIZE;
        currentSave.sb1.set(currentSave.sb1.subarray(nextOff, nextOff + CONSTANTS.MON_SIZE), currOff);
      }
      clearPokemonSlot(currentSave.sb1, CONSTANTS.SB1_PARTY + 5 * CONSTANTS.MON_SIZE, true);
      updatePartyCount();
    }

    inspector.style.display = 'none';
    inspectingSlot = null;
    renderParty();
    renderBox();
  });

  document.getElementById('btn-save-mon')?.addEventListener('click', () => {
    commitInspectorChanges();
    renderParty();
    renderBox();
    const updatedMon = type === 'party' ? currentSave!.getParty()[index] : currentSave!.getBoxPokemon(currentBox, index);
    if (updatedMon) {
      renderInspector(updatedMon, type, index);
    }
    showToast("Changes applied");
  });
}

btnPrevBox.addEventListener('click', () => { if (currentBox > 0) { currentBox--; renderBox(); } });
btnNextBox.addEventListener('click', () => { if (currentBox < 13) { currentBox++; renderBox(); } });

function commitActiveModals() {
  if (document.getElementById('mon-inspector')?.style.display !== 'none' && inspectingSlot) {
    commitInspectorChanges();
  }
  if (trainerModal.style.display !== 'none') {
    commitTrainerChanges();
  }
  if (bagModal.style.display !== 'none') {
    commitBagChanges();
  }
}

btnGlobalApply.addEventListener('click', () => {
  if (!currentSave) return;
  commitActiveModals();
  renderParty();
  renderBox();
  
  if (document.getElementById('mon-inspector')?.style.display !== 'none' && inspectingSlot) {
    const { type, index } = inspectingSlot;
    const updatedMon = type === 'party' ? currentSave.getParty()[index] : currentSave.getBoxPokemon(currentBox, index);
    if (updatedMon) {
      renderInspector(updatedMon, type, index);
    }
  }
  
  showToast("Changes applied");
});

btnExport.addEventListener('click', async () => {
  if (!currentSave) return;
  commitActiveModals();
  const updatedBuffer = exportUpdatedSave(currentSave.buffer, currentSave.activeSlot, currentSave.sb1, currentSave.sb2, currentSave.storage);

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'Pokemon_SoulGold_edited.sav',
        types: [
          {
            description: 'Pokémon Save File (*.sav)',
            accept: { 'application/octet-stream': ['.sav'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(updatedBuffer.buffer as ArrayBuffer);
      await writable.close();
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, falling back to download:', err);
    }
  }

  const blob = new Blob([updatedBuffer.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Pokemon_SoulGold_edited.sav';
  a.click();
  URL.revokeObjectURL(url);
});