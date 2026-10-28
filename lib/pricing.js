// USD per 1M tokens [input, output], from the Token Factory catalog on 28 Oct 2026.
// shortcut: hand-copied prices; re-check the catalog before quoting costs in the video.
const PRICES = {
  'nvidia/Nemotron-3-Nano-Omni': [0.06, 0.24],
  'nvidia/Nemotron-Nano-V2-12b': [0.06, 0.24],
  'nvidia/Nemotron-3_5-Lightning': [0.06, 0.24],
  'nvidia/Nemotron-3.5-Lightning': [0.06, 0.24],
  'nvidia/Nemotron-3.5-Super-VL': [0.3, 0.9],
  'nvidia/Nemotron-3-Ultra-550b-a55b': [1, 3],
  'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1': [0.6, 1.8],
};

export function cost(model, usage) {
  const [i, o] = PRICES[model] || PRICES[model?.replace(/-fast$/, '')] || [0, 0];
  return ((usage?.prompt_tokens || 0) * i + (usage?.completion_tokens || 0) * o) / 1e6;
}
