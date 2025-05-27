const Filter = require('bad-words');

// You can optionally add custom words or remove ones you allow
const filter = new Filter();
// filter.addWords('niggaz', 'bitches'); // optional
// filter.removeWords('hell', 'damn');   // optional

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

function filterPayload(payload) {
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

module.exports = { filterPayload };
