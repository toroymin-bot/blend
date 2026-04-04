// Blend - Plugin System Types (Reusable: any app needing plugin architecture)

export interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  enabled: boolean;
  category: PluginCategory;
  execute: (input: PluginInput) => Promise<PluginOutput>;
}

export type PluginCategory = 'search' | 'image' | 'code' | 'productivity' | 'data';

export interface PluginInput {
  query: string;
  context?: string;
  options?: Record<string, unknown>;
}

export interface PluginOutput {
  content: string;
  type: 'text' | 'image' | 'code' | 'table';
  metadata?: Record<string, unknown>;
}

export interface PluginRegistry {
  plugins: Plugin[];
  register: (plugin: Plugin) => void;
  unregister: (id: string) => void;
  getPlugin: (id: string) => Plugin | undefined;
  getEnabled: () => Plugin[];
  getByCategory: (category: PluginCategory) => Plugin[];
}
