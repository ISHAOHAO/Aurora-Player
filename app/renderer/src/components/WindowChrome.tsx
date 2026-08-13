import { useEffect } from 'react';
import type { MouseEvent } from 'react';

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** 透明窗无原生边框：手动拖拽（mousedown → 主进程跟手移动），按钮/输入框不触发 */
export function dragHandler(): (e: MouseEvent) => void {
  return (e) => {
    if ((e.target as HTMLElement).closest('button, input, a, select, textarea')) return;
    window.aurora.dragStart();
  };
}

/** 全局 mouseup → 结束拖拽/缩放（鼠标可能在窗口外释放，必须挂 window 级监听） */
export function useWindowDragRelease() {
  useEffect(() => {
    const up = () => { window.aurora.dragEnd(); window.aurora.resizeEnd(); };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
}

/** 最小化 / 最大化 / 关闭 三键（透明窗无原生标题栏） */
export function WindowControls() {
  return (
    <div className="win-controls">
      <button className="win-btn" title="最小化" onClick={() => window.aurora.minimizeWindow()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14" /></svg>
      </button>
      <button className="win-btn" title="最大化/还原" onClick={() => window.aurora.toggleMaximize()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      </button>
      <button className="win-btn close" title="关闭" onClick={() => window.aurora.closeWindow()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

/** 8 向边缘缩放热区（透明窗无原生边框） */
export function ResizeZones() {
  return (
    <>
      {RESIZE_DIRS.map((d) => (
        <div key={d} className={`rz rz-${d}`}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); window.aurora.resizeStart(d); }} />
      ))}
    </>
  );
}
