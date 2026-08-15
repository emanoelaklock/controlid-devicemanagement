<#
  diagnose-recovery.ps1 - Capturador de diagnostico para leitora Control iD
  que entra em boot loop / recovery. Versao PowerShell: roda em qualquer
  Windows (5.1 ou 7+) SEM instalar nada. Ideal para rodar na maquina remota
  (via TeamViewer) que enxerga a leitora na rede.

  Cenario: a leitora sobe em modo web, fica alguns minutos, depois cai pro
  modo de recuperacao e reinicia. Este script fica em ciclo:
    - tenta logar a cada poucos segundos;
    - quando a web esta de pe, baixa system_information + get_ac_log (log de
      diagnostico) + export_audit_logs (categoria boot e a chave);
    - detecta a transicao UP -> DOWN, registra a hora da queda e o uptime do
      ultimo capture (revela a cadencia do crash);
    - repete, entao cada ciclo pega o "rabo" do log logo antes da queda.

  Uso (PowerShell na maquina remota):
    powershell -ExecutionPolicy Bypass -File .\diagnose-recovery.ps1 -Ip 192.168.0.129 -User admin -Pass SUA_SENHA

  Parametros:
    -Ip <ip>          IP da leitora            (obrigatorio)
    -User <login>     usuario web              (default: admin)
    -Pass <senha>     senha web                (default: admin)
    -Port <porta>     porta                    (default: 80, ou 443 se -Https)
    -Https            usa HTTPS (aceita certificado self-signed)
    -Interval <seg>   intervalo entre pings    (default: 5)
    -Out <pasta>      pasta de saida           (default: .\diag-<ip>)

  Saida: um .txt por capture em <Out>\, mais events.log com a linha do tempo.
  Basta mandar o events.log + os 2-3 capturas mais recentes antes de uma queda.
  Pare com Ctrl+C.
#>

param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [string]$User = 'admin',
  [string]$Pass = 'admin',
  [int]$Port = 0,
  [switch]$Https,
  [double]$Interval = 5,
  [string]$Out = ''
)

$ErrorActionPreference = 'Stop'
if ($Port -eq 0) { $Port = if ($Https) { 443 } else { 80 } }
$proto = if ($Https) { 'https' } else { 'http' }
if ([string]::IsNullOrEmpty($Out)) { $Out = ".\diag-$($Ip -replace '[^\d.]','_')" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$eventsPath = Join-Path $Out 'events.log'

# Aceita certificado self-signed no HTTPS (Windows PowerShell 5.1)
if ($Https) {
  try {
    Add-Type @"
using System.Net; using System.Security.Cryptography.X509Certificates;
public class TrustAll : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint sp, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  } catch { }
}

function Stamp { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function FileStamp { (Get-Date).ToString('yyyy-MM-dd_HH-mm-ss') }
function LogEvent($line) {
  $entry = "[$(Stamp)] $line"
  Write-Host $entry
  Add-Content -Path $eventsPath -Value $entry
}

function Invoke-Fcgi($PathName, $Body, $Session, $TimeoutSec = 15) {
  $full = $PathName
  if ($Session) {
    $sep = if ($PathName.Contains('?')) { '&' } else { '?' }
    $full = "$PathName$sep" + "session=" + [System.Uri]::EscapeDataString($Session)
  }
  $url = "${proto}://${Ip}:${Port}$full"
  $resp = Invoke-WebRequest -Uri $url -Method Post -Body $Body -ContentType 'application/json' `
    -TimeoutSec $TimeoutSec -UseBasicParsing
  return $resp.Content
}

function Do-Login {
  $body = @{ login = $User; password = $Pass } | ConvertTo-Json -Compress
  $content = Invoke-Fcgi '/login.fcgi' $body $null 10
  $json = $content | ConvertFrom-Json
  if (-not $json.session) { throw "login sem session: $($content.Substring(0, [Math]::Min(200, $content.Length)))" }
  return $json
}

function Do-Capture($Session) {
  $files = @{}
  try { $files.system_information = Invoke-Fcgi '/system_information.fcgi' '{}' $Session 15 }
  catch { $files.system_information = "ERRO: $($_.Exception.Message)" }
  try { $files.diagnostic_log = Invoke-Fcgi '/get_ac_log.fcgi' '{}' $Session 30 }
  catch { $files.diagnostic_log = "ERRO: $($_.Exception.Message)" }
  try {
    $cats = @{ config=1; api=1; usb=1; network=1; time=1; online=1; menu=1; boot=1; push_server=1 } | ConvertTo-Json -Compress
    $files.audit_log = Invoke-Fcgi '/export_audit_logs.fcgi' $cats $Session 30
  } catch { $files.audit_log = "ERRO: $($_.Exception.Message)" }
  return $files
}

function Get-VersionUptime($sysRaw) {
  $version = '?'; $uptime = '?'
  try {
    $j = $sysRaw | ConvertFrom-Json
    if ($j.version) { $version = $j.version } elseif ($j.firmware) { $version = $j.firmware }
    foreach ($k in 'uptime','up_time','system_uptime') { if ($j.$k) { $uptime = $j.$k; break } }
  } catch { }
  return @{ version = $version; uptime = $uptime }
}

# --- loop principal ------------------------------------------------
$webUp = $false
$lastCapture = $null
$cycle = 0

LogEvent "=== monitor iniciado: ${proto}://${Ip}:${Port} user=$User intervalo=${Interval}s ==="
LogEvent "Saida em: $((Resolve-Path $Out).Path)"

while ($true) {
  try {
    $login = Do-Login
    if (-not $webUp) {
      $webUp = $true; $cycle++
      $msg = if ($login.message) { " - msg: $($login.message)" } else { '' }
      LogEvent "WEB UP  (ciclo $cycle)$msg"
    }
    $files = Do-Capture $login.session
    $vu = Get-VersionUptime $files.system_information
    $base = Join-Path $Out ("capture_{0}_cycle{1}" -f (FileStamp), $cycle)
    Set-Content -Path "${base}_system_information.txt" -Value $files.system_information
    Set-Content -Path "${base}_diagnostic_log.txt" -Value $files.diagnostic_log
    Set-Content -Path "${base}_audit_log.txt" -Value $files.audit_log
    $lastCapture = @{ at = (Stamp); version = $vu.version; uptime = $vu.uptime }
    LogEvent "  capture OK - fw $($vu.version), uptime $($vu.uptime)  -> $(Split-Path $base -Leaf)_*.txt"
    try { Invoke-Fcgi '/logout.fcgi' '{}' $login.session 5 | Out-Null } catch { }
  } catch {
    if ($webUp) {
      $webUp = $false
      $info = if ($lastCapture) { " | ultimo capture: $($lastCapture.at) (uptime $($lastCapture.uptime), fw $($lastCapture.version))" } else { '' }
      LogEvent "WEB DOWN / RECOVERY - $($_.Exception.Message)$info"
    }
  }
  Start-Sleep -Seconds ([Math]::Max(1, $Interval))
}
