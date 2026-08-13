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

## Como rodar

```bash
cd desktop-v2
npm install
npm run dev:main    # Dev mode
npm run dist        # Gera .exe
```

## Git

Push requer PAT: `git remote set-url origin https://<PAT>@github.com/emanoelaklock/controlid-devicemanagement.git`
