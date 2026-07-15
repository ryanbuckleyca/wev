function resolveTest(explicit: string) {
  try {
    const parsedUrl = new URL(explicit);
    if (
      parsedUrl.protocol === "postgres:" ||
      parsedUrl.protocol === "postgresql:"
    ) {
      if (parsedUrl.password) {
        const password = decodeURIComponent(parsedUrl.password);
        parsedUrl.password = "";
        return { url: parsedUrl.toString(), password };
      }
      return { url: explicit };
    }
  } catch {
    // Fall through
  }

  if (
    explicit.includes("password=") ||
    (explicit.includes(":") && explicit.includes("@"))
  ) {
    throw new Error("Contains potential credentials");
  }
  return { url: explicit };
}

[
  "postgresql://user:pass@localhost:5432/db",
  "postgres://user:pass@localhost:5432/db",
  "postgresql://user@localhost:5432/db",
  "user:pass@localhost:5432/db",
  "host=localhost user=user password=pass dbname=db",
  "host=localhost user=user dbname=db",
  "localhost",
].forEach((s) => {
  try {
    console.log(s, "=>", resolveTest(s));
  } catch (e: any) {
    console.log(s, "=> ERROR:", e.message);
  }
});
