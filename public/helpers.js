(function (root) {
  // Returns a clean 10-digit number, or '' if invalid
  function normPhone(v) {
    if (v == null) return '';
    let s = String(v).trim();
    if (!s) return '';
    if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = String(Math.round(Number(s)));
    s = s.split(/[,\/;|]/)[0];
    let d = s.replace(/\D/g, '');
    if (d.length > 10) d = d.slice(-10);
    return d.length === 10 ? d : '';
  }

  function guessCols(headers) {
    const find = (re) => headers.find((h) => re.test(String(h))) || '';
    return {
      name: find(/name|customer|client|party/i),
      phone: find(/phone|mobile|contact|mob|cell|whatsapp|number/i),
      project: find(/project|property|interest/i),
      source: find(/source|campaign|channel/i),
      budget: find(/budget|price/i),
    };
  }

  // rows: array of objects from the sheet. Returns leads to import + counts.
  function buildLeads(rows, nameCol, phoneCol, more) {
    more = more || {};
    const seen = new Set();
    const leads = [];
    let invalid = 0, dupInFile = 0;
    for (const r of rows) {
      const norm = normPhone(r[phoneCol]);
      if (!norm) { invalid++; continue; }
      if (seen.has(norm)) { dupInFile++; continue; }
      seen.add(norm);
      const extra = {};
      for (const k of Object.keys(r)) {
        if (k === nameCol || k === phoneCol || k === more.project || k === more.source || k === more.budget) continue;
        const val = r[k];
        if (val !== '' && val != null) extra[k] = String(val);
      }
      leads.push({
        name: nameCol ? String(r[nameCol] ?? '').trim() : '',
        phone: String(r[phoneCol]).trim(),
        project: more.project ? String(r[more.project] ?? '').trim() : '',
        source: more.source ? String(r[more.source] ?? '').trim() : '',
        budget: more.budget ? String(r[more.budget] ?? '').trim() : '',
        phone_norm: norm,
        extra,
      });
    }
    return { leads, total: rows.length, invalid, dupInFile };
  }

  const api = { normPhone, guessCols, buildLeads };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Helpers = api;
})(typeof window !== 'undefined' ? window : globalThis);
