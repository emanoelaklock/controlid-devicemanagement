# CONTEXT.md — Control iD Device Manager v2.1

> Este arquivo serve de contexto para continuar o desenvolvimento em novas sessões.

## Visão geral

Gerenciador de dispositivos **Control iD** (iDFace Max, iDAcesso, etc), inspirado no **AXIS Device Manager**. Aplicação **desktop Electron** para Windows.

**Repositório:** `emanoelaklock/controlid-devicemanagement`
**Branch:** `claude/add-control-id-files-ujsHc`
**Diretório:** `desktop-v2/`
**Versão:** 2.0.0
**API docs:** `./controlid_access_api_docs.md`

## Stack

Electron 32 | React 18 | Tailwind CSS (dark) | Vite 5 | sql.js (SQLite WASM) | IPC seguro (contextBridge)

## Funcionalidades v2.0

| Feature | Status |
|---------|--------|
| Discovery de rede (IP range scan) | ✅ |
| Auto-add + auto-auth com credencial default | ✅ |
| Heartbeat TCP a cada 5s | ✅ |
| DHCP IP tracking por MAC | ✅ |
| Locate Device (scan subnet por MAC) | ✅ |
| Test Connection (batch + individual) | ✅ |
| Refresh Devices (batch test all) | ✅ |
| Edição nome/IP inline | ✅ |
| IP clicável (abre web interface) | ✅ |
| Reboot / Open Door / Factory Reset | ✅ |
| Sync Date/Time ({day,month,year,hour,minute,second}) | ✅ |
| Credenciais criptografadas (AES-256) + default checkbox | ✅ |
| Grupos de dispositivos + sidebar filtro | ✅ |
| Colunas ordenáveis (click header) | ✅ |
| Connection History 90 dias | ✅ |
| Export CSV (devices + audit) | ✅ |
| Dashboard (fleet health %, segurança, firmware) | ✅ |
| Firmware management (versões, outdated) | ✅ |
| Audit log com categorias | ✅ |
| Job queue com progresso | ✅ |
| Toast notifications (dark) | ✅ |
| Dialog prompt/confirm via IPC | ✅ |
| Login do sistema | Sem login (Opção 1) |
| Templates de configuração (padronização em lote) | ❌ Removido (revisão v2.1 — recurso não homologado) |
| Compliance check (diff dispositivo × template) | ❌ Removido junto com Templates |
| Auto-update via GitHub Releases (electron-updater) | ✅ v2.1 (requer releases publicados) |
| Network Config remoto (DHCP / IP fixo, modal) | ✅ v2.1 — via set_system_network.fcgi |
| People management | ❌ Removido (via web) |
| Firmware Repair via Web Recovery (individual + lote) | ✅ v2.2 — reboot_recovery.fcgi + cgi/*.sh |
| Enter/Exit Recovery manual no painel do device | ✅ v2.2 |

## v2.1 — Descobertas importantes (correções de API)

1. **Sessão via query param**: a API oficial espera `?session=XXX` na URL, não cookie.
   O adapter agora envia nos dois (query param + cookie). Era a causa provável de
   get/set_configuration "não funcionarem".
2. **get_configuration.fcgi exige body com módulos e campos**:
   `{"general": ["beep_enabled", ...]}`. Corpo vazio `{}` retorna `{}` (não é bug do device).
3. **set_configuration.fcgi**: body `{"general": {"beep_enabled": "1"}}` — valores SEMPRE strings.
4. Catálogo de módulos/campos suportados: `desktop-v2/src/main/adapters/controlid.catalog.ts`
   (fonte: https://www.controlid.com.br/docs/access-api-pt/configuracoes/parametros-configuracao/).
   Leitura é feita módulo a módulo para tolerar módulos não suportados por modelo/firmware.
5. **Rede via set_system_network.fcgi** (set_configuration NÃO aplica rede).
   Payload verificado por engenharia reversa do bundle da web UI do iDFace Max
   fw 8.7.3 (chunk 5188 — service `setSystemNetwork`): enviar o objeto COMPLETO:
   `{interface:"1", ip, netmask, gateway, primary_dns, secondary_dns,
   custom_hostname_enabled, device_hostname, web_server_port, ssl_enabled,
   self_signed_certificate, ten_mbps, dhcp_enabled}` com `?session=` na query.
   - DNS é `primary_dns`/`secondary_dns` — a doc oficial diz dns_primary/dns_secondary (ERRADA).
   - Flag de DHCP é `dhcp_enabled` (boolean). `interface`: "1" = Ethernet, "2" = Wi-Fi.
   - O adapter lê a config atual (system_information → network) e sobrepõe as mudanças,
     preservando ten_mbps/ssl/hostname atuais.
6. **Primeiro login bloqueia comandos de rede**: com credencial de fábrica
   (admin/admin), login.fcgi responde `message: "First Web Login. Please Change
   the Credentials"` e o firmware retorna 401 `Invalid access level for command
   set_system_network` (e set_vpn_*) — enquanto set_configuration segue OK.
   A web UI força troca de senha antes de entrar, por isso nunca esbarra nisso.
   O adapter detecta o estado no login e o handler traduz o 401 em instrução
   clara: usar "Set Credentials" no device e tentar de novo.
   - UI: modal "Network Configuration" no painel do dispositivo (DHCP ↔ IP fixo),
     prefill via `devices:get-network` (lê o bloco network do system_information).
7. **Onboarding/comissionamento remoto de fábrica** (VALIDADO ponta a ponta em
   fw 8.7.3: reset físico → onboarding remoto → reboot → tela normal confirmada).
   O assistente físico (idioma → país → termos → login web) tem etapas de API
   SEPARADAS. Trocar só a senha (`change_login`) deixa a leitora presa no assistente
   e ela **volta pro idioma após reboot**. Sequência correta (ordem da web UI):
   1. `set_configuration {general:{language:"pt_BR"}}`
   2. `finish_init_language.fcgi` — **POST SEM CORPO** (corpo `{}` NÃO persiste; foi o bug).
   3. `accept_legal_terms.fcgi {country_code:"BR"}`
   4. `change_login.fcgi {login,password}` (por último — invalida a sessão).
   - As 3 primeiras são idempotentes (seguras de re-rodar em device já OK).
   - `is_first_web_login.fcgi` → `{is_first_web_login:true|false}` detecta first-boot;
     após `change_login` vira `false`, então NÃO serve para recuperar leitora presa
     no meio → por isso existe o `finishSetup` (roda só as 3 etapas, incondicional).
   - **IP de fábrica = `192.168.0.129` (estático)**. Após factory reset a leitora
     volta para esse IP/sub-rede — some da rede DHCP até ser reconfigurada.
   - A API FICA acessível durante o assistente de fabrica (dá pra comissionar remoto).
   - Adapter: `commissionDevice` (onboarding+credencial, usado no "Set Credentials")
     e `finishSetup` (só onboarding, botão "Finish Setup" p/ recuperar leitora presa).
   - Reset de fábrica mantendo rede: `reset_to_factory_default.fcgi {keep_network_info:true}`.

## v2.2 — Firmware Repair via Web Recovery

**A API pública NÃO tem endpoint de upload de binário de firmware** (verificado na doc
oficial access-api-pt e na doc antiga api_idaccess_V2.6.8). Versões NOVAS são baixadas
pelo próprio equipamento (botão de update na tela About / web UI). O que a API expõe:

- `POST /reboot_recovery.fcgi` (documentado oficialmente, corpo VAZIO, `?session=`) —
  reinicia no modo Web Recovery.
- **Web Recovery** (validado em iDFace Max real — ver `desktop-v2/tools/recovery-control.ps1`):
  servidor HTTP puro na **porta 80** (independe de SSL/porta do firmware normal),
  título da página contém "Recovery", **sem autenticação**. Ações via GET:
  - `/cgi/run_update.sh` — reaplica o firmware armazenado, **MANTÉM config**
  - `/cgi/run_factory_update.sh` — reinstala e **APAGA toda a config** (device volta
    admin/admin e possivelmente IP 192.168.0.129)
  - `/cgi/reboot_normal.sh` — boota no modo normal
  - `/cgi/reboot_recovery.sh` — reboota FICANDO em recovery ("hold", prende device em loop)
  - `/cgi/read_status.sh` — texto de progresso; termina com `FIM:`/`FINISH:` (erro se contiver "error")

Implementação: `controlid.adapter.ts` → `isInRecovery`/`enterRecovery`/`exitRecovery`/
`repairFirmware` (orquestração completa: entra em recovery — ou espera um boot loop passar
por recovery e prende com hold — roda update, monitora status até 10 min, reboot normal,
espera o firmware voltar até 5 min e confirma a versão). Handlers: `firmware:repair`
(job `firmware_upgrade`, sequencial = rollout escalonado) e `devices:recovery`
(status/enter/exit). UI: Firmware page (botão Repair por device + banner), Devices
(batch "Repair FW"; painel: Repair Firmware, Enter/Exit Recovery, Factory Reinstall
com confirmação digitada "ERASE").

## v2.1 — Bugs corrigidos

- `person_devices.synced_at` gravava a string literal `'${nowLocal()}'` (aspas erradas).
- `devices:locate` usava sempre o primeiro adapter em vez do adapter do fabricante.
- `devices:update` aceitava qualquer coluna no SET (agora whitelist).
- `dialog:prompt` com canal IPC global (cross-talk entre prompts simultâneos).
- `config:backup` salvava `{}` (dependia do get_configuration quebrado).
- JobsPage não mostrava a mensagem por dispositivo (agora mostra nome, IP e resultado).

## Dispositivos testados

| Modelo | Firmware | Porta | Protocolo |
|--------|----------|-------|-----------|
| iDFace Max | 8.3.1 | 80 | HTTP |
| iDFace Max | 7.9.9 | 80 | HTTP |

## API Control iD — Endpoints confirmados

| Endpoint | Funciona | Uso |
|----------|----------|-----|
| POST /login.fcgi | ✅ | `{login, password}` → `{session}` |
| POST /logout.fcgi | ✅ | |
| POST /system_information.fcgi | ✅ | Retorna tudo: network.mac, version, device_two_names |
| POST /load_objects.fcgi | ✅ | `{object: "access_rules"}` etc |
| POST /create_objects.fcgi | ✅ | `{object, values}` |
| POST /execute_actions.fcgi | ✅ | `{actions: [{action:"door"}]}` |
| POST /reboot.fcgi | ✅ | |
| POST /set_system_time.fcgi | ✅ | `{day,month,year,hour,minute,second}` |
| POST /reset_to_factory_default.fcgi | ✅ | `{keep_network_info: true}` |
| POST /get_configuration.fcgi | ⚠️ | Retorna `{}` no iDFace Max |
| POST /set_configuration.fcgi | ⚠️ | timezone funciona, rede não aplica |
| GET /logo.fcgi?id=N | ⚠️ | Lê logo, não testado escrita |

## Pendências (resolver depois)

Relacionadas ao empacotamento do `.exe` (`npm run dist` → `release/ControlID-DeviceManager-Setup-<versão>.exe`):

- [ ] **Code signing**: a build NÃO é assinada → Windows SmartScreen mostra "aplicativo
      não reconhecido" no 1º run (funciona via "Mais informações → Executar assim mesmo").
      Resolver exige certificado de code signing (pago) + configurar no electron-builder.
- [ ] **Ícone do app**: usa o ícone padrão do Electron. O `package.json` referencia
      `assets/icon.ico`, que não existe. Adicionar `desktop-v2/assets/icon.ico` e rebuildar.
- [ ] **Auto-update / GitHub Release**: `publish` (GitHub) + `electron-updater` já
      configurados. Para ativar a atualização automática, publicar o release com o
      instalador + `latest.yml`: `gh release create v<versão> release/ControlID-DeviceManager-Setup-<versão>.exe release/latest.yml`.

## Como rodar

```bash
cd desktop-v2
npm install
npm run dev:main    # Dev mode
npm run dist        # Gera .exe
```

## Git

Push requer PAT: `git remote set-url origin https://<PAT>@github.com/emanoelaklock/controlid-devicemanagement.git`
