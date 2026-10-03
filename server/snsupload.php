<?php
/**
 * Snip n Share upload endpoint — place at https://g84.bid/snsupload.php
 *
 * Expects:  POST multipart/form-data, field "file" (JPG or PNG), header X-Api-Key
 * Returns:  {"ok":true,"url":"https://g84.bid/i/aB3kZ9xQ.jpg"}
 * GET with a valid key returns {"ok":true,"message":"..."} (used by the Test button).
 *
 * Setup:
 *   1. Set API_KEY below to a long random string (e.g. `openssl rand -hex 24`)
 *      and put the same value in the app under Settings > Upload > Custom host.
 *   2. mkdir i && chown www-data:www-data i   (next to this file)
 *   3. nginx: make sure /i/ is served statically and PHP isn't executed there:
 *        location /i/ { location ~ \.php$ { return 404; } }
 *   4. Optionally raise client_max_body_size (nginx) and upload_max_filesize /
 *      post_max_size (php.ini) above 10M.
 */

const API_KEY    = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
const UPLOAD_DIR = __DIR__ . '/i';          // filesystem path
const PUBLIC_URL = 'https://g84.bid/i';     // URL that maps to UPLOAD_DIR
const MAX_BYTES  = 25 * 1024 * 1024;        // 25 MB
const NAME_LEN   = 8;                       // random filename length

header('Content-Type: application/json');
header('Cache-Control: no-store');

function out(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

// --- auth ---
$key = $_SERVER['HTTP_X_API_KEY'] ?? ($_POST['key'] ?? '');
if (API_KEY === '' || str_starts_with(API_KEY, 'CHANGE_ME') || strlen(API_KEY) < 16) {
    out(['ok' => false, 'error' => 'Server not configured: set API_KEY in snsupload.php'], 500);
}
if (!is_string($key) || !hash_equals(API_KEY, $key)) {
    out(['ok' => false, 'error' => 'Unauthorized'], 401);
}

// --- test ping ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $writable = is_dir(UPLOAD_DIR) && is_writable(UPLOAD_DIR);
    out([
        'ok'      => $writable,
        'message' => $writable ? 'Key accepted, upload folder is writable.' : 'Key accepted, but ' . UPLOAD_DIR . ' is missing or not writable.',
        'error'   => $writable ? null : 'Upload folder not writable',
    ], $writable ? 200 : 500);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(['ok' => false, 'error' => 'Method not allowed'], 405);
}

// --- validate upload ---
if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
    $phpErr = $_FILES['file']['error'] ?? 'none';
    out(['ok' => false, 'error' => "No file received (php error code: $phpErr)"], 400);
}
$f = $_FILES['file'];
if ($f['size'] <= 0 || $f['size'] > MAX_BYTES) {
    out(['ok' => false, 'error' => 'File too large or empty'], 413);
}

$info = @getimagesize($f['tmp_name']);
if ($info === false) {
    out(['ok' => false, 'error' => 'Not an image'], 415);
}
$ext = match ($info[2]) {
    IMAGETYPE_JPEG => 'jpg',
    IMAGETYPE_PNG  => 'png',
    default        => null,
};
if ($ext === null) {
    out(['ok' => false, 'error' => 'Only JPG and PNG are accepted'], 415);
}

// --- store ---
if (!is_dir(UPLOAD_DIR) && !@mkdir(UPLOAD_DIR, 0755, true)) {
    out(['ok' => false, 'error' => 'Upload folder missing and could not be created'], 500);
}

$alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
do {
    $name = '';
    for ($i = 0; $i < NAME_LEN; $i++) {
        $name .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    $dest = UPLOAD_DIR . '/' . $name . '.' . $ext;
} while (file_exists($dest));

if (!move_uploaded_file($f['tmp_name'], $dest)) {
    out(['ok' => false, 'error' => 'Could not save file'], 500);
}
@chmod($dest, 0644);

out([
    'ok'     => true,
    'url'    => PUBLIC_URL . '/' . $name . '.' . $ext,
    'name'   => $name . '.' . $ext,
    'width'  => $info[0],
    'height' => $info[1],
    'bytes'  => $f['size'],
]);
