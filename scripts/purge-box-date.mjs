/**
 * One-off: delete RTDB nodes for a box + date across crabs, deletedCrabs, activityLog, restoreHistory.
 * Usage: node scripts/purge-box-date.mjs "A3-01" "2026-03-20"
 * Date can also be MM-DD-YYYY (e.g. 03-20-2026).
 */
const BASE = "https://crabmonitoringsystem-ab2ea-default-rtdb.asia-southeast1.firebasedatabase.app";

function normBox(b) {
  return String(b || "").toUpperCase().trim();
}

function dateMatches(stored, targets) {
  if (!stored) return false;
  const s = String(stored).trim();
  for (const target of targets) {
    if (!target) continue;
    const t = String(target).trim();
    if (s === t) return true;
    try {
      const d1 = new Date(s);
      const d2 = new Date(t);
      if (!isNaN(d1) && !isNaN(d2)) {
        const n1 = d1.toISOString().split("T")[0];
        const n2 = d2.toISOString().split("T")[0];
        if (n1 === n2) return true;
      }
    } catch (_) {}
  }
  return false;
}

function parseArgs() {
  const box = process.argv[2] || "A3-01";
  let rawDate = process.argv[3] || "03-20-2026";
  const variants = new Set([rawDate]);
  const m = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    variants.add(`${yyyy}-${mm}-${dd}`);
  }
  const m2 = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const [, y, mo, d] = m2;
    variants.add(`${mo}-${d}-${y}`);
  }
  return { box: normBox(box), dateVariants: [...variants] };
}

async function fetchJson(path) {
  const url = `${BASE}${path}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function deletePath(path) {
  const url = `${BASE}${path}.json`;
  const r = await fetch(url, { method: "DELETE" });
  return r.ok ? r.status : r.status;
}

async function main() {
  const { box, dateVariants } = parseArgs();
  console.log(`Box=${box} dateVariants=${JSON.stringify(dateVariants)}`);

  const crabs = (await fetchJson("/crabs")) || {};
  const deleted = (await fetchJson("/deletedCrabs")) || {};
  const logs = (await fetchJson("/activityLog")) || {};

  const hits = { crabs: [], deletedCrabs: [], activityLog: [] };

  for (const [id, c] of Object.entries(crabs)) {
    if (normBox(c.boxNo) === box && dateMatches(c.dateIn, dateVariants)) hits.crabs.push(id);
  }
  for (const [id, c] of Object.entries(deleted)) {
    if (normBox(c.boxNo) === box && dateMatches(c.dateIn, dateVariants)) hits.deletedCrabs.push(id);
  }
  for (const [id, e] of Object.entries(logs)) {
    if (normBox(e.boxNo) === box && dateMatches(e.dateIn, dateVariants)) hits.activityLog.push(id);
  }

  console.log("Found:", JSON.stringify(hits, null, 2));

  let ok = 0,
    fail = 0;
  for (const id of hits.crabs) {
    const st = await deletePath(`/crabs/${id}`);
    console.log(`DELETE crabs/${id} -> ${st}`);
    if (st === 200) ok++;
    else fail++;
  }
  for (const id of hits.deletedCrabs) {
    const st = await deletePath(`/deletedCrabs/${id}`);
    console.log(`DELETE deletedCrabs/${id} -> ${st}`);
    if (st === 200) ok++;
    else fail++;
    const st2 = await deletePath(`/restoreHistory/${id}`);
    console.log(`DELETE restoreHistory/${id} -> ${st2}`);
    if (st2 === 200) ok++;
    else fail++;
  }
  for (const id of hits.activityLog) {
    const st = await deletePath(`/activityLog/${id}`);
    console.log(`DELETE activityLog/${id} -> ${st}`);
    if (st === 200) ok++;
    else fail++;
  }

  console.log(`Done. DELETE OK-ish count=${ok}, failed status count=${fail}`);
  if (fail > 0) {
    console.warn(
      "Some deletes failed — Firebase rules likely require authentication. Use Admin panel: forceDeleteBoxDate(\"A3-01\",\"2026-03-20\") while logged in."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
