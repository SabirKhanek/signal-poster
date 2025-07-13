import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  GroupMetadata,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import inquirer from "inquirer";

export async function connectToWhatsApp(): Promise<WASocket> {
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

export async function chooseWhatsAppGroups(sock: WASocket): Promise<string[]> {
  const chats = await sock.groupFetchAllParticipating();
  const groups = Object.values(chats);

  if (groups.length === 0) {
    console.log("⚠️ No groups found in WhatsApp.");
    return [];
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
