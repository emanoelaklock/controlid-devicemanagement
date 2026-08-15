<#
  recovery-control.ps1 - Controle remoto do Web Recovery da iDFace Max.

  A pagina de recovery (title "iDFace Max Recovery") expoe acoes via GET em
  cgi/*.sh e um cgi/read_status.sh que reporta progresso ate aparecer "FIM:".
  Este script espera a leitora estar em recovery, dispara a acao escolhida e
  fica lendo o status ate concluir.

  ACOES (-Action):
    hold            -> cgi/reboot_recovery.sh   (fixa em recovery; para de ciclar)
    update          -> cgi/run_update.sh        (reaplica firmware; MANTEM config)
    factory-update  -> cgi/run_factory_update.sh(reinstala e APAGA toda a config) *
    reboot          -> cgi/reboot_normal.sh     (reinicia em modo normal)
    status          -> so le cgi/read_status.sh (nao dispara nada)

    * factory-update e DESTRUTIVO: exige tambem -Confirm ORB (digitado).

  Uso (na maquina remota):
    powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip 192.168.0.129 -Action hold
    powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip 192.168.0.129 -Action update
    powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip 192.168.0.129 -Action factory-update -Confirm ORB
    powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip 192.168.0.129 -Action reboot

  Recomendado: rodar 'hold' primeiro (prende em recovery), depois 'update'.
#>

param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [Parameter(Mandatory = $true)][ValidateSet('hold','update','factory-update','reboot','status')][string]$Action,
  [int]$Port = 80,
  [string]$Confirm = '',
  [int]$MaxWaitRecoverySec = 240,
  [int]$MaxRunSec = 600
)

$ErrorActionPreference = 'Stop'
$base = "http://${Ip}:${Port}"

function Stamp { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Say($m) { Write-Host "[$(Stamp)] $m" }

function Get-Raw($path, $timeoutSec = 8) {
  try {
    $r = Invoke-WebRequest -Uri "$base$path" -Method Get -TimeoutSec $timeoutSec -UseBasicParsing
    $c = $r.Content
    # Alguns cgi devolvem sem charset -> .Content vem como byte[]; decodifica p/ texto
    if ($c -is [byte[]]) { $c = [System.Text.Encoding]::UTF8.GetString($c) }
    return @{ ok = $true; code = [int]$r.StatusCode; body = [string]$c }
  } catch {
    $resp = $_.Exception.Response
    return @{ ok = $false; code = $(if ($resp) { [int]$resp.StatusCode } else { 0 }); body = ''; err = $_.Exception.Message }
  }
}

function Test-Recovery {
  $r = Get-Raw '/' 6
  return ($r.ok -and ($r.body -match '(?i)Recovery'))
}

function Wait-Recovery($maxSec) {
  Say "Aguardando modo RECOVERY em $base/ (ate ${maxSec}s)..."
  $deadline = (Get-Date).AddSeconds($maxSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Recovery) { Say "Recovery detectado."; return $true }
    Start-Sleep -Milliseconds 800
  }
  Say "ERRO: nao vi o modo recovery na janela. Rode de novo."
  return $false
}

function Poll-Status($maxSec) {
  Say "Lendo cgi/read_status.sh ate 'FIM:' (ate ${maxSec}s)..."
  $deadline = (Get-Date).AddSeconds($maxSec)
  $last = ''
  while ((Get-Date) -lt $deadline) {
    $r = Get-Raw '/cgi/read_status.sh' 10
    if ($r.ok -and $r.body -and $r.body -ne $last) {
      Write-Host "----- status @ $(Stamp) -----"
      Write-Host $r.body
      $last = $r.body
    }
    if ($r.ok -and $r.body -match '(?i)(FINISH:|FIM:)') {
      if ($r.body -match '(?i)error') { Say "TERMINOU COM ERRO (veja a mensagem acima)." }
      else { Say "CONCLUIDO com sucesso." }
      return $true
    }
    Start-Sleep -Seconds 1
  }
  Say "Tempo esgotado lendo status (pode ter reiniciado no meio)."
  return $false
}

# --- executa a acao ------------------------------------------------
Say "=== recovery-control | alvo $base | acao: $Action ==="

$map = @{
  'hold'           = 'cgi/reboot_recovery.sh'
  'update'         = 'cgi/run_update.sh'
  'factory-update' = 'cgi/run_factory_update.sh'
  'reboot'         = 'cgi/reboot_normal.sh'
}

if ($Action -eq 'status') {
  if (-not (Wait-Recovery $MaxWaitRecoverySec)) { exit 1 }
  Poll-Status 30
  exit 0
}

if ($Action -eq 'factory-update' -and $Confirm -ne 'ORB') {
  Say "BLOQUEADO: factory-update APAGA toda a configuracao/usuarios da leitora."
  Say "Se e isso mesmo, rode de novo acrescentando:  -Confirm ORB"
  exit 1
}

if (-not (Wait-Recovery $MaxWaitRecoverySec)) { exit 1 }

$ep = '/' + $map[$Action]
Say "Disparando $ep ..."
$r = Get-Raw $ep 15
if ($r.ok) { Say "OK ($($r.code)). $($r.body)" } else { Say "Chamada retornou: code=$($r.code) $($r.err)" }

if ($Action -eq 'hold') {
  Say "Comando de reboot-em-recovery enviado. A leitora deve reiniciar e FICAR em recovery."
  Say "Aguardando ela voltar em recovery para confirmar..."
  Start-Sleep -Seconds 10
  Wait-Recovery $MaxWaitRecoverySec | Out-Null
  Say "Pronto. Agora rode a acao 'update' (ou 'status')."
}
elseif ($Action -eq 'reboot') {
  Say "Reboot normal enviado. Acompanhe se a leitora estabiliza ou volta ao loop."
}
else {
  # update / factory-update
  Poll-Status $MaxRunSec
  Say "Terminou a fase de update. Se deu 'FIM:' sem erro, rode a acao 'reboot' para bootar normal."
}
