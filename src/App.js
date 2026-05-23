import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BookOpen, Plus, Minus, Trash2, Check, Star, Settings,
  Upload, Download, Search, X, Clock, BookCheck, BookX,
  User, Users, Copy, ChevronLeft
} from "lucide-react";
import { supabase } from "./supabase";

/* ─────────────────────────── Storage abstraction ────────────────────────── */
const db = {
  async get(key) {
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('value')
        .eq('key', key)
        .single();

      if (error) {
        // Supabase throws a specific error code if a row doesn't exist yet.
        // We just catch it and return null like your local storage did!
        if (error.code === 'PGRST116') return null; 
        console.error("Error fetching from Supabase:", error);
        return null;
      }

      return data ? data.value : null; 
    } catch (err) {
      console.error("Unexpected fetch error:", err);
      return null;
    }
  },

  async set(key, val) {
    try {
      const { error } = await supabase
        .from('app_data')
        .upsert({ key: key, value: val });

      if (error) {
        console.error("Error saving to Supabase:", error);
      }
    } catch (err) {
      console.error("Unexpected save error:", err);
    }
  }
};

const PROFILES_KEY = "sindria-list-profiles";
const LEGACY_KEY = "mangalog-v1";

function entriesKey(slug) { return `sindria-list-v1-${slug}`; }

/* ──────────────────────────────── Helpers ───────────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function slugify(name) {
  const s = name.trim().toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (s || "profile").slice(0, 32);
}

function formatSlugName(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getProfileSlugFromUrl() {
  try {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("profile");
    if (q) return slugify(q);
    const hash = (window.location.hash || "").replace(/^#\/?/, "");
    const m = hash.match(/^profile\/([^/?&]+)/i);
    if (m) return slugify(decodeURIComponent(m[1]));
  } catch {}
  return null;
}

function getProfileLink(slug) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("profile", slug);
    url.hash = "";
    return url.toString();
  } catch {
    return `${window.location.origin || ""}${window.location.pathname || ""}?profile=${encodeURIComponent(slug)}`;
  }
}

function setProfileInUrl(slug, replace = false) {
  try {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("profile", slug);
    else url.searchParams.delete("profile");
    url.hash = "";
    const method = replace ? "replaceState" : "pushState";
    if (window.history?.[method]) window.history[method]({}, "", url.toString());
    else window.location.hash = slug ? `#/profile/${slug}` : "";
  } catch {
    window.location.hash = slug ? `#/profile/${slug}` : "";
  }
}

function timeAgo(ts) {
  if (!ts) return "";
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), day = Math.floor(d / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${day}d ago`;
}

async function loadProfiles() {
  let profiles = await db.get(PROFILES_KEY);
  if (!Array.isArray(profiles)) profiles = [];
  const legacy = await db.get(LEGACY_KEY);
  if (Array.isArray(legacy) && legacy.length > 0 && profiles.length === 0) {
    const slug = "my-list";
    profiles = [{ id: uid(), slug, name: "My List", createdAt: Date.now() }];
    await db.set(PROFILES_KEY, profiles);
    await db.set(entriesKey(slug), legacy);
  }
  return profiles;
}

async function saveProfiles(profiles) {
  await db.set(PROFILES_KEY, profiles);
}

async function deleteProfile(slug) {
  const profiles = await loadProfiles();
  const next = profiles.filter(p => p.slug !== slug);
  await saveProfiles(next);
  await db.set(entriesKey(slug), []);
  return next;
}

async function ensureProfile(slug, name) {
  const profiles = await loadProfiles();
  if (profiles.some(p => p.slug === slug)) return profiles;
  const next = [...profiles, { id: uid(), slug, name: name || formatSlugName(slug), createdAt: Date.now() }];
  await saveProfiles(next);
  return next;
}

function uniqueSlug(base, profiles) {
  let slug = slugify(base);
  if (!profiles.some(p => p.slug === slug)) return slug;
  let n = 2;
  while (profiles.some(p => p.slug === `${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/* ─────────────────────────── CSS injection ──────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #09090b; font-family: 'DM Sans', system-ui, sans-serif; height: 100%; overflow: hidden; }
  #root { height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .syne { font-family: 'Syne', sans-serif; }
  .scrollable { overflow-y: auto; }
  .scrollable::-webkit-scrollbar { width: 3px; }
  .scrollable::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 99px; }
  .lc2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  select option { background: #27272a; color: #f4f4f5; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideUp { from { transform:translateY(48px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulseFab { 0%,100%{box-shadow:0 8px 24px rgba(249,115,22,0.4)} 50%{box-shadow:0 8px 36px rgba(249,115,22,0.65)} }
  .card-in { animation: fadeUp 0.28s ease both; }
  .sheet-in { animation: slideUp 0.3s cubic-bezier(.25,.8,.25,1) both; }
  .modal-in { animation: scaleIn 0.22s ease both; }
  .fab { animation: pulseFab 2.5s ease infinite; }
`;

/* ─────────────────────────── ProfilePicker ──────────────────────────────── */
function ProfilePicker({ onSelect }) {
  const [profiles, setProfiles] = useState([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const delRef = useRef(null);

  useEffect(() => {
    (async () => {
      setProfiles(await loadProfiles());
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const el = document.createElement("style");
    el.id = "sindria-css";
    el.textContent = CSS;
    if (!document.getElementById("sindria-css")) document.head.appendChild(el);
    return () => document.getElementById("sindria-css")?.remove();
  }, []);

  const createProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Enter a profile name"); return; }
    setCreating(true);
    const slug = uniqueSlug(trimmed, profiles);
    const profile = { id: uid(), slug, name: trimmed, createdAt: Date.now() };
    const next = [profile, ...profiles];
    await saveProfiles(next);
    await db.set(entriesKey(slug), []);
    setProfileInUrl(slug);
    onSelect(slug);
  };

  const inp = {
    style: {
      width: "100%", background: "#27272a", border: "1px solid #3f3f46",
      borderRadius: 12, padding: "12px 14px", color: "#f4f4f5", fontSize: 15,
      outline: "none", transition: "border-color 0.2s"
    },
    onFocus: e => { e.target.style.borderColor = "#f97316"; },
    onBlur: e => { e.target.style.borderColor = "#3f3f46"; }
  };

  const openProfile = (slug) => {
    setProfileInUrl(slug);
    onSelect(slug);
  };

  const removeProfile = async (slug, e) => {
    e.stopPropagation();
    if (delConfirm !== slug) {
      setDelConfirm(slug);
      clearTimeout(delRef.current);
      delRef.current = setTimeout(() => setDelConfirm(null), 3000);
      return;
    }
    setDelConfirm(null);
    const next = await deleteProfile(slug);
    setProfiles(next);
  };

  return (
    <div className="scrollable" style={{
      minHeight: "100%", background: "#09090b", color: "#f4f4f5",
      display: "flex", flexDirection: "column", alignItems: "center"
    }}>
      <div style={{ width: "100%", maxWidth: 480, padding: "32px 20px 48px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, background: "#f97316", borderRadius: 16,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Users size={24} style={{ color: "#fff" }} />
          </div>
          <h1 className="syne" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Sindria <span style={{ color: "#f97316" }}>List</span>
          </h1>
          <p style={{ color: "#71717a", fontSize: 14, marginTop: 8 }}>
            Choose your profile — each one has its own list and shareable link.
          </p>
        </div>

        {!ready ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <div style={{ width: 26, height: 26, border: "2.5px solid #f97316",
              borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : (
          <>
            {profiles.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: "#52525b", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", marginBottom: 10 }}>Your profiles</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {profiles.map((p, i) => (
                    <div key={p.id} className="card-in" style={{
                      animationDelay: `${i * 40}ms`,
                      display: "flex", alignItems: "stretch", gap: 6,
                      background: "#18181b", border: `1px solid ${delConfirm === p.slug ? "rgba(239,68,68,0.4)" : "#27272a"}`,
                      borderRadius: 14, overflow: "hidden", transition: "border-color 0.15s"
                    }}>
                      <button type="button" onClick={() => openProfile(p.slug)}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", gap: 14,
                          padding: "14px 12px 14px 16px", cursor: "pointer", textAlign: "left",
                          background: "transparent", border: "none", color: "#f4f4f5",
                          transition: "background 0.15s", minWidth: 0
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#1f1f23"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(249,115,22,0.14)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={20} style={{ color: "#fb923c" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</p>
                          <p style={{ color: "#52525b", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
                            ?profile={p.slug}
                          </p>
                        </div>
                      </button>
                      <button type="button" title={delConfirm === p.slug ? "Tap again to delete" : "Remove profile"}
                        onClick={e => removeProfile(p.slug, e)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 48, flexShrink: 0, border: "none", cursor: "pointer",
                          background: delConfirm === p.slug ? "rgba(239,68,68,0.14)" : "transparent",
                          color: delConfirm === p.slug ? "#f87171" : "#52525b",
                          transition: "background 0.15s, color 0.15s"
                        }}
                        onMouseEnter={e => { if (delConfirm !== p.slug) e.currentTarget.style.color = "#f87171"; }}
                        onMouseLeave={e => { if (delConfirm !== p.slug) e.currentTarget.style.color = "#52525b"; }}>
                        {delConfirm === p.slug ? <Check size={16} /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 16, padding: 18 }}>
              <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 10 }}>
                {profiles.length ? "New profile" : "Create your first profile"}
              </p>
              <input {...inp} placeholder="e.g. Alex, Jamie, Main…" value={name}
                onChange={e => { setName(e.target.value); setErr(""); }}
                onKeyDown={e => e.key === "Enter" && createProfile()} />
              {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{err}</p>}
              <button onClick={createProfile} disabled={creating} style={{
                marginTop: 14, width: "100%", background: creating ? "#9a3412" : "#f97316",
                border: "none", borderRadius: 12, padding: "13px 0", color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: creating ? "wait" : "pointer",
                transition: "background 0.15s, transform 0.1s"
              }}
                onMouseDown={e => !creating && (e.currentTarget.style.transform = "scale(0.98)")}
                onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
                + Create profile
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────── StarRating ────────────────────────────── */
function StarRating({ value = 0, onChange, size = 15 }) {
  const [hov, setHov] = useState(0);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {[1,2,3,4,5].map(n => (
        <button key={n}
          onMouseEnter={() => setHov(n)} onMouseLeave={() => setHov(0)}
          onClick={() => onChange(n === value ? 0 : n)}
          style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            transition: "transform 0.1s" }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.85)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
        >
          <Star size={size} style={{
            color: n <= (hov || value) ? "#fb923c" : "#3f3f46",
            fill: n <= (hov || value) ? "#fb923c" : "transparent",
            transition: "color 0.1s, fill 0.1s"
          }} />
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── EmptyState ─────────────────────────────────── */
function EmptyState({ tab }) {
  const MAP = {
    reading: { Icon: BookOpen,  title: "Nothing here yet!",    body: "Tap + to start tracking your manga." },
    read:    { Icon: BookCheck, title: "No completed titles.",  body: "Finish a manga to move it here." },
    dropped: { Icon: BookX,     title: "No dropped titles.",    body: "Hopefully you won't need this tab!" },
  };
  const { Icon, title, body } = MAP[tab] || MAP.reading;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "72px 32px", textAlign: "center", userSelect: "none" }}>
      <div style={{ position: "relative", marginBottom: 24 }}>
        <div style={{ position: "absolute", inset: -24, background: "radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 72%)", pointerEvents: "none" }} />
        <Icon size={68} strokeWidth={0.75} style={{ color: "#3f3f46", position: "relative" }} />
      </div>
      <p style={{ color: "#d4d4d8", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{title}</p>
      <p style={{ color: "#52525b", fontSize: 13 }}>{body}</p>
    </div>
  );
}

/* ─────────────────────────── MangaCard ──────────────────────────────────── */
function MangaCard({ item, onUpdate, onDelete, onMoveRead, animDelay }) {
  const [delMode, setDelMode] = useState(false);
  const [flash, setFlash] = useState(null);
  const delRef = useRef(null);

  const done = item.totalChapters > 0 && item.currentChapter >= item.totalChapters;
  const pct  = item.totalChapters > 0 ? Math.min(100, (item.currentChapter / item.totalChapters) * 100) : 0;

  const bump = (dir) => {
    if (dir > 0 && done) return;
    if (dir < 0 && item.currentChapter <= 0) return;
    setFlash(dir > 0 ? "plus" : "minus");
    setTimeout(() => setFlash(null), 380);
    onUpdate({ ...item, currentChapter: item.currentChapter + dir, lastUpdated: Date.now() });
  };

  const onDel = () => {
    if (delMode) { onDelete(item.id); return; }
    setDelMode(true);
    clearTimeout(delRef.current);
    delRef.current = setTimeout(() => setDelMode(false), 3000);
  };

  const iconBtn = (extra = {}) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    minWidth: 36, minHeight: 36, borderRadius: 10, border: "none",
    cursor: "pointer", transition: "background 0.15s, color 0.15s, transform 0.1s",
    ...extra
  });

  return (
    <div className="card-in" style={{
      background: "#18181b", borderRadius: 16, padding: "10px 12px",
      display: "flex", gap: 11, alignItems: "stretch",
      border: "1px solid #27272a", marginBottom: 9, animationDelay: `${animDelay}ms`
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {item.coverUrl
          ? <img src={item.coverUrl} alt={item.title}
              onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }}
              style={{ width: 52, height: 72, objectFit: "cover", borderRadius: 10, display: "block" }} />
          : null}
        <div style={{
          width: 52, height: 72, borderRadius: 10, background: "#27272a",
          display: item.coverUrl ? "none" : "flex", alignItems: "center", justifyContent: "center"
        }}>
          <BookOpen size={18} style={{ color: "#52525b" }} />
        </div>
        {item.totalChapters > 0 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
            background: "#27272a", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#f97316", transition: "width 0.4s ease" }} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            {item.readUrl
              ? <a href={item.readUrl} target="_blank" rel="noopener noreferrer" className="lc2"
                  style={{ color: "#f4f4f5", fontWeight: 600, fontSize: 13, lineHeight: 1.4, textDecoration: "none" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#fb923c"}
                  onMouseLeave={e => e.currentTarget.style.color = "#f4f4f5"}>
                  {item.title}
                </a>
              : <p className="lc2" style={{ color: "#f4f4f5", fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{item.title}</p>
            }
            {item.status === "reading" && item.lastUpdated && (
              <span style={{ color: "#52525b", fontSize: 11, display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                <Clock size={9} style={{ color: "#52525b" }} />{timeAgo(item.lastUpdated)}
              </span>
            )}
          </div>
          <button onClick={onDel} style={iconBtn({
            minWidth: 30, minHeight: 30, flexShrink: 0,
            background: delMode ? "rgba(239,68,68,0.14)" : "transparent",
            color: delMode ? "#f87171" : "#52525b",
            transform: delMode ? "scale(1.1)" : "scale(1)"
          })} onMouseEnter={e => !delMode && (e.currentTarget.style.color = "#f87171")}
             onMouseLeave={e => !delMode && (e.currentTarget.style.color = "#52525b")}>
            {delMode ? <Check size={13} /> : <Trash2 size={13} />}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#f97316", fontWeight: 700, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
              {item.currentChapter}
            </span>
            {item.totalChapters > 0 && <>
              <span style={{ color: "#3f3f46", fontSize: 12 }}>/</span>
              <span style={{ color: "#71717a", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{item.totalChapters}</span>
            </>}
            {done && (
              <span style={{ background: "rgba(249,115,22,0.14)", color: "#fb923c", fontSize: 10,
                padding: "2px 6px", borderRadius: 6, fontWeight: 600, marginLeft: 2 }}>Done!</span>
            )}
          </div>

          {item.status === "read"
            ? <StarRating value={item.rating || 0} onChange={r => onUpdate({ ...item, rating: r })} />
            : (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {done && (
                  <button onClick={() => onMoveRead(item.id)} style={{
                    ...iconBtn({ padding: "0 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }),
                    background: "rgba(249,115,22,0.14)", color: "#fb923c", borderRadius: 9
                  }} onMouseEnter={e => { e.currentTarget.style.background="#f97316"; e.currentTarget.style.color="#fff"; }}
                     onMouseLeave={e => { e.currentTarget.style.background="rgba(249,115,22,0.14)"; e.currentTarget.style.color="#fb923c"; }}>
                    ✓ Mark Read
                  </button>
                )}
                <button onClick={() => bump(-1)} style={iconBtn({
                  background: flash === "minus" ? "#f97316" : "#27272a",
                  color: flash === "minus" ? "#fff" : "#a1a1aa"
                })} onMouseDown={e => e.currentTarget.style.transform = "scale(0.88)"}
                   onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
                  <Minus size={13} />
                </button>
                <button onClick={() => bump(1)} disabled={!!done} style={iconBtn({
                  background: flash === "plus" ? "#f97316" : done ? "#1c1c1e" : "#27272a",
                  color: flash === "plus" ? "#fff" : done ? "#3f3f46" : "#a1a1aa",
                  cursor: done ? "not-allowed" : "pointer"
                })} onMouseDown={e => !done && (e.currentTarget.style.transform = "scale(0.88)")}
                   onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
                  <Plus size={13} />
                </button>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── AddModal ───────────────────────────────────── */
function AddModal({ initial, onClose, onSave }) {
  const blank = { title: "", coverUrl: "", readUrl: "", currentChapter: "", totalChapters: "", status: "reading" };
  const [f, setF] = useState(initial ? {
    ...initial,
    currentChapter: String(initial.currentChapter ?? ""),
    totalChapters: initial.totalChapters ? String(initial.totalChapters) : ""
  } : blank);
  const [err, setErr] = useState("");

  const field = (k, v) => { setF(p => ({ ...p, [k]: v })); if (k === "title") setErr(""); };

  const save = () => {
    if (!f.title.trim()) { setErr("Title is required"); return; }
    onSave({ ...f, title: f.title.trim(), currentChapter: parseInt(f.currentChapter) || 0, totalChapters: f.totalChapters ? parseInt(f.totalChapters) : null });
  };

  const inp = (extra = {}) => ({
    style: {
      width: "100%", background: "#27272a", border: "1px solid #3f3f46",
      borderRadius: 12, padding: "10px 14px", color: "#f4f4f5", fontSize: 14,
      outline: "none", transition: "border-color 0.2s",
      ...extra
    },
    onFocus: e => e.target.style.borderColor = "#f97316",
    onBlur:  e => e.target.style.borderColor = "#3f3f46"
  });

  const label = (text) => (
    <label style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
      {text}
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex",
      alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
        onClick={onClose} />
      <div className="sheet-in" style={{
        position: "relative", background: "#18181b", width: "100%", maxWidth: 520,
        borderRadius: "24px 24px 0 0", border: "1px solid #27272a", borderBottom: "none",
        padding: "20px 20px 36px", maxHeight: "88vh", overflowY: "auto"
      }}>
        <div style={{ width: 36, height: 4, background: "#3f3f46", borderRadius: 99, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <span className="syne" style={{ color: "#f4f4f5", fontWeight: 800, fontSize: 18 }}>
            {initial ? "Edit Entry" : "Add Manga / Manhwa"}
          </span>
          <button onClick={onClose} style={{ width: 32, height: 32, background: "#27272a", border: "none",
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#a1a1aa" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            {label("Title *")}
            <input {...inp()} placeholder="e.g. Berserk" value={f.title} onChange={e => field("title", e.target.value)} />
            {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 5 }}>{err}</p>}
          </div>
          <div>
            {label("Cover Image URL")}
            <input {...inp()} placeholder="https://example.com/cover.jpg" value={f.coverUrl} onChange={e => field("coverUrl", e.target.value)} />
          </div>
          <div>
            {label("Read URL")}
            <input {...inp()} placeholder="Link to reading site" value={f.readUrl} onChange={e => field("readUrl", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              {label("Current Ch.")}
              <input type="number" min="0" {...inp()} placeholder="0" value={f.currentChapter} onChange={e => field("currentChapter", e.target.value)} />
            </div>
            <div>
              {label("Total Chs.")}
              <input type="number" min="0" {...inp()} placeholder="?" value={f.totalChapters} onChange={e => field("totalChapters", e.target.value)} />
            </div>
          </div>
          <div>
            {label("Status")}
            <select {...inp({ appearance: "none", cursor: "pointer" })} value={f.status} onChange={e => field("status", e.target.value)}>
              <option value="reading">📖 Reading</option>
              <option value="read">✅ Read</option>
              <option value="dropped">🚫 Dropped</option>
            </select>
          </div>
        </div>

        <button onClick={save} style={{
          marginTop: 22, width: "100%", background: "#f97316", border: "none", borderRadius: 14,
          padding: "14px 0", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          transition: "background 0.15s, transform 0.1s"
        }} onMouseEnter={e => e.currentTarget.style.background = "#ea580c"}
           onMouseLeave={e => e.currentTarget.style.background = "#f97316"}
           onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
           onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
          {initial ? "Save Changes" : "+ Add to List"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── SettingsPanel ──────────────────────────────── */
function SettingsPanel({ onClose, entries, setEntries, profileSlug, profileName, onSwitchProfile, onDeleteProfile }) {
  const fileRef = useRef();
  const [copied, setCopied] = useState(false);
  const [delProfile, setDelProfile] = useState(false);
  const delProfileRef = useRef(null);
  const profileLink = getProfileLink(profileSlug);

  const removeThisProfile = async () => {
    if (!delProfile) {
      setDelProfile(true);
      clearTimeout(delProfileRef.current);
      delProfileRef.current = setTimeout(() => setDelProfile(false), 3000);
      return;
    }
    onClose();
    await onDeleteProfile();
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `sindria-list-${profileSlug}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); onClose();
  };

  const importData = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try { const d = JSON.parse(ev.target.result); if (Array.isArray(d)) { setEntries(d); onClose(); } }
      catch {}
    };
    r.readAsText(file);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = profileLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const row = { display: "flex", alignItems: "center", gap: 14, background: "#27272a",
    borderRadius: 14, padding: "13px 16px", border: "none", width: "100%",
    textAlign: "left", cursor: "pointer", transition: "background 0.15s", color: "#f4f4f5" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex",
      alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
        onClick={onClose} />
      <div className="sheet-in" style={{
        position: "relative", background: "#18181b", width: "100%", maxWidth: 520,
        borderRadius: "24px 24px 0 0", border: "1px solid #27272a", borderBottom: "none",
        padding: "20px 20px 44px", maxHeight: "88vh", overflowY: "auto"
      }}>
        <div style={{ width: 36, height: 4, background: "#3f3f46", borderRadius: 99, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <span className="syne" style={{ color: "#f4f4f5", fontWeight: 800, fontSize: 18 }}>Settings</span>
          <button onClick={onClose} style={{ width: 32, height: 32, background: "#27272a", border: "none",
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#a1a1aa" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ marginBottom: 18, padding: "12px 14px", background: "rgba(249,115,22,0.07)",
          borderRadius: 12, border: "1px solid rgba(249,115,22,0.18)" }}>
          <p style={{ color: "#fb923c", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Profile: {profileName}
          </p>
          <p style={{ color: "#71717a", fontSize: 11, wordBreak: "break-all" }}>{profileLink}</p>
        </div>

        <p style={{ color: "#52525b", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 12 }}>Profile link</p>

        <button onClick={copyLink} style={{ ...row, marginBottom: 10 }}
          onMouseEnter={e => e.currentTarget.style.background = "#3f3f46"}
          onMouseLeave={e => e.currentTarget.style.background = "#27272a"}>
          {copied ? <Check size={18} style={{ color: "#4ade80", flexShrink: 0 }} /> : <Copy size={18} style={{ color: "#f97316", flexShrink: 0 }} />}
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{copied ? "Link copied!" : "Copy profile link"}</p>
            <p style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>Send this to friends — each profile URL is its own list</p>
          </div>
        </button>

        <button onClick={() => { onClose(); onSwitchProfile(); }} style={{ ...row, marginBottom: 10 }}
          onMouseEnter={e => e.currentTarget.style.background = "#3f3f46"}
          onMouseLeave={e => e.currentTarget.style.background = "#27272a"}>
          <Users size={18} style={{ color: "#f97316", flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>Switch profile</p>
            <p style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>Back to profile selection</p>
          </div>
        </button>

        <button onClick={removeThisProfile} style={{
          ...row, marginBottom: 20,
          background: delProfile ? "rgba(239,68,68,0.12)" : "#27272a",
          outline: delProfile ? "1px solid rgba(239,68,68,0.35)" : "none"
        }}
          onMouseEnter={e => { if (!delProfile) e.currentTarget.style.background = "#3f3f46"; }}
          onMouseLeave={e => { if (!delProfile) e.currentTarget.style.background = "#27272a"; }}>
          {delProfile ? <Check size={18} style={{ color: "#f87171", flexShrink: 0 }} /> : <Trash2 size={18} style={{ color: "#f87171", flexShrink: 0 }} />}
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: delProfile ? "#f87171" : "#f4f4f5" }}>
              {delProfile ? "Tap again to delete profile" : "Delete this profile"}
            </p>
            <p style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>
              Removes the profile and all its manga entries
            </p>
          </div>
        </button>

        <p style={{ color: "#52525b", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 12 }}>Data management</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={exportData} style={row}
            onMouseEnter={e => e.currentTarget.style.background = "#3f3f46"}
            onMouseLeave={e => e.currentTarget.style.background = "#27272a"}>
            <Download size={18} style={{ color: "#f97316", flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Export data</p>
              <p style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>Download this profile as JSON</p>
            </div>
          </button>
          <button onClick={() => fileRef.current.click()} style={row}
            onMouseEnter={e => e.currentTarget.style.background = "#3f3f46"}
            onMouseLeave={e => e.currentTarget.style.background = "#27272a"}>
            <Upload size={18} style={{ color: "#f97316", flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Import data</p>
              <p style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>Restore from a JSON backup file</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
        </div>

        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(249,115,22,0.07)",
          borderRadius: 12, border: "1px solid rgba(249,115,22,0.18)" }}>
          <p style={{ color: "#fb923c", fontSize: 12 }}>
            📚 {entries.length} {entries.length === 1 ? "entry" : "entries"} in {profileName}'s list
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── List App ───────────────────────────────── */
function SindriaListApp({ profileSlug, profileName, onSwitchProfile, onDeleteProfile }) {
  const [entries,  setEntries]  = useState([]);
  const [tab,      setTab]      = useState("reading");
  const [search,   setSearch]   = useState("");
  const [modal,    setModal]    = useState(null);
  const [settings, setSettings] = useState(false);
  const [ready,    setReady]    = useState(false);
  const canSaveRef = useRef(false);
  const storageKey = entriesKey(profileSlug);

  useEffect(() => {
    const el = document.createElement("style");
    el.id = "sindria-css";
    el.textContent = CSS;
    if (!document.getElementById("sindria-css")) document.head.appendChild(el);
    return () => document.getElementById("sindria-css")?.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    canSaveRef.current = false;
    setReady(false);
    (async () => {
      await ensureProfile(profileSlug);
      const d = await db.get(storageKey);
      if (!cancelled) {
        setEntries(Array.isArray(d) ? d : []);
        canSaveRef.current = true;
        setReady(true);
      }
    })();
    return () => { cancelled = true; canSaveRef.current = false; };
  }, [profileSlug, storageKey]);

  useEffect(() => {
    if (!ready || !canSaveRef.current) return;
    db.set(storageKey, entries);
  }, [entries, ready, storageKey]);

  const addOrEdit = useCallback((data) => {
    setEntries(prev => {
      if (data.id) return prev.map(e => e.id === data.id ? { ...e, ...data } : e);
      return [{ id: uid(), addedAt: Date.now(), lastUpdated: Date.now(), rating: 0, ...data }, ...prev];
    });
    setModal(null);
  }, []);

  const updateEntry = useCallback(updated => setEntries(p => p.map(e => e.id === updated.id ? updated : e)), []);
  const deleteEntry = useCallback(id      => setEntries(p => p.filter(e => e.id !== id)), []);
  const moveToRead  = useCallback(id      => setEntries(p => p.map(e => e.id === id ? { ...e, status: "read", lastUpdated: Date.now() } : e)), []);

  const list = useMemo(() =>
    entries
      .filter(e => e.status === tab && (!search || e.title.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => tab === "reading" ? (b.lastUpdated||0) - (a.lastUpdated||0) : (b.addedAt||0) - (a.addedAt||0)),
    [entries, tab, search]);

  const counts = useMemo(() => ({
    reading: entries.filter(e => e.status === "reading").length,
    read:    entries.filter(e => e.status === "read").length,
    dropped: entries.filter(e => e.status === "dropped").length,
  }), [entries]);

  const TABS = [
    { id: "reading", label: "Reading", Icon: BookOpen  },
    { id: "read",    label: "Read",    Icon: BookCheck },
    { id: "dropped", label: "Dropped", Icon: BookX     },
  ];

  const headerBtnStyle = (active) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 36, height: 36, background: active ? "rgba(249,115,22,0.12)" : "rgba(39,39,42,0.75)",
    border: active ? "1px solid rgba(249,115,22,0.28)" : "1px solid transparent",
    borderRadius: 10, cursor: "pointer", color: active ? "#fb923c" : "#a1a1aa",
    transition: "background 0.15s, color 0.15s"
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#09090b", color: "#f4f4f5", overflow: "hidden" }}>

      <header style={{
        flexShrink: 0, background: "rgba(9,9,11,0.94)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(39,39,42,0.7)", zIndex: 30
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "10px 14px" }}>
          <button onClick={onSwitchProfile} style={{
            display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
            color: "#71717a", fontSize: 12, cursor: "pointer", padding: "0 0 8px",
            transition: "color 0.15s"
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#fb923c"}
            onMouseLeave={e => e.currentTarget.style.color = "#71717a"}>
            <ChevronLeft size={14} /> Profiles
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, background: "#f97316", borderRadius: 11,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BookOpen size={16} style={{ color: "#fff" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span className="syne" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "#f4f4f5", display: "block", lineHeight: 1.2 }}>
                  Sindria <span style={{ color: "#f97316" }}>List</span>
                </span>
                <span style={{ color: "#71717a", fontSize: 11, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profileName}
                </span>
              </div>
            </div>

            <div style={{ flex: 1, position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%",
                transform: "translateY(-50%)", color: "#71717a", pointerEvents: "none" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search titles…"
                style={{ width: "100%", background: "rgba(39,39,42,0.8)", border: "1px solid rgba(63,63,70,0.5)",
                  borderRadius: 12, padding: "8px 28px 8px 30px", color: "#f4f4f5", fontSize: 13,
                  outline: "none", transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = "rgba(249,115,22,0.5)"}
                onBlur={e  => e.target.style.borderColor = "rgba(63,63,70,0.5)"} />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%",
                  transform: "translateY(-50%)", background: "none", border: "none",
                  cursor: "pointer", color: "#71717a", display: "flex", padding: 2 }}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => setSettings(true)} style={headerBtnStyle(false)}
                onMouseEnter={e => { e.currentTarget.style.background="#3f3f46"; e.currentTarget.style.color="#f4f4f5"; }}
                onMouseLeave={e => { e.currentTarget.style.background="rgba(39,39,42,0.75)"; e.currentTarget.style.color="#a1a1aa"; }}>
                <Settings size={15} />
              </button>
              <button onClick={() => setModal("add")} className="desk-add" style={{
                display: "flex", alignItems: "center", gap: 6, background: "#f97316",
                border: "none", borderRadius: 10, padding: "0 14px", height: 36,
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "background 0.15s, transform 0.1s"
              }} onMouseEnter={e => e.currentTarget.style.background = "#ea580c"}
                 onMouseLeave={e => e.currentTarget.style.background = "#f97316"}
                 onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
                 onMouseUp={e   => e.currentTarget.style.transform = "scale(1)"}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          <div className="desk-tabs" style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", border: "none", borderRadius: 10, cursor: "pointer",
                background: tab === id ? "rgba(249,115,22,0.11)" : "transparent",
                color: tab === id ? "#fb923c" : "#71717a",
                fontWeight: 500, fontSize: 13, transition: "all 0.18s",
                outline: tab === id ? "1px solid rgba(249,115,22,0.24)" : "none"
              }} onMouseEnter={e => tab !== id && (e.currentTarget.style.color = "#d4d4d8")}
                 onMouseLeave={e => tab !== id && (e.currentTarget.style.color = "#71717a")}>
                <Icon size={13} />
                {label}
                {counts[id] > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                    background: tab === id ? "rgba(249,115,22,0.18)" : "#27272a",
                    color: tab === id ? "#fb923c" : "#71717a" }}>
                    {counts[id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="scrollable" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 14px 96px" }}>
          {!ready
            ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
                <div style={{ width: 26, height: 26, border: "2.5px solid #f97316",
                  borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              </div>
            : list.length === 0
              ? <EmptyState tab={tab} />
              : list.map((item, i) => (
                  <MangaCard key={item.id} item={item} animDelay={i * 35}
                    onUpdate={updateEntry} onDelete={deleteEntry} onMoveRead={moveToRead} />
                ))
          }
        </div>
      </main>

      <button className="fab mob-fab" onClick={() => setModal("add")} style={{
        position: "fixed", bottom: 72, right: 16, zIndex: 30,
        width: 56, height: 56, background: "#f97316", border: "none",
        borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "transform 0.15s, background 0.15s"
      }} onMouseEnter={e => { e.currentTarget.style.background="#ea580c"; e.currentTarget.style.transform="scale(1.06)"; }}
         onMouseLeave={e => { e.currentTarget.style.background="#f97316";  e.currentTarget.style.transform="scale(1)"; }}
         onMouseDown={e => e.currentTarget.style.transform = "scale(0.93)"}
         onMouseUp={e   => e.currentTarget.style.transform = "scale(1)"}>
        <Plus size={24} style={{ color: "#fff" }} />
      </button>

      <nav className="mob-nav" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "rgba(18,18,20,0.97)", backdropFilter: "blur(14px)",
        borderTop: "1px solid #27272a", display: "flex"
      }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 3, padding: "7px 4px 10px",
            border: "none", background: "none", cursor: "pointer",
            color: tab === id ? "#f97316" : "#52525b",
            transition: "color 0.18s", minHeight: 56, position: "relative"
          }}>
            <div style={{ position: "relative" }}>
              <Icon size={22} strokeWidth={tab === id ? 2.5 : 1.5} />
              {counts[id] > 0 && (
                <span style={{
                  position: "absolute", top: -5, right: -8,
                  background: tab === id ? "#f97316" : "#27272a",
                  color: tab === id ? "#fff" : "#71717a",
                  fontSize: 9, fontWeight: 700, padding: "0 3px", borderRadius: 99,
                  minWidth: 14, textAlign: "center", lineHeight: "14px"
                }}>{counts[id] > 99 ? "99+" : counts[id]}</span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
            {tab === id && (
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 24, height: 2, background: "#f97316", borderRadius: "0 0 4px 4px" }} />
            )}
          </button>
        ))}
      </nav>

      {modal && (
        <AddModal
          initial={modal !== "add" ? modal.edit : null}
          onClose={() => setModal(null)}
          onSave={addOrEdit}
        />
      )}
      {settings && (
        <SettingsPanel
          onClose={() => setSettings(false)}
          entries={entries}
          setEntries={data => { setEntries(data); setSettings(false); }}
          profileSlug={profileSlug}
          profileName={profileName}
          onSwitchProfile={onSwitchProfile}
          onDeleteProfile={onDeleteProfile}
        />
      )}

      <style>{`
        @media (min-width: 600px) {
          .mob-nav  { display: none !important; }
          .mob-fab  { display: none !important; }
          .desk-add { display: flex !important; }
          .desk-tabs { display: flex !important; }
        }
        @media (max-width: 599px) {
          .desk-add  { display: none !important; }
          .desk-tabs { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────── Root ───────────────────────────────────── */
function SindriaListRoot() {
  const [profileSlug, setProfileSlug] = useState(() => getProfileSlugFromUrl());
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    const sync = () => setProfileSlug(getProfileSlugFromUrl());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!profileSlug) { setProfileName(""); return; }
    (async () => {
      const profiles = await ensureProfile(profileSlug);
      const p = profiles.find(x => x.slug === profileSlug);
      setProfileName(p?.name || formatSlugName(profileSlug));
    })();
  }, [profileSlug]);

  const selectProfile = (slug) => {
    setProfileInUrl(slug);
    setProfileSlug(slug);
  };

  const leaveProfile = () => {
    setProfileInUrl(null);
    setProfileSlug(null);
  };

  const deleteCurrentProfile = async () => {
    if (profileSlug) await deleteProfile(profileSlug);
    leaveProfile();
  };

  if (!profileSlug) {
    return <ProfilePicker onSelect={selectProfile} />;
  }

  return (
    <SindriaListApp
      profileSlug={profileSlug}
      profileName={profileName}
      onSwitchProfile={leaveProfile}
      onDeleteProfile={deleteCurrentProfile}
    />
  );
}

export default function MangaLog() {
  return <SindriaListRoot />;
}