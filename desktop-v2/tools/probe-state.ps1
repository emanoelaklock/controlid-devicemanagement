<#
  probe-state.ps1 - Sonda SEM SENHA para leitora Control iD em boot loop / recovery.

  Quando nenhuma senha entra, o que aparece na porta 80 provavelmente NAO e o
  firmware normal, e sim a web de recuperacao (que nao aceita login da API).
  Esta sonda nao tenta logar: so caracteriza o que responde, para distinguir:
    - app principal subindo (SPA / endpoints .fcgi respondem)  vs
    - modo recovery (pagina diferente, servidor diferente, pagina de update).

  A cada ciclo, quando a porta abre, registra:
    - status HTTP e cabecalho Server do GET /
    - <title> e trecho do corpo da pagina
    - resposta (sem sessao) de system_information.fcgi e get_firmware_version.fcgi
    - testa caminhos comuns de recovery/update (recovery, update, upload_firmware)
  Objetivo: achar a pagina de reflash e confirmar o estado. Sem senha nenhuma.

  Uso (na maquina remota, via TeamViewer):
    powershell -ExecutionPolicy Bypass -File .\probe-state.ps1 -Ip 192.168.1.177
    powershell -ExecutionPolicy Bypass -File .\probe-state.ps1 -Ip 192.168.0.129

  Pare com Ctrl+C. Me traga o arquivo probe.log gerado.
#>

param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 0,
  [switch]$Https,
  [double]$Interval = 3,
  [string]$Out = ''
)

$ErrorActionPreference = 'Stop'
if ($Port -eq 0) { $Port = if ($Https) { 443 } else { 80 } }
$proto = if ($Https) { 'https' } else { 'http' }
if ([string]::IsNullOrEmpty($Out)) { $Out = ".\probe-$($Ip -replace '[^\d.]','_')" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$logPath = Join-Path $Out 'probe.log'

if ($Https) {
  try {
    Add-Type @"
using System.Net; using System.Security.Cryptography.X509Certificates;
public class TrustAll2 : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint sp, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll2
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  } catch { }
}

function Stamp { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Log($line) {
  $e = "[$(Stamp)] $line"
  Write-Host $e
  Add-Content -Path $logPath -Value $e
}

function Test-Port($p) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect($Ip, $p, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
    if ($ok -and $c.Connected) { $c.EndConnect($iar); return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

function Trim1($s, $n) {
  if (-not $s) { return '' }
  $s = ($s -replace '\s+', ' ').Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' }
  return $s
}

function Get-Url($path, $method = 'GET', $body = $null) {
  $url = "${proto}://${Ip}:${Port}$path"
  try {
    if ($method -eq 'POST') {
      $r = Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 8 -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 8 -UseBasicParsing
    }
    return @{ ok = $true; status = $r.StatusCode; server = $r.Headers['Server']; content = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { $null }
    return @{ ok = $false; status = $status; err = $_.Exception.Message }
  }
}

$portWasOpen = $false
Log "=== sonda iniciada: ${proto}://${Ip}:${Port} intervalo=${Interval}s ==="
Log "Saida em: $((Resolve-Path $Out).Path)"

while ($true) {
  $open = Test-Port $Port
  if ($open -and -not $portWasOpen) {
    $portWasOpen = $true
    Log "PORTA $Port ABRIU - caracterizando..."

    $root = Get-Url '/'
    if ($root.ok) {
      $title = ''
      if ($root.content -match '(?is)<title>(.*?)</title>') { $title = $Matches[1].Trim() }
      Log "  GET / -> HTTP $($root.status) | Server: $($root.server) | title: '$title'"
      Log "  corpo: $(Trim1 $root.content 300)"
    } else {
      Log "  GET / -> falha: $($root.err)"
    }

    foreach ($ep in @('/system_information.fcgi','/get_firmware_version.fcgi','/get_system_information.fcgi')) {
      $r = Get-Url $ep 'POST' '{}'
      if ($r.ok) { Log "  POST $ep -> HTTP $($r.status): $(Trim1 $r.content 200)" }
      else { Log "  POST $ep -> $($r.status) $($r.err)" }
    }

    foreach ($ep in @('/recovery','/recovery.html','/update','/update.html','/firmware','/upload_firmware.fcgi','/set_firmware.fcgi')) {
      $r = Get-Url $ep 'GET'
      $tag = if ($r.ok) { "HTTP $($r.status) $(Trim1 $r.content 120)" } else { "$($r.status)" }
      Log "  GET $ep -> $tag"
    }
    Log "PORTA caracterizada. Aguardando proximo ciclo aberto/fechado."
  }
  elseif (-not $open -and $portWasOpen) {
    $portWasOpen = $false
    Log "PORTA $Port FECHOU (reboot / recovery)."
  }
  Start-Sleep -Seconds ([Math]::Max(1, $Interval))
}
