"use client";
import { useCallback, useEffect, useState } from "react";
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
  Search,
  MapPin,
  Check,
  FileText,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Map,
  ShieldCheck,
  RefreshCw,
  Menu,
  X,
  AlertCircle,
  Mail,
  ExternalLink,
} from "lucide-react";
import { api, read, formatDate, type Profile, type Row } from "@/lib/client";
import { Button } from "./ui/button";
import Modal from "./modal";
import ReportForm from "./report-form";
import RecordDetail from "./record-detail";
import AccessManagement from "./access-management";
import ReportsManagement from "./reports-management";
import OverviewReportMap from "./overview-report-map";
import { allowedViews, canReadReports, canSubmit } from "@/lib/access-policy";

type View =
  | "dashboard"
  | "waste"
  | "facilities"
  | "inspections"
  | "notifications"
  | "users"
  | "settings"
  | "reports-management";
const labels: Record<View, string> = {
  dashboard: "Overview",
  waste: "Oasis Waste Tracking",
  facilities: "OnSite Facilities Tracking",
  inspections: "OnSite Facilities Tracking",
  notifications: "Notifications",
  users: "User management",
  settings: "Settings",
  "reports-management": "Reports Management",
};
const icons = {
  dashboard: LayoutDashboard,
  waste: Recycle,
  facilities: Building2,
  notifications: Bell,
  users: Users,
  settings: Settings,
  "reports-management": FileText,
};
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
  const viewer = profile?.role === "viewer";
  const supervisorPanel = profile?.role === "supervisor";
  const browse = canReadReports(profile?.role || "");
  const submitAllowed = canSubmit(profile?.role || "");
  const panelViews = allowedViews(profile?.role || "supervisor");
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
    [sort, setSort] = useState("number-asc"),
    [page, setPage] = useState(0),
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
    [deliveries, setDeliveries] = useState<Row[]>([]),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const q = new URLSearchParams(location.search);
    const v = q.get("view");
    if (v && panelViews.includes(v)) setView(v === "facilities" ? "inspections" : v as View);
    const id = q.get("record");
    if (
      configured &&
      browse &&
      id &&
      ["waste", "inspections"].includes(v || "")
    )
      read(v!, { id })
        .then((d) => d.data[0] && setDetail({ row: d.data[0], type: v! }))
        .catch((e) => setError(e.message));
  }, [configured]);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    Promise.all([
      configured && submitAllowed
        ? read("facilities", { all: "1" })
        : Promise.resolve({ data: [] }),
      configured
        ? read("options", { all: "1" })
        : Promise.resolve({ data: [] }),
      admin ? read("users", { all: "1" }) : Promise.resolve({ data: [] }),
      configured && browse ? read("overview") : Promise.resolve(null),
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
    if (
      (!configured && view !== "users") ||
      (supervisorPanel && view === "dashboard") ||
      view === "users"
    )
      return;
    let alive = true;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          if (view === "dashboard") {
            const d = await read("overview");
            if (alive) setOverview(d);
          } else if (["settings", "reports-management"].includes(view)) {
            /* Options loaded by the shared query. */
          } else {
            const d = await read(view, { search, category, supervisor, date, sort, page: String(page) });
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
    refresh,
  ]);
  function navigate(v: View) {
    if (v === "facilities") v = "inspections";
    if (!panelViews.includes(v)) return;
    setView(v);
    setSearch("");
    setCategory("");
    setSupervisor("");
    setDate("");
    setPage(0);
    setRows([]);
    setTotal(0);
    setMenu(false);
    if (v === "waste") setModule("waste");
    if (v === "inspections") setModule("inspection");
    history.replaceState(null, "", v === "dashboard" ? "/survey" : `/survey?view=${v}`);
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
    location.href = "/survey/login";
  }
  const showPhoto = (urls: string[], index: number) =>
    setPhotos({ urls, index });
  const count = (key: string) =>
    configured && overview ? (overview[key] ?? "—") : "—";
  const navs: View[] = [
    "dashboard",
    "waste",
    "facilities",
    ...(admin ? (["reports-management", "notifications", "users"] as View[]) : []),
    "settings",
  ].filter((v) => panelViews.includes(v)) as View[];
  return (
    <main className="app-shell">
      <a className="hub-return" href="/">← All dashboards</a>
      <header className="topbar">
        <a className="brand panel-brand" href="/" aria-label="Back to Operations Hub">
          <img src="/branding/advacon-alula-oasis-transparent.png" width="330" height="110" alt="ADVACON and AlUla Oasis Management" />
        </a>
        <div className="top-tools">
          <div className="workspace-label">
            <span className="online-dot" />
            Operations workspace
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
            <button
              className="avatar"
              title={profile?.full_name || "Setup required"}
              aria-label={
                admin
                  ? "Profile settings"
                  : viewer
                    ? "Viewer panel"
                    : "Supervisor panel"
              }
              onClick={() => navigate(admin ? "settings" : "dashboard")}
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
            </button>
            {profile && (
              <div className="user-label">
                <strong>{profile.full_name}</strong>
                <small>
                  {admin
                    ? "Admin panel"
                    : viewer
                      ? "Viewer panel"
                      : "Supervisor panel"}
                </small>
              </div>
            )}
            <Button
              className="menu-toggle"
              variant="ghost"
              size="icon"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              aria-controls="panel-navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </header>
      <div className="app-grid">
        <aside id="panel-navigation" className={`sidebar ${menu ? "sidebar-open" : ""}`}>
          <div className="sidebar-main">
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
                          : v === "users"
                            ? "Users & PINs"
                            : labels[v]}
                    </span>
                    {v === view && <span className="nav-dot" />}
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-bottom">
              {profile && (
                <button onClick={logout}>
                  <LogOut size={18} />
                  Sign out
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          </div>
        </aside>
        <section className="main-content">
          {!configured && view !== "settings" && (
            <div className="setup-banner">
              <ShieldCheck size={19} />
              <div>
                <strong>Connect your workspace</strong>
                <span>Configure D1 to enable field records and maps.</span>
              </div>
              {admin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("settings")}
                >
                  Configure
                  <ArrowUpRight size={15} />
                </Button>
              )}
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {view === "dashboard"
                  ? admin
                    ? "Admin panel"
                    : viewer
                      ? "Viewer panel"
                      : "Supervisor panel"
                  : labels[view]}
              </h1>
              <p>
                {view === "dashboard"
                  ? viewer
                    ? "View reports and explore site maps."
                    : supervisorPanel
                      ? "Submit site information, photos, and verified locations."
                      : "Manage records, users, and panel access."
                  : view === "waste"
                    ? viewer
                      ? "Review waste reports and site locations."
                      : "Submit, review, and manage waste reports."
                    : view === "facilities"
                      ? viewer
                        ? "View facilities and their inspection history."
                        : "Manage facilities and their condition."
                      : view === "inspections"
                        ? "Review facility inspection history."
                        : view === "notifications"
                          ? "Report updates and email delivery status."
                          : view === "users"
                            ? "Manage accounts, panel access, and PINs."
                            : (view === "reports-management" ? "Import reports or download spreadsheets and photos." : "Account and workspace settings.")}
              </p>
            </div>
            {submitAllowed && (
              <div className="heading-actions">
                {supervisorPanel && <div className="segmented supervisor-report-tabs" role="tablist" aria-label="My reports"><button role="tab" aria-selected={view === "waste"} className={view === "waste" ? "selected" : ""} onClick={() => navigate("waste")}>My Waste Reports</button><button role="tab" aria-selected={view === "inspections"} className={view === "inspections" ? "selected" : ""} onClick={() => navigate("inspections")}>My Facilities Reports</button></div>}
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
                ) : null}
              </div>
            )}
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
              {browse && configured && <OverviewReportMap refresh={refresh} onSelect={(row, type) => setDetail({row, type})} />}
              {!browse && <div className="modules-grid">
                <article className="module-card waste-module">
                  <div className="module-header">
                    <span className="module-icon">
                      <Recycle size={28} />
                    </span>
                    <span className="pill">COSA</span>
                  </div>
                  <div className="module-copy">
                    <h2>Oasis Waste Tracking</h2>
                    <p>
                      {viewer
                        ? "Review waste reports, site photos, and verified locations."
                        : "Submit waste quantities, site photos, and verified locations."}
                    </p>
                  </div>
                  <footer>
                    {submitAllowed && (
                      <Button
                        onClick={() => {
                          setModule("waste");
                          setForm("waste");
                        }}
                      >
                        <Plus size={18} />
                        New waste report
                      </Button>
                    )}
                    {browse && (
                      <Button variant="ghost" onClick={() => navigate("waste")}>
                        View reports
                        <ArrowUpRight size={18} />
                      </Button>
                    )}
                  </footer>
                </article>
                <article className="module-card facility-module">
                  <div className="module-header">
                    <span className="module-icon">
                      <Building2 size={28} />
                    </span>
                    <span className="pill">OFT</span>
                  </div>
                  <div className="module-copy">
                    <h2>OnSite Facilities Tracking</h2>
                    <p>
                      {viewer
                        ? "View facilities, their condition, and inspection history."
                        : supervisorPanel
                          ? "Record facility condition, photos, and verified locations."
                          : "Register facilities and record inspections of their condition."}
                    </p>
                  </div>
                  <footer>
                    {submitAllowed && (
                      <Button
                        onClick={() => {
                          setModule("inspection");
                          setForm(admin ? "facility" : "inspection");
                        }}
                      >
                        <Plus size={18} />
                        {admin ? "Register facility" : "New inspection"}
                      </Button>
                    )}
                    {browse && (
                      <Button
                        variant="ghost"
                        onClick={() => navigate("facilities")}
                      >
                        View facilities
                        <ArrowUpRight size={18} />
                      </Button>
                    )}
                  </footer>
                </article>
              </div>}
            </>
          ) : view === "reports-management" && admin ? (
            <ReportsManagement />
          ) : view === "users" && admin ? (
            <AccessManagement profile={profile} onChange={reload} />
          ) : view === "settings" ? (
            <SettingsPanel
              profile={profile}
              configured={configured}
              options={options}
              timezone={timezone}
              onRefresh={reload}
              onUsers={() => navigate("users")}
            />
          ) : (
            <>
              <div className="records-tabs">
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
                      aria-label="Filters"
                      aria-expanded={filters}
                      onClick={() => setFilters(!filters)}
                    >
                      <SlidersHorizontal size={17} />
                      <span>Filters</span>
                    </Button>
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
                  {admin && view !== "facilities" && admin && (
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
                      <option value="number-asc">Report number: ascending</option>
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
                      setSort("number-asc");
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
                        ? "Configure D1 using the setup instructions."
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
                              : viewer
                                ? "Condition / status"
                                : "Status / supervisor"}
                          </th>
                          <th>Location</th>
                          {view !== "facilities" && admin && (
                            <th>Manager email</th>
                          )}
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
                                  {r.site || r.facilities?.name}
                                  <small>{r.structure_type || r.condition}</small>
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
                                  {r.status ||
                                    (viewer
                                      ? r.condition
                                      : r.profiles?.full_name)}
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
                                  : r.source === "excel" ? "Excel import" : r.location_confirmed
                                    ? "Verified"
                                    : "Unverified"}
                              </button>
                            </td>
                            {view !== "facilities" && admin && (
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
                      : "Live records require D1 configuration"}
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
                        loading || (page + 1) * 12 >= total
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
      <nav
        className={
          "mobile-bottom " + (supervisorPanel ? "submit-navigation" : "")
        }
      >
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={21} />
          Home
        </button>
        {submitAllowed && (
          <button onClick={() => setChooser(true)}>
            <Plus size={22} />
            Submit data
          </button>
        )}
        {browse && (
          <button onClick={() => navigate("waste")}>
            <FileText size={21} />
            Reports
          </button>
        )}
        {viewer && (
          <button
            onClick={() => {
              navigate("dashboard");
            }}
          >
            <Map size={21} />
            Maps
          </button>
        )}
        <button onClick={logout}>
          <LogOut size={21} />
          Sign out
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
                  Site photos uploaded
                </p>
                <p>
                  <Check size={16} />
                  GPS location recorded and confirmed
                </p>
                <p>{formatDate(success.created_at, timezone)}</p>
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
            {browse && (
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
            )}
          </div>
        </Modal>
      )}
      {detail && (
        <RecordDetail
          record={detail.row}
          type={detail.type}
          admin={admin}
          canEdit={admin || (supervisorPanel && detail.row.supervisor_id === profile.id)}
          viewer={viewer}
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
    </main>
  );
}
function SettingsPanel({
  profile,
  configured,
  options,
  timezone,
  onRefresh,
  onUsers,
}: {
  profile: Profile | null;
  configured: boolean;
  options: Row[];
  timezone: string;
  onRefresh: () => void;
  onUsers: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="settings-grid">
      <section className="records-card">
        <div className="card-heading">
          <h2>Panel access</h2>
          <Users size={20} />
        </div>
        <div className="settings-body">
          <p>
            Signed in as {profile?.full_name}. Manage users and change panel
            PINs from User management.
          </p>
          <Button variant="outline" onClick={onUsers}>
            Manage users & PINs
            <ArrowUpRight size={18} />
          </Button>
        </div>
      </section>
      <section className="records-card">
        <div className="card-heading">
          <h2>Service configuration</h2>
          <ShieldCheck size={20} />
        </div>
        <div className="settings-body">
          <div className="service-row">
            <span>Cloudflare D1</span>
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
              Create a Cloudflare D1 database and apply the migrations in{" "}
              <code>migrations/</code>.
            </li>
            <li>
              Set the environment variables listed in <code>.env.example</code>.
            </li>
            <li>
              Open <code>/setup</code> once to create private administrator
              access.
            </li>
            <li>
              Deploy the Worker with its D1 binding over
              HTTPS.
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
