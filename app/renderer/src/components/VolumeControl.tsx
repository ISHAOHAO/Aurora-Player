import { useEffect, useRef, useState } from 'react';

type Audio = { volume: number; mute: boolean };
const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export default function VolumeControl({ volume, mute, disabled, onInteractionChange }: Audio & {
  disabled: boolean;
  onInteractionChange: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState<Audio | null>(null);
  const [dragging, setDragging] = useState(false);
  const pending = useRef<Audio | null>(null);
  const frame = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? { volume: clamp(volume), mute };

  useEffect(() => {
    const target = pending.current;
    if (target && clamp(volume) === target.volume && mute === target.mute) {
      pending.current = null;
      setDraft(null);
      if (expiry.current) clearTimeout(expiry.current);
    }
  }, [volume, mute]);
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    if (expiry.current) clearTimeout(expiry.current);
  }, []);
  useEffect(() => {
    if (!disabled) return;
    cancelAnimationFrame(frame.current); frame.current = 0;
    pending.current = null; setDraft(null); setDragging(false);
    onInteractionChange(false);
  }, [disabled, onInteractionChange]);

  const flush = () => {
    cancelAnimationFrame(frame.current); frame.current = 0;
    const target = pending.current;
    if (!target) return;
    void Promise.all([
      window.aurora.mpv('set_property', 'volume', target.volume),
      window.aurora.mpv('set_property', 'mute', target.mute),
    ]).catch(() => {
      if (pending.current === target) { pending.current = null; setDraft(null); }
    });
  };
  const change = (audio: Audio) => {
    if (disabled) return;
    pending.current = audio;
    setDraft(audio);
    if (expiry.current) clearTimeout(expiry.current);
    // 等待确认时挡住旧状态；连接失败也不会永久卡在本地预览值。
    expiry.current = setTimeout(() => { pending.current = null; setDraft(null); }, 1500);
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  };

  return (
    <div className={`volume${dragging ? ' dragging' : ''}${shown.mute ? ' muted' : ''}`}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
      onFocus={() => onInteractionChange(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onInteractionChange(false); }}>
      <button className="icon-btn" aria-label={shown.mute ? '取消静音' : '静音'} aria-pressed={shown.mute}
        title={disabled ? '已锁定' : '静音 (M)'} disabled={disabled}
        onClick={() => change({ ...shown, mute: !shown.mute })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/>
          {shown.mute || shown.volume === 0
            ? <path d="M22 9l-6 6M16 9l6 6"/>
            : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/>}
        </svg>
      </button>
      <div className="vol-slider" data-disabled={disabled}>
        <div className="vol-track" aria-hidden="true">
          <i style={{ transform: `scaleX(${shown.volume / 100})` }} />
          <span className="vol-knob" style={{ left: `${shown.volume}%` }} />
        </div>
        <input type="range" min={0} max={100} step={1} value={shown.volume} disabled={disabled}
          aria-label="音量" aria-valuetext={`${shown.volume}%${shown.mute ? '（静音）' : ''}`}
          onKeyDown={e => e.stopPropagation()}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => { setDragging(false); flush(); }}
          onPointerCancel={() => { setDragging(false); flush(); }}
          onLostPointerCapture={() => setDragging(false)}
          onBlur={() => { setDragging(false); flush(); }}
          onChange={e => change({ volume: Number(e.target.value), mute: Number(e.target.value) > 0 ? false : shown.mute })} />
      </div>
      <output className="vol-value" aria-hidden="true">{shown.volume}<small>%</small></output>
    </div>
  );
}
