<#
  watch-nat.ps1 - Observa se a leitora (192.168.0.129) esta realmente roteando
  pela PC (NAT). Roda em loop capturando as sessoes NAT e os pacotes que passam,
  mostrando PARA ONDE a leitora tenta se conectar durante o update.

  RODAR COMO ADMINISTRADOR, numa janela separada, ANTES de disparar o update
  em outra janela. Deixe rodando ~60s enquanto o update tenta.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\watch-nat.ps1
#>

param(
  [string]$DeviceIp = '192.168.0.129',
  [int]$Seconds = 90
)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERRO: rode COMO ADMINISTRADOR."; exit 1 }

function Stamp { (Get-Date).ToString('HH:mm:ss') }

# estado atual do NAT / IP / forwarding
Write-Host "===== ESTADO ATUAL ====="
Write-Host "IPs 192.168.0.x no NIC:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.0.*' } | Format-Table IPAddress, PrefixLength, InterfaceAlias -Auto
Write-Host "Forwarding por interface:"
Get-NetIPInterface -AddressFamily IPv4 | Where-Object { $_.Forwarding -eq 'Enabled' } | Format-Table InterfaceAlias, Forwarding -Auto
Write-Host "NATs:"
Get-NetNat -ErrorAction SilentlyContinue | Format-Table Name, InternalIPInterfaceAddressPrefix, Active -Auto
Write-Host "========================="
Write-Host "[$(Stamp)] Vigiando trafego da leitora $DeviceIp por ${Seconds}s..."
Write-Host "AGORA dispare o update em OUTRA janela:"
Write-Host "   recovery-control.ps1 -Ip $DeviceIp -Action update"
Write-Host ""

$seen = @{}
$deadline = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $deadline) {
  try {
    $sess = Get-NetNatSession -ErrorAction SilentlyContinue | Where-Object { $_.InternalSourceAddress -eq $DeviceIp }
    foreach ($s in $sess) {
      $key = "{0}:{1} -> {2}:{3}" -f $s.InternalSourceAddress, $s.InternalSourcePort, $s.ExternalDestinationAddress, $s.ExternalDestinationPort
      if (-not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        Write-Host "[$(Stamp)] SESSAO NAT: $key   (proto $($s.Protocol))"
      }
    }
  } catch {}
  Start-Sleep -Milliseconds 300
}

Write-Host ""
if ($seen.Count -eq 0) {
  Write-Host "[$(Stamp)] NENHUMA sessao da leitora foi vista."
  Write-Host "  => A leitora NAO esta roteando pela PC. Ou o NAT nao esta montado,"
  Write-Host "     ou o gateway de fabrica dela nao e 192.168.0.1."
} else {
  Write-Host "[$(Stamp)] Total de destinos distintos: $($seen.Count)"
  Write-Host "  => A leitora ESTA saindo pela PC. Os destinos acima sao o servidor de update."
  Write-Host "     Se as portas sao 53 (DNS) sem TCP depois, e problema de DNS."
}
