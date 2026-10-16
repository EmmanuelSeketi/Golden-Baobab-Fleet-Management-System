import * as React from 'react'

export function ExcavatorIcon({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        <path d="M12 44h34v14H12zM24 18h22v26H24zM48 22h16v22H48zM64 30h18l10 12H64zM38 58h42l12 18H26zM22 76h68v10H22zM78 76h22v16H78zM52 90h38v8H52zM14 90h24v8H14zM90 86h10l8 10H90z" />
        <circle cx="30" cy="96" r="10" />
        <circle cx="86" cy="96" r="10" />
        <circle cx="104" cy="40" r="6" />
        <path d="M102 34h14v12h-14zM92 18h16v10H92z" />
      </g>
    </svg>
  )
}
