/**
 * visual/persist.ts — UserPresetStore 持久化边界
 * 仅通过 IPC（visual:get/set/export/import）读写 userData/visual.json。
 * 实时调参不走 IPC（修正 3）；写入由 renderer debounce 后调用 save()。
 */
import type { VisualFile, VisualTheme } from './types';

export interface VisualBridge {
  visualGet: () => Promise<VisualFile | null>;
  visualSet: (file: VisualFile) => Promise<VisualFile>;
  visualExport: (theme: VisualTheme) => Promise<string | null>;
  visualImport: () => Promise<VisualTheme | null>;
}

function bridge(): VisualBridge | null {
  return typeof window !== 'undefined' && window.aurora
    ? (window.aurora as unknown as VisualBridge)
    : null;
}

export async function loadVisual(): Promise<VisualFile | null> {
  const b = bridge();
  if (!b) return null;
  try { return await b.visualGet(); } catch { return null; }
}

export async function saveVisual(file: VisualFile): Promise<VisualFile | null> {
  const b = bridge();
  if (!b) return null;
  try { return await b.visualSet(file); } catch { return null; }
}

export async function exportTheme(theme: VisualTheme): Promise<string | null> {
  const b = bridge();
  if (!b) return null;
  try { return await b.visualExport(theme); } catch { return null; }
}

export async function importTheme(): Promise<VisualTheme | null> {
  const b = bridge();
  if (!b) return null;
  try { return await b.visualImport(); } catch { return null; }
}
