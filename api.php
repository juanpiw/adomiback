<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database configuration
$host = 'localhost';
$dbname = 'adomiapp_adomiapp';
$username = 'adomiapp_adomiapp_user';
$password = 'Lara888$$%';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

// Get request method and path
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Route handling
if ($method === 'POST' && $path === '/auth/register') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['email']) || !isset($input['password'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'email and password are required']);
        exit();
    }
    
    $email = $input['email'];
    $password = $input['password'];
    $role = $input['role'] ?? 'client';
    $name = $input['name'] ?? null;
    
    try {
        // Check if user exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'email already registered']);
            exit();
        }
        
        // Hash password
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
        
        // Create user
        $safeName = $name && trim($name) ? $name : explode('@', $email)[0];
        $stmt = $pdo->prepare("INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)");
        $stmt->execute([$email, $hashedPassword, $role, $safeName]);
        
        $userId = $pdo->lastInsertId();
        
        http_response_code(201);
        echo json_encode([
            'ok' => true, 
            'user' => [
                'id' => $userId,
                'email' => $email,
                'role' => $role,
                'name' => $safeName
            ]
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    
} elseif ($method === 'POST' && $path === '/auth/login') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['email']) || !isset($input['password'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'email and password are required']);
        exit();
    }
    
    $email = $input['email'];
    $password = $input['password'];
    
    try {
        $stmt = $pdo->prepare("SELECT id, email, password, role, name FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user || !password_verify($password, $user['password'])) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'invalid credentials']);
            exit();
        }
        
        echo json_encode([
            'ok' => true,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'role' => $user['role'],
                'name' => $user['name']
            ]
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    
} elseif ($method === 'GET' && $path === '/health') {
    echo json_encode(['ok' => true, 'status' => 'API is running']);
    
} else {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Endpoint not found']);
}
?>

