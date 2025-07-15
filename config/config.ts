import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import url from "url";
import { chooseWhatsAppGroups } from "../whatsapp/whatsapp";
import { WASocket } from "@whiskeysockets/baileys";

export interface Config {
  apiToken: string;
  userId: string;
  whatsappGroupJids: string[];
  pollInterval: number;
  telegram?: TelegramConfig;
}

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  channelUsername: string;
}

export interface Post {
  _id: string;
  description: string;
  createdAt: string;
  imageTitle?: string;
  imageFormat?: string;
  video?: string;
  pdfFile?: string;
}

const CONFIG_FILE = "./config.js";

export async function loadOrCreateConfig(sock: WASocket): Promise<Config> {
  let existingConfig: Partial<Config> = {};

  const useDefaults = process.argv.includes("-y");

  if (fs.existsSync(CONFIG_FILE)) {
    const fullPath = path.resolve(CONFIG_FILE);
    const configModule = await import(url.pathToFileURL(fullPath).href);
    existingConfig = configModule.default;
    console.log("✅ Loaded existing config.");
  }

  let apiTokenAnswer: { apiToken: string };
  if (useDefaults) {
    apiTokenAnswer = { apiToken: existingConfig.apiToken || "" };
  } else {
    apiTokenAnswer = await inquirer.prompt<{ apiToken: string }>({
      type: "input",
      name: "apiToken",
      message: "Enter API Token:",
      default: existingConfig.apiToken || "",
    });
  }

  let userIdAnswer: { userId: string };
  if (useDefaults) {
    userIdAnswer = { userId: existingConfig.userId || "" };
  } else {
    userIdAnswer = await inquirer.prompt<{ userId: string }>({
      type: "input",
      name: "userId",
      message: "Enter User ID:",
      default: existingConfig.userId || "",
    });
  }

  let whatsappGroupJids = existingConfig.whatsappGroupJids || [];
  if (useDefaults && whatsappGroupJids.length > 0) {
    console.log("✅ Using existing WhatsApp groups.");
  } else {
    if (whatsappGroupJids.length === 0 || !useDefaults) {
      whatsappGroupJids = await chooseWhatsAppGroups(sock);
    }
  }

  let pollIntervalAnswer: { pollInterval: string };
  if (useDefaults) {
    pollIntervalAnswer = {
      pollInterval: existingConfig.pollInterval?.toString() || "60",
    };
  } else {
    pollIntervalAnswer = await inquirer.prompt<{ pollInterval: string }>({
      type: "input",
      name: "pollInterval",
      message: "Polling interval in seconds:",
      default: existingConfig.pollInterval?.toString() || "60",
    });
  }

  let telegramConfig: TelegramConfig | undefined = existingConfig.telegram;

  let enableTelegram = telegramConfig != null;
  if (!useDefaults) {
    const telegramConfirm = await inquirer.prompt<{
      enableTelegram: boolean;
    }>({
      type: "confirm",
      name: "enableTelegram",
      message: "Do you want to configure Telegram monitoring?",
      default: enableTelegram,
    });
    enableTelegram = telegramConfirm.enableTelegram;
  }

  if (enableTelegram) {
    let apiIdAns: { apiId: string };
    let apiHashAns: { apiHash: string };
    let channelAns: { channelUsername: string };

    if (useDefaults) {
      apiIdAns = { apiId: telegramConfig?.apiId?.toString() || "" };
      apiHashAns = { apiHash: telegramConfig?.apiHash || "" };
      channelAns = { channelUsername: telegramConfig?.channelUsername || "" };
    } else {
      apiIdAns = await inquirer.prompt<{ apiId: string }>({
        type: "input",
        name: "apiId",
        message: "Telegram API ID:",
        default: telegramConfig?.apiId?.toString() || "",
      });

      apiHashAns = await inquirer.prompt<{ apiHash: string }>({
        type: "input",
        name: "apiHash",
        message: "Telegram API Hash:",
        default: telegramConfig?.apiHash || "",
      });

      channelAns = await inquirer.prompt<{ channelUsername: string }>({
        type: "input",
        name: "channelUsername",
        message: "Telegram channel username (without @):",
        default: telegramConfig?.channelUsername || "",
      });
    }

    telegramConfig = {
      apiId: parseInt(apiIdAns.apiId, 10) || 0,
      apiHash: apiHashAns.apiHash,
      channelUsername: channelAns.channelUsername,
    };
  } else {
    telegramConfig = undefined;
  }

  const config: Config = {
    apiToken: apiTokenAnswer.apiToken || "",
    userId: userIdAnswer.userId || "",
    whatsappGroupJids,
    pollInterval: parseInt(pollIntervalAnswer.pollInterval, 10),
    telegram: telegramConfig,
  };

  const fileContent = `export default ${JSON.stringify(config, null, 2)};`;
  fs.writeFileSync(CONFIG_FILE, fileContent, "utf-8");
  console.log("✅ Config saved to config.js");

  return config;
}

export async function fetchPosts(config: Config): Promise<Post[]> {
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
