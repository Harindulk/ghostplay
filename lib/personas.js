// Who plays, and which Nemotron model plays them. Model size and reasoning budget are the
// skill dial: a small model that skims plays like a casual player, Super with a thinking
// budget plays like an expert. Each role lists models in order of preference; the server
// picks the first one Token Factory actually serves today (see resolveModels in nebius.js).
export const ROLES = {
  casual: ['nvidia/Nemotron-3-Nano-Omni', 'nvidia/Nemotron-Nano-V2-12b', 'nvidia/Nemotron-3_5-Lightning'],
  core: ['nvidia/Nemotron-3_5-Lightning', 'nvidia/Nemotron-3.5-Lightning'],
  expert: ['nvidia/Nemotron-3.5-Super-VL'],
  critic: ['nvidia/Nemotron-3-Ultra-550b-a55b', 'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1'],
  vision: ['nvidia/Nemotron-3.5-Super-VL', 'nvidia/Nemotron-Nano-V2-12b'],
};

export const PERSONAS = {
  casual: {
    label: 'Casual', name: 'Cass', role: 'casual', color: '#f2f2f3',
    blurb: 'Skims, rarely waits, commits to a few moves at a time.',
    temperature: 1.0, maxTokens: 160, thinking: false, plan: 4,
    prompt: 'You are a casual mobile gamer on a bus. You glance at the screen, skim, and almost never wait. You want to get to the exit fast.',
  },
  core: {
    label: 'Core', name: 'Kai', role: 'core', color: '#5fc39c',
    blurb: 'Plays most puzzle games, reads the screen, sometimes waits.',
    temperature: 0.6, maxTokens: 220, thinking: false, plan: 3,
    prompt: 'You are a regular puzzle-game player. You read the board and avoid obvious danger, but you do not plan far ahead.',
  },
  expert: {
    label: 'Expert', name: 'Eve', role: 'expert', color: '#6fa8e8',
    blurb: 'Plans ahead with a reasoning budget and times every spike.',
    temperature: 0.3, maxTokens: 1200, thinking: true, budget: 384, plan: 3,
    prompt: 'You are an expert puzzle player. Plan your route, track spike timing turn by turn, and wait when waiting is safer.',
  },
};

export const SEEDS_PER_PERSONA = 3;
export const STEP_CAP = 48;
