type Props = {
  className?: string
  style?: React.CSSProperties
  /** Variant — full = WDT + USA GROUP + tagline; compact = WDT + USA GROUP; mark = só WDT + asa */
  variant?: 'full' | 'compact' | 'mark'
  /** Cor base do texto. Default cream/white. */
  inkColor?: string
  /** Cor da asa. Default gold. */
  goldColor?: string
}

/**
 * Logo WDT USA GROUP — vetor nativo. Sem auto-trace.
 * Tipografia: Cinzel (serif geométrica institucional) com fallback Playfair Display / Georgia.
 * Asa: três planos gold em gradient, integrados ao T.
 */
export default function WDTLogo({
  className,
  style,
  variant = 'full',
  inkColor = '#F5F3EE',
  goldColor = '#C8A96B',
}: Props) {
  const showSub = variant !== 'mark'
  const showTag = variant === 'full'

  // Altura do viewBox depende do variant
  const vbH = variant === 'full' ? 220 : variant === 'compact' ? 175 : 120

  return (
    <svg
      viewBox={`0 0 520 ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="WDT USA GROUP — Technology into Capital"
      className={className}
      style={style}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="wdtGoldWing" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#F4DEB1" />
          <stop offset="45%" stopColor="#E2CB9A" />
          <stop offset="80%" stopColor={goldColor} />
          <stop offset="100%" stopColor="#8E7642" />
        </linearGradient>
        <linearGradient id="wdtGoldWingFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E2CB9A" stopOpacity="0.95" />
          <stop offset="100%" stopColor={goldColor} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="wdtGoldRule" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={goldColor} stopOpacity="0" />
          <stop offset="50%" stopColor="#E2CB9A" stopOpacity="0.85" />
          <stop offset="100%" stopColor={goldColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ASA — 3 planos triangulares limpos, lado direito acima do T */}
      <g transform="translate(338, 8)">
        {/* Pena 1 (mais larga, no topo) */}
        <path
          d="M 0 24 L 168 0 L 156 14 L 4 36 Z"
          fill="url(#wdtGoldWing)"
        />
        {/* Pena 2 (média) */}
        <path
          d="M 18 40 L 138 22 L 128 34 L 26 50 Z"
          fill="url(#wdtGoldWingFade)"
          opacity="0.85"
        />
        {/* Pena 3 (menor, mais baixa) */}
        <path
          d="M 38 54 L 108 44 L 100 54 L 46 60 Z"
          fill="url(#wdtGoldWingFade)"
          opacity="0.6"
        />
      </g>

      {/* WDT — wordmark principal */}
      <text
        x="260"
        y="108"
        textAnchor="middle"
        fill={inkColor}
        fontFamily='var(--font-cinzel), "Playfair Display", Georgia, "Times New Roman", serif'
        fontSize="98"
        fontWeight="500"
        letterSpacing="20"
        style={{ paintOrder: 'stroke' }}
      >
        WDT
      </text>

      {showSub && (
        <>
          {/* Régua gold sob WDT */}
          <line
            x1="120"
            y1="132"
            x2="400"
            y2="132"
            stroke="url(#wdtGoldRule)"
            strokeWidth="0.6"
          />

          {/* USA GROUP */}
          <text
            x="260"
            y="160"
            textAnchor="middle"
            fill={inkColor}
            fontFamily='var(--font-cinzel), "Playfair Display", Georgia, serif'
            fontSize="20"
            fontWeight="500"
            letterSpacing="13"
          >
            USA GROUP
          </text>
        </>
      )}

      {showTag && (
        <text
          x="260"
          y="200"
          textAnchor="middle"
          fill={goldColor}
          fillOpacity="0.85"
          fontFamily='var(--font-geist-mono), "SF Mono", Menlo, Consolas, monospace'
          fontSize="9.5"
          fontWeight="700"
          letterSpacing="6.2"
        >
          TECHNOLOGY INTO CAPITAL
        </text>
      )}
    </svg>
  )
}
