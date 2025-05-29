import { Filter } from 'bad-words';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load custom bad words
const customWordsPath = path.join(__dirname, 'customBadWords.json');
let customWords = [];
try {
  customWords = JSON.parse(fs.readFileSync(customWordsPath, 'utf8'));
} catch (err) {
  console.warn('Failed to load custom bad word list:', err);
}

// Load custom whitelist
const customWhitelistPath = path.join(__dirname, 'customWhitelist.json');
let customWhitelist = [];
try {
  customWhitelist = JSON.parse(fs.readFileSync(customWhitelistPath, 'utf8'));
} catch (err) {
  console.warn('Failed to load custom whitelist:', err);
}

// Initialize filter, add custom words, remove whitelisted words
const filter = new Filter();
if (Array.isArray(customWords)) {
  filter.addWords(...customWords);
}
if (Array.isArray(customWhitelist)) {
  filter.removeWords(...customWhitelist);
}

function censor(text) {
  if (!text || typeof text !== 'string') return text;
  return filter.clean(text);
}

function filterBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    try {
      if (block.type === 'section' && block.text?.text) {
        return {
          ...block,
          text: { ...block.text, text: censor(block.text.text) },
        };
      }
      if (block.type === 'context' && Array.isArray(block.elements)) {
        return {
          ...block,
          elements: block.elements.map((el) =>
            el.type === 'mrkdwn' && typeof el.text === 'string'
              ? { ...el, text: censor(el.text) }
              : el
          ),
        };
      }
      return block;
    } catch (err) {
      console.warn('[WARN] Failed to filter block:', block, err);
      return block;
    }
  });
}

export function filterPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const result = { ...payload };
  if (typeof result.text === 'string') {
    result.text = censor(result.text);
  }
  if (Array.isArray(result.blocks)) {
    result.blocks = filterBlocks(result.blocks);
  }
  return result;
}
