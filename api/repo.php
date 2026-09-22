<?php
declare(strict_types=1);

// Pemetaan antara tabel relasional dan bentuk state yang dipakai SPA.
// Bentuk yang dikembalikan sengaja identik dengan state di browser, supaya
// normalize() di src/state.js tetap menjadi satu-satunya penjaga skema di
// sisi klien dan tidak perlu ada dua definisi bentuk data yang bisa melenceng.

const UCP_STATUSES   = ['Draft', 'Assessment', 'Calculated', 'Reviewed', 'Approved', 'Baselined'];
const UCP_LEVELS     = ['Low', 'Medium', 'High'];
const UCP_COMPLEXITY = ['Simple', 'Average', 'Complex'];

function ucp_str($v, int $max = 200): string
{
    $s = is_scalar($v) ? trim((string) $v) : '';
    return mb_substr($s, 0, $max);
}

function ucp_num($v, float $min, float $max, float $fallback = 0): float
{
    if (!is_numeric($v)) {
        return $fallback;
    }
    return max($min, min($max, (float) $v));
}

function ucp_pick($v, array $allowed, string $fallback): string
{
    $s = is_string($v) ? $v : '';
    return in_array($s, $allowed, true) ? $s : $fallback;
}

function ucp_date($v): ?string
{
    $s = is_string($v) ? trim($v) : '';
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) === 1 ? $s : null;
}

/**
 * Timestamp dibaca sebagai epoch lewat UNIX_TIMESTAMP() agar konversinya
 * ditangani MySQL. Membaca kolom DATETIME sebagai teks lalu menafsirkannya
 * di PHP akan meleset ketika zona waktu PHP dan MySQL berbeda.
 */
function ucp_iso($unixTimestamp): ?string
{
    if ($unixTimestamp === null || $unixTimestamp === '') {
        return null;
    }
    return gmdate('Y-m-d\TH:i:s\Z', (int) $unixTimestamp);
}

/** Ringkasan untuk daftar proyek di halaman start. */
function ucp_list_projects(PDO $pdo): array
{
    $sql = 'SELECT p.id, p.code, p.name, p.status,
                   UNIX_TIMESTAMP(p.created_at) AS created_ts,
                   UNIX_TIMESTAMP(p.updated_at) AS updated_ts,
                   (SELECT COUNT(*) FROM project_actors a WHERE a.project_id = p.id)    AS actors,
                   (SELECT COUNT(*) FROM project_use_cases u WHERE u.project_id = p.id) AS use_cases
            FROM projects p
            ORDER BY p.updated_at DESC, p.id DESC';
    $rows = $pdo->query($sql)->fetchAll();

    return array_map(static fn(array $r): array => [
        'id'        => (int) $r['id'],
        'code'      => $r['code'],
        'name'      => $r['name'],
        'status'    => $r['status'],
        'actors'    => (int) $r['actors'],
        'useCases'  => (int) $r['use_cases'],
        'createdAt' => ucp_iso($r['created_ts']),
        'savedAt'   => ucp_iso($r['updated_ts']),
    ], $rows);
}

function ucp_get_project(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT p.*, UNIX_TIMESTAMP(p.updated_at) AS updated_ts FROM projects p WHERE p.id = ?');
    $stmt->execute([$id]);
    $p = $stmt->fetch();
    if (!$p) {
        return null;
    }

    $children = static function (string $sql) use ($pdo, $id): array {
        $s = $pdo->prepare($sql);
        $s->execute([$id]);
        return $s->fetchAll();
    };

    $actors = array_map(static fn(array $r): array => [
        'id'   => (string) $r['id'],
        'name' => $r['name'],
        'type' => $r['type'],
        'qty'  => (float) $r['qty'],
    ], $children('SELECT * FROM project_actors WHERE project_id = ? ORDER BY sort_order, id'));

    $modules = array_map(static fn(array $r): array => [
        'key'  => $r['module_key'],
        'code' => $r['code'],
        'name' => $r['name'],
    ], $children('SELECT * FROM project_modules WHERE project_id = ? ORDER BY sort_order, id'));

    $useCases = array_map(static fn(array $r): array => [
        'id'           => (string) $r['id'],
        'code'         => $r['code'],
        'name'         => $r['name'],
        'actor'        => $r['actor'],
        'transactions' => (float) $r['transactions'],
        'type'         => $r['type'],
        'override'     => (bool) $r['is_override'],
        'module'       => (string) ($r['module_key'] ?? ''),
    ], $children('SELECT * FROM project_use_cases WHERE project_id = ? ORDER BY sort_order, id'));

    $factors = ['technical' => [], 'environmental' => []];
    foreach ($children('SELECT * FROM project_factors WHERE project_id = ? ORDER BY sort_order, id') as $r) {
        $factors[$r['kind']][] = ['id' => $r['factor_code'], 'rating' => (float) $r['rating']];
    }

    $phases = array_map(static fn(array $r): array => [
        'name'   => $r['name'],
        'weight' => (float) $r['weight'],
    ], $children('SELECT * FROM project_phases WHERE project_id = ? ORDER BY sort_order, id'));

    $roles = array_map(static fn(array $r): array => [
        'id'         => (string) $r['id'],
        'name'       => $r['name'],
        'rate'       => (float) $r['rate'],
        'fte'        => (float) $r['fte'],
        'allocation' => (float) $r['allocation'],
    ], $children('SELECT * FROM project_roles WHERE project_id = ? ORDER BY sort_order, id'));

    return [
        'id'      => (int) $p['id'],
        'version' => 2,
        'savedAt' => ucp_iso($p['updated_ts']),
        'project' => [
            'code'        => $p['code'],
            'name'        => $p['name'],
            'sponsor'     => $p['sponsor'],
            'owner'       => $p['owner'],
            'manager'     => $p['manager'],
            'description' => (string) $p['description'],
            'start'       => (string) ($p['start_date'] ?? ''),
            'target'      => (string) ($p['target_date'] ?? ''),
            'status'      => $p['status'],
        ],
        'actors'   => $actors,
        'modules'  => $modules,
        'useCases' => $useCases,
        'tf'       => $factors['technical'],
        'ef'       => $factors['environmental'],
        'params'   => [
            'phm'          => (float) $p['phm'],
            'hours'        => (float) $p['hours_per_day'],
            'days'         => (float) $p['days_per_month'],
            'targetMonths' => (float) $p['target_months'],
        ],
        'phases' => $phases,
        'roles'  => $roles,
        'extras' => [
            'infrastructure' => (float) $p['cost_infrastructure'],
            'license'        => (float) $p['cost_license'],
            'training'       => (float) $p['cost_training'],
            'migration'      => (float) $p['cost_migration'],
        ],
        'custom' => [
            'workingDays' => (float) $p['custom_working_days'],
            'projectDays' => (float) $p['custom_project_days'],
        ],
        'feas' => [
            'technical'      => $p['feas_technical'],
            'economic'       => $p['feas_economic'],
            'organizational' => $p['feas_organizational'],
            'notes'          => (string) $p['feas_notes'],
        ],
    ];
}

function ucp_create_project(PDO $pdo, array $state): int
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO projects (code, name) VALUES (?, ?)')
            ->execute([ucp_str($state['project']['code'] ?? '', 50), ucp_str($state['project']['name'] ?? 'Proyek Baru')]);
        $id = (int) $pdo->lastInsertId();
        ucp_write_project($pdo, $id, $state);
        $pdo->commit();
        return $id;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function ucp_save_project(PDO $pdo, int $id, array $state): bool
{
    $stmt = $pdo->prepare('SELECT id FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        return false;
    }
    $pdo->beginTransaction();
    try {
        ucp_write_project($pdo, $id, $state);
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Menulis seluruh isi proyek. Baris anak diganti total di dalam satu
 * transaksi: untuk ukuran data estimasi, mengganti lebih sederhana dan
 * lebih sulit salah daripada menyelisih baris satu per satu.
 */
function ucp_write_project(PDO $pdo, int $id, array $state): void
{
    $p      = is_array($state['project'] ?? null) ? $state['project'] : [];
    $params = is_array($state['params'] ?? null) ? $state['params'] : [];
    $extras = is_array($state['extras'] ?? null) ? $state['extras'] : [];
    $feas   = is_array($state['feas'] ?? null) ? $state['feas'] : [];
    $custom = is_array($state['custom'] ?? null) ? $state['custom'] : [];

    $pdo->prepare(
        'UPDATE projects SET code = ?, name = ?, sponsor = ?, owner = ?, manager = ?, description = ?,
                start_date = ?, target_date = ?, status = ?,
                phm = ?, hours_per_day = ?, days_per_month = ?, target_months = ?,
                feas_technical = ?, feas_economic = ?, feas_organizational = ?, feas_notes = ?,
                cost_infrastructure = ?, cost_license = ?, cost_training = ?, cost_migration = ?,
                custom_working_days = ?, custom_project_days = ?
         WHERE id = ?'
    )->execute([
        ucp_str($p['code'] ?? '', 50),
        ucp_str($p['name'] ?? ''),
        ucp_str($p['sponsor'] ?? ''),
        ucp_str($p['owner'] ?? ''),
        ucp_str($p['manager'] ?? ''),
        ucp_str($p['description'] ?? '', 65535),
        ucp_date($p['start'] ?? null),
        ucp_date($p['target'] ?? null),
        ucp_pick($p['status'] ?? null, UCP_STATUSES, 'Draft'),
        ucp_num($params['phm'] ?? null, 0, 1000, 20),
        ucp_num($params['hours'] ?? null, 1, 24, 8),
        ucp_num($params['days'] ?? null, 1, 31, 22),
        ucp_num($params['targetMonths'] ?? null, 0, 600, 10),
        ucp_pick($feas['technical'] ?? null, UCP_LEVELS, 'Medium'),
        ucp_pick($feas['economic'] ?? null, UCP_LEVELS, 'Medium'),
        ucp_pick($feas['organizational'] ?? null, UCP_LEVELS, 'Medium'),
        ucp_str($feas['notes'] ?? '', 65535),
        ucp_num($extras['infrastructure'] ?? null, 0, 1e12),
        ucp_num($extras['license'] ?? null, 0, 1e12),
        ucp_num($extras['training'] ?? null, 0, 1e12),
        ucp_num($extras['migration'] ?? null, 0, 1e12),
        ucp_num($custom['workingDays'] ?? null, 1, 31, 22),
        ucp_num($custom['projectDays'] ?? null, 1, 1e5, 120),
        $id,
    ]);

    foreach (['project_actors', 'project_use_cases', 'project_factors', 'project_phases', 'project_roles', 'project_modules'] as $table) {
        $pdo->prepare("DELETE FROM {$table} WHERE project_id = ?")->execute([$id]);
    }

    $rows = static fn($v): array => is_array($v) ? array_values(array_filter($v, 'is_array')) : [];

    $insertActor = $pdo->prepare('INSERT INTO project_actors (project_id, sort_order, name, type, qty) VALUES (?, ?, ?, ?, ?)');
    foreach ($rows($state['actors'] ?? null) as $i => $a) {
        $insertActor->execute([$id, $i, ucp_str($a['name'] ?? ''), ucp_pick($a['type'] ?? null, UCP_COMPLEXITY, 'Simple'), (int) ucp_num($a['qty'] ?? null, 0, 9999)]);
    }

    // Modul ditulis lebih dulu agar kuncinya dapat dipakai menyaring rujukan
    // use case, sehingga tidak ada use case yang menunjuk modul yang hilang.
    $moduleKeys = [];
    $insertModule = $pdo->prepare('INSERT INTO project_modules (project_id, sort_order, module_key, code, name) VALUES (?, ?, ?, ?, ?)');
    foreach ($rows($state['modules'] ?? null) as $i => $m) {
        $key = ucp_str($m['key'] ?? '', 20);
        if ($key === '' || isset($moduleKeys[$key])) {
            continue;
        }
        $moduleKeys[$key] = true;
        $insertModule->execute([$id, $i, $key, ucp_str($m['code'] ?? '', 50), ucp_str($m['name'] ?? '')]);
    }

    $insertUseCase = $pdo->prepare('INSERT INTO project_use_cases (project_id, sort_order, code, name, actor, transactions, type, is_override, module_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($rows($state['useCases'] ?? null) as $i => $u) {
        $module = ucp_str($u['module'] ?? '', 20);
        $insertUseCase->execute([
            $id, $i,
            ucp_str($u['code'] ?? '', 50),
            ucp_str($u['name'] ?? ''),
            ucp_str($u['actor'] ?? ''),
            (int) ucp_num($u['transactions'] ?? null, 0, 999),
            ucp_pick($u['type'] ?? null, UCP_COMPLEXITY, 'Simple'),
            !empty($u['override']) ? 1 : 0,
            isset($moduleKeys[$module]) ? $module : '',
        ]);
    }

    $insertFactor = $pdo->prepare('INSERT INTO project_factors (project_id, kind, factor_code, rating, sort_order) VALUES (?, ?, ?, ?, ?)');
    foreach (['tf' => 'technical', 'ef' => 'environmental'] as $key => $kind) {
        foreach ($rows($state[$key] ?? null) as $i => $f) {
            $code = ucp_str($f['id'] ?? '', 5);
            if ($code === '') {
                continue;
            }
            $insertFactor->execute([$id, $kind, $code, ucp_num($f['rating'] ?? null, -5, 5, 3), $i]);
        }
    }

    $insertPhase = $pdo->prepare('INSERT INTO project_phases (project_id, sort_order, name, weight) VALUES (?, ?, ?, ?)');
    foreach ($rows($state['phases'] ?? null) as $i => $ph) {
        $insertPhase->execute([$id, $i, ucp_str($ph['name'] ?? '', 100), ucp_num($ph['weight'] ?? null, 0, 100)]);
    }

    $insertRole = $pdo->prepare('INSERT INTO project_roles (project_id, sort_order, name, rate, fte, allocation) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($rows($state['roles'] ?? null) as $i => $r) {
        $insertRole->execute([$id, $i, ucp_str($r['name'] ?? ''), ucp_num($r['rate'] ?? null, 0, 1e12), ucp_num($r['fte'] ?? null, 0, 999), ucp_num($r['allocation'] ?? null, 0, 100)]);
    }
}

function ucp_delete_project(PDO $pdo, int $id): bool
{
    $stmt = $pdo->prepare('DELETE FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->rowCount() > 0;
}

function ucp_duplicate_project(PDO $pdo, int $id): ?int
{
    $state = ucp_get_project($pdo, $id);
    if ($state === null) {
        return null;
    }
    $state['project']['name']   = ucp_str(($state['project']['name'] ?: 'Proyek') . ' (salinan)');
    $state['project']['status'] = 'Draft';
    return ucp_create_project($pdo, $state);
}
