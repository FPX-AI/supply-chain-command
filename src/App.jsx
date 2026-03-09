import { useState, useEffect, useRef, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import {
  REPORTS,
  COUNTRY_COORDS,
  pct,
  getAllCompanies,
  getAllCompaniesAcrossReports,
  updatePricesFromJSON,
  mergeLockedData,
  loadHistoricalPrices,
  getTickerHistory,
  TICKER_TIERS,
  TICKER_RISK,
} from "./data";

const API_URL = import.meta.env.VITE_API_URL || '';

// ─── MOBILE HOOK ──────────────────────────────────────────────────────────────
const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
};

// ─── CRT OVERLAY ────────────────────────────────────────────────────────────
const CRT = () => (
  <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998 }}>
    <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 2px)" }} />
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.4) 100%)" }} />
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,255,100,0.01) 0%, transparent 3%, transparent 97%, rgba(0,255,100,0.01) 100%)", animation: "scanMove 8s linear infinite" }} />
  </div>
);

// ─── WIREFRAME CHIP ICON ────────────────────────────────────────────────────
const WireframeChip = ({ color, size = 80 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 8px ${color}44)` }}>
    <rect x="25" y="25" width="50" height="50" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />
    <rect x="32" y="32" width="36" height="36" fill={`${color}08`} stroke={color} strokeWidth="0.8" opacity="0.8" />
    {[0,1,2,3,4].map(i => <line key={`t${i}`} x1={30+i*10} y1="25" x2={30+i*10} y2="15" stroke={color} strokeWidth="0.8" opacity="0.5" />)}
    {[0,1,2,3,4].map(i => <line key={`b${i}`} x1={30+i*10} y1="75" x2={30+i*10} y2="85" stroke={color} strokeWidth="0.8" opacity="0.5" />)}
    {[0,1,2,3,4].map(i => <line key={`l${i}`} x1="25" y1={30+i*10} x2="15" y2={30+i*10} stroke={color} strokeWidth="0.8" opacity="0.5" />)}
    {[0,1,2,3,4].map(i => <line key={`r${i}`} x1="75" y1={30+i*10} x2="85" y2={30+i*10} stroke={color} strokeWidth="0.8" opacity="0.5" />)}
    {[0,1,2].map(r => [0,1,2].map(c => <rect key={`d${r}${c}`} x={36+c*10} y={36+r*10} width="6" height="6" fill="none" stroke={color} strokeWidth="0.4" opacity="0.4" />))}
  </svg>
);

// ─── TICKER TAPE ────────────────────────────────────────────────────────────
const TickerTape = ({ isPro, onUpgrade, lockedLoaded }) => {
  const [offset, setOffset] = useState(0);
  const tapeItems = useMemo(() => {
    const all = getAllCompaniesAcrossReports();
    const free = all.filter(c => c.unlocked);
    const paid = all.filter(c => !c.unlocked);
    // Interleave: free, paid, free, paid...
    const mixed = [];
    const maxLen = Math.max(free.length, paid.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < free.length) mixed.push(free[i]);
      if (i < paid.length) mixed.push(paid[i]);
    }
    return mixed;
  }, [lockedLoaded]);

  useEffect(() => {
    let raf;
    const tick = () => { setOffset(p => p - 0.8); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const items = [...tapeItems, ...tapeItems, ...tapeItems];
  return (
    <div style={{ overflow: "hidden", borderTop: "1px solid #39ff1422", borderBottom: "1px solid #39ff1422", background: "#05080a", padding: "8px 0", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(90deg, #05080a, transparent)", zIndex: 2 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(-90deg, #05080a, transparent)", zIndex: 2 }} />
      <div style={{ display: "flex", gap: 32, whiteSpace: "nowrap", transform: `translateX(${offset}px)` }}>
        {items.map((c, i) => {
          const visible = c.unlocked || isPro;
          if (visible) {
            const ch = pct(c.start, c.now);
            const up = parseFloat(ch) >= 0;
            return (
              <span key={i} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "#8a9bb0" }}>{c.sector.toUpperCase()}</span>
                <span style={{ color: "#556070" }}>→</span>
                <span style={{ color: "#c8d6e5" }}>{c.ticker}</span>
                <span style={{ color: up ? "#39ff14" : "#ff3344", fontWeight: 700 }}>{`${up ? "+" : ""}${ch}%`}</span>
                <span style={{ color: "#333d4a" }}>//</span>
              </span>
            );
          }
          return (
            <span key={i} onClick={onUpgrade} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <span style={{ color: "#333d4a" }}>[REDACTED]</span>
              <span style={{ color: "#556070" }}>→</span>
              <span style={{ color: "#333d4a" }}>████</span>
              <span style={{ color: "#333d4a", fontWeight: 700 }}>█.█%</span>
              <span style={{ color: "#333d4a" }}>//</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ─── VELOCITY GAUGE ─────────────────────────────────────────────────────────
const VelocityGauge = ({ value, max = 50, color, label }) => {
  const angle = Math.min((Math.abs(value) / max) * 180, 180) - 90;
  const overdrive = Math.abs(value) > max * 0.7;
  const uid = label.replace(/\s/g, "");
  return (
    <div style={{ width: 120, textAlign: "center" }}>
      <svg viewBox="0 0 120 70" style={{ width: "100%", filter: `drop-shadow(0 0 6px ${color}44)` }}>
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1a2233" strokeWidth="6" strokeLinecap="round" />
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={`url(#gg-${uid})`} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.abs(value) / max) * 157} 157`} />
        <defs>
          <linearGradient id={`gg-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#39ff14" /><stop offset="60%" stopColor={color} /><stop offset="100%" stopColor="#ff3344" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${angle}, 60, 60)`}>
          <line x1="60" y1="60" x2="60" y2="18" stroke={overdrive ? "#ff3344" : color} strokeWidth="2" />
          <circle cx="60" cy="60" r="4" fill={color} />
        </g>
        <text x="12" y="68" fill="#556070" fontSize="6" fontFamily="var(--mono)">0</text>
        <text x="100" y="68" fill="#ff3344" fontSize="6" fontFamily="var(--mono)">{max}%</text>
        {overdrive && <text x="60" y="14" fill="#ff3344" fontSize="5" fontFamily="var(--mono)" textAnchor="middle" style={{ animation: "blink 0.8s infinite" }}>OVERDRIVE</text>}
      </svg>
      <div style={{ fontFamily: "var(--mono)", fontSize: "1.1rem", color, fontWeight: 700, marginTop: -4, textShadow: `0 0 12px ${color}55` }}>
        {value > 0 ? "+" : ""}{value}%
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#556070", letterSpacing: "0.15em", marginTop: 2 }}>{label}</div>
    </div>
  );
};

// ─── SUPPLY CHAIN COMMAND (Supply Chain Nav) ─────────────────────────────────
const SiliconSilkRoad = ({ stages, activeStage, onSelect, color }) => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const stagesKey = stages.map(s => s.id).join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = 280;
    const H = canvas.height = Math.max(480, stages.length * 66 + 50);
    const nodeX = 28;
    const nodeY = stages.map((_, i) => 38 + i * 62);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < stages.length - 1; i++) {
        const y1 = nodeY[i], y2 = nodeY[i + 1];
        const g = ctx.createLinearGradient(0, y1, 0, y2);
        g.addColorStop(0, color + "33"); g.addColorStop(1, color + "22");
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(nodeX, y1 + 12); ctx.lineTo(nodeX, y2 - 12); ctx.stroke();
        ctx.setLineDash([]);
      }

      stages.forEach((s, i) => {
        const y = nodeY[i];
        const isA = activeStage === s.id;
        const r = isA ? 12 : 8;
        if (isA) { ctx.beginPath(); ctx.arc(nodeX, y, 20, 0, Math.PI * 2); ctx.fillStyle = color + "12"; ctx.fill(); }
        ctx.beginPath(); ctx.arc(nodeX, y, r, 0, Math.PI * 2);
        ctx.fillStyle = isA ? color + "22" : "#0d1117"; ctx.strokeStyle = isA ? color : color + "44"; ctx.lineWidth = isA ? 2 : 1; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(nodeX, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = isA ? 10 : 4; ctx.fill(); ctx.shadowBlur = 0;
        ctx.font = `${isA ? "bold " : ""}10px "JetBrains Mono", monospace`;
        ctx.fillStyle = isA ? color : "#8a9bb0"; ctx.textAlign = "left";
        const lbl = s.name.length > 24 ? s.name.substring(0, 22) + "…" : s.name;
        ctx.fillText(lbl.toUpperCase(), nodeX + 20, y - 2);
        ctx.font = '8px "JetBrains Mono", monospace'; ctx.fillStyle = "#556070";
        ctx.fillText(`${s.companies.length} ${s.companies.length === 1 ? "node" : "nodes"} · ${s.codename}`, nodeX + 20, y + 11);
        const ag = s.companies.reduce((a, c) => a + parseFloat(pct(c.start, c.now)), 0) / s.companies.length;
        const hc = ag > 200 ? "#ff3344" : ag > 100 ? "#ff6d00" : ag > 30 ? "#ffea00" : "#39ff14";
        ctx.beginPath(); ctx.arc(nodeX - 18, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = hc; ctx.shadowColor = hc; ctx.shadowBlur = 5; ctx.fill(); ctx.shadowBlur = 0;
      });
    };
    draw();
    return () => {};
  }, [activeStage, stagesKey, color]);

  const nodeY = stages.map((_, i) => 38 + i * 62);
  const canvasH = Math.max(480, stages.length * 66 + 50);

  return (
    <canvas ref={canvasRef} style={{ width: 280, height: canvasH, cursor: "pointer" }}
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const sy = canvasH / rect.height;
        const cy = (e.clientY - rect.top) * sy;
        const cl = nodeY.reduce((b, y, i) => Math.abs(y - cy) < Math.abs(nodeY[b] - cy) ? i : b, 0);
        onSelect(stages[cl].id);
      }} />
  );
};

// ─── STOCK CARD ─────────────────────────────────────────────────────────────
// ─── DATE HELPERS ────────────────────────────────────────────────────────────
const fmtDateShort = (d) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
};
const fmtDateMed = (d) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};
const genDateTicks = (startStr, count) => {
  const start = new Date(startStr + "T00:00:00");
  const now = new Date();
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const d = new Date(start.getTime() + t * (now.getTime() - start.getTime()));
    ticks.push({ t, label: fmtDateShort(d) });
  }
  return ticks;
};

const TierBadge = ({ ticker, style }) => {
  const tier = TICKER_TIERS[ticker];
  const hasRisk = TICKER_RISK.has(ticker);
  if (!tier && !hasRisk) return null;
  const isCritical = tier === "critical";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, ...style }}>
      {tier && (
        <span style={{
          fontFamily: "var(--mono)", fontSize: "0.4rem", letterSpacing: "0.15em", fontWeight: 700,
          color: isCritical ? "#ff3344" : "#ffaa00",
          background: isCritical ? "#ff334411" : "#ffaa0011",
          border: `1px solid ${isCritical ? "#ff334433" : "#ffaa0033"}`,
          borderRadius: 2, padding: "1px 5px",
        }}>
          {isCritical ? "BOTTLENECK" : "KEY"}
        </span>
      )}
      {hasRisk && (
        <span style={{
          fontFamily: "var(--mono)", fontSize: "0.4rem", letterSpacing: "0.1em", fontWeight: 700,
          color: "#ff8800", background: "#ff880011", border: "1px solid #ff880033",
          borderRadius: 2, padding: "1px 5px",
        }}>RISK</span>
      )}
    </div>
  );
};

const tierSortKey = (ticker) => {
  const t = TICKER_TIERS[ticker];
  if (t === "critical") return 0;
  if (t === "important") return 1;
  return 2;
};

const StockCard = ({ company, color, unlocked, idx, onSelect, reportDate, onUpgrade, historicalPrices }) => {
  const ch = parseFloat(pct(company.start, company.now));
  const up = ch >= 0;
  const [hovered, setHovered] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const tier = TICKER_TIERS[company.ticker];

  // Use real historical data if available, fallback to synthetic
  const history = useMemo(() => {
    if (historicalPrices) {
      const h = getTickerHistory(historicalPrices, company.ticker, reportDate);
      if (h && h.points.length >= 2) return h;
    }
    return null;
  }, [historicalPrices, company.ticker, reportDate]);

  const data = useMemo(() => {
    if (history) return history.points.map(p => p.price);
    // Fallback: synthetic data
    const pts = 40, arr = [];
    const diff = company.now - company.start;
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const n = Math.sin(i * 3.1) * 0.15 + Math.sin(i * 1.7) * 0.1 + Math.sin(i * 5.3) * 0.05;
      arr.push(company.start + diff * (t ** 0.7) + diff * n * 0.25);
    }
    return arr;
  }, [history, company.start, company.now]);

  const ri = history ? history.reportIdx : 6;
  const pts = data.length - 1;
  const rawMn = Math.min(...data), rawMx = Math.max(...data);
  const mn = rawMn * 0.998, mx = rawMx === rawMn ? rawMn + 1 : rawMx * 1.002;

  // Chart layout
  const cL = 22, cR = 98, cT = 4, cB = 76;

  // Y-axis ticks
  const yLabels = [0, 1, 2].map(i => ({
    val: mn + (i / 2) * (mx - mn),
    y: cB - (i / 2) * (cB - cT),
  }));

  // X-axis date ticks
  const dateTicks = useMemo(() => {
    if (history) {
      const pts = history.points;
      return [0, Math.floor(pts.length / 2), pts.length - 1].map(i => ({
        t: i / (pts.length - 1),
        label: fmtDateShort(pts[i].date),
      }));
    }
    return reportDate ? genDateTicks(reportDate, 3) : [];
  }, [history, reportDate]);

  // Hover handler for SVG
  const handleMouseMove = (e) => {
    if (!svgRef.current || !unlocked) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0-1
    const chartX = (x * 200 - cL * 2) / ((cR - cL) * 2); // normalized within chart area
    const idx = Math.round(chartX * pts);
    if (idx >= 0 && idx <= pts) setHoverIdx(idx);
    else setHoverIdx(null);
  };

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setHoverIdx(null); }}
      onClick={() => unlocked && onSelect && onSelect(company)}
      style={{
        background: hovered ? `linear-gradient(135deg, #0a0e12, ${color}06)` : "#0a0e12",
        borderTop: `1px solid ${hovered ? color + "44" : tier === "critical" ? "#ff334422" : tier === "important" ? "#ffaa0015" : "#1a222e"}`,
        borderRight: `1px solid ${hovered ? color + "44" : tier === "critical" ? "#ff334422" : tier === "important" ? "#ffaa0015" : "#1a222e"}`,
        borderBottom: `1px solid ${hovered ? color + "44" : tier === "critical" ? "#ff334422" : tier === "important" ? "#ffaa0015" : "#1a222e"}`,
        borderLeft: tier === "critical" ? "2px solid #ff334466" : tier === "important" ? "2px solid #ffaa0044" : `1px solid ${hovered ? color + "44" : "#1a222e"}`,
        borderRadius: 4, padding: "16px 18px",
        position: "relative", overflow: "hidden", transition: "all 0.3s",
        animation: `cardIn 0.4s ease ${idx * 0.06}s both`, cursor: unlocked ? "pointer" : "default",
      }}>
      {!unlocked && (
        <div onClick={(e) => { e.stopPropagation(); if (onUpgrade) onUpgrade(); }} style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)", background: "rgba(5,8,10,0.88)", cursor: "pointer" }}>
          <div style={{ fontFamily: "var(--display)", fontSize: "0.65rem", color: "#ff3344", letterSpacing: "0.2em", marginBottom: 6, animation: "blink 1.5s infinite" }}>◆ CLEARANCE REQUIRED ◆</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070", background: "#0d1117", border: "1px solid #1a222e", borderRadius: 3, padding: "6px 14px", marginBottom: 8 }}>UPGRADE TO COMPLETE DECRYPTION</div>
          <div style={{ width: 100, height: 3, background: "#1a222e", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: "15%", height: "100%", background: color, borderRadius: 2 }} />
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#e0e6ed" }}>{unlocked ? company.name : "██████████"}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070", marginTop: 2 }}>{unlocked ? `${company.ticker} · ${company.sector}` : "████ · ████████"}</div>
          {unlocked && <TierBadge ticker={company.ticker} />}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.95rem", fontWeight: 700, color: up ? "#39ff14" : "#ff3344", textShadow: `0 0 10px ${up ? "#39ff1444" : "#ff334444"}` }}>
          {up ? "+" : ""}{ch}%
        </div>
      </div>
      <svg ref={svgRef} viewBox="0 0 200 100" style={{ width: "100%", height: 120 }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs><linearGradient id={`a-${company.ticker}-${idx}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {/* Grid lines */}
        {yLabels.map((yt, i) => (
          <line key={`g${i}`} x1={cL * 2} y1={yt.y} x2={cR * 2} y2={yt.y} stroke="#1a222e" strokeWidth="0.3" />
        ))}
        {/* Y-axis labels */}
        {yLabels.map((yt, i) => (
          <text key={`y${i}`} x={cL * 2 - 3} y={yt.y + 1.5} fill="#556070" fontSize="5" fontFamily="var(--mono)" textAnchor="end">
            {yt.val >= 1000 ? `${(yt.val/1000).toFixed(1)}k` : `$${yt.val.toFixed(0)}`}
          </text>
        ))}
        {/* X-axis date labels */}
        {dateTicks.map((dt, i) => (
          <text key={`x${i}`} x={cL * 2 + dt.t * (cR - cL) * 2} y={cB + 9} fill="#556070" fontSize="5" fontFamily="var(--mono)" textAnchor={i === 0 ? "start" : i === dateTicks.length - 1 ? "end" : "middle"}>{dt.label}</text>
        ))}
        {/* Axis lines */}
        <line x1={cL * 2} y1={cT} x2={cL * 2} y2={cB} stroke="#1a222e" strokeWidth="0.4" />
        <line x1={cL * 2} y1={cB} x2={cR * 2} y2={cB} stroke="#1a222e" strokeWidth="0.4" />
        {/* Chart data */}
        {(() => {
          const sx = (v, i) => `${cL * 2 + (i / pts) * (cR - cL) * 2},${cB - ((v - mn) / (mx - mn)) * (cB - cT)}`;
          const sPre = data.slice(0, ri + 1).map(sx).join(" ");
          const sPost = data.slice(ri).map((v, i) => sx(v, i + ri)).join(" ");
          const sArea = `${data.slice(ri).map((v, i) => sx(v, i + ri)).join(" ")} ${cR * 2},${cB} ${cL * 2 + (ri / pts) * (cR - cL) * 2},${cB}`;
          const rx = cL * 2 + (ri / pts) * (cR - cL) * 2;
          const riY = cB - ((data[ri] - mn) / (mx - mn)) * (cB - cT);
          return <>
            <polyline points={sPre} fill="none" stroke="#334455" strokeWidth="1" strokeDasharray="3 2" />
            <line x1={rx} y1={cT} x2={rx} y2={cB} stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.6" />
            <circle cx={rx} cy={riY} r="2.5" fill={color} />
            <text x={rx + 4} y={cT + 6} fill={color} fontSize="5.5" fontFamily="var(--mono)">REPORT</text>
            <polygon points={sArea} fill={`url(#a-${company.ticker}-${idx})`} />
            <polyline points={sPost} fill="none" stroke={color} strokeWidth="1.5" />
          </>;
        })()}
        {/* Hover crosshair */}
        {hoverIdx != null && unlocked && (() => {
          const hx = cL * 2 + (hoverIdx / pts) * (cR - cL) * 2;
          const hy = cB - ((data[hoverIdx] - mn) / (mx - mn)) * (cB - cT);
          const price = data[hoverIdx];
          const dateLabel = history ? fmtDateMed(history.points[hoverIdx].date) : "";
          const pctChange = company.start > 0 ? (((price - company.start) / company.start) * 100).toFixed(1) : "0.0";
          const isUp = parseFloat(pctChange) >= 0;
          // Tooltip positioning: flip if too close to right edge
          const tipX = hx > 140 ? hx - 45 : hx + 4;
          return <>
            <line x1={hx} y1={cT} x2={hx} y2={cB} stroke="#556070" strokeWidth="0.5" strokeDasharray="2 1" />
            <circle cx={hx} cy={hy} r="2" fill="#fff" stroke={color} strokeWidth="0.8" />
            <rect x={tipX - 1} y={cT} width="42" height="16" rx="2" fill="#0d1117" stroke="#1a222e" strokeWidth="0.5" opacity="0.95" />
            <text x={tipX + 1} y={cT + 5.5} fill="#e0e6ed" fontSize="4" fontFamily="var(--mono)">${price.toFixed(2)}</text>
            <text x={tipX + 1} y={cT + 11.5} fill={isUp ? "#39ff14" : "#ff3344"} fontSize="3.5" fontFamily="var(--mono)">{isUp ? "+" : ""}{pctChange}%{dateLabel ? ` · ${fmtDateShort(history.points[hoverIdx].date)}` : ""}</text>
          </>;
        })()}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#3d4a5a", marginTop: 4 }}>
        <span>{unlocked ? `$${company.start.toFixed(2)} → $${company.now.toFixed(2)}` : "████"}</span>
        <span style={{ color: company.country === "US" ? "#39ff14" : company.country === "TW" ? "#00e5ff" : company.country === "JP" ? "#ff0066" : "#ffea00" }}>● {unlocked ? company.country : "██"}</span>
      </div>
      {unlocked && hovered && !hoverIdx && (
        <div style={{ position: "absolute", bottom: 4, right: 8, fontFamily: "var(--mono)", fontSize: "0.45rem", color, opacity: 0.7 }}>CLICK FOR INTEL →</div>
      )}
    </div>
  );
};

// ─── COMPANY DOSSIER MODAL ──────────────────────────────────────────────────
const CompanyDossier = ({ company, color, onClose, reportDate, historicalPrices }) => {
  const ch = parseFloat(pct(company.start, company.now));
  const up = ch >= 0;
  const profit = (10000 * ch / 100).toFixed(0);
  const [dHoverIdx, setDHoverIdx] = useState(null);
  const [chartRange, setChartRange] = useState(null); // null = ALL, or 1/3/6
  const dSvgRef = useRef(null);

  // Use real historical data with range filter
  const history = useMemo(() => {
    if (historicalPrices) {
      const h = getTickerHistory(historicalPrices, company.ticker, reportDate, chartRange);
      if (h && h.points.length >= 2) return h;
    }
    return null;
  }, [historicalPrices, company.ticker, reportDate, chartRange]);

  const dData = useMemo(() => {
    if (history) return history.points.map(p => p.price);
    const pts = 60, arr = [];
    const diff = company.now - company.start;
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const n = Math.sin(i * 2.8) * 0.12 + Math.sin(i * 1.4) * 0.08 + Math.sin(i * 4.7) * 0.04;
      arr.push(company.start + diff * (t ** 0.7) + diff * n * 0.2);
    }
    return arr;
  }, [history, company.start, company.now]);

  const dRi = history ? history.reportIdx : 8;
  const dPts = dData.length - 1;
  const dRawMn = Math.min(...dData), dRawMx = Math.max(...dData);
  const dMn = dRawMn * 0.998, dMx = dRawMx === dRawMn ? dRawMn + 1 : dRawMx * 1.002;
  const dcL = 20, dcR = 98, dcT = 4, dcB = 76;

  const dYTicks = [0, 1, 2].map(i => ({
    val: dMn + (i / 2) * (dMx - dMn),
    y: dcB - (i / 2) * (dcB - dcT),
  }));

  const dDateTicks = useMemo(() => {
    if (history) {
      const pts = history.points;
      return [0, Math.floor(pts.length / 3), Math.floor(2 * pts.length / 3), pts.length - 1].map(i => ({
        t: i / (pts.length - 1),
        label: fmtDateShort(pts[i].date),
      }));
    }
    return reportDate ? genDateTicks(reportDate, 4) : [];
  }, [history, reportDate]);

  // Hover handler
  const handleDossierMouseMove = (e) => {
    if (!dSvgRef.current) return;
    const rect = dSvgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const chartX = (x * 200 - dcL * 2) / ((dcR - dcL) * 2);
    const idx = Math.round(chartX * dPts);
    if (idx >= 0 && idx <= dPts) setDHoverIdx(idx);
    else setDHoverIdx(null);
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(5,8,10,0.92)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} className="dossier-inner" style={{ background: "#0a0e12", border: `1px solid ${color}33`, borderRadius: 8, padding: "28px 32px", maxWidth: 620, width: "90%", maxHeight: "85vh", overflow: "auto", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 16, background: "none", border: "none", color, fontSize: "1.1rem", cursor: "pointer", fontFamily: "var(--mono)" }}>✕</button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <WireframeChip color={color} size={48} />
          <div style={{ marginLeft: 16 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.3em" }}>INTELLIGENCE DOSSIER</div>
            <h2 style={{ fontFamily: "var(--display)", fontSize: "1.1rem", color, margin: "4px 0 2px", letterSpacing: "0.05em" }}>{company.name}</h2>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070" }}>{company.exchange}: {company.ticker} · {company.sector} · {company.country}</div>
            {TICKER_TIERS[company.ticker] && (
              <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  color: TICKER_TIERS[company.ticker] === "critical" ? "#ff3344" : "#ffaa00",
                  background: TICKER_TIERS[company.ticker] === "critical" ? "#ff334411" : "#ffaa0011",
                  border: `1px solid ${TICKER_TIERS[company.ticker] === "critical" ? "#ff334433" : "#ffaa0033"}`,
                  borderRadius: 3, padding: "2px 8px", fontWeight: 700, letterSpacing: "0.15em", fontSize: "0.45rem",
                }}>
                  {TICKER_TIERS[company.ticker] === "critical" ? "CRITICAL BOTTLENECK" : "DISPROPORTIONATELY IMPORTANT"}
                </span>
                {TICKER_RISK.has(company.ticker) && (
                  <span style={{ color: "#ff8800", background: "#ff880011", border: "1px solid #ff880033", borderRadius: 3, padding: "2px 8px", fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.45rem" }}>
                    DOWNSIDE RISK
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Price row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "#05080a", border: "1px solid #111820", borderRadius: 6, marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.2em", marginBottom: 4 }}>
              {dHoverIdx != null && history ? fmtDateMed(history.points[dHoverIdx].date) : "RETURN SINCE REPORT"}
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: "1.8rem", fontWeight: 700, color: up ? "#39ff14" : "#ff3344", textShadow: `0 0 20px ${up ? "#39ff1444" : "#ff334444"}` }}>
              {dHoverIdx != null ? (() => {
                const hp = dData[dHoverIdx];
                const hpct = company.start > 0 ? (((hp - company.start) / company.start) * 100).toFixed(1) : "0.0";
                const hup = parseFloat(hpct) >= 0;
                return <span style={{ color: hup ? "#39ff14" : "#ff3344" }}>{hup ? "+" : ""}{hpct}%</span>;
              })() : <>{up ? "+" : ""}{ch}%</>}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.2em", marginBottom: 4 }}>
              {dHoverIdx != null ? "PRICE" : "ENTRY → CURRENT"}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "#8a9bb0" }}>
              {dHoverIdx != null
                ? <span style={{ color: "#e0e6ed", fontWeight: 700 }}>${dData[dHoverIdx].toFixed(2)}</span>
                : <>${company.start.toFixed(2)} → <span style={{ color: "#e0e6ed", fontWeight: 700 }}>${company.now.toFixed(2)}</span></>
              }
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.2em", marginBottom: 4 }}>$10K INVESTED</div>
            <div style={{ fontFamily: "var(--display)", fontSize: "1.3rem", fontWeight: 700, color: "#39ff14" }}>
              ${(10000 + parseFloat(profit)).toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#39ff14" }}>+${parseInt(profit).toLocaleString()} PROFIT</div>
          </div>
        </div>

        {/* Price Chart */}
        <div style={{ padding: "16px 20px", background: "#05080a", border: "1px solid #111820", borderRadius: 6, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.4rem", color: "#3d4a5a", letterSpacing: "0.25em" }}>PRICE ACTION · {chartRange ? `${chartRange}M` : "ALL"}</div>
            {/* Range selector buttons */}
            <div style={{ display: "flex", gap: 4 }}>
              {[{ label: "1M", val: 1 }, { label: "3M", val: 3 }, { label: "6M", val: 6 }, { label: "ALL", val: null }].map(r => (
                <button key={r.label} onClick={() => setChartRange(r.val)}
                  style={{
                    background: chartRange === r.val ? color + "22" : "transparent",
                    border: `1px solid ${chartRange === r.val ? color + "66" : "#1a222e"}`,
                    color: chartRange === r.val ? color : "#556070",
                    fontFamily: "var(--mono)", fontSize: "0.45rem", padding: "2px 8px",
                    borderRadius: 3, cursor: "pointer", letterSpacing: "0.05em",
                    transition: "all 0.2s",
                  }}>{r.label}</button>
              ))}
            </div>
          </div>
          <svg ref={dSvgRef} viewBox="0 0 200 100" style={{ width: "100%", height: 200, cursor: "crosshair" }}
            onMouseMove={handleDossierMouseMove} onMouseLeave={() => setDHoverIdx(null)}>
            <defs>
              <linearGradient id={`dossier-g-${company.ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {dYTicks.map((yt, i) => <line key={`dg${i}`} x1={dcL * 2} y1={yt.y} x2={dcR * 2} y2={yt.y} stroke="#1a222e" strokeWidth="0.3" />)}
            {/* Y-axis labels */}
            {dYTicks.map((yt, i) => (
              <text key={`dy${i}`} x={dcL * 2 - 3} y={yt.y + 1.5} fill="#556070" fontSize="5" fontFamily="var(--mono)" textAnchor="end">
                {yt.val >= 1000 ? `${(yt.val/1000).toFixed(1)}k` : `$${yt.val.toFixed(0)}`}
              </text>
            ))}
            {/* X-axis date labels */}
            {dDateTicks.map((dt, i) => (
              <text key={`dx${i}`} x={dcL * 2 + dt.t * (dcR - dcL) * 2} y={dcB + 9} fill="#556070" fontSize="5" fontFamily="var(--mono)" textAnchor={i === 0 ? "start" : i === dDateTicks.length - 1 ? "end" : "middle"}>{dt.label}</text>
            ))}
            {/* Axis lines */}
            <line x1={dcL * 2} y1={dcT} x2={dcL * 2} y2={dcB} stroke="#1a222e" strokeWidth="0.4" />
            <line x1={dcL * 2} y1={dcB} x2={dcR * 2} y2={dcB} stroke="#1a222e" strokeWidth="0.4" />
            {/* Chart data */}
            {(() => {
              const sx = (v, i) => `${dcL * 2 + (i / dPts) * (dcR - dcL) * 2},${dcB - ((v - dMn) / (dMx - dMn)) * (dcB - dcT)}`;
              const sPre = dData.slice(0, dRi + 1).map(sx).join(" ");
              const sPost = dData.slice(dRi).map((v, i) => sx(v, i + dRi)).join(" ");
              const sArea = `${dData.slice(dRi).map((v, i) => sx(v, i + dRi)).join(" ")} ${dcR * 2},${dcB} ${dcL * 2 + (dRi / dPts) * (dcR - dcL) * 2},${dcB}`;
              const rx = dcL * 2 + (dRi / dPts) * (dcR - dcL) * 2;
              const riY = dcB - ((dData[dRi] - dMn) / (dMx - dMn)) * (dcB - dcT);
              return <>
                <polyline points={sPre} fill="none" stroke="#334455" strokeWidth="1" strokeDasharray="3 2" />
                <line x1={rx} y1={dcT} x2={rx} y2={dcB} stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5" />
                <circle cx={rx} cy={riY} r="2.5" fill={color} />
                <text x={rx + 3} y={dcT + 5} fill={color} fontSize="5" fontFamily="var(--mono)">REPORT</text>
                <polygon points={sArea} fill={`url(#dossier-g-${company.ticker})`} />
                <polyline points={sPost} fill="none" stroke={color} strokeWidth="1.5" />
                <circle cx={dcR * 2} cy={dcB - ((dData[dPts] - dMn) / (dMx - dMn)) * (dcB - dcT)} r="2" fill={up ? "#39ff14" : "#ff3344"} />
              </>;
            })()}
            {/* Hover crosshair */}
            {dHoverIdx != null && (() => {
              const hx = dcL * 2 + (dHoverIdx / dPts) * (dcR - dcL) * 2;
              const hy = dcB - ((dData[dHoverIdx] - dMn) / (dMx - dMn)) * (dcB - dcT);
              return <>
                <line x1={hx} y1={dcT} x2={hx} y2={dcB} stroke="#8a9bb0" strokeWidth="0.5" />
                <line x1={dcL * 2} y1={hy} x2={dcR * 2} y2={hy} stroke="#8a9bb0" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.5" />
                <circle cx={hx} cy={hy} r="3" fill="none" stroke="#fff" strokeWidth="1" />
                <circle cx={hx} cy={hy} r="1.5" fill="#fff" />
              </>;
            })()}
          </svg>
        </div>

        {/* Role & Significance */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color, letterSpacing: "0.2em", marginBottom: 6 }}>▎ SUPPLY CHAIN ROLE</div>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#c8d6e5", lineHeight: 1.7 }}>{company.role}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color, letterSpacing: "0.2em", marginBottom: 6 }}>▎ WHY IT MATTERS</div>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#c8d6e5", lineHeight: 1.7 }}>{company.significance}</p>
        </div>

        {/* Key Facts */}
        {company.keyFacts && company.keyFacts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color, letterSpacing: "0.2em", marginBottom: 8 }}>▎ KEY INTELLIGENCE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {company.keyFacts.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", fontFamily: "var(--mono)", fontSize: "0.65rem", color: "#8a9bb0" }}>
                  <span style={{ color, marginRight: 8, fontSize: "0.5rem", marginTop: 2 }}>◆</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid #111820", marginTop: 8 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#3d4a5a" }}>
            <span style={{ color: company.country === "US" ? "#39ff14" : "#00e5ff" }}>●</span> {company.country} · {company.exchange}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#333d4a" }}>FOR INFORMATIONAL PURPOSES ONLY</span>
        </div>
      </div>
    </div>
  );
};

// ─── WORLD MAP ──────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const WorldMap = ({ report }) => {
  const companies = useMemo(() => getAllCompanies(report), [report]);
  const [hov, setHov] = useState(null);
  const byCountry = useMemo(() => {
    const m = {};
    companies.forEach(c => { if (!m[c.country]) m[c.country] = []; m[c.country].push(c); });
    return m;
  }, [companies]);

  const geoStyle = useMemo(() => ({
    default: { fill: "#0d1117", stroke: "#1a222e", strokeWidth: 0.4, outline: "none" },
    hover: { fill: "#111820", stroke: "#1a222e", strokeWidth: 0.4, outline: "none" },
    pressed: { fill: "#0d1117", stroke: "#1a222e", strokeWidth: 0.4, outline: "none" },
  }), []);

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color: "#3d4a5a", letterSpacing: "0.3em", marginBottom: 12 }}>
        GLOBAL SUPPLY CHAIN TOPOLOGY · {Object.keys(byCountry).length} NATIONS
      </div>
      <div style={{ background: "#05080a", border: "1px solid #111820", borderRadius: 6, overflow: "hidden" }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 130, center: [30, 25] }}
          style={{ width: "100%", height: "auto", maxHeight: 420 }}
          width={800}
          height={420}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography key={geo.rsmKey} geography={geo} style={geoStyle} />
              ))
            }
          </Geographies>

          {/* Company markers */}
          {Object.entries(byCountry).map(([country, cos]) => {
            const coords = COUNTRY_COORDS[country];
            if (!coords) return null;
            const co = coords[0];
            const ag = cos.reduce((a, c) => a + parseFloat(pct(c.start, c.now)), 0) / cos.length;
            const isH = hov === country;
            const r = isH ? 8 : 5;
            return (
              <Marker key={country} coordinates={[co.lon, co.lat]}
                onMouseEnter={() => setHov(country)} onMouseLeave={() => setHov(null)}
                style={{ cursor: "pointer" }}>
                {/* Pulsing ring */}
                <circle r={r * 2.5} fill="none" stroke={report.color} strokeWidth="0.8" opacity="0.3">
                  <animate attributeName="r" from={r * 1.5} to={r * 3} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Main dot */}
                <circle r={r} fill={report.color} opacity="0.9">
                  <animate attributeName="opacity" values="0.9;0.5;0.9" dur="3s" repeatCount="indefinite" />
                </circle>
                {/* Core */}
                <circle r={r * 0.4} fill="white" opacity="0.6" />
                {/* Hover tooltip */}
                {isH && (
                  <g>
                    <rect x={10} y={-16} width={140} height={28} rx={4} fill="#0a0e12ee" stroke={report.color + "44"} strokeWidth="1" />
                    <text x={18} y={2} fill={report.color} fontSize="11" fontFamily="var(--mono)" fontWeight="700">
                      {country} · {cos.length} COs · {ag >= 0 ? "+" : ""}{ag.toFixed(0)}%
                    </text>
                  </g>
                )}
              </Marker>
            );
          })}
        </ComposableMap>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#3d4a5a", marginTop: 8, paddingLeft: 4 }}>
        {companies.length} COMPANIES · {Object.keys(byCountry).length} COUNTRIES
      </div>

      {/* Country summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 16 }}>
        {Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length).map(([country, cos]) => {
          const ag = cos.reduce((a, c) => a + parseFloat(pct(c.start, c.now)), 0) / cos.length;
          return (
            <div key={country} style={{ background: "#0a0e12", border: "1px solid #1a222e", borderRadius: 3, padding: "8px 10px", fontFamily: "var(--mono)", fontSize: "0.6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9bb0", fontWeight: 700 }}>{country}</span>
                <span style={{ color: "#39ff14", fontWeight: 700 }}>{ag >= 0 ? "+" : ""}{ag.toFixed(0)}%</span>
              </div>
              <div style={{ color: "#3d4a5a", marginTop: 2, fontSize: "0.5rem" }}>
                {cos.length} cos · {cos.map(c => report.unlocked ? c.ticker : "████").join(", ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── LOGIN MODAL ────────────────────────────────────────────────────────────
const LoginModal = ({ onClose, onSuccess, color }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | checking | sent | error | not_found
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    // Dev bypass: only available in local development builds
    if (import.meta.env.DEV && email === 'devpro') {
      onSuccess({ email: 'dev@test.com', tier: 'pro' });
      return;
    }

    setStatus('checking');
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/auth/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('sent');
        setMessage(data.message);
      } else {
        setStatus('not_found');
        setMessage(data.message || 'No active subscription found.');
      }
    } catch {
      setStatus('error');
      setMessage('Connection error. Try again.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0a0e12', border: `1px solid ${color}44`, borderRadius: 8, padding: 32, maxWidth: 420, width: '90%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#556070', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
        <div style={{ fontFamily: "var(--display)", fontSize: '0.5rem', color, letterSpacing: '0.3em', marginBottom: 6 }}>CLEARANCE VERIFICATION</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: '0.95rem', color: '#e0e6ed', fontWeight: 700, marginBottom: 6 }}>Verify Substack Pro Access</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: '0.6rem', color: '#556070', marginBottom: 24, lineHeight: 1.5 }}>
          Enter the email linked to your Substack Pro subscription. We'll send a magic link to verify your access.
        </div>

        {status === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📧</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: '0.75rem', color: '#39ff14', marginBottom: 8 }}>Magic link sent!</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: '0.6rem', color: '#8a9bb0', lineHeight: 1.5 }}>Check your email and click the link to activate COMMAND access. You can close this window.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="text" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%', padding: '12px 14px', background: '#05080a', border: '1px solid #1a222e',
                borderRadius: 4, color: '#e0e6ed', fontFamily: "var(--mono)", fontSize: '0.75rem',
                outline: 'none', marginBottom: 12,
              }}
              onFocus={e => e.target.style.borderColor = color}
              onBlur={e => e.target.style.borderColor = '#1a222e'}
            />
            <button type="submit" disabled={status === 'checking'}
              style={{
                width: '100%', padding: '12px 0', background: status === 'checking' ? '#1a222e' : color,
                border: 'none', borderRadius: 4, fontFamily: "var(--mono)", fontSize: '0.7rem',
                fontWeight: 700, color: '#05080a', cursor: status === 'checking' ? 'wait' : 'pointer',
                letterSpacing: '0.1em',
              }}>
              {status === 'checking' ? 'VERIFYING CLEARANCE...' : 'VERIFY ACCESS →'}
            </button>
            {message && (
              <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: '0.6rem', color: status === 'not_found' ? '#ff6600' : '#ff3344', lineHeight: 1.5 }}>
                {message}
                {status === 'not_found' && (
                  <a href="https://fpxai.substack.com/subscribe" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', color, marginTop: 8, textDecoration: 'none' }}>
                    Subscribe at fpxai.substack.com →
                  </a>
                )}
              </div>
            )}
          </form>
        )}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1a222e', textAlign: 'center' }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: '0.55rem', color: '#3d4a5a', marginBottom: 6 }}>Don't have a subscription?</div>
          <a href="https://fpxai.substack.com/subscribe" target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "var(--mono)", fontSize: '0.6rem', color, textDecoration: 'none', letterSpacing: '0.1em' }}>
            SUBSCRIBE ON SUBSTACK →
          </a>
        </div>
      </div>
    </div>
  );
};

// ─── PRICING GATE ───────────────────────────────────────────────────────────
const PricingGate = ({ report, mob, onVerify }) => {
  const [showPricing, setShowPricing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [hoverFree, setHoverFree] = useState(false);
  const [hoverPro, setHoverPro] = useState(false);

  useEffect(() => {
    if (!started || progress >= 15) return;
    const timer = setTimeout(() => setProgress(p => p + 1), 60);
    return () => clearTimeout(timer);
  }, [started, progress]);

  useEffect(() => {
    if (progress >= 15) {
      const t = setTimeout(() => setShowPricing(true), 400);
      return () => clearTimeout(t);
    }
  }, [progress]);

  const pwStages = report.chips ? report.chips.flatMap(c => c.stages) : report.stages;
  const allCos = pwStages.flatMap(s => s.companies);
  const freeReports = REPORTS.filter(r => r.unlocked);
  const proReports = REPORTS.filter(r => !r.unlocked);

  const freeFeatures = [
    { label: `${freeReports.length} Declassified Reports`, enabled: true },
    { label: "Stock Price Tracking", enabled: true },
    { label: "Basic Supply Chain Maps", enabled: true },
    { label: "Company Dossiers", enabled: true },
    { label: "Weekly Email Briefings", enabled: true },
  ];
  const proFeatures = [
    { label: "All Reports Unlocked", enabled: true },
    { label: `${proReports.length}+ Classified Reports`, enabled: true },
    { label: "Real-Time Price Alerts", enabled: true },
    { label: "Deep Supply Chain Analysis", enabled: true },
    { label: "Predictive Risk Signals", enabled: true },
    { label: "Early Access to New Intel", enabled: true },
    { label: "Priority Briefings", enabled: true },
  ];


  // Decryption attempt phase
  if (!showPricing) {
    return (
      <div style={{ background: `linear-gradient(135deg, ${report.color}05, #0a0e12)`, border: `1px solid ${report.color}22`, borderRadius: 6, padding: mob ? 20 : 32, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, transparent, transparent 20px, ${report.color}03 20px, ${report.color}03 40px)` }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <WireframeChip color={report.color} size={mob ? 48 : 64} />
          <div style={{ fontFamily: "var(--display)", fontSize: "0.7rem", color: report.color, letterSpacing: "0.25em", margin: "16px 0 8px" }}>{report.codename} · {report.classification}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "0.85rem" : "1rem", color: "#e0e6ed", fontWeight: 700, marginBottom: 8 }}>{report.name}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070", marginBottom: 20, lineHeight: 1.6 }}>
            {allCos.length} companies · {pwStages.length} stages
          </div>
          {!started ? (
            <button onClick={() => setStarted(true)} style={{ fontFamily: "var(--mono)", background: "transparent", border: `1px solid ${report.color}55`, color: report.color, padding: "10px 28px", borderRadius: 3, fontSize: "0.7rem", cursor: "pointer", letterSpacing: "0.15em", transition: "all 0.2s" }}
              onMouseEnter={e => { e.target.style.background = report.color + "15"; }} onMouseLeave={e => { e.target.style.background = "transparent"; }}>
              ▶ ATTEMPT DECRYPTION
            </button>
          ) : progress < 15 ? (
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: report.color, marginBottom: 8, animation: "blink 0.3s infinite" }}>DECRYPTING... {progress}%</div>
              <div style={{ width: 200, height: 4, background: "#1a222e", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: report.color, borderRadius: 2, transition: "width 0.06s" }} />
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#ff3344", animation: "blink 0.5s 2" }}>✖ ACCESS DENIED — CLEARANCE UPGRADE REQUIRED</div>
          )}
        </div>
      </div>
    );
  }

  // Pricing comparison phase
  return (
    <div style={{ position: "relative", overflow: "hidden", animation: "fadeSlideUp 0.5s ease both" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: mob ? 16 : 24 }}>
        <div style={{ fontFamily: "var(--display)", fontSize: "0.55rem", color: "#ff3344", letterSpacing: "0.3em", marginBottom: 6 }}>CLEARANCE UPGRADE REQUIRED</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "0.9rem" : "1.1rem", color: "#e0e6ed", fontWeight: 700, marginBottom: 6 }}>Choose Your Access Level</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070" }}>Unlock classified supply chain intelligence</div>
      </div>

      {/* Pricing Cards */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 12 : 16 }}>
        {/* FREE TIER */}
        <div
          onMouseEnter={() => setHoverFree(true)} onMouseLeave={() => setHoverFree(false)}
          style={{
            background: hoverFree ? "#0d1218" : "#0a0e12",
            border: "1px solid #1a222e",
            borderRadius: 8, padding: mob ? 20 : 24, position: "relative", overflow: "hidden",
            transition: "all 0.3s",
          }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, transparent, transparent 30px, #ffffff02 30px, #ffffff02 60px)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color: "#3d4a5a", letterSpacing: "0.3em", marginBottom: 8 }}>CLEARANCE LEVEL 1</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "1.1rem" : "1.3rem", color: "#8a9bb0", fontWeight: 700 }}>RECON</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "1.8rem" : "2.2rem", fontWeight: 700, color: "#e0e6ed", margin: "12px 0 4px" }}>
              $0<span style={{ fontSize: "0.7rem", color: "#556070" }}>/mo</span>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#556070", marginBottom: 20 }}>Basic intelligence access</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {freeFeatures.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--mono)", fontSize: "0.6rem" }}>
                  <span style={{ color: "#39ff14", fontSize: "0.7rem", width: 14, flexShrink: 0 }}>✓</span>
                  <span style={{ color: "#8a9bb0" }}>{f.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: "10px 0", textAlign: "center", fontFamily: "var(--mono)", fontSize: "0.65rem", color: "#3d4a5a", border: "1px solid #1a222e", borderRadius: 4, letterSpacing: "0.1em" }}>
              CURRENT ACCESS
            </div>
          </div>
        </div>

        {/* PRO TIER */}
        <div
          onMouseEnter={() => setHoverPro(true)} onMouseLeave={() => setHoverPro(false)}
          style={{
            background: hoverPro ? `${report.color}0a` : `${report.color}05`,
            border: `1px solid ${report.color}44`,
            borderRadius: 8, padding: mob ? 20 : 24, position: "relative", overflow: "hidden",
            transition: "all 0.3s",
            boxShadow: `0 0 30px ${report.color}08, 0 0 60px ${report.color}04`,
          }}>
          {/* Recommended badge */}
          <div style={{ position: "absolute", top: 12, right: 12, fontFamily: "var(--display)", fontSize: "0.4rem", color: "#05080a", background: report.color, padding: "3px 8px", borderRadius: 2, letterSpacing: "0.15em", fontWeight: 700 }}>RECOMMENDED</div>
          <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, transparent, transparent 30px, ${report.color}03 30px, ${report.color}03 60px)` }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color: report.color, letterSpacing: "0.3em", marginBottom: 8 }}>CLEARANCE LEVEL 2</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "1.1rem" : "1.3rem", color: report.color, fontWeight: 700 }}>COMMAND</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "1.8rem" : "2.2rem", fontWeight: 700, color: "#e0e6ed", margin: "12px 0 4px" }}>
              $50<span style={{ fontSize: "0.7rem", color: "#556070" }}>/mo</span>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#556070", marginBottom: -2 }}>or $500<span style={{ color: "#3d4a5a" }}>/year</span></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#556070", marginBottom: 20 }}>Full operational intelligence</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {proFeatures.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--mono)", fontSize: "0.6rem" }}>
                  <span style={{ color: report.color, fontSize: "0.7rem", width: 14, flexShrink: 0 }}>✓</span>
                  <span style={{ color: "#c8d6e5" }}>{f.label}</span>
                </div>
              ))}
            </div>
            <a
              href="https://fpxai.substack.com/subscribe"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", marginTop: 20, padding: "12px 0", textAlign: "center", fontFamily: "var(--mono)",
                fontSize: "0.7rem", fontWeight: 700, color: "#05080a", background: report.color, border: "none",
                borderRadius: 4, letterSpacing: "0.1em", cursor: "pointer", textDecoration: "none",
                boxShadow: `0 0 20px ${report.color}33, 0 0 40px ${report.color}15`,
                transition: "all 0.2s",
              }}>
              UPGRADE ACCESS →
            </a>
          </div>
        </div>
      </div>

      {/* New user / existing subscriber */}
      <div style={{ marginTop: mob ? 16 : 20, display: "flex", flexDirection: mob ? "column" : "row", gap: mob ? 10 : 12 }}>
        <div style={{ flex: 1, textAlign: "center", padding: "16px 20px", background: "#0a0e12", border: "1px solid #111820", borderRadius: 6 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070", marginBottom: 8 }}>New here?</div>
          <a
            href="https://fpxai.substack.com/subscribe"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: "0.65rem", color: "#05080a", background: report.color, cursor: "pointer", letterSpacing: "0.1em", border: "none", padding: "8px 20px", borderRadius: 3, textDecoration: "none", fontWeight: 700 }}>
            SUBSCRIBE ON SUBSTACK →
          </a>
        </div>
        <div style={{ flex: 1, textAlign: "center", padding: "16px 20px", background: "#0a0e12", border: "1px solid #111820", borderRadius: 6 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070", marginBottom: 8 }}>Already a Substack Pro subscriber?</div>
          <button
            onClick={onVerify}
            style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: report.color, cursor: "pointer", background: "none", letterSpacing: "0.1em", border: `1px solid ${report.color}33`, padding: "8px 20px", borderRadius: 3 }}>
            VERIFY CLEARANCE →
          </button>
        </div>
      </div>

      {/* What you're unlocking */}
      <div style={{ marginTop: mob ? 12 : 16, padding: "14px 16px", background: `${report.color}05`, border: `1px solid ${report.color}15`, borderRadius: 6 }}>
        <div style={{ fontFamily: "var(--display)", fontSize: "0.45rem", color: report.color, letterSpacing: "0.25em", marginBottom: 10 }}>CLASSIFIED REPORTS YOU'LL UNLOCK</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {proReports.map(r => (
            <div key={r.id} style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", padding: "4px 10px", background: "#0a0e12", border: `1px solid ${r.color}33`, borderRadius: 3, color: r.color }}>
              {r.codename}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── CHIP SELECTOR (Rubin NVL72) ──────────────────────────────────────────
const CHIP_IMAGES = {
  "rb-gpu": "/rubin/gpu.png",
  "rb-cpu": "/rubin/cpu.png",
  "rb-connectx": "/rubin/connectx.png",
  "rb-nvlink": "/rubin/nvlink.png",
  "rb-spectrum": "/rubin/spectrumx.png",
  "rb-dpu": "/rubin/bluefield.png",
};
const ChipSelector = ({ chips, activeChipId, onSelect, color, mob }) => (
  <div style={{ padding: mob ? "8px 10px" : "12px 28px", borderBottom: "1px solid #111820", background: "#070a0e", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
    <div style={{ fontFamily: "var(--display)", fontSize: "0.4rem", color: "#3d4a5a", letterSpacing: "0.3em", marginBottom: 8 }}>
      CHIPS · Pick a chip to explore its supply chain
    </div>
    <div style={{ display: "flex", gap: 6 }}>
      {chips.map(chip => {
        const isActive = chip.id === activeChipId;
        const chipCos = chip.stages.reduce((a, s) => a + s.companies.length, 0);
        const chipImg = CHIP_IMAGES[chip.id];
        return (
          <div key={chip.id} onClick={() => onSelect(chip.id)}
            style={{
              flex: "0 0 auto", minWidth: 120, background: isActive ? `${color}08` : "#0a0e12",
              border: `1px solid ${isActive ? color + "66" : "#1a222e"}`, borderRadius: 6,
              padding: "10px 12px", cursor: "pointer", transition: "all 0.25s", textAlign: "center",
              boxShadow: isActive ? `0 0 12px ${color}22, inset 0 0 20px ${color}05` : "none",
            }}>
            {chipImg ? (
              <img src={chipImg} alt={chip.label} style={{ width: 44, height: 44, objectFit: "contain", opacity: isActive ? 1 : 0.45, filter: isActive ? "none" : "grayscale(0.6)", transition: "all 0.25s" }} />
            ) : (
              <WireframeChip color={isActive ? color : "#3d4a5a"} size={36} />
            )}
            <div style={{ fontFamily: "var(--display)", fontSize: "0.6rem", fontWeight: 700, color: isActive ? color : "#8a9bb0", marginTop: 6, letterSpacing: "0.1em" }}>
              {chip.label}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.42rem", color: isActive ? "#8a9bb0" : "#3d4a5a", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {chip.name}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.38rem", color: "#3d4a5a", marginTop: 3 }}>
              {chipCos} nodes · {chip.stages.length} gates
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function WarRoom() {
  const mob = useIsMobile();
  const [activeReportId, setActiveReportId] = useState("tpu");
  const [activeStageId, setActiveStageId] = useState(null);
  const [activeChipId, setActiveChipId] = useState(null);
  const [time, setTime] = useState(new Date());
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [view, setView] = useState("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null); // { email, tier } or null
  const [showLogin, setShowLogin] = useState(false);
  const isPro = user?.tier === 'pro';
  const pricingRef = useRef(null);
  const scrollToPricing = () => {
    if (pricingRef.current) pricingRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Check for magic link token in URL or existing session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      // Magic link callback — verify token
      fetch(`${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            localStorage.setItem('scc_token', data.sessionToken);
            setUser({ email: data.email, tier: data.tier });
            if (data.tier === 'pro') fetchLockedData(data.sessionToken);
          }
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch(() => {
          window.history.replaceState({}, '', window.location.pathname);
        });
    } else {
      // Check existing session
      const saved = localStorage.getItem('scc_token');
      if (saved) {
        fetch(`${API_URL}/api/auth/status`, {
          headers: { Authorization: `Bearer ${saved}` },
        })
          .then(r => r.json())
          .then(data => {
            if (data.authenticated) {
              setUser({ email: data.email, tier: data.tier });
              if (data.tier === 'pro') fetchLockedData(saved);
            } else {
              localStorage.removeItem('scc_token');
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  const [lockedLoaded, setLockedLoaded] = useState(false);

  // Fetch and merge locked report data when user has pro access
  const fetchLockedData = async (token) => {
    try {
      const resp = await fetch(`${API_URL}/api/reports/locked`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && data.reports) {
        mergeLockedData(data.reports);
        // Also fetch current prices for newly unlocked tickers
        await updatePricesFromJSON();
        setLockedLoaded(true);
      }
    } catch (err) {
      console.error('Failed to fetch locked data:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('scc_token');
    setUser(null);
    setLockedLoaded(false);
    // Reload to restore redacted state (mergeLockedData mutated REPORTS in-place)
    window.location.reload();
  };

  const [pricesUpdated, setPricesUpdated] = useState(null);
  const [historicalPrices, setHistoricalPrices] = useState(null);

  useEffect(() => {
    updatePricesFromJSON().then(ts => { if (ts) setPricesUpdated(ts); });
    loadHistoricalPrices().then(h => { if (h) setHistoricalPrices(h); });
  }, []);

  const report = REPORTS.find(r => r.id === activeReportId);
  const hasChips = !!report.chips;

  // Derive active stages: from chip if chip-based, otherwise from report
  const activeChip = hasChips ? (report.chips.find(c => c.id === activeChipId) || report.chips[0]) : null;
  const activeStages = hasChips ? activeChip.stages : report.stages;

  useEffect(() => {
    if (hasChips) {
      setActiveChipId(report.chips[0].id);
      setActiveStageId(report.chips[0].stages[0]?.id || null);
    } else {
      setActiveChipId(null);
      if (report.stages.length > 0) setActiveStageId(report.stages[0].id);
    }
    setView("grid");
  }, [activeReportId]);

  useEffect(() => {
    if (activeStages.length > 0 && !activeStages.find(s => s.id === activeStageId)) {
      setActiveStageId(activeStages[0].id);
    }
  }, [activeChipId]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const stage = activeStages.find(s => s.id === activeStageId) || activeStages[0];

  // For overall stats, deduplicate across all chips
  const allCosRaw = hasChips
    ? report.chips.flatMap(c => c.stages.flatMap(s => s.companies))
    : report.stages.flatMap(s => s.companies);
  const seenTickers = new Set();
  const allCos = allCosRaw.filter(c => { if (seenTickers.has(c.ticker)) return false; seenTickers.add(c.ticker); return true; });
  // Use lockedStats for locked reports (pre-computed from real data), live calc for unlocked/pro
  const isLocked = !report.unlocked && !isPro;
  const avgGain = isLocked && report.lockedStats ? report.lockedStats.avgGain : allCos.reduce((a, c) => a + parseFloat(pct(c.start, c.now)), 0) / allCos.length;
  const bestPickPct = isLocked && report.lockedStats ? report.lockedStats.bestPick : null;
  const bestPick = isLocked ? { start: 0, now: 0 } : allCos.reduce((b, c) => parseFloat(pct(c.start, c.now)) > parseFloat(pct(b.start, b.now)) ? c : b);
  const bestPickVal = bestPickPct != null ? bestPickPct : parseFloat(pct(bestPick.start, bestPick.now));

  return (
    <div style={{ "--mono": "'Poppins', sans-serif", "--display": "'Poppins', sans-serif", minHeight: "100vh", background: "#05080a", color: "#e0e6ed", fontFamily: "var(--mono)", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes scanMove { 0% { opacity: 0.5; } 50% { opacity: 0.8; } 100% { opacity: 0.5; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes cardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #05080a; }
        ::-webkit-scrollbar-thumb { background: #1a222e; }
        @media (max-width: 767px) {
          .dossier-inner { width: 100% !important; max-width: 100% !important; max-height: 100vh !important; height: 100vh !important; border-radius: 0 !important; padding: 16px 14px !important; }
        }
      `}</style>

      {!mob && <CRT />}

      {/* HEADER */}
      <header style={{ padding: mob ? "10px 12px" : "14px 28px", display: "flex", justifyContent: "space-between", alignItems: mob ? "flex-start" : "center", borderBottom: "1px solid #111820", background: "#05080acc", flexWrap: "wrap", gap: mob ? 8 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: mob ? 8 : 14 }}>
          <img src="/rubin/Adobe Express - file.png" alt="FPX" style={{ height: mob ? 24 : 32, filter: "invert(1)", opacity: 0.9 }} />
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 900, fontSize: mob ? "0.7rem" : "0.85rem", letterSpacing: "0.2em", color: "#e0e6ed" }}>SUPPLY CHAIN COMMAND</div>
            {!mob && <div style={{ fontSize: "0.55rem", color: "#3d4a5a", letterSpacing: "0.25em" }}>AI INFRASTRUCTURE INTELLIGENCE · EST. 2025</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: mob ? 8 : 20 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "0.5rem" : "0.6rem", color: "#3d4a5a" }}>
            <span style={{ color: "#39ff14", animation: "blink 2s infinite" }}>●</span> LIVE {time.toLocaleTimeString("en-US", { hour12: false })}
          </div>
          {!mob && (
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", padding: "4px 10px", border: `1px solid ${isPro ? '#ff660033' : '#39ff1433'}`, color: isPro ? '#ff6600' : '#39ff14', borderRadius: 3 }}>
              CLEARANCE: {isPro ? 'LEVEL 2' : 'LEVEL 1'}
            </div>
          )}
          {isPro ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: '0.55rem', color: '#8a9bb0' }}>{user.email}</span>
              <button onClick={handleLogout} style={{ fontFamily: "var(--mono)", background: 'none', border: '1px solid #1a222e', color: '#556070', padding: mob ? '4px 8px' : '6px 12px', borderRadius: 3, fontSize: '0.55rem', cursor: 'pointer' }}>LOGOUT</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ fontFamily: "var(--display)", background: "#39ff14", color: "#05080a", border: "none", padding: mob ? "5px 10px" : "8px 18px", borderRadius: 3, fontSize: mob ? "0.55rem" : "0.65rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.15em", boxShadow: "0 0 16px #39ff1433" }}>UPGRADE</button>
          )}
        </div>
      </header>

      {/* REPORT TABS */}
      <div style={{ display: "flex", gap: 2, padding: mob ? "0 8px" : "0 28px", background: "#070a0e", borderBottom: "1px solid #111820", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {REPORTS.map(r => (
          <button key={r.id} onClick={() => setActiveReportId(r.id)}
            style={{
              fontFamily: "var(--mono)", fontSize: mob ? "0.55rem" : "0.65rem", padding: mob ? "8px 10px" : "10px 18px", cursor: "pointer",
              background: activeReportId === r.id ? "#0a0e12" : "transparent",
              borderBottom: activeReportId === r.id ? `2px solid ${r.color}` : "2px solid transparent",
              border: "none", borderBottomWidth: 2, borderBottomStyle: "solid",
              borderBottomColor: activeReportId === r.id ? r.color : "transparent",
              color: activeReportId === r.id ? r.color : "#556070",
              transition: "all 0.2s", display: "flex", alignItems: "center", gap: mob ? 4 : 8, whiteSpace: "nowrap",
            }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, display: "inline-block", boxShadow: activeReportId === r.id ? `0 0 8px ${r.color}55` : "none" }} />
            {r.name}
            {!r.unlocked && !isPro && <span style={{ fontSize: "0.5rem", opacity: 0.5 }}>🔒</span>}
            {(r.unlocked || isPro) && <span style={{ fontSize: "0.45rem", background: isPro && !r.unlocked ? "#ff660022" : "#39ff1422", color: isPro && !r.unlocked ? "#ff6600" : "#39ff14", padding: "1px 6px", borderRadius: 2, letterSpacing: "0.1em" }}>{r.unlocked ? "FREE" : "PRO"}</span>}
          </button>
        ))}
      </div>

      {!mob && <TickerTape isPro={isPro} onUpgrade={() => setShowLogin(true)} lockedLoaded={lockedLoaded} />}

      {/* CHIP SELECTOR (Rubin only) */}
      {hasChips && (
        <ChipSelector chips={report.chips} activeChipId={activeChipId || report.chips[0].id} onSelect={setActiveChipId} color={report.color} mob={mob} />
      )}

      {/* MAIN LAYOUT */}
      <div style={mob ? { display: "flex", flexDirection: "column", minHeight: 0 } : { display: "grid", gridTemplateColumns: "280px 1fr", height: hasChips ? "calc(100vh - 260px)" : "calc(100vh - 140px)", overflow: "hidden" }}>
        {/* LEFT SIDEBAR — collapsible on mobile */}
        {mob ? (
          <div style={{ borderBottom: "1px solid #111820", background: "#070a0e" }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color: report.color, letterSpacing: "0.2em" }}>
                ◆ {stage.name}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#556070" }}>{sidebarOpen ? "▲" : "▼"} {activeStages.length} stages</span>
            </button>
            {sidebarOpen && (
              <div style={{ padding: "0 0 12px", overflowY: "auto", maxHeight: 320 }}>
                {activeStages.map(s => {
                  const isA = activeStageId === s.id;
                  const ag = s.companies.reduce((a, c) => a + parseFloat(pct(c.start, c.now)), 0) / s.companies.length;
                  const hc = ag > 200 ? "#ff3344" : ag > 100 ? "#ff6d00" : ag > 30 ? "#ffea00" : "#39ff14";
                  return (
                    <div key={s.id} onClick={() => { setActiveStageId(s.id); setSidebarOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", background: isA ? report.color + "0a" : "transparent", borderLeft: isA ? `2px solid ${report.color}` : "2px solid transparent" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: hc, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: isA ? report.color : "#8a9bb0", fontWeight: isA ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#556070" }}>{s.companies.length} nodes · {s.codename}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ borderRight: "1px solid #111820", padding: "20px 0", background: "linear-gradient(180deg, #070a0e, #05080a)", overflowY: "auto" }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.3em", padding: "0 20px", marginBottom: 4 }}>
              <span style={{ color: report.color }}>◆</span> {hasChips ? activeChip.name : report.codename}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#556070", padding: "0 20px", marginBottom: 12, lineHeight: 1.5 }}>
              {hasChips ? activeChip.desc : report.tagline}
            </div>
            <SiliconSilkRoad stages={activeStages} activeStage={activeStageId} onSelect={setActiveStageId} color={report.color} />
            <div style={{ padding: "8px 20px", fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#3d4a5a", lineHeight: 1.6 }}>
              <span style={{ color: "#39ff14" }}>●</span> 0-30% &nbsp;
              <span style={{ color: "#ffea00" }}>●</span> 30-100% &nbsp;
              <span style={{ color: "#ff6d00" }}>●</span> 100%+ &nbsp;
              <span style={{ color: "#ff3344" }}>●</span> 200%+
            </div>
          </div>
        )}

        {/* RIGHT CONTENT */}
        <div style={{ padding: mob ? "14px 10px" : "24px 28px", overflowY: "auto" }} key={`${activeReportId}-${activeChipId}-${activeStageId}`}>
          {/* Section header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: mob ? "stretch" : "flex-start", marginBottom: mob ? 12 : 20, flexWrap: "wrap", gap: mob ? 8 : 12, flexDirection: mob ? "column" : "row" }}>
            <div>
              {!mob && <div style={{ fontFamily: "var(--display)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.3em", marginBottom: 4 }}>
                ACTIVE INTELLIGENCE · {report.codename}{hasChips ? ` · ${activeChip.label}` : ""} · {stage.codename}
              </div>}
              <h2 style={{ fontFamily: "var(--display)", fontSize: mob ? "0.9rem" : "1.3rem", fontWeight: 700, color: report.color, textShadow: `0 0 20px ${report.color}33`, letterSpacing: "0.05em" }}>
                {stage.name}
              </h2>
              <div style={{ fontFamily: "var(--mono)", fontSize: mob ? "0.55rem" : "0.65rem", color: "#556070", marginTop: 4 }}>
                {stage.desc} · {stage.companies.length} tracked {stage.companies.length === 1 ? "company" : "companies"}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#3d4a5a", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: report.color, fontSize: "0.4rem" }}>■</span>
                PUBLISHED {new Date(report.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* View toggle */}
              <div style={{ display: "flex", gap: 2 }}>
                {["grid", "map"].map(v => (
                  <button key={v} onClick={() => setView(v)}
                    style={{
                      fontFamily: "var(--mono)", fontSize: "0.55rem", padding: "4px 12px", cursor: "pointer",
                      background: view === v ? report.color + "15" : "transparent",
                      border: `1px solid ${view === v ? report.color + "44" : "#1a222e"}`,
                      color: view === v ? report.color : "#556070", borderRadius: 3, transition: "all 0.2s",
                    }}>
                    {v === "grid" ? "⊞ GRID" : "⊕ MAP"}
                  </button>
                ))}
              </div>
              {!mob && <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", padding: "5px 12px", border: `1px solid ${(report.unlocked || isPro) ? "#39ff1433" : "#ff334433"}`, color: (report.unlocked || isPro) ? "#39ff14" : "#ff3344", borderRadius: 3, letterSpacing: "0.15em" }}>
                {report.classification}
              </div>}
            </div>
          </div>

          {/* Gauges — always visible with real stats */}
          {view === "grid" && (
            mob ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "12px 14px", background: "#0a0e12", border: "1px solid #111820", borderRadius: 6 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.1em" }}>$10K INVESTED</div>
                  <div style={{ fontFamily: "var(--display)", fontSize: "1.2rem", fontWeight: 700, color: "#39ff14", textShadow: "0 0 16px #39ff1444" }}>
                    ${(10000 * (1 + avgGain / 100)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.1em" }}>AVG RETURN</div>
                  <div style={{ fontFamily: "var(--display)", fontSize: "1rem", fontWeight: 700, color: report.color }}>{avgGain >= 0 ? "+" : ""}{avgGain.toFixed(1)}%</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.45rem", color: "#3d4a5a", letterSpacing: "0.1em" }}>BEST PICK</div>
                  <div style={{ fontFamily: "var(--display)", fontSize: "1rem", fontWeight: 700, color: "#39ff14" }}>+{bestPickVal.toFixed(1)}%</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 24, marginBottom: 24, padding: "20px 24px", background: "#0a0e12", border: "1px solid #111820", borderRadius: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <VelocityGauge value={parseFloat(avgGain.toFixed(1))} color={report.color} label="AVG RETURN" max={Math.max(100, Math.ceil(Math.abs(avgGain) * 1.3))} />
                <VelocityGauge value={bestPickVal} color="#39ff14" label="BEST PICK" max={Math.max(100, Math.ceil(bestPickVal * 1.2))} />

                <div style={{ textAlign: "center", padding: "0 16px" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: "#3d4a5a", letterSpacing: "0.15em", marginBottom: 6 }}>$10,000 INVESTED AT REPORT</div>
                  <div style={{ fontFamily: "var(--display)", fontSize: "1.6rem", fontWeight: 700, color: avgGain >= 0 ? "#39ff14" : "#ff3344", textShadow: `0 0 16px ${avgGain >= 0 ? "#39ff1444" : "#ff334444"}` }}>
                    ${(10000 * (1 + avgGain / 100)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.5rem", color: avgGain >= 0 ? "#39ff14" : "#ff3344", marginTop: 4 }}>
                    {avgGain >= 0 ? "+" : ""}${(10000 * avgGain / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} PROFIT
                  </div>
                </div>
              </div>
            )
          )}

          {/* MAP VIEW */}
          {view === "map" && <WorldMap report={report} />}

          {/* GRID VIEW */}
          {view === "grid" && (
            <>
              {(report.unlocked || isPro) ? (
                <div style={{ maxHeight: mob ? "none" : "calc(100vh - 340px)", overflowY: mob ? "visible" : "auto", paddingRight: mob ? 0 : 4 }}>
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 8 : 10 }}>
                    {[...stage.companies].sort((a, b) => tierSortKey(a.ticker) - tierSortKey(b.ticker)).map((c, i) => (
                      <StockCard key={c.ticker} company={c} color={report.color} unlocked={true} idx={i} onSelect={setSelectedCompany} reportDate={report.date} historicalPrices={historicalPrices} />
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontFamily: "var(--display)", fontSize: "0.5rem", color: "#3d4a5a", letterSpacing: "0.25em", marginBottom: 12 }}>LIVE SIGNALS · IDENTITY REDACTED</div>
                  <div style={{ maxHeight: mob ? "none" : "calc(100vh - 380px)", overflowY: mob ? "visible" : "auto", paddingRight: mob ? 0 : 4 }}>
                    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 8 : 10, marginBottom: 20 }}>
                      {[...stage.companies].sort((a, b) => tierSortKey(a.ticker) - tierSortKey(b.ticker)).map((c, i) => (
                        <StockCard key={i} company={c} color={report.color} unlocked={false} idx={i} reportDate={report.date} onUpgrade={scrollToPricing} historicalPrices={historicalPrices} />
                      ))}
                    </div>
                  </div>
                  <div ref={pricingRef}>
                    <PricingGate report={report} mob={mob} onVerify={() => setShowLogin(true)} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Alert teaser for locked */}
          {!(report.unlocked || isPro) && (
            <div style={{ marginTop: 20, padding: "12px 16px", background: "#0a0e12", border: "1px solid #ff334422", borderRadius: 4, fontFamily: "var(--mono)", fontSize: "0.65rem" }}>
              <span style={{ color: "#ff3344", animation: "blink 1s infinite" }}>⚠</span>
              <span style={{ color: "#ff3344" }}> ALERT:</span>
              <span style={{ color: "#8a9bb0" }}> Supply chain constraint detected → downstream impact on </span>
              <span style={{ color: "#556070", background: "#1a222e", padding: "1px 6px", borderRadius: 2 }}>████████</span>
              <span style={{ color: "#556070" }}> · </span>
              <span style={{ color: report.color, cursor: "pointer" }} onClick={() => setShowLogin(true)}>Unlock to reveal →</span>
            </div>
          )}

          {/* Report metadata */}
          <div style={{ display: "flex", gap: mob ? 8 : 20, marginTop: mob ? 14 : 24, padding: mob ? "10px 12px" : "12px 16px", background: "#0a0e12", border: "1px solid #111820", borderRadius: 4, flexWrap: "wrap" }}>
            {[
              ["REPORT", report.name],
              ["PUBLISHED", report.date],
              ["COMPANIES", allCos.length],
              ["STAGES", hasChips ? report.chips.reduce((a, c) => a + c.stages.length, 0) : report.stages.length],
              ["AVG RETURN", `${avgGain >= 0 ? "+" : ""}${avgGain.toFixed(1)}%`],
            ].map(([label, value]) => (
              <div key={label} style={{ fontFamily: "var(--mono)", fontSize: mob ? "0.5rem" : "0.55rem" }}>
                <span style={{ color: "#3d4a5a", letterSpacing: "0.1em" }}>{label}: </span>
                <span style={{ color: label === "AVG RETURN" ? "#39ff14" : "#8a9bb0" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COMPANY MODAL */}
      {selectedCompany && <CompanyDossier company={selectedCompany} color={report.color} onClose={() => setSelectedCompany(null)} reportDate={report.date} historicalPrices={historicalPrices} />}

      {/* LOGIN MODAL */}
      {showLogin && <LoginModal color={report.color} onClose={() => setShowLogin(false)} onSuccess={(u) => {
        setUser(u);
        setShowLogin(false);
        if (u.tier === 'pro') {
          const token = localStorage.getItem('scc_token');
          if (token) fetchLockedData(token);
        }
      }} />}

      {/* FOOTER */}
      <footer style={{ padding: mob ? "14px 12px" : "20px 28px", borderTop: "1px solid #111820", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--mono)", color: "#3d4a5a", fontSize: mob ? "0.4rem" : "0.48rem", lineHeight: 1.8, maxWidth: 640, margin: "0 auto" }}>
          <div>This is not investment advice. It's an analytical framework + a public-market watchlist for understanding how AI infrastructure supply chains evolve.</div>
          <div style={{ marginTop: 6 }}>FPX AI is not a financial advisor. We are a research marketplace for AI Infrastructure that gives us the intel on the best market signals and bottlenecks through it.</div>
        </div>
      </footer>
    </div>
  );
}
