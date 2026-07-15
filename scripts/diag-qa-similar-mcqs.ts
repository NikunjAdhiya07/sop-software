/** READ-ONLY dry-run: find the top-N near-duplicate MCQs to remove across ALL
 *  QA-department banks. Writes NOTHING. Emits removal keys for the apply step.
 *
 *  Run:  npx tsx scripts/diag-qa-similar-mcqs.ts [COUNT]   (default COUNT=10)
 *
 *  Faithful to the app: same normalize + jaccard threshold as lib/similarity.ts
 *  (SIMILARITY_THRESHOLD = 0.58). Comparison is per-language. Candidate pairs
 *  are generated via an inverted token index (blocking) so it never runs a raw
 *  O(n^2) scan over ~12k questions.
 */
import fs from "fs";
import mongoose from "mongoose";
import { SIMILARITY_THRESHOLD, normalizeQuestionText } from "../lib/similarity";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

type QRef = {
  key: string; sopIdentifier: string; language: string; index: number;
  question: string; isSimilar: boolean; isReviewed: boolean; isChecked: boolean;
  tokens: Set<string>;
};

function tokenize(q: string): Set<string> {
  return new Set(normalizeQuestionText(q).split(/\s+/).filter((w) => w.length > 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (big.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const bankCol = mongoose.connection.collection("mcqbanks");
  const count = Number(process.argv[2] ?? 10) || 10;

  const banks = await bankCol
    .find({ isObsolete: { $ne: true }, department: { $regex: /qa|quality/i } })
    .project({ sopIdentifier: 1, language: 1, department: 1, mcqs: 1 })
    .toArray();

  const all: QRef[] = [];
  for (const b of banks as any[]) {
    (b.mcqs ?? []).forEach((m: any, i: number) => {
      if (!m || typeof m.question !== "string") return;
      const question = m.question ?? "";
      all.push({
        key: `${b._id}#${i}`, sopIdentifier: b.sopIdentifier, language: b.language ?? "English",
        index: i, question, isSimilar: Boolean(m.isSimilar), isReviewed: Boolean(m.isReviewed),
        isChecked: Boolean(m.isChecked), tokens: tokenize(question),
      });
    });
  }
  console.log(`QA banks: ${banks.length}   questions: ${all.length}`);

  // Inverted index for blocking, per language. Skip ultra-common tokens (appear
  // in >2% of questions) for CANDIDATE GENERATION only — they can't make a pair
  // cross 0.58 on their own, and they'd blow up the candidate lists. The exact
  // jaccard below still uses the full token sets.
  const byLang = new Map<string, number[]>();
  all.forEach((q, i) => {
    const arr = byLang.get(q.language) ?? [];
    arr.push(i); byLang.set(q.language, arr);
  });

  type Pair = { i: number; j: number; score: number };
  const pairs: Pair[] = [];
  for (const [, idxs] of byLang) {
    const n = idxs.length;
    const commonCap = Math.max(20, Math.floor(n * 0.02));
    const inv = new Map<string, number[]>();
    for (const i of idxs) for (const t of all[i].tokens) {
      const p = inv.get(t) ?? []; p.push(i); inv.set(t, p);
    }
    const seen = new Set<string>();
    for (const i of idxs) {
      const cand = new Set<number>();
      for (const t of all[i].tokens) {
        const posting = inv.get(t)!;
        if (posting.length > commonCap) continue;       // skip non-discriminative
        for (const j of posting) if (j > i) cand.add(j);
      }
      for (const j of cand) {
        const pk = `${i}:${j}`;
        if (seen.has(pk)) continue; seen.add(pk);
        const score = jaccard(all[i].tokens, all[j].tokens);
        if (score >= SIMILARITY_THRESHOLD) pairs.push({ i, j, score });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  console.log(`Near-duplicate pairs (jaccard ≥ ${SIMILARITY_THRESHOLD}): ${pairs.length}`);

  // Greedy: high→low score. Keep the higher-value side (reviewed>checked, minus
  // isSimilar); remove the other. One removal per pair, no double-removal.
  const removed = new Map<number, { keep: number; score: number }>();
  const value = (q: QRef) => (q.isReviewed ? 2 : 0) + (q.isChecked ? 1 : 0) - (q.isSimilar ? 1 : 0);
  for (const p of pairs) {
    if (removed.size >= count) break;
    if (removed.has(p.i) || removed.has(p.j)) continue;
    const dropJ = value(all[p.j]) <= value(all[p.i]);
    const drop = dropJ ? p.j : p.i;
    const keep = dropJ ? p.i : p.j;
    removed.set(drop, { keep, score: p.score });
  }

  const trunc = (s: string, n = 130) => (s.length > n ? s.slice(0, n) + "…" : s);
  console.log(`\n================ PROPOSED REMOVALS (${removed.size} of ${count}) ================`);
  let n = 1;
  for (const [di, { keep, score }] of removed) {
    const q = all[di], k = all[keep];
    console.log(
      `\n[${n++}] score=${score.toFixed(3)} lang=${q.language}\n` +
        `    REMOVE ${q.sopIdentifier} #${q.index}` +
        `${q.isReviewed ? " (REVIEWED)" : ""}${q.isSimilar ? " (isSimilar)" : ""}\n      "${trunc(q.question)}"\n` +
        `    KEEP   ${k.sopIdentifier} #${k.index}\n      "${trunc(k.question)}"`,
    );
  }
  console.log(`\n=== REMOVAL KEYS (bankId#index) ===`);
  console.log(JSON.stringify([...removed.keys()].map((i) => all[i].key)));
  console.log("\n(DRY-RUN — nothing modified.)");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
