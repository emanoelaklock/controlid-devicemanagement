<#
  nat-try.ps1 - Liga o WinNAT (servico parado), cria o NAT para a leitora,
  dispara o update e verifica pelas SESSOES NAT se a leitora (192.168.0.129)
  esta realmente roteando pelo PC. Tudo em uma passada. RODAR COMO ADMINISTRADOR.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\nat-try.ps1
  Desfazer:
    powershell -ExecutionPolicy Bypass -File .\nat-for-idface.ps1 -Teardown
#>

param(
  [string]$Ip = '192.168.0.129',
  [string]$Iface = 'Ethernet',
  [string]$Gw = '192.168.0.1',
  [string]$Subnet = '192.168.0.0/24',
  [string]$NatName = 'idface-nat'
)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERRO: rode COMO ADMINISTRADOR."; exit 1 }

function Say($m) { Write-Host "[nat-try] $m" }
function HttpGet($path, $t = 10) { try { (Invoke-WebRequest -Uri "http://$Ip$path" -Method Get -TimeoutSec $t -UseBasicParsing).Content } catch { $null } }

# 1) garante IP do gateway + forwarding
if (-not (Get-NetIPAddress -IPAddress $Gw -ErrorAction SilentlyContinue)) {
  try { New-NetIPAddress -InterfaceAlias $Iface -IPAddress $Gw -PrefixLength 24 -ErrorAction Stop | Out-Null; Say "IP $Gw adicionado." } catch { Say "IP: $($_.Exception.Message)" }
} else { Say "IP $Gw ja presente." }
Set-NetIPInterface -InterfaceAlias $Iface -Forwarding Enabled -ErrorAction SilentlyContinue
Say "Forwarding ligado."

# 2) liga o servico winnat
try {
  Set-Service winnat -StartupType Manual -ErrorAction SilentlyContinue
  Start-Service winnat -ErrorAction Stop
  Say "Servico winnat iniciado: $((Get-Service winnat).Status)"
} catch { Say "Nao consegui iniciar winnat: $($_.Exception.Message)" }

# 3) a classe MSFT_NetNat existe?
$hasClass = $true
try { Get-CimClass -Namespace 'root/StandardCimv2' -ClassName 'MSFT_NetNat' -ErrorAction Stop | Out-Null }
catch { $hasClass = $false }
Say "Classe MSFT_NetNat disponivel: $hasClass"

# 4) cria o NAT
$natOk = $false
try {
  if (Get-NetNat -Name $NatName -ErrorAction SilentlyContinue) { Say "NAT '$NatName' ja existe."; $natOk = $true }
  else {
    New-NetNat -Name $NatName -InternalIPInterfaceAddressPrefix $Subnet -ErrorAction Stop | Out-Null
    Say "NAT '$NatName' criado para $Subnet."; $natOk = $true
  }
} catch {
  Say "FALHA ao criar NAT: $($_.Exception.Message)"
}

if (-not $natOk) {
  Say ""
  Say "=> WinNAT indisponivel nesta maquina. Sem NAT nativo, o caminho do PC-gateway"
  Say "   nao fecha. Me manda esta saida que eu indico a alternativa."
  exit 1
}

# 5) dispara update e observa sessoes NAT da leitora por 35s
Say ""
Say "Disparando update e observando sessoes NAT da leitora por 35s..."
# espera recovery
$dl = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $dl) { $r = HttpGet '/' 5; if ($r -and ($r -match '(?i)recovery')) { break }; Start-Sleep -Milliseconds 700 }
HttpGet '/cgi/run_update.sh' 10 | Out-Null

$seen = @{}
$dl2 = (Get-Date).AddSeconds(35)
while ((Get-Date) -lt $dl2) {
  try {
    Get-NetNatSession -NatName $NatName -ErrorAction SilentlyContinue | Where-Object { $_.InternalSourceAddress -eq $Ip } | ForEach-Object {
      $k = "{0}:{1} -> {2}:{3} ({4})" -f $_.InternalSourceAddress, $_.InternalSourcePort, $_.ExternalDestinationAddress, $_.ExternalDestinationPort, $_.Protocol
      if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; Say "SESSAO: $k" }
    }
  } catch {}
  Start-Sleep -Milliseconds 300
}

# 6) status final do update
$st = HttpGet '/cgi/read_status.sh' 8
Say ""
Say "===== RESULTADO ====="
if ($seen.Count -gt 0) {
  Say "A leitora ESTA roteando pelo PC ($($seen.Count) destino(s) acima)."
  Say "Se o update ainda falhou, o problema e DNS/host - me manda os destinos."
} else {
  Say "NENHUMA sessao NAT da leitora. Ela NAO usa $Gw como gateway (ou nao tem gateway)."
  Say "Nesse caso o NAT nao adianta e mudamos de abordagem."
}
Say "Ultimo status do update (deve terminar em FINISH:):"
if ($st) { $st } else { Say "(sem status)" }
