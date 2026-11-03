// Add a meaningful `description` to every operation that lacks one.
//
// Operations in this repo declare `summary` + `operationId` but no `description`.
// The contract-first spec (and the Spectral lint) requires a description, so this
// script inserts one after each `summary:` line, derived from the operationId.
//
// Idempotent: skips operations that already have a description.
// Usage: node scripts/add-descriptions.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, '..', 'contracts', 'backend.yaml');
let lines = readFileSync(file, 'utf8').split('\n');

const descriptions = {
  health: 'Check backend health and readiness.',
  login: 'Authenticate a user with email and password, returning access and refresh tokens.',
  refresh: 'Exchange a valid refresh token for a new access token.',
  logout: 'Invalidate the current refresh token and sign the user out.',
  getCards: 'List cards, with optional filtering, pagination, and sorting.',
  createCard: 'Create a new card in a game.',
  getCardById: 'Retrieve a single card by id.',
  updateCard: 'Update a card owned by the authenticated user.',
  searchCards: 'Search cards by name or code within a game.',
  getProtectedCards: 'List cards including protected fields for authorized callers.',
  getProtectedCardById: 'Retrieve a single card including protected fields for authorized callers.',
  updateProtectedCard: 'Update a protected card owned by the authenticated user.',
  getGames: 'List games.',
  createGame: 'Create a new game.',
  getGameById: 'Retrieve a single game by id.',
  updateGame: 'Update a game.',
  deleteGame: 'Delete a game and its associated cards.',
  searchGames: 'Search games by name.',
  getLanguages: 'List languages.',
  createLanguage: 'Create a new language.',
  getLanguageById: 'Retrieve a single language by id.',
  updateLanguage: 'Update a language.',
  deleteLanguage: 'Delete a language.',
  searchLanguages: 'Search languages by name or code.',
  getPacks: 'List packs, with optional filtering, pagination, and sorting.',
  createPack: 'Create a new pack.',
  getPackById: 'Retrieve a single pack by id.',
  updatePack: 'Update a pack.',
  deletePack: 'Delete a pack.',
  searchPacks: 'Search packs by name.',
  getRarities: 'List rarities, with optional filtering, pagination, and sorting.',
  createRarity: 'Create a new rarity.',
  getRarityById: 'Retrieve a single rarity by id.',
  updateRarity: 'Update a rarity.',
  deleteRarity: 'Delete a rarity.',
  searchRarities: 'Search rarities by name.',
  getStorages: 'List the authenticated user\'s storages.',
  createStorage: 'Create a new storage for the authenticated user.',
  getStorageById: 'Retrieve a single storage by id.',
  updateStorage: 'Update a storage owned by the authenticated user.',
  deleteStorage: 'Delete a storage owned by the authenticated user.',
  searchStorages: 'Search the user\'s storages by name.',
  getUsers: 'List users, with optional filtering, pagination, and sorting.',
  createUser: 'Create a new user.',
  getUserById: 'Retrieve a single user by id.',
  updateUser: 'Update a user.',
  scanMedia: 'Upload an image and return card matches with confidence scores.',
  uploadMedia: 'Upload a media file and return its metadata.',
  getMediaById: 'Retrieve a single media file by id.',
  updateMedia: 'Update a media file owned by the authenticated user.',
  deleteMedia: 'Delete a media file owned by the authenticated user.',
};

function quote(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

let added = 0;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)summary:\s*(.*)$/);
  if (!m) continue;
  const indent = m[1];
  // operationId is on the next line for these operations.
  const next = lines[i + 1] || '';
  const op = next.match(/operationId:\s*(\w+)/);
  const id = op ? op[1] : '';
  const desc = descriptions[id] || `Operation: ${id || 'unknown'}.`;
  // Skip if a description already exists on the following lines.
  if ((lines[i + 1] || '').trim().startsWith('description:')) continue;
  lines.splice(i + 1, 0, `${indent}description: ${quote(desc)}`);
  added++;
}

writeFileSync(file, lines.join('\n'));
console.log(`Added ${added} operation descriptions.`);
