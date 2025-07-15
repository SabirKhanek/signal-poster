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

  let resolveConnected: () => void;
  let rejectConnected: (err: any) => void;

  const connected = new Promise<void>((resolve, reject) => {
    resolveConnected = resolve;
    rejectConnected = reject;
  });

  let socket = makeWASocket({
    auth: state,
    syncFullHistory: false,
    logger: pino({ level: "silent" }),
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("⚠️ Scan this QR code to connect:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connection established!");
      resolveConnected();
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

      console.log(
        "Connection closed. Restarting... (it'll only restart if restart mechanism is configured)",
        shouldReconnect
      );

      process.exit(1);

      // if (shouldReconnect) {
      //   connectToWhatsApp().then((newSock) => {
      //     socket = newSock;
      //     console.log("✅ Reconnected to WhatsApp.");
      //   });
      // } else {
      //   console.error("❌ WhatsApp logged out. Restart your bot manually.");
      //   rejectConnected(new Error("WhatsApp logged out or connection closed."));
      // }
    }
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
