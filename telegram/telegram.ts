import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";
import { NewMessage } from "telegram/events";
import fs from "fs";
import { WASocket } from "@whiskeysockets/baileys";
import { Config } from "../config/config";

const TELEGRAM_SESSION_FILE = "./telegram.session";

export async function startTelegramMonitoring(
  sock: WASocket,
  config: Config
): Promise<void> {
  if (!config.telegram) return;

  const { apiId, apiHash, channelUsername } = config.telegram;

  let sessionString = "";
  if (fs.existsSync(TELEGRAM_SESSION_FILE)) {
    sessionString = fs.readFileSync(TELEGRAM_SESSION_FILE, "utf-8").trim();
  }

  const stringSession = new StringSession(sessionString);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Telegram phone number: "),
    password: async () => await input.text("Telegram password (if any): "),
    phoneCode: async () => await input.text("Telegram code: "),
    onError: (err) => console.error(err),
  });

  fs.writeFileSync(TELEGRAM_SESSION_FILE, stringSession.save(), "utf-8");
  console.log("✅ Telegram client ready.");

  client.addEventHandler(
    async (event) => {
      const text = event.message.text || "";
      if (text.trim()) {
        await sendTelegramMessageToWhatsApp(sock, config, text);
      }
    },
    new NewMessage({
      chats: [channelUsername],
    })
  );
}

async function sendTelegramMessageToWhatsApp(
  sock: WASocket,
  config: Config,
  text: string
): Promise<void> {
  for (const jid of config.whatsappGroupJids) {
    await sock.sendMessage(jid, {
      text: `📝 *Telegram Update*\n\n${text}`,
    });
    console.log("✅ Forwarded Telegram message to WhatsApp group:", jid);
  }
}
