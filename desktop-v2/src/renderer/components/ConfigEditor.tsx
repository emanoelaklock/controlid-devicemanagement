import { CONFIG_CATALOG, CatalogField } from '../../shared/controlid.catalog';

export type ConfigValues = Record<string, Record<string, string>>;

/** Count non-empty fields of a config object. */
export function countFields(values: ConfigValues): number {
  return Object.values(values).reduce(
    (n, m) => n + Object.values(m).filter(v => v !== '').length, 0);
}

/** Drop empty fields/modules (used before saving a template). */
export function stripEmpty(values: ConfigValues): ConfigValues {
  const out: ConfigValues = {};
  for (const [mod, fields] of Object.entries(values)) {
    const kept = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ''));
    if (Object.keys(kept).length > 0) out[mod] = kept;
  }
  return out;
}

/** Fields changed vs the original snapshot (used before applying to a device). */
export function diffValues(original: ConfigValues, current: ConfigValues): ConfigValues {
  const out: ConfigValues = {};
  for (const [mod, fields] of Object.entries(current)) {
    for (const [key, value] of Object.entries(fields)) {
      if ((original[mod]?.[key] ?? '') !== value) {
        (out[mod] ??= {})[key] = value;
      }
    }
  }
  return out;
}

interface Props {
  values: ConfigValues;
  /** When set, fields that differ from it get a "changed" marker. */
  original?: ConfigValues;
  onChange: (module: string, key: string, value: string) => void;
  /** Placeholder meaning of an empty field ("not enforced" for templates,
   *  "not reported by device" for the live editor). */
  emptyHint: string;
  /** Live-device mode: hide catalog fields the device didn't report. */
  onlyReported?: boolean;
}

/**
 * Catalog-driven friendly editor for Control iD configuration
 * (get/set_configuration.fcgi). Renders one collapsible section per catalog
 * entry; values are always strings ("1"/"0" for booleans, '' = unset).
 */
export default function ConfigEditor({ values, original, onChange, emptyHint, onlyReported }: Props) {
  const get = (mod: string, key: string) => values[mod]?.[key] ?? '';
  const isDirty = (mod: string, key: string) =>
    original !== undefined && (original[mod]?.[key] ?? '') !== get(mod, key);

  const renderInput = (mod: string, f: CatalogField) => {
    const value = get(mod, f.key);
    const style: React.CSSProperties = {
      width: 208, padding: '5px 8px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
      background: 'var(--surface-card)', color: 'var(--text)', outline: 'none',
      border: `1px solid ${isDirty(mod, f.key) ? 'var(--sr-warn-m)' : 'var(--border-strong)'}`,
    };
    if (f.type === 'bool') {
      return (
        <select value={value} onChange={e => onChange(mod, f.key, e.target.value)} style={style}>
          <option value="">{emptyHint}</option>
          <option value="1">Ativado</option>
          <option value="0">Desativado</option>
        </select>
      );
    }
    if (f.type === 'enum') {
      const known = f.options?.some(o => o.value === value);
      return (
        <select value={value} onChange={e => onChange(mod, f.key, e.target.value)} style={style}>
          <option value="">{emptyHint}</option>
          {!known && value !== '' && <option value={value}>{value}</option>}
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input value={value} onChange={e => onChange(mod, f.key, e.target.value)}
        type={f.type === 'number' ? 'number' : 'text'} placeholder={emptyHint} style={style} />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CONFIG_CATALOG.map((entry, idx) => {
        const fields = onlyReported
          ? entry.fields.filter(f => values[entry.module]?.[f.key] !== undefined)
          : entry.fields;
        if (fields.length === 0) return null;
        const setCount = fields.filter(f => get(entry.module, f.key) !== '').length;
        const dirtyCount = fields.filter(f => isDirty(entry.module, f.key)).length;
        return (
          <details key={`${entry.module}-${idx}`}
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 11 }}
            open={dirtyCount > 0 || undefined}>
            <summary style={{
              padding: '8px 12px', cursor: 'pointer', userSelect: 'none', fontSize: 12,
              fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1 }}>{entry.label}</span>
              {dirtyCount > 0 && <span style={{ color: 'var(--sr-warn-fg)', fontWeight: 500 }}>{dirtyCount} changed</span>}
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{setCount}/{fields.length}</span>
            </summary>
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fields.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span title={`${entry.module}.${f.key}`} style={{
                    flex: 1, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {f.label}{f.unit ? <span style={{ opacity: .6 }}> ({f.unit})</span> : null}
                  </span>
                  {isDirty(entry.module, f.key) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sr-warn-m)', flex: 'none' }} />}
                  {renderInput(entry.module, f)}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
