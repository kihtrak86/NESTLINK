#!/usr/bin/env node
/**
 * NestLink Embedding Backfill Script
 *
 * Generates and stores 384-dimensional embeddings for existing bookmarks that
 * are missing a valid embedding or whose content hash is out of date.
 *
 * Usage:
 *   node scripts/backfillEmbeddings.js [--batch-size=25] [--force] [--dry-run] [--user=<userId>]
 */

require("dotenv").config();

const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const {
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
} = require("../utils/embeddingText");
const {
  generateEmbedding,
  generateEmbeddingsBatch,
} = require("../services/embeddingService");

function parseArgs(argv) {
  const options = {
    batchSize: 25,
    force: false,
    dryRun: false,
    userId: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--batch-size=")) {
      const parsed = parseInt(arg.split("=")[1], 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 64) {
        options.batchSize = parsed;
      }
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--user=")) {
      options.userId = arg.split("=")[1].trim();
    }
  }

  return options;
}

async function processBatch(docs, options, stats) {
  const toEmbed = [];

  for (const doc of docs) {
    stats.scanned += 1;
    const text = buildBookmarkEmbeddingText({
      title: doc.title,
      description: doc.description,
      url: doc.url,
      folder: doc.folder,
      tags: doc.tags,
    });

    if (!text) {
      stats.skipped += 1;
      continue;
    }

    const contentHash = computeContentHash(text);
    const hasValid =
      isValidEmbedding(doc.embedding) && doc.embeddingContentHash === contentHash;

    if (hasValid && !options.force) {
      stats.skipped += 1;
      continue;
    }

    toEmbed.push({ doc, text, contentHash });
  }

  if (toEmbed.length === 0) {
    return;
  }

  if (options.dryRun) {
    stats.updated += toEmbed.length;
    console.log(`[dry-run] Would embed ${toEmbed.length} bookmark(s) in this batch.`);
    return;
  }

  try {
    const { embeddings, model } = await generateEmbeddingsBatch(
      toEmbed.map((item) => item.text)
    );

    const now = new Date();
    const bulkOps = toEmbed.map((item, idx) => ({
      updateOne: {
        // Strictly scope update by both _id and user to preserve ownership
        filter: { _id: item.doc._id, user: item.doc.user },
        update: {
          $set: {
            embedding: embeddings[idx],
            embeddingModel: model,
            embeddingContentHash: item.contentHash,
            embeddingUpdatedAt: now,
          },
        },
      },
    }));

    const result = await Bookmark.bulkWrite(bulkOps, { ordered: false });
    stats.updated += result.modifiedCount || bulkOps.length;
  } catch (batchErr) {
    console.warn(
      `[backfill] Batch embedding failed (${batchErr.message}); retrying items individually...`
    );

    for (const item of toEmbed) {
      try {
        const { embedding, model } = await generateEmbedding(item.text);
        await Bookmark.updateOne(
          { _id: item.doc._id, user: item.doc.user },
          {
            $set: {
              embedding,
              embeddingModel: model,
              embeddingContentHash: item.contentHash,
              embeddingUpdatedAt: new Date(),
            },
          }
        );
        stats.updated += 1;
      } catch (itemErr) {
        stats.failed += 1;
        console.error(
          `[backfill] Failed bookmark ${item.doc._id} (user ${item.doc.user}): ${itemErr.message}`
        );
      }
    }
  }
}

async function runBackfill(options) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tabshelf";
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB for embedding backfill");

  const filter = {};
  if (options.userId) {
    if (!mongoose.Types.ObjectId.isValid(options.userId)) {
      throw new Error(`Invalid --user ObjectId: ${options.userId}`);
    }
    filter.user = new mongoose.Types.ObjectId(options.userId);
  }

  const totalDocs = await Bookmark.countDocuments(filter);
  console.log(
    `📦 Found ${totalDocs} bookmark(s) | batchSize=${options.batchSize} | force=${options.force} | dryRun=${options.dryRun}`
  );

  const stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
  const startedAt = Date.now();

  const cursor = Bookmark.find(filter)
    .select("+embedding +embeddingContentHash")
    .sort({ _id: 1 })
    .cursor();

  let buffer = [];
  for await (const doc of cursor) {
    buffer.push(doc);
    if (buffer.length >= options.batchSize) {
      await processBatch(buffer, options, stats);
      console.log(
        `⏳ Progress: ${stats.scanned}/${totalDocs} scanned | updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed}`
      );
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    await processBatch(buffer, options, stats);
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(
    `✅ Backfill complete in ${elapsedSec}s | scanned=${stats.scanned} updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed}`
  );

  await mongoose.disconnect();
  return stats;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  runBackfill(options)
    .then((stats) => {
      process.exit(stats.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("❌ Backfill script error:", err.message);
      mongoose.disconnect().finally(() => process.exit(1));
    });
}

module.exports = { parseArgs, processBatch, runBackfill };
