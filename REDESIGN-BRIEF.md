# Prompt para Claude Code — Redesign do Device Manager (desktop-v2)

> Cole este arquivo (ou aponte o Claude Code para ele) dentro do repo `controlid-devicemanagement`.

---

Implemente o redesign da interface do **desktop-v2** (Electron + React + TypeScript + Tailwind) conforme os arquivos de referência nesta pasta.

## Sobre os arquivos de design

Os `.dc.html` desta pasta são **referências de design em HTML** (protótipos navegáveis — abra no navegador), NÃO código de produção. A tarefa é **recriar essas telas no ambiente existente do desktop-v2** usando os padrões já estabelecidos (React function components, Tailwind, IPC via preload, páginas em `src/renderer/pages/`).

- `Device Manager - Redesign.dc.html` — o design novo (alvo). Tem 3 telas navegáveis: Devices, Device detail e Connection health, + toggle de tema claro/escuro.
- `Devices - Layout Atual.dc.html` — recriação do layout atual, só para comparação.
- `_ds/` — tokens CSS do design system (fonte da verdade para cores/tipografia/espaçamento, incl. tema escuro em `tokens/semantic.css`).

## Fidelidade

**Alta (hi-fi).** Recriar pixel-perfect: cores, tipografia, raios, espaçamentos e estados descritos abaixo. Onde este README e o HTML divergirem, o HTML vence.

## Design tokens (mapear no `tailwind.config.js`)

Paleta Service Report — cor = significado, nunca decorativa:

- `sr-blue #1E8AE0` — ação primária, info, nav ativa
- `sr-green #179A47` — online / ok
- `sr-yellow #F7B81E` — atenção / instável (texto sempre escuro sobre amarelo)
- `sr-orange #F4861F` — deslocamento/aviso secundário
- `sr-red #E5403A` — offline / erro / danger zone
- `sr-purple #8E45B5`, `sr-pink #D63384` — seções auxiliares

Cada status tem família de 3 tons (`-bg` suave, `-fg` texto legível AA, `-m` marca saturada) — valores exatos em `_ds/tokens/colors.css`. Tema escuro: variáveis re-declaradas sob `[data-theme="dark"]` em `_ds/tokens/semantic.css` — copie os valores de lá, não invente.

Neutros (claro): fundo `#F3F4F8`, card `#FFFFFF`, divisor `#ECEEF3`, borda de input `#DCE0E8`, texto `#1B1E26`, secundário `#7C8290`, títulos `#243456`.

Tipografia: **Manrope** (300–800, Google Fonts). Body 13.5px/500; h1 20px/700 tracking -0.4px; labels de coluna 11px/600 UPPERCASE tracking +1.1px; números sempre `tabular-nums`. Big numbers (KPI) 800/tight.

Raios: cards 16px, controles/inputs 11px, pills/badges 999. Cards: borda 1px `#ECEEF3` + sombra `0 1px 2px rgba(16,24,40,.06)`. Hover de linha: fundo `#F3F4F8`. Focus: ring 3px `rgba(30,138,224,.15)`. Sem emoji — ícones line-SVG estilo Lucide, stroke ~1.9.

## Estrutura geral (substitui o layout atual de 3 painéis)

Sidebar 240px, fundo branco, borda direita:
- Logo: quadrado azul arredondado com ícone monitor + "Control iD / Device Manager".
- Grupos de nav com eyebrows `MONITOR` (Dashboard, Devices, **Connection health** ← página NOVA), `OPERATE` (Discovery, Firmware, Configuration, Tasks), `SECURITY` (Credentials, Audit log).
- Item ativo: fundo na cor da seção (azul p/ Devices, laranja p/ Connection health), texto branco, sombra colorida suave.

Topbar sticky: título da tela, badges "N online" (verde) e "N offline" (vermelho) com dot, e botão ghost de toggle de tema (persistir escolha; aplicar `data-theme="dark"` na raiz).

## Tela 1 — Devices (`DevicesPage.tsx`)

Remove a coluna lateral de Groups e o painel direito de detalhe. Em vez disso:

1. **Linha de filtros**: pills de grupo (All devices, Ungrouped, + grupos do banco, cada uma com contagem; ativa = fundo azul/texto branco), busca (name/IP/MAC/serial), e à direita: `↻ Refresh`, `Export (CSV)` (ghost) e `+ Add device` (primário azul).
2. **Barra de ações em lote** — aparece só com seleção ≥1: fundo azul-claro `--sr-info-bg`, contador "N selected", ações ghost (Test connection, Backup, Set credentials, Set NTP, Harden, Audit), Reboot (outline âmbar), Repair firmware (vermelho).
3. **Tabela** em card (radius 16): colunas `checkbox | Status | Name | IP address | Model | Serial | Firmware | MAC address | DHCP | Uptime 7d | Last heartbeat | ›`.
   - Status = badge pill com dot: Online (verde), Unstable (amarelo, 3+ quedas em 24h), Offline (vermelho).
   - **Uptime 7d** (NOVO): mini-barra 42×6px + % — verde ≥99.5, amarelo ≥95, vermelho abaixo. Calculado do histórico de `device_events` existente.
   - Clique na linha → navega para a página de detalhe (não abre mais painel lateral). Header da tabela com fundo `#F3F4F8`.
4. Rodapé discreto: "N device(s) in «grupo» · heartbeat every 2 min · click a row to open the device".

## Tela 2 — Device detail (página dedicada, rota/estado novo)

Breadcrumb: botão ghost `‹ All devices` + "Devices / {grupo} / **{nome}**".

Grid `1fr 340px`:

**Coluna principal:**
- **Header card** com borda esquerda 4px na cor do status: nome (19px/700) + badge de status; subtítulo "iDFace Max · IP · grupo · last heartbeat …"; à direita `Test connection` (primário) e `Open door` (verde).
- **3 cards lado a lado** (grid 3 colunas), cada um com eyebrow uppercase e linhas label/valor divididas por hairline:
  - *Status & heartbeat*: Status, Last heartbeat, Uptime 7d (barra), Drops 24h/7d, Monitoring "every 2 min".
  - *Network*: IP (link), MAC, DHCP, Gateway, Netmask, HTTPS.
  - *Equipment*: Model, Serial, Firmware, Manufacturer, Group (select editável), Credential (select).
- **Card Actions** — as ~15 ações atuais em linhas por categoria (label 110px + botões ghost sm em flex-wrap):
  - Connectivity: Locate, Sync date/time, Network (DHCP/static IP)
  - Configuration: Edit configuration, Finish setup (wizard), Diagnostic logs, Audit logs
  - Recovery: Reboot e Repair firmware (outline âmbar), Enter/Exit recovery (ghost)
  - Danger zone (label vermelho): Factory reinstall, Factory reset, Delete device (todos vermelhos)

**Coluna direita (340px):**
- *Connection history · 90d* com badge "N drops" (âmbar/vermelho conforme volume); linhas dot verde/vermelho + evento + timestamp.
- *Config backups (N)* com botão `Backup now` (outline verde).

## Tela 3 — Connection health (página NOVA — motivação: ver de uma vez quem está caindo, sem checar um a um)

1. **4 KPIs**: Devices (azul), Online now (verde), Offline now (âmbar), Unstable · 24h (roxo, "3+ drops in 24 hours"). Número 800/34px+, ícone em tile tintado.
2. **Tabs**: `Problems (N)` (default, contador vermelho) | `All devices`.
3. **Tabela**: `Status | Device | Group | Drops 24h | Drops 7d | Availability 7d (barra 96px + %) | Last seen | ›` — ordenada por severidade: offline primeiro, depois mais quedas. Drops ≥3 em vermelho, 1–2 âmbar, 0 cinza. Clique → detalhe do device.
4. Aba Problems vazia → estado de sucesso "All devices stable".

**Dados**: derivar de `device_events` (já registra connect/disconnect): `drops_24h`, `drops_7d`, `availability_7d` (% do tempo online na janela, via pares disconnect→connect), `unstable = drops_24h ≥ 3`. Computar no main process (SQL) e expor via IPC novo, ex. `devices:health`.

## Estado & comportamento

- Navegação de telas: seguir o padrão atual do `App.tsx` (union type `Page`) adicionando `connection-health` e a rota de detalhe com `deviceId`.
- Tema: `light | dark` em `localStorage`; `data-theme="dark"` na raiz flipa as variáveis.
- Seleção em lote, busca e filtro de grupo continuam com a semântica atual da DevicesPage.
- Transições ~120ms ease; respeitar `prefers-reduced-motion`.
- Idioma da UI: **inglês** (como hoje).

## Escopo

Fase 1 = estas 3 telas. Dashboard, Discovery, Firmware, Configuration, Tasks, Credentials e Audit log mantêm as features atuais e recebem o mesmo tratamento visual (sidebar/topbar/tokens) depois.
