// The protections a report can get past, and the wording that shows a report is about getting past one.
// Shared by the import script (which tags reports) and the app (which names and searches them).

/** Wording that marks a bypass. */
export const BYPASS = /bypass|circumvent|evad(e|es|ed|ing)|work(s|ed)? ?around|get(s|ting)? (around|past)|defeat(s|ed)?|still (vulnerable|possible|exploitable|works|able)|not (properly |fully )?(fixed|patched)|incomplete (fix|patch)|insufficient (fix|patch|validation)/i;
/** Wording that marks a bypass of an earlier fix. */
export const REFIX = /(bypass|incomplete|insufficient|regression|still (vulnerable|exploitable|works)|not (properly |fully )?(fixed|patched)|again).{0,60}(fix|patch|mitigation|#\d{4,8}|reports\/\d{4,8})|(fix|patch|mitigation).{0,40}(bypass|incomplete|insufficient)/i;

/** @type {{ id: string, name: string, about: string, re: RegExp }[]} */
export const DEFENCES = [
  { id: "waf", name: "Web application firewalls", about: "Cloudflare, Akamai, ModSecurity and other request filters in front of the app", re: /\bwaf\b|web application firewall|cloudflare|akamai|imperva|incapsula|mod_?security|firewall rule/i },
  { id: "csp", name: "Content Security Policy", about: "Script and resource policies, nonces and allow-listed hosts", re: /\bcsp\b|content[- ]security[- ]policy|script-src|\bnonce\b/i },
  { id: "filter", name: "Input filters and sanitisers", about: "Blocklists, HTML sanitisers, escaping and tag or attribute stripping", re: /\b(xss|html|input|tag|keyword|character) (filter|filtering|protection|auditor)|saniti[sz]|dompurify|purif(y|ier)|black ?list|block ?list|escap(e|ed|ing)|strip(s|ped|ping)? (tags|script|html)|\bfilter(s|ed|ing)?\b/i },
  { id: "ssrf", name: "SSRF protections", about: "Host allow-lists, internal-address blocks, redirect and DNS checks on outbound requests", re: /ssrf (filter|protection|check|mitigation|fix)|allow ?list|white ?list|internal (ip|host|address|network)|private (ip|network|address)|127\.0\.0\.1|localhost|169\.254|metadata|dns rebind/i },
  { id: "redirect", name: "URL and redirect validation", about: "redirect_uri checks, host validation and URL parser differences", re: /redirect[_ ]?(uri|url)?.{0,20}(validation|check|filter|restriction)|url (validation|parser|parsing|check)|host(name)? (validation|check)|domain (validation|check|restriction)|open redirect (protection|filter|fix)/i },
  { id: "2fa", name: "Two-factor and verification codes", about: "2FA, OTP and code checks that can be skipped, reused or guessed", re: /\b2fa\b|two[- ]factor|\bmfa\b|multi[- ]factor|\botp\b|one[- ]time (password|code|pin)|verification code|security code|\bpin\b/i },
  { id: "rate", name: "Rate limits and lockouts", about: "Throttling, attempt limits, lockouts and CAPTCHA", re: /rate[- ]?limit|brute[- ]?force (protection|prevention)|throttl|lock ?out|attempt limit|captcha/i },
  { id: "csrf", name: "CSRF protections", about: "Tokens, SameSite cookies, and Origin or Referer checks", re: /csrf (token|protection|check|validation|mitigation)|anti[- ]?csrf|xsrf|samesite|same-site|(origin|referer|referrer) (check|validation|header)/i },
  { id: "cors", name: "Same-origin and CORS rules", about: "Origin allow-lists, CORS headers and same-origin policy gaps", re: /\bcors\b|access-control-allow|same[- ]origin policy|\bsop\b|postmessage origin/i },
  { id: "access", name: "Authorisation and access checks", about: "Permission, role, ownership and paywall checks", re: /authori[sz]ation|access control|permission(s)? (check|restriction|model)|privilege (check|restriction)|role (check|restriction)|restriction(s)?|paywall|ownership check|acl\b/i },
  { id: "login", name: "Login and identity checks", about: "Authentication, SSO, session and password-reset checks", re: /authentication|\blogin\b|sign[- ]?in|\bsso\b|saml|oauth|password (reset|check|confirmation|prompt)|session (check|validation)/i },
  { id: "verify", name: "Email and phone verification", about: "Confirming an address or number before it is trusted", re: /(e-?mail|phone|sms|account|domain|identity) (verification|confirmation|validation)/i },
  { id: "upload", name: "File upload checks", about: "Extension, content-type and file-content validation", re: /(file|upload|extension|content[- ]type|mime|image) (validation|restriction|check|filter|type check)|file (upload|type|extension)|magic bytes/i },
  { id: "path", name: "Path and encoding checks", about: "Path normalisation, traversal filters and encoding tricks", re: /path (normali[sz]ation|traversal|validation|check|filter)|\.\.\/|%2e%2e|double[- ]encod|url[- ]encod|unicode normali[sz]|null byte|%00/i },
  { id: "token", name: "Token and signature checks", about: "JWT, HMAC, signature and API token validation", re: /\bjwt\b|signature (validation|verification|check)|\bhmac\b|token (validation|verification|check)|api key (validation|check)/i },
  { id: "sandbox", name: "Sandboxes and execution limits", about: "Iframe sandboxes, restricted interpreters, jails and disabled functions", re: /sandbox|\bjail\b|chroot|disable_functions|safe[- ]mode|restricted (shell|mode)|seccomp/i },
  { id: "fix", name: "Earlier fixes", about: "Reports that got past the fix for an earlier report", re: REFIX },
  { id: "other", name: "Other protections", about: "Bypasses of checks that fit none of the groups above", re: /$^/ },
];
export const defenceById = (id) => DEFENCES.find((d) => d.id === id);

/** Which protections a report got past, judged from its title and from sentences that talk about a bypass. */
export function tagReport(title, text) {
  const tags = new Set(), lines = (text || "").split(/\n|(?<=[.!?])\s+/).filter((l) => l.length < 600 && BYPASS.test(l));
  const titled = BYPASS.test(title);
  for (const d of DEFENCES) {
    if (d.id === "other") continue;
    if ((titled || d.id === "fix") && d.re.test(title)) tags.add(d.id);
    else if (lines.some((l) => d.re.test(l))) tags.add(d.id);
  }
  if (titled && !tags.size) tags.add("other");
  return [...tags];
}

/** Earlier reports this one says it gets past, by id. */
export function referencedReports(title, text) {
  const ids = new Set();
  for (const l of [title, ...(text || "").split(/\n/)]) {
    if (!REFIX.test(l) && !BYPASS.test(l)) continue;
    for (const m of l.matchAll(/(?:#|reports\/)(\d{4,8})\b/g)) ids.add(Number(m[1]));
  }
  return [...ids];
}

/** Cuts a write-up into passages: one per heading where there are headings, otherwise by paragraph, kept to a readable size. */
export function passages(body, max = 1400) {
  const out = []; let heading = "", buf = "";
  const flush = () => { const t = buf.trim(); if (t.length >= 60) out.push({ heading, text: t }); buf = ""; };
  for (const block of body.replace(/\r/g, "").split(/\n{2,}/)) {
    const h = block.match(/^\s{0,3}(#{1,4}\s+|\*\*)([^\n*#]{2,90}?)(\*\*:?|:)?\s*$/);
    if (h) { flush(); heading = h[2].trim(); continue; }
    if (buf.length + block.length > max && buf.length > 200) flush();
    buf += (buf ? "\n\n" : "") + block.slice(0, max * 2);
  }
  flush();
  return out.slice(0, 40);
}

/** Payloads and commands quoted in a passage: fenced code first, then inline code. */
export function payloads(text, max = 4) {
  const found = [];
  for (const m of text.matchAll(/```[a-z]*\n?([\s\S]*?)```/g)) { const v = m[1].trim(); if (v.length >= 6) found.push(v.slice(0, 400)); }
  // Inline code counts only when it looks like code: no stray spaces at the ends (a sign of mismatched backticks) and some syntax in it.
  for (const m of text.replace(/```[\s\S]*?```/g, " ").matchAll(/`([^`\n]{6,300})`/g)) if (!/^\s|\s$/.test(m[1]) && /[<>(){}=\/:%&?$\[\]]/.test(m[1])) found.push(m[1]);
  return [...new Set(found)].slice(0, max);
}
