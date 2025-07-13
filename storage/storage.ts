import fs from "fs";

const KNOWN_POSTS_FILE = "./known_posts.json";
const SENT_POSTS_FILE = "./sent_posts.json";

export function loadKnownPostIds(): Set<string> {
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
  }
  return new Set();
}

export function saveKnownPostIds(set: Set<string>): void {
  const arr = Array.from(set);
  fs.writeFileSync(KNOWN_POSTS_FILE, JSON.stringify(arr, null, 2));
}

export function loadSentPostIds(): Set<string> {
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
  }
  return new Set();
}

export function saveSentPostIds(set: Set<string>): void {
  const arr = Array.from(set);
  fs.writeFileSync(SENT_POSTS_FILE, JSON.stringify(arr, null, 2));
}
