const explicitStrings = [
  "host=localhost password=secret",
  "password=secret host=localhost",
  "host=localhost password='my secret' port=5432",
  "postgresql://user:pass@localhost:5432/db",
  "postgresql://user:p@ssword!@localhost:5432/db",
  "host=localhost port=5432 user=user@domain",
  "password=secret",
];

for (const explicit of explicitStrings) {
  let url = explicit;
  let password = undefined;

  const dsnPasswordMatch = url.match(
    /(?:^|\s)password\s*=\s*('([^']*)'|"([^"]*)"|(\S+))/i,
  );
  if (dsnPasswordMatch) {
    password =
      dsnPasswordMatch[2] ?? dsnPasswordMatch[3] ?? dsnPasswordMatch[4];
    url = url.replace(dsnPasswordMatch[0], "").trim();
  } else {
    const uriPasswordMatch = url.match(
      /(postgres(?:ql)?:\/\/[^:@/]+):([^:@/]+)(@)/i,
    );
    if (uriPasswordMatch) {
      password = uriPasswordMatch[2];
      try {
        password = decodeURIComponent(password);
      } catch {}
      url = url.replace(
        uriPasswordMatch[0],
        uriPasswordMatch[1] + uriPasswordMatch[3],
      );
    }
  }

  const hasCreds =
    url.match(/(?:^|\s)password\s*=/i) ||
    (url.includes(":") && url.includes("@"));
  console.log({ explicit, url, password, hasCreds: !!hasCreds });
}
