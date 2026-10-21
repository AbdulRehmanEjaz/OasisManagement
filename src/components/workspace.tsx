"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Leaf,
  LayoutDashboard,
  Recycle,
  Building2,
  Bell,
  Users,
  Settings,
  LogOut,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  ChevronDown,
  MapPin,
  Camera,
  Check,
  FileText,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Map,
  Table2,
  Navigation,
  ShieldCheck,
  Clock3,
  Activity,
  RefreshCw,
  Menu,
  X,
  AlertCircle,
  Mail,
  ClipboardCheck,
  ExternalLink,
} from "lucide-react";
import { api, read, formatDate, type Profile, type Row } from "@/lib/client";
import { Button } from "./ui/button";
import Modal from "./modal";
import ReportForm from "./report-form";
import RecordDetail from "./record-detail";
const LocationMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});
type View =
  | "dashboard"
  | "waste"
  | "facilities"
  | "inspections"
  | "notifications"
  | "users"
  | "settings";
const labels: Record<View, string> = {
  dashboard: "Overview",
  waste: "Oasis Waste Tracking",
  facilities: "OnSite Facilities Tracking",
  inspections: "Facility inspections",
  notifications: "Notifications",
  users: "User management",
  settings: "Settings",
};
const icons = {
  dashboard: LayoutDashboard,
  waste: Recycle,
  facilities: Building2,
  notifications: Bell,
  users: Users,
  settings: Settings,
};
function Botanical() {
  return (
    <svg
      className="botanical"
      viewBox="0 0 260 240"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M125 233C120 172 143 119 192 58"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M155 122C157 74 191 32 235 25C230 71 200 112 155 122Z"
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M139 168C96 161 66 128 59 92C104 94 135 119 139 168Z"
        fill="currentColor"
        fillOpacity=".16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M127 204C142 157 173 143 215 146C197 183 169 203 127 204Z"
        fill="currentColor"
        fillOpacity=".24"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M155 121L215 48M140 168L79 111M128 203L194 159"
        stroke="currentColor"
        strokeOpacity=".6"
      />
      <circle cx="55" cy="43" r="4" fill="currentColor" />
      <circle cx="232" cy="207" r="3" fill="currentColor" />
      <path d="M31 185h18M40 176v18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
export default function Workspace({
  profile,
  configured,
  timezone,
  gpsThreshold,
}: {
  profile: Profile | null;
  configured: boolean;
  timezone: string;
  gpsThreshold: number;
}) {
  const admin = profile?.role === "admin";
  const [view, setView] = useState<View>("dashboard"),
    [module, setModule] = useState<"waste" | "inspection">("waste"),
    [menu, setMenu] = useState(false),
    [overview, setOverview] = useState<Row | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [supervisor, setSupervisor] = useState(""),
    [date, setDate] = useState(""),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(0),
    [mapMode, setMapMode] = useState(false),
    [filters, setFilters] = useState(false),
    [facilities, setFacilities] = useState<Row[]>([]),
    [users, setUsers] = useState<Row[]>([]),
    [options, setOptions] = useState<Row[]>([]),
    [form, setForm] = useState<"waste" | "inspection" | "facility" | null>(
      null,
    ),
    [detail, setDetail] = useState<{ row: Row; type: string } | null>(null),
    [photos, setPhotos] = useState<{ urls: string[]; index: number } | null>(
      null,
    ),
    [chooser, setChooser] = useState(false),
    [success, setSuccess] = useState<Row | null>(null),
    [userForm, setUserForm] = useState(false),
    [deliveries, setDeliveries] = useState<Row[]>([]),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const q = new URLSearchParams(location.search);
    const v = q.get("view");
    if (v && Object.keys(labels).includes(v)) setView(v as View);
    const id = q.get("record");
    if (configured && id && ["waste", "inspections"].includes(v || ""))
      read(v!, { id })
        .then((d) => d.data[0] && setDetail({ row: d.data[0], type: v! }))
        .catch((e) => setError(e.message));
  }, [configured]);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    Promise.all([
      read("facilities", { all: "1" }),
      read("options", { all: "1" }),
      admin ? read("users", { all: "1" }) : Promise.resolve({ data: [] }),
      read("overview"),
    ])
      .then(([f, o, u, stats]) => {
        if (alive) {
          setFacilities(f.data);
          setOptions(o.data);
          setUsers(u.data);
          setOverview(stats);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [configured, admin, refresh]);
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          if (view === "dashboard") {
            const d = await read("overview");
            if (alive) setOverview(d);
          } else if (view === "settings") {
            /* Options loaded by the shared query. */
          } else {
            const d = await read(view, {
              search,
              category,
              supervisor,
              date,
              sort,
              page: String(page),
              ...(mapMode ? { map: "1" } : {}),
            });
            if (alive) {
              setRows(d.data);
              setTotal(d.count || 0);
            }
            if (view === "notifications") {
              const d = await read("deliveries", { page: String(page) });
              if (alive) setDeliveries(d.data);
            }
          }
        } catch (e) {
          if (alive) setError((e as Error).message);
        } finally {
          if (alive) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    configured,
    view,
    search,
    category,
    supervisor,
    date,
    sort,
    page,
    mapMode,
    refresh,
  ]);
  function navigate(v: View) {
    setView(v);
    setSearch("");
    setCategory("");
    setSupervisor("");
    setDate("");
    setPage(0);
    setRows([]);
    setTotal(0);
    setMapMode(false);
    setMenu(false);
    if (v === "waste") setModule("waste");
    if (v === "facilities" || v === "inspections") setModule("inspection");
    history.replaceState(null, "", v === "dashboard" ? "/" : `/?view=${v}`);
  }
  async function logout() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("oasis-draft-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    location.href = "/login";
  }
  const showPhoto = (urls: string[], index: number) =>
    setPhotos({ urls, index });
  const count = (key: string) =>
    configured && overview ? (overview[key] ?? "—") : "—";
  const firstName = profile?.full_name.split(" ")[0];
  const navs: View[] = [
    "dashboard",
    "waste",
    "facilities",
    ...(admin ? (["notifications", "users"] as View[]) : []),
    "settings",
  ];
  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("dashboard")}
          aria-label="Oasis home"
        >
          <Leaf size={29} />
          <strong>
            oasis<span>↗</span>
          </strong>
          <small>FIELD OPERATIONS</small>
        </button>
        <div className="top-tools">
          <div className="workspace-label">
            <span className="online-dot" />
            Operations workspace
            <ChevronDown size={16} />
          </div>
          <div className="top-divider" />
          <span className="top-date">
            {now
              ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: timezone,
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(now)
              : "Field Operations"}
          </span>
          <div className="top-actions">
            {admin && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={() => navigate("notifications")}
              >
                <Bell size={20} />
              </Button>
            )}
            <span
              className="avatar"
              title={profile?.full_name || "Setup required"}
            >
              {profile ? (
                profile.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
              ) : (
                <Leaf size={20} />
              )}
            </span>
            <div className="user-label">
              <strong>{profile?.full_name || "Your workspace"}</strong>
              <small>
                {profile
                  ? admin
                    ? "Administrator"
                    : "Field supervisor"
                  : "Configuration required"}
              </small>
            </div>
            <Button
              className="menu-toggle"
              variant="ghost"
              size="icon"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </header>
      <div className="app-grid">
        <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
          <div className="sidebar-main">
            <span className="nav-heading">WORKSPACE</span>
            <nav>
              {navs.map((v) => {
                const Icon = icons[v as keyof typeof icons] || Building2;
                return (
                  <button
                    key={v}
                    className={
                      view === v ||
                      (v === "facilities" && view === "inspections")
                        ? "active"
                        : ""
                    }
                    onClick={() => navigate(v)}
                  >
                    <Icon size={19} />
                    <span>
                      {v === "waste"
                        ? "Waste tracking"
                        : v === "facilities"
                          ? "Facilities tracking"
                          : labels[v]}
                    </span>
                    {v === view && <span className="nav-dot" />}
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-note">
              <span className="tiny-icon">
                <Navigation size={19} />
              </span>
              <h3>
                Every detail.
                <br />
                Verified in the field.
              </h3>
              <p>Photo evidence and confirmed GPS, together in every report.</p>
              <span className="pill">
                <ShieldCheck size={13} />
                Built for the field
              </span>
            </div>
            <div className="sidebar-bottom">
              <div className="sidebar-site">
                <span className="online-dot" />
                <div>
                  <strong>Oasis management</strong>
                  <small>One connected workspace</small>
                </div>
              </div>
              {profile && (
                <button onClick={logout}>
                  <LogOut size={18} />
                  Sign out
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          </div>
          <p className="sidebar-caption">
            FIELD OPERATIONS SYSTEM <span>v1.0</span>
          </p>
        </aside>
        <section className="main-content">
          {!configured && (
            <div className="setup-banner">
              <ShieldCheck size={19} />
              <div>
                <strong>Your workspace is ready for configuration.</strong>
                <span>
                  Connect Supabase to enable secure login and live records. No
                  sample data is displayed.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("settings")}
              >
                View setup
                <ArrowUpRight size={15} />
              </Button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "dashboard"
                  ? "A CLEARER VIEW OF YOUR OPERATIONS"
                  : view === "waste"
                    ? "COSA · AGRICULTURAL WASTE"
                    : view === "facilities" || view === "inspections"
                      ? "OFT · SITE FACILITIES"
                      : "YOUR CONNECTED WORKSPACE"}
              </span>
              <h1>
                {view === "dashboard"
                  ? firstName
                    ? `Hello, ${firstName}.`
                    : "Your field. In focus."
                  : labels[view]}
                <span className="heading-dot">
                  {view === "dashboard" ? "•" : ""}
                </span>
              </h1>
              <p>
                {view === "dashboard"
                  ? "A little clarity for everything happening on the ground."
                  : view === "waste"
                    ? "Track agricultural waste, from the first photo to the final report."
                    : view === "facilities"
                      ? "Keep your facilities visible, inspected, and working well."
                      : view === "inspections"
                        ? "A complete history of your on-site observations."
                        : view === "notifications"
                          ? "In-app updates and manager email delivery, tracked separately."
                          : view === "users"
                            ? "Manage the people keeping your operations moving."
                            : "Your account, workspace options, and service configuration."}
              </p>
            </div>
            <div className="heading-actions">
              {view === "dashboard" ? (
                <Button onClick={() => setChooser(true)}>
                  <Plus size={18} />
                  New report
                </Button>
              ) : ["waste", "inspections"].includes(view) ? (
                <Button
                  onClick={() =>
                    setForm(view === "waste" ? "waste" : "inspection")
                  }
                >
                  <Plus size={18} />
                  {view === "waste" ? "New waste report" : "New inspection"}
                </Button>
              ) : view === "facilities" ? (
                <Button
                  onClick={() => setForm(admin ? "facility" : "inspection")}
                >
                  <Plus size={18} />
                  {admin ? "Register facility" : "New inspection"}
                </Button>
              ) : view === "users" && admin ? (
                <Button onClick={() => setUserForm(true)}>
                  <Plus size={18} />
                  Add supervisor
                </Button>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="notice error" role="alert">
              <AlertCircle size={18} />
              {error}
              <Button variant="ghost" size="sm" onClick={reload}>
                Retry
              </Button>
            </div>
          )}
          {view === "dashboard" ? (
            <>
              <div className="stats-grid">
                {[
                  {
                    key: "waste",
                    title: "Waste reports",
                    icon: Recycle,
                    note: "Agricultural waste documented",
                    color: "mint",
                  },
                  {
                    key: "facilities",
                    title: admin
                      ? "Registered facilities"
                      : "Assigned facilities",
                    icon: Building2,
                    note: "Your site infrastructure",
                    color: "sand",
                  },
                  {
                    key: "today",
                    title: "Submitted today",
                    icon: ClipboardCheck,
                    note: `Across both modules · ${timezone}`,
                    color: "lilac",
                  },
                  {
                    key: admin ? "supervisors" : "inspections",
                    title: admin ? "Active supervisors" : "My inspections",
                    icon: admin ? Users : ShieldCheck,
                    note: admin
                      ? "Connected in the field"
                      : "Verified facility observations",
                    color: "gray",
                  },
                ].map((s) => (
                  <article className="stat-card" key={s.key}>
                    <div>
                      <span>{s.title}</span>
                      <span className={`stat-icon ${s.color}`}>
                        <s.icon size={20} />
                      </span>
                    </div>
                    <strong>{loading ? "…" : count(s.key)}</strong>
                    <small>{s.note}</small>
                  </article>
                ))}
              </div>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">TWO MODULES. ONE WORKSPACE.</span>
                  <h2>Where are we working today?</h2>
                </div>
                <span className="section-counter">01 — 02</span>
              </div>
              <div className="modules-grid">
                <article className="module-card waste-module">
                  <div className="module-top">
                    <span className="module-icon">
                      <Recycle size={27} />
                    </span>
                    <span className="pill">
                      COSA <span className="small-dot" />
                    </span>
                  </div>
                  <Botanical />
                  <div className="module-copy">
                    <span className="eyebrow">FROM SITE TO RECORD</span>
                    <h2>
                      Oasis Waste
                      <br />
                      Tracking<span>↗</span>
                    </h2>
                    <p>
                      Document agricultural waste with clear photos,
                      <br className="desktop-break" /> estimated quantities, and
                      verified locations.
                    </p>
                  </div>
                  <footer>
                    <Button onClick={() => navigate("waste")}>
                      Open waste tracking
                      <ArrowUpRight size={19} />
                    </Button>
                    <span>
                      <Camera size={15} />
                      <MapPin size={15} />
                      <span>Photo + GPS verified</span>
                    </span>
                  </footer>
                </article>
                <article className="module-card facility-module">
                  <div className="module-top">
                    <span className="module-icon">
                      <Building2 size={27} />
                    </span>
                    <span className="pill">
                      OFT <span className="small-dot" />
                    </span>
                  </div>
                  <div className="building-art" aria-hidden="true">
                    <div className="building-tall">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="building-low">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="building-ground" />
                  </div>
                  <div className="module-copy">
                    <span className="eyebrow">KEEP EVERY SITE IN SIGHT</span>
                    <h2>
                      OnSite Facilities
                      <br />
                      Tracking<span>↗</span>
                    </h2>
                    <p>
                      Register facilities, record inspections, and
                      <br className="desktop-break" /> stay ahead of what needs
                      attention.
                    </p>
                  </div>
                  <footer>
                    <Button
                      variant="secondary"
                      onClick={() => navigate("facilities")}
                    >
                      Open facilities tracking
                      <ArrowUpRight size={19} />
                    </Button>
                    <span>
                      <ClipboardCheck size={15} />
                      <span>Inspect. Monitor. Maintain.</span>
                    </span>
                  </footer>
                </article>
              </div>
              <div className="lower-grid">
                <article className="activity-card">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">THE LATEST FROM THE FIELD</span>
                      <h2>Recent activity</h2>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("waste")}
                    >
                      All reports
                      <ArrowUpRight size={17} />
                    </Button>
                  </div>
                  {overview?.recent?.length ? (
                    <div className="activity-list">
                      {overview.recent.map((r: Row) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            const t = r.number.startsWith("COSA")
                              ? "waste"
                              : "inspections";
                            read(t, { id: r.id })
                              .then((d) =>
                                setDetail({ row: d.data[0], type: t }),
                              )
                              .catch((e) => setError(e.message));
                          }}
                        >
                          <span className="activity-icon">
                            {r.number.startsWith("COSA") ? (
                              <Recycle size={20} />
                            ) : (
                              <Building2 size={20} />
                            )}
                          </span>
                          <div>
                            <strong>{r.number}</strong>
                            <small>{r.category || r.condition}</small>
                          </div>
                          <time>
                            {formatDate(r.created_at, timezone, true)}
                          </time>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <span className="empty-icon">
                        <Activity size={27} />
                      </span>
                      <div>
                        <h3>
                          {configured
                            ? "Your next site visit starts here."
                            : "A fresh start for your operations."}
                        </h3>
                        <p>
                          {configured
                            ? "Submitted reports and inspections will appear here."
                            : "Recent activity will appear once your services are connected."}
                        </p>
                      </div>
                      <span className="empty-dash">—</span>
                    </div>
                  )}
                  <footer className="activity-footer">
                    <span className="online-dot" />
                    {configured
                      ? "Showing your authorized records"
                      : "Awaiting live data connection"}
                    <span>ONE SOURCE OF TRUTH</span>
                  </footer>
                </article>
                <article className="field-card">
                  <div className="field-card-top">
                    <span className="pill">
                      <span className="small-dot" />
                      FIELD ESSENTIALS
                    </span>
                    <Navigation size={23} />
                  </div>
                  <h2>
                    A good report
                    <br />
                    starts on site.
                  </h2>
                  <div className="field-steps">
                    <span>
                      <Camera size={16} />
                      2–3 clear photographs
                    </span>
                    <span>
                      <MapPin size={16} />
                      Device GPS within {gpsThreshold} m
                    </span>
                    <span>
                      <ShieldCheck size={16} />
                      Confirm your position on the map
                    </span>
                  </div>
                  <button onClick={() => setChooser(true)}>
                    Make your next report
                    <ArrowRight size={19} />
                  </button>
                </article>
              </div>
              <div className="workspace-footnote">
                <span>
                  <ShieldCheck size={14} />
                  Secure access. Real records. Better oversight.
                </span>
                <span>OASIS FIELD OPERATIONS</span>
              </div>
            </>
          ) : view === "settings" ? (
            <SettingsPanel
              profile={profile}
              configured={configured}
              options={options}
              timezone={timezone}
              onRefresh={reload}
            />
          ) : (
            <>
              {view === "waste" && admin && (
                <div className="stats-grid">
                  {[
                    { key: "waste", label: "Total waste reports" },
                    { key: "wasteToday", label: "Waste reports today" },
                    { key: "supervisors", label: "Active supervisors" },
                    { key: "pending", label: "Pending / failed emails" },
                  ].map((s) => (
                    <article className="stat-card" key={s.key}>
                      <div>
                        <span>{s.label}</span>
                      </div>
                      <strong>{count(s.key)}</strong>
                      <small>Live operational totals</small>
                    </article>
                  ))}
                </div>
              )}
              <div className="records-tabs">
                {["facilities", "inspections"].includes(view) && (
                  <div className="segmented">
                    <button
                      className={view === "facilities" ? "selected" : ""}
                      onClick={() => navigate("facilities")}
                    >
                      Facility register
                    </button>
                    <button
                      className={view === "inspections" ? "selected" : ""}
                      onClick={() => navigate("inspections")}
                    >
                      Inspection history
                    </button>
                  </div>
                )}
                {["waste", "facilities", "inspections"].includes(view) && (
                  <div className="list-tools">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Search records"
                        placeholder={
                          view === "facilities"
                            ? "Search facility name…"
                            : "Search report number…"
                        }
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(0);
                        }}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setFilters(!filters)}
                    >
                      <SlidersHorizontal size={17} />
                      <span>Filters</span>
                    </Button>
                    {admin && view !== "inspections" && (
                      <div className="segmented icon-segment">
                        <button
                          className={!mapMode ? "selected" : ""}
                          aria-label="Table view"
                          onClick={() => {
                            setMapMode(false);
                            setPage(0);
                          }}
                        >
                          <Table2 size={18} />
                        </button>
                        <button
                          className={mapMode ? "selected" : ""}
                          aria-label="Map view"
                          onClick={() => {
                            setMapMode(true);
                            setPage(0);
                          }}
                        >
                          <Map size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {filters && (
                <div className="filter-panel">
                  <label>
                    {view === "inspections" ? "Condition" : "Category"}
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="">All</option>
                      {options
                        .filter(
                          (o) =>
                            o.kind ===
                            (view === "waste"
                              ? "waste"
                              : view === "facilities"
                                ? "facility"
                                : "status"),
                        )
                        .map((o) => (
                          <option key={o.id}>{o.label}</option>
                        ))}
                    </select>
                  </label>
                  {admin && view !== "facilities" && (
                    <label>
                      Supervisor
                      <select
                        value={supervisor}
                        onChange={(e) => {
                          setSupervisor(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="">All supervisors</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Submission date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                  <label>
                    Sort
                    <select
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCategory("");
                      setDate("");
                      setSupervisor("");
                      setPage(0);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
              <section className="records-card">
                <div className="card-heading">
                  <h2>
                    {view === "notifications"
                      ? "In-app notifications"
                      : labels[view]}
                  </h2>
                  <span className="pill">
                    {configured ? `${total} records` : "Not connected"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Refresh records"
                    disabled={loading || !configured}
                    onClick={reload}
                  >
                    <RefreshCw size={17} className={loading ? "spin" : ""} />
                  </Button>
                </div>
                {loading ? (
                  <div className="empty-state">
                    <RefreshCw className="spin" />
                    <h3>Loading your records…</h3>
                  </div>
                ) : mapMode ? (
                  <>
                    <LocationMap
                      records={rows}
                      onSelect={(r) => setDetail({ row: r, type: view })}
                    />
                    {!rows.length && (
                      <p className="notice">
                        No saved locations match these filters. The map has no
                        report markers.
                      </p>
                    )}
                  </>
                ) : !rows.length ? (
                  <div className="empty-state">
                    <span className="empty-icon">
                      {view === "users" ? (
                        <Users size={28} />
                      ) : view === "notifications" ? (
                        <Bell size={28} />
                      ) : (
                        <FileText size={28} />
                      )}
                    </span>
                    <h3>
                      {!configured
                        ? "Connect your data to get started."
                        : search || category || date || supervisor
                          ? "No matching records."
                          : "Nothing here just yet."}
                    </h3>
                    <p>
                      {!configured
                        ? "Configure Supabase using the setup instructions."
                        : view === "facilities"
                          ? "Facilities registered and assigned by an administrator will appear here."
                          : view === "notifications"
                            ? "New report notifications will appear here."
                            : "Your saved records will appear here after submission."}
                    </p>
                  </div>
                ) : view === "users" ? (
                  <div className="users-list">
                    {rows.map((u) => (
                      <div className="user-row" key={u.id}>
                        <span className="avatar">
                          {u.full_name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{u.full_name}</strong>
                          <small>{u.email}</small>
                        </div>
                        <span className="pill">{u.role}</span>
                        <span
                          className={`status ${u.is_active ? "good" : "bad"}`}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                        {u.role === "supervisor" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await api("user.toggle", {
                                  id: u.id,
                                  is_active: !u.is_active,
                                });
                                reload();
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : view === "notifications" ? (
                  <div className="notification-list">
                    {rows.map((n) => (
                      <div key={n.id} className={n.is_read ? "read" : ""}>
                        <span className="activity-icon">
                          <Bell size={18} />
                        </span>
                        <div>
                          <strong>{n.message}</strong>
                          <small>{formatDate(n.created_at, timezone)}</small>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={n.is_read}
                          onClick={async () => {
                            try {
                              await api("notification.read", { id: n.id });
                              reload();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {n.is_read ? "Read" : "Mark read"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            {view === "facilities"
                              ? "Facility"
                              : "Report number"}
                          </th>
                          <th>
                            {view === "facilities"
                              ? "Project / site"
                              : "Submitted"}
                          </th>
                          <th>
                            {view === "facilities"
                              ? "Category"
                              : view === "waste"
                                ? "Waste type"
                                : "Facility / condition"}
                          </th>
                          <th>
                            {view === "waste"
                              ? "Quantity"
                              : "Status / supervisor"}
                          </th>
                          <th>Location</th>
                          {view !== "facilities" && <th>Manager email</th>}
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.number}</strong>
                              <small>{r.name || r.profiles?.full_name}</small>
                            </td>
                            <td>
                              {view === "facilities"
                                ? r.site
                                : formatDate(r.created_at, timezone)}
                            </td>
                            <td>
                              {view === "inspections" ? (
                                <>
                                  {r.facilities?.name}
                                  <small>{r.condition}</small>
                                </>
                              ) : (
                                r.category
                              )}
                            </td>
                            <td>
                              {view === "waste" ? (
                                `${r.quantity} ${r.unit}`
                              ) : (
                                <span className="status">
                                  {r.status || r.profiles?.full_name}
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setDetail({ row: r, type: view })
                                }
                              >
                                <MapPin size={15} />
                                {view === "facilities"
                                  ? "View"
                                  : r.location_confirmed
                                    ? "Verified"
                                    : "Unverified"}
                              </button>
                            </td>
                            {view !== "facilities" && (
                              <td>
                                <span
                                  className={`status ${r.email_status === "failed" ? "bad" : r.email_status === "sent" ? "good" : ""}`}
                                >
                                  {r.email_status || "pending"}
                                </span>
                              </td>
                            )}
                            <td>
                              <Button
                                variant="secondary"
                                size="icon"
                                aria-label={`View ${r.number}`}
                                onClick={() =>
                                  setDetail({ row: r, type: view })
                                }
                              >
                                <ArrowUpRight size={18} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="pagination">
                  <span>
                    {configured
                      ? `${total} records · page ${page + 1}`
                      : "Live records require Supabase configuration"}
                  </span>
                  <div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!page || loading}
                      aria-label="Previous page"
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={
                        loading || (page + 1) * (mapMode ? 1000 : 12) >= total
                      }
                      aria-label="Next page"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={18} />
                    </Button>
                  </div>
                </div>
              </section>
              {view === "notifications" && (
                <section className="records-card delivery-card">
                  <div className="card-heading">
                    <h2>Manager email delivery</h2>
                    <span className="pill">
                      <Mail size={14} />
                      Resend
                    </span>
                  </div>
                  <p className="delivery-note">
                    “Sent” means the provider accepted the email. Delivery is
                    not marked confirmed without verified provider evidence.
                  </p>
                  {!deliveries.length ? (
                    <div className="empty-state compact">
                      <Mail size={24} />
                      <p>No email delivery attempts to show.</p>
                    </div>
                  ) : (
                    deliveries.map((d) => (
                      <div key={d.id} className="delivery-row">
                        <div>
                          <strong>
                            {d.record_type === "waste"
                              ? "Waste report"
                              : "Facility inspection"}
                          </strong>
                          <small>
                            {d.recipient} · {d.attempts} attempts
                          </small>
                          {d.last_error && (
                            <small className="error-text">{d.last_error}</small>
                          )}
                        </div>
                        <span
                          className={`status ${d.status === "failed" ? "bad" : "good"}`}
                        >
                          {d.status}
                        </span>
                        {["failed", "pending"].includes(d.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await api("delivery.retry", {
                                  record_id: d.record_id,
                                  kind: d.record_type,
                                });
                                reload();
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </div>
      <nav className="mobile-bottom">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={21} />
          Home
        </button>
        <button onClick={() => setForm(module)}>
          <Plus size={22} />
          New report
        </button>
        <button
          className={["waste", "inspections"].includes(view) ? "active" : ""}
          onClick={() => navigate(module === "waste" ? "waste" : "inspections")}
        >
          <FileText size={21} />
          My reports
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => navigate("settings")}
        >
          <Users size={21} />
          Profile
        </button>
      </nav>
      {chooser && (
        <Modal title="Start a field report" onClose={() => setChooser(false)}>
          <p className="muted">Choose the module for your site visit.</p>
          <button
            className="choice-card"
            onClick={() => {
              setModule("waste");
              setChooser(false);
              setForm("waste");
            }}
          >
            <Recycle size={26} />
            <div>
              <strong>Oasis Waste Tracking</strong>
              <small>Report agricultural waste</small>
            </div>
            <ArrowUpRight />
          </button>
          <button
            className="choice-card"
            onClick={() => {
              setModule("inspection");
              setChooser(false);
              setForm("inspection");
            }}
          >
            <Building2 size={26} />
            <div>
              <strong>OnSite Facilities Tracking</strong>
              <small>Submit a facility inspection</small>
            </div>
            <ArrowUpRight />
          </button>
        </Modal>
      )}
      {form && (
        <ReportForm
          key={form}
          kind={form}
          facilities={facilities}
          users={users}
          options={options}
          enabled={configured}
          threshold={gpsThreshold}
          timezone={timezone}
          ownerId={profile?.id || "setup"}
          onClose={() => setForm(null)}
          onSaved={(r) => {
            const kind = form;
            setForm(null);
            setSuccess({ ...r, kind });
            reload();
          }}
          onPhoto={showPhoto}
        />
      )}{" "}
      {success && (
        <Modal
          title={
            success.kind === "facility"
              ? "Facility registered"
              : "Report Submitted Successfully"
          }
          onClose={() => setSuccess(null)}
        >
          <div className="success-content">
            <span className="success-icon">
              <Check size={35} />
            </span>
            <h2>{success.number || "Facility saved"}</h2>
            <p>The record has been saved to your database.</p>
            {success.kind !== "facility" && (
              <>
                <p>
                  <Check size={16} />
                  2–3 photos uploaded
                </p>
                <p>
                  <Check size={16} />
                  GPS location recorded and confirmed
                </p>
                <p>{formatDate(success.created_at, timezone)}</p>
                <span
                  className={`status ${success.notification_status === "failed" ? "bad" : "good"}`}
                >
                  Manager email: {success.notification_status}
                </span>
              </>
            )}
          </div>
          <div className="form-footer">
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(null);
                setForm(success.kind);
              }}
            >
              Submit another
            </Button>
            <Button
              onClick={async () => {
                try {
                  const type =
                    success.kind === "waste"
                      ? "waste"
                      : success.kind === "facility"
                        ? "facilities"
                        : "inspections";
                  const d = await read(type, { id: success.id });
                  setSuccess(null);
                  setDetail({ row: d.data[0], type });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              View record
              <ArrowUpRight size={17} />
            </Button>
          </div>
        </Modal>
      )}
      {detail && (
        <RecordDetail
          record={detail.row}
          type={detail.type}
          admin={admin}
          users={users}
          options={options}
          timezone={timezone}
          onClose={() => setDetail(null)}
          onPhoto={showPhoto}
          onRefresh={() => {
            reload();
            setDetail(null);
          }}
        />
      )}
      {photos && (
        <Modal
          title={`Photo ${photos.index + 1} of ${photos.urls.length}`}
          onClose={() => setPhotos(null)}
          wide
        >
          <div className="photo-viewer">
            <img
              src={photos.urls[photos.index]}
              alt={`Site photograph ${photos.index + 1}`}
            />
          </div>
          <div className="form-footer">
            <Button
              variant="secondary"
              disabled={photos.index === 0}
              onClick={() => setPhotos({ ...photos, index: photos.index - 1 })}
            >
              <ChevronLeft size={18} />
              Previous
            </Button>
            <a
              href={photos.urls[photos.index]}
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              Full size
              <ExternalLink size={16} />
            </a>
            <Button
              variant="secondary"
              disabled={photos.index === photos.urls.length - 1}
              onClick={() => setPhotos({ ...photos, index: photos.index + 1 })}
            >
              Next
              <ChevronRight size={18} />
            </Button>
          </div>
        </Modal>
      )}
      {userForm && (
        <UserForm
          onClose={() => setUserForm(false)}
          onSaved={() => {
            setUserForm(false);
            reload();
          }}
        />
      )}
    </main>
  );
}
function UserForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Create supervisor account" onClose={onClose}>
      <p className="muted">
        Share the initial credentials securely. The supervisor can use a
        password reset link to choose their own password.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("user.create", Object.fromEntries(f));
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Full name
          <input name="full_name" required minLength={2} />
        </label>
        <label>
          Email address
          <input name="email" type="email" required />
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <p className="notice error">{error}</p>}
        <Button disabled={busy}>
          {busy ? "Creating account…" : "Create supervisor"}
          <Plus size={18} />
        </Button>
      </form>
    </Modal>
  );
}
function SettingsPanel({
  profile,
  configured,
  options,
  timezone,
  onRefresh,
}: {
  profile: Profile | null;
  configured: boolean;
  options: Row[];
  timezone: string;
  onRefresh: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="settings-grid">
      <section className="records-card">
        <div className="card-heading">
          <h2>Your profile</h2>
          <Users size={20} />
        </div>
        <div className="settings-body">
          <label>
            Name
            <input readOnly value={profile?.full_name || "Not connected"} />
          </label>
          <label>
            Email
            <input readOnly value={profile?.email || "Not connected"} />
          </label>
          <div className="profile-meta">
            <span className="pill">{profile?.role || "Setup required"}</span>
            <span>{timezone}</span>
          </div>
          {profile && (
            <>
              <p className="muted">
                Use a secure email link to reset your password.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetch("/api/auth", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "reset",
                        email: profile.email,
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    setError("Password reset requested. Check your inbox.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Request password reset
                <Mail size={17} />
              </Button>
            </>
          )}
        </div>
      </section>
      <section className="records-card">
        <div className="card-heading">
          <h2>Service configuration</h2>
          <ShieldCheck size={20} />
        </div>
        <div className="settings-body">
          <div className="service-row">
            <span>Supabase connection</span>
            <span className={`status ${configured ? "good" : "bad"}`}>
              {configured ? "Configured" : "Setup required"}
            </span>
          </div>
          <p>
            Configure the server environment and apply the database migration
            before inviting your field team.
          </p>
          <ol className="setup-list">
            <li>
              Create a Supabase project and run{" "}
              <code>001_field_operations.sql</code>.
            </li>
            <li>
              Set the environment variables listed in <code>.env.example</code>.
            </li>
            <li>
              Run <code>npm run bootstrap-admin</code> to provision your first
              administrator.
            </li>
            <li>
              Configure password reset URLs and deploy to Vercel over HTTPS.
            </li>
          </ol>
          <p className="muted">
            ImgBB and Resend are checked when used. Direct ImgBB image links can
            be opened by anyone possessing the URL. See the repository README
            for full setup.
          </p>
        </div>
      </section>
      {profile?.role === "admin" && (
        <section className="records-card wide-settings">
          <div className="card-heading">
            <h2>Categories, units & statuses</h2>
            <SlidersHorizontal size={20} />
          </div>
          <div className="settings-body">
            <form
              className="option-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const el = e.currentTarget;
                const f = new FormData(el);
                try {
                  await api("option.add", Object.fromEntries(f));
                  el.reset();
                  onRefresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Option group
                <select name="kind">
                  <option value="waste">Waste type</option>
                  <option value="unit">Measurement unit</option>
                  <option value="facility">Facility category</option>
                  <option value="status">Facility status / condition</option>
                </select>
              </label>
              <label>
                Label
                <input name="label" required maxLength={100} />
              </label>
              <Button>
                Add option
                <Plus size={17} />
              </Button>
            </form>
            <div className="options-list">
              {options.map((o) => (
                <div key={o.id}>
                  <span>
                    <small>{o.kind}</small>
                    {o.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await api("option.toggle", {
                          id: o.id,
                          is_active: !o.is_active,
                        });
                        onRefresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {o.is_active ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
    </div>
  );
}
