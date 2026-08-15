<#
  capture-recovery.ps1 - Captura a pagina COMPLETA do modo recovery da leitora
  Control iD, no instante em que ela aparece, para revelar o mecanismo de reflash.

  O modo recovery da iDFace Max serve uma pagina (title "iDFace Max Recovery")
  com JavaScript inline que faz as chamadas AJAX de update. Este script fica
  batendo rapido em GET / e, quando o title contem "Recovery", salva o HTML
  inteiro (e qualquer .js referenciado) e ENCERRA. Assim conseguimos ler os
  endpoints reais de reflash (que so existem no servidor de recovery).

  Uso (na maquina remota):
    powershell -ExecutionPolicy Bypass -File .\capture-recovery.ps1 -Ip 192.168.0.129

  Deixe rodando; na proxima vez que a leitora cair pro recovery ele captura e para.
  Me traga o arquivo recovery_index.html gerado (e os .js, se houver).
#>

param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 80,
  [double]$Interval = 1,
  [string]$Out = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrEmpty($Out)) { $Out = ".\recovery-$($Ip -replace '[^\d.]','_')" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Stamp { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Say($m) { Write-Host "[$(Stamp)] $m" }

function Get-Raw($path) {
  try {
    $r = Invoke-WebRequest -Uri "http://${Ip}:${Port}$path" -Method Get -TimeoutSec 6 -UseBasicParsing
    return $r.Content
  } catch { return $null }
}

Say "Aguardando modo recovery em http://${Ip}:${Port}/ ... (Ctrl+C para abortar)"
while ($true) {
  $c = Get-Raw '/'
  if ($c -and ($c -match '(?i)recovery')) {
    $idx = Join-Path $Out 'recovery_index.html'
    Set-Content -Path $idx -Value $c -Encoding UTF8
    Say "RECOVERY CAPTURADO -> $idx  ($($c.Length) bytes)"

    # baixa qualquer .js referenciado (src="...js")
    $js = [regex]::Matches($c, '(?i)src\s*=\s*["'']([^"'']+\.js[^"'']*)["'']') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    foreach ($u in $js) {
      $p = if ($u.StartsWith('http')) { ([System.Uri]$u).AbsolutePath } elseif ($u.StartsWith('/')) { $u } else { "/$u" }
      $body = Get-Raw $p
      if ($body) {
        $fn = Join-Path $Out ("js_" + ($p -replace '[\\/:*?""<>|]', '_'))
        Set-Content -Path $fn -Value $body -Encoding UTF8
        Say "  js: $p -> $fn ($($body.Length) bytes)"
      }
    }
    Say "Pronto. Me traga o recovery_index.html (e os js_*.js) da pasta $Out."
    break
  }
  Start-Sleep -Seconds ([Math]::Max(0.5, $Interval))
}
