// App Showcase Section — mini UI preview cards
// Exported to window for use in index.html

function OnboardingUI() {
  const steps = ['Personal Info', 'Documents', 'IT Setup', 'Complete'];
  const tasks = [
    { done: true, label: 'Upload photo ID', status: 'Done' },
    { done: true, label: 'Sign employment contract', status: 'Done' },
    { done: false, label: 'Set up 2FA', status: 'In Progress', active: true },
    { done: false, label: 'Complete benefits form', status: 'Pending' },
  ];
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 9, color: '#94A3B8', padding: '10px 12px' }}>
      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: i < 2 ? '#6366F1' : i === 2 ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)',
                border: i === 2 ? '1.5px solid #6366F1' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, color: '#fff', fontWeight: 700,
              }}>{i < 2 ? '✓' : i + 1}</div>
              <div style={{ fontSize: 7, color: i < 3 ? '#64748B' : '#334155', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{s}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ height: 1, flex: 0.6, background: i < 2 ? '#6366F1' : 'rgba(255,255,255,0.08)', marginBottom: 12 }} />
            )}
          </React.Fragment>
        ))}
      </div>
      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {tasks.map(t => (
          <div key={t.label} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
            background: t.active ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${t.active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 5,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 3, border: `1.5px solid ${t.done ? '#6366F1' : t.active ? '#6366F1' : '#334155'}`,
              background: t.done ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {t.done && <span style={{ color: '#fff', fontSize: 7, fontWeight: 800 }}>✓</span>}
              {t.active && !t.done && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#6366F1', display: 'block' }} />}
            </div>
            <span style={{ flex: 1, color: t.done ? '#475569' : '#94A3B8', textDecoration: t.done ? 'line-through' : 'none', fontSize: 8.5 }}>{t.label}</span>
            <span style={{ fontSize: 7, fontWeight: 600, color: t.done ? '#4ade80' : t.active ? '#818cf8' : '#475569', letterSpacing: '0.04em' }}>{t.status}</span>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: '62%', height: '100%', background: 'linear-gradient(90deg,#6366F1,#7C3AED)', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 7, color: '#6366F1', fontWeight: 700 }}>62%</span>
      </div>
    </div>
  );
}

function RequestTrackerUI() {
  const cols = [
    { label: 'New', count: 2, color: '#818cf8', cards: ['Website redesign quote', 'API integration scope'] },
    { label: 'In Progress', count: 3, color: '#fbbf24', cards: ['Mobile app spec', 'CRM migration', 'Report automation'] },
    { label: 'Delivered', count: 4, color: '#4ade80', cards: ['Onboarding portal', 'Invoice system'] },
  ];
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
      {cols.map(col => (
        <div key={col.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
            <span style={{ fontSize: 7.5, fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col.label}</span>
            <span style={{ fontSize: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0 4px', color: '#475569', marginLeft: 'auto' }}>{col.count}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {col.cards.map(c => (
              <div key={c} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '5px 6px', fontSize: 7.5, color: '#94A3B8', lineHeight: 1.4 }}>{c}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocSigningUI() {
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', padding: '10px 12px', fontSize: 8.5, color: '#94A3B8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 7px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 5 }}>
        <span style={{ fontSize: 12 }}>📄</span>
        <span style={{ color: '#c4b5fd', fontWeight: 600, fontSize: 8 }}>SERVICE_AGREEMENT_2026.pdf</span>
        <span style={{ marginLeft: 'auto', fontSize: 7, color: '#6366F1', fontWeight: 700, background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 8 }}>PENDING</span>
      </div>
      {[100, 80, 90, 60, 75].map((w, i) => (
        <div key={i} style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginBottom: 4, width: w + '%' }} />
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        {['Client Signature', 'Service Provider'].map((label, i) => (
          <div key={label} style={{ border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 4, padding: '6px 8px' }}>
            <div style={{ fontSize: 7, color: '#475569', marginBottom: 4 }}>{label}</div>
            {i === 0 ? (
              <div style={{ fontSize: 8, color: '#a5b4fc', fontStyle: 'italic' }}>J. Morrison</div>
            ) : (
              <div style={{ fontSize: 7, color: '#334155' }}>— Awaiting —</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, background: '#6366F1', borderRadius: 5, padding: '6px 0', textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>
        SIGN DOCUMENT →
      </div>
    </div>
  );
}

function ITTicketUI() {
  const tickets = [
    { id: '#248', title: 'VPN connection failing', status: 'Open', statusColor: '#f87171', priority: 'High', priorityColor: '#f87171' },
    { id: '#247', title: 'Printer offline – Floor 2', status: 'Active', statusColor: '#fbbf24', priority: 'Med', priorityColor: '#fbbf24' },
    { id: '#246', title: 'Password reset request', status: 'Done', statusColor: '#4ade80', priority: 'Low', priorityColor: '#4ade80' },
    { id: '#245', title: 'Slack SSO setup', status: 'Done', statusColor: '#4ade80', priority: 'Low', priorityColor: '#4ade80' },
  ];
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', padding: '10px 12px', fontSize: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 28px', gap: 4, marginBottom: 5, color: '#334155', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 7 }}>
        <div>#</div><div>Title</div><div>Status</div><div>Pri</div>
      </div>
      {tickets.map(t => (
        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 28px', gap: 4, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
          <div style={{ color: '#475569', fontSize: 7.5 }}>{t.id}</div>
          <div style={{ color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 8 }}>{t.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.statusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 7, color: t.statusColor }}>{t.status}</span>
          </div>
          <div style={{ fontSize: 7, color: t.priorityColor, fontWeight: 700 }}>{t.priority}</div>
        </div>
      ))}
      <div style={{ marginTop: 7, display: 'flex', gap: 6 }}>
        {[{l:'Open',n:1,c:'#f87171'},{l:'Active',n:1,c:'#fbbf24'},{l:'Done',n:2,c:'#4ade80'}].map(s => (
          <div key={s.l} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '4px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: s.c }}>{s.n}</div>
            <div style={{ fontSize: 6.5, color: '#475569', letterSpacing: '0.04em' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryUI() {
  const items = [
    { name: 'SKU-A209', label: 'Widget Pro', stock: 234, max: 300, warn: false },
    { name: 'SKU-B114', label: 'Base Unit', stock: 145, max: 300, warn: false },
    { name: 'SKU-C055', label: 'Connector Kit', stock: 38, max: 300, warn: true },
    { name: 'SKU-D380', label: 'Power Module', stock: 201, max: 300, warn: false },
  ];
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', padding: '10px 12px', fontSize: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 2 }}>Total SKUs</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.04em', lineHeight: 1 }}>618</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 2 }}>Low Stock</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f87171', letterSpacing: '-0.04em', lineHeight: 1 }}>1</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 2 }}>Locations</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.04em', lineHeight: 1 }}>3</div>
        </div>
      </div>
      {items.map(item => (
        <div key={item.name} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#64748B', fontSize: 7.5 }}>{item.label}</span>
            <span style={{ color: item.warn ? '#f87171' : '#94A3B8', fontWeight: item.warn ? 700 : 400, fontSize: 7.5 }}>
              {item.stock} {item.warn ? '⚠' : ''}
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: (item.stock / item.max * 100) + '%', height: '100%', borderRadius: 2,
              background: item.warn ? 'linear-gradient(90deg,#f87171,#fb923c)' : 'linear-gradient(90deg,#6366F1,#818cf8)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AIKnowledgeUI() {
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', padding: '10px 12px', fontSize: 8.5, color: '#94A3B8' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, padding: '5px 8px', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#6366F1' }}>⌕</span>
        <span style={{ color: '#475569', fontSize: 8 }}>Ask anything about your company...</span>
        <span style={{ marginLeft: 'auto', fontSize: 7, color: '#6366F1', fontWeight: 700, background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 4 }}>AI</span>
      </div>
      {/* Chat messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px 6px 6px 2px', padding: '5px 8px', fontSize: 7.5, color: '#94A3B8', maxWidth: '85%' }}>
          How do I submit an expense report?
        </div>
        <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px 6px 2px 6px', padding: '6px 8px', fontSize: 7.5, color: '#c4b5fd', maxWidth: '90%', alignSelf: 'flex-end', lineHeight: 1.5 }}>
          Go to <span style={{ color: '#a5b4fc', fontWeight: 700 }}>Finance → Expenses → New Report</span>. Fill out the form and attach receipts. Approvals route to your manager automatically.
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', animation: 'bdot 1s infinite' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', animation: 'bdot 1s 0.2s infinite' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', animation: 'bdot 1s 0.4s infinite' }} />
          <span style={{ fontSize: 7, color: '#334155', marginLeft: 2 }}>AI is thinking...</span>
        </div>
      </div>
    </div>
  );
}

const appCards = [
  { title: 'Employee Onboarding Portal', desc: 'Structured, trackable onboarding for every new hire', accent: '#6366F1', UI: OnboardingUI },
  { title: 'Client Request Tracker', desc: 'Manage client requests from intake to delivery', accent: '#7C3AED', UI: RequestTrackerUI },
  { title: 'Document Signing System', desc: 'Generate, route, and e-sign contracts automatically', accent: '#818cf8', UI: DocSigningUI },
  { title: 'Internal IT Ticketing', desc: 'Streamline your IT helpdesk without enterprise pricing', accent: '#6366F1', UI: ITTicketUI },
  { title: 'Inventory Dashboard', desc: 'Real-time stock tracking with low-inventory alerts', accent: '#7C3AED', UI: InventoryUI },
  { title: 'AI Knowledge Base', desc: 'Let your team ask questions — get instant accurate answers', accent: '#818cf8', UI: AIKnowledgeUI },
];

function AppShowcase() {
  const [active, setActive] = React.useState(null);
  return (
    <section style={{ padding: '110px 0', borderTop: '1px solid rgba(99,102,241,0.12)' }} id="showcase">
      <div className="container">
        <div className="fi" style={{ textAlign: 'center', marginBottom: 64 }}>
          <div className="sec-label" style={{ justifyContent: 'center' }}><span style={{ display: 'none' }}></span>App Gallery</div>
          <h2 className="sec-title">"I want that for my business."</h2>
          <p className="sec-sub" style={{ maxWidth: 500, margin: '0 auto' }}>Real apps we've built — or can build for you. Each one replaces a mess of spreadsheets and manual steps.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {appCards.map((card, i) => {
            const isActive = active === i;
            return (
              <div
                key={card.title}
                className="fi"
                data-delay={i * 70}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                style={{
                  background: isActive ? 'rgba(10,15,30,0.95)' : '#0A0F1E',
                  border: `1px solid ${isActive ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.12)'}`,
                  borderRadius: 14, overflow: 'hidden', cursor: 'default',
                  transition: 'all 0.25s ease',
                  transform: isActive ? 'translateY(-3px)' : 'none',
                  boxShadow: isActive ? '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15)' : 'none',
                }}
              >
                {/* Mini UI preview area */}
                <div style={{
                  background: '#080C18', borderBottom: '1px solid rgba(99,102,241,0.1)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Window chrome */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['#FF5F57','#FFBD2E','#28C840'].map(c => (
                      <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                    ))}
                    <div style={{ flex: 1, height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 3, marginLeft: 6 }} />
                  </div>
                  <card.UI />
                </div>
                {/* Card footer */}
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.025em', marginBottom: 5 }}>{card.title}</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.55 }}>{card.desc}</div>
                  <div style={{
                    marginTop: 12, fontSize: 11.5, fontWeight: 600, color: isActive ? card.accent : '#334155',
                    display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.2s',
                    letterSpacing: '-0.01em',
                  }}>
                    Build this for me <span style={{ transition: 'transform 0.2s', transform: isActive ? 'translateX(3px)' : 'none', display: 'inline-block' }}>→</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Don't see what you need? We build fully custom.</p>
          <a href="#contact" className="btn-sec" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '11px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', fontSize: 13.5, fontWeight: 500, transition: 'all 0.2s', fontFamily: 'Inter,sans-serif' }}>
            Tell us what you need →
          </a>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { AppShowcase });
