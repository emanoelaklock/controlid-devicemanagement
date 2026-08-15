<#
  capture-idface-traffic.ps1 - Captura (via pktmon, nativo do Windows) o trafego
  que a leitora 192.168.0.129 tenta enviar durante o update online do recovery.
  Mostra se ela usa o PC como gateway e PARA ONDE tenta se conectar (DNS? host de
  update?). Independe de WinNAT.

  RODAR COMO ADMINISTRADOR. Ele mesmo dispara o update e captura a janela.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\capture-idface-traffic.ps1 -Ip 192.168.0.129
#>

param(
  [string]$Ip = '192.168.0.129',
  [int]$WindowSec = 30
)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERRO: rode COMO ADMINISTRADOR."; exit 1 }

$dir = "C:\Users\Administrador\Downloads\tools"
$etl = Join-Path $dir 'idface.etl'
$txt = Join-Path $dir 'idface_pkts.txt'

# ---- ambiente (pra planejar o metodo de NAT) ----
Write-Host "===== AMBIENTE ====="
try { Write-Host ("OS: " + (Get-CimInstance Win32_OperatingSystem).Caption + " / " + (Get-CimInstance Win32_OperatingSystem).Version) } catch {}
try { $w = Get-Service winnat -ErrorAction Stop; Write-Host ("Servico winnat: " + $w.Status) } catch { Write-Host "Servico winnat: NAO EXISTE" }
try { $sh = Get-Service SharedAccess -ErrorAction Stop; Write-Host ("Servico SharedAccess (ICS): " + $sh.Status + " / StartType " + $sh.StartType) } catch { Write-Host "Servico SharedAccess: NAO EXISTE" }
try { Write-Host ("RemoteAccess (RRAS) feature: " + (Get-WindowsOptionalFeature -Online -FeatureName RasRoutingProtocols -ErrorAction SilentlyContinue).State) } catch {}
Write-Host "===================="

function HttpGet($path, $timeout=15) {
  try { (Invoke-WebRequest -Uri "http://$Ip$path" -Method Get -TimeoutSec $timeout -UseBasicParsing).Content } catch { $null }
}

# ---- inicia captura pktmon ----
Write-Host "[pktmon] limpando filtros e iniciando captura para $Ip ..."
& pktmon filter remove | Out-Null
& pktmon filter add IDFACE -i $Ip | Out-Null
Remove-Item $etl -ErrorAction SilentlyContinue
& pktmon start --capture --pkt-size 128 --file-name $etl | Out-Null

Start-Sleep -Seconds 1

# ---- dispara o update ----
Write-Host "[update] aguardando recovery e disparando run_update..."
$deadline = (Get-Date).AddSeconds(120)
$inRec = $false
while ((Get-Date) -lt $deadline) {
  $root = HttpGet '/' 5
  if ($root -and ($root -match '(?i)recovery')) { $inRec = $true; break }
  Start-Sleep -Milliseconds 800
}
if (-not $inRec) { Write-Host "Nao vi recovery; capturando mesmo assim." }
HttpGet '/cgi/run_update.sh' 10 | Out-Null
Write-Host "[update] disparado. Capturando por ${WindowSec}s enquanto a leitora tenta baixar..."

# ---- le status enquanto captura ----
$t2 = (Get-Date).AddSeconds($WindowSec)
$lastStatus = ''
while ((Get-Date) -lt $t2) {
  $st = HttpGet '/cgi/read_status.sh' 8
  if ($st -and $st -ne $lastStatus) { $lastStatus = $st }
  if ($st -match '(?i)FINISH:') { break }
  Start-Sleep -Seconds 1
}

# ---- para captura e formata ----
Write-Host "[pktmon] parando e formatando..."
& pktmon stop | Out-Null
& pktmon filter remove | Out-Null
Remove-Item $txt -ErrorAction SilentlyContinue
& pktmon format $etl -o $txt | Out-Null

Write-Host ""
Write-Host "===== ULTIMO STATUS DO UPDATE ====="
Write-Host $lastStatus
Write-Host "==================================="

# ---- resumo: destinos que a leitora tentou ----
Write-Host ""
Write-Host "===== DESTINOS QUE A LEITORA ($Ip) TENTOU ====="
if (Test-Path $txt) {
  $lines = Get-Content $txt | Where-Object { $_ -match [regex]::Escape($Ip) }
  $dest = @{}
  foreach ($l in $lines) {
    $ips = [regex]::Matches($l, '\b\d{1,3}(\.\d{1,3}){3}\b') | ForEach-Object { $_.Value } | Where-Object { $_ -ne $Ip -and $_ -notlike '224.*' -and $_ -ne '255.255.255.255' }
    foreach ($d in $ips) { if (-not $dest.ContainsKey($d)) { $dest[$d] = 0 }; $dest[$d]++ }
  }
  if ($dest.Count -eq 0) {
    Write-Host "NENHUM pacote da leitora capturado."
    Write-Host " => A leitora NAO esta enviando trafego pro PC. O gateway de fabrica dela"
    Write-Host "    provavelmente NAO e 192.168.0.1 (ou ela nao tem gateway configurado)."
  } else {
    $dest.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { Write-Host ("  {0}   ({1} pacotes)" -f $_.Key, $_.Value) }
    Write-Host ""
    Write-Host " => A leitora ESTA mandando trafego pro PC (usa .1 como gateway)."
    Write-Host "    Os IPs acima sao o que ela tenta alcancar (DNS e/ou servidor de update)."
    Write-Host "    Total de pacotes com a leitora: $($lines.Count). Detalhe cru em: $txt"
  }
} else {
  Write-Host "pktmon nao gerou o txt. Veja $etl."
}
