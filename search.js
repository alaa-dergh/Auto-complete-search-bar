/* Autocomplete engine: normalization + indexed, ranked matching. No dependencies. */
(function (root) {
  const APOSTROPHES = /['’‘ʼ`´]/;

  // Normalize a string and keep a map from each normalized char back to the original index
  // (needed to highlight matches in the original, accented text).
  function normalizeWithMap(str) {
    let out = "";
    const map = [];
    let lastWasSpace = true; // trims leading spaces
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (APOSTROPHES.test(ch)) continue; // "d'ivoire" -> "divoire"
      let n = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (/[\s\-_.,]/.test(n)) n = " ";
      for (const c of n) {
        if (c === " ") {
          if (lastWasSpace) continue;
          lastWasSpace = true;
        } else lastWasSpace = false;
        out += c;
        map.push(i);
      }
    }
    if (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
    return { text: out, map };
  }

  const normalize = (s) => normalizeWithMap(s).text;

  function createSearch(data, { limit = 10 } = {}) {
    const index = data.map((item) => {
      const label = typeof item === "string" ? item : item.name;
      const { text, map } = normalizeWithMap(label);
      return { item, label, text, map, compact: text.replace(/ /g, "") };
    });

    function search(query) {
      const q = normalizeWithMap(query).text;
      if (!q) return [];
      const qCompact = q.replace(/ /g, "");
      const results = [];

      for (const e of index) {
        let pos = e.text.indexOf(q);
        let len = q.length;
        let score;

        if (pos === 0) score = 0;                                   // starts with query
        else if (pos > 0 && e.text[pos - 1] === " ") score = 1;     // starts a later word
        else if (pos > 0) score = 2;                                // mid-word ("land" -> iceland)
        else {
          // fallback: ignore spaces ("cotedivoire", "newzealand")
          const cp = e.compact.indexOf(qCompact);
          if (cp === -1) continue;
          score = 3 + (cp === 0 ? 0 : 1);
          // map compact position back to a normalized position for highlighting
          let seen = 0; pos = 0;
          for (; pos < e.text.length; pos++) {
            if (e.text[pos] === " ") continue;
            if (seen === cp) break;
            seen++;
          }
          let covered = 0, end = pos;
          while (end < e.text.length && covered < qCompact.length) {
            if (e.text[end] !== " ") covered++;
            end++;
          }
          len = end - pos;
        }
        results.push({ e, score, pos, len });
      }

      results.sort((a, b) =>
        a.score - b.score || a.pos - b.pos || a.e.text.length - b.e.text.length ||
        a.e.label.localeCompare(b.e.label));

      return results.slice(0, limit).map(({ e, pos, len }) => ({
        item: e.item,
        label: e.label,
        // [start, end) in the ORIGINAL label, for highlighting
        range: [e.map[pos], e.map[pos + len - 1] + 1],
      }));
    }
    return search;
  }

  const api = { normalize, createSearch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Autocomplete = api;
})(typeof window !== "undefined" ? window : globalThis);
