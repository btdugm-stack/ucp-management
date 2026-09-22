<?php
declare(strict_types=1);

// Koneksi PDO tunggal, sekaligus penyiapan skema saat pertama kali dipakai.
// Tujuannya agar aplikasi bisa dijalankan tanpa langkah migrasi manual:
// cukup pastikan MySQL menyala, database dan tabelnya dibuat sendiri.

function ucp_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = require __DIR__ . '/config.php';
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        // Tanpa batas waktu, permintaan ke MySQL yang mati menggantung lama
        // dan antarmuka hanya menampilkan "Menyimpan..." tanpa kepastian.
        // Tiga detik cukup untuk koneksi lokal dan cepat memberi kabar gagal.
        PDO::ATTR_TIMEOUT            => 3,
    ];

    // Sambungkan tanpa nama database dulu supaya database bisa dibuat
    // bila belum ada, lalu sambungkan ulang ke database tersebut.
    $root = sprintf('mysql:host=%s;port=%d;charset=%s', $cfg['host'], $cfg['port'], $cfg['charset']);
    $bootstrap = new PDO($root, $cfg['username'], $cfg['password'], $options);
    $bootstrap->exec(sprintf(
        'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        str_replace('`', '', $cfg['database'])
    ));

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $cfg['host'], $cfg['port'], $cfg['database'], $cfg['charset']);
    $pdo = new PDO($dsn, $cfg['username'], $cfg['password'], $options);

    ucp_migrate($pdo);

    return $pdo;
}

function ucp_migrate(PDO $pdo): void
{
    $exists = $pdo->query("SHOW TABLES LIKE 'projects'")->fetch();
    if ($exists) {
        ucp_add_missing_columns($pdo);
        return;
    }
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('Berkas schema.sql tidak dapat dibaca.');
    }
    // Buang komentar baris agar pemisahan pernyataan tidak terganggu.
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        $pdo->exec($statement);
    }
}

/**
 * Menambahkan kolom yang belum ada pada database yang terlanjur dibuat oleh
 * versi sebelumnya. schema.sql hanya dijalankan saat tabel belum ada, jadi
 * tanpa langkah ini pemasangan lama akan kehilangan kolom baru.
 */
function ucp_add_missing_columns(PDO $pdo): void
{
    $wanted = [
        'projects' => [
            'custom_working_days' => 'DECIMAL(6,2) NOT NULL DEFAULT 22',
            'custom_project_days' => 'DECIMAL(10,2) NOT NULL DEFAULT 120',
        ],
        'project_use_cases' => [
            'module_key' => "VARCHAR(20) NOT NULL DEFAULT ''",
        ],
    ];
    foreach ($wanted as $table => $columns) {
        $present = [];
        foreach ($pdo->query(sprintf('SHOW COLUMNS FROM %s', $table))->fetchAll() as $column) {
            $present[$column['Field']] = true;
        }
        foreach ($columns as $name => $definition) {
            if (!isset($present[$name])) {
                $pdo->exec(sprintf('ALTER TABLE %s ADD COLUMN `%s` %s', $table, $name, $definition));
            }
        }
    }
    ucp_add_missing_tables($pdo);
}

/**
 * Tabel yang lahir setelah pemasangan pertama. Pernyataan di schema.sql
 * seluruhnya memakai IF NOT EXISTS, jadi menjalankan ulang bagian yang
 * dibutuhkan aman dan tidak menyentuh tabel yang sudah berisi data.
 */
function ucp_add_missing_tables(PDO $pdo): void
{
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    if ($sql === false) {
        return;
    }
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        if (stripos($statement, 'CREATE TABLE IF NOT EXISTS project_modules') === 0) {
            $pdo->exec($statement);
        }
    }
}
