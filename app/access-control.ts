export function isEmailAllowed(email: string): boolean {
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  if (!normalizedEmail) return false;

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(/[;,\n]/)
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);

  return allowedEmails.includes(normalizedEmail);
}

export function accountOwnerForEmail(email: string): string | null {
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  if (!normalizedEmail) return null;

  for (const entry of (process.env.ACCOUNT_OWNER_BY_EMAIL ?? "").split(/[;,\n]/)) {
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const mappedEmail = entry.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const owner = entry.slice(separator + 1).trim();
    if (mappedEmail === normalizedEmail && owner) return owner;
  }

  return null;
}
