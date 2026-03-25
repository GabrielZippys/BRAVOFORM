$sqlFile = Join-Path $PSScriptRoot "create-postgresql-tables.sql"
$sql = Get-Content $sqlFile -Raw

$connectionString = "DSN=BravoFormDB"

try {
    Write-Host "Conectando ao PostgreSQL via ODBC..."
    
    $connection = New-Object System.Data.Odbc.OdbcConnection
    $connection.ConnectionString = $connectionString
    $connection.Open()
    
    Write-Host "Conectado com sucesso!"
    Write-Host "Executando script SQL..."
    
    $command = $connection.CreateCommand()
    $command.CommandText = $sql
    $command.ExecuteNonQuery() | Out-Null
    
    Write-Host "Tabelas criadas com sucesso!"
    
    $command.CommandText = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    $reader = $command.ExecuteReader()
    
    Write-Host ""
    Write-Host "Tabelas criadas:"
    while ($reader.Read()) {
        Write-Host "  - $($reader[0])"
    }
    $reader.Close()
    
    $command.CommandText = "SELECT COUNT(*) FROM form_response"
    $count = $command.ExecuteScalar()
    Write-Host ""
    Write-Host "Registros de teste inseridos: $count"
    
    $connection.Close()
    Write-Host ""
    Write-Host "Concluido!"
    
} catch {
    Write-Host "Erro: $($_.Exception.Message)"
    exit 1
}
