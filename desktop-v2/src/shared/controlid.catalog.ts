/**
 * Catalog of Control iD configuration parameters supported by
 * get_configuration.fcgi / set_configuration.fcgi.
 *
 * Source: https://www.controlid.com.br/docs/access-api-pt/configuracoes/parametros-configuracao/
 *
 * The API requires listing module + field names explicitly when reading:
 *   POST /get_configuration.fcgi?session=X  body: {"general": ["beep_enabled", ...]}
 * and nested objects with STRING values when writing:
 *   POST /set_configuration.fcgi?session=X  body: {"general": {"beep_enabled": "1"}}
 *
 * Not every module exists on every model/firmware — reads are done per catalog
 * entry so an unsupported chunk doesn't abort the whole capture. Multiple
 * entries may share the same module name (results are merged).
 *
 * Shared between main (adapter reads/writes) and renderer (friendly editor UI).
 */

export type FieldType = 'bool' | 'enum' | 'number' | 'text';

export interface CatalogField {
  key: string;
  label: string;                                  // PT-BR, mirrors the device web UI
  type?: FieldType;                               // default: 'text'
  options?: { value: string; label: string }[];   // for 'enum'
  unit?: string;                                  // shown next to number inputs
}

export interface CatalogModule {
  module: string;
  label: string;
  fields: CatalogField[];
}

const ONOFF: FieldType = 'bool';

export const CONFIG_CATALOG: CatalogModule[] = [
  {
    module: 'general',
    label: 'Geral',
    fields: [
      { key: 'beep_enabled', label: 'Som de beep', type: ONOFF },
      { key: 'language', label: 'Idioma', type: 'enum', options: [
        { value: 'pt_BR', label: 'Português (BR)' },
        { value: 'en_US', label: 'Inglês' },
        { value: 'spa_SPA', label: 'Espanhol' },
      ] },
      { key: 'auto_reboot_hour', label: 'Hora do reinício automático', type: 'number', unit: '0-23' },
      { key: 'auto_reboot_minute', label: 'Minuto do reinício automático', type: 'number', unit: '0-59' },
      { key: 'clear_expired_users', label: 'Limpar usuários expirados', type: 'enum', options: [
        { value: 'disable', label: 'Desabilitado' },
        { value: 'visitors', label: 'Somente visitantes' },
        { value: 'all', label: 'Todos' },
      ] },
      { key: 'screen_always_on', label: 'Tela sempre ligada', type: ONOFF },
      { key: 'web_server_enabled', label: 'Interface web habilitada', type: ONOFF },
      { key: 'online', label: 'Modo online', type: ONOFF },
      { key: 'local_identification', label: 'Identificação local', type: ONOFF },
      { key: 'exception_mode', label: 'Modo de exceção', type: 'enum', options: [
        { value: 'none', label: 'Nenhum' },
        { value: 'emergency', label: 'Emergência' },
        { value: 'lock_down', label: 'Bloqueio total' },
      ] },
      { key: 'hide_name_on_identification', label: 'Ocultar nome na identificação', type: ONOFF },
      { key: 'password_only', label: 'Identificação somente por senha', type: ONOFF },
      { key: 'keep_user_image', label: 'Manter foto do usuário após cadastro', type: ONOFF },
      { key: 'bell_enabled', label: 'Campainha habilitada', type: ONOFF },
      { key: 'bell_relay', label: 'Relé da campainha', type: 'number' },
      { key: 'relay1_enabled', label: 'Relé 1 habilitado', type: ONOFF },
      { key: 'relay1_timeout', label: 'Tempo do relé 1', type: 'number', unit: 'ms' },
      { key: 'door_sensor1_enabled', label: 'Sensor de porta 1', type: ONOFF },
      { key: 'door_sensor1_idle', label: 'Nível de repouso do sensor 1', type: ONOFF },
      { key: 'ssh_enabled', label: 'Acesso SSH', type: ONOFF },
    ],
  },
  {
    // Second chunk of "general" — split so an unsupported chunk doesn't lose
    // the basic chunk on older firmware. Results merge into the same module.
    module: 'general',
    label: 'Geral (avançado)',
    fields: [
      { key: 'relay1_auto_close', label: 'Fechar relé 1 ao abrir a porta', type: ONOFF },
      { key: 'relay2_enabled', label: 'Relé 2 habilitado', type: ONOFF },
      { key: 'relay2_timeout', label: 'Tempo do relé 2', type: 'number', unit: 'ms' },
      { key: 'door_sensor2_enabled', label: 'Sensor de porta 2', type: ONOFF },
      { key: 'door_sensor2_idle', label: 'Nível de repouso do sensor 2', type: ONOFF },
      { key: 'door1_interlock', label: 'Intertravamento da porta 1 (portas separadas por vírgula)' },
      { key: 'door1_exception_mode', label: 'Modo de exceção da porta 1', type: 'enum', options: [
        { value: 'none', label: 'Nenhum' },
        { value: 'emergency', label: 'Emergência' },
        { value: 'lock_down', label: 'Bloqueio total' },
      ] },
      { key: 'catra_timeout', label: 'Tempo de liberação da catraca', type: 'number', unit: 'ms' },
      { key: 'url_reboot_enabled', label: 'Permitir reinício via endpoint', type: ONOFF },
      { key: 'hide_password_only', label: 'Ocultar senha digitada', type: ONOFF },
      { key: 'password_only_tip', label: 'Texto de dica da senha' },
      { key: 'denied_transaction_code', label: 'Código de transação negada', type: 'number' },
      { key: 'send_code_when_not_identified', label: 'Enviar código quando não identificado', type: ONOFF },
      { key: 'send_code_when_not_authorized', label: 'Enviar código quando não autorizado', type: ONOFF },
      { key: 'daylight_savings_time_start', label: 'Início do horário de verão', type: 'number', unit: 'unix' },
      { key: 'daylight_savings_time_end', label: 'Fim do horário de verão', type: 'number', unit: 'unix' },
      { key: 'ihm_enterprise_mode', label: 'Modo IHM Enterprise', type: ONOFF },
    ],
  },
  {
    // Web UI do equipamento: /facialConfigs/generalConfiguration
    module: 'face_id',
    label: 'Reconhecimento Facial',
    fields: [
      { key: 'liveness_mode', label: 'Rigor da detecção de rosto vivo (liveness)', type: 'enum', options: [
        { value: '0', label: 'Normal' },
        { value: '1', label: 'Rigoroso' },
      ] },
      { key: 'mask_detection_enabled', label: 'Detecção de máscara', type: 'enum', options: [
        { value: '0', label: 'Desabilitada' },
        { value: '1', label: 'Obrigatória' },
        { value: '2', label: 'Recomendada' },
      ] },
      { key: 'max_identified_duration', label: 'Intervalo para reidentificar o mesmo usuário', type: 'number', unit: 'ms' },
      { key: 'limit_identification_to_display_region', label: 'Limitar identificação à região visível da tela', type: ONOFF },
      { key: 'min_detect_bounds_width', label: 'Distância de identificação (11.6 ÷ cm)', type: 'number' },
      { key: 'vehicle_mode', label: 'Modo veículo', type: ONOFF },
    ],
  },
  {
    module: 'face_module',
    label: 'Módulo Facial',
    fields: [
      { key: 'led_ir_brightness', label: 'Brilho do LED infravermelho', type: 'number', unit: '0-100' },
      { key: 'light_threshold_led_activation', label: 'Luminosidade para acionar LEDs brancos', type: 'enum', options: [
        { value: '0', label: 'Nível 0' },
        { value: '1', label: 'Nível 1' },
        { value: '2', label: 'Nível 2' },
        { value: '3', label: 'Nível 3' },
      ] },
    ],
  },
  {
    module: 'camera_overlay',
    label: 'Câmera',
    fields: [
      { key: 'zoom', label: 'Zoom da câmera', type: 'number', unit: '1.0-3.25' },
      { key: 'vertical_crop', label: 'Deslocamento vertical da imagem', type: 'number', unit: '-0.36 a 0.36' },
    ],
  },
  {
    module: 'led_white',
    label: 'LED Branco',
    fields: [
      { key: 'brightness', label: 'Brilho dos LEDs brancos', type: 'number', unit: '0-100' },
    ],
  },
  {
    module: 'identifier',
    label: 'Identificação',
    fields: [
      { key: 'card_identification_enabled', label: 'Identificação por cartão', type: ONOFF },
      { key: 'face_identification_enabled', label: 'Identificação facial', type: ONOFF },
      { key: 'qrcode_identification_enabled', label: 'Identificação por QR Code', type: ONOFF },
      { key: 'pin_identification_enabled', label: 'Identificação por PIN', type: ONOFF },
      { key: 'multi_factor_authentication', label: 'Autenticação multifator', type: ONOFF },
      { key: 'verbose_logging', label: 'Registrar todas as tentativas de acesso', type: ONOFF },
      { key: 'antipassback_enabled', label: 'Anti-passback', type: ONOFF },
      { key: 'antipassback_mode', label: 'Modo anti-passback', type: 'enum', options: [
        { value: 'daily_catra', label: 'Diário (catraca)' },
        { value: 'timed_catra', label: 'Temporizado (catraca)' },
        { value: 'timed', label: 'Temporizado' },
      ] },
      { key: 'antipassback_timeout', label: 'Tempo de bloqueio anti-passback', type: 'number', unit: 'min' },
    ],
  },
  {
    module: 'alarm',
    label: 'Alarme',
    fields: [
      { key: 'door_sensor_enabled', label: 'Alarme do sensor de porta', type: ONOFF },
      { key: 'door_sensor_delay', label: 'Atraso do sensor antes do alarme', type: 'number', unit: 's' },
      { key: 'forced_access_enabled', label: 'Detecção de arrombamento', type: ONOFF },
      { key: 'siren_enabled', label: 'Sirene', type: ONOFF },
      { key: 'siren_relay', label: 'Relé da sirene', type: 'number' },
      { key: 'timed_alarm_timeout', label: 'Duração da sirene', type: 'number', unit: 's' },
    ],
  },
  {
    module: 'bio_id',
    label: 'Biometria Digital',
    fields: [
      { key: 'similarity_threshold_1ton', label: 'Rigor da comparação biométrica (1:N)', type: 'number' },
    ],
  },
  {
    module: 'ntp',
    label: 'NTP / Horário',
    fields: [
      { key: 'enabled', label: 'Sincronização NTP', type: ONOFF },
      { key: 'timezone', label: 'Fuso horário (UTC-12 a UTC+12)' },
    ],
  },
  {
    module: 'monitor',
    label: 'Servidor Monitor',
    fields: [
      { key: 'hostname', label: 'IP do servidor' },
      { key: 'port', label: 'Porta do servidor', type: 'number' },
      { key: 'path', label: 'Caminho do endpoint' },
      { key: 'request_timeout', label: 'Timeout das requisições', type: 'number', unit: 'ms' },
      { key: 'alive_interval', label: 'Intervalo de heartbeat', type: 'number', unit: 'ms' },
      { key: 'inform_access_event_id', label: 'Informar ID do evento de acesso', type: ONOFF },
    ],
  },
  {
    module: 'online_client',
    label: 'Cliente Online',
    fields: [
      { key: 'server_id', label: 'ID do servidor de acesso', type: 'number' },
      { key: 'contingency_enabled', label: 'Contingência em falha do servidor', type: ONOFF },
      { key: 'max_request_attempts', label: 'Máximo de tentativas', type: 'number' },
      { key: 'request_timeout', label: 'Timeout das requisições', type: 'number', unit: 'ms (máx 5000)' },
      { key: 'alive_interval', label: 'Intervalo de reconexão', type: 'number', unit: 'ms' },
    ],
  },
  {
    module: 'push_server',
    label: 'Servidor Push',
    fields: [
      { key: 'push_remote_address', label: 'Endereço do servidor (host:porta)' },
      { key: 'push_request_timeout', label: 'Timeout do push', type: 'number', unit: 'ms' },
      { key: 'push_request_period', label: 'Período entre requisições', type: 'number', unit: 's' },
    ],
  },
  {
    module: 'mifare',
    label: 'Leitor Mifare',
    fields: [
      { key: 'byte_order', label: 'Ordem dos bytes', type: 'enum', options: [
        { value: 'W_26', label: 'W_26 (24 bits)' },
        { value: 'LSB', label: 'LSB (32 bits)' },
      ] },
      { key: 'read_sector', label: 'Setor de leitura', type: 'number' },
      { key: 'read_block', label: 'Bloco de leitura', type: 'number' },
      { key: 'authentication_type', label: 'Tipo de chave', type: 'enum', options: [
        { value: 'A', label: 'Chave A' },
        { value: 'B', label: 'Chave B' },
      ] },
    ],
  },
  {
    module: 'onvif',
    label: 'ONVIF / RTSP',
    fields: [
      { key: 'onvif_enabled', label: 'ONVIF habilitado', type: ONOFF },
      { key: 'onvif_port', label: 'Porta ONVIF', type: 'number' },
      { key: 'rtsp_enabled', label: 'Transmissão RTSP', type: ONOFF },
      { key: 'rtsp_port', label: 'Porta RTSP', type: 'number' },
      { key: 'rtsp_codec', label: 'Codec RTSP', type: 'enum', options: [
        { value: 'mjpeg', label: 'MJPEG' },
        { value: 'h264', label: 'H.264' },
      ] },
    ],
  },
  {
    module: 'catra',
    label: 'Catraca (iDBlock)',
    fields: [
      { key: 'anti_passback', label: 'Anti-dupla entrada', type: ONOFF },
      { key: 'daily_reset', label: 'Reset diário do anti-passback', type: ONOFF },
      { key: 'gateway', label: 'Sentido de entrada', type: 'enum', options: [
        { value: 'clockwise', label: 'Horário' },
        { value: 'anticlockwise', label: 'Anti-horário' },
      ] },
      { key: 'operation_mode', label: 'Modo de operação', type: 'enum', options: [
        { value: 'blocked', label: 'Bloqueada' },
        { value: 'entrance_open', label: 'Entrada livre' },
        { value: 'exit_open', label: 'Saída livre' },
        { value: 'both_open', label: 'Ambas livres' },
      ] },
    ],
  },
  {
    module: 'rs485',
    label: 'RS-485',
    fields: [
      { key: 'enabled', label: 'RS-485 habilitado', type: ONOFF },
      { key: 'legacy_mode', label: 'Modo do protocolo', type: 'enum', options: [
        { value: '0', label: 'Modo 0' },
        { value: '1', label: 'Modo 1' },
        { value: '2', label: 'Modo 2' },
      ] },
      { key: 'receive_timeout', label: 'Timeout de recepção', type: 'number', unit: 'ms' },
    ],
  },
  {
    module: 'rfid',
    label: 'RFID (ASK)',
    fields: [
      { key: 'ask_site_code_size', label: 'Tamanho do código de área', type: 'enum', options: [
        { value: '0', label: '0 bits' },
        { value: '8', label: '8 bits' },
      ] },
      { key: 'ask_user_code_size', label: 'Tamanho do código de usuário', type: 'enum', options: [
        { value: '16', label: '16 bits' },
        { value: '24', label: '24 bits' },
        { value: '32', label: '32 bits' },
        { value: '40', label: '40 bits' },
      ] },
    ],
  },
  {
    module: 'hid',
    label: 'Leitor HID',
    fields: [
      { key: 'format_w37', label: 'Formato W37', type: ONOFF },
      { key: 'w37_cardid_size', label: 'Bits do ID W37', type: 'enum', options: [
        { value: '19', label: '19 bits' },
        { value: '25', label: '25 bits' },
        { value: '35', label: '35 bits' },
      ] },
      { key: 'format_w26', label: 'Formato W26', type: ONOFF },
      { key: 'format_mifare', label: 'Formato Mifare', type: ONOFF },
      { key: 'format_indala_b1', label: 'Formato Indala-B1', type: ONOFF },
      { key: 'format_ask', label: 'Formato ASK', type: ONOFF },
      { key: 'ignore_facility', label: 'Ignorar facility code', type: ONOFF },
    ],
  },
  {
    module: 'osdp',
    label: 'OSDP',
    fields: [
      { key: 'enabled', label: 'OSDP habilitado', type: ONOFF },
      { key: 'pd_address', label: 'Endereço do módulo' },
      { key: 'baud_rate', label: 'Taxa de transmissão', type: 'number', unit: '9600-230400' },
      { key: 'card_read_report_format', label: 'Formato do relatório', type: 'enum', options: [
        { value: 'raw', label: 'Raw' },
        { value: 'wiegand', label: 'Wiegand' },
        { value: 'ascii', label: 'ASCII' },
      ] },
      { key: 'wiegand_size', label: 'Bits da saída Wiegand', type: 'enum', options: [
        { value: '26', label: '26 bits' },
        { value: '32', label: '32 bits' },
        { value: '34', label: '34 bits' },
        { value: '66', label: '66 bits' },
      ] },
      { key: 'enforce_secure_channel', label: 'Exigir canal seguro', type: ONOFF },
      { key: 'out_mode', label: 'Tipo de saída (0-3)', type: 'number' },
    ],
  },
  {
    module: 'uhf',
    label: 'Tags UHF',
    fields: [
      { key: 'identification_bits', label: 'Bits do ID da tag', type: 'enum', options: [
        { value: '26', label: '26 bits' },
        { value: '32', label: '32 bits' },
        { value: '34', label: '34 bits' },
        { value: '66', label: '66 bits' },
        { value: '96', label: '96 bits (estendido)' },
      ] },
      { key: 'reader_type', label: 'Ordem dos bytes', type: 'enum', options: [
        { value: 'default', label: 'Padrão' },
        { value: 'lsb', label: 'LSB' },
      ] },
      { key: 'read_interval', label: 'Intervalo entre leituras da mesma tag', type: 'number', unit: 'ms' },
      { key: 'read_interval_diff_tags', label: 'Intervalo entre tags diferentes', type: 'number', unit: 'ms' },
      { key: 'transmit_power', label: 'Potência da antena', type: 'number', unit: 'dBm×100' },
      { key: 'work_channel', label: 'Canais de operação (ex.: 1-5;7-10)' },
      { key: 'operation_mode', label: 'Modo de operação', type: 'enum', options: [
        { value: 'continuous', label: 'Contínuo' },
        { value: 'trigger', label: 'Gatilho' },
        { value: 'inhibit', label: 'Inibir' },
      ] },
      { key: 'trigger_timeout', label: 'Timeout do gatilho', type: 'number', unit: 'ms' },
      { key: 'trig_idle', label: 'Nível de repouso do gatilho', type: ONOFF },
      { key: 'tag_detector_enabled', label: 'Detector de tag (relé interno)', type: ONOFF },
    ],
  },
  {
    module: 'w_out0',
    label: 'Saída Wiegand',
    fields: [
      { key: 'size', label: 'Bits da saída', type: 'enum', options: [
        { value: '26', label: '26' }, { value: '32', label: '32' }, { value: '34', label: '34' },
        { value: '35', label: '35' }, { value: '37', label: '37' }, { value: '40', label: '40' },
        { value: '42', label: '42' }, { value: '66', label: '66' },
      ] },
      { key: 'data', label: 'Dado enviado', type: 'enum', options: [
        { value: '', label: 'ID do usuário' },
        { value: 'CARD', label: 'Cartão' },
        { value: 'RELAY_CARD', label: 'Relé + Cartão' },
      ] },
    ],
  },
  {
    module: 'gpio',
    label: 'GPIO / Relés da Catraca',
    fields: [
      { key: 'catra_relay_1_enabled', label: 'Relé 1 da catraca', type: ONOFF },
      { key: 'catra_relay_1_enable_direction', label: 'Sentido do relé 1', type: 'enum', options: [
        { value: 'left', label: 'Esquerda' }, { value: 'right', label: 'Direita' },
      ] },
      { key: 'catra_relay_2_enabled', label: 'Relé 2 da catraca', type: ONOFF },
      { key: 'catra_relay_2_enable_direction', label: 'Sentido do relé 2', type: 'enum', options: [
        { value: 'left', label: 'Esquerda' }, { value: 'right', label: 'Direita' },
      ] },
    ],
  },
  {
    module: 'sec_box',
    label: 'Security Box (MAE)',
    fields: [
      { key: 'wiegand_format_size', label: 'Formato Wiegand (custom / 26-66 bits)' },
      { key: 'out_mode', label: 'Modo de saída', type: 'enum', options: [
        { value: '', label: 'ID do usuário' },
        { value: 'CARD', label: 'Cartão' },
        { value: 'RELAY_CARD', label: 'Relé + Cartão' },
        { value: 'USERS_CARD', label: 'Cartão do usuário' },
      ] },
    ],
  },
  {
    module: 'enroller',
    label: 'Cadastrador',
    fields: [
      { key: 'return_face_template', label: 'Retornar template facial em vez de imagem', type: ONOFF },
    ],
  },
];

/** Build the get_configuration.fcgi request body for one catalog entry. */
export function moduleReadSpec(mod: CatalogModule): Record<string, string[]> {
  return { [mod.module]: mod.fields.map(f => f.key) };
}

/** Friendly module label (first catalog entry wins, e.g. "general" → "Geral"). */
export function moduleLabel(module: string): string {
  return CONFIG_CATALOG.find(m => m.module === module)?.label ?? module;
}

/** Field metadata lookup across all catalog entries of a module. */
export function fieldMeta(module: string, key: string): CatalogField | null {
  for (const mod of CONFIG_CATALOG) {
    if (mod.module !== module) continue;
    const field = mod.fields.find(f => f.key === key);
    if (field) return field;
  }
  return null;
}
