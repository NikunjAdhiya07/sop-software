/** Per-bank removal batch: for each of the 73 confirmed-annexure QA SOPs
 *  (English banks), remove up to 10 of that bank's OWN internal near-duplicate
 *  questions (fewer if the bank has fewer available — never forced to 10 via
 *  a different criterion). Frees room for future annexure-sourced generation.
 *
 *  Same safety pattern as apply-remove-qa-similar-mcqs.ts: prints a per-bank
 *  plan first; only writes with --write. After writing, resyncs SOP.mcqCount
 *  for every touched identifier and clears the persistent dashboard cache.
 *
 *  Run:  npx tsx scripts/apply-remove-qa-annexure-batch.ts            (dry run)
 *        npx tsx scripts/apply-remove-qa-annexure-batch.ts --write     (apply)
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

const CONFIRMED_73 = `QAGE01-11 QAGE02-8 QAGE03-7 QAGE04-12 QAGE06-13 QAGE08-10 QAGE09-11 QAGE10-5
QAGE100-3 QAGE101-6 QAGE103-4 QAGE104-9 QAGE105-6 QAGE106-3 QAGE107-2 QAGE108-3
QAGE109-2 QAGE11-5 QAGE110-7 QAGE111-2 QAGE112-3 QAGE113-2 QAGE114-2 QAGE115-3 QAGE116-2
QAGE117-5 QAGE118-2 QAGE119-3 QAGE120-2 QAGE121-2 QAGE122-2 QAGE123-2 QAGE124-3
QAGE127-3 QAGE130-1 QAGE131-1 QAGE132-1 QAGE15-11 QAGE17-8 QAGE18-5 QAGE20-5 QAGE21-5
QAGE24-6 QAGE26-6 QAGE28-10 QAGE40-4 QAGE42-7 QAGE47-5 QAGE48-5 QAGE49-5 QAGE51-7
QAGE54-6 QAGE58-9 QAGE60-6 QAGE62-10 QAGE64-5 QAGE65-6 QAGE66-5 QAGE67-5 QAGE68-8
QAGE69-5 QAGE72-6 QAGE74-3 QAGE75-13 QAGE77-5 QAGE80-9 QAGE81-5 QAGE82-6 QAGE83-5
QAGE84-5 QAGE85-5 QAGE88-7 QAGE90-7`.split(/\s+/).filter(Boolean);

const PER_BANK_CAP = 10;

function looseIdRegex(id: string): RegExp {
  const m = id.match(/^([A-Za-z]+\d+)-(\d+)$/);
  if (!m) return new RegExp(`^${id}$`, "i");
  const [, prefix, ver] = m;
  return new RegExp(`^${prefix}-0*${ver}$`, "i");
}
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
function difficultyDistribution(mcqs: any[]) {
  return {
    easy: mcqs.filter((m) => m.difficulty === "Easy").length,
    medium: mcqs.filter((m) => m.difficulty === "Medium").length,
    hard: mcqs.filter((m) => m.difficulty === "Hard").length,
  };
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const bankCol = mongoose.connection.collection("mcqbanks");
  const sopCol = mongoose.connection.collection("sops");
  const write = process.argv.includes("--write");

  const touchedIdentifiers = new Set<string>();
  let totalRemoved = 0;
  let banksTouched = 0;

  for (const id of CONFIRMED_73) {
    const re = looseIdRegex(id);
    const banks = await bankCol
      .find({ sopIdentifier: re, language: "English", isObsolete: { $ne: true } })
      .toArray();

    for (const bank of banks as any[]) {
      const mcqs: any[] = bank.mcqs ?? [];
      const qs = mcqs.map((m, i) => ({
        i,
        tokens: typeof m?.question === "string" ? tokenize(m.question) : new Set<string>(),
        isReviewed: Boolean(m?.isReviewed),
        isChecked: Boolean(m?.isChecked),
        isSimilar: Boolean(m?.isSimilar),
      }));

      type Pair = { i: number; j: number; score: number };
      const pairs: Pair[] = [];
      for (let a = 0; a < qs.length; a++) {
        for (let b = a + 1; b < qs.length; b++) {
          const score = jaccard(qs[a].tokens, qs[b].tokens);
          if (score >= SIMILARITY_THRESHOLD) pairs.push({ i: a, j: b, score });
        }
      }
      pairs.sort((x, y) => y.score - x.score);

      const value = (q: (typeof qs)[number]) =>
        (q.isReviewed ? 2 : 0) + (q.isChecked ? 1 : 0) - (q.isSimilar ? 1 : 0);
      const removeIdx = new Set<number>();
      for (const p of pairs) {
        if (removeIdx.size >= PER_BANK_CAP) break;
        if (removeIdx.has(p.i) || removeIdx.has(p.j)) continue;
        const dropJ = value(qs[p.j]) <= value(qs[p.i]);
        removeIdx.add(dropJ ? p.j : p.i);
      }

      if (removeIdx.size === 0) {
        console.log(`${id.padEnd(12)} bank ${bank._id}  0 near-dupes available — skipped`);
        continue;
      }

      const kept = mcqs.filter((_, idx) => !removeIdx.has(idx));
      console.log(
        `${write ? "REMOVING" : "WOULD REMOVE"} ${id.padEnd(12)} bank ${bank._id}  ` +
          `${mcqs.length} → ${kept.length}  (removed ${removeIdx.size})`,
      );
      totalRemoved += removeIdx.size;
      banksTouched++;
      touchedIdentifiers.add(bank.sopIdentifier);

      if (write) {
        await bankCol.updateOne(
          { _id: bank._id },
          {
            $set: {
              mcqs: kept,
              totalQuestions: kept.length,
              difficultyDistribution: difficultyDistribution(kept),
            },
          },
        );
      }
    }
  }

  console.log(
    `\n${write ? "Removed" : "Would remove"}: ${totalRemoved} questions across ${banksTouched} banks.`,
  );

  if (write && touchedIdentifiers.size > 0) {
    console.log(`\nResyncing SOP.mcqCount for ${touchedIdentifiers.size} identifiers…`);
    for (const identifier of touchedIdentifiers) {
      const re = new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const banks = await bankCol
        .find({ sopIdentifier: re, language: "English", isObsolete: { $ne: true } })
        .project({ mcqs: 1 })
        .toArray();
      const bankTotal = banks.reduce((sum, b: any) => sum + (b.mcqs?.length ?? 0), 0);
      const res = await sopCol.updateMany(
        { identifier: re },
        { $set: { mcqCount: bankTotal } },
      );
      console.log(`  ${identifier}: mcqCount → ${bankTotal} (${res.modifiedCount} SOP doc(s))`);
    }

    const cacheCol = mongoose.connection.collection("dashboard_grouped_cache");
    const del = await cacheCol.deleteMany({});
    console.log(`\nCleared persistent grouped-registry cache docs: ${del.deletedCount}`);
  } else if (!write) {
    console.log("\n(Dry run — no writes. Re-run with --write to apply.)");
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
