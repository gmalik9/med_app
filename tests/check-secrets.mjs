import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
// Deliberately narrow, reproducible checks. Not a replacement for a dedicated
// full-history secret scanner or credential rotation after a real disclosure.
const patterns = {
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  google_api_key: /AIza[0-9A-Za-z_-]{30,}/,
  aws_access_key: /AKIA[0-9A-Z]{16}/,
  github_token: /gh[pousr]_[A-Za-z0-9]{30,}/,
};
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
let matches = 0;
for (const file of new Set(files)) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  for (const [kind, pattern] of Object.entries(patterns)) {
    if (!pattern.test(content)) continue;
    console.error(`${file}: possible ${kind}; value REDACTED`);
    matches++;
  }
}
console.log(`Structured secret-pattern check: ${matches} matches; ignored local configuration not inspected`);
process.exitCode = matches ? 1 : 0;