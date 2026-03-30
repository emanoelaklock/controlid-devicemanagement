# CONTEXT.md — Control iD Device Manager v2.0

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
| Templates de configuração | ❌ Removido (get_configuration retorna vazio) |
| Network Config remoto | ❌ Removido (API não aplica) |
| People management | ❌ Removido (via web) |

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
