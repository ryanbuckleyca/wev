const fs = require("node:fs");
const { execSync } = require("node:child_process");

// Some build environments (e.g. container/CI builds) don't include the .git directory.
// In those cases, configuring git hooks is unnecessary and should not fail the install.
if (!fs.existsSync(".git")) {
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .githooks", { stdio: "inherit" });
} catch {
  // Best-effort only: hook configuration should never break installs.
  process.exit(0);
}
