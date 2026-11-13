// Groups HackerOne weakness names into the classes shown at the top level of the map.
export type ClassDef = { id: string; name: string; match: RegExp };

export const CLASSES: ClassDef[] = [
  { id: "XSS", name: "Cross-site Scripting", match: /cross-site scripting|\bxss\b/i },
  { id: "CSRF", name: "Cross-Site Request Forgery", match: /cross-site request forgery|\bcsrf\b/i },
  { id: "SSRF", name: "Server-Side Request Forgery", match: /server-side request forgery|\bssrf\b/i },
  { id: "SQLI", name: "SQL Injection", match: /sql injection/i },
  { id: "IDOR", name: "Insecure Direct Object Reference", match: /insecure direct object|\bidor\b/i },
  { id: "RCE", name: "Code Execution", match: /code injection|command injection|os command|remote code|deserialization|template injection|remote file inclusion|unrestricted upload|without integrity check|untrusted control sphere|malware|dangerous (method|function)/i },
  { id: "TRAV", name: "Path Traversal", match: /path traversal|file inclusion|directory traversal|link following|file name or path|search path|resource in another sphere/i },
  { id: "AUTH", name: "Authentication", match: /authentication|brute force|session fixation|password|credential|session expiration|2fa|reliance on cookies/i },
  { id: "ACL", name: "Access Control", match: /access control|authorization|privilege|permission|forced browsing|client-side enforcement|untrusted inputs in a security decision|export of android/i },
  { id: "INFO", name: "Information Disclosure", match: /information disclosure|information exposure|cleartext|sensitive|exposure|privacy|plaintext|debug code/i },
  { id: "REDIR", name: "Open Redirect", match: /open redirect|url redirection/i },
  { id: "LOGIC", name: "Business Logic", match: /business logic|race condition|time-of-check|toctou|assumed-immutable|expected behavior|incorrect comparison|critical state data|partial string comparison/i },
  { id: "MEM", name: "Memory Corruption", match: /buffer|overflow|underflow|out-of-bounds|use after free|memory|double free|null pointer|null termination|integer|uninitialized|type confusion|off-by-one|format string|write-what-where/i },
  { id: "DOS", name: "Denial of Service", match: /denial of service|resource consumption|uncontrolled recursion|resource exhaustion|allocation of resources|throttling|entity expansion|unreachable exit/i },
  { id: "INJ", name: "Injection and Smuggling", match: /injection|crlf|smuggling|response splitting|xml external|\bxxe\b|input validation|neutralization|url encoding|csv file/i },
  { id: "CRYPTO", name: "Cryptography", match: /cryptograph|certificate|weak|random|\bssl\b|\btls\b|man-in-the-middle|hash|encryption|data authenticity|key past|reverse dns/i },
  { id: "CONF", name: "Misconfiguration", match: /misconfiguration|secure design|ui redress|clickjacking|phishing|spoofing|subdomain takeover|cors|origin|logging|obscurity|known vulnerabilities|temporary file|cache poisoning|misrepresentation|exceptional conditions|extraneous untrusted/i },
];
export const OTHER: ClassDef = { id: "OTHER", name: "Other weaknesses", match: /.*/ };

export function classOf(weakness: string | null): ClassDef {
  if (!weakness) return OTHER;
  return CLASSES.find((c) => c.match.test(weakness)) ?? OTHER;
}

// Phrases that show a report is talking about a class, used to link classes that appear in the same report.
export const MENTIONS: { id: string; re: RegExp }[] = [
  { id: "XSS", re: /\bxss\b|cross.site scripting/i },
  { id: "CSRF", re: /\bcsrf\b|cross.site request forgery/i },
  { id: "SSRF", re: /\bssrf\b|server.side request forgery/i },
  { id: "SQLI", re: /sql injection|\bsqli\b/i },
  { id: "IDOR", re: /\bidor\b|insecure direct object/i },
  { id: "RCE", re: /\brce\b|remote code execution|command injection|arbitrary code/i },
  { id: "TRAV", re: /path traversal|directory traversal|\blfi\b|local file inclusion/i },
  { id: "AUTH", re: /account takeover|authentication bypass|2fa bypass|password reset|session hijack/i },
  { id: "ACL", re: /privilege escalation|access control|authorization bypass|unauthori[sz]ed access/i },
  { id: "INFO", re: /information disclosure|information leak|sensitive (data|information)|\bpii\b/i },
  { id: "REDIR", re: /open redirect/i },
  { id: "LOGIC", re: /race condition|business logic/i },
  { id: "MEM", re: /buffer overflow|use.after.free|out.of.bounds|memory corruption|heap overflow/i },
  { id: "DOS", re: /denial of service|\bdos\b/i },
  { id: "INJ", re: /\bcrlf\b|request smuggling|\bxxe\b|header injection/i },
  { id: "CRYPTO", re: /certificate validation|cryptograph|weak cipher/i },
  { id: "CONF", re: /subdomain takeover|clickjacking|misconfigur|\bcors\b/i },
];

export const SEVERITIES = ["none", "low", "medium", "high", "critical"] as const;
export const sevIndex = (s: string | null) => Math.max(0, SEVERITIES.indexOf((s || "none") as (typeof SEVERITIES)[number]));

// For reports the program filed without a weakness: the closest HackerOne weakness, judged from the title.
export const TITLE_RULES: [RegExp, string][] = [
  [/(stored|persistent).{0,20}(xss|cross.?site scripting)|(xss|cross.?site scripting).{0,20}(stored|persistent)/i, "Cross-site Scripting (XSS) - Stored"],
  [/reflected.{0,20}(xss|cross.?site scripting)|(xss|cross.?site scripting).{0,20}reflected/i, "Cross-site Scripting (XSS) - Reflected"],
  [/dom.{0,12}(xss|cross.?site scripting)/i, "Cross-site Scripting (XSS) - DOM"],
  [/\bxss\b|cross.?site scripting|html injection|script injection/i, "Cross-site Scripting (XSS) - Generic"],
  [/\bcsrf\b|\bxsrf\b|cross.?site request forgery/i, "Cross-Site Request Forgery (CSRF)"],
  [/\bssrf\b|server.?side request forgery/i, "Server-Side Request Forgery (SSRF)"],
  [/sql injection|\bsqli\b/i, "SQL Injection"],
  [/\bidor\b|insecure direct object/i, "Insecure Direct Object Reference (IDOR)"],
  [/open redirect|unvalidated redirect|url redirect|redirection/i, "Open Redirect"],
  [/request smuggling/i, "HTTP Request Smuggling"],
  [/\bcrlf\b|header injection|response splitting/i, "CRLF Injection"],
  [/\bxxe\b|xml external/i, "XML External Entities (XXE)"],
  [/\brce\b|remote code execution|code execution|command injection|command execution|arbitrary code/i, "Code Injection"],
  [/path traversal|directory traversal|\blfi\b|local file|arbitrary file (read|access)/i, "Path Traversal"],
  [/click.?jacking|x-frame-options|ui redress/i, "UI Redressing (Clickjacking)"],
  [/brute.?force|rate.?limit|captcha|lockout/i, "Improper Restriction of Authentication Attempts"],
  [/privilege escalation|escalat/i, "Privilege Escalation"],
  [/2fa|two.?factor|password|log.?in|sign.?in|authenticat|session|oauth|account takeover|token/i, "Improper Authentication - Generic"],
  [/access control|unauthori[sz]ed|permission|authorization|without (permission|being)|restricted|private|can (view|read|see|delete|edit|modify|access)|bypass/i, "Improper Access Control - Generic"],
  [/subdomain takeover|\bspf\b|dmarc|\bdns\b|misconfig|\bcors\b|missing .{0,30}(header|flag)|security headers?|hsts|cookie/i, "Misconfiguration"],
  [/ssl|tls|certificate|crypto|cipher|heartbleed|poodle|\bmitm\b/i, "Cryptographic Issues - Generic"],
  [/overflow|out.of.bounds|use.after.free|memory corruption|heap|segfault|double free|null pointer|oob/i, "Memory Corruption - Generic"],
  [/denial of service|\bdos\b|\bddos\b|crash|resource exhaustion|infinite loop|hang/i, "Uncontrolled Resource Consumption"],
  [/race condition|business logic|logic (flaw|error|bug)|payment|price|coupon|free |unlimited/i, "Business Logic Errors"],
  [/disclos|leak|expos|sensitive|information|enumerat|visible|reveal/i, "Information Disclosure"],
  [/spoof|phishing|homograph|tabnabbing|content injection|text injection/i, "Violation of Secure Design Principles"],
  [/injection/i, "Code Injection"],
];
export function guessWeakness(title: string): string {
  for (const [re, name] of TITLE_RULES) if (re.test(title)) return name;
  return "";
}

/** How the program closed a report. HackerOne calls a valid report "resolved"; a report whose details are not stored has no status. */
export const STATUSES: [key: string, label: string, substate: string][] = [
  ["valid", "Valid", "resolved"], ["informative", "Informative", "informative"], ["na", "N/A", "not-applicable"], ["duplicate", "Duplicate", "duplicate"], ["spam", "Spam", "spam"],
];
export const statusLabel = (substate: string | null | undefined) => STATUSES.find((x) => x[2] === substate)?.[1] ?? null;
