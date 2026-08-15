<#
  nat-for-idface.ps1 - Faz o PC virar o gateway de internet da leitora Control iD,
  para que o update ONLINE do recovery consiga baixar o firmware.

  A leitora esta presa no IP de fabrica 192.168.0.129 e procura o gateway
  192.168.0.1 (que nao existe na rede). Este script:
    1. adiciona o IP 192.168.0.1 no NIC do PC (o gateway que a leitora procura);
    2. liga o encaminhamento de IP (forwarding) na interface;
    3. cria um NAT (WinNAT) para o subnet da leitora sair pra internet pelo PC.
  Assim a leitora manda o trafego pro PC (gateway .1), e o PC faz NAT pra internet
  pela sua rota padrao (172.16.230.129). Tudo reversivel com -Teardown.

  RODAR COMO ADMINISTRADOR.

  Setup:
    powershell -ExecutionPolicy Bypass -File .\nat-for-idface.ps1
  Ver sessoes NAT da leitora (apos disparar o update):
    powershell -ExecutionPolicy Bypass -File .\nat-for-idface.ps1 -Check
  Desfazer tudo:
    powershell -ExecutionPolicy Bypass -File .\nat-for-idface.ps1 -Teardown
#>

param(
  [string]$InterfaceAlias = 'Ethernet',
  [string]$GatewayIp = '192.168.0.1',
  [int]$GatewayPrefix = 24,
  [string]$DeviceSubnet = '192.168.0.0/24',
  [string]$NatName = 'idface-nat',
  [switch]$Teardown,
  [switch]$Check
)

function Say($m) { Write-Host "[nat-idface] $m" }

# precisa de admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say "ERRO: rode esta janela do PowerShell COMO ADMINISTRADOR."; exit 1 }

if ($Check) {
  Say "Sessoes NAT (origem = leitora indica que ela esta roteando pelo PC):"
  try { Get-NetNatSession -NatName $NatName -ErrorAction Stop | Where-Object { $_.InternalSourceAddress -like '192.168.0.*' } | Format-Table InternalSourceAddress, InternalSourcePort, ExternalDestinationAddress, ExternalDestinationPort -Auto }
  catch { Say "Sem sessoes ou NAT inexistente: $($_.Exception.Message)" }
  exit 0
}

if ($Teardown) {
  Say "Desfazendo..."
  try { Remove-NetNat -Name $NatName -Confirm:$false -ErrorAction Stop; Say "NAT removido." } catch { Say "NAT ja ausente." }
  try { Remove-NetIPAddress -IPAddress $GatewayIp -Confirm:$false -ErrorAction Stop; Say "IP $GatewayIp removido." } catch { Say "IP $GatewayIp ja ausente." }
  try { Set-NetIPInterface -InterfaceAlias $InterfaceAlias -Forwarding Disabled -ErrorAction Stop; Say "Forwarding desligado." } catch { Say "Forwarding: $($_.Exception.Message)" }
  Say "Pronto. Rede do PC voltou ao estado original."
  exit 0
}

Say "=== Configurando o PC como gateway $GatewayIp para a leitora ($DeviceSubnet) ==="

# 1) adiciona o IP do gateway que a leitora procura
try {
  New-NetIPAddress -InterfaceAlias $InterfaceAlias -IPAddress $GatewayIp -PrefixLength $GatewayPrefix -ErrorAction Stop | Out-Null
  Say "IP $GatewayIp/$GatewayPrefix adicionado em '$InterfaceAlias'."
} catch {
  if ($_.Exception.Message -match 'already exists|ja existe|Objeto ja existe') { Say "IP $GatewayIp ja existia (ok)." }
  else { Say "Falha ao adicionar IP: $($_.Exception.Message)"; }
}

# 2) liga forwarding na interface
try { Set-NetIPInterface -InterfaceAlias $InterfaceAlias -Forwarding Enabled -ErrorAction Stop; Say "Forwarding ligado em '$InterfaceAlias'." }
catch { Say "Falha ao ligar forwarding: $($_.Exception.Message)" }

# 3) cria o NAT (WinNAT) para o subnet da leitora
$existing = Get-NetNat -ErrorAction SilentlyContinue
if ($existing) { Say ("NATs existentes: " + (($existing | ForEach-Object { $_.Name + '(' + $_.InternalIPInterfaceAddressPrefix + ')' }) -join ', ')) }
try {
  New-NetNat -Name $NatName -InternalIPInterfaceAddressPrefix $DeviceSubnet -ErrorAction Stop | Out-Null
  Say "NAT '$NatName' criado para $DeviceSubnet."
} catch {
  if ($_.Exception.Message -match 'already|ja') { Say "NAT '$NatName' ja existia (ok)." }
  else { Say "Falha ao criar NAT: $($_.Exception.Message)"; Say "Se houver NAT com prefixo sobreposto, remova-o ou ajuste -DeviceSubnet." }
}

Say ""
Say "FEITO. A leitora agora tem gateway ($GatewayIp) com internet via NAT pelo PC."
Say "Proximo: dispare o update do recovery e confira as sessoes NAT:"
Say "   recovery-control.ps1 -Ip 192.168.0.129 -Action hold"
Say "   recovery-control.ps1 -Ip 192.168.0.129 -Action update"
Say "   nat-for-idface.ps1 -Check       (deve listar sessoes vindas de 192.168.0.129)"
Say "Para desfazer tudo depois: nat-for-idface.ps1 -Teardown"
