/**
 * Copies repo-root .env → mobile/.env so Expo (project root) and app.config stay aligned.
 * Run: node scripts/sync-env.cjs
 */
const fs = require('fs')
const path = require('path')

const rootEnv = path.resolve(__dirname, '../../.env')
const mobileEnv = path.resolve(__dirname, '../.env')

if (!fs.existsSync(rootEnv)) {
  console.error('[sync-env] Missing root .env at', rootEnv)
  process.exit(1)
}

const content = fs.readFileSync(rootEnv, 'utf8')
const header = '# ARISE Mobile (Expo) — auto-synced from ../.env\n'
fs.writeFileSync(mobileEnv, header + content.trim() + '\n', 'utf8')
console.log('[sync-env] Wrote', mobileEnv)
