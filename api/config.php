<?php
// Konfigurasi koneksi database.
//
// Nilai baku mengikuti pemasangan Laragon standar (root tanpa kata sandi
// pada localhost). Untuk lingkungan lain, salin berkas ini menjadi
// config.local.php dan ubah seperlunya — config.local.php tidak ikut
// masuk ke version control.

$config = [
    'host'     => getenv('UCP_DB_HOST') ?: '127.0.0.1',
    'port'     => (int) (getenv('UCP_DB_PORT') ?: 3306),
    'database' => getenv('UCP_DB_NAME') ?: 'ucp_management',
    'username' => getenv('UCP_DB_USER') ?: 'root',
    'password' => getenv('UCP_DB_PASS') !== false ? getenv('UCP_DB_PASS') : '',
    'charset'  => 'utf8mb4',
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_merge($config, require $local);
}

return $config;
