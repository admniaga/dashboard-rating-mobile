/**
 * screenshot-telegram.js
 * Ambil screenshot tabel UP3 dashboard Rating PLN Mobile
 * lalu kirim ke Telegram via Bot API.
 *
 * Dijalankan otomatis oleh GitHub Actions setiap pagi 07.00 WIB.
 *
 * Env vars yang dibutuhkan:
 *   TELEGRAM_TOKEN   — Token bot dari @BotFather
 *   TELEGRAM_CHAT_ID — Chat ID tujuan (pribadi atau grup)
 *   DASHBOARD_URL    — URL dashboard di GitHub Pages
 */

const { chromium } = require('playwright');
const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DASHBOARD_URL    = process.env.DASHBOARD_URL;
const SCREENSHOT_PATH  = path.join('/tmp', 'up3_rating.png');

// ── Helper: format tanggal Indonesia ─────────────────────────────────────────
function today_id() {
  return new Date().toLocaleDateString('id-ID', {
    weekday  : 'long',
    day      : 'numeric',
    month    : 'long',
    year     : 'numeric',
    timeZone : 'Asia/Jakarta',
  });
}

// ── Helper: kirim foto ke Telegram ───────────────────────────────────────────
function send_photo(token, chat_id, photo_path, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----TGBoundary' + Math.random().toString(36).slice(2);
    const photo_data = fs.readFileSync(photo_path);
    const file_name  = path.basename(photo_path);

    const parts = [
      // chat_id
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
        `${chat_id}\r\n`
      ),
      // parse_mode
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="parse_mode"\r\n\r\n` +
        `Markdown\r\n`
      ),
      // caption
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="caption"\r\n\r\n` +
        `${caption}\r\n`
      ),
      // photo file
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="photo"; filename="${file_name}"\r\n` +
        `Content-Type: image/png\r\n\r\n`
      ),
      photo_data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];

    const body = Buffer.concat(parts);

    const options = {
      hostname: 'api.telegram.org',
      path    : `/bot${token}/sendPhoto`,
      method  : 'POST',
      headers : {
        'Content-Type'  : `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.ok) {
          console.log('[Telegram] Foto terkirim ✅');
          resolve(parsed);
        } else {
          reject(new Error('[Telegram] Gagal: ' + JSON.stringify(parsed)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Validasi env
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID || !DASHBOARD_URL) {
    console.error('❌  Set env vars: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, DASHBOARD_URL');
    process.exit(1);
  }

  console.log('🌐  Membuka dashboard:', DASHBOARD_URL);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx     = await browser.newContext({
    viewport   : { width: 1280, height: 900 },
    locale     : 'id-ID',
    timezoneId : 'Asia/Jakarta',
  });
  const page = await ctx.newPage();

  try {
    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Tunggu tabel UP3 selesai dimuat
    console.log('⏳  Menunggu data tabel UP3 dimuat...');
    await page.waitForFunction(
      () => document.querySelectorAll('table tbody tr').length >= 5,
      { timeout: 40_000 }
    );
    await page.waitForTimeout(3000);

    // Coba ambil elemen tabel UP3 secara spesifik
    const selectors = ['#rankTable', '#tabelUP3', '.up3-section', 'main table'];
    let el = null;
    for (const sel of selectors) {
      try {
        el = await page.$(sel);
        if (el) { console.log('✅  Elemen:', sel); break; }
      } catch (_) {}
    }

    if (el) {
      await el.screenshot({ path: SCREENSHOT_PATH });
    } else {
      // Fallback: screenshot area utama halaman
      console.log('ℹ️   Fallback screenshot halaman utama');
      await page.screenshot({
        path    : SCREENSHOT_PATH,
        fullPage: true,
        clip    : { x: 0, y: 80, width: 1280, height: 820 },
      });
    }

    console.log('📸  Screenshot:', SCREENSHOT_PATH);
  } finally {
    await browser.close();
  }

  // Kirim ke Telegram
  const tgl     = today_id();
  const caption =
    `📊 *Rating PLN Mobile — ${tgl}*\n\n` +
    `Rekapitulasi tabel UP3 UID Jawa Barat\\.`;

  console.log('📨  Mengirim ke Telegram chat_id:', TELEGRAM_CHAT_ID);
  await send_photo(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, SCREENSHOT_PATH, caption);
  console.log('✅  Selesai');
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
