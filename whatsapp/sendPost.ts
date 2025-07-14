import { htmlToText } from "html-to-text";
import { formatDate } from "../utils/format";
import { WASocket } from "@whiskeysockets/baileys";
import { Post } from "../config/config";

export async function sendPostToGroup(
  sock: WASocket,
  jid: string,
  post: Post
): Promise<void> {
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
