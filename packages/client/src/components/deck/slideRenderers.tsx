import { useRef, useEffect, createElement } from "react"
import { BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts"
import type { PitchDeckSlide } from "@/types/deck"

// ── Brand Constants (matches pitchDeckRenderer.ts) ────────────

const BRAND = {
  navy: "#1F4E78",
  teal: "#0D9488",
  dark: "#1E293B",
  light: "#F1F5F9",
  white: "#FFFFFF",
  muted: "#64748B",
  accent: "#3B82F6",
} as const

const CHART_COLORS = [BRAND.navy, BRAND.teal, BRAND.accent, "#F59E0B", "#EF4444", "#8B5CF6"]

// ── Editable Text ────────────────────────────────────────────

interface EditableTextProps {
  value: string
  onChange: (v: string) => void
  className?: string
  tag?: "div" | "span" | "p" | "h1" | "h2"
  placeholder?: string
  multiline?: boolean
  style?: React.CSSProperties
}

function EditableText({ value, onChange, className = "", tag = "div", placeholder, multiline, style }: EditableTextProps) {
  const ref = useRef<HTMLElement>(null)
  const lastValue = useRef(value)

  useEffect(() => {
    if (ref.current && lastValue.current !== value) {
      ref.current.textContent = value
      lastValue.current = value
    }
  }, [value])

  // Set initial content
  useEffect(() => {
    if (ref.current && !ref.current.textContent) {
      ref.current.textContent = value
    }
  }, [])

  return createElement(tag, {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    className: `outline-none focus:ring-2 focus:ring-blue-400/30 rounded px-0.5 -mx-0.5 cursor-text ${className}`,
    style,
    "data-placeholder": placeholder,
    onBlur: () => {
      const text = ref.current?.textContent || ""
      if (text !== lastValue.current) {
        lastValue.current = text
        onChange(text)
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) {
        e.preventDefault()
        ;(e.target as HTMLElement).blur()
      }
    },
  })
}

// ── Editable Bullet List ─────────────────────────────────────

function EditableBullets({ bullets, onChange, bulletColor = BRAND.dark, fontSize = "0.85rem" }: {
  bullets: string[]
  onChange: (bullets: string[]) => void
  bulletColor?: string
  fontSize?: string
}) {
  return (
    <ul className="space-y-1 list-disc pl-5" style={{ color: bulletColor }}>
      {bullets.map((bullet, i) => (
        <li key={i} style={{ fontSize, lineHeight: "1.5" }}>
          <EditableText
            value={bullet}
            onChange={(v) => {
              const next = [...bullets]
              next[i] = v
              onChange(next)
            }}
            className="inline"
            tag="span"
          />
        </li>
      ))}
    </ul>
  )
}

// ── Slide Renderer Props ─────────────────────────────────────

export interface SlideRendererProps {
  slide: PitchDeckSlide
  onUpdate: (partial: Partial<PitchDeckSlide>) => void
  interactive?: boolean
}

// ── Title Slide ──────────────────────────────────────────────

export function TitleSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.navy, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-1 flex flex-col justify-end px-[6%] pb-[8%]">
        {interactive ? (
          <EditableText
            value={slide.title}
            onChange={(v) => onUpdate({ title: v })}
            className="text-white font-bold leading-tight"
            tag="h1"
            style={{ fontSize: "2.4rem" }}
          />
        ) : (
          <h1 className="text-white font-bold leading-tight" style={{ fontSize: "2.4rem" }}>{slide.title}</h1>
        )}
        {(slide.subtitle || interactive) && (
          interactive ? (
            <EditableText
              value={slide.subtitle || ""}
              onChange={(v) => onUpdate({ subtitle: v })}
              className="mt-3"
              tag="p"
              placeholder="Add subtitle..."
              style={{ fontSize: "1.1rem", color: BRAND.light, opacity: 0.9 }}
            />
          ) : (
            slide.subtitle && <p className="mt-3" style={{ fontSize: "1.1rem", color: BRAND.light, opacity: 0.9 }}>{slide.subtitle}</p>
          )
        )}
      </div>
      {/* Teal bottom bar */}
      <div className="flex-shrink-0" style={{ height: "9%", background: BRAND.teal }}>
        <div className="flex items-center justify-end h-full px-[4%]">
          <span className="text-white text-[0.6rem] font-bold tracking-[0.2em] uppercase">STAMATS</span>
        </div>
      </div>
    </div>
  )
}

// ── Content Slide ────────────────────────────────────────────

export function ContentSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      {/* Navy top bar */}
      <div className="flex-shrink-0" style={{ height: "1%", background: BRAND.navy }} />
      <div className="flex-1 px-[6%] pt-[5%]">
        {interactive ? (
          <EditableText
            value={slide.title}
            onChange={(v) => onUpdate({ title: v })}
            className="font-bold leading-tight"
            tag="h2"
            style={{ fontSize: "1.5rem", color: BRAND.navy }}
          />
        ) : (
          <h2 className="font-bold leading-tight" style={{ fontSize: "1.5rem", color: BRAND.navy }}>{slide.title}</h2>
        )}
        <div className="mt-[5%]">
          {slide.bullets && (interactive ? (
            <EditableBullets
              bullets={slide.bullets}
              onChange={(b) => onUpdate({ bullets: b })}
              bulletColor={BRAND.dark}
            />
          ) : (
            <ul className="space-y-1 list-disc pl-5" style={{ color: BRAND.dark }}>
              {slide.bullets.map((b, i) => <li key={i} style={{ fontSize: "0.85rem", lineHeight: "1.5" }}>{b}</li>)}
            </ul>
          ))}
        </div>
      </div>
      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%", background: BRAND.light }}>
        <span style={{ fontSize: "0.5rem", color: BRAND.muted, fontWeight: 700, letterSpacing: "0.15em" }}>STAMATS</span>
      </div>
    </div>
  )
}

// ── Two-Column Slide ─────────────────────────────────────────

export function TwoColumnSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-shrink-0" style={{ height: "1%", background: BRAND.navy }} />
      <div className="flex-1 px-[6%] pt-[5%]">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="font-bold" tag="h2" style={{ fontSize: "1.5rem", color: BRAND.navy }} />
        ) : (
          <h2 className="font-bold" style={{ fontSize: "1.5rem", color: BRAND.navy }}>{slide.title}</h2>
        )}
        <div className="flex gap-[4%] mt-[4%] flex-1">
          {/* Left */}
          <div className="flex-1">
            {slide.leftColumn && (
              <>
                {interactive ? (
                  <EditableText value={slide.leftColumn.title} onChange={(v) => onUpdate({ leftColumn: { ...slide.leftColumn!, title: v } })} className="font-bold mb-2" tag="h2" style={{ fontSize: "1rem", color: BRAND.teal }} />
                ) : (
                  <h2 className="font-bold mb-2" style={{ fontSize: "1rem", color: BRAND.teal }}>{slide.leftColumn.title}</h2>
                )}
                {interactive ? (
                  <EditableBullets bullets={slide.leftColumn.bullets} onChange={(b) => onUpdate({ leftColumn: { ...slide.leftColumn!, bullets: b } })} fontSize="0.75rem" />
                ) : (
                  <ul className="space-y-1 list-disc pl-5">
                    {slide.leftColumn.bullets.map((b, i) => <li key={i} style={{ fontSize: "0.75rem", color: BRAND.dark }}>{b}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
          {/* Divider */}
          <div className="w-px self-stretch" style={{ background: BRAND.light }} />
          {/* Right */}
          <div className="flex-1">
            {slide.rightColumn && (
              <>
                {interactive ? (
                  <EditableText value={slide.rightColumn.title} onChange={(v) => onUpdate({ rightColumn: { ...slide.rightColumn!, title: v } })} className="font-bold mb-2" tag="h2" style={{ fontSize: "1rem", color: BRAND.teal }} />
                ) : (
                  <h2 className="font-bold mb-2" style={{ fontSize: "1rem", color: BRAND.teal }}>{slide.rightColumn.title}</h2>
                )}
                {interactive ? (
                  <EditableBullets bullets={slide.rightColumn.bullets} onChange={(b) => onUpdate({ rightColumn: { ...slide.rightColumn!, bullets: b } })} fontSize="0.75rem" />
                ) : (
                  <ul className="space-y-1 list-disc pl-5">
                    {slide.rightColumn.bullets.map((b, i) => <li key={i} style={{ fontSize: "0.75rem", color: BRAND.dark }}>{b}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%", background: BRAND.light }}>
        <span style={{ fontSize: "0.5rem", color: BRAND.muted, fontWeight: 700, letterSpacing: "0.15em" }}>STAMATS</span>
      </div>
    </div>
  )
}

// ── Image + Text Slide ───────────────────────────────────────

export function ImageTextSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-shrink-0" style={{ height: "1%", background: BRAND.navy }} />
      <div className="flex-1 px-[6%] pt-[5%]">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="font-bold" tag="h2" style={{ fontSize: "1.5rem", color: BRAND.navy }} />
        ) : (
          <h2 className="font-bold" style={{ fontSize: "1.5rem", color: BRAND.navy }}>{slide.title}</h2>
        )}
        <div className="flex gap-[4%] mt-[4%] flex-1">
          {/* Image placeholder */}
          <div className="flex-1 rounded-lg flex items-center justify-center" style={{ background: BRAND.light, border: `2px dashed #CBD5E1`, minHeight: "60%" }}>
            <span style={{ fontSize: "0.75rem", color: BRAND.muted }}>Insert Image</span>
          </div>
          {/* Text */}
          <div className="flex-1">
            {slide.bullets && (interactive ? (
              <EditableBullets bullets={slide.bullets} onChange={(b) => onUpdate({ bullets: b })} fontSize="0.75rem" />
            ) : (
              <ul className="space-y-1 list-disc pl-5">
                {slide.bullets.map((b, i) => <li key={i} style={{ fontSize: "0.75rem", color: BRAND.dark }}>{b}</li>)}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%", background: BRAND.light }}>
        <span style={{ fontSize: "0.5rem", color: BRAND.muted, fontWeight: 700, letterSpacing: "0.15em" }}>STAMATS</span>
      </div>
    </div>
  )
}

// ── Chart Slide ──────────────────────────────────────────────

export function ChartSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  const chartData = slide.chartData
  const data = chartData ? chartData.labels.map((label, i) => ({ label, value: chartData.values[i] ?? 0 })) : []

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-shrink-0" style={{ height: "1%", background: BRAND.navy }} />
      <div className="flex-1 px-[6%] pt-[5%] flex flex-col">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="font-bold flex-shrink-0" tag="h2" style={{ fontSize: "1.5rem", color: BRAND.navy }} />
        ) : (
          <h2 className="font-bold flex-shrink-0" style={{ fontSize: "1.5rem", color: BRAND.navy }}>{slide.title}</h2>
        )}
        <div className="flex-1 mt-[3%] min-h-0">
          {chartData && data.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              {chartData.type === "bar" ? (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <Tooltip />
                  <Bar dataKey="value" name={chartData.seriesName || "Value"}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : chartData.type === "line" ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke={BRAND.navy} strokeWidth={2} dot={{ fill: BRAND.teal }} />
                </LineChart>
              ) : chartData.type === "pie" ? (
                <PieChart>
                  <Tooltip />
                  <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="80%" label={{ fontSize: 10 }}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              ) : (
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke={BRAND.navy} fill={BRAND.navy} fillOpacity={0.15} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%", background: BRAND.light }}>
        <span style={{ fontSize: "0.5rem", color: BRAND.muted, fontWeight: 700, letterSpacing: "0.15em" }}>STAMATS</span>
      </div>
    </div>
  )
}

// ── Comparison Slide ─────────────────────────────────────────

export function ComparisonSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-shrink-0" style={{ height: "1%", background: BRAND.navy }} />
      <div className="flex-1 px-[6%] pt-[5%]">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="font-bold" tag="h2" style={{ fontSize: "1.5rem", color: BRAND.navy }} />
        ) : (
          <h2 className="font-bold" style={{ fontSize: "1.5rem", color: BRAND.navy }}>{slide.title}</h2>
        )}
        {slide.comparisonRows && slide.comparisonRows.length > 0 && (
          <table className="w-full mt-[4%] border-collapse" style={{ fontSize: "0.7rem" }}>
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-white font-bold" style={{ background: BRAND.navy }}>Feature</th>
                <th className="text-left px-3 py-2 text-white font-bold" style={{ background: BRAND.teal }}>Stamats</th>
                <th className="text-left px-3 py-2 text-white font-bold" style={{ background: BRAND.muted }}>Competitor</th>
              </tr>
            </thead>
            <tbody>
              {slide.comparisonRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.light }}>
                  <td className="px-3 py-2 border-b border-slate-200" style={{ color: BRAND.dark }}>{row.feature}</td>
                  <td className="px-3 py-2 border-b border-slate-200" style={{ color: BRAND.dark }}>{row.us}</td>
                  <td className="px-3 py-2 border-b border-slate-200" style={{ color: BRAND.dark }}>{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%", background: BRAND.light }}>
        <span style={{ fontSize: "0.5rem", color: BRAND.muted, fontWeight: 700, letterSpacing: "0.15em" }}>STAMATS</span>
      </div>
    </div>
  )
}

// ── Quote Slide ──────────────────────────────────────────────

export function QuoteSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col justify-center" style={{ background: BRAND.white, fontFamily: "Calibri, sans-serif" }}>
      <div className="px-[10%]">
        {/* Teal accent bar */}
        <div className="flex gap-[4%]">
          <div className="flex-shrink-0 w-1 rounded-full" style={{ background: BRAND.teal }} />
          <div className="flex-1">
            {slide.quote && (
              <>
                {interactive ? (
                  <EditableText
                    value={slide.quote.text}
                    onChange={(v) => onUpdate({ quote: { ...slide.quote!, text: v } })}
                    className="italic leading-relaxed"
                    tag="p"
                    multiline
                    style={{ fontSize: "1.2rem", color: BRAND.dark }}
                  />
                ) : (
                  <p className="italic leading-relaxed" style={{ fontSize: "1.2rem", color: BRAND.dark }}>
                    &ldquo;{slide.quote.text}&rdquo;
                  </p>
                )}
                {interactive ? (
                  <EditableText
                    value={slide.quote.attribution}
                    onChange={(v) => onUpdate({ quote: { ...slide.quote!, attribution: v } })}
                    className="mt-4"
                    tag="p"
                    style={{ fontSize: "0.85rem", color: BRAND.muted }}
                  />
                ) : (
                  <p className="mt-4" style={{ fontSize: "0.85rem", color: BRAND.muted }}>&mdash; {slide.quote.attribution}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section Divider Slide ────────────────────────────────────

export function SectionDividerSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.teal, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-1 flex flex-col justify-center px-[6%]">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="text-white font-bold leading-tight" tag="h1" style={{ fontSize: "2.2rem" }} />
        ) : (
          <h1 className="text-white font-bold leading-tight" style={{ fontSize: "2.2rem" }}>{slide.title}</h1>
        )}
        {(slide.subtitle || interactive) && (
          interactive ? (
            <EditableText value={slide.subtitle || ""} onChange={(v) => onUpdate({ subtitle: v })} className="mt-3 text-white/80" tag="p" placeholder="Add subtitle..." style={{ fontSize: "1rem" }} />
          ) : (
            slide.subtitle && <p className="mt-3 text-white/80" style={{ fontSize: "1rem" }}>{slide.subtitle}</p>
          )
        )}
      </div>
      <div className="flex-shrink-0" style={{ height: "9%", background: BRAND.navy }} />
    </div>
  )
}

// ── Closing Slide ────────────────────────────────────────────

export function ClosingSlideRenderer({ slide, onUpdate, interactive = true }: SlideRendererProps) {
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: BRAND.navy, fontFamily: "Calibri, sans-serif" }}>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-[10%]">
        {interactive ? (
          <EditableText value={slide.title} onChange={(v) => onUpdate({ title: v })} className="text-white font-bold" tag="h1" style={{ fontSize: "2rem" }} />
        ) : (
          <h1 className="text-white font-bold" style={{ fontSize: "2rem" }}>{slide.title}</h1>
        )}
        {(slide.subtitle || interactive) && (
          interactive ? (
            <EditableText value={slide.subtitle || ""} onChange={(v) => onUpdate({ subtitle: v })} className="mt-3" tag="p" placeholder="Add subtitle..." style={{ fontSize: "1.1rem", color: BRAND.light }} />
          ) : (
            slide.subtitle && <p className="mt-3" style={{ fontSize: "1.1rem", color: BRAND.light }}>{slide.subtitle}</p>
          )
        )}
        {/* Teal divider line */}
        <div className="w-24 h-0.5 rounded-full mt-6" style={{ background: BRAND.teal }} />
        {slide.bullets && slide.bullets.length > 0 && (
          <div className="mt-5 space-y-1">
            {slide.bullets.map((b, i) => (
              <p key={i} style={{ fontSize: "0.8rem", color: BRAND.muted }}>{b}</p>
            ))}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center justify-end px-[4%]" style={{ height: "5%" }}>
        <span className="text-white text-[0.6rem] font-bold tracking-[0.2em] uppercase">STAMATS</span>
      </div>
    </div>
  )
}

// ── Dispatch ─────────────────────────────────────────────────

const RENDERERS: Record<PitchDeckSlide["type"], React.ComponentType<SlideRendererProps>> = {
  "title": TitleSlideRenderer,
  "content": ContentSlideRenderer,
  "two-column": TwoColumnSlideRenderer,
  "image-text": ImageTextSlideRenderer,
  "chart": ChartSlideRenderer,
  "comparison": ComparisonSlideRenderer,
  "quote": QuoteSlideRenderer,
  "section-divider": SectionDividerSlideRenderer,
  "closing": ClosingSlideRenderer,
}

export function SlideRenderer(props: SlideRendererProps) {
  const Component = RENDERERS[props.slide.type] || ContentSlideRenderer
  return <Component {...props} />
}
