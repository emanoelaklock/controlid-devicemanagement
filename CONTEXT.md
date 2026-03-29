# CONTEXT.md — Control iD Device Manager

> Este arquivo serve de contexto para continuar o desenvolvimento em novas sessões.

## Visão geral do projeto

Gerenciador de dispositivos de controle de acesso **Control iD** (iDFace Max, iDAcesso, etc), inspirado no **AXIS Device Manager**. Aplicação **desktop Electron** para Windows com interface profissional dark mode.

**Repositório:** `emanoelaklock/controlid-devicemanagement`
**Branch de desenvolvimento:** `claude/add-control-id-files-ujsHc`
**Diretório principal:** `desktop-v2/`
**Versão atual:** 2.0.0

## Arquitetura

```
desktop-v2/
├── src/
│   ├── main/                        # Electron main process (Node.js)
│   │   ├── index.ts                 # Entry point, cria BrowserWindow
│   │   ├── db/
│   │   │   ├── database.ts          # sql.js (SQLite WASM), schema, auto-save
│   │   │   └── queries.ts           # query(), queryOne(), run(), count()
│   │   ├── adapters/
│   │   │   ├── registry.ts          # Registro de adapters por fabricante
│   │   │   └── controlid.adapter.ts # Implementação Control iD (HTTP API .fcgi)
│   │   ├── services/
│   │   │   ├── discovery.service.ts # Scanner de rede por faixa IP
│   │   │   ├── job.service.ts       # Fila de tarefas em lote
│   │   │   └── heartbeat.service.ts # TCP ping a cada 5s + DHCP IP tracking
│   │   ├── ipc/
│   │   │   └── handlers.ts          # 50+ IPC handlers (devices, people, config, etc)
│   │   └── utils/
│   │       └── encryption.ts        # AES-256-CBC para credenciais
│   ├── preload/
│   │   └── preload.ts               # contextBridge com whitelist de channels
│   └── renderer/                    # React + Tailwind (dark mode)
│       ├── App.tsx                   # Router por estado (sem react-router)
│       ├── components/Sidebar.tsx
│       ├── hooks/useIpc.ts           # Wrapper tipado para IPC
│       ├── pages/
│       │   ├── DashboardPage.tsx     # Stats, fleet health %, segurança, firmware
│       │   ├── DevicesPage.tsx       # Tabela + seleção múltipla + painel lateral
│       │   ├── DiscoveryPage.tsx     # Scanner com auto-add + auto-auth
│       │   ├── PeoplePage.tsx        # Gestão de pessoas + sync dispositivos
│       │   ├── TemplatesPage.tsx     # Templates de configuração
│       │   ├── FirmwarePage.tsx      # Versões de firmware + outdated
│       │   ├── JobsPage.tsx          # Fila de tarefas
│       │   ├── CredentialsPage.tsx   # Credenciais com checkbox "default"
│       │   └── AuditPage.tsx         # Log de auditoria
│       └── styles/index.css
├── package.json
├── tsconfig.main.json               # Compila src/main + src/preload → dist/
├── tsconfig.json                     # Referência para renderer
├── vite.config.ts                    # Renderer build → dist/renderer/
├── tailwind.config.js
└── postcss.config.js
```

## Stack técnica

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 32 |
| Frontend | React 18 + Tailwind CSS (dark mode) |
| Build frontend | Vite 5 |
| Database | sql.js (SQLite via WASM, zero dependência nativa) |
| IPC | contextBridge + ipcMain.handle (sem nodeIntegration) |
| Credenciais | AES-256-CBC |
| Heartbeat | TCP socket ping (net.Socket) |
| Discovery | HTTP probe + auto-auth com credenciais |
| API dispositivos | Control iD REST API (.fcgi endpoints) |

## Funcionalidades implementadas

| Feature | Status | Detalhes |
|---------|--------|---------|
| Discovery de rede | ✅ Funcional | Scan por IP range, auto-add, auto-auth com credencial default |
| Inventário de dispositivos | ✅ Funcional | Tabela com status, IP clicável, MAC, serial, firmware, DHCP |
| Heartbeat real-time | ✅ Funcional | TCP ping a cada 5s, status online/offline sem trocar de tela |
| DHCP IP tracking | ✅ Funcional | Quando device DHCP fica offline, escaneia subnet pelo MAC |
| Credenciais | ✅ Funcional | CRUD, checkbox default, criptografia AES-256 |
| Test Connection | ✅ Funcional | Autentica e preenche MAC, Model (iDFace Max), firmware |
| Batch Test/Reboot/Backup | ✅ Funcional | Seleção múltipla + job queue com progresso |
| Ações no dispositivo | ✅ Funcional | Open Door, Reboot, Test Connection |
| Backup de config | ✅ Funcional | Backup versionado por dispositivo |
| Templates de config | ✅ Funcional | Criar template de device, aplicar em lote |
| Firmware management | ✅ Funcional | Comparar versões, detectar outdated |
| Gestão de pessoas | ✅ Funcional | CRUD pessoas, vincular a dispositivos, sync para device |
| Grupos de dispositivos | ✅ Funcional | Criar grupos, atribuir dispositivos |
| Export CSV | ✅ Funcional | Exportar devices e audit log |
| Dashboard | ✅ Funcional | Fleet health %, segurança, firmware, atividade |
| Audit log | ✅ Funcional | Log com filtro por categoria |
| Edição de nome/IP | ✅ Funcional | Editável no painel lateral |
| IP clicável | ✅ Funcional | Abre interface web do device no navegador |
| **Network Config (IP/DHCP)** | ⚠️ Parcial | UI funciona, mas **não altera IP fisicamente no dispositivo** |

## Problema atual: Network Config não aplica no dispositivo

### Sintoma
O formulário de Network Config (DHCP/Static IP) no painel lateral do dispositivo envia a configuração e reinicia o dispositivo, mas o IP **não muda fisicamente** no dispositivo.

### O que já foi tentado
1. `POST /set_configuration.fcgi` com `{ network: { dhcp_enabled, ip, netmask, gateway } }` — sem efeito
2. `POST /set_configuration.fcgi` com payload flat `{ dhcp_enabled, ip, netmask, gateway }` — sem efeito
3. Reboot automático após set_configuration — dispositivo reinicia mas IP não muda

### O que precisa ser feito
1. **Analisar o log de diagnóstico** — O código atual lê `get_configuration` e `system_information` antes e depois do set, e loga tudo. Executar `npm run dev:main`, clicar "Apply & Reboot" e coletar as linhas `[Network]` do terminal.
2. **Descobrir o formato correto** — Pode ser que a API do iDFace MAX firmware 8.3.1 / 7.9.9 use:
   - Endpoint diferente (ex: `/api/network/set`)
   - Campos com nomes diferentes
   - Necessidade de enviar a config completa (não parcial)
3. **Verificar se a API web do dispositivo faz algum request diferente** — Abrir `http://192.168.1.160` no Chrome, ir em DevTools > Network, mudar o IP pela interface web, e capturar o request HTTP exato que o dispositivo aceita.

### Próximos passos sugeridos
1. Resolver o Network Config
2. Melhorar UX do Discovery (mostrar progresso por IP)
3. Criar PR para mergear no main
4. Gerar `.exe` final com `npm run dist`

## Dispositivos de teste

| IP | Modelo | Firmware | Serial | MAC |
|----|--------|----------|--------|-----|
| 192.168.1.160 | iDFace Max | 8.3.1 | 0X0700/000112 | FC:52:CE:92:D8:D5 |
| 192.168.1.165 | iDFace Max | 8.3.1 | 0X0700/000117 | FC:52:CE:92:D8:F9 |
| 192.168.1.167 | iDFace Max | 8.3.1 | 0X0700/0001C | FC:52:CE:92:D9:13 |
| 192.168.1.176 | iDFace Max | 7.9.9 | 0X0300/0005DE | FC:52:CE:8E:E1:BB |
| + mais ~5 dispositivos | iDFace Max | 8.3.1 | — | — |

**Porta:** 80 (HTTP, não HTTPS)
**Login:** root / (senha cadastrada como credencial default)

## API do Control iD (iDFace Max)

### Endpoints confirmados funcionando
- `POST /login.fcgi` → `{ login, password }` → retorna `{ session }`
- `POST /system_information.fcgi` → retorna info completa (network.mac, version, serial, device_two_names, etc)
- `POST /logout.fcgi`
- `POST /reboot.fcgi`
- `POST /execute_actions.fcgi` → `{ actions: [{ action: "door", parameters: "door=1" }] }`
- `POST /create_objects.fcgi` → criar users/cards no dispositivo

### Endpoint com problema
- `POST /set_configuration.fcgi` com `{ network: {...} }` → Aceita o request mas **não aplica** a mudança de IP

### Estrutura retornada por system_information.fcgi
```json
{
  "network": {
    "mac": "FC:52:CE:92:D8:EC",
    "ip": "192.168.1.174",
    "netmask": "255.255.255.0",
    "gateway": "192.168.1.1",
    "primary_dns": "192.168.1.1",
    "device_hostname": "CID-0X0700-000114",
    "web_server_port": 80,
    "ssl_enabled": false,
    "dhcp_enabled": true,
    "self_signed_certificate": true
  },
  "serial": "0X0700/000114",
  "version": "8.3.1",
  "device_name": "iDFace",
  "device_two_names": "iDFace Max"
}
```

## Como rodar em desenvolvimento

```bash
cd desktop-v2
npm install
npm run dev:main    # Compila main + renderer e abre Electron
```

## Como gerar o .exe

```bash
cd desktop-v2
npm run dist
# Instalador em desktop-v2/release/
```

## Nota sobre prompt/confirm/alert

`prompt()` nativo do browser **não funciona** em Electron com `contextIsolation: true`. O projeto tem um sistema de dialog customizado via IPC:
- `ipc.prompt(title, message, defaultValue)` → abre modal estilizada
- `ipc.confirm(message)` → usa `dialog.showMessageBox` do Electron
- `alert()` e `confirm()` nativos **funcionam** no renderer (são dialogs do browser)

## Git

- **Remote:** `https://github.com/emanoelaklock/controlid-devicemanagement.git`
- **Push requer PAT:** O git proxy da sessão Claude Code falha com 403. Usar:
  ```
  git remote set-url origin https://<PAT>@github.com/emanoelaklock/controlid-devicemanagement.git
  ```
- **O token PAT atual pode ter expirado** — o usuário precisa gerar um novo se necessário.
