/**
 * visual/VisualProvider.tsx — 挂载点
 * 负责：store.init → 初始化视觉系统（氛围层 + 引擎 + 订阅）→ 渲染业务树。
 * 业务组件不得直接操作任何引擎；只通过 <VisualProvider> / useVisual。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { VisualStore } from './store';
import { initVisualSystem, destroyVisualSystem } from './controller';
import { VisualConsole } from './VisualConsole';

export function VisualProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    VisualStore.init().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    initVisualSystem();
    return () => destroyVisualSystem();
  }, [ready]);

  return (
    <>
      {children}
      <VisualConsole />
    </>
  );
}
