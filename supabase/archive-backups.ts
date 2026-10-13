import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const backupsDir = path.resolve(__dirname, "backups");
const archiveDir = path.resolve(backupsDir, "archives");

if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
const archiveFileName = `supabase_backups_${timestamp}.zip`;
const archiveFilePath = path.join(archiveDir, archiveFileName);

const jsonFiles = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".json"));

if (jsonFiles.length === 0) {
  console.log("No JSON backup files found to archive.");
  process.exit(0);
}

try {
  const fileArgs = jsonFiles.map((f) => path.join(backupsDir, f));
  execFileSync("zip", ["-j", archiveFilePath, ...fileArgs]);
  console.log(`Successfully created archive: ${archiveFilePath}`);

  // Optional: Remove individual JSON files after zipping
  // jsonFiles.forEach(file => {
  //   fs.unlinkSync(path.join(backupsDir, file));
  //   console.log(`Removed ${file}`);
  // });
} catch (error) {
  console.error("Error creating archive:", error);
  process.exit(1);
}
