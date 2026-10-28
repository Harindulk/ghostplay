export const usd = (n) => (n >= 0.01 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
export const int = (n) => (n ?? 0).toLocaleString('en-US');
export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const ms = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
// Readable model name: nvidia/Nemotron-3_5-Lightning -> Nemotron 3.5 Lightning.
export const short = (m) => (m ? m.replace(/^nvidia\//, '').replace(/(\d)_(\d)/g, '$1.$2').replace(/-/g, ' ') : '—');
