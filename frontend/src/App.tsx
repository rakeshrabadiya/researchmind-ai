import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { validatePdf } from './uploadState'

type IconName =
  | 'arrow'
  | 'book'
  | 'chart'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'file'
  | 'folder'
  | 'grid'
  | 'help'
  | 'spark'
  | 'upload'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16" /><path d="M8 7h8M8 11h6" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /><path d="M16 6h2v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    file: <><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h5" /></>,
    folder: <><path d="M3.5 6.5h6l1.5 2h9.5v10.5h-17z" /><path d="M3.5 6.5v-1h6l1.5 2" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-.9.8-1.7 1.2-1.7 2.6M12 16.7v.1" /></>,
    spark: <><path d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2z" /><path d="m19 16 .5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5z" /></>,
    upload: <><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M5 14v5h14v-5" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

const queue = [
  { id: '01', title: 'The geometry of collective attention', authors: 'M. Chen · S. Roy', journal: 'Nature Human Behaviour', date: 'Today', tone: 'coral' },
  { id: '02', title: 'Latent spaces as cultural archives', authors: 'A. Okafor · P. Singh', journal: 'Digital Scholarship Quarterly', date: 'Yesterday', tone: 'blue' },
  { id: '03', title: 'A field guide to slow technology', authors: 'J. Müller', journal: 'Journal of Design History', date: '12 Oct', tone: 'gold' },
]

function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <span className="brand-name">Research<span>Mind</span></span>
      </div>
      <div className="workspace-select">
        <div className="workspace-avatar">AS</div>
        <div><p className="eyebrow">Workspace</p><p className="workspace-name">Attention Studies</p></div>
        <Icon name="chevron" size={15} />
      </div>
      <nav className="nav-list">
        <p className="nav-label">Navigate</p>
        <a className="nav-item active" href="#overview"><Icon name="grid" /><span>Overview</span><span className="nav-count">8</span></a>
        <a className="nav-item" href="#library"><Icon name="book" /><span>My library</span></a>
        <a className="nav-item" href="#insights"><Icon name="chart" /><span>Insights</span><span className="new-dot" /></a>
        <a className="nav-item" href="#collections"><Icon name="folder" /><span>Collections</span></a>
      </nav>
      <div className="sidebar-bottom">
        <div className="weekly-card"><div className="weekly-top"><span>WEEKLY PULSE</span><Icon name="spark" size={15} /></div><strong>4<span>h</span> 26<span>m</span></strong><p>of focused reading</p><div className="pulse-track"><span /></div><div className="pulse-meta"><span>Goal 5h</span><span>85%</span></div></div>
        <a className="help-link" href="#help"><Icon name="help" size={16} /><span>Help & shortcuts</span><span className="shortcut">?</span></a>
        <div className="user-row"><div className="user-avatar">AR</div><div><strong>Alex Rivera</strong><span>Researcher</span></div><span className="more-dots">•••</span></div>
      </div>
    </aside>
  )
}

function StatCard({ value, label, detail, icon, accent }: { value: string; label: string; detail: string; icon: IconName; accent?: string }) {
  return <article className={`stat-card ${accent ?? ''}`}><div className="stat-icon"><Icon name={icon} size={17} /></div><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>
}

function PaperRow({ paper }: { paper: typeof queue[number] }) {
  return <article className="paper-row"><div className={`paper-cover ${paper.tone}`}><span>{paper.id}</span><Icon name="file" size={17} /></div><div className="paper-copy"><h3>{paper.title}</h3><p>{paper.authors}</p><span>{paper.journal}</span></div><div className="paper-date"><span>{paper.date}</span><button aria-label={`Open ${paper.title}`}><Icon name="arrow" size={16} /></button></div></article>
}

function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const handleFile = (candidate: File | null | undefined) => {
    const result = validatePdf(candidate)
    if (result.valid) {
      setFile(result.file)
      setError('')
      return
    }
    setFile(null)
    setError(result.message)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    handleFile(event.dataTransfer.files[0])
  }

  return <section className={`upload-panel ${dragActive ? 'is-dragging' : ''}`} aria-labelledby="upload-title">
    <div className="upload-heading"><div><p className="section-kicker">ADD TO THE OBSERVATORY</p><h2 id="upload-title">Bring a paper<br /><em>into focus.</em></h2></div><div className="orbit-icon" aria-hidden="true"><span className="orbit-line one" /><span className="orbit-line two" /><span className="orbit-core"><Icon name="upload" size={21} /></span></div></div>
    <p className="upload-intro">Drop a PDF here and make it part of your active reading constellation.</p>
    <div className="drop-zone" role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
      <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
      {!file ? <><div className="drop-icon"><Icon name="upload" size={21} /></div><p className="drop-title">Drop your PDF anywhere here</p><p className="drop-or">or <span>browse from your device</span></p><p className="drop-limit">PDF only · up to 25 MB</p></> : <div className="selected-file"><div className="selected-file-icon"><Icon name="file" size={20} /></div><div><p className="selected-label">READY TO REVIEW</p><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · PDF document</span></div><button type="button" className="remove-file" aria-label="Remove selected file" onClick={(event) => { event.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = '' }}>×</button></div>}
    </div>
    <div className={`upload-message ${error ? 'has-error' : ''}`} aria-live="polite">{error ? <><span className="message-symbol">!</span>{error}</> : file ? <><Icon name="check" size={14} /> File selected. Ready for your front-end preview.</> : <><Icon name="clock" size={14} /> Files stay in this page for now · no server upload connected</>}</div>
  </section>
}

export default function App() {
  return <div className="app-shell"><Sidebar /><main className="main-content" id="overview"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Overview</strong></div><div className="topbar-actions"><button className="date-button"><Icon name="clock" size={15} /> October 2024 <Icon name="chevron" size={14} /></button><button className="icon-button" aria-label="Notifications"><span className="notification-dot" /><span className="bell-shape" /></button></div></header><div className="page-content"><section className="hero"><div><p className="section-kicker">THURSDAY · 17 OCTOBER 2024</p><h1>Good morning, <em>Alex.</em></h1><p className="hero-copy">A clear desk. A curious mind.<br />Here’s where your research stands today.</p></div><div className="hero-sun" aria-hidden="true"><div className="sun-ring ring-a" /><div className="sun-ring ring-b" /><div className="sun-dot" /><span>03<br /><small>papers in orbit</small></span></div></section><section className="stat-grid" aria-label="Research statistics"><StatCard label="Papers this month" value="24" detail="↑ 18% from September" icon="book" accent="coral-accent" /><StatCard label="Reading streak" value="12 days" detail="Your longest yet" icon="spark" accent="blue-accent" /><StatCard label="Notes captured" value="86" detail="↑ 12 this week" icon="file" accent="gold-accent" /><StatCard label="Open questions" value="09" detail="3 ready to explore" icon="help" accent="ink-accent" /></section><div className="content-grid"><UploadPanel /><section className="queue-panel" id="library"><div className="panel-heading"><div><p className="section-kicker">YOUR READING QUEUE</p><h2>In the <em>field.</em></h2></div><button className="text-button">View all <Icon name="arrow" size={15} /></button></div><div className="queue-list">{queue.map((paper) => <PaperRow key={paper.id} paper={paper} />)}</div><div className="queue-footer"><span>3 papers waiting for your attention</span><button aria-label="Add another paper"><Icon name="arrow" size={15} /></button></div></section></div><section className="quote-strip"><span className="quote-mark">“</span><p>Research is formalized curiosity.<br /><em>It is poking and prying with a purpose.</em></p><span className="quote-source">— Zora Neale Hurston</span></section></div></main></div>
}
