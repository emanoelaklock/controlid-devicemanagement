import { DeviceAdapter } from '../types';
import { ControlIdAdapter } from './controlid.adapter';

/**
 * Adapter registry - manages device adapters for different manufacturers.
 * New manufacturers are added by creating an adapter class and registering it here.
 */
class AdapterRegistry {
  private adapters = new Map<string, DeviceAdapter>();

  register(adapter: DeviceAdapter): void {
    this.adapters.set(adapter.manufacturer, adapter);
  }

  get(manufacturer: string): DeviceAdapter | undefined {
    return this.adapters.get(manufacturer);
  }

  getAll(): DeviceAdapter[] {
    return Array.from(this.adapters.values());
  }

  manufacturers(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapterRegistry = new AdapterRegistry();

// Register built-in adapters
adapterRegistry.register(new ControlIdAdapter());
