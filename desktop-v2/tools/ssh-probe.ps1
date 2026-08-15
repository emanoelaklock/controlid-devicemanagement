<#
  ssh-probe.ps1 - Verifica o servico SSH da leitora Control iD durante o loop.
  A cada ciclo: testa a porta 22, e se estiver aberta le o BANNER do SSH
  (linha "SSH-2.0-...") e o title da web em / no MESMO instante, para saber
  se o SSH esta de pe no ambiente de RECOVERY ("iDFace Max Recovery") ou no
  app principal ("Control iD"). Nao tenta logar - so identifica.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\ssh-probe.ps1 -Ip 192.168.0.129
#>

param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Count = 120,
  [int]$Interval = 2
)

function Stamp { (Get-Date).ToString('HH:mm:ss') }

function Get-SshBanner($ip, $port = 22, $timeoutMs = 1500) {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect($ip, $port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(1000)) { return $null }
    $c.EndConnect($iar)
    $c.ReceiveTimeout = $timeoutMs
    $s = $c.GetStream()
    Start-Sleep -Milliseconds 400
    $buf = New-Object byte[] 256
    $n = 0
    try { $n = $s.Read($buf, 0, 256) } catch {}
    if ($n -gt 0) { return ([System.Text.Encoding]::ASCII.GetString($buf, 0, $n)).Trim() }
    return '(porta aberta, sem banner)'
  } catch { return $null } finally { $c.Close() }
}

function Get-WebTitle($ip) {
  try {
    $r = Invoke-WebRequest -Uri "http://$ip/" -Method Get -TimeoutSec 4 -UseBasicParsing
    $body = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    if ($body -match '(?is)<title>(.*?)</title>') { return $Matches[1].Trim() }
    return '(sem title)'
  } catch { return '(web fora)' }
}

Write-Host "[$(Stamp)] Sondando SSH em $Ip (Ctrl+C para parar)..."
for ($i = 0; $i -lt $Count; $i++) {
  $banner = Get-SshBanner $Ip
  if ($banner) {
    $title = Get-WebTitle $Ip
    Write-Host "[$(Stamp)] SSH ABERTO | banner: $banner | web: '$title'"
  } else {
    Write-Host "[$(Stamp)] porta 22 fechada"
  }
  Start-Sleep -Seconds $Interval
}
