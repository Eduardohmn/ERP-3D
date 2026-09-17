<?php
// Configurações de cabeçalho para aceitar requisições e devolver JSON
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Lida com a requisição de preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Conexão com o banco SQLite (o arquivo será criado automaticamente nesta pasta)
$dbFile = __DIR__ . '/banco.sqlite';
$pdo = new PDO('sqlite:' . $dbFile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Cria a tabela para guardar o JSON do seu sistema se ela não existir
$pdo->exec("CREATE TABLE IF NOT EXISTS db_state (
    id INTEGER PRIMARY KEY, 
    json_data TEXT
)");

// ROTA DE LEITURA (Substitui o GET do GitHub Gists)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT json_data FROM db_state WHERE id = 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($row) {
        echo $row['json_data'];
    } else {
        echo json_encode("{}"); // Retorna vazio caso o banco seja novo
    }
    exit();
}

// ROTA DE ESCRITA (Substitui o PATCH do GitHub Gists)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    
    // Verifica se já existe um registro
    $stmt = $pdo->query("SELECT COUNT(*) FROM db_state WHERE id = 1");
    $existe = $stmt->fetchColumn();

    if ($existe) {
        $stmt = $pdo->prepare("UPDATE db_state SET json_data = :json WHERE id = 1");
    } else {
        $stmt = $pdo->prepare("INSERT INTO db_state (id, json_data) VALUES (1, :json)");
    }
    
    $stmt->execute([':json' => $inputJSON]);
    echo json_encode(["status" => "sucesso"]);
    exit();
}
?>