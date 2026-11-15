// Lyra Studio's browser-side reference lyric alignment.
// Preserves the supplied words; Whisper provides timing anchors, not replacement text.
(function () {
  'use strict';
  function normalize(text) {
    return String(text).toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '');
  }
  function parseStamp(value) {
    const s = String(value).trim().replace(',', '.');
    const parts = s.split(':').map(Number);
    if (parts.some(x => !Number.isFinite(x)) || parts.length < 2 || parts.length > 3) return null;
    return parts.reduce((a, x) => a * 60 + x, 0);
  }
  function parseLyrics(raw) {
    const input = String(raw).replace(/\r/g, '').replace(/^\uFEFF/, '');
    const out = [];
    const isSrt = /\d\d:\d\d:\d\d[,\.]\d+\s*-->/.test(input);
    if (isSrt) {
      const blocks = input.trim().split(/\n\s*\n+/);
      for (const block of blocks) {
        const rows = block.split('\n');
        const index = rows.findIndex(r => r.includes('-->'));
        if (index === -1) continue;
        const [left] = rows[index].split('-->');
        const t = parseStamp(left);
        const text = rows.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim();
        if (text && t !== null) out.push({ t, text });
      }
    } else {
      for (const row of input.split('\n')) {
        const match = row.match(/^\s*\[(\d{1,3}:\d\d(?:[.,]\d{1,3})?)\]\s*(.*)$/);
        if (match) {
          const t = parseStamp(match[1]);
          if (t !== null && match[2].trim()) out.push({ t, text: match[2].trim() });
        } else {
          const text = row.trim();
          if (text && !/^\[(verse|chorus|outro|bridge|intro|pre-chorus|instrumental)(?:[^\]]*)\]$/i.test(text))
            out.push({ t: null, text });
        }
      }
    }
    return out;
  }
  function align(cues, observed, duration) {
    if (!cues.length) throw Error('Paste lyrics or import an SRT/LRC file first.');
    const entries = [];
    cues.forEach((cue, lineIndex) => {
      cue.text.split(/\s+/).filter(Boolean).forEach(text => entries.push({ text, key: normalize(text), lineIndex }));
    });
    if (!entries.length) throw Error('No lyric words found.');
    const heard = observed.filter(w => Number.isFinite(w.start) && normalize(w.text))
      .map(w => ({ ...w, key: normalize(w.text) }));
    if (!heard.length) throw Error('AI did not detect vocal words. Try the original audio, not the instrumental.');
    const n = entries.length, m = heard.length;
    if (n * m > 6e6) throw Error('Too many words to align in the browser.');
    const stride = m + 1, score = new Float32Array((n + 1) * stride);
    const trace = new Uint8Array((n + 1) * stride);
    for (let i = 1; i <= n; i++) { score[i * stride] = -1.2 * i; trace[i * stride] = 1; }
    for (let j = 1; j <= m; j++) { score[j] = -1.2 * j; trace[j] = 2; }
    for (let i = 1; i <= n; i++) {
      const a = entries[i - 1].key;
      for (let j = 1; j <= m; j++) {
        const b = heard[j - 1].key;
        const match = a === b ? 3.5 : (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a)) ? 1 : -2);
        const diagonal = score[(i - 1) * stride + j - 1] + match;
        const up = score[(i - 1) * stride + j] - 1.2;
        const left = score[i * stride + j - 1] - 1.2;
        const p = i * stride + j;
        if (diagonal >= up && diagonal >= left) { score[p] = diagonal; trace[p] = 0; }
        else if (up >= left) { score[p] = up; trace[p] = 1; }
        else { score[p] = left; trace[p] = 2; }
      }
    }
    const starts = Array(n).fill(null);
    let matches = 0, i = n, j = m;
    while (i && j) {
      const direction = trace[i * stride + j];
      if (direction === 0) {
        if (entries[i - 1].key === heard[j - 1].key) {
          starts[i - 1] = Math.max(0, heard[j - 1].start);
          matches++;
        }
        i--; j--;
      } else if (direction === 1) i--;
      else j--;
    }
    // Fill words not heard by evenly interpolating between trustworthy anchors.
    const fallbackDuration = Math.max(1, duration || heard[m - 1].end || heard[m - 1].start + 1);
    const known = [];
    for (let k = 0; k < n; k++) if (starts[k] !== null) known.push(k);
    if (!known.length) throw Error('No matching words were found. Review the lyrics and song.');
    for (let k = 0; k < n; k++) {
      if (starts[k] !== null) continue;
      let prev = -1, next = n;
      for (const a of known) { if (a < k) prev = a; else { next = a; break; } }
      if (prev < 0) starts[k] = Math.max(0, starts[next] - 0.32 * (next - k));
      else if (next === n) starts[k] = Math.min(fallbackDuration, starts[prev] + 0.32 * (k - prev));
      else starts[k] = starts[prev] + (starts[next] - starts[prev]) * (k - prev) / (next - prev);
    }
    // Keep times in a sensible monotonic order, including misheard/repeated phrases.
    for (let k = 1; k < n; k++) starts[k] = Math.max(starts[k - 1] + 0.015, starts[k]);
    let pos = 0;
    const result = cues.map(cue => {
      const tokens = cue.text.split(/\s+/).filter(Boolean);
      const words = tokens.map(text => ({ text, start: starts[pos++] }));
      return { t: words[0].start, text: cue.text, words };
    });
    return { lines: result, matched: matches, total: n, confidence: matches / n };
  }
  function stamp(t, srt = false) {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60, frac = ms % 1000;
    const pad = (n, digits = 2) => String(n).padStart(digits, '0');
    return srt ? [pad(h), pad(m), pad(s)].join(':') + ',' + pad(frac, 3)
      : '[' + pad(Math.floor(ms / 60000)) + ':' + pad(s) + '.' + pad(Math.floor(frac / 10)) + ']';
  }
  function toLrc(lines) { return lines.map(line => stamp(line.t) + line.text).join('\n'); }
  function toSrt(lines, duration) {
    return lines.map((line, i) => {
      const end = Math.max(line.t + 0.2, lines[i + 1]?.t || duration || line.t + 3);
      return (i + 1) + '\n' + stamp(line.t, true) + ' --> ' + stamp(end, true) + '\n' + line.text;
    }).join('\n\n');
  }
  window.LyraAlignment = { parseLyrics, align, toLrc, toSrt };
})();
