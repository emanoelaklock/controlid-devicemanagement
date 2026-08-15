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
    const cls = `w-52 px-2 py-1 bg-slate-800 border rounded text-xs text-white ${
      isDirty(mod, f.key) ? 'border-amber-500' : 'border-slate-700'}`;
    if (f.type === 'bool') {
      return (
        <select value={value} onChange={e => onChange(mod, f.key, e.target.value)} className={cls}>
          <option value="">{emptyHint}</option>
          <option value="1">Ativado</option>
          <option value="0">Desativado</option>
        </select>
      );
    }
    if (f.type === 'enum') {
      const known = f.options?.some(o => o.value === value);
      return (
        <select value={value} onChange={e => onChange(mod, f.key, e.target.value)} className={cls}>
          <option value="">{emptyHint}</option>
          {!known && value !== '' && <option value={value}>{value}</option>}
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input value={value} onChange={e => onChange(mod, f.key, e.target.value)}
        type={f.type === 'number' ? 'number' : 'text'} placeholder={emptyHint} className={cls} />
    );
  };

  return (
    <div className="space-y-2">
      {CONFIG_CATALOG.map((entry, idx) => {
        const fields = onlyReported
          ? entry.fields.filter(f => values[entry.module]?.[f.key] !== undefined)
          : entry.fields;
        if (fields.length === 0) return null;
        const setCount = fields.filter(f => get(entry.module, f.key) !== '').length;
        const dirtyCount = fields.filter(f => isDirty(entry.module, f.key)).length;
        return (
          <details key={`${entry.module}-${idx}`} className="bg-slate-800/40 border border-slate-700/60 rounded-lg"
            open={dirtyCount > 0 || undefined}>
            <summary className="px-3 py-2 cursor-pointer select-none text-xs font-semibold text-slate-300 flex items-center gap-2">
              <span className="flex-1">{entry.label}</span>
              {dirtyCount > 0 && <span className="text-amber-400 normal-case font-normal">{dirtyCount} changed</span>}
              <span className="text-slate-600 font-normal">{setCount}/{fields.length}</span>
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {fields.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-slate-400 truncate" title={`${entry.module}.${f.key}`}>
                    {f.label}{f.unit ? <span className="text-slate-600"> ({f.unit})</span> : null}
                  </span>
                  {isDirty(entry.module, f.key) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
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
