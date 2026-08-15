import https from 'https';
import http from 'http';
import { DeviceAdapter, DeviceConnection, DeviceInfo, DiscoveredDevice } from '../types';
import { CONFIG_CATALOG, moduleReadSpec } from '../../shared/controlid.catalog';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Control iD device adapter.
 * Supports both legacy .fcgi API and newer REST API used by iDFace MAX and newer models.
 *
 * API variants:
 * - Legacy: POST /login.fcgi, /system_information.fcgi, /execute_actions.fcgi
 * - New:    POST /api/login, GET /api/system/information, etc.
 *
 * Detection: probe tries multiple endpoints to identify the device.
 */
export class ControlIdAdapter implements DeviceAdapter {
  readonly manufacturer = 'controlid';

  async probe(ip: string, port: number, timeoutMs: number): Promise<DiscoveredDevice | null> {
    const start = Date.now();
    const proto = port === 443 ? 'https' : 'http';

    // Strategy 1: Try legacy .fcgi API (older firmware)
    try {
      const data = await this.httpRequest(proto, ip, port, '/system_information.fcgi', '{}', timeoutMs);
      if (data && (data.serial || data.model || data.mac || data.firmware)) {
        return this.buildDiscovered(ip, port, proto, data, Date.now() - start);
      }
    } catch { /* try next */ }

    // Strategy 2: Try newer API endpoints
    try {
      const data = await this.httpGet(proto, ip, port, '/api/system/information', timeoutMs);
      if (data && (data.serial || data.model || data.mac)) {
        return this.buildDiscovered(ip, port, proto, data, Date.now() - start);
      }
    } catch { /* try next */ }

    // Strategy 3: Try to detect by checking if login page exists (HTTP response)
    try {
      const html = await this.httpGetRaw(proto, ip, port, '/', timeoutMs);
      if (html && (html.includes('controlid') || html.includes('Control iD') || html.includes('iDFace') || html.includes('iDAcesso') || html.includes('idaccess'))) {
        return {
          ipAddress: ip, port,
          macAddress: null, hostname: null,
          manufacturer: 'controlid',
          model: this.extractFromHtml(html, 'iDFace|iDAcesso|iDAccess|iDBox|iDBlock|iDFlex') ?? 'Control iD Device',
          serialNumber: null, firmwareVersion: null,
          httpsEnabled: proto === 'https',
          responseTimeMs: Date.now() - start,
          alreadyManaged: false, existingDeviceId: null,
        };
      }
    } catch { /* not a Control iD device */ }

    return null;
  }

  async authenticate(ip: string, port: number, username: string, password: string): Promise<DeviceInfo | null> {
    const proto = port === 443 ? 'https' : 'http';

    // Try legacy .fcgi login
    try {
      const loginRes = await this.httpRequest(proto, ip, port, '/login.fcgi', JSON.stringify({ login: username, password }), 10000);
      if (loginRes?.session) {
        const info = await this.httpRequest(proto, ip, port, '/system_information.fcgi', '{}', 10000, loginRes.session);
        await this.httpRequest(proto, ip, port, '/logout.fcgi', '{}', 5000, loginRes.session).catch(() => {});
        return this.buildDeviceInfo(info, proto);
      }
    } catch { /* try next */ }

    // Try new API login
    try {
      const loginRes = await this.httpRequest(proto, ip, port, '/api/login', JSON.stringify({ login: username, password }), 10000);
      if (loginRes?.session || loginRes?.token || loginRes?.access_token) {
        const session = loginRes.session || loginRes.token || loginRes.access_token;
        const info = await this.httpGet(proto, ip, port, '/api/system/information', 10000, session);
        return this.buildDeviceInfo(info, proto);
      }
    } catch { /* try next */ }

    // Try Basic Auth
    try {
      const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      const info = await this.httpGet(proto, ip, port, '/api/system/information', 10000, undefined, authHeader);
      if (info && (info.model || info.serial)) {
        return this.buildDeviceInfo(info, proto);
      }
    } catch { /* all methods failed */ }

    return null;
  }

  async getInfo(conn: DeviceConnection): Promise<DeviceInfo> {
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    const info = await this.httpRequest(proto, conn.ip, conn.port, '/system_information.fcgi', '{}', 10000, session);
    await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    return this.buildDeviceInfo(info, proto);
  }

  async reboot(conn: DeviceConnection): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/reboot.fcgi', '{}', 10000, session);
      return true;
    } catch { return false; }
  }

  async openDoor(conn: DeviceConnection, doorId = 1): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/execute_actions.fcgi',
        JSON.stringify({ actions: [{ action: 'door', parameters: `door=${doorId}` }] }), 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  /**
   * Sound the device buzzer via POST /buzzer_buzz.fcgi.
   * Params: frequency (Hz), duty_cycle (%), timeout (ms, device max 3000/call).
   * Used to physically locate a device from the app.
   */
  async buzz(conn: DeviceConnection, opts: { frequency?: number; dutyCycle?: number; timeoutMs?: number } = {}): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      const body = JSON.stringify({
        frequency: opts.frequency ?? 4000,
        duty_cycle: opts.dutyCycle ?? 50,
        timeout: Math.min(3000, Math.max(1, opts.timeoutMs ?? 1000)),
      });
      await this.httpRequest(proto, conn.ip, conn.port, '/buzzer_buzz.fcgi', body, 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  /**
   * Show a message on the device screen via POST /message_to_screen.fcgi.
   * timeout in ms (0 = keep until cleared). An empty message clears it.
   */
  async showMessage(conn: DeviceConnection, message: string, timeoutMs = 5000): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/message_to_screen.fcgi',
        JSON.stringify({ message, timeout: Math.max(0, timeoutMs) }), 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  /**
   * Read device configuration via get_configuration.fcgi.
   * The API requires an explicit list of module+field names; an empty body
   * returns {}. Reads module-by-module so an unsupported module on a given
   * model/firmware doesn't abort the whole capture.
   */
  async getConfig(conn: DeviceConnection): Promise<Record<string, unknown>> {
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    const result: Record<string, unknown> = {};
    try {
      for (const mod of CONFIG_CATALOG) {
        try {
          const data = await this.httpRequest(proto, conn.ip, conn.port, '/get_configuration.fcgi',
            JSON.stringify(moduleReadSpec(mod)), 10000, session);
          const values = data?.[mod.module];
          if (values && typeof values === 'object' && !data.error && Object.keys(values).length > 0) {
            // Merge: large modules (e.g. "general") are split into multiple
            // catalog chunks so one unsupported chunk doesn't lose the others.
            result[mod.module] = { ...(result[mod.module] as object ?? {}), ...values };
          }
        } catch { /* module not supported on this model — skip */ }
      }
    } finally {
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    }
    return result;
  }

  /**
   * Apply configuration via set_configuration.fcgi.
   * Body format: {module: {field: "value"}} with ALL values as strings.
   * Applies module-by-module; returns true if at least one module succeeded.
   */
  async setConfig(conn: DeviceConnection, config: Record<string, unknown>): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      let anyOk = false;
      for (const [module, values] of Object.entries(config)) {
        if (!values || typeof values !== 'object') continue;
        const stringified: Record<string, string> = {};
        for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
          if (v === null || v === undefined || v === '') continue;
          stringified[k] = String(v);
        }
        if (Object.keys(stringified).length === 0) continue;
        try {
          const res = await this.httpRequest(proto, conn.ip, conn.port, '/set_configuration.fcgi',
            JSON.stringify({ [module]: stringified }), 10000, session);
          if (!res?.error) anyOk = true;
        } catch { /* skip module */ }
      }
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return anyOk;
    } catch { return false; }
  }

  /**
   * Read the current "network" block from system_information.fcgi
   * (ip, netmask, gateway, dns_primary, dns_secondary, dhcp_enabled, ...).
   * Used to prefill the network dialog and to build safe set_system_network payloads.
   */
  async getNetwork(conn: DeviceConnection): Promise<Record<string, unknown>> {
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    try {
      const info = await this.httpRequest(proto, conn.ip, conn.port, '/system_information.fcgi', '{}', 10000, session);
      return (info?.network && typeof info.network === 'object') ? info.network : {};
    } finally {
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    }
  }

  /**
   * Change network settings via POST /set_system_network.fcgi, mirroring the
   * exact payload the device's own web UI sends (verified against fw 8.7.3
   * bundle): the FULL network object — interface "1", ip, netmask, gateway,
   * primary_dns, secondary_dns (NOT dns_primary/dns_secondary as the docs say),
   * custom_hostname_enabled, device_hostname, web_server_port, ssl_enabled,
   * self_signed_certificate, ten_mbps, dhcp_enabled — with `changes` overlaid
   * on the device's current config.
   * CAVEATS: set_configuration.fcgi does NOT apply network settings, and a
   * device still in first-login state (factory credentials) rejects this
   * command with 401 "Invalid access level" — detected and reported clearly.
   */
  async setNetwork(conn: DeviceConnection, changes: Record<string, unknown>): Promise<boolean> {
    const { session, message } = await this.loginFull(conn);
    if (/first web login/i.test(message || '')) {
      throw new Error('Device still has factory-default credentials, so the firmware blocks network changes. Use "Set Credentials" to set a new device login/password, then retry.');
    }
    const proto = conn.port === 443 ? 'https' : 'http';

    // Read current config so the request is always the full object the web UI sends
    const info = await this.httpRequest(proto, conn.ip, conn.port, '/system_information.fcgi', '{}', 10000, session);
    const cur = (info?.network && typeof info.network === 'object') ? info.network : {};

    const payload: Record<string, unknown> = {
      interface: '1', // Ethernet ("2" is Wi-Fi)
      ip: cur.ip, netmask: cur.netmask, gateway: cur.gateway,
      primary_dns: cur.primary_dns ?? cur.dns_primary ?? '8.8.8.8',
      secondary_dns: cur.secondary_dns ?? cur.dns_secondary ?? '8.8.4.4',
      custom_hostname_enabled: !!cur.custom_hostname_enabled,
      device_hostname: cur.device_hostname ?? '',
      web_server_port: Number(cur.web_server_port) || conn.port,
      ssl_enabled: !!cur.ssl_enabled,
      self_signed_certificate: !!cur.self_signed_certificate,
      ten_mbps: !!cur.ten_mbps, // preserve current link speed (web UI hardcodes false)
      dhcp_enabled: !!cur.dhcp_enabled,
      ...changes,
    };

    let res: any;
    try {
      res = await this.httpRequest(proto, conn.ip, conn.port, '/set_system_network.fcgi',
        JSON.stringify(payload), 10000, session);
    } catch (e: any) {
      // The device applies network settings the moment it receives them and
      // resets its network stack, frequently dropping the socket before the
      // HTTP response goes out. A connection cut on THIS request (login and
      // the config read above already succeeded) means the change was applied.
      if (/socket hang up|ECONNRESET|EPIPE|ECONNABORTED/i.test(String(e?.message || e))) return true;
      throw e;
    }
    if (res?.error) throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error));
    // Don't logout: the device may already be re-applying network settings
    return true;
  }

  /**
   * Change the device's login credentials (same credential used by the web
   * interface and the API). Official endpoint: POST /change_login.fcgi with
   * {login, password} — the call returns no body on success.
   */
  async changePassword(conn: DeviceConnection, newUsername: string, newPassword: string): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      const res = await this.httpRequest(proto, conn.ip, conn.port, '/change_login.fcgi',
        JSON.stringify({ login: newUsername, password: newPassword }), 10000, session);
      if (res?.error) return false;
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      // Verify: the old session may be invalidated — confirm the new credential works
      const verified = await this.authenticate(conn.ip, conn.port, newUsername, newPassword);
      return verified !== null;
    } catch { return false; }
  }

  /**
   * Commission a device. For a factory unit still in first-boot state, complete
   * the on-screen setup wizard (language → finish_init_language → accept_legal_terms)
   * and then change the login — the exact sequence the device's own web UI runs on
   * first login (verified against fw 8.7.3). Changing the login alone (what the old
   * flow did) leaves the device stuck on the physical wizard because the
   * language/legal-terms steps are separate. For an already-set-up device this just
   * changes the credentials, so it is safe to call on any device.
   * Returns whether the first-boot onboarding steps were actually applied.
   */
  async commissionDevice(
    conn: DeviceConnection,
    opts: { newUsername: string; newPassword: string; language?: string; countryCode?: string }
  ): Promise<{ ok: boolean; onboarded: boolean }> {
    const language = opts.language || 'pt_BR';
    const countryCode = (opts.countryCode || 'BR').toUpperCase();
    const proto = conn.port === 443 ? 'https' : 'http';
    // Use the stored credential, but fall back to factory admin/admin if it fails
    // — a factory-reset device reverts to admin/admin, and without this the app
    // could never recover it (it would keep trying the stale stored password).
    const { session, message } = await this.loginWithFactoryFallback(conn);

    // Detect first-boot state: prefer the explicit endpoint, fall back to the
    // login message ("First Web Login. Please Change the Credentials").
    let firstBoot = /first web login/i.test(message || '');
    try {
      const r = await this.httpRequest(proto, conn.ip, conn.port, '/is_first_web_login.fcgi', '{}', 8000, session);
      if (r && typeof r.is_first_web_login === 'boolean') firstBoot = r.is_first_web_login;
    } catch { /* keep the message-based detection */ }

    let onboarded = false;
    if (firstBoot) {
      await this.applyFirstBootSetup(proto, conn, session, language, countryCode);
      onboarded = true;
    }

    // Change credentials last — this step invalidates the current session.
    const res = await this.httpRequest(proto, conn.ip, conn.port, '/change_login.fcgi',
      JSON.stringify({ login: opts.newUsername, password: opts.newPassword }), 10000, session);
    if (res?.error) {
      throw new Error(`change_login failed: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
    }

    // Verify the new credentials work.
    const verified = await this.authenticate(conn.ip, conn.port, opts.newUsername, opts.newPassword);
    return { ok: verified !== null, onboarded };
  }

  /**
   * Force-complete the on-screen setup wizard (language + legal terms) on a device
   * that is stuck part-way through it — e.g. a unit whose password was already
   * changed (so is_first_web_login is already false) but that still boots into the
   * wizard. Runs the same steps as commissionDevice minus the credential change,
   * unconditionally. The steps are idempotent (verified against fw 8.7.3), so this
   * is harmless to run on an already-configured device.
   */
  async finishSetup(conn: DeviceConnection, opts: { language?: string; countryCode?: string }): Promise<boolean> {
    const language = opts.language || 'pt_BR';
    const countryCode = (opts.countryCode || 'BR').toUpperCase();
    const proto = conn.port === 443 ? 'https' : 'http';
    const { session } = await this.loginWithFactoryFallback(conn);
    try {
      await this.applyFirstBootSetup(proto, conn, session, language, countryCode);
    } finally {
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    }
    return true;
  }

  /**
   * Download a device log as plain text (both endpoints return text/plain, which
   * the device web UI saves as a .txt file):
   *  - 'diagnostic': POST /get_ac_log.fcgi (full device/firmware log)
   *  - 'audit':      POST /export_audit_logs.fcgi with all categories enabled
   */
  async downloadLog(conn: DeviceConnection, kind: 'diagnostic' | 'audit'): Promise<string> {
    const proto = conn.port === 443 ? 'https' : 'http';
    const session = await this.login(conn);
    try {
      if (kind === 'audit') {
        const categories = { config: 1, api: 1, usb: 1, network: 1, time: 1, online: 1, menu: 1, boot: 1, push_server: 1 };
        return await this.httpPostRaw(proto, conn.ip, conn.port, '/export_audit_logs.fcgi', JSON.stringify(categories), 30000, session);
      }
      return await this.httpPostRaw(proto, conn.ip, conn.port, '/get_ac_log.fcgi', '{}', 30000, session);
    } finally {
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    }
  }

  /**
   * Upload the company logo into slot 1 and enable it on the menu screen.
   * PNG only, ≤1MB / ≤1000x1000 — the device scales it to 272x240.
   * Docs: photos-and-logo/manage-logo → POST /logo_change.fcgi (binary body,
   * application/octet-stream) + set_configuration {general:{show_logo:"1"}}.
   */
  async uploadLogo(conn: DeviceConnection, png: Buffer): Promise<void> {
    const proto = conn.port === 443 ? 'https' : 'http';
    const session = await this.login(conn);
    try {
      const res = await this.httpPostBinary(proto, conn.ip, conn.port, '/logo_change.fcgi?id=1', png, 20000, session);
      if (res?.error) throw new Error(`logo_change failed: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
      const cfg = await this.httpRequest(proto, conn.ip, conn.port, '/set_configuration.fcgi',
        JSON.stringify({ general: { show_logo: '1' } }), 10000, session);
      if (cfg?.error) throw new Error(`logo uploaded, but enabling it failed: ${typeof cfg.error === 'string' ? cfg.error : JSON.stringify(cfg.error)}`);
    } finally {
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    }
  }

  // ─── Firmware repair via Web Recovery ───────────────────────────
  // The public API has no endpoint to upload a firmware binary. What exists is:
  //  - POST /reboot_recovery.fcgi (official docs, empty body) → device reboots
  //    into the Web Recovery system, and
  //  - the recovery web server itself (plain HTTP on port 80, page title
  //    "iDFace Max Recovery"), which exposes shell actions via GET:
  //      /cgi/run_update.sh          ONLINE update: downloads the firmware from
  //                                  Control iD (https://www.controlid.com.br/
  //                                  cidrk_max/ACFW/V<ver>/part*.enc), verifies
  //                                  the signature and reflashes; KEEPS config.
  //                                  The DEVICE needs internet access.
  //      /cgi/run_factory_update.sh  same download, but ERASES all config/users
  //      /cgi/reboot_normal.sh       boot back into the normal firmware
  //      /cgi/reboot_recovery.sh     reboot staying in recovery ("hold")
  //      /cgi/read_status.sh         progress text, ends with "FIM:"/"FINISH:"
  // Verified against a real iDFace Max (fw 7.11.3, 15/08/2026): read_status.sh
  // logged "Starting online update..." + the download of every part*.enc.

  /** Whether the recovery web server is answering at this IP (no auth needed).
   *  Recovery always runs plain HTTP on port 80, regardless of the normal
   *  firmware's SSL/port settings. */
  async isInRecovery(ip: string): Promise<boolean> {
    try {
      const html = await this.httpGetRaw('http', ip, 80, '/', 6000);
      // Match the recovery page specifically (title "iDFace Max Recovery",
      // heading "Web Recovery") — a bare /recovery/i could false-positive on
      // text inside the normal firmware's SPA.
      return /<title>[^<]*recovery[^<]*<\/title>|web recovery/i.test(html || '');
    } catch { return false; }
  }

  /** Reboot the device into Web Recovery mode. If it is already in recovery,
   *  re-issue the recovery-mode reboot so it stays there instead of cycling. */
  async enterRecovery(conn: DeviceConnection): Promise<void> {
    if (await this.isInRecovery(conn.ip)) {
      await this.recoveryCommand(conn.ip, 'reboot_recovery');
      return;
    }
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    // Empty body, like finish_init_language — the docs say the call takes none.
    await this.httpRequest(proto, conn.ip, conn.port, '/reboot_recovery.fcgi', '', 10000, session);
    // No logout: the device is rebooting.
  }

  /** From Web Recovery, reboot back into the normal firmware. */
  async exitRecovery(ip: string): Promise<void> {
    await this.recoveryCommand(ip, 'reboot_normal');
  }

  /**
   * Reinstall the device firmware through Web Recovery, end to end:
   * enter recovery (or ride a boot-loop into it) → run the update → poll
   * status until FIM:/FINISH: → reboot normal → wait for the firmware to
   * answer again and report its version.
   *
   * opts.factory runs run_factory_update.sh instead: DESTRUCTIVE — erases all
   * configuration/users; the device comes back with factory defaults
   * (admin/admin, possibly IP 192.168.0.129), so we only wait for it briefly.
   */
  async repairFirmware(
    conn: DeviceConnection, opts: { factory?: boolean } = {}
  ): Promise<{ firmwareVersion: string | null; message: string }> {
    const ip = conn.ip;
    const proto = conn.port === 443 ? 'https' : 'http';

    // 1. Get into recovery. A boot-looping device may not accept login — in
    //    that case just wait for a recovery window (the loop passes through
    //    recovery) and pin it there with a recovery-mode reboot.
    if (!(await this.isInRecovery(ip))) {
      let commanded = false;
      try {
        const session = await this.login(conn);
        await this.httpRequest(proto, ip, conn.port, '/reboot_recovery.fcgi', '', 10000, session);
        commanded = true;
      } catch { /* can't login (boot loop?) — wait for recovery to show up */ }
      await this.waitFor(() => this.isInRecovery(ip), 240000, 2000,
        'Device did not enter recovery mode (waited 4 min)');
      if (!commanded) {
        // We didn't put it here — it's cycling. Hold it in recovery. The old
        // recovery page keeps answering for a few seconds before the reboot,
        // so wait it out before trusting isInRecovery again.
        await this.recoveryCommand(ip, 'reboot_recovery').catch(() => {});
        await this.delay(10000);
        await this.waitFor(() => this.isInRecovery(ip), 240000, 2000,
          'Device did not settle in recovery mode (waited 4 min)');
      }
    }

    // 2. Trigger the update and poll its status until it reports the end.
    await this.recoveryCommand(ip, opts.factory ? 'run_factory_update' : 'run_update');
    let status = '';
    await this.waitFor(async () => {
      try {
        const s = await this.httpGetRaw('http', ip, 80, '/cgi/read_status.sh', 10000);
        if (s) status = s;
      } catch { /* transient — keep polling */ }
      return /FINISH:|FIM:/i.test(status);
    }, 600000, 2000, 'Firmware update did not finish within 10 min');
    if (/error/i.test(status)) {
      const tail = status.replace(/\s+/g, ' ').trim().slice(-200);
      throw new Error(`Recovery update reported an error: ${tail}`);
    }

    // 3. Boot back into the normal firmware.
    await this.recoveryCommand(ip, 'reboot_normal');

    // 4. Wait for the firmware to answer (system_information needs no session).
    //    After a factory update the device returns with factory defaults and
    //    may change IP, so only a short best-effort wait applies there.
    let version: string | null = null;
    const back = async () => {
      try {
        const info = await this.httpRequest(proto, ip, conn.port, '/system_information.fcgi', '{}', 6000);
        if (info && (info.version || info.serial)) {
          version = info.version ?? null;
          return true;
        }
      } catch { /* still booting */ }
      return false;
    };
    if (opts.factory) {
      let cameBack = true;
      try { await this.waitFor(back, 90000, 3000, 'not back'); } catch { cameBack = false; }
      return {
        firmwareVersion: version,
        message: cameBack
          ? `Firmware reinstalled (factory) — device back online${version ? ` (v${version})` : ''}, now with factory credentials`
          : 'Firmware reinstalled (factory). Device not seen on this IP — it likely came back with factory defaults (192.168.0.129, admin/admin); use Discovery to re-add it',
      };
    }
    await this.waitFor(back, 300000, 3000,
      'Update finished but the device did not come back online within 5 min');
    return {
      firmwareVersion: version,
      message: `Firmware reinstalled — device back online${version ? ` (v${version})` : ''}`,
    };
  }

  /** GET one of the recovery shell actions (recovery is always http://ip:80). */
  private async recoveryCommand(
    ip: string, cmd: 'run_update' | 'run_factory_update' | 'reboot_normal' | 'reboot_recovery'
  ): Promise<string> {
    return this.httpGetRaw('http', ip, 80, `/cgi/${cmd}.sh`, 15000);
  }

  /**
   * Run the first-boot wizard steps in the exact order the device web UI uses:
   * set language → finish_init_language (posted with NO body) → accept_legal_terms
   * {country_code}. Every step must succeed — a silently-skipped step leaves the
   * device booting back into the wizard. Verified end-to-end against fw 8.7.3.
   */
  private async applyFirstBootSetup(
    proto: string, conn: DeviceConnection, session: string, language: string, countryCode: string
  ): Promise<void> {
    const fail = (ep: string, r: any) => {
      if (r?.error) throw new Error(`${ep} failed: ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}`);
    };
    fail('set language', await this.httpRequest(proto, conn.ip, conn.port, '/set_configuration.fcgi',
      JSON.stringify({ general: { language } }), 10000, session));
    fail('finish_init_language', await this.httpRequest(proto, conn.ip, conn.port, '/finish_init_language.fcgi',
      '', 10000, session));
    fail('accept_legal_terms', await this.httpRequest(proto, conn.ip, conn.port, '/accept_legal_terms.fcgi',
      JSON.stringify({ country_code: countryCode }), 10000, session));
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async login(conn: DeviceConnection): Promise<string> {
    return (await this.loginFull(conn)).session;
  }

  /**
   * Login preserving the response message. Firmware in first-login state
   * (factory credentials) answers "First Web Login. Please Change the
   * Credentials" and blocks privileged commands like set_system_network.
   */
  private async loginFull(conn: DeviceConnection): Promise<{ session: string; message?: string }> {
    const proto = conn.port === 443 ? 'https' : 'http';

    // Try the legacy .fcgi API first
    try {
      const res = await this.httpRequest(proto, conn.ip, conn.port, '/login.fcgi',
        JSON.stringify({ login: conn.username, password: conn.password }), 10000);
      if (res?.session) return { session: res.session, message: res.message };
      // An explicit rejection means this IS a .fcgi device, just with wrong
      // credentials — stop here. Probing /api/login only fetches the SPA HTML and
      // stresses the device's tiny web server (it drops connections under a burst).
      if (res?.error) throw new Error(`Authentication failed for ${conn.ip}:${conn.port}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Authentication failed')) throw e;
      /* connection/parse error — fall through to the newer API */
    }

    // Try the newer REST API (only when the legacy endpoint didn't answer at all)
    try {
      const res = await this.httpRequest(proto, conn.ip, conn.port, '/api/login',
        JSON.stringify({ login: conn.username, password: conn.password }), 10000);
      if (res?.session || res?.token || res?.access_token) {
        return { session: res.session || res.token || res.access_token, message: res?.message };
      }
    } catch { /* fallthrough */ }

    throw new Error(`Authentication failed for ${conn.ip}:${conn.port}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Poll `check` every `intervalMs` until it returns true or `timeoutMs` elapses. */
  private async waitFor(
    check: () => Promise<boolean>, timeoutMs: number, intervalMs: number, failMsg: string
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await this.delay(intervalMs);
    }
    throw new Error(failMsg);
  }

  /**
   * Login with the given credential; if it fails, retry once with the factory
   * default admin/admin. A factory-reset device reverts to admin/admin, so this
   * lets commissioning/setup recover a reset device without the operator having
   * to first fix the stored credential by hand.
   */
  private async loginWithFactoryFallback(conn: DeviceConnection): Promise<{ session: string; message?: string; usedFactory: boolean }> {
    try {
      return { ...(await this.loginFull(conn)), usedFactory: false };
    } catch (e) {
      if (conn.username === 'admin' && conn.password === 'admin') throw e; // already factory creds
      // The failed attempt can briefly stress the device's tiny web server (it drops
      // connections under rapid requests), so pause before retrying and give the
      // factory login a few tries to ride out a transient reset.
      const factory = { ...conn, username: 'admin', password: 'admin' };
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.delay(1500);
        try { return { ...(await this.loginFull(factory)), usedFactory: true }; }
        catch (err) { lastErr = err; }
      }
      throw lastErr;
    }
  }

  private buildDiscovered(ip: string, port: number, proto: string, data: any, elapsed: number): DiscoveredDevice {
    const net = data.network ?? {};
    return {
      ipAddress: ip, port,
      macAddress: net.mac ?? data.mac ?? null,
      hostname: net.device_hostname ?? data.device_hostname ?? null,
      manufacturer: 'controlid',
      model: data.device_two_names ?? data.device_name ?? data.model ?? null,
      serialNumber: data.serial ?? null,
      firmwareVersion: data.version ?? data.firmware ?? null,
      httpsEnabled: !!(net.ssl_enabled ?? false),
      responseTimeMs: elapsed,
      alreadyManaged: false,
      existingDeviceId: null,
    };
  }

  private buildDeviceInfo(info: any, _proto: string, _netConfig?: any): DeviceInfo {
    if (!info) info = {};

    // Actual iDFace Max API response structure (system_information.fcgi):
    // info.network.mac = "FC:52:CE:92:D8:C4"
    // info.network.ip = "192.168.1.160"
    // info.network.dhcp_enabled = true
    // info.network.ssl_enabled = false
    // info.network.device_hostname = "CID-0X0700-000112"
    // info.serial = "0X0700/00010F"
    // info.version = "8.3.1"
    // info.device_name = "iDFace"
    // info.device_two_names = "iDFace Max"

    const net = info.network ?? {};

    const result = {
      manufacturer: 'controlid',
      model: info.device_two_names ?? info.device_name ?? info.model ?? info.product ?? 'Unknown',
      serialNumber: info.serial ?? info.serial_number ?? '',
      macAddress: net.mac ?? info.mac ?? info.mac_address ?? null,
      firmwareVersion: info.version ?? info.firmware ?? 'Unknown',
      hostname: net.device_hostname ?? info.device_hostname ?? info.hostname ?? null,
      httpsEnabled: !!(net.ssl_enabled ?? info.ssl_enabled ?? false),
      dhcpEnabled: !!(net.dhcp_enabled ?? info.dhcp_enabled ?? false),
    };

    return result;
  }

  private extractFromHtml(html: string, pattern: string): string | null {
    const regex = new RegExp(`(${pattern})\\S*`, 'i');
    const match = html.match(regex);
    return match ? match[0] : null;
  }

  /** POST request returning parsed JSON */
  /** POST request returning parsed JSON - public for sync operations */
  httpRequest(
    protocol: string, ip: string, port: number, path: string,
    body: string, timeoutMs: number, session?: string
  ): Promise<any> {
    // Official API expects the session as a query parameter (?session=...).
    // Some endpoints (get/set_configuration) silently ignore cookie-based sessions.
    const fullPath = session
      ? `${path}${path.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}`
      : path;
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path: fullPath, method: 'POST', timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(session ? { Cookie: `session=${session}` } : {}),
        },
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  /** POST a binary body (application/octet-stream) returning parsed JSON. */
  private httpPostBinary(
    protocol: string, ip: string, port: number, path: string,
    body: Buffer, timeoutMs: number, session?: string
  ): Promise<any> {
    const fullPath = session
      ? `${path}${path.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}`
      : path;
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path: fullPath, method: 'POST', timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': body.length,
          ...(session ? { Cookie: `session=${session}` } : {}),
        },
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  /** POST returning the raw response body as text (for log/file downloads that
   *  return text/plain rather than JSON). */
  private httpPostRaw(
    protocol: string, ip: string, port: number, path: string,
    body: string, timeoutMs: number, session?: string
  ): Promise<string> {
    const fullPath = session
      ? `${path}${path.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}`
      : path;
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path: fullPath, method: 'POST', timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(session ? { Cookie: `session=${session}` } : {}),
        },
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  /** GET request returning parsed JSON */
  private httpGet(
    protocol: string, ip: string, port: number, path: string,
    timeoutMs: number, session?: string, authHeader?: string
  ): Promise<any> {
    const fullPath = session
      ? `${path}${path.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}`
      : path;
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (session) headers['Cookie'] = `session=${session}`;
      if (authHeader) headers['Authorization'] = authHeader;
      const options: https.RequestOptions = {
        hostname: ip, port, path: fullPath, method: 'GET', timeout: timeoutMs,
        headers,
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  /** GET request returning raw HTML string */
  private httpGetRaw(
    protocol: string, ip: string, port: number, path: string, timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path, method: 'GET', timeout: timeoutMs,
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          if (loc.startsWith('/')) {
            return this.httpGetRaw(protocol, ip, port, loc, timeoutMs).then(resolve).catch(reject);
          }
        }
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }
}
