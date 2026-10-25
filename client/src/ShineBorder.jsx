import React from 'react';

export default function ShineBorder({
  as: Element = 'div',
  borderWidth = 1,
  duration = 14,
  shineColor = ['transparent', 'var(--shine-dim)', 'var(--shine-bright)', 'var(--shine-dim)', 'transparent'],
  className = '',
  style,
  children,
  ...props
}) {
  const colors = Array.isArray(shineColor) ? shineColor.join(', ') : shineColor;
  return <Element
    className={`shine-border-host ${className}`.trim()}
    style={{ '--shine-border-width': `${borderWidth}px`, '--shine-duration': `${duration}s`, '--shine-colors': colors, ...style }}
    {...props}
  >
    {children}
    <span className="shine-border-effect" aria-hidden="true"/>
  </Element>;
}
