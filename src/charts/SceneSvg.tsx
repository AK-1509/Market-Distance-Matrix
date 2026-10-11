/**
 * Interactive React renderer for a chart scene. Targets are keyboard-focusable buttons
 * (Enter/Space selects); hover shows a tooltip but is never the only way to act.
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ColorRole, GroupNode, Scene, SceneNode, Target } from './scene';

const c = (role: ColorRole | undefined): string | undefined => (role === undefined ? undefined : role === 'none' ? 'none' : `var(--viz-${role})`);

interface Props {
  scene: Scene;
  onSelect?: (t: Target) => void;
  className?: string;
  testId?: string;
}

export function SceneSvg({ scene, onSelect, className, testId }: Props) {
  const titleId = useId();
  const descId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  const showTip = (g: GroupNode, clientX: number, clientY: number) => {
    if (!g.tooltip || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setTip({ x: clientX - r.left, y: clientY - r.top, lines: g.tooltip });
  };

  const render = (n: SceneNode, key: number): ReactNode => {
    const common = { className: n.className, opacity: n.opacity };
    switch (n.kind) {
      case 'rect':
        return <rect key={key} {...common} x={n.x} y={n.y} width={n.w} height={n.h} rx={n.rx} fill={c(n.fill)} stroke={c(n.stroke)} strokeWidth={n.strokeWidth} />;
      case 'circle':
        return <circle key={key} {...common} cx={n.cx} cy={n.cy} r={n.r} fill={c(n.fill)} stroke={c(n.stroke)} strokeWidth={n.strokeWidth} />;
      case 'line':
        return <line key={key} {...common} x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke={c(n.stroke)} strokeWidth={n.strokeWidth} strokeLinecap="round" />;
      case 'path':
        return <path key={key} {...common} d={n.d} fill={c(n.fill)} stroke={c(n.stroke)} strokeWidth={n.strokeWidth} strokeLinejoin="round" />;
      case 'text':
        return (
          <text
            key={key}
            {...common}
            x={n.x}
            y={n.y}
            fontSize={n.size}
            fontWeight={n.weight}
            fill={c(n.fill)}
            textAnchor={n.anchor ?? 'start'}
            fontStyle={n.italic ? 'italic' : undefined}
            className={n.tabular ? 'viz-tab' : undefined}
          >
            {n.text}
          </text>
        );
      case 'group': {
        const children = n.children.map(render);
        if (!n.target || !onSelect) return <g key={key} {...common}>{children}</g>;
        const target = n.target;
        const select = () => {
          setTip(null);
          onSelect(target);
        };
        return (
          <g
            key={key}
            className="viz-target"
            role="button"
            tabIndex={0}
            aria-label={n.label}
            data-target={target.type === 'stack' ? `stack:${target.ids.join(',')}` : `${target.type}:${target.id}`}
            onClick={select}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select();
              }
            }}
            onMouseMove={(e) => showTip(n, e.clientX, e.clientY)}
            onMouseLeave={() => setTip(null)}
            onBlur={() => setTip(null)}
          >
            {children}
          </g>
        );
      }
    }
  };

  return (
    <div className={`scene-wrap ${className ?? ''}`} ref={wrap} data-testid={testId}>
      <svg
        width={scene.width}
        height={scene.height}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="scene-svg"
      >
        <title id={titleId}>{scene.title}</title>
        <desc id={descId}>{scene.description}</desc>
        {scene.nodes.map(render)}
      </svg>
      {tip && (
        <div className="viz-tooltip" style={{ left: Math.min(tip.x + 14, scene.width - 220), top: tip.y + 14 }} role="presentation">
          {tip.lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'viz-tooltip-title' : undefined}>
              {l}
            </div>
          ))}
          <div className="viz-tooltip-hint">Click or press Enter for details and Edit</div>
        </div>
      )}
    </div>
  );
}
