from pathlib import Path
import re

path = Path("client/components/ReaProjectMapProgramme.tsx")
s = path.read_text()

# 1. Replace dense metric labels with cleaner labels that remain readable for every state/LGA.
metric_start = s.index("function MetricLabel({")
metric_end = s.index("\nfunction ProjectMap({", metric_start)
area_label = r'''function AreaLabel({
  name,
  metrics,
  x,
  y,
  compact = false,
  selected = false,
}: {
  name: string;
  metrics: AreaMetrics;
  x: number;
  y: number;
  compact?: boolean;
  selected?: boolean;
}) {
  const maxLength = compact ? 15 : 18;
  const title = name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name;
  const titleSize = compact ? (selected ? 7.2 : 6.3) : 7.7;
  const metricSize = compact ? (selected ? 5.8 : 5.1) : 5.8;
  const metricText = compact
    ? `${metrics.projects} project${metrics.projects === 1 ? "" : "s"}`
    : `P ${metrics.projects} · V ${metrics.verified}`;

  return (
    <g pointerEvents="none" opacity={selected ? 1 : 0.94}>
      <text
        x={x}
        y={y - 3}
        textAnchor="middle"
        fill={selected ? "#0b6d3d" : "#203c2d"}
        fontSize={titleSize}
        fontWeight="850"
        stroke="#fbfdfc"
        strokeWidth={compact ? "2.2" : "2.6"}
        paintOrder="stroke"
      >
        {title}
      </text>
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fill={selected ? "#128149" : "#496357"}
        fontSize={metricSize}
        fontWeight="800"
        stroke="#fbfdfc"
        strokeWidth="2"
        paintOrder="stroke"
      >
        {metricText}
      </text>
    </g>
  );
}
'''
s = s[:metric_start] + area_label + s[metric_end:]

# 2. Add geographic coverage counts and drill-down instructions.
display_block = '''  const displayMetrics = useMemo(() => {
    if (selectedLga) return summarizeProjects(lgaProjects);
    if (selectedState) return summarizeProjects(stateProjects);
    return nationalMetrics;
  }, [lgaProjects, nationalMetrics, selectedLga, selectedState, stateProjects]);
'''
if display_block not in s:
    raise RuntimeError("display metrics block changed")
s = s.replace(display_block, display_block + '''
  const stateBoundaryCount = useMemo(
    () => unique(stateFeatures.map((feature) => stateName(feature))).length,
    [stateFeatures],
  );
  const lgaBoundaryCount = lgaFeatures.length;
  const mapInstruction = !selectedState
    ? `${stateBoundaryCount || 37} state areas visible · ${lgaBoundaryCount || 774} LGAs available · select a state to drill down`
    : !selectedLga
      ? `${selectedStateLgas.length} LGAs visible in ${selectedState} · select any LGA to view projects`
      : `${lgaProjects.length} project${lgaProjects.length === 1 ? "" : "s"} in ${selectedLga} · all ${selectedStateLgas.length} LGAs remain visible`;
''')

# 3. Remove point caches only used to draw premature pins at national/state level.
s = re.sub(
    r'''\n  const stateFeatureByName = useMemo\(.*?\n  const selectedLgaFeature = useMemo\(''',
    '\n  const selectedLgaFeature = useMemo(',
    s,
    count=1,
    flags=re.S,
)
s = re.sub(
    r'''\n  const nationalPoints = useMemo\(.*?\n  const lgaPoints = useMemo\(''',
    '\n  const lgaPoints = useMemo(',
    s,
    count=1,
    flags=re.S,
)

# 4. Use the new label component nationally.
s = s.replace("<MetricLabel\n                            name={name}", "<AreaLabel\n                            name={name}")

# 5. National view: show every state and its label/density, but no project pins.
s = re.sub(
    r'''\n\s*\{layers\.Projects && filteredProjects\.map\(\(project\) => \{.*?\n\s*\}\)\}''',
    '',
    s,
    count=1,
    flags=re.S,
)

# 6. State view: keep every LGA label visible, even after an LGA is selected.
lga_label_old = '''                        {!selectedLga && (
                          <MetricLabel
                            name={name}
                            metrics={metrics}
                            x={centroid.x}
                            y={centroid.y}
                            compact
                          />
                        )}'''
lga_label_new = '''                        <AreaLabel
                          name={name}
                          metrics={metrics}
                          x={centroid.x}
                          y={centroid.y}
                          compact
                          selected={isSelected}
                        />'''
if lga_label_old not in s:
    raise RuntimeError("LGA label block changed")
s = s.replace(lga_label_old, lga_label_new)

# 7. State view: remove project pins until a specific LGA is selected.
s = re.sub(
    r'''\n\s*\{!selectedLga &&\n\s*layers\.Projects &&\n\s*stateProjects\.map\(\(project\) => \{.*?\n\s*\}\)\}''',
    '',
    s,
    count=1,
    flags=re.S,
)

# 8. Stronger selected-LGA focus without hiding neighbouring LGAs.
s = s.replace('strokeWidth={isSelected ? "2" : "1.2"}', 'strokeWidth={isSelected ? "2.4" : "1.1"}')
lga_path = '''                          vectorEffect="non-scaling-stroke"
                        />
                        <AreaLabel'''
lga_path_new = '''                          vectorEffect="non-scaling-stroke"
                          opacity={selectedLga && !isSelected ? 0.78 : 1}
                        />
                        <AreaLabel'''
if lga_path in s:
    s = s.replace(lga_path, lga_path_new, 1)

# 9. Header coverage chip.
header_metrics = '''          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.projects.toLocaleString()} Projects
            </span>'''
header_metrics_new = '''          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-md border border-[#d8e7dc] bg-[#f5faf7] px-2.5 py-1.5 text-[9px] font-extrabold text-[#3b6350]">
              {!selectedState ? `${stateBoundaryCount || 37} State Areas` : `${selectedStateLgas.length} LGAs`}
            </span>
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.projects.toLocaleString()} Projects
            </span>'''
if header_metrics not in s:
    raise RuntimeError("header metrics changed")
s = s.replace(header_metrics, header_metrics_new)

# 10. Contextual subtitle replaces the old all-level dot description.
s = s.replace(
    '<p className="mt-0.5 text-[9px] text-slate-500">Dots are projects; colour identifies programme.</p>',
    '<p className="mt-0.5 max-w-[470px] text-[9px] text-slate-500">{mapInstruction}</p>',
)

# 11. Add subtle pulsing animation for verified/selected LGA pins.
style_anchor = '''@keyframes veritas-tooltip-enter {
  from { opacity: 0; transform: translateY(5px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
'''
if style_anchor in s:
    s = s.replace(style_anchor, style_anchor + '''@keyframes veritas-pulse-ring {
  0% { opacity: .58; transform: scale(.9); }
  70%, 100% { opacity: 0; transform: scale(2); }
}
''')
    s = s.replace(
        '.veritas-tooltip { animation: veritas-tooltip-enter 160ms ease-out both; }',
        '.veritas-tooltip { animation: veritas-tooltip-enter 160ms ease-out both; }\n.veritas-pulse-ring { animation: veritas-pulse-ring 2.2s cubic-bezier(.16,1,.3,1) infinite; transform-box: fill-box; transform-origin: center; }',
    )
    s = s.replace(
        '.veritas-map-canvas, .veritas-area, .veritas-pin, .veritas-filter-panel, .veritas-detail-panel, .veritas-tooltip {',
        '.veritas-map-canvas, .veritas-area, .veritas-pin, .veritas-filter-panel, .veritas-detail-panel, .veritas-tooltip, .veritas-pulse-ring {',
    )

pin_anchor = '''                        >
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={radius + 2}'''
if pin_anchor in s:
    s = s.replace(pin_anchor, '''                        >
                          {(selected || project.verified) && (
                            <circle
                              cx={position.x}
                              cy={position.y}
                              r={radius}
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              className="veritas-pulse-ring"
                            />
                          )}
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={radius + 2}''', 1)

# 12. Filter-panel explanation and stage-aware bottom legend.
s = s.replace(
    'The map stays full-width until you open this panel.',
    'National → State → LGA → Project. Pins appear only after an LGA is selected.',
)

legend_start = s.find('            <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-lg')
if legend_start != -1:
    legend_end = s.find('            </div>\n          </div>\n        </div>\n      </section>', legend_start)
    if legend_end == -1:
        raise RuntimeError("legend end not found")
    legend_end += len('            </div>')
    legend = '''            <div className="absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
              {!selectedLga ? (
                <>
                  <span className="text-[8px] font-extrabold uppercase tracking-[0.09em] text-[#128149]">
                    {!selectedState ? "National coverage" : `${selectedState} LGAs`}
                  </span>
                  <span className="flex items-center gap-1.5 text-[8px] font-semibold text-slate-500">
                    <i className="h-2.5 w-2.5 rounded-sm bg-[#80bb90] shadow-[0_0_0_3px_rgba(128,187,144,0.16)]" />
                    Density = project concentration
                  </span>
                  <span className="border-l border-slate-200 pl-3 text-[8px] font-semibold text-slate-400">
                    {!selectedState ? "All state areas stay visible" : `All ${selectedStateLgas.length} LGAs stay visible`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[8px] font-extrabold uppercase tracking-[0.09em] text-slate-500">Project status</span>
                  {[
                    ["Verified", "#159254"],
                    ["Active", "#2d78c4"],
                    ["Submitted", "#d4a514"],
                    ["Pending", "#df7b22"],
                  ].map(([name, color]) => (
                    <span key={name} className="flex items-center gap-1.5 text-[8px] font-bold text-slate-600">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }} />
                      {name}
                    </span>
                  ))}
                  <span className="border-l border-slate-200 pl-3 text-[8px] font-semibold text-slate-400">Pins appear only at LGA level</span>
                </>
              )}
            </div>'''
    s = s[:legend_start] + legend + s[legend_end:]
else:
    raise RuntimeError("legend start not found")

path.write_text(s)
print("Project map improved")
