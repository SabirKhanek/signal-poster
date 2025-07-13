import { connectToWhatsApp } from "./whatsapp/whatsapp";
import { loadOrCreateConfig, fetchPosts } from "./config/config";
import { startTelegramMonitoring } from "./telegram/telegram";
import {
  loadKnownPostIds,
  loadSentPostIds,
  saveKnownPostIds,
  saveSentPostIds,
} from "./storage/storage";
import { sendPostToGroup } from "./whatsapp/sendPost";

import type { WASocket } from "@whiskeysockets/baileys";
import type { Config, Post } from "./config/config";

let sock: WASocket | null = null;
let config: Config | null = null;
let knownPostIds = new Set<string>();
let sentPostIds = new Set<string>();

async function main() {
  sock = await connectToWhatsApp();
  config = await loadOrCreateConfig(sock);

  knownPostIds = loadKnownPostIds();
  sentPostIds = loadSentPostIds();

  if (config.telegram) {
    await startTelegramMonitoring(sock, config);
  }

  console.log("🚀 Checking existing posts...");

  const posts = await fetchPosts(config);
  for (const post of posts) {
    knownPostIds.add(post._id);

    if (!sentPostIds.has(post._id)) {
      for (const jid of config.whatsappGroupJids) {
        await sendPostToGroup(sock, jid, post);
      }
      sentPostIds.add(post._id);
    }
  }

  saveKnownPostIds(knownPostIds);
  saveSentPostIds(sentPostIds);

  startPolling();
}

function startPolling() {
  if (!config || !sock) {
    throw new Error("Config or WhatsApp socket not initialized.");
  }

  console.log(`⏳ Polling every ${config.pollInterval} seconds...`);

  setInterval(async () => {
    try {
      const posts = await fetchPosts(config!);
      for (const post of posts) {
        if (!knownPostIds.has(post._id)) {
          knownPostIds.add(post._id);
          sentPostIds.add(post._id);
          saveKnownPostIds(knownPostIds);
          saveSentPostIds(sentPostIds);

          for (const jid of config!.whatsappGroupJids) {
            await sendPostToGroup(sock!, jid, post);
          }
          console.log("✅ Processed new post:", post._id);
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, config.pollInterval * 1000);
}

main();
