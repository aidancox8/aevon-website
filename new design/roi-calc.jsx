// ROI Calculator — rebuilt with 4 inputs, animated outputs

function useAnimatedNumber(target, duration = 600) {
  const [display, setDisplay] = React.useState(target);
  const rafRef = React.useRef();
  const startRef = React.useRef({ from: target, ts: null });

  React.useEffect(() => {
    const from = display;
    const to = target;
    if (from === to) return;
    startRef.current = { from, to, ts: null };

    const animate = (ts) => {
      if (!startRef.current.ts) startRef.current.ts = ts;
      const elapsed = ts - startRef.current.ts;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startRef.current.from + (startRef.current.to - startRef.current.from) * eased);
      setDisplay(current);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return display;
}

function ROISlider({ label, value, min, max, step = 1, prefix = '', suffix = '', format, onChange }) {
  const displayVal = format ? format(value) : `${prefix}${value.toLocaleString()}${suffix}`;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8', letterSpacing: '-0.01em' }}>{label}</label>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.03em', fontFamily: 'Inter,sans-serif' }}>{displayVal}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', height: 4, borderRadius: 2, top: '50%', transform: 'translateY(-50%)',
          left: 0, width: pct + '%',
          background: 'linear-gradient(90deg,#6366F1,#7C3AED)',
          pointerEvents: 'none', zIndex: 1,
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ width: '100%', position: 'relative', zIndex: 2 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10.5, color: '#334155' }}>{prefix}{min.toLocaleString()}{suffix}</span>
        <span style={{ fontSize: 10.5, color: '#334155' }}>{prefix}{max.toLocaleString()}{suffix}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, highlight, big, warn }) {
  return (
    <div style={{
      background: highlight ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${highlight ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: big ? '20px 22px' : '16px 18px',
      flex: 1,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#475569', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: big ? 36 : 22, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1,
        color: warn ? '#f87171' : highlight ? '#a5b4fc' : '#F8FAFC', marginBottom: sub ? 5 : 0,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function ROICalculator() {
  const [saasMonthly, setSaasMonthly] = React.useState(800);
  const [hoursWeek, setHoursWeek] = React.useState(6);
  const [employees, setEmployees] = React.useState(8);
  const [hourlyWage, setHourlyWage] = React.useState(45);

  const annualSaaS = saasMonthly * 12;
  const annualTimeWaste = Math.round(hoursWeek * employees * 52 * hourlyWage);
  const totalLoss = annualSaaS + annualTimeWaste;
  const appCostLow = 1500;
  const appCostHigh = 4000;
  const payback = Math.max(1, Math.round(appCostLow / (totalLoss / 12)));

  const animatedTotal = useAnimatedNumber(totalLoss, 500);

  const fmt = (n) => '$' + n.toLocaleString();

  return (
    <section style={{ padding: '110px 0', borderTop: '1px solid rgba(99,102,241,0.12)' }} id="roi">
      <div className="container">
        {/* Header */}
        <div className="fi" style={{ marginBottom: 64 }}>
          <div className="sec-label">ROI Calculator</div>
          <h2 className="sec-title" style={{ maxWidth: 560, position: 'relative', zIndex: 1 }}>See what your current setup is really costing you.</h2>
          <p className="sec-sub" style={{ maxWidth: 520, position: 'relative', zIndex: 1 }}>Most businesses underestimate the true cost of SaaS subscriptions and manual workarounds. Calculate yours — then see how fast a custom app pays back.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }} className="fi" data-delay="100">
          {/* LEFT: Inputs */}
          <div style={{
            background: '#0A0F1E', border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 16, padding: '36px 36px 28px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#475569', marginBottom: 28 }}>Your Numbers</div>

            <ROISlider label="Monthly SaaS spend across all tools" value={saasMonthly} min={100} max={5000} step={50} prefix="$" onChange={setSaasMonthly} />
            <ROISlider label="Hours per week lost to manual workarounds" value={hoursWeek} min={1} max={40} suffix="h / week" onChange={setHoursWeek} />
            <ROISlider label="Number of employees affected" value={employees} min={1} max={100} suffix=" people" onChange={setEmployees} />
            <ROISlider label="Average employee hourly rate" value={hourlyWage} min={15} max={200} step={5} prefix="$" suffix="/hr" onChange={setHourlyWage} />
          </div>

          {/* RIGHT: Outputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Row 1: two smaller metrics */}
            <div style={{ display: 'flex', gap: 12 }}>
              <MetricCard label="Annual SaaS Cost" value={fmt(annualSaaS)} sub="Subscriptions you pay regardless of usage" />
              <MetricCard label="Annual Time Cost" value={fmt(annualTimeWaste)} sub="Value of hours lost to manual work" />
            </div>

            {/* Big total */}
            <div style={{
              background: 'rgba(248,113,113,0.04)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 12, padding: '24px 26px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                borderRadius: '50%', background: 'rgba(248,113,113,0.06)',
                pointerEvents: 'none',
              }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#64748B', marginBottom: 8 }}>Total Annual Loss</div>
              <div style={{
                fontSize: 52, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1,
                color: '#fca5a5',
                textShadow: '0 0 40px rgba(248,113,113,0.25)',
              }}>
                ${animatedTotal.toLocaleString()}
              </div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 8, lineHeight: 1.6 }}>
                This is what your team's current setup costs you — every year. It compounds.
              </div>
            </div>

            {/* Row 2: app cost + payback */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                flex: 1, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: '16px 18px',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#475569', marginBottom: 6 }}>Est. App Investment</div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#a5b4fc' }}>
                  {fmt(appCostLow)} – {fmt(appCostHigh)}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>One-time. You own it.</div>
              </div>
              <div style={{
                flex: 1, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: 10, padding: '16px 18px',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#475569', marginBottom: 6 }}>Payback Period</div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#86efac' }}>
                  {payback} month{payback !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>Then it pays you back.</div>
              </div>
            </div>

            {/* CTA */}
            <a href="#contact" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#6366F1', color: '#fff', textDecoration: 'none',
              padding: '14px 0', borderRadius: 9, fontSize: 14.5, fontWeight: 600,
              fontFamily: 'Inter,sans-serif', letterSpacing: '-0.01em',
              boxShadow: '0 0 32px rgba(99,102,241,0.35)',
              transition: 'opacity 0.2s, transform 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
            >
              See how we fix this →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { ROICalculator });
