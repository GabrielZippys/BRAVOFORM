# Script PowerShell para criar tabelas via ODBC
# Usa a conexão ODBC que já está configurada

$sqlFile = Join-Path $PSScriptRoot "create-postgresql-tables.sql"
$sql = Get-Content $sqlFile -Raw

# Conectar via ODBC DSN
$connectionString = "DSN=BravoFormDB"

try {
    Write-Host "🔌 Conectando ao PostgreSQL via ODBC..." -ForegroundColor Cyan
    
    $connection = New-Object System.Data.Odbc.OdbcConnection
    $connection.ConnectionString = $connectionString
    $connection.Open()
    
    Write-Host "✅ Conectado com sucesso!" -ForegroundColor Green
    
    Write-Host "📊 Executando script SQL..." -ForegroundColor Cyan
    
    $command = $connection.CreateCommand()
    $command.CommandText = $sql
    $command.ExecuteNonQuery() | Out-Null
    
    Write-Host "✅ Tabelas criadas com sucesso!" -ForegroundColor Green
    
    # Verificar tabelas
    $command.CommandText = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    $reader = $command.ExecuteReader()
    
    Write-Host "`n📋 Tabelas criadas:" -ForegroundColor Yellow
    while ($reader.Read()) {
        Write-Host "  ✓ $($reader[0])" -ForegroundColor Green
    }
    $reader.Close()
    
    # Contar registros
    $command.CommandText = "SELECT COUNT(*) FROM form_response"
    $count = $command.ExecuteScalar()
    Write-Host "`n📊 Registros de teste inseridos: $count" -ForegroundColor Yellow
    
    $connection.Close()
    Write-Host "`n✅ Concluído!" -ForegroundColor Green
    
}
catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
