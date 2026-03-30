# Documentação API Linha de Acesso — Control iD
> Fonte: https://www.controlid.com.br/docs/access-api-pt/
> Copiado em: 2026-03-29

---

## Sumário de Seções

1. [Introdução à API](#introdução-à-api)
2. [Realizar Login](#realizar-login)
3. [Gerenciamento de Sessão](#gerenciamento-de-sessão)
4. [Objetos — Introdução](#objetos--introdução)
5. [Lista de Objetos](#lista-de-objetos)
6. [Criar Objetos](#criar-objetos)
7. [Carregar Objetos](#carregar-objetos)
8. [Modificar Objetos](#modificar-objetos)
9. [Destruir Objetos](#destruir-objetos)
10. [Reconhecimento Facial — Cadastro por Fotos](#reconhecimento-facial--cadastro-por-fotos)

---

## Introdução à API

Esta documentação facilita o processo de integração aos equipamentos da linha de controle de acesso da Control iD.

Os dispositivos de acesso da Control iD oferecem uma interface de comunicação moderna por API (Application Programming Interface) baseada em TCP/IP (Ethernet) com arquitetura **REST**.

São oferecidos dois modos de funcionamento para a API: **Autônomo (Standalone)** e **Online (Pro ou Enterprise)**.

### Exemplos de Código e Requisições

Repositório GitHub com exemplos em C#, Delphi, Java, NodeJS, Python:
- https://github.com/controlid/integracao/tree/master/Controle%20de%20Acesso

Coleção Postman:
- https://documenter.getpostman.com/view/10800185/SztHW4xo

A maior parte dos exemplos nesta documentação usa **JavaScript** com a biblioteca **jQuery**.

### Modos de Operação

**Autônomo (Standalone):** identificação e autorização no terminal *(recomendado)*

**Online:**
- **Modo Pro:** identificação no terminal e autorização no servidor
- **Modo Enterprise:** identificação e autorização no servidor

### Monitor

Em todos os modos, para monitorar eventos assíncronos (logs de acesso, alarme, giros de catraca, abertura de portas, etc.) é necessário utilizar o serviço **Monitor**.

### Push

Mecanismo proativo onde o equipamento envia periodicamente requisições HTTP ao servidor buscando comandos. O servidor responde com um comando ou com uma resposta vazia.

---

## Realizar Login

O login é o **primeiro método** a ser utilizado — gera a sessão usada em todas as requisições.

**URL:**
```
POST http://{IP_EQUIPAMENTO}/login.fcgi
```

**Body:**
```json
{
  "login": "admin",
  "password": "admin"
}
```

**Resposta:**
```json
{
  "session": "apx7NM2CErTcvXpuvExuzaZ"
}
```

> **Importante:**  
> - Todos os comandos requerem uma sessão válida, exceto `session_is_valid` e `login`.  
> - A sessão deve ser reaproveitada em todas as requisições.  
> - O corpo da requisição deve usar codificação **UTF-8**.  
> - A opção HTTP `Expect: 100-continue` deve estar **desabilitada**.

### Exemplo JavaScript (jQuery)

```javascript
$.ajax({
  url: "/login.fcgi",
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    login: 'admin',
    password: 'admin'
  }),
  success: function(data) {
    session = data.session;
  }
});
```

### Exemplo Java

```java
URL url = new URL("http://192.168.0.129/login.fcgi");
HttpURLConnection conn = (HttpURLConnection) url.openConnection();
conn.setRequestMethod("POST");
conn.setRequestProperty("Content-type", "application/json");
conn.setDoInput(true);
conn.setDoOutput(true);
OutputStream os = conn.getOutputStream();
os.write("{\"login\":\"admin\",\"password\":\"admin\"}".getBytes());
```

### Exemplo C#

```csharp
System.Net.ServicePointManager.Expect100Continue = false;
var request = (HttpWebRequest)WebRequest.Create("http://192.168.0.129/login.fcgi");
request.ContentType = "application/json";
request.Method = "POST";
using (var streamWriter = new StreamWriter(request.GetRequestStream()))
{
  streamWriter.Write("{\"login\":\"admin\",\"password\":\"admin\"}");
}
var response = (HttpWebResponse)request.GetResponse();
```

---

## Gerenciamento de Sessão

### Fazer Login
`POST /login.fcgi`

### Fazer Logout
`POST /logout.fcgi`

### Verificar Validade da Sessão
`GET /session_is_valid.fcgi?session={session}`

### Alterar Usuário e Senha de Login
`POST /set_configuration.fcgi?session={session}`

---

## Objetos — Introdução

Os objetos representam as **estruturas de dados internas** do dispositivo. Com a API, registros podem ser criados, modificados e apagados.

Diagrama de relacionamento entre objetos disponível em:
`https://www.controlid.com.br/docs/access-api-pt/img/public_acfw_er.png`

---

## Lista de Objetos

### `users` — Usuários

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `registration` | string | Matrícula do usuário (**obrigatório**) |
| `name` | string | Nome do usuário (**obrigatório**) |
| `password` | string | Hash da senha (usar `user_hash_password` para gerar) |
| `salt` | string | Salt usado para calcular o hash da senha |
| `user_type_id` | int | Tipo: `1` = Visitante, nulo = Usuário padrão |
| `begin_time` | int | Unix timestamp início de validade (0 = sem verificação) |
| `end_time` | int | Unix timestamp fim de validade (0 = sem verificação) |
| `image_timestamp` | int | Unix timestamp da foto cadastrada (0 = sem foto) |
| `last_access` | int | Unix timestamp do último acesso (0 = sem acesso ainda) |

---

### `change_logs` — Logs de Alterações

Registra operações (inserção, atualização, remoção) nos objetos: `users`, `templates`, `face_templates`, `cards`.  
Limite: 10 mil operações (rotação automática).  
*Disponível atualmente apenas para iDFace.*

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `operation_type` | string | Tipo de operação (**obrigatório**) |
| `table_name` | string | Nome do objeto alterado (**obrigatório**) |
| `table_id` | int | ID do atributo modificado (**obrigatório**) |
| `timestamp` | int | Unix timestamp da operação (**obrigatório**) |

---

### `templates` — Biometrias (impressão digital)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `finger_position` | int | Campo reservado |
| `finger_type` | int | `0` = dedo comum, `1` = dedo de pânico (**obrigatório**) |
| `template` | string base64 | Template biométrico |
| `user_id` | int 64 | ID do usuário proprietário (**obrigatório**) |

---

### `cards` — Cartões de Proximidade

> **Conversão do valor do cartão:**  
> Valor a enviar: `[código de área] * 2^32 + [número do cartão]`  
> Exemplo: cartão `123,45678` → `123 * 2^32 + 45678 = 528281023086`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `value` | unsigned int 64 | Numeração do cartão — **único** (**obrigatório**) |
| `user_id` | int 64 | ID do usuário proprietário (**obrigatório**) |

---

### `qrcodes` — QR Codes

Armazenado como `qrcodes` somente se o **Modo Alfanumérico** estiver ativo. Caso contrário, trata-se como `cards`.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `value` | string | Conteúdo do QR Code — **único** (**obrigatório**) |
| `user_id` | int 64 | ID do usuário proprietário (**obrigatório**) |

---

### `uhf_tags` — Tags UHF

Armazenado como `uhf_tags` somente se o modo **extended** estiver ativo. Caso contrário, trata-se como `cards`.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `value` | string | Valor lido pela tag (hex, ex: "CAFEDAD0") — **único** (**obrigatório**) |
| `user_id` | int 64 | ID do usuário proprietário (**obrigatório**) |

---

### `pins` — PINs de Identificação

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `value` | string | Valor do PIN — **único** (**obrigatório**) |
| `user_id` | int 64 | ID do usuário — **único** (**obrigatório**) |

---

### `alarm_zones` — Zonas de Alarme

| Campo | Tipo | Descrição |
|---|---|---|
| `zone` | int | Identificador da zona (**obrigatório**) |
| `enabled` | int | `1` = habilitado, `0` = desabilitado (**obrigatório**) |
| `active_level` | int | `1` = ativo alto, `0` = ativo baixo (**obrigatório**) |
| `alarm_delay` | int | Tempo de atraso no disparo (ms) (**obrigatório**) |

---

### `user_roles` — Papéis de Usuário

| Campo | Tipo | Descrição |
|---|---|---|
| `user_id` | int 64 | ID do usuário (**obrigatório**) |
| `role` | int | `1` = Administrador (**obrigatório**) |

---

### `groups` — Grupos de Acesso (Departamentos)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `name` | int | Nome do grupo (**obrigatório**) |

---

### `user_groups` — Relação Usuário ↔ Grupo

| Campo | Tipo | Descrição |
|---|---|---|
| `user_id` | int 64 | ID do usuário (**obrigatório**) |
| `group_id` | int | ID do grupo de acesso (**obrigatório**) |

---

### `scheduled_unlocks` — Liberações Agendadas

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `name` | string | Nome da liberação (**obrigatório**) |
| `message` | string | Mensagem exibida durante a liberação |

---

### `actions` — Scripts de Ação

| Campo | Tipo | Descrição |
|---|---|---|
| `group_id` | int 64 | Identificador único (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |
| `action` | string | Nome do arquivo do script (**obrigatório**) |
| `parameters` | string | Parâmetros do script (**obrigatório**) |
| `run_at` | int | `0` = no equipamento usado, `1` = em todos os equipamentos, `2` = no servidor (**obrigatório**) |

---

### `areas` — Áreas

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |

---

### `portals` — Portais (liga duas áreas, sentido único)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador único (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |
| `area_from_id` | int 64 | ID da área de origem (**obrigatório**) |
| `area_to_id` | int 64 | ID da área de destino (**obrigatório**) |

---

### `portal_actions` — Relação Portal ↔ Ação

| Campo | Tipo | Descrição |
|---|---|---|
| `portal_id` | int 64 | ID do portal (**obrigatório**) |
| `action_id` | int 64 | ID da ação (**obrigatório**) |

---

### `access_rules` — Regras de Acesso

> Avaliação: regras de **bloqueio** são verificadas antes das de **liberação**.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |
| `type` | int | `0` = bloqueio, `1` = permissão (**obrigatório**) |
| `priority` | int | Campo reservado (**obrigatório**) |

---

### `portal_access_rules` — Portal ↔ Regra de Acesso

| Campo | Tipo | Descrição |
|---|---|---|
| `portal_id` | int 64 | ID do portal (**obrigatório**) |
| `access_rule_id` | int 64 | ID da regra (**obrigatório**) |

---

### `group_access_rules` — Grupo ↔ Regra de Acesso

| Campo | Tipo | Descrição |
|---|---|---|
| `group_id` | int 64 | ID do grupo (**obrigatório**) |
| `access_rule_id` | int 64 | ID da regra (**obrigatório**) |

---

### `time_zones` — Horários

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |

---

### `time_spans` — Intervalos de Horário

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `time_zone_id` | int 64 | Horário ao qual pertence (**obrigatório**) |
| `start` | int | Início em segundos desde 0h (ex: 3600 = 1h) (**obrigatório**) |
| `end` | int | Fim em segundos desde 0h (**obrigatório**) |
| `sun` | int | Ativo nos domingos (**obrigatório**) |
| `mon` | int | Ativo nas segundas (**obrigatório**) |
| `tue` | int | Ativo nas terças (**obrigatório**) |
| `wed` | int | Ativo nas quartas (**obrigatório**) |
| `thu` | int | Ativo nas quintas (**obrigatório**) |
| `fri` | int | Ativo nas sextas (**obrigatório**) |
| `sat` | int | Ativo nos sábados (**obrigatório**) |
| `hol1` | int | Ativo em feriados tipo 1 (**obrigatório**) |
| `hol2` | int | Ativo em feriados tipo 2 (**obrigatório**) |
| `hol3` | int | Ativo em feriados tipo 3 (**obrigatório**) |

---

### `holidays` — Feriados

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | Identificador (**obrigatório**) |
| `name` | string | Nome (**obrigatório**) |
| `start` | int | Início em Unix timestamp (**obrigatório**) |
| `end` | int | Fim em Unix timestamp (**obrigatório**) |
| `hol1` | int | Pertence ao grupo 1 (0 ou 1) (**obrigatório**) |
| `hol2` | int | Pertence ao grupo 2 (0 ou 1) (**obrigatório**) |
| `hol3` | int | Pertence ao grupo 3 (0 ou 1) (**obrigatório**) |
| `repeats` | int | Repete anualmente (0 ou 1) (**obrigatório**) |

---

### `access_logs` — Logs de Acesso

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `time` | int | Unix timestamp da ocorrência |
| `event` | int | Tipo do evento: `1`=Equipamento inválido, `2`=Parâmetros inválidos, `3`=Não identificado, `4`=Identificação pendente, `5`=Tempo esgotado, `6`=Acesso negado, `7`=Acesso concedido, `8`=Acesso pendente, `9`=Não administrador, `10`=Não identificado via API, `11`=Botoeira, `12`=Interface web, `13`=Desistência (iDBlock), `14`=Sem resposta, `15`=Interfonia (iDFace) |
| `device_id` | int 64 | ID do equipamento |
| `identifier_id` | int | ID do módulo de identificação |
| `user_id` | int | ID do usuário |
| `portal_id` | int | ID do portal |
| `identification_rule_id` | int | ID da regra de identificação |
| `qrcode_value` | string | Valor alfanumérico do QR Code utilizado |
| `uhf_tag` | string | Valor lido pela tag UHF |
| `pin_value` | string | Valor do PIN utilizado |
| `card_value` | int 64 | Número do cartão utilizado |
| `confidence` | int 64 | Grau de confiança do rosto (0 a 1800) |
| `mask` | int 64 | `1` = com máscara, `0` = sem máscara |
| `log_type_id` | int 64 | Tipo de log (iDFlex Attendance) |

---

### `alarm_logs` — Logs de Alarme

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `event` | int | `1`=Alarme ativado, `2`=Alarme desativado |
| `cause` | int | `1-5`=Zona 1-5, `6`=Porta aberta, `7`=Arrombamento, `8`=Dedo pânico, `9`=Violação, `10`=Cartão pânico |
| `user_id` | int 64 | ID do usuário |
| `time` | int | Unix timestamp |
| `access_log_id` | int | ID do log de acesso relacionado |
| `door_id` | int | ID da porta |

---

### `devices` — Equipamentos

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `name` | string | Nome descritivo (**obrigatório**) |
| `ip` | string | Endereço IP (ex: `192.168.0.129`) (**obrigatório**) |

---

### `user_access_rules` — Usuário ↔ Regra de Acesso

| Campo | Tipo | Descrição |
|---|---|---|
| `user_id` | int | ID do usuário (**obrigatório**) |
| `access_rule_id` | int | ID da regra (**obrigatório**) |

> Par `user_id` + `access_rule_id` é **único**.

---

### `area_access_rules` — Área ↔ Regra de Acesso

| Campo | Tipo | Descrição |
|---|---|---|
| `area_id` | int | ID da área (**obrigatório**) |
| `access_rule_id` | int | ID da regra (**obrigatório**) |

> Par `area_id` + `access_rule_id` é **único**.

---

### `catra_infos` — Informações de Catraca (iDBlock)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | Identificador da catraca |
| `left_turns` | int 64 | Revoluções à esquerda |
| `right_turns` | int 64 | Revoluções à direita |
| `entrance_turns` | int 64 | Revoluções de entrada |
| `exit_turns` | int 64 | Revoluções de saída |

---

### `sec_boxs` — Módulo de Acionamento Externo (MAE/Security Box)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | ID da SecBox (sempre `65793`) |
| `version` | int | Versão |
| `name` | string | Nome |
| `enabled` | bool | Habilitada ou não |
| `relay_timeout` | int | Tempo de abertura do relê (ms) |
| `door_sensor_enabled` | bool | Sensor de porta habilitado |
| `door_sensor_idle` | bool | `true` = NO, `false` = NC |
| `auto_close_enabled` | int | `1` = fecha relê quando sensor de porta abrir |

---

### `contacts` — Contatos de Interfonia SIP

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | Identificador |
| `name` | string | Nome |
| `number` | string | Número/ramal |

---

### `access_events` — Eventos de Acesso

Limite: 10 mil eventos (rotação automática).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int 64 | Identificador (**obrigatório**) |
| `event` | string | `"catra"`, `"secbox"`, `"door"` (**obrigatório**) |
| `type` | string | Para catra: `TURN_LEFT`, `TURN_RIGHT`, `GIVE_UP`. Para door/secbox: `OPEN`, `CLOSE` (**obrigatório**) |
| `identification` | string | ID da secbox/porta ou UUID do evento (**obrigatório**) |
| `device_id` | int 64 | ID do equipamento (**obrigatório**) |
| `timestamp` | int | Unix timestamp (**obrigatório**) |

---

### `custom_thresholds` — Limiares Personalizados de Reconhecimento Facial

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | Identificador |
| `user_id` | int | ID do usuário (**obrigatório**) |
| `threshold` | int | Valor do limiar (**obrigatório**) |

---

### `network_interlocking_rules` — Intertravamento via Rede

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | Identificador |
| `ip` | string | IP do dispositivo remoto (**obrigatório**) |
| `login` | string | Login do dispositivo remoto (**obrigatório**) |
| `password` | string | Senha do dispositivo remoto (**obrigatório**) |
| `portal_name` | string | Nome da regra (**obrigatório**) |
| `enabled` | int | `1` = Habilitado, `0` = Desabilitado (**obrigatório**) |

---

## Criar Objetos

```
POST /create_objects.fcgi?session={session}
```

**Parâmetros:**
- `object` *(string)*: Tipo do objeto (ver Lista de Objetos)
- `values` *(array de objetos JSON)*: Objetos a serem criados. Todos devem ter os mesmos campos.

**Resposta:**
- `ids` *(array de int 64)*: IDs dos objetos criados

### Exemplo — Criar usuário

```javascript
$.ajax({
  url: "/create_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users",
    values: [{registration: '0123', name: 'Walter White', password: 'Heisenberg'}]
  })
});
```

**Resposta:**
```json
{"ids": [8]}
```

---

## Carregar Objetos

```
POST /load_objects.fcgi?session={session}
```

**Parâmetros:**
- `object` *(string)*: Tipo do objeto
- `fields` *(array de strings, opcional)*: Campos a receber (padrão: todos)
- `limit` *(int, opcional)*: Número máximo de objetos
- `offset` *(int, opcional)*: Pular os primeiros N registros (requer `limit`)
- `order` *(array de strings, opcional)*: Campos para ordenação + `"ascending"` ou `"descending"`
- `where` *(objeto ou array, opcional)*: Filtros

**Operadores suportados no `where`:** `=`, `==`, `LIKE`, `!=`, `<>`, `NOT LIKE`, `>`, `<`, `>=`, `<=`, `IN`, `NOT IN`

> **Atenção:** Ao filtrar por lista de IDs via `where`, não incluir mais de **999 elementos** explicitamente.

**Resposta:**
- `{NOME_DO_OBJETO}` *(array de objetos JSON)*

### Exemplo — Carregar todos os usuários

```javascript
$.ajax({
  url: "/load_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users"
  })
});
```

### Exemplo — Filtro com where

Retornar logs de acesso com `id > 1` E `event = 7`:

```javascript
$.ajax({
  url: "/load_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    "object": "access_logs",
    "where": [
      {
        "object": "access_logs",
        "field": "id",
        "operator": ">",
        "value": 1,
        "connector": ") AND ("
      },
      {
        "object": "access_logs",
        "field": "event",
        "operator": "=",
        "value": 7
      }
    ]
  })
});
```

### Carregamento de Grandes Bases com Biometrias

Para bases grandes, use o fluxo de sincronismo:

1. `POST /template_sync_init.fcgi` — desabilita sincronização temporariamente
2. `POST /create_objects.fcgi` — carrega os templates
3. `POST /template_sync_end.fcgi` — reabilita e sincroniza

Ambos os endpoints (`template_sync_init` e `template_sync_end`) não recebem parâmetros e retornam resposta vazia.

---

## Modificar Objetos

```
POST /modify_objects.fcgi?session={session}
```

**Parâmetros:**
- `object` *(string)*: Tipo do objeto
- `values` *(objeto JSON)*: Campos e valores a modificar
- `where` *(objeto JSON, opcional)*: Filtro dos objetos a modificar

---

## Destruir Objetos

```
POST /destroy_objects.fcgi?session={session}
```

**Parâmetros:**
- `object` *(string)*: Tipo do objeto
- `where` *(objeto JSON)*: Critério de seleção dos objetos a excluir

---

## Reconhecimento Facial — Cadastro por Fotos

As funções abaixo são para equipamentos com **reconhecimento facial** (iDFace, etc.).  
Não é necessário lidar com templates — basta incluir ou atualizar a foto do usuário.

---

### Obter Foto de Usuário

```
GET /user_get_image.fcgi?session={session}&user_id={id}&get_timestamp={0|1}
```

**Resposta quando `get_timestamp=0`:** imagem JPEG direta  
**Resposta quando `get_timestamp=1`:**
```json
{
  "timestamp": 1624997578,
  "image": "/9j/4AAQSkZJRg..."
}
```

---

### Listar Usuários com Foto Cadastrada

```
GET /user_list_images.fcgi?session={session}&get_timestamp={0|1}
```

**Resposta quando `get_timestamp=1`:**
```json
{
  "image_info": [
    {"user_id": 1, "timestamp": 1628203752},
    {"user_id": 2, "timestamp": 1628203752}
  ]
}
```

---

### Obter Lista de Fotos

```
POST /user_get_image_list.fcgi?session={session}
```

Limite: **100 fotos** por requisição.

**Body:**
```json
{"user_ids": [1, 2, 3]}
```

**Resposta:**
```json
{
  "user_images": [
    {"id": 1, "timestamp": 1626890032, "image": "/9j/4AAQSkZJRg..."},
    {"id": 2, "error": {"code": 1, "message": "User does not exist"}}
  ]
}
```

---

### Cadastrar Foto de Usuário

```
POST /user_set_image.fcgi?session={session}&user_id={id}&timestamp={unix_ts}&match={0|1}
```

- `Content-Type: application/octet-stream`
- Arquivo de foto enviado no **body**
- Tamanho máximo: **2MB**
- `match=1`: rejeita se rosto já existe para outro usuário

**Resposta:**
```json
{
  "user_id": 123,
  "scores": {
    "bounds_width": 397,
    "horizontal_center_offset": 87,
    "vertical_center_offset": -75,
    "center_pose_quality": 698,
    "sharpness_quality": 105
  },
  "success": false,
  "errors": [{"code": 8, "message": "Low sharpness"}]
}
```

#### Códigos de Erro — Cadastro Facial

| Código | Mensagem | Causa |
|---|---|---|
| 1 | `"Image file not recognized..."` | Erro de parâmetro ou formato inválido |
| 2 | `"Face not detected"` | Nenhum rosto detectado na imagem |
| 3 | `"Face exists"` | Rosto já cadastrado para outro usuário |
| 4 | `"Face not centered"` | Rosto muito deslocado do centro (offset > 1000) |
| 5 | `"Face too distant"` | Rosto muito pequeno (`bounds_width < 60`) |
| 6 | `"Face too close"` | Rosto muito grande (`bounds_width > 800`) |
| 7 | `"Face pose not centered"` | Rosto torto (`center_pose_quality > 400`) |
| 8 | `"Low sharpness"` | Imagem sem nitidez suficiente (`sharpness_quality < 450`) |
| 9 | `"Face too close to image borders"` | Rosto próximo das bordas |

---

### Cadastrar Lista de Fotos (em massa)

```
POST /user_set_image_list.fcgi?session={session}
```

**Body:**
```json
{
  "match": false,
  "user_images": [
    {
      "user_id": 20,
      "timestamp": 1628727478,
      "image": "/9j/4AAQSkZJRg..."
    }
  ]
}
```

**Resposta:** array `results` com resultado individual para cada foto.

---

### Testar Foto (sem cadastrar)

```
POST /user_test_image.fcgi?session={session}
```

- `Content-Type: application/octet-stream`
- Retorna `scores` e `errors`, mas **não armazena** a imagem.

---

### Excluir Foto de Usuário

```
POST /user_destroy_image.fcgi?session={session}
```

**Body (uma das opções):**
```json
{"user_id": 123}
{"user_ids": [1, 2, 3]}
{"all": true}
{"dangling": true}
```

---

### Configurar Remoção de Foto Após Cadastro

Por padrão, fotos são mantidas. Para remover automaticamente após gerar o template:

```javascript
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    general: {
      "keep_user_image": '0'   // '1' = manter, '0' = remover
    }
  })
});
```

---

### Sincronização de Fotos

1. `GET /user_list_images.fcgi?get_timestamp=1` — obter IDs e timestamps
2. Comparar timestamps com banco externo
3. Identificar quais precisam de atualização
4. `POST /user_get_image_list.fcgi` — buscar e enviar as fotos atualizadas

---

## Exemplos de URL Base

Todos os endpoints seguem o padrão:
```
http://{IP_DO_EQUIPAMENTO}/{endpoint}.fcgi?session={session_token}
```

Exemplo com IP `192.168.0.129`:
```
http://192.168.0.129/create_objects.fcgi?session=apx7NM2CErTcvXpuvExuzaZ
```

---

*Documentação copiada de https://www.controlid.com.br/docs/access-api-pt/ — Copyright Control iD 2023*
