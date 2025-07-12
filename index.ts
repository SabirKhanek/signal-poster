import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  GroupMetadata,
} from "@whiskeysockets/baileys";
import inquirer from "inquirer";
import fs from "fs";
import fetch from "node-fetch";
import { Boom } from "@hapi/boom";
import path from "path";
import url from "url";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { htmlToText } from "html-to-text";

const CONFIG_FILE = "./config.js";
const KNOWN_POSTS_FILE = "./known_posts.json";
const SENT_POSTS_FILE = "./sent_posts.json";

interface Config {
  apiToken: string;
  userId: string;
  whatsappGroupJids: string[];
  pollInterval: number;
}

interface Post {
  _id: string;
  description: string;
  createdAt: string;
  imageTitle?: string;
  imageFormat?: string;
  video?: string;
  pdfFile?: string;
  [key: string]: any;
}

let config: Config | null = null;
let knownPostIds: Set<string> = new Set();
let sentPostIds: Set<string> = new Set();
let sock: WASocket | null = null;

async function connectToWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const socket = makeWASocket({
    auth: state,
    syncFullHistory: false,
    logger: pino({ level: "silent" }),
  });

  socket.ev.on("creds.update", saveCreds);

  const connected = new Promise<void>((resolve, reject) => {
    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("⚠️ Scan this QR code to connect:\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error instanceof Boom &&
          lastDisconnect?.error?.output?.statusCode !==
            DisconnectReason.loggedOut;
        console.log("Connection closed. Reconnect:", shouldReconnect);
        if (shouldReconnect) {
          connectToWhatsApp().then(() => resolve());
        } else {
          reject(new Error("WhatsApp logged out or connection closed."));
        }
      } else if (connection === "open") {
        console.log("✅ WhatsApp connection established!");
        resolve();
      }
    });
  });

  await connected;
  return socket;
}

async function loadOrCreateConfig(): Promise<void> {
  let existingConfig: Partial<Config> = {};

  if (fs.existsSync(CONFIG_FILE)) {
    const fullPath = path.resolve(CONFIG_FILE);
    const configModule = await import(url.pathToFileURL(fullPath).href);
    existingConfig = configModule.default;
    console.log("✅ Loaded existing config.");
  }

  const apiTokenAnswer = await inquirer.prompt<{ apiToken: string }>({
    type: "input",
    name: "apiToken",
    message: "Enter API Token:",
    default: existingConfig.apiToken || "",
  });

  const userIdAnswer = await inquirer.prompt<{ userId: string }>({
    type: "input",
    name: "userId",
    message: "Enter User ID:",
    default: existingConfig.userId || "",
  });

  let whatsappGroupJids = existingConfig.whatsappGroupJids || [];
  if (whatsappGroupJids.length === 0) {
    whatsappGroupJids = await chooseWhatsAppGroups();
  } else {
    const confirm = await inquirer.prompt<{ keep: boolean }>({
      type: "confirm",
      name: "keep",
      message: `Keep existing groups?\n${whatsappGroupJids.join("\n")}`,
      default: true,
    });

    if (!confirm.keep) {
      whatsappGroupJids = await chooseWhatsAppGroups();
    }
  }

  const pollIntervalAnswer = await inquirer.prompt<{ pollInterval: string }>({
    type: "input",
    name: "pollInterval",
    message: "Polling interval in seconds:",
    default: existingConfig.pollInterval?.toString() || "60",
    validate: (input) => {
      if (isNaN(Number(input)) || parseInt(input, 10) <= 0) {
        return "Must be a positive number";
      }
      return true;
    },
  });

  config = {
    apiToken: apiTokenAnswer.apiToken || existingConfig.apiToken || "",
    userId: userIdAnswer.userId || existingConfig.userId || "",
    whatsappGroupJids,
    pollInterval: parseInt(
      pollIntervalAnswer.pollInterval ||
        existingConfig.pollInterval?.toString() ||
        "60",
      10
    ),
  };

  const fileContent = `export default ${JSON.stringify(config, null, 2)};`;
  fs.writeFileSync(CONFIG_FILE, fileContent, "utf-8");
  console.log("✅ Config saved to config.js");
}

async function chooseWhatsAppGroups(): Promise<string[]> {
  if (!sock) {
    throw new Error("WhatsApp socket not initialized.");
  }

  const choice = await inquirer.prompt<{ method: string }>({
    type: "list",
    name: "method",
    message: "How do you want to select the WhatsApp groups?",
    choices: [
      { name: "Select from list of groups", value: "list" },
      { name: "Enter group JIDs manually", value: "manual" },
    ],
  });

  if (choice.method === "manual") {
    const manual = await inquirer.prompt<{ jids: string }>({
      type: "input",
      name: "jids",
      message: "Enter one or more WhatsApp Group JIDs separated by commas:",
      validate: (input) => {
        if (!input.trim()) return "Please enter at least one JID.";
        return true;
      },
    });
    return manual.jids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats);

    if (groups.length === 0) {
      console.log("⚠️ No groups found in your WhatsApp account.");
      const manual = await inquirer.prompt<{ jids: string }>({
        type: "input",
        name: "jids",
        message: "Enter WhatsApp Group JIDs manually (comma separated):",
      });
      return manual.jids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const groupChoice = await inquirer.prompt<{ groupJids: string[] }>({
      type: "checkbox",
      name: "groupJids",
      message: "Select one or more WhatsApp groups:",
      choices: groups.map((g: GroupMetadata) => ({
        name: `${g.subject} (${g.id})`,
        value: g.id,
      })),
      validate: (selected) => {
        if (selected.length === 0) {
          return "Please select at least one group.";
        }
        return true;
      },
    });

    return groupChoice.groupJids;
  }
}

function loadKnownPostIds(): Set<string> {
  if (fs.existsSync(KNOWN_POSTS_FILE)) {
    const raw = fs.readFileSync(KNOWN_POSTS_FILE, "utf-8");
    try {
      const arr: string[] = JSON.parse(raw);
      console.log(`✅ Loaded ${arr.length} known post IDs.`);
      return new Set(arr);
    } catch (e) {
      console.error("⚠️ Failed to parse known_posts.json:", e);
      return new Set();
    }
  } else {
    return new Set();
  }
}

function saveKnownPostIds(set: Set<string>): void {
  const arr = Array.from(set);
  fs.writeFileSync(KNOWN_POSTS_FILE, JSON.stringify(arr, null, 2));
}

function loadSentPostIds(): Set<string> {
  if (fs.existsSync(SENT_POSTS_FILE)) {
    const raw = fs.readFileSync(SENT_POSTS_FILE, "utf-8");
    try {
      const arr: string[] = JSON.parse(raw);
      console.log(`✅ Loaded ${arr.length} sent post IDs.`);
      return new Set(arr);
    } catch (e) {
      console.error("⚠️ Failed to parse sent_posts.json:", e);
      return new Set();
    }
  } else {
    return new Set();
  }
}

function saveSentPostIds(set: Set<string>): void {
  const arr = Array.from(set);
  fs.writeFileSync(SENT_POSTS_FILE, JSON.stringify(arr, null, 2));
}

async function fetchPosts(): Promise<Post[]> {
  if (!config) throw new Error("Config not loaded.");

  const res = await fetch("https://api3.waqarzaka.net/post/get", {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      authorization: config.apiToken,
    },
    body: JSON.stringify({
      page: 1,
      userId: config.userId,
    }),
  });

  if (!res.ok) {
    console.error(`API error: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as { post: Post[] };
  return json.post || [];
}

function formatDate(d: Date): string {
  return d
    .toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(",", "");
}

function formatPost(post: Post): string {
  const cleanText = htmlToText(post.description || "", {
    wordwrap: false,
    selectors: [
      { selector: "br", format: "block" },
      { selector: "strong", format: "inline" },
      { selector: "b", format: "inline" },
      { selector: "i", format: "inline" },
    ],
  }).trim();

  const formattedDate = formatDate(new Date(post.createdAt));

  return `📝 *New Post*\n\n${cleanText}\n\n🕒 ${formattedDate}`;
}

async function sendPostToGroup(jid: string, post: Post): Promise<void> {
  if (!sock) return;

  try {
    const msgContent = formatPost(post);
    const sentMsg = await sock.sendMessage(jid, { text: msgContent });
    console.log(`✅ Sent text to group ${jid}`);

    if (post.imageTitle && post.imageFormat) {
      const imageUrl = `https://s3.us-east-2.amazonaws.com/waqarzaka.net/waqarzakaMainContent/uploadedImages/img_${post.imageTitle}.${post.imageFormat}`;
      try {
        await sock.sendMessage(
          jid,
          {
            image: { url: imageUrl },
            caption: "Image for this signal.",
          },
          { quoted: sentMsg }
        );
        console.log("✅ Sent image to group:", jid);
      } catch (e) {
        console.error("❌ Failed sending image:", e);
      }
    }

    if (post.video) {
      try {
        await sock.sendMessage(
          jid,
          {
            video: { url: post.video },
            caption: "Video for this signal.",
          },
          { quoted: sentMsg }
        );
        console.log("✅ Sent video to group:", jid);
      } catch (e) {
        console.error("❌ Failed sending video:", e);
      }
    }

    if (post.pdfFile) {
      const fileName = `signal-${post._id}.pdf`;
      try {
        await sock.sendMessage(
          jid,
          {
            document: { url: post.pdfFile },
            mimetype: "application/pdf",
            fileName,
          },
          { quoted: sentMsg }
        );
        console.log("✅ Sent PDF to group:", jid);
      } catch (e) {
        console.error("❌ Failed sending PDF:", e);
      }
    }
  } catch (e) {
    console.error("❌ Failed sending main message:", e);
  }
}

async function startPolling(): Promise<void> {
  if (!config || !sock) {
    throw new Error("Config or WhatsApp socket not initialized.");
  }

  console.log(`⏳ Starting polling every ${config.pollInterval} seconds...`);

  setInterval(async () => {
    try {
      const posts = await fetchPosts();
      for (const post of posts) {
        if (!knownPostIds.has(post._id)) {
          knownPostIds.add(post._id);
          sentPostIds.add(post._id);
          saveKnownPostIds(knownPostIds);
          saveSentPostIds(sentPostIds);

          for (const jid of config!.whatsappGroupJids) {
            await sendPostToGroup(jid, post);
          }

          console.log("✅ Processed new post:", post._id);
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, config.pollInterval * 1000);
}

async function main(): Promise<void> {
  sock = await connectToWhatsApp();
  await loadOrCreateConfig();

  knownPostIds = loadKnownPostIds();
  sentPostIds = loadSentPostIds();

  console.log("🚀 Checking existing posts to send any unsent ones...");

  const posts = await fetchPosts();
  console.log(posts);
  for (const post of posts) {
    knownPostIds.add(post._id);

    if (!sentPostIds.has(post._id)) {
      for (const jid of config!.whatsappGroupJids) {
        await sendPostToGroup(jid, post);
        console.log("✅ Sent existing post to WhatsApp group:", jid, post._id);
      }
      sentPostIds.add(post._id);
    }
  }

  saveKnownPostIds(knownPostIds);
  saveSentPostIds(sentPostIds);

  await startPolling();
}

main();
