# Roteiro de teste v2.2 — validação em leitora real

Valida as features da v2.2 (firmware repair, editor de configuração/templates/
compliance, backup agendado, NTP, hardening, locate físico) contra um **iDFace de
bancada**. Cada teste combina a ação pela UI do app com um script de `tools/` como
**observador independente** (fonte da verdade), rodado numa segunda janela.

> ⚠️ Use SEMPRE uma leitora de bancada, nunca uma em produção. Vários testes
> derrubam a conexão por minutos (firmware repair), trocam porta (HTTPS) ou
> apagam dados (factory).

---

## 0. Pré-requisitos

- Leitora iDFace na mesma rede do PC, IP conhecido (ex.: `192.168.1.177`).
  Anote **IP, MAC, serial, versão de firmware** iniciais (tela do app após Test
  Connection, ou `probe-state.ps1`).
- App rodando em dev: `cd desktop-v2 && npm run dev`.
- No app: **Discovery** → achar a leitora → **Set Password** (ou Devices → Add →
  Set Credentials). Confirme **Test Connection = online** antes de começar.
- Uma credencial marcada como *default* em Credentials.
- Terminal PowerShell aberto em `desktop-v2/tools/` para os observadores.
- Defina uma vez, para encurtar os comandos:
  ```powershell
  $ip = '192.168.1.177'; $user = 'admin'; $pass = 'SUA_SENHA'
  ```

Baseline recomendada antes de tudo — deixe rodando numa janela à parte; ele grava
`system_information` + logs a cada 5 s e marca todas as quedas de conexão:
```powershell
powershell -ExecutionPolicy Bypass -File .\diagnose-recovery.ps1 -Ip $ip -User $user -Pass $pass
```
Esse `events.log` vira a linha do tempo de referência para TODOS os testes abaixo.

Ordem sugerida: **do menos destrutivo para o mais destrutivo** (1 → 8). Pare no
primeiro que falhar e me traga o `events.log` + o output do observador.

---

## 1. Editor de configuração ao vivo (menos arriscado — comece por aqui)

O ponto crítico é confirmar que `get_configuration`/`set_configuration` funcionam
neste firmware (na v2.0 retornavam `{}`; a correção da sessão via query param deve
ter resolvido — é o que este teste comprova).

**Passos (app):** Devices → selecionar a leitora → painel → **Edit Configuration**.

**Esperado:**
- O modal abre e lista módulos com valores preenchidos (não vazio). Se vier vazio,
  o `get_configuration` ainda não funciona neste modelo → me avise (é o achado).
- Mude **um** campo de baixo risco, ex.: `general.beep_enabled` (Som de beep) →
  desativar. Campo fica marcado em âmbar. **Apply changes**.

**Verificação independente:** reabra o modal (ou rode um `get` cru) e confirme que
o valor persistiu. Cru:
```powershell
$s = (Invoke-RestMethod "http://$ip/login.fcgi" -Method Post -Body (@{login=$user;password=$pass}|ConvertTo-Json)).session
Invoke-RestMethod "http://$ip/get_configuration.fcgi?session=$s" -Method Post -Body (@{general=@('beep_enabled')}|ConvertTo-Json)
```
Deve mostrar `beep_enabled = "0"`. Reverta ativando de novo pela UI.

**Também confirme na leitora física:** o beep de toque na tela deve ter sumido.

---

## 2. Backup + Restore (painel do device)

**Passos (app):** painel → seção **Config Backups** → **Backup now**. Deve aparecer
`v1` com data. Faça uma pequena mudança pela UI (item 1), depois **Restore** do v1.

**Esperado:** toast "Backup v1 saved" e depois "Backup v1 restored"; o campo que
você mudou volta ao valor do backup. Item registrado em **Audit Log**.

**Verificação:** o backup não pode ser `{}`. Se o botão "Backup now" falhar com
"Device returned no configuration", o get_configuration está vazio (ver item 1).

---

## 3. Backup agendado

Não dá para esperar a hora real; force a janela.

**Passos (app):** Configuration → card **Scheduled Backup** → ligar; **Run at** =
a **hora atual** (ex.: se são 14h, escolha 14:00); **Keep last** = 3.

**Esperado:** em até 1 minuto (o poll do scheduler) surge um job
"Scheduled backup of N device(s)" na página **Tasks**, e novos backups aparecem no
painel de cada device. Rode de novo em dias diferentes para ver a retenção podar
além de 3 (ou baixe **Keep last** e rode manualmente algumas vezes).

**Verificação:** Audit Log tem a entrada `scheduled_backup`. Reabrir o app e repetir
no mesmo dia **não** deve disparar de novo (guarda de `backup_last_run`).

---

## 4. NTP em lote

**Passos (app):** Devices → marcar a leitora (checkbox) → barra → **Set NTP** →
Enable, timezone **UTC-3** → Apply. Acompanhe o job em Tasks.

**Verificação independente:**
```powershell
$s = (Invoke-RestMethod "http://$ip/login.fcgi" -Method Post -Body (@{login=$user;password=$pass}|ConvertTo-Json)).session
Invoke-RestMethod "http://$ip/get_configuration.fcgi?session=$s" -Method Post -Body (@{ntp=@('enabled','timezone')}|ConvertTo-Json)
```
Esperado: `enabled="1"`, `timezone="UTC-3"`. Confira também o relógio na tela da
leitora após alguns minutos.

---

## 5. Locate físico (buzzer + tela)

**Passos (app):** painel → **Locate (beep + screen)**.

**Esperado (na leitora física):** 3 beeps curtos e a mensagem "Localizando este
equipamento" na tela por ~10 s. Toast de sucesso no app e entrada `locate_physical`
no Audit Log. É o teste mais rápido e 100% reversível — bom para confirmar que a
sessão/credencial estão OK antes dos testes pesados.

---

## 6. Hardening em lote (HTTPS + SSH)

Observador SSH numa janela à parte, o tempo todo:
```powershell
powershell -ExecutionPolicy Bypass -File .\ssh-probe.ps1 -Ip $ip
```

### 6a. SSH
**Passos (app):** marcar device → **Harden** → SSH = **disable**, HTTPS =
*leave as-is* → Apply. Depois repita com SSH = **enable**.

**Esperado:** o `ssh-probe` mostra "porta 22 fechada" após disable e
"SSH ABERTO | web: 'Control iD'" após enable (pode levar alguns segundos / um
serviço reiniciar).

### 6b. HTTPS (muda a porta — cuidado)
**Passos (app):** marcar device → **Harden** → HTTPS = **enable** → Apply.

**Esperado:** o app atualiza a porta do device para **443** e marca offline
brevemente; em seguida Test Connection volta online em HTTPS. O IP clicável passa a
abrir `https://`. Reverta com HTTPS = **disable** (volta para 80).

**Verificação independente:**
```powershell
# 443 deve responder (certificado self-signed é esperado):
Test-NetConnection $ip -Port 443
```
Se após habilitar HTTPS o device sumir (não volta em 443), me traga o `events.log`
do `diagnose-recovery` — pode ser que este firmware use campo/porta diferente.

> Recomendo rodar 6a e 6b **separadamente** (um Apply cada) para isolar qual mudança
> causou o quê, já que o handler aplica SSH antes e HTTPS por último de propósito.

---

## 7. Templates + Compliance

**Passos (app):**
1. Configuration → **+ New** → nome "Padrão bancada".
2. Imponha 2–3 campos seguros, ex.: `general.beep_enabled = Desativado`,
   `ntp.enabled = Ativado`, `ntp.timezone = UTC-3`. **Save**.
3. **Apply to devices…** → marcar a leitora → Apply. Ver job em Tasks (sucesso).
4. Agora **mude na marra** um dos campos impostos pela UI (item 1), ex.: reative o
   beep. 
5. **Compliance check…** → marcar a leitora → Check.

**Esperado:** na primeira compliance (logo após Apply) o device passa
("Compliant"). Após você divergir um campo (passo 4), a compliance marca o device
como **FAILED** na página Tasks, com a diferença no texto do item
(`general.beep_enabled: "1" (expected "0")`), e gera `compliance_failed` no Audit
Log. Esse é o coração do teste — confirma o diff ao vivo × template.

---

## 8. Firmware repair via recovery (MAIS destrutivo — deixe por último)

⚠️ Deixa a leitora **offline vários minutos** e a reinicia. Faça só quando os
demais testes passaram e você puder deixar a bancada dedicada.

Observador dedicado (janela à parte, o tempo todo):
```powershell
powershell -ExecutionPolicy Bypass -File .\probe-state.ps1 -Ip $ip
```
Ele registra as transições porta aberta/fechada e distingue **app normal** de
**recovery** (título da página).

### 8a. Entrar/sair de recovery (sem atualizar — valida só o mecanismo)
**Passos (app):** painel → **Enter Recovery**. Aguarde. Depois **Exit Recovery**.

**Esperado:** `probe-state` mostra a leitora reaparecer com página de **recovery**
("iDFace Max Recovery") após Enter, e voltar ao **app normal** ("Control iD") após
Exit. Confirma `reboot_recovery.fcgi` + o caminho `/cgi/reboot_normal.sh`.

Alternativa de controle manual (fora do app), se quiser dirigir o recovery na mão:
```powershell
powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip $ip -Action status
powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip $ip -Action reboot
```

### 8b. Repair (reinstala firmware, MANTÉM config)
**Passos (app):** painel → **Repair Firmware (recovery)** → confirmar. Acompanhe em
Tasks e no `probe-state`.

**Esperado:** sequência observável — device entra em recovery → update roda
(`recovery-control.ps1 -Action status` mostraria o progresso até `FIM:`) → reboot
normal → o app confirma a versão de firmware e volta **online**, com a **config
preservada** (rechecar item 1). Job em Tasks com a mensagem final e entrada
`firmware_repair` no Audit Log.

Se travar em recovery, dá para forçar a saída:
```powershell
powershell -ExecutionPolicy Bypass -File .\recovery-control.ps1 -Ip $ip -Action reboot
```

### 8c. Factory Reinstall (opcional — APAGA tudo)
Só se puder recomissionar a leitora depois. Painel → **Factory Reinstall** → digitar
`ERASE`. A leitora volta com **admin/admin** e possivelmente IP **192.168.0.129** —
use **Discovery** para reencontrá-la. Depois teste o item 9.

---

## 9. Auditoria de senha de fábrica

Melhor testar logo após um factory reset/reinstall (8c), quando a leitora está de
fato em admin/admin.

**Passos (app):** marcar o device → **Audit**.

**Esperado:**
- Leitora em admin/admin → item **FAILED** em Tasks ("FACTORY CREDENTIALS
  ACCEPTED"), aviso vermelho no painel do device, e item **crítico** no card
  **Security Posture** do Dashboard.
- Após **Set Credentials** (trocar a senha) e novo **Audit** → passa ("OK — factory
  credentials rejected"), o aviso some.
- Device offline durante o audit → item não deve marcá-lo como seguro (fica
  não-auditado).

---

## Checklist de captura (o que me mandar se algo falhar)

Para cada falha, junte:
1. `tools/diag-<ip>/events.log` (linha do tempo geral).
2. O output do observador específico do teste (`probe-state`, `ssh-probe`, etc.).
3. Print do job em **Tasks** (mensagem por device) e das entradas do **Audit Log**.
4. Modelo + firmware exatos da leitora (do `system_information`).

Isso basta para eu localizar se o problema é da chamada de API (payload/endpoint) ou
da orquestração no app.
