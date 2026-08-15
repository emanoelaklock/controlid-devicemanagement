<#
  nat-fix.ps1 - Fecha a ultima peca (SNAT) para a leitora Control iD concluir o
  update online atraves do PC. Serve para as DUAS fases:

   FASE 1 (WinNAT ausente): habilita o recurso 'Containers' (que traz o WinNAT)
           e pede REBOOT.
   FASE 2 (apos reboot): cria o NAT, dispara o update e acompanha ate concluir.

  Roda o mesmo comando nas duas vezes. RODAR COMO ADMINISTRADOR.

    powershell -ExecutionPolicy Bypass -File .\nat-fix.ps1
#>

param(
  [string]$Ip = '192.168.0.129',
  [string]$Iface = 'Ethernet',
  [string]$Gw = '192.168.0.1',
  [string]$Subnet = '192.168.0.0/24',
  [string]$NatName = 'idface-nat',
  [int]$UpdateWaitSec = 900
)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERRO: rode COMO ADMINISTRADOR."; exit 1 }

function Say($m) { Write-Host "[nat-fix] $m" }
function HttpGet($path, $t = 10) { try { (Invoke-WebRequest -Uri "http://$Ip$path" -Method Get -TimeoutSec $t -UseBasicParsing).Content } catch { $null } }
function HasNetNatClass { try { Get-CimClass -Namespace 'root/StandardCimv2' -ClassName 'MSFT_NetNat' -ErrorAction Stop | Out-Null; return $true } catch { return $false } }

# --- garante IP do gateway + forwarding (idempotente) ---
if (-not (Get-NetIPAddress -IPAddress $Gw -ErrorAction SilentlyContinue)) {
  try { New-NetIPAddress -InterfaceAlias $Iface -IPAddress $Gw -PrefixLength 24 -ErrorAction Stop | Out-Null; Say "IP $Gw adicionado." } catch { Say "IP: $($_.Exception.Message)" }
} else { Say "IP $Gw presente." }
Set-NetIPInterface -InterfaceAlias $Iface -Forwarding Enabled -ErrorAction SilentlyContinue
try { Set-Service winnat -StartupType Manual -ErrorAction SilentlyContinue; Start-Service winnat -ErrorAction SilentlyContinue } catch {}

# ============ FASE 1: WinNAT ainda nao existe ============
if (-not (HasNetNatClass)) {
  Say "WinNAT (MSFT_NetNat) ainda ausente."
  $feat = Get-WindowsOptionalFeature -Online -FeatureName Containers -ErrorAction SilentlyContinue
  Say ("Recurso 'Containers': " + ($(if ($feat) { $feat.State } else { 'desconhecido' })))
  if ($feat -and $feat.State -eq 'Enabled') {
    Say "Containers ja habilitado, mas a classe nao apareceu. Tentando reparo do WMI..."
    & winmgmt /salvagerepository | Out-Host
    Say "=> REINICIE a maquina e rode este script de novo."
  } else {
    Say "Habilitando o recurso 'Containers' (traz o WinNAT)..."
    try {
      Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart -ErrorAction Stop | Out-Null
      Say "Recurso habilitado com sucesso."
    } catch { Say "Falha ao habilitar Containers: $($_.Exception.Message)"; Say "Alternativa: habilitar 'Microsoft-Hyper-V -All'."; exit 1 }
    Say ""
    Say "=========================================================="
    Say " REINICIE a maquina (Restart-Computer) e, depois do boot,"
    Say " rode ESTE MESMO script de novo para criar o NAT e atualizar."
    Say "=========================================================="
  }
  exit 0
}

# ============ FASE 2: WinNAT disponivel -> cria NAT e atualiza ============
Say "WinNAT disponivel. Criando/validando o NAT..."
try {
  if (-not (Get-NetNat -Name $NatName -ErrorAction SilentlyContinue)) {
    New-NetNat -Name $NatName -InternalIPInterfaceAddressPrefix $Subnet -ErrorAction Stop | Out-Null
  }
  Say "NAT '$NatName' ativo para $Subnet."
} catch { Say "FALHA ao criar NAT: $($_.Exception.Message)"; exit 1 }

# dispara o update
Say "Aguardando recovery e disparando update..."
$dl = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $dl) { $r = HttpGet '/' 5; if ($r -and ($r -match '(?i)recovery')) { break }; Start-Sleep -Milliseconds 700 }
HttpGet '/cgi/run_update.sh' 10 | Out-Null
Say "Update disparado. Acompanhando (baixando ~150MB, pode levar minutos)..."

# acompanha sessoes NAT + status
$seen = @{}
$deadline = (Get-Date).AddSeconds($UpdateWaitSec)
$lastPrinted = ''
while ((Get-Date) -lt $deadline) {
  try {
    Get-NetNatSession -NatName $NatName -ErrorAction SilentlyContinue | Where-Object { $_.InternalSourceAddress -eq $Ip } | ForEach-Object {
      $k = "{0}:{1} -> {2}:{3}" -f $_.InternalSourceAddress, $_.InternalSourcePort, $_.ExternalDestinationAddress, $_.ExternalDestinationPort
      if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; Say "SESSAO NAT: $k" }
    }
  } catch {}
  $st = HttpGet '/cgi/read_status.sh' 8
  if ($st -and $st -ne $lastPrinted) {
    $tail = ($st -split "`n" | Where-Object { $_ -match '(?i)update|download|FINISH|erro|error|progress|%' } | Select-Object -Last 3) -join ' | '
    if ($tail) { Say "status: $tail" }
    $lastPrinted = $st
  }
  if ($st -match '(?i)FINISH:') {
    if ($st -match '(?i)error') { Say "TERMINOU COM ERRO."; Say $st }
    else { Say "UPDATE CONCLUIDO COM SUCESSO! Rode: recovery-control.ps1 -Ip $Ip -Action reboot" }
    break
  }
  Start-Sleep -Seconds 2
}
Say "Destinos NAT vistos da leitora: $($seen.Count)"
