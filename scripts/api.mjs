// Menjalankan REST API lewat server bawaan PHP.
//
// PHP bawaan Laragon tidak otomatis masuk PATH, jadi skrip ini mencarinya
// sendiri: variabel lingkungan UCP_PHP lebih dulu, lalu PATH, lalu folder
// bin Laragon dan XAMPP. Dengan begitu perintahnya tetap `npm run api`
// tanpa perlu mengubah konfigurasi sistem.

import {existsSync, readdirSync, statSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';

const HOST = process.env.UCP_API_HOST || '127.0.0.1';
const PORT = process.env.UCP_API_PORT || '8787';
const ROOT = path.resolve(import.meta.dirname, '..');

const works = exe => {
  try {
    return spawnSync(exe, ['-v'], {stdio: 'ignore', windowsHide: true}).status === 0;
  } catch {
    return false;
  }
};

// Folder PHP Laragon memuat versinya pada nama (php-8.3.16-Win32-vs16-x64),
// jadi daftarnya diurutkan menurun agar versi terbaru yang dipakai.
const scan = dir => {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .map(name => path.join(dir, name))
      .filter(p => {try {return statSync(p).isDirectory()} catch {return false}})
      .sort()
      .reverse()
      .map(p => path.join(p, 'php.exe'));
  } catch {
    return [];
  }
};

const candidates = [
  process.env.UCP_PHP,
  'php',
  ...scan('C:/laragon/bin/php'),
  ...scan('C:/laragon/bin/php8'),
  'C:/xampp/php/php.exe',
  '/usr/bin/php',
].filter(Boolean);

const php = candidates.find(exe => (exe === 'php' || existsSync(exe)) && works(exe));

if (!php) {
  console.error(`
Tidak menemukan PHP yang dapat dijalankan.

Yang dicoba:
${candidates.map(c => '  - ' + c).join('\n')}

Nyalakan Laragon, atau tunjuk PHP secara langsung:
  PowerShell : $env:UCP_PHP = "C:\\laragon\\bin\\php\\php-8.3.16-Win32-vs16-x64\\php.exe"; npm run api
  Bash       : UCP_PHP=/c/laragon/bin/php/php-8.3.16-Win32-vs16-x64/php.exe npm run api
`);
  process.exit(1);
}

console.log(`PHP    : ${php}`);
console.log(`API    : http://${HOST}:${PORT}`);
console.log(`Health : http://${HOST}:${PORT}/health\n`);

const child = spawn(php, ['-S', `${HOST}:${PORT}`, '-t', path.join(ROOT, 'api'), path.join(ROOT, 'api', 'index.php')], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
