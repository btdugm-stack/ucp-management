<?php
declare(strict_types=1);

// Front controller REST. Dipakai oleh dua cara menjalankan aplikasi:
//   - Apache/Laragon : /ucp-management-local/api/projects  (lihat .htaccess)
//   - server bawaan  : php -S 127.0.0.1:8787 -t api api/index.php
// Keduanya ditangani dengan memotong segalanya sampai segmen /api.

require __DIR__ . '/db.php';
require __DIR__ . '/repo.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Aplikasi ini hanya dilayani secara lokal, jadi origin yang diizinkan
// dibatasi pada localhost supaya halaman lain tidak bisa memanggilnya.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin) === 1) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function ucp_send(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ucp_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        ucp_send(400, ['error' => 'Body permintaan bukan JSON yang valid.']);
    }
    return $data;
}

$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$cut  = strpos($uri, '/api');
$path = '/' . trim($cut === false ? $uri : substr($uri, $cut + 4), '/');
$segments = $path === '/' ? [] : explode('/', trim($path, '/'));

try {
    $pdo = ucp_db();

    // GET /  dan  GET /health
    if ($segments === [] || $segments === ['health']) {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn();
        ucp_send(200, ['ok' => true, 'service' => 'ucp-management-api', 'projects' => $count]);
    }

    if ($segments[0] !== 'projects') {
        ucp_send(404, ['error' => 'Endpoint tidak dikenal: ' . $path]);
    }

    // /projects
    if (count($segments) === 1) {
        if ($method === 'GET') {
            ucp_send(200, ['projects' => ucp_list_projects($pdo)]);
        }
        if ($method === 'POST') {
            $id = ucp_create_project($pdo, ucp_body());
            ucp_send(201, ['project' => ucp_get_project($pdo, $id)]);
        }
        ucp_send(405, ['error' => 'Metode tidak diizinkan untuk /projects.']);
    }

    $id = filter_var($segments[1], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) {
        ucp_send(400, ['error' => 'Id proyek tidak valid.']);
    }

    // /projects/{id}/duplicate
    if (count($segments) === 3 && $segments[2] === 'duplicate') {
        if ($method !== 'POST') {
            ucp_send(405, ['error' => 'Duplikasi memerlukan metode POST.']);
        }
        $new = ucp_duplicate_project($pdo, $id);
        if ($new === null) {
            ucp_send(404, ['error' => 'Proyek tidak ditemukan.']);
        }
        ucp_send(201, ['project' => ucp_get_project($pdo, $new)]);
    }

    if (count($segments) !== 2) {
        ucp_send(404, ['error' => 'Endpoint tidak dikenal: ' . $path]);
    }

    // /projects/{id}
    if ($method === 'GET') {
        $state = ucp_get_project($pdo, $id);
        if ($state === null) {
            ucp_send(404, ['error' => 'Proyek tidak ditemukan.']);
        }
        ucp_send(200, ['project' => $state]);
    }
    if ($method === 'PUT') {
        if (!ucp_save_project($pdo, $id, ucp_body())) {
            ucp_send(404, ['error' => 'Proyek tidak ditemukan.']);
        }
        ucp_send(200, ['project' => ucp_get_project($pdo, $id)]);
    }
    if ($method === 'DELETE') {
        if (!ucp_delete_project($pdo, $id)) {
            ucp_send(404, ['error' => 'Proyek tidak ditemukan.']);
        }
        ucp_send(200, ['deleted' => $id]);
    }
    ucp_send(405, ['error' => 'Metode tidak diizinkan untuk /projects/{id}.']);
} catch (PDOException $e) {
    ucp_send(503, ['error' => 'Database tidak dapat dihubungi. Pastikan MySQL berjalan.', 'detail' => $e->getMessage()]);
} catch (Throwable $e) {
    ucp_send(500, ['error' => 'Kesalahan server.', 'detail' => $e->getMessage()]);
}
