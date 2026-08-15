<#
  pktmon-test.ps1 - Confirma se a leitora (192.168.0.129) envia pacotes pro PC
  quando tenta o update (ou seja, se usa 192.168.0.1 como gateway). Mostra a
  saida crua do pktmon em cada passo. RODAR COMO ADMINISTRADOR.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\pktmon-test.ps1
#>

param([string]$Ip = '192.168.0.129', [int]$WindowSec = 30)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERRO: rode COMO ADMINISTRADOR."; exit 1 }

$etl = 'C:\idface_cap.etl'
$txt = 'C:\idface_cap.txt'
function HttpGet($path, $t = 10) { try { (Invoke-WebRequest -Uri "http://$Ip$path" -Method Get -TimeoutSec $t -UseBasicParsing).Content } catch { $null } }

Write-Host "----- encerrando qualquer captura anterior -----"
& pktmon stop 2>$null | Out-Host
Write-Host "----- limpando filtros -----"
& pktmon filter remove 2>&1 | Out-Host
Write-Host "----- adicionando filtro para $Ip -----"
& pktmon filter add -i $Ip 2>&1 | Out-Host
Remove-Item $etl, $txt -ErrorAction SilentlyContinue
Write-Host "----- iniciando captura -----"
& pktmon start --capture --pkt-size 128 -f $etl 2>&1 | Out-Host
Write-Host ("etl criado? " + (Test-Path $etl))

Start-Sleep -Seconds 1
Write-Host "----- aguardando recovery e disparando update -----"
$dl = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $dl) { $r = HttpGet '/' 5; if ($r -and ($r -match '(?i)recovery')) { break }; Start-Sleep -Milliseconds 700 }
HttpGet '/cgi/run_update.sh' 10 | Out-Null
Write-Host "update disparado; capturando por ${WindowSec}s..."
$t2 = (Get-Date).AddSeconds($WindowSec)
while ((Get-Date) -lt $t2) { $s = HttpGet '/cgi/read_status.sh' 8; if ($s -match '(?i)FINISH:') { break }; Start-Sleep -Seconds 1 }

Write-Host "----- parando captura (veja a contagem de pacotes) -----"
& pktmon stop 2>&1 | Out-Host
& pktmon filter remove 2>$null | Out-Null

Write-Host "----- formatando -----"
if (Test-Path $etl) {
  & pktmon format $etl -o $txt 2>&1 | Out-Host
  if (Test-Path $txt) {
    $lines = Get-Content $txt | Where-Object { $_ -match [regex]::Escape($Ip) }
    Write-Host ""
    Write-Host ("Linhas com a leitora: " + $lines.Count)
    $dest = @{}
    foreach ($l in $lines) {
      [regex]::Matches($l, '\b\d{1,3}(\.\d{1,3}){3}\b') | ForEach-Object { $_.Value } |
        Where-Object { $_ -ne $Ip -and $_ -notlike '224.*' -and $_ -ne '255.255.255.255' -and $_ -ne '0.0.0.0' } |
        ForEach-Object { if (-not $dest.ContainsKey($_)) { $dest[$_] = 0 }; $dest[$_]++ }
    }
    Write-Host "----- DESTINOS QUE A LEITORA TENTOU -----"
    if ($dest.Count -eq 0) { Write-Host "  (nenhum destino externo)" }
    else { $dest.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { Write-Host ("  {0}   ({1}x)" -f $_.Key, $_.Value) } }
    Write-Host ""
    Write-Host "Primeiras linhas cruas envolvendo a leitora:"
    $lines | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
  } else { Write-Host "format nao gerou txt." }
} else {
  Write-Host "Captura nao criou o etl. Cole a saida do 'iniciando captura' acima."
}
