(() => {
  "use strict";

  const config = window.MYTRIP_CONFIG || {};
  const apiStorageKey = "mytrip_google_backend_url";
  const savedUsernameStorageKey = "mytrip_saved_username_v2";
  const legacySavedLoginStorageKey = "mytrip_saved_account_login_v1";
  const obsoleteTabPasswordStorageKey = "mytrip_tab_password_v1";
  const frontendVersion = "4.58.1";
  const requiredBackendVersion = "4.15.0";
  const validApiUrl = (value) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value || "").trim());
  function readStoredApiUrl() { try { return localStorage.getItem(apiStorageKey) || ""; } catch { return ""; } }
  function saveStoredApiUrl(value) { try { localStorage.setItem(apiStorageKey, value); } catch {} }
  /* The URL the Administrator last connected and verified in the app wins over
     config.js; the other one stays as an automatic fallback. Before, config.js
     always won, so after a "New deployment" (new URL) the app kept calling the
     old, deleted URL and got HTTP 404. */
  (function dropStaleStoredUrl() {
    try {
      const configured = String(config.API_URL || "").trim();
      const stored = readStoredApiUrl();
      if (validApiUrl(configured) && stored && stored !== configured) localStorage.removeItem(apiStorageKey);
    } catch {}
  })();
  function backendCandidates() {
    return [...new Set([String(config.API_URL || "").trim(), readStoredApiUrl()].filter(validApiUrl))];
  }
  let apiUrl = backendCandidates()[0] || "";
  let backendState = apiUrl ? "checking" : "missing";
  let backendVersion = "";
  let backendInfo = null;
  let backendVerifiedAt = 0;
  let backendVerifiedUrl = "";
  let backendVerificationPromise = null;
  const backendVerificationTtlMs = 5 * 60 * 1000;
  const requestTimeoutMs = 45000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: config.DEFAULT_CURRENCY || "INR", maximumFractionDigits: 0 });
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  /* Lightweight, safe rich text for experience notes: the stored value is
     still a plain string, always fully HTML-escaped first, so nothing a
     traveller types can ever inject real markup. A small bold / colour /
     highlight marker syntax, written by the toolbar buttons below, is
     then turned into a fixed, hard-coded set of safe tags — no attributes
     or styles ever come from user input. */
  const NOTE_COLOURS = ["red", "blue", "green", "orange"], NOTE_HILITES = ["yellow", "green", "pink"];
  function formatNote(raw) {
    let html = esc(raw);
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
    html = html.replace(/\[c:(red|blue|green|orange)\]([\s\S]+?)\[\/c\]/g, '<span class="note-c-$1">$2</span>');
    html = html.replace(/\[h:(yellow|green|pink)\]([\s\S]+?)\[\/h\]/g, '<mark class="note-h-$1">$2</mark>');
    return html;
  }
  function experiencePhotoFieldHtml(currentUrl) {
    const photos = state.data.photos || [];
    const options = photos.map((p) => `<option value="${esc(p.photoUrl)}"${currentUrl && currentUrl === p.photoUrl ? " selected" : ""}>${esc(p.caption || "Untitled trip photo")}</option>`).join("");
    return `<label>Attach a photo <small>(optional)</small><select data-experience-photo-pick>${photos.length ? `<option value="">— pick a trip photo, or paste a link below —</option>${options}` : `<option value="">No trip photos uploaded yet — paste a link below</option>`}</select></label><label>Photo link <small>(a trip photo picked above, a Google Drive share link, or any image link — e.g. a reference sunset photo)</small><input name="photoUrl" type="url" maxlength="1000" value="${esc(currentUrl || "")}" placeholder="https://..."></label>`;
  }
  document.addEventListener("change", (event) => {
    const pick = event.target.closest("[data-experience-photo-pick]");
    if (!pick || !pick.value) return;
    const form = pick.closest("form"), input = form && form.querySelector('input[name="photoUrl"]');
    if (input) input.value = pick.value;
  });
  function noteToolbarHtml() {
    const colourBtns = NOTE_COLOURS.map((c) => `<button type="button" class="note-fmt-c" data-note-fmt="color" data-note-color="${c}" title="${c[0].toUpperCase()}${c.slice(1)} text">●</button>`).join("");
    const hiliteBtns = NOTE_HILITES.map((c) => `<button type="button" class="note-fmt-h" data-note-fmt="highlight" data-note-color="${c}" title="${c[0].toUpperCase()}${c.slice(1)} highlight">A</button>`).join("");
    return `<div class="note-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-note-fmt="bold" title="Bold"><b>B</b></button><span class="note-toolbar-sep"></span>${colourBtns}<span class="note-toolbar-sep"></span>${hiliteBtns}</div>`;
  }
  function wrapTextareaSelection(textarea, before, after) {
    const start = textarea.selectionStart, end = textarea.selectionEnd, value = textarea.value;
    const selected = value.slice(start, end);
    textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursorStart = start + before.length, cursorEnd = cursorStart + selected.length;
    textarea.focus(); textarea.setSelectionRange(cursorStart, cursorEnd);
  }
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-note-fmt]");
    if (!btn) return;
    event.preventDefault();
    const form = btn.closest("form");
    const textarea = form && form.querySelector('textarea[name="note"]');
    if (!textarea) return;
    const kind = btn.dataset.noteFmt, colour = btn.dataset.noteColor;
    if (kind === "bold") wrapTextareaSelection(textarea, "**", "**");
    else if (kind === "color") wrapTextareaSelection(textarea, `[c:${colour}]`, "[/c]");
    else if (kind === "highlight") wrapTextareaSelection(textarea, `[h:${colour}]`, "[/h]");
  });
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function readSavedAccountLogin() {
    try {
      let username = String(localStorage.getItem(savedUsernameStorageKey) || "");
      const legacy = JSON.parse(localStorage.getItem(legacySavedLoginStorageKey) || "null");
      if (!username && legacy && typeof legacy.username === "string") username = legacy.username;
      if (username) localStorage.setItem(savedUsernameStorageKey, username.slice(0, 40));
      localStorage.removeItem(legacySavedLoginStorageKey);
      sessionStorage.removeItem(obsoleteTabPasswordStorageKey);
      if (!username) return null;
      return { username: username.slice(0, 40) };
    } catch { return null; }
  }

  function saveAccountLogin(username) {
    try {
      localStorage.setItem(savedUsernameStorageKey, String(username || "").slice(0, 40));
      localStorage.removeItem(legacySavedLoginStorageKey);
      sessionStorage.removeItem(obsoleteTabPasswordStorageKey);
    }
    catch { toast("This browser could not remember the username", true); }
  }

  function clearSavedAccountLogin() {
    try {
      localStorage.removeItem(savedUsernameStorageKey);
      localStorage.removeItem(legacySavedLoginStorageKey);
      sessionStorage.removeItem(obsoleteTabPasswordStorageKey);
    } catch {}
  }

  function setLoginPasswordVisible(visible) {
    const input = $("#loginPassword"), button = $("#toggleLoginPassword");
    if (!input || !button) return;
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(visible));
  }

  function restoreSavedAccountLogin() {
    const saved = readSavedAccountLogin();
    if (!saved) return;
    $("#loginUsername").value = saved.username;
    $("#loginPassword").value = "";
    $("#rememberLogin").checked = Boolean(saved.username);
  }

  const demo = {
    trip: { tripId: "GOA26", name: "Goa Escape", destination: "Goa", startDate: "2026-11-19", endDate: "2026-11-23", budget: 85000, currency: "INR", photoUrl: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1600&q=80", createdBy: "Sarada" },
    members: [
      { id: "m1", name: "Sarada", role: "Organiser" }, { id: "m2", travellerId: "ANITA-101", name: "Anita", role: "Editor" },
      { id: "m3", travellerId: "ROHAN-202", name: "Rohan", role: "Editor" }, { id: "m4", travellerId: "MEERA-303", name: "Meera", role: "Editor" },
      { id: "m5", name: "Vikram", role: "Viewer" }, { id: "m6", name: "Neha", role: "Editor" }
    ],
    assignments: [
      { id: "a1", tripId: "GOA26", travellerId: "ANITA-101", role: "Editor", canViewExpenses: true, photoLimit: 4 },
      { id: "a2", tripId: "GOA26", travellerId: "ROHAN-202", role: "Editor", canViewExpenses: true, photoLimit: 2 },
      { id: "a3", tripId: "GOA26", travellerId: "MEERA-303", role: "Editor", canViewExpenses: false, photoLimit: 0 }
    ],
    itinerary: [
      { id: "i1", date: "2026-11-19", time: "10:30", title: "Arrive & check in", place: "Casa Sol, Panjim", notes: "Drop bags, freshen up and have a light lunch." },
      { id: "i2", date: "2026-11-19", time: "16:30", title: "Fontainhas heritage walk", place: "Altinho, Panjim", notes: "Start near the Maruti Temple. Carry water." },
      { id: "i3", date: "2026-11-20", time: "09:00", title: "Old Goa churches", place: "Basilica of Bom Jesus", notes: "Visit the Basilica and Sé Cathedral before lunch." },
      { id: "i4", date: "2026-11-20", time: "14:30", title: "Divar Island ferry", place: "Old Goa Ferry Terminal", notes: "Keep one hour for the village lanes and river views." },
      { id: "i5", date: "2026-11-21", time: "08:00", title: "South Goa beach day", place: "Palolem Beach", notes: "Breakfast en route; sunset from the north end." }
    ],
    experiences: [
      { id: "x1", date: "2026-11-19", place: "Fontainhas, Panjim", note: "The colourful lanes were peaceful in the late afternoon. The local guide’s stories made the heritage walk memorable.", writer: "Anita", createdAt: "2026-11-19T18:30:00.000Z" },
      { id: "x2", date: "2026-11-20", place: "Divar Island", note: "The ferry ride and quiet village roads were the highlight of the day.", writer: "Rohan", createdAt: "2026-11-20T17:15:00.000Z" }
    ],
    photos: [
      { id: "ph1", photoUrl: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80", caption: "Golden evening beside the Mandovi", uploadedBy: "Anita", uploaderId: "ANITA-101", createdAt: "2026-11-19T18:45:00.000Z" },
      { id: "ph2", photoUrl: "https://images.unsplash.com/photo-1484291470158-b8f8d608850d?auto=format&fit=crop&w=900&q=80", caption: "A colourful corner of our journey", uploadedBy: "Rohan", uploaderId: "ROHAN-202", createdAt: "2026-11-20T16:10:00.000Z" }
    ],
    places: [
      { id: "p1", name: "Fontainhas", area: "Panjim", category: "Culture", plannedDay: "Day 1" },
      { id: "p2", name: "Basilica of Bom Jesus", area: "Old Goa", category: "Heritage", plannedDay: "Day 2" },
      { id: "p3", name: "Divar Island", area: "North Goa", category: "Nature", plannedDay: "Day 2" },
      { id: "p4", name: "Palolem Beach", area: "Canacona", category: "Beach", plannedDay: "Day 3" },
      { id: "p5", name: "Reis Magos Fort", area: "Verem", category: "History", plannedDay: "Unplanned" },
      { id: "p6", name: "Ritz Classic", area: "Panjim", category: "Food", plannedDay: "Day 1" }
    ],
    expenses: [
      { id: "e1", date: "2026-11-18", label: "Casa Sol · 4 nights", category: "Stay", paidBy: "Sarada", amount: 18500 },
      { id: "e2", date: "2026-11-08", label: "Bengaluru–Goa flights", category: "Travel", paidBy: "Anita", amount: 9640 },
      { id: "e3", date: "2026-11-19", label: "Lunch · Ritz Classic", category: "Food", paidBy: "Rohan", amount: 2310 },
      { id: "e4", date: "2026-11-19", label: "Airport taxi", category: "Local travel", paidBy: "Sarada", amount: 1200 },
      { id: "e5", date: "2026-11-20", label: "Heritage walk tickets", category: "Activities", paidBy: "Meera", amount: 800 }
    ]
  };

  const state = { data: null, tab: "overview", pin: "", accountUsername: "", authenticated: false, travellerId: "", loginMode: "trip", demoMode: false, mapQuery: "", mapTripId: "", currentUser: "Traveller", accessRole: "traveller", permissions: {}, expenseRowEditId: "" };
  const stickyStoragePrefix = "mytrip_trip_stickies_v1";
  const stickyColours = ["yellow", "rose", "blue", "green", "violet"];
  const idleChoices = [5, 30, 60, 120];
  const idleMinutesKey = "mytrip_idle_minutes_v1";
  let idleMinutes = (() => { const stored = Number(localStorage.getItem(idleMinutesKey)); return idleChoices.includes(stored) ? stored : 5; })();
  let idleLogoutMs = idleMinutes * 60 * 1000;
  function idleLabel(minutes) { return minutes < 60 ? `${minutes} minutes` : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`; }
  /** Adopts the Administrator's shared setting whenever the backend reports it. */
  function applyIdleMinutes(minutes) {
    const value = Number(minutes);
    if (!idleChoices.includes(value) || value === idleMinutes) return;
    idleMinutes = value; idleLogoutMs = value * 60 * 1000;
    try { localStorage.setItem(idleMinutesKey, String(value)); } catch {}
    if (state.authenticated && idleDeadline) { idleDeadline = Date.now() + idleLogoutMs; checkIdleTimeout(); }
  }
  let stickyNotes = [];
  let idleTimer = 0;
  let idleDeadline = 0;
  let lastActivitySignal = 0;
  let stickyMigrationRunning = false;
  let activeRequests = 0;
  let quickFindVisibleResults = [];
  let printAreaDirty = true;
  const labels = { overview: "Overview", itinerary: "Itinerary", experiences: "Experiences", photos: "Trip Photos", places: "Places & Map", expenses: "Expenses", people: "Travellers", checklist: "Checklist", print: "Print & Export", help: "Help & Feedback" };
  const demoTrips = [
    { tripId: "GOA26", name: "Goa Escape", destination: "Goa", startDate: "2026-11-19", endDate: "2026-11-23", budget: 85000, spent: 32450, travellerCount: 6, assignedTravellerCount: 3, assignedTravellerIds: ["ANITA-101", "ROHAN-202", "MEERA-303"], enabled: true, createdBy: "Sarada" },
    { tripId: "KER27", name: "Kerala Backwaters", destination: "Alappuzha", startDate: "2027-01-14", endDate: "2027-01-18", budget: 72000, spent: 8400, travellerCount: 4, assignedTravellerCount: 1, assignedTravellerIds: ["ANITA-101"], enabled: true, createdBy: "Sarada" },
    { tripId: "MYS26", name: "Mysuru Weekend", destination: "Mysuru", startDate: "2026-09-05", endDate: "2026-09-07", budget: 28000, spent: 12650, travellerCount: 3, assignedTravellerCount: 0, assignedTravellerIds: [], enabled: false, createdBy: "Sarada" }
  ];
  const demoTraveller = { travellerId: "ANITA-101", name: "Anita", active: true, canCreateTrips: true, canCreateAnotherTrip: true, tripCreationLimit: 3, createdTripCount: 0, tripCreationRemaining: 3 };
  const demoTravellerAccounts = [
    { travellerId: "ANITA-101", name: "Anita", email: "anita@example.com", phone: "+91 98765 43210", city: "Bengaluru", emergencyContact: "Ravi · +91 90000 10001", notes: "Vegetarian meals", active: true, canCreateTrips: true, canCreateAnotherTrip: true, tripCreationLimit: 3, createdTripCount: 0, tripCreationRemaining: 3, tripCount: 2, tripIds: ["GOA26", "KER27"] },
    { travellerId: "ROHAN-202", name: "Rohan", email: "rohan@example.com", phone: "+91 98765 43211", city: "Mysuru", emergencyContact: "", notes: "", active: true, canCreateTrips: false, canCreateAnotherTrip: false, tripCreationLimit: 0, createdTripCount: 0, tripCreationRemaining: 0, tripCount: 1, tripIds: ["GOA26"] },
    { travellerId: "MEERA-303", name: "Meera", email: "", phone: "+91 98765 43212", city: "Bengaluru", emergencyContact: "", notes: "", active: false, canCreateTrips: false, canCreateAnotherTrip: false, tripCreationLimit: 0, createdTripCount: 0, tripCreationRemaining: 0, tripCount: 1, tripIds: ["GOA26"] }
  ];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function friendlyError(message) {
    const m = String(message || "");
    if (/Cannot read propert|undefined|null|is not a function|is not defined|Unexpected token|JSON/i.test(m)) return "Something didn't load properly. Please tap Refresh, or pick the trip again.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "No connection right now. Your changes will be tried again when you're back online.";
    if (/timeout|timed out/i.test(m)) return "The server is taking too long. Please try again in a moment.";
    if (/quota|exceeded/i.test(m)) return "The server is busy. Please wait a minute and try again.";
    return m;
  }
  function toast(message, error = false) { const element = $("#toast"); if (!element) return; if (error) message = friendlyError(message); element.textContent = `${error ? "!" : "✓"} ${message}`; element.style.background = error ? "#B23A2A" : "#1F2A33"; element.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add("hidden"), error ? 9000 : 2800); }
  function displayDate(date, options = { day: "2-digit", month: "short", year: "numeric" }) { if (!date) return "—"; return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options); }
  function displayTime(value) { if (!value) return ""; const [hours, minutes] = String(value).split(":"); const date = new Date(2000, 0, 1, Number(hours), Number(minutes)); return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
  /* ---- profile photos ----
     avatarSlot() renders initials; paintAvatars() swaps in the photo wherever
     one exists, so no view has to know whether a person has a photo. */
  let profilePhotos = {};
  function avatarKey(person) {
    if (!person) return "";
    if (person.travellerId) return String(person.travellerId).toUpperCase();
    if (person.role === "administrator" || person.isAdmin) return "ADMIN";
    return "";
  }
  function personIsPro(person) {
    if (!person) return false;
    if (String(person.plan || "").toLowerCase() === "pro" && (!person.planExpires || new Date(person.planExpires + "T23:59:59") >= new Date())) return true;
    const nm = String(person.name || person.lead || "").trim().toLowerCase();
    if (nm && !isAdmin() && isPro() && nm === String(state.currentUser || "").trim().toLowerCase()) return true;
    if (nm && !person.isAdmin && ((state.data && state.data.proNames) || []).includes(nm)) return true;
    if (nm && Array.isArray(state.proAccountsCache) && state.proAccountsCache.includes(nm)) return true;
    const list = (state.data && state.data.proMembers) || []; if (!list.length) return false;
    let id = String(person.travellerId || "").toUpperCase();
    if (!id && person.name && state.data) { const mm = (state.data.members || []).find((x) => String(x.name || "").trim().toLowerCase() === String(person.name).trim().toLowerCase() && x.travellerId); if (mm) id = String(mm.travellerId).toUpperCase(); }
    return Boolean(id) && list.includes(id);
  }
  function avatarSlot(person) {
    const name = (person && person.name) || "";
    const slot = `<b class="avatar-slot" data-avatar-key="${esc(avatarKey(person))}" data-avatar-name="${esc(name)}">${esc(initials(name))}</b>`;
    return personIsPro(person) ? `<span class="pro-ring" title="MyTrip Pro member">${slot}<i aria-hidden="true">✦</i></span>` : slot;
  }
  function proMemberCard(traveller) {
    if (!personIsPro(traveller)) return "";
    return `<div class="pro-member-card"><span class="pro-seal" aria-hidden="true"><span>✦</span></span><span><small>MYTRIP PRO MEMBER</small><b>${esc(traveller.name || traveller.travellerId)}</b><em>${traveller.planExpires ? "Valid till " + esc(displayDate(traveller.planExpires)) : "Gift from Administrator · no end date"}</em></span></div>`;
  }
  function photoForSlot(slot) {
    const key = slot.dataset.avatarKey;
    if (key && profilePhotos[key]) return profilePhotos[key];
    const name = String(slot.dataset.avatarName || "").trim().toLowerCase();
    if (!name || !state.data) return "";
    const member = (state.data.members || []).find((item) => String(item.name || "").trim().toLowerCase() === name && item.travellerId);
    if (member) return profilePhotos[String(member.travellerId).toUpperCase()] || "";
    /* The organiser row is the Administrator: it has no Traveller ID, so match
       it by name to the trip creator or the signed-in Administrator. */
    if (profilePhotos.ADMIN) {
      const creator = String((state.data.trip && state.data.trip.createdBy) || "").trim().toLowerCase();
      const adminName = isAdmin() ? String(state.currentUser || "").trim().toLowerCase() : "";
      const organiser = (state.data.members || []).find((item) => String(item.name || "").trim().toLowerCase() === name && !item.travellerId && /organi[sz]er|admin/i.test(String(item.role || "")));
      if (name === creator || name === adminName || organiser) return profilePhotos.ADMIN;
      /* v4.27.3: the organiser row is often named differently from the admin
         login (e.g. "Pradeep" vs "admin"). If this is the only member without
         a Traveller ID, it can only be the Administrator. */
      const nonTravellers = (state.data.members || []).filter((item) => !item.travellerId);
      if (nonTravellers.length === 1 && String(nonTravellers[0].name || "").trim().toLowerCase() === name) return profilePhotos.ADMIN;
      const adminLabel = String((state.data.trip && state.data.trip.adminName) || "").trim().toLowerCase();
      if (adminLabel && name === adminLabel) return profilePhotos.ADMIN;
    }
    return "";
  }
  function paintAvatars(root = document) {
    root.querySelectorAll(".avatar-slot").forEach((slot) => {
      const url = photoForSlot(slot);
      const current = slot.querySelector("img");
      if (url && (!current || current.getAttribute("src") !== url)) {
        slot.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
        slot.querySelector("img").addEventListener("error", () => { slot.textContent = initials(slot.dataset.avatarName); slot.classList.remove("has-photo"); }, { once: true });
        slot.classList.add("has-photo");
        if (slot.parentElement) slot.parentElement.classList.add("avatar-photo-host");
      } else if (!url && current) {
        slot.textContent = initials(slot.dataset.avatarName); slot.classList.remove("has-photo");
      }
    });
  }
  function setProfilePhotos(map) { if (map && typeof map === "object") { profilePhotos = { ...map }; paintAvatars(); } }
  async function loadProfilePhotos() {
    if (state.demoMode || !apiUrlReady()) return;
    try { setProfilePhotos(await api("getProfilePhotos", {})); } catch {}
  }
  let avatarFrame = 0;
  new MutationObserver(() => { if (avatarFrame) return; avatarFrame = requestAnimationFrame(() => { avatarFrame = 0; paintAvatars(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  /** Crops to a centred square, resizes to 256px and uploads as JPEG. */
  async function squareJpeg(file) {
    file = await snapshotFile(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The photo could not be read."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("That file is not a supported image."));
        image.onload = () => {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** target "admin" or a Traveller ID. The Administrator can set anyone; a traveller only themself. */
  function pickProfilePhoto(target) {
    const picker = document.createElement("input");
    picker.type = "file"; picker.accept = "image/jpeg,image/png,image/webp";
    picker.addEventListener("change", async () => {
      const file = picker.files && picker.files[0];
      if (!file) return;
      try {
        const data = await squareJpeg(file);
        const key = target === "admin" ? "ADMIN" : String(target).toUpperCase();
        if (state.demoMode) { setProfilePhotos({ ...profilePhotos, [key]: data }); return toast("Photo updated (demo only)"); }
        toast("Uploading photo…");
        const auth = isAdmin() || state.administratorSecret ? adminAuth(state.administratorSecret || state.pin) : { username: state.accountUsername || state.travellerId, password: state.pin };
        const saved = await api("uploadProfilePhoto", { ...auth, target: target === "admin" ? "admin" : "traveller", travellerId: target === "admin" ? "" : key, file: { type: "image/jpeg", name: `${key}.jpg`, data } });
        setProfilePhotos({ ...profilePhotos, [key]: saved.photoUrl });
        toast("Photo saved for everyone");
      } catch (error) { toast(error.message, true); }
    });
    picker.click();
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-photo-upload]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    pickProfilePhoto(button.dataset.photoUpload);
  }, true);

  function initials(name) { return String(name || "T").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
  function nights() { return Math.max(0, Math.round((new Date(state.data.trip.endDate) - new Date(state.data.trip.startDate)) / 86400000)); }
  function spent() { return state.data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0); }
  function remaining() { return Number(state.data.trip.budget || 0) - spent(); }
  function apiUrlReady() { return validApiUrl(apiUrl); }

  function setRequestProgress(delta) {
    activeRequests = Math.max(0, activeRequests + delta);
    const progress = $("#appProgress"), busy = activeRequests > 0;
    if (progress) { progress.classList.toggle("hidden", !busy); progress.setAttribute("aria-hidden", String(!busy)); }
    ["#accessScreen", "#accountHub", "#dashboard"].forEach((selector) => { const element = $(selector); if (element) element.setAttribute("aria-busy", String(busy)); });
  }

  async function requestAt(url, action, payload = {}) {
    for (let attempt = 0; ; attempt++) {
      try { return await requestOnce(url, action, payload); }
      catch (error) {
        const msg = String(error && error.message || "");
        const transient = /HTTP (404|408|429|500|502|503|504)|Failed to fetch|NetworkError|Load failed/i.test(msg);
        if (!transient || attempt >= 2 || navigator.onLine === false) throw error;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  async function requestOnce(url, action, payload = {}) {
    if (navigator.onLine === false) throw new Error("No internet connection. Reconnect and try again.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    setRequestProgress(1);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...payload }), signal: controller.signal });
      if (!response.ok) throw new Error(`Google backend returned HTTP ${response.status}.${response.status === 404 ? ` Google was busy — please try again in a moment. If it keeps happening, sign out of extra Google accounts in Chrome or reopen the dashboard.` : ""}`);
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "The request could not be completed.");
      if (result.idleMinutes) applyIdleMinutes(result.idleMinutes);
      return result.data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The backend took too long to respond. Check the connection and try again.");
      if (error.name === "TypeError" || /failed to fetch|load failed|networkerror/i.test(error.message || "")) {
        throw new Error("Google could not be reached at the saved /exec link. In Apps Script open Deploy > Manage deployments, confirm the Web app is deployed with Execute as “Me” and Who has access “Anyone”, copy the current /exec URL, then reconnect it here.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      setRequestProgress(-1);
    }
  }

  function backendVersionAtLeast(version, required) {
    const currentParts = String(version || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
    const requiredParts = String(required || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(currentParts.length, requiredParts.length); index++) {
      if ((currentParts[index] || 0) > (requiredParts[index] || 0)) return true;
      if ((currentParts[index] || 0) < (requiredParts[index] || 0)) return false;
    }
    return true;
  }

  function backendUpgradeError(version) {
    const shownVersion = version ? `version ${version}` : "an old version";
    const error = new Error(`Your Google backend is ${shownVersion}, but a required account, authorised traveller trip-creation, Drive photo-gallery, Administrator-login editing, Sticky Note Diary or traveller-login editing capability is missing. Replace Code.gs with the supplied MyTrip ${requiredBackendVersion} build, run setupMyTrip(), then deploy a New version in Apps Script.`);
    error.code = "BACKEND_UPGRADE_REQUIRED";
    return error;
  }

  async function verifyBackendVersion(url = apiUrl) {
    const info = await requestAt(url, "ping");
    backendVersion = String(info && info.version || "");
    if (!backendVersionAtLeast(backendVersion, requiredBackendVersion) || info.stickyNoteDiary !== true || info.sharedStickyNotes !== true || info.itineraryPlanner !== true || info.sharedTripList !== true || info.accountLogin !== true || info.travellerCredentialEdit !== true || info.administratorLoginEdit !== true || info.travellerTripCreation !== true || info.tripPhotoGallery !== true) throw backendUpgradeError(backendVersion);
    return info;
  }

  async function ensureCurrentBackend() {
    if (!apiUrlReady()) throw new Error("Connect the Google backend first.");
    if (backendInfo && backendVerifiedUrl === apiUrl && Date.now() - backendVerifiedAt < backendVerificationTtlMs) return backendInfo;
    if (backendVerificationPromise) return backendVerificationPromise;
    backendState = "checking"; updateBackendStatus();
    backendVerificationPromise = (async () => {
      try {
        let info = null, lastError = null;
        for (const candidate of [apiUrl, ...backendCandidates().filter((url) => url !== apiUrl)]) {
          try { info = await verifyBackendVersion(candidate); apiUrl = candidate; break; }
          catch (error) { lastError = error; if (error.code === "BACKEND_UPGRADE_REQUIRED") break; }
        }
        if (!info) throw lastError || new Error("The Google backend could not be reached.");
        if (apiUrl !== readStoredApiUrl()) saveStoredApiUrl(apiUrl);
        backendInfo = info; backendVerifiedAt = Date.now(); backendVerifiedUrl = apiUrl;
        backendState = "ready"; updateBackendStatus();
        return info;
      } catch (error) {
        backendInfo = null; backendVerifiedAt = 0; backendVerifiedUrl = "";
        backendState = error.code === "BACKEND_UPGRADE_REQUIRED" ? "outdated" : "error";
        updateBackendStatus();
        throw error;
      } finally {
        backendVerificationPromise = null;
      }
    })();
    return backendVerificationPromise;
  }

  async function api(action, payload = {}) {
    if (!apiUrlReady()) throw new Error("Connect the Google backend first.");
    if (/^add/.test(action) && payload && payload.record && typeof payload.record === "object" && !payload.record.id) payload.record.id = uid();
    const flightKey = /^add/.test(action) && payload && payload.record && payload.record.id ? action + ":" + payload.record.id : "";
    if (flightKey && inFlightAdds.has(flightKey)) return inFlightAdds.get(flightKey);
    if (QUEUEABLE.has(action) && navigator.onLine === false) return queueOffline(action, payload);
    if (flightKey) { const p = requestAt(apiUrl, action, payload).finally(() => setTimeout(() => inFlightAdds.delete(flightKey), 4000)); inFlightAdds.set(flightKey, p); try { return await p; } catch (error) { if (/No internet|Failed to fetch|NetworkError|Load failed|aborted/i.test(String(error && error.message || ""))) return queueOffline(action, payload); throw error; } }
    try { return await requestAt(apiUrl, action, payload); }
    catch (error) {
      if (QUEUEABLE.has(action) && /No internet|Failed to fetch|NetworkError|Load failed|aborted/i.test(String(error && error.message || ""))) return queueOffline(action, payload);
      throw error;
    }
  }
  /* Offline queue (v4.47.0): plans/expenses added with no signal wait on this phone and sync automatically. */
  const inFlightAdds = new Map();
  const QUEUEABLE = new Set(["addChecklistItem", "updateChecklistItem", "deleteChecklistItem", "addExpense", "addPlan", "addExperience", "addPlace", "updateRecord", "deleteRecord"]);
  const offlineQueueKey = "mytrip_offline_queue_v1";
  function readOfflineQueue() { try { return JSON.parse(localStorage.getItem(offlineQueueKey) || "[]"); } catch { return []; } }
  function writeOfflineQueue(q) { try { localStorage.setItem(offlineQueueKey, JSON.stringify(q)); } catch {} renderOfflineBanner(); }
  function queueOffline(action, payload) {
    const q = readOfflineQueue(); q.push({ action, payload, at: Date.now() }); writeOfflineQueue(q);
    toast(`Saved on this phone · will sync when online (${q.length} waiting)`);
    return { queued: true };
  }
  let flushingQueue = false;
  async function flushOfflineQueue() {
    if (flushingQueue || navigator.onLine === false || !apiUrlReady()) return;
    let q = readOfflineQueue(); if (!q.length) return;
    flushingQueue = true; let done = 0;
    try {
      while (q.length) {
        try { await requestAt(apiUrl, q[0].action, q[0].payload); }
        catch (error) { if (/No internet|Failed to fetch|NetworkError|Load failed|aborted/i.test(String(error && error.message || ""))) break; console.warn("Dropped queued change", q[0].action, error); }
        q.shift(); done++; writeOfflineQueue(q);
      }
    } finally { flushingQueue = false; }
    if (done) toast(`Back online · ${done} change${done > 1 ? "s" : ""} synced`);
  }
  function renderOfflineBanner() {
    let el = document.getElementById("offlineBanner");
    const n = readOfflineQueue().length; const off = navigator.onLine === false;
    if (!n && !off) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "offlineBanner"; el.className = "offline-banner"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = `<span>☁</span><div><b>${off ? "You're offline" : "Syncing…"}</b><small>${n ? `${n} change${n > 1 ? "s" : ""} saved on this phone · will sync automatically` : "New entries will be saved on this phone"}</small></div>`;
  }
  window.addEventListener("online", () => { renderOfflineBanner(); flushOfflineQueue(); });
  window.addEventListener("offline", renderOfflineBanner);
  setTimeout(() => { renderOfflineBanner(); flushOfflineQueue(); }, 2500);
  setInterval(flushOfflineQueue, 30000);

  function stopIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = 0;
    idleDeadline = 0;
  }

  /* Stay signed in on this browser until the Administrator's auto sign-out time passes (v4.34.0). */
  const sessionKey = "mytrip_session_v2";
  let sessionSavedAt = 0;
  function persistSession(force = false) {
    try {
      if (!state.authenticated || state.demoMode || !state.pin || !idleDeadline) return;
      const now = Date.now();
      if (!force && now - sessionSavedAt < 10000) return;
      sessionSavedAt = now;
      const record = { v: 2, role: state.accessRole, username: state.accountUsername, secret: btoa(unescape(encodeURIComponent(state.pin))), travellerId: state.travellerId || "", name: state.currentUser || "", loginMode: state.loginMode || "", tripId: state.data && state.data.trip ? String(state.data.trip.tripId) : "", tab: state.tab || "overview", deadline: idleDeadline };
      localStorage.setItem(sessionKey, JSON.stringify(record));
    } catch {}
  }
  function offlineTripCacheKey(tripId) { return "mytrip_cache_v1_" + String(tripId || ""); }
  function saveOfflineTripCache(record) {
    try { if (record && record.data && record.data.trip) localStorage.setItem(offlineTripCacheKey(record.data.trip.tripId), JSON.stringify({ savedAt: Date.now(), ...record })); } catch {}
  }
  function readOfflineTripCache(tripId) { try { return JSON.parse(localStorage.getItem(offlineTripCacheKey(tripId)) || "null"); } catch { return null; } }
  function clearOfflineTripCaches() { try { Object.keys(localStorage).filter((k) => k.startsWith("mytrip_cache_v1_")).forEach((k) => localStorage.removeItem(k)); } catch {} }
  function clearSession() { try { localStorage.removeItem(sessionKey); } catch {} sessionSavedAt = 0; }
  function readSession() {
    try {
      const record = JSON.parse(localStorage.getItem(sessionKey) || "null");
      if (!record || record.v !== 2 || !record.secret || !(Number(record.deadline) > Date.now())) { clearSession(); return null; }
      record.pin = decodeURIComponent(escape(atob(record.secret)));
      return record;
    } catch { clearSession(); return null; }
  }
  async function resumeSession() {
    const s = readSession();
    if (!s || !apiUrlReady()) return false;
    state.accountUsername = s.username || ""; state.pin = s.pin; state.accessRole = s.role || "traveller"; state.travellerId = s.travellerId || ""; state.currentUser = s.name || "Traveller"; state.demoMode = false; state.authenticated = true;
    const traveller = s.travellerId ? { travellerId: s.travellerId, name: s.name || "Traveller" } : null;
    const cached = s.tripId ? readOfflineTripCache(s.tripId) : null;
    let shownFromCache = false;
    if (cached && cached.data) {
      try { await openTrip(cached.data, s.pin, false, cached.name, cached.roleOverride, cached.travellerId || "", cached.loginMode || s.loginMode); shownFromCache = true; if (s.tab && s.tab !== "overview" && labels[s.tab]) setTab(s.tab); } catch {}
    }
    if (shownFromCache && navigator.onLine === false) { setOfflineState(true); return true; }
    try {
      if (s.tripId && s.loginMode === "shared") {
        state.accountUsername = "";
        const trip = await api("getTrip", { tripId: s.tripId, pin: s.pin });
        await openTrip(trip, s.pin, false, "Shared traveller", "traveller", "", "shared");
      } else if (s.tripId) {
        await openListedTrip(s.tripId, s.pin, false, state.accessRole, state.accessRole === "administrator" ? null : traveller);
      } else if (state.accessRole === "administrator") {
        await loadAllTrips(s.pin, false, state.accountUsername);
      } else {
        await loadMyTrips(s.pin, traveller || { travellerId: state.accountUsername, name: "Traveller" }, false);
      }
      if (state.data && s.tab && s.tab !== "overview" && labels[s.tab]) { try { setTab(s.tab); } catch {} }
      if (!$("#accessScreen").classList.contains("hidden")) { state.authenticated = false; state.pin = ""; return false; }
      if (!shownFromCache) toast("Welcome back — still signed in");
      return true;
    } catch (error) {
      if (shownFromCache) { setOfflineState(true); return true; }
      try {
        if (s.tripId && s.loginMode !== "shared") {
          if (state.accessRole === "administrator") await loadAllTrips(s.pin, false, state.accountUsername);
          else await loadMyTrips(s.pin, traveller || { travellerId: state.accountUsername, name: "Traveller" }, false);
          return true;
        }
      } catch {}
      clearSession(); state.authenticated = false; state.pin = ""; return false;
    }
  }

  function hideSkeletonSafe() { try { const s = document.querySelector(".mt-skeleton, #skeleton"); if (s) s.remove(); } catch {} }

  function performLogout(message = "Signed out. Login is required again.") {
    try { hideTabbar(); } catch (error) {}
    clearSession(); clearOfflineTripCaches();
    stopIdleTimer();
    state.data = null; state.pin = ""; state.accountUsername = ""; state.authenticated = false; state.travellerId = ""; state.loginMode = "trip"; state.expenseRowEditId = "";
    state.demoMode = false; state.currentUser = "Traveller"; state.accessRole = "traveller"; state.permissions = {};
    stickyNotes = [];
    closeStickyPanel(); closeQuickFind(); setStickyControlsVisible(false); closeModal();
    $("#floatingStickyLayer").innerHTML = ""; $("#floatingStickyLayer").classList.add("hidden");
    $("#dashboard").classList.add("hidden"); $("#accountHub").classList.add("hidden"); $("#accessScreen").classList.remove("hidden");
    $("#joinForm").reset(); $("#accountLoginForm").reset();
    setLoginPasswordVisible(false); restoreSavedAccountLogin();
    try { history.replaceState({}, "", location.pathname); } catch {}
    toast(message);
  }

  function checkIdleTimeout() {
    if (!state.authenticated || !idleDeadline) return;
    const remaining = idleDeadline - Date.now();
    if (remaining <= 0) return performLogout(`Signed out after ${idleLabel(idleMinutes)} of inactivity. Please log in again.`);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(checkIdleTimeout, Math.min(remaining, 30000));
  }

  function recordActivity() {
    if (!state.authenticated) return;
    const now = Date.now();
    if (now - lastActivitySignal < 900) return;
    lastActivitySignal = now;
    idleDeadline = now + idleLogoutMs;
    checkIdleTimeout();
    persistSession();
  }

  function startIdleTimer() {
    stopIdleTimer();
    lastActivitySignal = Date.now();
    idleDeadline = lastActivitySignal + idleLogoutMs;
    checkIdleTimeout();
    setTimeout(() => persistSession(true), 0);
  }

  async function clearAppCacheAndReload() {
    const button = null;
    if (button) { button.disabled = true; button.textContent = "Clearing…"; }
    toast("Clearing cache and loading the latest version…");
    try {
      if ("caches" in window) { const keys = await caches.keys(); await Promise.all(keys.map((key) => caches.delete(key))); }
      if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
      try {
        const keep = new Set([savedUsernameStorageKey, textSizeKey, themeKey, planColumnKey, planViewKey, printWidthKey, printWrapKey, printLayoutKey, printAlignKey, "mytrip.welcomed.v1", "mytrip_photo_original"]);
        Object.keys(localStorage).forEach((key) => { if (/^mytrip/i.test(key) && !keep.has(key)) localStorage.removeItem(key); });
      } catch {}
      try { sessionStorage.clear(); } catch {}
      const url = new URL(location.href);
      url.searchParams.delete("refresh"); url.searchParams.set("refresh", String(Date.now()));
      location.replace(url.href);
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "↻ Clear cache & update"; }
      toast("Cache could not be cleared automatically. Use a browser hard refresh.", true);
    }
  }

  function updateConnectionStatus(announce = false) {
    const online = navigator.onLine !== false;
    $$(".connection-status").forEach((element) => {
      element.classList.toggle("offline", !online);
      const label = element.querySelector("b");
      if (label) label.textContent = online ? "Online" : "Offline";
      element.title = online ? "Internet connection available" : "No internet connection";
    });
    if (announce) toast(online ? "Internet connection restored" : "You are offline. Viewing remains available; saving needs the internet.", !online);
  }

  function updateBackToTop() {
    const button = $("#backToTop");
    if (!button) return;
    button.classList.toggle("hidden", scrollY < 520 || $("#dashboard").classList.contains("hidden"));
  }

  function uniqById(list) { const seen = new Set(); return list.filter((x) => { const k = x && x.id != null && x.id !== "" ? String(x.id) : ""; if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; }); }
  function normalize(data) {
    if (data && data.profilePhotos) setProfilePhotos(data.profilePhotos);
    return { trip: data.trip || {}, members: data.members || [], assignments: data.assignments || [], places: data.places || [], itinerary: uniqById(data.itinerary || []), experiences: uniqById(data.experiences || []), photos: data.photos || [], stickyDiary: data.stickyDiary || [], stickyNotes: data.stickyNotes || [], checklist: uniqById(data.checklist || []), expenses: uniqById(data.expenses || []).map((item) => ({ ...item, amount: Number(item.amount || 0) })), settlements: uniqById(data.settlements || []).map((item) => ({ ...item, amount: Number(item.amount || 0) })) };
  }

  function isAdmin() { return state.accessRole === "administrator"; }
  function canViewItinerary() { return isAdmin() || state.permissions.viewItinerary !== false; }
  function canViewExperiences() { return isAdmin() || state.permissions.viewExperiences !== false; }
  function canViewPlaces() { return isAdmin() || state.permissions.viewPlaces !== false; }
  function canViewExpenses() { return isAdmin() || state.permissions.viewExpenses !== false; }
  function canViewTravellers() { return isAdmin() || state.permissions.viewTravellers !== false; }
  const PRO_FEATURES = [["personPrint", "Person-wise expense print", "Print each traveller's expenses separately"], ["originalPhotos", "Original-quality photos", "Upload full-size photos up to 15 MB"], ["unlimitedTrips", "Unlimited trips & travellers", "No trip or group-size cap"], ["familyGroups", "Family groups", "Split expenses by family"], ["exportPlus", "PDF & Excel export", "Share clean reports with everyone"], ["themes", "Extra themes", "More colours and looks"]];
  function isPro() { return isAdmin() || state.plan === "pro"; }
  function proLocked(feature) { return Boolean(state.proEnforced) && !isPro(); }
  function requirePro(feature) { if (!proLocked(feature)) return true; showUpgradeSheet(feature); return false; }
  function renderPlanPill() {
    const pro = isPro();
    [[".sidebar .user > div", "plan-pill"], [".topbar .mobile-brand", "plan-pill plan-pill-mobile"]].forEach(([sel, cls]) => {
      const host = document.querySelector(sel); if (!host) return;
      let pill = host.querySelector(".plan-pill"); if (!pill) { pill = document.createElement("button"); pill.type = "button"; pill.className = cls; pill.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); showUpgradeSheet(); }); host.appendChild(pill); }
      const mobile = cls.includes("mobile");
      if (pro) pill.innerHTML = '<span class="pro-coin" aria-hidden="true">✦</span>PRO'; else pill.textContent = mobile ? (state.proEnforced ? "FREE ↑" : "FREE") : state.proEnforced ? "FREE · Upgrade" : "FREE · all features open";
      pill.setAttribute("aria-label", pro ? "MyTrip Pro plan" : "Free plan, see MyTrip Pro"); pill.classList.toggle("is-pro", pro);
    });
    if (pro) { proShineOnce(); maybeProWelcome(); }
  }
  /* v4.55.0 Pro badge set 3: one-time welcome + once-per-open shine */
  function maybeProWelcome() {
    try {
      if (!state.plan || state.plan !== "pro" || isAdmin()) return;
      const id = String((state.traveller && state.traveller.travellerId) || state.currentUser || ""); if (!id) return;
      const key = "mytrip_pro_welcomed_" + id.toUpperCase(); if (localStorage.getItem(key)) return;
      localStorage.setItem(key, String(Date.now()));
      const el = document.createElement("div"); el.className = "pro-welcome"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Welcome to MyTrip Pro");
      el.innerHTML = `<div class="pro-welcome-card"><div class="pro-medal" aria-hidden="true"><i></i><b></b><span>✦</span><em></em></div><small>WELCOME</small><h2>You're a MyTrip Pro member</h2><p>A gift from your Administrator. Every Pro feature is now open for you.</p><button type="button">Start exploring</button></div>`;
      document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("show"));
      const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 260); };
      el.querySelector("button").addEventListener("click", close); el.addEventListener("click", (e) => { if (e.target === el) close(); });
      setTimeout(() => { try { el.querySelector("button").focus(); } catch {} }, 300);
    } catch {}
  }
  let proShineDone = false;
  function proShineOnce() { if (proShineDone) return; proShineDone = true; setTimeout(() => document.querySelectorAll(".plan-pill.is-pro").forEach((p) => { p.classList.remove("shine"); void p.offsetWidth; p.classList.add("shine"); }), 600); }
  function showUpgradeSheet(feature) {
    const pro = isPro(); const hit = PRO_FEATURES.find((f) => f[0] === feature);
    const lead = pro ? "You have MyTrip Pro. Every feature is unlocked." : !state.proEnforced ? "During launch, every Pro feature is free for everyone. Enjoy!" : hit ? `<b>${esc(hit[1])}</b> is a Pro feature.` : "Unlock everything MyTrip can do.";
    showModal(pro ? "MyTrip Pro" : "Upgrade to MyTrip Pro", `<div class="pro-sheet"><div class="pro-sheet-hero"><span class="pro-seal" aria-hidden="true"><span>✦</span></span><div><small>MYTRIP PRO</small><b>${pro ? "You're a Pro member" : "Travel together, beautifully"}</b></div></div><p class="pro-lead">${lead}</p><ul class="pro-list">${PRO_FEATURES.map((f) => `<li class="${f[0] === feature ? "hit" : ""}"><i>${pro || !state.proEnforced ? "✓" : "✦"}</i><span><b>${esc(f[1])}</b><small>${esc(f[2])}</small></span></li>`).join("")}</ul>${pro || !state.proEnforced ? "" : `<div class="pro-plans"><span><small>MONTHLY</small><b>₹99</b></span><span class="best"><small>YEARLY · BEST VALUE</small><b>₹499</b></span><span><small>TRIP PASS</small><b>₹149</b></span></div><p class="pro-note">Online payment is coming soon. For now, ask your trip administrator to switch your account to Pro.</p>`}<div class="form-actions"><button type="button" data-cancel>Close</button></div></div>`);
  }
  function canPrintReports() { return isAdmin() || state.permissions.printReports !== false; }
  function stickyAccessLevel() {
    if (isAdmin()) return "edit";
    const level = String(state.permissions.stickyAccess || "").toLowerCase();
    if (level === "edit") return "edit";
    if (level === "view") return "view";
    if (state.permissions.writeStickyNotes === false) return "view";
    return "edit";
  }
  function canWriteStickyNotes() { return stickyAccessLevel() === "edit"; }
  function stickyAccessLabel(level) { return level === "edit" ? "Can edit this note" : "View only"; }
  function canAdd(type) {
    const allowed = { plan: canViewItinerary(), experience: canViewExperiences(), place: canViewPlaces(), expense: canViewExpenses(), travellers: isAdmin(), member: isAdmin(), settlement: isAdmin() };
    return allowed[type] !== false && (isAdmin() || state.permissions[`add${type[0].toUpperCase()}${type.slice(1)}`] !== false);
  }
  function canEditRecords(sheet = "") {
    if (isAdmin()) return true;
    const visible = { Itinerary: canViewItinerary(), ExperienceNotes: canViewExperiences(), Places: canViewPlaces(), Expenses: canViewExpenses() };
    return state.permissions.editRecords !== false && (sheet ? visible[sheet] !== false : true);
  }
  function authPayload(payload = {}) { return { tripId: state.data.trip.tripId, username: state.accountUsername, password: state.pin, pin: state.pin, ...(state.travellerId ? { travellerId: state.travellerId } : {}), ...payload }; }
  function adminAuth(password = state.pin) { return { username: state.accountUsername, password, pin: password }; }
  function visibleTripMembers() { return state.data ? state.data.members : []; }
  function assignmentAllows(assignment, field) {
    if (field === "canWriteStickyNotes") return Boolean(assignment) && String(assignment[field]).toUpperCase() === "TRUE";
    return !assignment || String(assignment[field]).toUpperCase() !== "FALSE";
  }
  function assignmentForTraveller(travellerId) { return (state.data.assignments || []).find((item) => String(item.travellerId || "").toUpperCase() === String(travellerId || "").toUpperCase()); }
  const thumbKey = "mytrip_thumbs_v1";
  let thumbMem = null;
  function tripThumbs() { if (!thumbMem) { try { thumbMem = JSON.parse(localStorage.getItem(thumbKey) || "{}") || {}; } catch { thumbMem = {}; } } return thumbMem; }
  function setTripThumb(tripId, data) { const m = tripThumbs(); m[String(tripId).toUpperCase()] = data; try { localStorage.setItem(thumbKey, JSON.stringify(m)); } catch {} }
  function makeCardThumb(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), src = URL.createObjectURL(file);
      img.onload = () => { const w = 480, h = Math.round(480 * Math.min(1, img.naturalHeight / img.naturalWidth)); const c = document.createElement("canvas"); c.width = w; c.height = h; const sw = img.naturalWidth, sh = Math.round(sw * h / w); c.getContext("2d").drawImage(img, 0, Math.max(0, (img.naturalHeight - sh) / 2), sw, sh, 0, 0, w, h); URL.revokeObjectURL(src); let q = 0.72, out = c.toDataURL("image/jpeg", q); while (out.length > 46000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); } resolve(out); };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("thumb")); };
      img.src = src;
    });
  }
  async function refreshTripThumbs() {
    if (state.demoMode || !apiUrlReady()) return;
    try { const map = await api("getTripThumbs", {}); if (!map || typeof map !== "object") return; thumbMem = map; try { localStorage.setItem(thumbKey, JSON.stringify(map)); } catch {}
      document.querySelectorAll("[data-cover-trip]").forEach((box) => { const t = map[box.dataset.coverTrip]; const img = box.querySelector("img"); if (t && img && img.getAttribute("src") !== t) { img.dataset.mtTry = "0"; img.src = t; } }); } catch {}
  }
  setTimeout(refreshTripThumbs, 1500);
  function tripPhotoUrl(value, size = 1600) {
    const url = String(value || "").trim();
    const drivePath = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
    const driveQuery = url.match(/[?&]id=([A-Za-z0-9_-]+)/i);
    const id = drivePath ? drivePath[1] : (driveQuery ? driveQuery[1] : "");
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}` : url;
  }
  function expenseTotalsByTraveller() {
    const totals = new Map();
    state.data.expenses.forEach((expense) => {
      const name = String(expense.paidBy || "Not specified").trim() || "Not specified";
      const key = name.toLowerCase();
      if (!totals.has(key)) totals.set(key, { name, total: 0, count: 0 });
      const row = totals.get(key);
      row.total += Number(expense.amount || 0);
      row.count += 1;
    });
    return [...totals.values()].filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  function showAccountHub(role, accountLabel) {
    state.authenticated = true; state.accessRole = role; state.demoMode = Boolean(state.demoMode);
    $("#accessScreen").classList.add("hidden"); $("#dashboard").classList.add("hidden"); $("#accountHub").classList.remove("hidden");
    $("#hubAccountLabel").textContent = accountLabel;
    closeModal(); updateVersionLabels(); startIdleTimer();
  }

  const tripCacheKey = "mytrip_last_trip_v1";
  function cacheTripBundle(data, meta) {
    try { localStorage.setItem(tripCacheKey, JSON.stringify({ savedAt: Date.now(), meta, data })); } catch {}
  }
  function readCachedTrip(tripId) {
    try {
      const cached = JSON.parse(localStorage.getItem(tripCacheKey) || "null");
      if (!cached || !cached.data || !cached.data.trip) return null;
      if (tripId && String(cached.data.trip.tripId) !== String(tripId)) return null;
      return cached;
    } catch { return null; }
  }

  async function openTrip(data, pin, demoMode, name, roleOverride, travellerId = "", loginMode = "trip") {
    if (!data || !data.trip) throw new Error("This trip could not be opened. Please pick it again from the list.");
    if (!demoMode) saveOfflineTripCache({ data, name, roleOverride, travellerId, loginMode });
    state.data = normalize(clone(data)); state.pin = pin; state.demoMode = demoMode;
    state.accessRole = roleOverride || data.accessRole || "traveller";
    state.currentUser = name || (state.accessRole === "administrator" ? ((data.trip && data.trip.createdBy) || "Administrator") : "Traveller");
    state.travellerId = travellerId; state.loginMode = loginMode;
    if (!state.accountUsername) state.accountUsername = travellerId || (state.accessRole === "administrator" ? "administrator" : "shared");
    state.authenticated = true;
    state.permissions = data.permissions || {};
    state.plan = data.plan === "pro" ? "pro" : "free"; state.proEnforced = data.proEnforced === true; renderPlanPill();
    $("#accessScreen").classList.add("hidden"); $("#accountHub").classList.add("hidden"); $("#dashboard").classList.remove("hidden");
    loadStickyNotes(); setStickyControlsVisible(true); applyPrintPlanSettings(); applyTextScale(); startIdleTimer();
    setTab("overview"); hydrateShell(); updatePrintArea();
    migrateCompletedStickyNotes();
  }

  function hydrateShell() {
    const { trip } = state.data, members = visibleTripMembers();
    $("#tripTitle").textContent = trip.name || trip.destination || "Current trip";
    $("#tripMeta").textContent = `${displayDate(trip.startDate, { day: "numeric", month: "short" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })} · ${nights()} nights${canViewTravellers() ? ` · ${members.length} travellers` : ""}`;
    $("#tripIdChip").innerHTML = `<small>TRIP ID</small><strong>${esc(trip.tripId)}</strong>`;
    const enabled = trip.enabled !== false && String(trip.enabled).toUpperCase() !== "FALSE";
    $("#tripStatus").textContent = enabled ? "● ACTIVE" : "● DISABLED";
    $("#tripStatus").classList.toggle("disabled", !enabled);
    $("#tripStatusButton").textContent = enabled ? "Disable trip" : "Enable trip";
    $("#sideTripName").textContent = trip.name; $("#sideTripDates").textContent = `${displayDate(trip.startDate, { day: "numeric", month: "short" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}`; $("#sideTripCode").textContent = `TRIP ID · ${trip.tripId}`;
    $("#currentUser").textContent = state.currentUser;
    const sideAvatar = $(".sidebar .user > span");
    if (sideAvatar) sideAvatar.innerHTML = avatarSlot({ name: state.currentUser, travellerId: state.travellerId, isAdmin: isAdmin() });
    $("#currentRoleLabel").textContent = isAdmin() ? "Global Administrator" : (state.travellerId ? `Traveller ID: ${state.travellerId}` : "Shared trip access");
    $("#accessBadge").textContent = isAdmin() ? "ADMINISTRATOR" : (state.travellerId ? `TRAVELLER · ${state.travellerId}` : "TRAVELLER");
    $("#accessBadge").classList.toggle("traveller", !isAdmin());
    $("#inviteButton").classList.toggle("hidden", !isAdmin());
    $("#allTripsButton").classList.toggle("hidden", !isAdmin() && !state.travellerId);
    $("#allTripsButton").textContent = isAdmin() ? "◆ All trips" : "♙ My trips";
    $("#editTripButton").classList.toggle("hidden", !isAdmin());
    $("#tripPhotoButton").classList.toggle("hidden", !isAdmin());
    $("#tripStatusButton").classList.toggle("hidden", !isAdmin());
    $("#deleteTripButton").classList.toggle("hidden", !isAdmin());
    const tabAccess = {
      itinerary: canViewItinerary(),
      experiences: canViewExperiences(),
      photos: true,
      places: canViewPlaces(),
      expenses: canViewExpenses(),
      people: canViewTravellers(),
      print: canPrintReports()
    };
    Object.entries(tabAccess).forEach(([tab, allowed]) => {
      const button = $(`[data-tab="${tab}"]`);
      if (button) button.classList.toggle("hidden", !allowed);
    });
    if (tabAccess[state.tab] === false) state.tab = "overview";
    updateVersionLabels();
    $("#topAvatars").innerHTML = canViewTravellers() ? members.slice(0, 3).map((member) => `<span title="${esc(member.name)}">${avatarSlot(member)}</span>`).join("") + (members.length > 3 ? `<span>+${members.length - 3}</span>` : "") : "";
  }

  function setTab(tab) {
    const allowed = { itinerary: canViewItinerary(), experiences: canViewExperiences(), photos: true, places: canViewPlaces(), expenses: canViewExpenses(), people: canViewTravellers(), print: canPrintReports() };
    if (allowed[tab] === false) return toast("This feature is hidden for your Traveller ID by the Administrator", true);
    state.tab = tab; persistSession(true); mtFadeView(); try { (document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" }); } catch { try { window.scrollTo(0, 0); } catch {} } $("#crumbLabel").textContent = labels[tab];
    $$('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    render(); window.scrollTo({ top: 0, behavior: "auto" });
  }

  function heading(kicker, title, action = "", add = "") { return `<div class="view-head"><div><span class="kicker">${kicker}</span><h2>${title}</h2><p>${action}</p></div>${add && canAdd(add) ? `<button class="primary" data-add="${add}">＋ Add ${add}</button>` : ""}</div>`; }
  function panelHead(kicker, title, tab) { return `<div class="panel-head"><div><span class="kicker">${kicker}</span><h2>${title}</h2></div>${tab ? `<button data-go="${tab}">View all →</button>` : ""}</div>`; }
  function accessNotice() { const personal = Boolean(state.travellerId); const travellerMessage = personal ? "Only the trip features enabled for this Traveller ID appear in the menu. Hidden data is not downloaded." : "Shared trip access uses the common feature set for this trip."; const accountActions = isAdmin() ? `<button data-all-trips>All trips</button><button data-security>Security</button>` : (personal ? `<button data-my-trips>My trips</button>` : `<span class="shared-trip-label">SHARED TRIP</span>`); return `<section class="permission-banner ${isAdmin() ? "admin" : "traveller"}"><i>${isAdmin() ? "◆" : "♙"}</i><div class="permission-copy"><b>${isAdmin() ? "Global Administrator access" : (personal ? "Personal traveller access" : "Shared trip access")}</b><p>${isAdmin() ? "Open every trip, assign travellers, control all feature access, edit details or delete a trip." : travellerMessage}</p></div>${!isAdmin() && personal ? `<span class="personal-traveller-id"><small>MY TRAVELLER ID</small><b>${esc(state.travellerId)}</b></span>` : ""}<div class="permission-banner-actions"><button class="quick-find-trigger permission-search" data-open-quick-find type="button" aria-haspopup="dialog" aria-controls="quickFindLayer" title="Search this trip (Ctrl or Command + K)"><span>⌕</span><b>Quick Find</b><kbd>⌘K</kbd></button>${accountActions}</div><span class="dashboard-inline-version">FE v${frontendVersion} · BE ${backendVersion ? `v${esc(backendVersion)}` : "—"}</span></section>`; }

  function quickFindEntries() {
    if (!state.data) return [];
    const entries = [];
    const add = (target, icon, category, title, detail = "", keywords = "") => entries.push({ target, icon, category, title: String(title || category), detail: String(detail || ""), keywords: String(keywords || "") });
    const pages = [
      ["overview", "⌂", "PAGE", "Overview", "Today’s Journey and trip summary", true],
      ["itinerary", "▦", "PAGE", "Itinerary", `${state.data.itinerary.length} plans`, canViewItinerary()],
      ["experiences", "✍", "PAGE", "Experiences", `${state.data.experiences.length} diary entries`, canViewExperiences()],
      ["photos", "▣", "PAGE", "Trip Photos", `${state.data.photos.length} memories`, true],
      ["places", "⌖", "PAGE", "Places & Map", `${state.data.places.length} saved places`, canViewPlaces()],
      ["expenses", "₹", "PAGE", "Expenses", `${state.data.expenses.length} payments`, canViewExpenses()],
      ["people", "♙", "PAGE", "Travellers", `${state.data.members.length} trip members`, canViewTravellers()],
      ["print", "▤", "PAGE", "Print & Export", "Trip reports and PDF", canPrintReports()],
      ["sticky", "✦", "UTILITY", "Sticky notes", `${stickyNotes.filter((note) => !note.completed).length} active`, true]
    ];
    pages.filter((item) => item[5]).forEach((item) => add(item[0], item[1], item[2], item[3], item[4], item[3]));
    if (canViewItinerary()) state.data.itinerary.forEach((item) => add("itinerary", "▦", "ITINERARY", item.title || "Trip plan", `${displayDate(item.date, { day: "numeric", month: "short" })}${item.time ? ` · ${displayTime(item.time)}` : ""}${item.place ? ` · ${item.place}` : ""}`, `${item.place || ""} ${item.notes || ""} ${item.date || ""}`));
    if (canViewPlaces()) state.data.places.forEach((item) => add("places", "⌖", "PLACE", item.name || "Saved place", [item.area, item.category, item.plannedDay].filter(Boolean).join(" · "), `${item.area || ""} ${item.category || ""} ${item.plannedDay || ""}`));
    if (canViewExperiences()) state.data.experiences.forEach((item) => add("experiences", "✍", "EXPERIENCE", item.place || "Trip memory", `${displayDate(item.date, { day: "numeric", month: "short" })} · ${item.writer || "Trip member"}`, `${item.note || ""} ${item.writer || ""} ${item.date || ""}`));
    state.data.photos.forEach((item) => add("photos", "▣", "PHOTO", item.caption || "Trip photo", `${item.uploadedBy || "Trip member"}${item.createdAt ? ` · ${displayDate(String(item.createdAt).slice(0, 10), { day: "numeric", month: "short" })}` : ""}`, `${item.uploadedBy || ""} ${item.createdAt || ""}`));
    if (canViewExpenses()) state.data.expenses.forEach((item) => add("expenses", "₹", "EXPENSE", item.label || "Trip payment", `${money.format(item.amount || 0)} · ${item.paidBy || "Not specified"} · ${displayDate(item.date, { day: "numeric", month: "short" })}`, `${item.category || ""} ${item.paidBy || ""} ${item.notes || ""} ${item.date || ""}`));
    if (canViewTravellers()) state.data.members.forEach((item) => add("people", "♙", "TRAVELLER", item.name || "Trip member", `${item.role || "Traveller"}${item.travellerId ? ` · ${item.travellerId}` : ""}`, `${item.travellerId || ""} ${item.role || ""}`));
    stickyNotes.filter((note) => !note.completed).forEach((item) => add("sticky", "✦", item.type.toUpperCase(), item.title, stickyDueText(item), item.body));
    return entries;
  }

  function renderQuickFindResults() {
    const input = $("#quickFindInput"), results = $("#quickFindResults"), counter = $("#quickFindCount");
    if (!input || !results || !counter) return;
    const query = input.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    quickFindVisibleResults = quickFindEntries()
      .filter((item) => !terms.length || terms.every((term) => `${item.title} ${item.detail} ${item.category} ${item.keywords}`.toLowerCase().includes(term)))
      .sort((a, b) => {
        if (!query) return (a.category === "PAGE" ? 0 : 1) - (b.category === "PAGE" ? 0 : 1);
        const score = (item) => item.title.toLowerCase().startsWith(query) ? 0 : (item.title.toLowerCase().includes(query) ? 1 : (item.category.toLowerCase().includes(query) ? 2 : 3));
        return score(a) - score(b) || a.title.localeCompare(b.title);
      }).slice(0, 14);
    counter.textContent = query ? `${quickFindVisibleResults.length} ${quickFindVisibleResults.length === 1 ? "result" : "results"}` : "Suggested destinations";
    results.innerHTML = quickFindVisibleResults.map((item, index) => `<button data-quick-find-index="${index}" type="button"><i class="target-${esc(item.target)}">${esc(item.icon)}</i><span><small>${esc(item.category)}</small><b>${esc(item.title)}</b><em>${esc(item.detail)}</em></span><strong>Open →</strong></button>`).join("") || `<div class="quick-find-empty"><i>⌕</i><b>No permitted result found</b><p>Try a traveller name, place, expense, date or itinerary title.</p></div>`;
  }

  function openQuickFind() {
    if (!state.data || $("#dashboard").classList.contains("hidden")) return;
    $("#quickFindInput").value = "";
    renderQuickFindResults();
    $("#quickFindLayer").classList.remove("hidden");
    document.body.classList.add("overlay-open");
    requestAnimationFrame(() => $("#quickFindInput").focus());
  }

  function closeQuickFind() {
    $("#quickFindLayer").classList.add("hidden");
    if ($("#modal").classList.contains("hidden")) document.body.classList.remove("overlay-open");
  }

  function openQuickFindResult(index) {
    const item = quickFindVisibleResults[Number(index)];
    if (!item) return;
    closeQuickFind();
    if (item.target === "sticky") openStickyPanel(); else setTab(item.target);
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateAtNoon(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? new Date(`${value}T12:00:00`) : null;
  }

  function daysBetween(from, to) {
    const start = dateAtNoon(from), end = dateAtNoon(to);
    return start && end ? Math.round((end - start) / 86400000) : 0;
  }

  function tripOverviewStage(today) {
    const start = String(state.data.trip.startDate || "");
    const end = String(state.data.trip.endDate || "");
    if (!dateAtNoon(start) || !dateAtNoon(end)) return "active";
    if (today < start) return "preparation";
    if (today > end) return "completed";
    return "active";
  }

  function itineraryTimeMinutes(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  }

  function importantStickyForToday(today) {
    return stickyNotes
      .filter((note) => !note.completed)
      .sort((a, b) => {
        const aRank = a.dueDate ? (a.dueDate <= today ? 0 : 1) : 2;
        const bRank = b.dueDate ? (b.dueDate <= today ? 0 : 1) : 2;
        return aRank - bRank || String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31")) || Number(b.pinned) - Number(a.pinned);
      })[0] || null;
  }

  function journeyCountdown(mins) {
    if (!(mins > 0)) return "NOW";
    const h = Math.floor(mins / 60), m = mins % 60;
    return `IN ${h ? `${h}H ` : ""}${m}M`;
  }

  /* v4.50.0 polish: greeting strip — one glance answer to "where are we, what's next, what did we spend" */
  function greetingStrip() {
    try {
      const t = state.data.trip || {}; const today = localDateKey(); const hr = new Date().getHours();
      const hi = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
      const who = String(state.currentUser || "").split(/\s+/)[0];
      const s = String(t.startDate || "").slice(0, 10), e = String(t.endDate || "").slice(0, 10);
      let when = "";
      if (s && e) { const d0 = new Date(s + "T00:00"), d1 = new Date(e + "T00:00"), dt = new Date(today + "T00:00"); const total = Math.round((d1 - d0) / 864e5) + 1, n = Math.round((dt - d0) / 864e5) + 1;
        when = n < 1 ? `${Math.round((d0 - dt) / 864e5)} day${Math.round((d0 - dt) / 864e5) === 1 ? "" : "s"} to go` : n > total ? "Trip completed" : `Day ${n} of ${total}`; }
      const nowT = new Date().toTimeString().slice(0, 5);
      const next = canViewItinerary() ? [...state.data.itinerary].filter((x) => `${x.date}${x.time || "99"}` >= `${today}${nowT}` && String(x.status || "").toLowerCase() !== "done").sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0] : null;
      const spentToday = canViewExpenses() ? state.data.expenses.filter((x) => String(x.date || "").slice(0, 10) === today).reduce((a, x) => a + Number(x.amount || 0), 0) : 0;
      const nextTxt = next ? `<button type="button" class="gs-chip" data-go="itinerary"><i>›</i><b>Next</b> ${esc(next.time || "")} ${esc(next.title || "")}${next.date !== today ? ` · ${esc(displayDate(next.date, { day: "numeric", month: "short" }))}` : ""}</button>` : "";
      const spentTxt = canViewExpenses() ? `<button type="button" class="gs-chip" data-go="expenses"><i>₹</i><b>Today</b> ${money.format(Math.round(spentToday))}</button>` : "";
      return `<section class="greeting-strip"><div><small>${esc(when || t.destination || "")}</small><h2>${hi}${who ? ", " + esc(who) : ""}</h2></div><div class="gs-chips">${nextTxt}${spentTxt}<button type="button" class="gs-chip gs-share" data-share-day><i>↗</i>Share day</button></div></section>`;
    } catch (error) { return ""; }
  }
  document.addEventListener("click", (e) => { const g = e.target.closest(".gs-chip[data-go]"); if (!g) return; e.preventDefault(); setTab(g.dataset.go); }, true);
  function renderJourneyStage(today) {
    const trip = state.data.trip;
    const stage = tripOverviewStage(today);
    const itinerary = [...state.data.itinerary].sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
    const activeSticky = stickyHiddenForMe() ? [] : stickyNotes.filter((note) => !note.completed);
    const reminder = stickyHiddenForMe() ? null : importantStickyForToday(today);
    const destination = esc(trip.destination || trip.name || "your destination");
    if (stage === "preparation") {
      const daysToGo = Math.max(0, daysBetween(today, trip.startDate));
      const plannedDays = new Set(itinerary.map((item) => item.date).filter(Boolean)).size;
      const placesPlanned = state.data.places.filter((place) => String(place.plannedDay || "").toLowerCase() !== "unplanned").length;
      return `<section class="journey-stage preparation"><div class="journey-stage-hero${heroCover().cls}"${heroCover().style}>${heroCover().img}<div><span class="journey-stage-kicker">◇ TRIP PREPARATION</span><h2>${daysToGo === 1 ? "Tomorrow is the journey" : `${daysToGo} days to go`}</h2><p><b>${displayDate(trip.startDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b> · ${destination}</p></div><span class="journey-stage-badge">GET READY</span></div><div class="journey-prep-grid">${canViewItinerary() ? `<article><i>▦</i><small>PLANNED DAYS</small><strong>${plannedDays}</strong><span>${itinerary.length} itinerary entries</span></article>` : ""}${canViewPlaces() ? `<article><i>⌖</i><small>PLACES READY</small><strong>${placesPlanned}</strong><span>${state.data.places.length} places saved</span></article>` : ""}<article><i>📌</i><small>ACTIVE REMINDERS</small><strong>${activeSticky.length}</strong><span>${reminder ? esc(reminder.title) : "Nothing needs attention"}</span></article><article><i>▧</i><small>TRIP PHOTOS</small><strong>${state.data.photos.length}</strong><span>Gallery ready for memories</span></article></div></section>`;
    }

    if (stage === "completed") {
      const daysSince = Math.max(0, daysBetween(trip.endDate, today));
      const completedCopy = daysSince === 0 ? "Completed today" : (daysSince === 1 ? "Completed yesterday" : `Completed ${daysSince} days ago`);
      return `<section class="journey-stage completed"><div class="journey-stage-hero${heroCover().cls}"${heroCover().style}>${heroCover().img}<div><span class="journey-stage-kicker">✓ TRIP COMPLETED</span><h2>Keep the journey alive</h2><p><b>${completedCopy}</b> · ${destination}</p></div><span class="journey-stage-badge">MEMORIES</span></div><div class="journey-prep-grid">${canViewExpenses() ? `<article><i>₹</i><small>TOTAL SPENDING</small><strong>${money.format(spent())}</strong><span>${state.data.expenses.length} expense entries</span></article>` : ""}${canViewExperiences() ? `<article><i>✍</i><small>EXPERIENCES</small><strong>${state.data.experiences.length}</strong><span>Diary memories recorded</span></article>` : ""}<article><i>▧</i><small>TRIP PHOTOS</small><strong>${state.data.photos.length}</strong><span>Photos in the gallery</span></article>${canViewPlaces() ? `<article><i>⌖</i><small>PLACES VISITED</small><strong>${state.data.places.length}</strong><span>Saved trip places</span></article>` : ""}</div></section>`;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayItems = itinerary.filter((item) => item.date === today);
    const remainingItems = todayItems.filter((item) => !item.time || itineraryTimeMinutes(item.time) >= nowMinutes);
    const visibleItems = (remainingItems.length ? remainingItems : todayItems.slice(-1)).slice(0, 4);
    const next = remainingItems[0] || null;
    const tripDay = Math.max(1, daysBetween(trip.startDate, today) + 1);
    const totalDays = Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1);
    const todayExpenses = canViewExpenses() ? state.data.expenses.filter((item) => item.date === today) : [];
    const todaySpent = todayExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const journeyList = visibleItems.map((item) => `<article class="journey-plan-item ${next && item.id === next.id ? "next" : ""}"><time>${item.time ? esc(displayTime(item.time)) : "Any time"}</time><div><b>${esc(item.title || "Trip plan")}</b><span>${item.place ? `⌖ ${esc(item.place)}` : "Place not added"}</span></div>${item.place ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place)}" target="_blank" rel="noreferrer">Navigate ↗</a>` : ""}</article>`).join("");
    const reminderCard = reminder ? `<article class="journey-reminder"><small>${esc(reminder.type)} · ${esc(stickyDueText(reminder))}</small><b>${esc(reminder.title)}</b><p>${esc(reminder.body || "No additional details")}</p><button data-open-sticky>Open sticky notes →</button></article>` : `<article class="journey-reminder clear"><small>REMINDERS</small><b>Nothing urgent</b><p>No active sticky note needs attention right now.</p>${canWriteStickyNotes() ? `<button data-open-sticky>Add a reminder →</button>` : ""}</article>`;
    return `<section class="journey-stage active"><div class="journey-stage-hero${heroCover().cls}"${heroCover().style}>${heroCover().img}<div><span class="journey-stage-kicker">◆ DAY ${tripDay} OF ${totalDays}</span><h2>Today’s Journey</h2><p><b>${displayDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b> · ${destination}</p></div><span class="journey-stage-badge">LIVE TODAY</span></div><div class="journey-live-grid"><div class="journey-main"><header><div><small>${next ? `UP NEXT${next.time ? ` · ${journeyCountdown(itineraryTimeMinutes(next.time) - nowMinutes)}` : ""}` : (todayItems.length ? "TODAY’S PLAN" : "OPEN DAY")}</small><h3>${next ? esc(next.title || "Next plan") : (todayItems.length ? "Today’s scheduled plans are complete" : "No itinerary planned for today")}</h3><p>${next ? `${next.time ? `${esc(displayTime(next.time))} · ` : ""}${next.place ? `⌖ ${esc(next.place)}` : "Location not added"}` : "Use this free time for a spontaneous discovery or add a plan."}</p></div>${next && next.place ? `<a class="journey-navigate" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.place)}" target="_blank" rel="noreferrer">⌖ Navigate</a>` : ""}</header><div class="journey-plan-list">${journeyList || `<div class="journey-empty"><i>☀</i><b>Make today memorable</b><span>Add a plan, visit a saved place, or record an experience.</span></div>`}</div></div><aside class="journey-side">${canViewExpenses() ? `<article class="journey-metric"><small>TODAY’S SPENDING</small><strong>${money.format(todaySpent)}</strong><span>${todayExpenses.length} ${todayExpenses.length === 1 ? "payment" : "payments"} recorded</span></article>` : ""}${reminderCard}</aside></div></section>`;
  }

  function mtIsPhone() { return window.matchMedia("(max-width: 760px)").matches; }
  function mtTodayBlock(today, sorted) {
    const nowHM = new Date().toTimeString().slice(0, 5);
    const todays = sorted.filter((item) => String(item.date || "") === today);
    const open = todays.filter((item) => String(item.status || "") !== "Done");
    const nextIdx = open.findIndex((item) => !item.time || String(item.time) >= nowHM);
    const list = (nextIdx > 0 ? open.slice(nextIdx - 1) : open).slice(0, 3);
    const doneCount = todays.length - open.length;
    const canEdit = canViewItinerary() && (isAdmin() || canAdd("plan"));
    const rows = list.map((item, k) => {
      const tag = nextIdx >= 0 && item === open[nextIdx] ? "NEXT" : (nextIdx > 0 && k === 0 ? "NOW" : "");
      return `<div class="mt-today-row${tag === "NEXT" ? " is-next" : ""}">${canEdit ? `<button type="button" class="mt-today-tick" data-mt-done="${esc(item.id)}" aria-label="Mark done">✓</button>` : ""}<span class="mt-today-time">${item.time ? esc(displayTime(item.time)) : "Any time"}</span><span class="mt-today-what"><b>${esc(item.title)}</b>${item.place ? `<small>${esc(item.place)}</small>` : ""}</span>${tag ? `<em>${tag}</em>` : ""}</div>`;
    }).join("");
    const plan = canViewItinerary() ? `<div class="mt-today-plan"><div class="mt-today-head"><span>TODAY'S PLAN</span><button type="button" data-go="itinerary">All →</button></div>${rows || `<p class="mt-today-empty">${todays.length ? "All done for today ✓" : "Nothing planned today"}</p>`}${doneCount ? `<p class="mt-today-meta">${doneCount} of ${todays.length} done</p>` : ""}</div>` : "";
    const spendToday = state.data.expenses.filter((e) => String(e.date || "") === today).reduce((s, e) => s + Number(e.amount || 0), 0);
    const spend = canViewExpenses() ? `<button type="button" class="mt-today-spend" data-go="expenses"><span>SPENT TODAY</span><b>${money.format(spendToday)}</b><small>Trip total ${money.format(spent())}</small></button>` : "";
    const notes = (typeof stickyNotes !== "undefined" ? stickyNotes : []).filter((n) => !n.completed).length;
    const chip = notes ? `<button type="button" class="mt-today-chip" data-mt-sticky>📌 ${notes} note${notes > 1 ? "s" : ""}</button>` : "";
    const adds = `${canViewExpenses() && canAdd("expense") ? `<button type="button" class="mt-today-add primary" data-mt-add="expense">＋ Expense</button>` : ""}${canViewItinerary() && canAdd("plan") ? `<button type="button" class="mt-today-add" data-mt-add="plan">＋ Plan</button>` : ""}`;
    return `<section class="mt-today" aria-label="Today"><div class="mt-today-top"><div><span class="mt-today-kicker">${esc(displayDate(today, { weekday: "long", day: "numeric", month: "short" }))}</span><h2>Today</h2></div></div>${adds ? `<div class="mt-today-adds">${adds}</div>` : ""}${spend}${plan}</section>`;
  }
  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-mt-add]"); if (add) { showAddModal(add.dataset.mtAdd); return; }
    const done = event.target.closest("[data-mt-done]"); if (done) { done.disabled = true; done.closest(".mt-today-row")?.classList.add("leaving"); setTimeout(() => togglePlanDone(done.dataset.mtDone), 180); return; }
    if (event.target.closest("[data-mt-sticky]") && typeof openStickyPanel === "function") openStickyPanel();
  });
  let mtPhoneWas = mtIsPhone();
  addEventListener("resize", () => { const p = mtIsPhone(); if (p !== mtPhoneWas) { mtPhoneWas = p; if (state.data && state.tab === "overview") render(); } });
  /* Overview card: how much is still to settle and what has been paid back.
     Administrator always sees it (with a show/hide switch for travellers);
     travellers see it only when Settle up is shown to them. */
  function renderSettleStatusCard() {
    if (!canViewExpenses()) return "";
    const plan = settleUpPlan();
    if (!plan.total) return "";
    const shown = settleShown();
    if (!shown && !isAdmin()) return "";
    const forced = String((state.data.trip || {}).settleVisible).toUpperCase() === "TRUE";
    const pending = plan.transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const done = (state.data.settlements || []).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const paidBack = done.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const pendingList = plan.transfers.slice(0, 3).map((t) => `<li><b>${esc(t.from)}</b> pays <b>${esc(t.to)}</b><strong>${money.format(t.amount)}</strong></li>`).join("");
    const doneList = done.slice(0, 2).map((x) => `<li class="done"><em>✓ Saved</em><b>${esc(x.fromPerson)}</b> → <b>${esc(x.toPerson)}</b><strong>${money.format(x.amount)}</strong></li>`).join("");
    const visibility = !isAdmin() ? "" : forced
      ? `<div class="settle-status-vis"><span>👁 Shown to travellers</span><button type="button" data-settle-toggle="hide">Hide from travellers</button></div>`
      : shown
        ? `<div class="settle-status-vis"><span>👁 Shown to travellers (trip has ended)</span></div>`
        : `<div class="settle-status-vis off"><span>🙈 Hidden from travellers until the trip ends</span><button type="button" data-settle-toggle="show">Show to travellers</button></div>`;
    return `<section class="settle-status-card ${pending ? "pending" : "clear"}"><div class="settle-status-head"><div><span class="kicker">SETTLE UP STATUS</span><h3>${pending ? `${money.format(pending)} still to settle` : "Everyone is settled ✓"}</h3></div><button type="button" class="ghost-button" data-go="expenses">Open Settle up</button></div><div class="settle-status-nums"><div><small>STILL TO PAY</small><b>${money.format(pending)}</b></div><div><small>PAID BACK</small><b>${money.format(paidBack)}</b></div><div><small>SETTLEMENTS SAVED</small><b>${done.length}</b></div></div>${pendingList || doneList ? `<ul class="settle-status-list">${pendingList}${doneList}</ul>` : ""}${visibility}</section>`;
  }
  function renderOverview() {
    const budget = Number(state.data.trip.budget || 0), total = spent(), percent = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
    const today = localDateKey();
    const stage = tripOverviewStage(today);
    const sortedItinerary = [...state.data.itinerary].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const upcoming = (stage === "completed" ? sortedItinerary.slice(-3).reverse() : sortedItinerary.filter((item) => String(item.date || "") >= today).slice(0, 3));
    const recentExpenses = [...state.data.expenses].sort((a, b) => `${b.date || ""}${b.id || ""}`.localeCompare(`${a.date || ""}${a.id || ""}`)).slice(0, 4);
    const balance = budget - total;
    const members = visibleTripMembers();
    const photo = tripPhotoUrl(state.data.trip.photoUrl);
    const cover = photo ? `<section class="trip-cover"><img loading="lazy" decoding="async" src="${esc(photo)}" alt="Cover photo for ${esc(state.data.trip.name)}" fetchpriority="high" decoding="async" width="1600" height="900" referrerpolicy="no-referrer" decoding="async" fetchpriority="high"><div><span>TRIP PHOTO</span><h2>${esc(state.data.trip.name)}</h2><p>${esc(state.data.trip.destination)}</p>${isAdmin() ? `<button data-trip-photo>Change photo</button>` : ""}</div></section>` : (isAdmin() ? `<section class="trip-cover trip-cover-empty"><div><span>TRIP PHOTO</span><h2>Add a memorable cover photo</h2><p>Use a public HTTPS image or Google Drive sharing link.</p><button data-trip-photo>Add photo</button></div></section>` : "");
    const planQuickAction = canViewItinerary() ? `<button data-add="plan"><i>＋</i><span><b>Add plan</b><small>Itinerary</small></span></button>` : "";
    const expenseQuickAction = canViewExpenses() ? `<button data-add="expense"><i>₹</i><span><b>Add expense</b><small>Spending</small></span></button>` : "";
    const placeQuickAction = canViewPlaces() ? `<button data-add="place"><i>⌖</i><span><b>Add place</b><small>Map</small></span></button>` : "";
    const peopleQuickAction = state.travellerId && !isAdmin() ? `<button data-my-trips><i>♙</i><span><b>My trips</b><small>All assigned trips</small></span></button>` : (canViewTravellers() ? `<button data-go="people"><i>♙</i><span><b>Travellers</b><small>Passwords & access</small></span></button>` : "");
    const experienceQuickAction = canViewExperiences() ? `<button data-add="experience"><i>✍</i><span><b>Add experience</b><small>Travel journal</small></span></button>` : "";
    const printQuickAction = canPrintReports() ? `<button data-go="print"><i>▤</i><span><b>Print</b><small>Reports</small></span></button>` : "";
    const expenseStat = canViewExpenses() ? `<article class="stat"><i>₹</i><div><small>TOTAL BUDGET</small><strong>${money.format(budget)}</strong><span>${money.format(remaining())} remaining</span></div></article>` : "";
    const placeStat = canViewPlaces() ? `<article class="stat"><i>◎</i><div><small>PLACES SAVED</small><strong>${state.data.places.length}</strong><span>${state.data.places.filter((place) => place.plannedDay !== "Unplanned").length} planned</span></div></article>` : "";
    const peopleStat = canViewTravellers() ? `<article class="stat"><i>♙</i><div><small>TRIP MEMBERS</small><strong>${members.length}</strong><span>Full trip list</span></div></article>` : "";
    const notesStat = canViewExperiences() ? `<article class="stat privacy-stat"><i>✍</i><div><small>EXPERIENCE NOTES</small><strong>${state.data.experiences.length}</strong><span>Trip memories recorded</span></div></article>` : "";
    const itineraryPanelTitle = stage === "completed" ? ["JOURNEY ARCHIVE", "Latest itinerary"] : (stage === "active" ? ["REST OF THE TRIP", "Coming up next"] : ["WHAT’S NEXT", "Upcoming itinerary"]);
    const itineraryPanel = canViewItinerary() ? `<article class="panel itinerary-overview">${panelHead(itineraryPanelTitle[0], itineraryPanelTitle[1], "itinerary")}<div class="timeline">${upcoming.map((item) => `<div class="timeline-row"><span class="date"><small>${displayDate(item.date, { weekday: "short" }).toUpperCase()}</small><b>${displayDate(item.date, { day: "2-digit" })}</b></span><time>${displayTime(item.time)}</time><span><h3>${esc(item.title)}</h3><p>⌖ ${esc(item.place)}</p></span><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place)}" target="_blank" rel="noreferrer">Map ↗</a></div>`).join("") || `<p class="empty-overview">${stage === "completed" ? "No itinerary was recorded for this trip." : "No future plans added yet."}</p>`}</div></article>` : `<article class="panel feature-access-summary"><span class="kicker">YOUR ACCESS</span><h2>Trip overview</h2><p>The Administrator has selected which trip sections are available to this Traveller ID. Use the visible menu items to continue.</p></article>`;
    const expensePanels = canViewExpenses() ? `<div class="overview-side"><article class="panel spending-panel">${panelHead("TRIP EXPENSES", "Spending summary", "expenses")}<div class="spending-summary"><div class="donut" style="background:conic-gradient(var(--coral) ${percent}%,#e9edef 0)"><b>${percent}%</b></div><div class="spending-total"><small>TOTAL EXPENSES</small><strong>${money.format(total)}</strong><span>${budget ? `${Math.round(total / budget * 100)}% of the trip budget used` : "No budget set"}</span></div></div><div class="spending-breakdown"><span><small>TRIP BUDGET</small><b>${money.format(budget)}</b></span><span class="${balance < 0 ? "over-budget" : ""}"><small>${balance < 0 ? "OVER BUDGET" : "BALANCE LEFT"}</small><b>${money.format(Math.abs(balance))}</b></span></div><div class="progress" aria-label="${percent}% of budget used"><i style="width:${percent}%"></i></div></article><article class="panel recent-expenses-panel">${panelHead("LATEST PAYMENTS", "Recent spending", "expenses")}<div>${recentExpenses.map((expense) => `<div class="expense-mini overview-expense"><i>₹</i><span><b>${esc(expense.label)}</b><small>${esc(expense.category || "Expense")} · ${displayDate(expense.date, { day: "numeric", month: "short" })} · Paid by ${esc(expense.paidBy)}</small></span><strong>${money.format(expense.amount)}</strong></div>`).join("") || `<p class="empty-overview">No expenses recorded yet.</p>`}</div></article></div>` : "";
    const statsHtml = `<section class="stats"><article class="stat"><i>◫</i><div><small>TRIP LENGTH</small><strong>${nights()} nights</strong><span>${displayDate(state.data.trip.startDate, { day: "numeric", month: "short" })}–${displayDate(state.data.trip.endDate, { day: "numeric", month: "short" })}</span></div></article>${expenseStat}${placeStat}${peopleStat}${notesStat}</section>`;
    const gridHtml = `<section class="main-grid overview-grid ${canViewExpenses() ? "" : "no-expenses"}">${itineraryPanel}${expensePanels}</section>`;
    const quick = `<section class="quick-actions overview-primary-actions" aria-label="Quick actions">${planQuickAction}${expenseQuickAction}${placeQuickAction}${peopleQuickAction}${experienceQuickAction}${printQuickAction}</section>`;
    if (mtIsPhone() && stage === "active") {
      const fold = (title, sub, body, open) => body ? `<details class="mt-fold"${open ? " open" : ""}><summary><span><b>${title}</b><small>${sub}</small></span><i>⌄</i></summary><div class="mt-fold-body">${body}</div></details>` : "";
      return `${mtTodayBlock(today, sortedItinerary)}${fold("Trip status", "Journey, weather & reminders", renderJourneyStage(today))}${fold("Spending & next plans", "Budget, recent payments, coming up", gridHtml)}${fold("Settle up status", "Still to pay and paid back", renderSettleStatusCard())}${fold("Trip photo & stats", "Cover, length, places, members", cover + statsHtml)}${fold("More shortcuts", "Places, journal, print", quick)}`;
    }
    return `${renderJourneyStage(today)}${quick}${cover}${statsHtml}${renderSettleStatusCard()}${gridHtml}`;
  }

  /* ---- drag-resizable itinerary columns ---- */
  const planColumnKey = "mytrip_plan_columns_v2";
  const planColumnLabels = ["DAY", "TIME", "ITINERARY", "PLACE", "REMARK", "ACTIONS"];
  const planColumnDefaults = [76, 74, 230, 180, 250];
  const planColumnMinimums = [56, 58, 120, 100, 120];

  function planColumnWidths() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(planColumnKey) || "null"); } catch { saved = null; }
    if (!Array.isArray(saved) || saved.length !== planColumnDefaults.length) return [...planColumnDefaults];
    return saved.map((value, index) => Math.max(planColumnMinimums[index], Number(value) || planColumnDefaults[index]));
  }
  function planColumnStyle() { return planColumnWidths().map((width, index) => `--plan-col-${index}:${Math.round(width)}px`).join(";"); }
  function savePlanColumns(widths) { try { localStorage.setItem(planColumnKey, JSON.stringify(widths.map(Math.round))); } catch {} }

  function bindPlanColumnResizers() {
    const table = $(".plan-table");
    if (!table) return;
    $$(".plan-col-grip", table).forEach((grip) => {
      grip.addEventListener("pointerdown", (event) => {
        event.preventDefault(); event.stopPropagation();
        const index = Number(grip.dataset.planCol);
        const widths = planColumnWidths();
        const startX = event.clientX, startWidth = widths[index];
        grip.setPointerCapture(event.pointerId);
        table.classList.add("resizing");
        const move = (moveEvent) => {
          widths[index] = Math.max(planColumnMinimums[index], startWidth + (moveEvent.clientX - startX));
          table.style.setProperty(`--plan-col-${index}`, `${Math.round(widths[index])}px`);
        };
        const finish = () => {
          grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", finish); grip.removeEventListener("pointercancel", finish);
          table.classList.remove("resizing"); savePlanColumns(widths);
        };
        grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", finish); grip.addEventListener("pointercancel", finish);
      });
      grip.addEventListener("dblclick", (event) => { event.stopPropagation(); savePlanColumns([...planColumnDefaults]); render(); });
    });
  }

  /* ---- drag-resizable expense columns ---- */
  const expenseColumnKey = "mytrip_expense_columns_v1";
  const expenseColumnLabels = ["DESCRIPTION", "DATE", "CATEGORY", "PAID BY", "AMOUNT", "ACTIONS"];
  const expenseColumnDefaults = [240, 110, 120, 130, 110];
  const expenseColumnMinimums = [160, 70, 80, 90, 80];
  function expenseColumnWidths() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(expenseColumnKey) || "null"); } catch { saved = null; }
    if (!Array.isArray(saved) || saved.length !== expenseColumnDefaults.length) return [...expenseColumnDefaults];
    return saved.map((value, index) => Math.max(expenseColumnMinimums[index], Number(value) || expenseColumnDefaults[index]));
  }
  function expenseColumnStyle() { return expenseColumnWidths().map((width, index) => `--exp-col-${index}:${Math.round(width)}px`).join(";"); }
  function saveExpenseColumns(widths) { try { localStorage.setItem(expenseColumnKey, JSON.stringify(widths.map(Math.round))); } catch {} }
  function bindExpenseColumnResizers() {
    const table = $(".expense-action-table");
    if (!table) return;
    $$(".expense-col-grip", table).forEach((grip) => {
      grip.addEventListener("pointerdown", (event) => {
        event.preventDefault(); event.stopPropagation();
        const index = Number(grip.dataset.expCol);
        const widths = expenseColumnWidths();
        const startX = event.clientX, startWidth = widths[index];
        grip.setPointerCapture(event.pointerId);
        table.classList.add("resizing");
        const move = (moveEvent) => {
          widths[index] = Math.max(expenseColumnMinimums[index], startWidth + (moveEvent.clientX - startX));
          table.style.setProperty(`--exp-col-${index}`, `${Math.round(widths[index])}px`);
        };
        const finish = () => {
          grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", finish); grip.removeEventListener("pointercancel", finish);
          table.classList.remove("resizing"); saveExpenseColumns(widths);
        };
        grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", finish); grip.addEventListener("pointercancel", finish);
      });
      grip.addEventListener("dblclick", (event) => { event.stopPropagation(); saveExpenseColumns([...expenseColumnDefaults]); render(); });
    });
  }

  /* ---- print options for the itinerary sheet ---- */
  const printWidthKey = "mytrip_print_plan_scale_v1";
  const printWrapKey = "mytrip_print_plan_wrap_v1";
  const printLayoutKey = "mytrip_print_plan_layout_v1";
  const printAlignKey = "mytrip_print_plan_align_v1";
  function printPlanScale() {
    const stored = Number(localStorage.getItem(printWidthKey));
    return Number.isFinite(stored) && stored >= 7 && stored <= 13 ? stored : 9;
  }
  function printPlanWrap() { return localStorage.getItem(printWrapKey) !== "off"; }
  function printPlanLayout() { return localStorage.getItem(printLayoutKey) === "landscape" ? "landscape" : "portrait"; }
  function printPlanAlign() {
    const value = localStorage.getItem(printAlignKey);
    return ["left", "center", "right"].includes(value) ? value : "left";
  }
  /* ---- readable text size, remembered per browser ----
     Applies to the whole content area, so the itinerary table, expenses,
     places and every other view scale together. */
  const textSizeKey = "mytrip_text_scale_v1";
  const textSizeSteps = [100, 110, 125, 140, 160];

  function textScale() {
    const stored = Number(localStorage.getItem(textSizeKey));
    return textSizeSteps.includes(stored) ? stored : 100;
  }

  function applyTextScale() {
    const scale = textScale();
    const zoom = scale === 100 ? "" : String(scale / 100);
    [".content", "#modal > section", "#stickyPanel", "#floatingStickyLayer"].forEach((selector) => {
      const element = $(selector);
      if (element) element.style.zoom = zoom;
    });
    if ($("#textSizeValue")) $("#textSizeValue").textContent = `${scale}%`;
    $$(".modal-text-size b").forEach((label) => { label.textContent = `${scale}%`; });
    $$(".modal-text-size [data-modal-text=\"-1\"]").forEach((button) => { button.disabled = scale === textSizeSteps[0]; });
    $$(".modal-text-size [data-modal-text=\"1\"]").forEach((button) => { button.disabled = scale === textSizeSteps[textSizeSteps.length - 1]; });
    if ($("#textSizeDown")) $("#textSizeDown").disabled = scale === textSizeSteps[0];
    if ($("#textSizeUp")) $("#textSizeUp").disabled = scale === textSizeSteps[textSizeSteps.length - 1];
  }

  function addModalTextSizeControl() {
    const header = $("#modal > section > header");
    if (!header || header.querySelector(".modal-text-size")) { applyTextScale(); return; }
    const control = document.createElement("span");
    control.className = "text-size-control modal-text-size";
    control.innerHTML = '<button type="button" data-modal-text="-1" aria-label="Smaller text">A−</button><b></b><button type="button" data-modal-text="1" aria-label="Larger text">A+</button>';
    header.insertBefore(control, $("#closeModal"));
    control.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => stepTextScale(Number(button.dataset.modalText))));
    applyTextScale();
  }

  function stepTextScale(direction) {
    const index = textSizeSteps.indexOf(textScale());
    const next = textSizeSteps[Math.min(textSizeSteps.length - 1, Math.max(0, index + direction))];
    try { localStorage.setItem(textSizeKey, String(next)); } catch {}
    applyTextScale();
    toast(`Text size ${next}%`);
  }

  function applyPrintPlanSettings() {
    document.body.style.setProperty("--print-plan-font", `${printPlanScale()}px`);
    document.body.style.setProperty("--print-plan-align", printPlanAlign());
    document.body.classList.toggle("print-plan-nowrap", !printPlanWrap());
    document.body.dataset.printLayout = printPlanLayout();
    let rule = document.getElementById("printLayoutRule");
    if (!rule) { rule = document.createElement("style"); rule.id = "printLayoutRule"; document.head.appendChild(rule); }
    rule.textContent = `@page { size: A4 ${printPlanLayout()}; margin: 12mm; }`;
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#modal .pro-sheet [data-cancel], #proRulesForm [data-cancel], #travellerPlanForm [data-cancel]")) { e.preventDefault(); e.stopPropagation(); return closeModal(); }
    const pf = e.target.closest("[data-pro-feature]"); if (pf) { e.preventDefault(); return showUpgradeSheet(pf.dataset.proFeature); }
    const ctx = state.planCtx; const ap = e.target.closest("[data-account-plan]"); const rt = e.target.closest("#proRulesToggle");
    if (!ctx || (!ap && !rt)) return; e.preventDefault(); e.stopPropagation();
    const auth = () => adminAuth(ctx.administratorSecret);
    if (rt) {
      let on = false; try { if (!ctx.demoMode) on = (await api("getPlanSettings", auth())).proEnforced === true; } catch (error) { return toast(error.message, true); }
      showModal("Free & Pro rules", `<form class="modal-form" id="proRulesForm"><div class="security-note traveller-note"><i>◆</i><p><b>Launch mode (Off):</b> every traveller gets every feature free.<br><b>On:</b> Pro features are locked for Free travellers and show an Upgrade screen. Administrators always have everything.</p></div><label class="pro-switch-row"><span>Lock Pro features for Free travellers</span><select name="enabled"><option value="false" ${on ? "" : "selected"}>Off · everything free</option><option value="true" ${on ? "selected" : ""}>On · lock Pro features</option></select></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>`);
      $("#proRulesForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const enabled = new FormData(ev.target).get("enabled") === "true";
        try { if (!ctx.demoMode) await api("setProEnforced", { ...auth(), enabled }); toast(enabled ? "Pro features are now locked for Free travellers" : "Launch mode: everything free"); loadTravellerAccounts(ctx.administratorSecret, ctx.trips, ctx.demoMode); } catch (error) { toast(error.message, true); } });
      return;
    }
    const t = (ctx.travellers || []).find((x) => x.travellerId === ap.dataset.accountPlan); if (!t) return;
    const cur = t.planSaved || t.plan || "free";
    showModal("Traveller plan", `<form class="modal-form" id="travellerPlanForm"><div class="profile-id-banner"><span>TRAVELLER USERNAME</span><b>${esc(t.travellerId)}</b><small>${esc(t.name)}</small></div><label>Plan<select name="plan"><option value="free" ${cur === "pro" ? "" : "selected"}>Free</option><option value="pro" ${cur === "pro" ? "selected" : ""}>✦ Pro</option></select></label><label>Pro valid till <small>(optional — leave empty for no expiry)</small><input type="date" name="planExpires" value="${esc(t.planExpires || "")}"></label><p class="form-help">After the expiry date the account returns to Free automatically. Their trips and data are never deleted.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save plan</button></div></form>`);
    $("#travellerPlanForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target); const plan = fd.get("plan"); const planExpires = fd.get("planExpires") || "";
      try { if (ctx.demoMode) { t.plan = t.planSaved = plan; t.planExpires = plan === "pro" ? planExpires : ""; renderTravellerAccounts(ctx.travellers, ctx.trips, ctx.administratorSecret, true); } else { await api("setTravellerPlan", { ...auth(), travellerId: t.travellerId, plan, planExpires }); loadTravellerAccounts(ctx.administratorSecret, ctx.trips, ctx.demoMode); } toast(plan === "pro" ? `${t.name} is now Pro` : `${t.name} is now Free`); } catch (error) { toast(error.message, true); } });
  }, true);
  const pwField = (name, label) => `<label>${label}<span class="pw-wrap"><input name="${name}" type="password" minlength="6" required autocomplete="new-password"><button type="button" class="pw-eye" data-pw-eye aria-label="Show password">👁</button></span></label>`;
  document.addEventListener("click", async (e) => {
    const eye = e.target.closest("[data-pw-eye]"); if (eye) { e.preventDefault(); const inp = eye.parentElement.querySelector("input"); inp.type = inp.type === "password" ? "text" : "password"; return; }
    if (e.target.closest("#myPwForm [data-cancel], #ownerPwForm [data-cancel]")) { e.preventDefault(); e.stopPropagation(); return closeModal(); }
    const ctx = state.pwCtx; const mine = e.target.closest("[data-change-my-pw]"); const own = e.target.closest("[data-owner-reset-pw]");
    if (!ctx || (!mine && !own)) return; e.preventDefault(); e.stopPropagation();
    const me = ctx.traveller.travellerId;
    const check = (fd, a, b2) => { const p = String(fd.get(a) || ""); if (p.length < 6) throw new Error("Password must be at least 6 characters."); if (p !== String(fd.get(b2) || "")) throw new Error("The two new passwords do not match."); return p; };
    if (mine) {
      showModal("Change my password", `<form class="modal-form" id="myPwForm"><div class="profile-id-banner"><span>USERNAME</span><b>${esc(me)}</b></div><label>Current password<span class="pw-wrap"><input name="current" type="password" required autocomplete="current-password"><button type="button" class="pw-eye" data-pw-eye aria-label="Show password">👁</button></span></label>${pwField("p1", "New password")}${pwField("p2", "Repeat new password")}<p class="form-help">At least 6 characters. You will use it next time you sign in on any device.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save password</button></div></form>`);
      $("#myPwForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target);
        try { const p = check(fd, "p1", "p2"); if (!ctx.demoMode) await api("changeMyPassword", { username: me, travellerId: me, currentPassword: fd.get("current"), newPassword: p }); ctx.pin = p; state.pin = p; closeModal(); toast("Password changed. Use the new one next time."); } catch (error) { toast(error.message, true); } });
      return;
    }
    let list; try { list = ctx.demoMode ? { ownedTrips: 1, travellers: [{ travellerId: "DEMO2", name: "Demo traveller", trips: ["Demo trip"] }] } : await api("listTripOwnerTravellers", { username: me, travellerId: me, password: ctx.pin, pin: ctx.pin }); } catch (error) { return toast(error.message, true); }
    if (!list.ownedTrips) return toast("Only the creator of a trip can reset its travellers' passwords. You have not created any trip yet.", true);
    if (!list.travellers.length) return toast("No other travellers are assigned to the trips you created.", true);
    showModal("Reset a traveller's password", `<form class="modal-form" id="ownerPwForm"><div class="security-note traveller-note"><i>◆</i><p>As the <b>trip creator</b>, you can set a new password for travellers in your own trips. Tell them the new password personally.</p></div><label>Traveller<select name="target">${list.travellers.map((t) => `<option value="${esc(t.travellerId)}">${esc(t.name)} · ${esc(t.travellerId)} — ${esc(t.trips.join(", "))}</option>`).join("")}</select></label>${pwField("p1", "New password")}${pwField("p2", "Repeat new password")}<div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Reset password</button></div></form>`);
    $("#ownerPwForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target);
      try { const p = check(fd, "p1", "p2"); if (!ctx.demoMode) await api("tripOwnerResetPin", { username: me, travellerId: me, password: ctx.pin, pin: ctx.pin, targetTravellerId: fd.get("target"), newPassword: p }); closeModal(); toast(`Password reset for ${fd.get("target")}`); } catch (error) { toast(error.message, true); } });
  }, true);
  /* ---- v4.48.0: checklist · receipts · CSV ---- */
  const ckDone = (i) => String(i.done).toUpperCase() === "TRUE";
  function renderChecklist() {
    const items = state.data.checklist || (state.data.checklist = []);
    const me = String(state.currentUser || ""); const f = state.ckFilter || "all";
    const done = items.filter(ckDone).length; const pct = items.length ? Math.round(done / items.length * 100) : 0;
    const shown = items.filter((i) => f === "open" ? !ckDone(i) : f === "mine" ? String(i.assignee || "") === me || !i.assignee : true)
      .sort((a, b) => (ckDone(a) - ckDone(b)) || String(a.day || "9").localeCompare(String(b.day || "9")) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const people = [...new Set(visibleTripMembers().map((m) => String(m.name || "").trim()).filter(Boolean))];
    const chip = (k, l) => `<button type="button" class="ck-chip${f === k ? " is-on" : ""}" data-ck-filter="${k}">${l}</button>`;
    const rows = shown.map((i) => `<li class="ck-row${ckDone(i) ? " is-done" : ""}"><button type="button" class="ck-box" data-ck-toggle="${esc(i.id)}" aria-label="${ckDone(i) ? "Mark not done" : "Mark done"}">${ckDone(i) ? "✓" : ""}</button><span class="ck-text"><b>${esc(i.text)}</b><small>${esc(i.assignee || "Everyone")}${ckDone(i) && i.doneBy ? ` · done by ${esc(i.doneBy)}` : ""}</small></span>${i.day ? `<em class="ck-day">${esc(displayDate(i.day, { day: "numeric", month: "short" }))}</em>` : ""}${isAdmin() || String(i.createdBy || "") === me ? `<button type="button" class="ck-del" data-ck-del="${esc(i.id)}" aria-label="Delete">✕</button>` : ""}</li>`).join("");
    return `${heading("TRAVEL TOGETHER", "Checklist", "Packing and to-dos for everyone in this trip.")}
      <section class="ck-wrap"><div class="ck-progress"><b>${done} of ${items.length} done</b><span><i style="width:${pct}%"></i></span></div>
      <form id="ckAddForm" class="ck-add"><input name="text" placeholder="Add an item — e.g. Power bank" maxlength="200" required><select name="assignee"><option value="">Everyone</option>${people.map((p) => `<option>${esc(p)}</option>`).join("")}</select><input name="day" type="date" aria-label="Day (optional)"><button type="submit">＋ Add</button></form>
      <div class="ck-chips">${chip("all", "All")}${chip("open", "To do")}${chip("mine", "Mine")}</div>
      ${rows ? `<ul class="ck-list">${rows}</ul>` : `<p class="ck-empty">Nothing here yet. Add the first item above.</p>`}</section>`;
  }
  function receiptBlock(id) {
    const e = (state.data.expenses || []).find((x) => String(x.id) === String(id)); if (!e) return "";
    const can = canEditRecords("Expenses");
    return `<div class="receipt-block" data-receipt-block="${esc(id)}"><span class="kicker">RECEIPT</span>${e.receiptUrl ? `<a href="${esc(e.receiptUrl)}" target="_blank" rel="noopener"><img src="${esc(e.receiptUrl)}" alt="Receipt photo" referrerpolicy="no-referrer" loading="lazy"></a>` : `<p class="receipt-empty">🧾 No receipt photo yet</p>`}${can ? `<div class="receipt-actions"><label>📷 Camera<input type="file" accept="image/*" capture="environment" data-receipt-file="${esc(id)}" hidden></label><label>🖼 Gallery<input type="file" accept="image/*" data-receipt-file="${esc(id)}" hidden></label>${e.receiptUrl ? `<button type="button" data-receipt-remove="${esc(id)}">Remove</button>` : ""}</div>` : ""}</div>`;
  }
  function injectReceiptBlock(id) {
    setTimeout(() => { const host = document.querySelector("#modal form, #modal .modal-body, #modal .modal-card"); if (!host || host.querySelector("[data-receipt-block]")) return; const html = receiptBlock(id); if (!html) return; const act = host.querySelector(".form-actions"); if (act) act.insertAdjacentHTML("beforebegin", html); else host.insertAdjacentHTML("beforeend", html); }, 0);
  }
  function refreshReceiptBlock(id) { const el = document.querySelector(`[data-receipt-block="${CSS.escape(String(id))}"]`); if (el) el.outerHTML = receiptBlock(id); render(); }
  function csvDownload(kind) {
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    let head, rows;
    if (kind === "expenses") { head = ["Date", "Description", "Category", "Paid by", "Amount", "Notes", "Receipt"]; rows = [...state.data.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => [e.date, e.label, e.category, e.paidBy, Number(e.amount || 0), e.notes, e.receiptUrl]); }
    else if (kind === "itinerary") { head = ["Date", "Time", "Title", "Place", "Notes", "Status"]; rows = [...state.data.itinerary].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((i) => [i.date, i.time, i.title, i.place, i.notes, i.status]); }
    else { head = ["Item", "For", "Day", "Done", "Done by"]; rows = (state.data.checklist || []).map((i) => [i.text, i.assignee || "Everyone", i.day, ckDone(i) ? "Yes" : "No", i.doneBy]); }
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${String((state.data.trip || {}).name || "MyTrip").replace(/[^A-Za-z0-9]+/g, "-")}-${kind}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast(`${rows.length} rows downloaded`);
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-ck-filter],[data-ck-toggle],[data-ck-del],[data-receipt-open],[data-receipt-remove],[data-csv]"); if (!t || !state.data) return;
    e.preventDefault(); e.stopPropagation();
    const list = state.data.checklist || (state.data.checklist = []);
    try {
      if (t.dataset.ckFilter) { state.ckFilter = t.dataset.ckFilter; return render(); }
      if (t.dataset.ckToggle) { const i = list.find((x) => String(x.id) === t.dataset.ckToggle); if (!i) return; const nd = !ckDone(i); i.done = nd ? "TRUE" : "FALSE"; i.doneBy = nd ? String(state.currentUser || "") : ""; render(); try { navigator.vibrate && navigator.vibrate(8); } catch {} if (!state.demoMode) await api("updateChecklistItem", authPayload({ id: i.id, record: { done: i.done, doneBy: i.doneBy } })); return; }
      if (t.dataset.ckDel) { const k = list.findIndex((x) => String(x.id) === t.dataset.ckDel); if (k < 0) return; const [gone] = list.splice(k, 1); render(); if (!state.demoMode) await api("deleteChecklistItem", authPayload({ id: gone.id })); return toast("Item deleted"); }
      if (t.dataset.receiptOpen) { showModal("Receipt", `<div class="modal-form">${receiptBlock(t.dataset.receiptOpen)}<div class="form-actions"><button type="button" data-cancel onclick="this.closest('.modal')&&0">Close</button></div></div>`); const c = document.querySelector("#modal [data-cancel]"); if (c) c.addEventListener("click", closeModal); return; }
      if (t.dataset.receiptRemove) { const id = t.dataset.receiptRemove; if (!state.demoMode) await api("removeExpenseReceipt", authPayload({ id })); const x = state.data.expenses.find((r) => String(r.id) === id); if (x) x.receiptUrl = ""; refreshReceiptBlock(id); return toast("Receipt removed"); }
      if (t.dataset.csv) return csvDownload(t.dataset.csv);
    } catch (error) { toast(error.message, true); }
  }, true);
  document.addEventListener("submit", async (e) => {
    if (!e.target || e.target.id !== "ckAddForm") return; e.preventDefault(); e.stopPropagation();
    const fd = new FormData(e.target); const text = String(fd.get("text") || "").trim(); if (!text) return;
    const rec = { id: "CHK-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, assignee: String(fd.get("assignee") || ""), day: String(fd.get("day") || ""), done: "FALSE", doneBy: "", createdBy: String(state.currentUser || ""), createdAt: new Date().toISOString() };
    (state.data.checklist || (state.data.checklist = [])).push(rec); render(); setTimeout(() => { const i = document.querySelector("#ckAddForm input[name=text]"); if (i) i.focus(); }, 30);
    try { if (!state.demoMode) await api("addChecklistItem", authPayload({ record: rec })); } catch (error) { toast(error.message, true); }
  }, true);
  document.addEventListener("change", async (e) => {
    const inp = e.target.closest && e.target.closest("[data-receipt-file]"); if (!inp || !inp.files || !inp.files[0]) return;
    const id = inp.dataset.receiptFile; const block = inp.closest("[data-receipt-block]"); if (block) block.classList.add("is-busy");
    try {
      let file = await shrinkPhoto(inp.files[0], 1600, 700000);
      const x = state.data.expenses.find((r) => String(r.id) === String(id));
      if (state.demoMode) { if (x) x.receiptUrl = URL.createObjectURL(file); }
      else { const res = await api("uploadExpenseReceipt", authPayload({ id, file: { name: file.name || "receipt.jpg", type: file.type || "image/jpeg", data: await fileToBase64(file) } })); if (x) x.receiptUrl = (res && res.receiptUrl) || x.receiptUrl; }
      refreshReceiptBlock(id); toast("Receipt saved");
    } catch (error) { if (block) block.classList.remove("is-busy"); toast(error.message, true); }
  });
  /* ---- v4.49.0: re-split · currency · join link ---- */
  function shareUnits() { const g = splitGroups(); return g.length ? g : visibleTripMembers().map((m) => [String(m.name || "").trim()]).filter((x) => x[0]); }
  function unitLabel(g) { return g.length > 1 ? g.join(" + ") : g[0]; }
  function openResplit() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const units = shareUnits(); const exps = [...state.data.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!exps.length) return toast("No expenses yet", true);
    const days = [...new Set(exps.map((e) => String(e.date || "").slice(0, 10)).filter(Boolean))];
    showModal("Re-split past expenses", `<form class="modal-form" id="resplitForm"><span class="kicker">APPLY TO</span><div class="rs-scope"><label><input type="radio" name="scope" value="all" checked><span>Whole trip</span></label><label><input type="radio" name="scope" value="day"><span>One day</span></label><label><input type="radio" name="scope" value="pick"><span>Pick expenses</span></label></div><label class="rs-day hidden">Day<select name="day">${days.map((d) => `<option value="${esc(d)}">${esc(displayDate(d, { weekday: "short", day: "numeric", month: "short" }))}</option>`).join("")}</select></label><div class="rs-pick hidden">${exps.map((e) => `<label><input type="checkbox" name="pick" value="${esc(e.id)}"><span>${esc(displayDate(e.date, { day: "numeric", month: "short" }))} · ${esc(e.label || e.category)} · <b>${money.format(Number(e.amount || 0))}</b></span></label>`).join("")}</div><span class="kicker">SHARED BY</span><div class="rs-units">${units.map((g, k) => `<label><span>${esc(unitLabel(g))}</span><input type="checkbox" name="unit" value="${k}" checked></label>`).join("")}</div><p class="rs-preview form-help"></p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Update expenses</button></div></form>`);
    const form = $("#resplitForm");
    const pickIds = () => { const fd = new FormData(form); const sc = fd.get("scope"); return sc === "day" ? exps.filter((e) => String(e.date).slice(0, 10) === fd.get("day")).map((e) => String(e.id)) : sc === "pick" ? fd.getAll("pick").map(String) : exps.map((e) => String(e.id)); };
    const value = () => { const on = new FormData(form).getAll("unit").map(Number); return on.length === units.length ? "" : on.flatMap((k) => units[k]).join("|"); };
    const upd = () => { const fd = new FormData(form); form.querySelector(".rs-day").classList.toggle("hidden", fd.get("scope") !== "day"); form.querySelector(".rs-pick").classList.toggle("hidden", fd.get("scope") !== "pick"); const ids = pickIds(); const n = fd.getAll("unit").length; const sum = exps.filter((e) => ids.includes(String(e.id))).reduce((s, e) => s + Number(e.amount || 0), 0); form.querySelector(".rs-preview").innerHTML = n ? `<b>${ids.length} expense${ids.length === 1 ? "" : "s"}</b> (${money.format(sum)}) will be shared by <b>${n}</b> of ${units.length} · about ${money.format(Math.round(sum / n))} each. Settle up recalculates automatically.` : "Choose at least one share."; };
    form.addEventListener("change", upd); upd();
    const cx = form.querySelector("[data-cancel]"); if (cx) cx.addEventListener("click", closeModal);
    form.addEventListener("submit", async (ev) => { ev.preventDefault(); const ids = pickIds(); if (!ids.length) return toast("Choose at least one expense", true); if (!new FormData(form).getAll("unit").length) return toast("Choose at least one share", true); const v = value();
      try { if (!state.demoMode) await api("resplitExpenses", authPayload({ ids, sharedBy: v })); state.data.expenses.forEach((e) => { if (ids.includes(String(e.id))) e.sharedBy = v; }); closeModal(); render(); toast(`${ids.length} expense${ids.length === 1 ? "" : "s"} re-split`); } catch (error) { toast(error.message, true); } });
  }
  function openCurrencySetup() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const t = state.data.trip;
    showModal("Second currency", `<form class="modal-form" id="currencyForm"><p class="form-help">For foreign trips. Travellers can then enter amounts in this currency; MyTrip saves the ₹ value with the rate locked to each expense.</p><label>Currency code<select name="altCurrency"><option value="">None — ₹ only</option>${["USD", "EUR", "GBP", "THB", "AED", "SGD", "MYR", "LKR", "NPR", "BTN", "IDR", "VND", "JPY", "AUD"].map((c) => `<option ${String(t.altCurrency || "") === c ? "selected" : ""}>${c}</option>`).join("")}</select></label><label>1 unit = how many ₹?<input name="altRate" type="number" step="0.0001" min="0" value="${esc(t.altRate || "")}" placeholder="e.g. 2.43"></label><p class="form-help">Use your card or exchange rate. Each expense can still change it.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>`);
    const cx = document.querySelector("#currencyForm [data-cancel]"); if (cx) cx.addEventListener("click", closeModal);
    $("#currencyForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target); const trip = { altCurrency: String(fd.get("altCurrency") || ""), altRate: String(fd.get("altRate") || "") };
      if (trip.altCurrency && !(Number(trip.altRate) > 0)) return toast("Enter the ₹ rate for 1 " + trip.altCurrency, true);
      try { if (!state.demoMode) await api("updateTrip", authPayload({ trip })); Object.assign(state.data.trip, trip); closeModal(); render(); toast(trip.altCurrency ? `${trip.altCurrency} turned on for this trip` : "Back to ₹ only"); } catch (error) { toast(error.message, true); } });
  }
  function injectCurrencyBlock(form) {
    const t = (state.data && state.data.trip) || {}; const cur = String(t.altCurrency || ""); if (!cur || !form || form.querySelector(".fx-block")) return;
    const amt = form.querySelector('input[name="amount"]'); if (!amt) return;
    const ex = (state.data.expenses || []).find((e) => form.dataset.recordId && String(e.id) === form.dataset.recordId) || {};
    const on = String(ex.currency || "") === cur && Number(ex.foreignAmount) > 0;
    const wrap = document.createElement("div"); wrap.className = "fx-block";
    wrap.innerHTML = `<div class="fx-toggle"><label><input type="radio" name="fxMode" value="inr" ${on ? "" : "checked"}><span>₹ INR</span></label><label><input type="radio" name="fxMode" value="alt" ${on ? "checked" : ""}><span>${esc(cur)}</span></label></div><div class="fx-fields ${on ? "" : "hidden"}"><label>${esc(cur)} amount<input name="foreignAmount" type="number" inputmode="decimal" step="0.01" min="0" value="${on ? esc(ex.foreignAmount) : ""}"></label><label>Rate ₹<input name="fxRate" type="number" step="0.0001" min="0" value="${esc(on ? ex.fxRate : t.altRate || "")}"></label><input type="hidden" name="currency" value="${on ? esc(cur) : ""}"><p class="fx-result"></p></div>`;
    const host = amt.closest("label") || amt; host.insertAdjacentElement("afterend", wrap);
    const calc = () => { const alt = wrap.querySelector('input[name="fxMode"]:checked').value === "alt"; wrap.querySelector(".fx-fields").classList.toggle("hidden", !alt); amt.readOnly = alt; wrap.querySelector('input[name="currency"]').value = alt ? cur : "";
      if (!alt) { wrap.querySelector('input[name="foreignAmount"]').value = ""; wrap.querySelector(".fx-result").textContent = ""; return; }
      const f = Number(wrap.querySelector('input[name="foreignAmount"]').value || 0), r = Number(wrap.querySelector('input[name="fxRate"]').value || 0);
      if (f > 0 && r > 0) { amt.value = (Math.round(f * r * 100) / 100).toString(); wrap.querySelector(".fx-result").innerHTML = `≈ <b>${money.format(f * r)}</b> · rate locked to this expense`; } else wrap.querySelector(".fx-result").textContent = "Enter amount and rate";
    };
    wrap.addEventListener("input", calc); wrap.addEventListener("change", calc); calc();
  }
  new MutationObserver(() => { document.querySelectorAll('#modal form[data-form="expense"], #modal form#planPaymentForm').forEach(injectCurrencyBlock); }).observe(document.getElementById("modal") || document.body, { childList: true, subtree: true });
  async function loadJoinAdmin() {
    const box = document.getElementById("joinAdmin"); if (!box) return;
    let d; try { d = state.demoMode ? { invite: {}, requests: [] } : await api("listJoinRequests", authPayload({})); } catch (error) { box.innerHTML = `<span class="kicker">JOIN BY LINK</span><p class="form-help">Update the backend to v4.22.0 to use join links.</p>`; return; }
    const inv = d.invite || {}; const p = new URLSearchParams({ join: inv.inviteCode || "" }); if (!validApiUrl(config.API_URL) && apiUrlReady()) p.set("api", apiUrl);
    const link = `${location.origin}${location.pathname}?${p.toString()}`;
    const req = (d.requests || []).map((r) => `<li><span><b>${esc(r.name)}</b><small>${esc(r.travellerId)}${r.phone ? " · " + esc(r.phone) : ""}</small></span><button type="button" data-join-ok="${esc(r.id)}">Allow</button><button type="button" class="ghost" data-join-no="${esc(r.id)}" aria-label="Reject">✕</button></li>`).join("");
    box.innerHTML = `<span class="kicker">JOIN BY LINK · NO PASSWORD TO SHARE</span>${inv.inviteCode ? `<div class="copy-field"><input value="${esc(link)}" readonly><button type="button" data-join-copy="${esc(link)}">Copy</button></div><div class="join-row"><a class="join-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Join our trip "${state.data.trip.name}" on MyTrip: ${link}`)}">✆ Send on WhatsApp</a><button type="button" data-join-off>Switch off</button></div><small>New people can ${inv.inviteRole === "Viewer" ? "view" : "view and add"} · expires ${esc(String(inv.inviteExpires || "").slice(0, 10) || "—")} · you approve each one</small>` : `<p class="form-help">Create a link anyone can open to request to join. They set their own password; you approve them.</p><div class="join-row"><select id="joinRole"><option value="Editor">Can view + add</option><option value="Viewer">View only</option></select><button type="button" data-join-create>Create link</button></div>`}${req ? `<span class="kicker">WAITING FOR YOU</span><ul class="join-list">${req}</ul>` : ""}`;
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-resplit],[data-currency-setup],[data-join-create],[data-join-off],[data-join-copy],[data-join-ok],[data-join-no]"); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.matches("[data-resplit]")) return openResplit();
    if (t.matches("[data-currency-setup]")) return openCurrencySetup();
    if (t.dataset.joinCopy) { try { await navigator.clipboard.writeText(t.dataset.joinCopy); } catch {} return toast("Join link copied"); }
    try {
      if (t.matches("[data-join-create]")) await api("createTripInvite", authPayload({ role: ($("#joinRole") || {}).value || "Editor" }));
      else if (t.matches("[data-join-off]")) await api("disableTripInvite", authPayload({}));
      else if (t.dataset.joinOk) { const r = await api("approveJoinRequest", authPayload({ id: t.dataset.joinOk })); toast(`${(r && r.travellerId) || "Traveller"} added to this trip`); }
      else if (t.dataset.joinNo) { await api("rejectJoinRequest", authPayload({ id: t.dataset.joinNo })); toast("Request rejected"); }
      loadJoinAdmin();
    } catch (error) { toast(error.message, true); }
  }, true);
  async function showJoinByInvite(code) {
    let info; try { info = await api("getInviteInfo", { code }); } catch (error) { return toast(error.message, true); }
    showModal(`Join ${info.tripName || "this trip"}`, `<form class="modal-form" id="joinForm"><p class="form-help">${esc(info.destination || "")}${info.startDate ? " · " + esc(displayDate(info.startDate)) : ""}. Fill this once. The Administrator will approve you, then sign in with your username and password.</p><label>Your name<input name="name" required maxlength="80" autocomplete="name"></label><label>Username <small>(optional — we'll make one)</small><input name="username" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" autocomplete="username"></label><label>Phone <small>(optional)</small><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>${pwField("p1", "Choose a password")}${pwField("p2", "Repeat password")}<div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Request to join</button></div></form>`);
    const c = document.querySelector("#joinForm [data-cancel]"); if (c) c.addEventListener("click", closeModal);
    $("#joinForm").addEventListener("submit", async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target); const p = String(fd.get("p1") || "");
      if (p.length < 6) return toast("Password must be at least 6 characters.", true); if (p !== String(fd.get("p2") || "")) return toast("The two passwords do not match.", true);
      const btn = ev.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
      try { const r = await api("joinTripByInvite", { code, name: fd.get("name"), username: fd.get("username"), phone: fd.get("phone"), password: p });
        showModal("Request sent ✓", `<div class="modal-form"><p>Your username is <b>${esc(r.travellerId)}</b>. Please note it down.</p><p class="form-help">You can sign in after the Administrator approves you for <b>${esc(r.tripName || "the trip")}</b>.</p><div class="form-actions"><button type="button" data-cancel>OK</button></div></div>`); const ok = document.querySelector("#modal [data-cancel]"); if (ok) ok.addEventListener("click", closeModal);
        history.replaceState(null, "", location.pathname);
      } catch (error) { btn.disabled = false; btn.textContent = "Request to join"; toast(error.message, true); } });
  }
  /* ---- v4.51.0: change history + backups (admin) ---- */
  function agoText(iso) { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (!(s >= 0)) return ""; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago"; return displayDate(String(iso).slice(0, 10), { day: "numeric", month: "short" }) + " " + new Date(iso).toTimeString().slice(0, 5); }
  async function openHistory() {
    showModal("Change history", `<div class="modal-form"><p class="form-help">Loading…</p></div>`);
    let rows; try { rows = state.demoMode ? [{ details: "Added Expenses — Dinner · ₹4280", createdBy: "Sarada", createdAt: new Date().toISOString(), action: "addExpense" }] : await api("listActivity", authPayload({ limit: 200 })); } catch (error) { return showModal("Change history", `<div class="modal-form"><p class="form-help">${esc(/Unknown action/i.test(error.message) ? "Update the backend to v4.23.0 to see history." : error.message)}</p><div class="form-actions"><button type="button" data-hx-close>Close</button></div></div>`); }
    const icon = (a) => /^delete|^remove|^reject|^archive/.test(a) ? ["✕", "hx-del"] : /^add|^upload|^create|^approve/.test(a) ? ["＋", "hx-add"] : ["✎", "hx-edit"];
    const list = (rows || []).map((r) => { const [g, c] = icon(String(r.action || "")); return `<li><i class="${c}">${g}</i><span><b>${esc(r.details || r.action)}</b><small>${esc(r.createdBy || "—")} · ${esc(agoText(r.createdAt))}</small></span></li>`; }).join("");
    showModal("Change history", `<div class="modal-form"><p class="form-help">Latest ${(rows || []).length} changes in this trip. Only the Administrator sees this.</p>${list ? `<ul class="hx-list">${list}</ul>` : `<p class="form-help">No changes recorded yet.</p>`}<div class="form-actions"><button type="button" data-hx-close>Close</button></div></div>`);
  }
  async function openBackups() {
    showModal("Backups", `<div class="modal-form"><p class="form-help">Loading…</p></div>`);
    let d; try { d = state.demoMode ? { nightly: true, folderUrl: "#", backups: [] } : await api("listBackups", authPayload({})); } catch (error) { return showModal("Backups", `<div class="modal-form"><p class="form-help">${esc(/Unknown action/i.test(error.message) ? "Update the backend to v4.23.0 and press Run All to turn on backups." : error.message)}</p><div class="form-actions"><button type="button" data-hx-close>Close</button></div></div>`); }
    const items = (d.backups || []).map((f) => `<li><i class="hx-add">▤</i><span><b>${esc(f.name)}</b><small>${esc(agoText(f.createdAt))}</small></span><a href="${esc(f.url)}" target="_blank" rel="noopener">Open</a></li>`).join("");
    showModal("Backups", `<div class="modal-form"><div class="bk-status ${d.nightly ? "on" : "off"}"><b>${d.nightly ? "● Nightly backup is ON" : "○ Nightly backup is OFF"}</b><small>${d.nightly ? "A full copy of the Sheet is saved every night around 2 AM. The latest 14 are kept." : "Press Run All in Apps Script once to switch it on."}</small></div>${items ? `<ul class="hx-list">${items}</ul>` : `<p class="form-help">No backups yet.</p>`}<p class="form-help"><b>To restore:</b> open a backup, check it, then in Apps Script set it as the MyTrip spreadsheet (or copy the rows you need back). Your live data is never overwritten automatically.</p><div class="form-actions"><a class="ghost-link" href="${esc(d.folderUrl || "#")}" target="_blank" rel="noopener">Open folder</a><button type="button" data-backup-now>Back up now</button><button type="button" data-hx-close>Close</button></div></div>`);
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-history],[data-backups],[data-backup-now],[data-hx-close]"); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.matches("[data-hx-close]")) return closeModal();
    if (!isAdmin()) return toast("Administrator access required", true);
    if (t.matches("[data-history]")) return openHistory();
    if (t.matches("[data-backups]")) return openBackups();
    t.disabled = true; t.textContent = "Backing up…";
    try { const r = state.demoMode ? { name: "Demo" } : await api("backupNow", authPayload({})); toast(`Backup saved · ${r.name}`); openBackups(); } catch (error) { t.disabled = false; t.textContent = "Back up now"; toast(error.message, true); }
  }, true);
  /* ---- v4.52.0 part 4: undo · cover · sync pill · share day ---- */
  function heroCover() {
    const u = String(((state.data || {}).trip || {}).photoUrl || "").trim();
    if (!/^https:\/\//.test(u)) return { cls: "", style: "", img: "" };
    const safe = u.replace(/['"()\\]/g, "");
    /* If the cover photo link is broken or blocked, drop the cover styling
       instead of leaving a tall, empty dark panel behind the heading. */
    const onerror = "this.remove();var h=this.closest('.journey-stage-hero');if(h)h.classList.remove('has-cover')";
    return { cls: " has-cover", style: "", img: `<img class="journey-stage-hero-img" src="${esc(safe)}" alt="" aria-hidden="true" loading="lazy" onerror="${onerror}">` };
  }
  let syncPillTimer = 0;
  function syncPill(mode) {
    let el = document.getElementById("syncPill");
    if (!mode) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "syncPill"; el.className = "sync-pill"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.dataset.mode = mode;
    el.innerHTML = mode === "refreshing" ? "<i></i>Updating…" : mode === "done" ? "✓ Up to date" : "☁ Offline · saved copy";
    clearTimeout(syncPillTimer); if (mode === "done") syncPillTimer = setTimeout(() => syncPill(""), 1600);
  }
  const pendingDeletes = new Map();
  function undoableDelete(sheet, collection, id, label) {
    const list = state.data[collection] || []; const index = list.findIndex((x) => String(x.id) === String(id));
    if (index < 0) return;
    const [item] = list.splice(index, 1);
    hydrateShell(); render(); updatePrintArea();
    try { navigator.vibrate && navigator.vibrate(10); } catch {}
    const key = sheet + ":" + id;
    const commit = async () => { pendingDeletes.delete(key); hideUndoBar(key); if (state.demoMode) return; try { await api("deleteRecord", authPayload({ sheet, id })); } catch (error) { (state.data[collection] || []).splice(Math.min(index, (state.data[collection] || []).length), 0, item); hydrateShell(); render(); toast(error.message, true); } };
    const timer = setTimeout(commit, 5000);
    pendingDeletes.set(key, { timer, commit, payload: authPayload({ sheet, id }) });
    showUndoBar(key, label, () => { clearTimeout(timer); pendingDeletes.delete(key); const arr = state.data[collection] || (state.data[collection] = []); arr.splice(Math.min(index, arr.length), 0, item); hydrateShell(); render(); updatePrintArea(); toast("Restored"); });
  }
  function showUndoBar(key, label, onUndo) {
    let el = document.getElementById("undoBar");
    if (!el) { el = document.createElement("div"); el.id = "undoBar"; el.className = "undo-bar"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.dataset.key = key; el.innerHTML = `<span>${esc(label)}</span><button type="button">Undo</button><i></i>`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    el.querySelector("button").onclick = () => { onUndo(); el.classList.remove("show"); };
  }
  function hideUndoBar(key) { const el = document.getElementById("undoBar"); if (el && el.dataset.key === key) el.classList.remove("show"); }
  window.addEventListener("pagehide", () => {
    if (!pendingDeletes.size) return;
    const q = readOfflineQueue(); pendingDeletes.forEach((p) => { clearTimeout(p.timer); q.push({ action: "deleteRecord", payload: p.payload, at: Date.now() }); }); pendingDeletes.clear(); writeOfflineQueue(q);
  });
  async function shareDayImage() {
    try {
      const t = state.data.trip || {}; const today = localDateKey();
      const plans = canViewItinerary() ? state.data.itinerary.filter((x) => String(x.date).slice(0, 10) === today).sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 6) : [];
      const spentToday = canViewExpenses() ? state.data.expenses.filter((x) => String(x.date || "").slice(0, 10) === today).reduce((a, x) => a + Number(x.amount || 0), 0) : 0;
      const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, "#0F6E6A"); grad.addColorStop(1, "#0A3F3D"); g.fillStyle = grad; g.fillRect(0, 0, W, H);
      const F = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      g.fillStyle = "rgba(255,255,255,.75)"; g.font = F(800, 30); g.fillText(("MYTRIP · " + displayDate(today, { weekday: "long", day: "numeric", month: "long" })).toUpperCase(), 80, 130);
      g.fillStyle = "#fff"; g.font = F(800, 84); const title = String(t.name || t.destination || "Our trip"); g.fillText(title.length > 20 ? title.slice(0, 19) + "…" : title, 80, 240);
      g.font = F(600, 38); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(String(t.destination || ""), 80, 300);
      let y = 420; g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.roundRect ? g.roundRect(60, y - 60, W - 120, Math.max(160, plans.length * 110 + 60), 36) : g.rect(60, y - 60, W - 120, Math.max(160, plans.length * 110 + 60)); g.fill();
      if (!plans.length) { g.fillStyle = "#fff"; g.font = F(600, 40); g.fillText("A free day — enjoy!", 110, y + 20); y += 120; }
      plans.forEach((p) => { g.fillStyle = "#9FE3D6"; g.font = F(800, 34); g.fillText(String(p.time || "—").slice(0, 5), 110, y); g.fillStyle = "#fff"; g.font = F(700, 40); const s = String(p.title || ""); g.fillText(s.length > 30 ? s.slice(0, 29) + "…" : s, 260, y); if (p.place) { g.fillStyle = "rgba(255,255,255,.7)"; g.font = F(500, 30); const pl = String(p.place); g.fillText(pl.length > 38 ? pl.slice(0, 37) + "…" : pl, 260, y + 42); } y += 110; });
      if (canViewExpenses()) { g.fillStyle = "rgba(255,255,255,.75)"; g.font = F(800, 30); g.fillText("SPENT TODAY", 80, H - 200); g.fillStyle = "#fff"; g.font = F(800, 72); g.fillText(money.format(Math.round(spentToday)), 80, H - 120); }
      g.fillStyle = "rgba(255,255,255,.55)"; g.font = F(700, 28); g.textAlign = "right"; g.fillText("made with MyTrip", W - 80, H - 70);
      const blob = await new Promise((r) => c.toBlob(r, "image/png")); const file = new File([blob], `MyTrip-${today}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title }); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast("Day card downloaded");
    } catch (error) { if (error && error.name === "AbortError") return; toast("Could not create the image on this device", true); }
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-share-day]")) { e.preventDefault(); e.stopPropagation(); shareDayImage(); } }, true);
  function showExpensePrintSheet() {
    const people = [...new Set([...visibleTripMembers().map((m) => m.name), ...state.data.expenses.map((e) => e.paidBy).filter(Boolean)])];
    const who = state.printPerson || "";
    const xpLock = proLocked("personPrint");
    const chip = (v, l) => `<button type="button" data-xp-person="${esc(v)}" class="${who === v ? "on" : ""}${v && xpLock ? " locked" : ""}">${v && xpLock ? "🔒 " : ""}${l}</button>`;
    const seg = (attr, list, cur) => list.map(([v, l]) => `<button type="button" ${attr}="${v}" class="${cur === v ? "on" : ""}">${l}</button>`).join("");
    showModal("Print expenses", `<div class="xp-sheet"><div class="xp-group"><span class="xp-label">Whose expenses</span><div class="xp-chips">${chip("", "Everyone")}${chip("__each", "Person-wise (each separately)")}${people.map((n) => chip(n, esc(n))).join("")}</div></div><div class="xp-line"><span>Text size</span><span class="xp-step"><button type="button" data-xp-size="-1" aria-label="Smaller">−</button><b>${printPlanScale()}pt</b><button type="button" data-xp-size="1" aria-label="Larger">＋</button></span></div><div class="xp-line"><span>Wrap long text</span><button type="button" class="xp-switch${printPlanWrap() ? " on" : ""}" data-xp-wrap>${printPlanWrap() ? "On" : "Off"}</button></div><div class="xp-line"><span>Page layout</span><span class="xp-seg">${seg("data-xp-layout", [["portrait", "▯ Portrait"], ["landscape", "▭ Landscape"]], printPlanLayout())}</span></div><div class="xp-line"><span>Alignment</span><span class="xp-seg">${seg("data-xp-align", [["left", "Left"], ["center", "Centre"], ["right", "Right"]], printPlanAlign())}</span></div><div class="xp-actions"><button type="button" class="primary" data-print="expenses" data-xp-go>▤ Print</button><button type="button" data-cancel>Cancel</button></div></div>`);
  }
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-xp-go]"); if (go) { e.preventDefault(); e.stopPropagation(); closeModal(); setTimeout(() => printReport("expenses"), 80); return; }
    if (e.target.closest(".xp-sheet [data-cancel]")) { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
    const t = e.target.closest("[data-xp-person],[data-xp-size],[data-xp-wrap],[data-xp-layout],[data-xp-align]"); if (!t) return;
    e.preventDefault(); e.stopPropagation(); const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
    if (t.hasAttribute("data-xp-person")) { if (t.dataset.xpPerson && !requirePro("personPrint")) return; state.printPerson = t.dataset.xpPerson; }
    else if (t.dataset.xpSize) set(printWidthKey, String(Math.min(13, Math.max(7, printPlanScale() + Number(t.dataset.xpSize)))));
    else if (t.hasAttribute("data-xp-wrap")) set(printWrapKey, printPlanWrap() ? "off" : "on");
    else if (t.dataset.xpLayout) set(printLayoutKey, t.dataset.xpLayout);
    else if (t.dataset.xpAlign) set(printAlignKey, t.dataset.xpAlign);
    applyPrintPlanSettings(); printAreaDirty = true; showExpensePrintSheet();
  }, true);
  function stepPrintWidth(direction) {
    const next = Math.min(13, Math.max(7, printPlanScale() + direction));
    try { localStorage.setItem(printWidthKey, String(next)); } catch {}
    applyPrintPlanSettings(); render();
  }
  function togglePrintWrap() {
    try { localStorage.setItem(printWrapKey, printPlanWrap() ? "off" : "on"); } catch {}
    applyPrintPlanSettings(); render();
    toast(printPlanWrap() ? "Printed rows will wrap onto several lines" : "Printed rows kept to one line each");
  }
  function setPrintLayout(value) { try { localStorage.setItem(printLayoutKey, value); } catch {} applyPrintPlanSettings(); render(); }
  function setPrintAlign(value) { try { localStorage.setItem(printAlignKey, value); } catch {} applyPrintPlanSettings(); render(); }

  async function deletePlanRow(id) {
    if (!isAdmin()) return toast("Administrator access is required to delete an itinerary row", true);
    state.planRowDeleteId = "";
    return undoableDelete("Itinerary", "itinerary", id, "Itinerary row deleted");
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet: "Itinerary", id }));
      state.data.itinerary = state.data.itinerary.filter((row) => String(row.id) !== String(id));
      state.planRowDeleteId = ""; render(); hydrateShell(); updatePrintArea(); toast("Itinerary row deleted for everyone");
    } catch (error) { toast(error.message, true); }
  }

  const planCategories = ["Travel", "Stay", "Food", "Sightseeing", "Activity", "Other"];
  const planStatuses = ["To book", "Booked", "Paid", "Done"];
  const planCategoryTint = { Travel: "#3b8ccc", Stay: "#7a61e0", Food: "#e2647c", Sightseeing: "#1da483", Activity: "#e3a029", Other: "#7a8997" };

  function planSortValue(item) {
    return [String(item.date || ""), String(Number(item.sortOrder || 0)).padStart(6, "0"), String(item.time || "~")].join("|");
  }

  /** Renumbers a day (or the whole trip) into clock order and saves it. */
  async function sortPlansByTime(date = "") {
    if (!canEditRecords("Itinerary")) return toast("Itinerary editing is not allowed for this account", true);
    const days = date ? [date] : [...new Set(state.data.itinerary.map((row) => row.date).filter(Boolean))];
    const changed = [];
    days.forEach((day) => {
      state.data.itinerary
        .filter((row) => row.date === day)
        .sort((a, b) => String(a.time || "~").localeCompare(String(b.time || "~")))
        .forEach((row, index) => {
          const order = (index + 1) * 10;
          if (Number(row.sortOrder || 0) !== order) { row.sortOrder = order; changed.push(row); }
        });
    });
    if (!changed.length) return toast("Already in time order");
    render();
    if (await persistPlanOrder(changed)) { updatePrintArea(); toast(date ? "Day sorted by time" : "Every day sorted by time"); }
  }
  function sortedPlans() {
    return [...state.data.itinerary].sort((a, b) => planSortValue(a).localeCompare(planSortValue(b)));
  }
  /* An expense created from an itinerary row carries the row id in its own id,
     so the two stay linked without any extra sheet column. */
  const planExpensePrefix = "PLANPAY-";
  function expenseForPlan(item) {
    return (state.data.expenses || []).find((expense) => String(expense.id) === planExpensePrefix + String(item.id));
  }
  function planPaymentTag(item) {
    const expense = expenseForPlan(item);
    if (!expense) return "";
    return `<span class="plan-paid-tag" title="Recorded in the Expenses tab"><b>${money.format(Number(expense.amount || 0))}</b><small>${esc(expense.paidBy || "Not specified")}</small></span>`;
  }

  /** Records who paid for a plan row — the payment itself lives in Expenses. */
  function showPlanPayment(id) {
    const item = state.data.itinerary.find((row) => String(row.id) === String(id));
    if (!item) return toast("Itinerary row not found", true);
    if (!canViewExpenses() || !canAdd("expense")) return toast("Expense access is not enabled for this account", true);
    const existing = expenseForPlan(item);
    const payers = [...new Set([...visibleTripMembers().map((member) => member.name), state.currentUser].filter(Boolean))];
    const categoryMap = { Travel: "Travel", Stay: "Stay", Food: "Food", Sightseeing: "Activities", Activity: "Activities", Other: "Other" };
    const category = categoryMap[item.category] || "Other";
    const categories = ["Food", "Stay", "Travel", "Local travel", "Activities", "Shopping", "Other"];
    showModal(existing ? "Update payment" : "Record payment", `<form class="modal-form" id="planPaymentForm"><div class="security-note traveller-note"><i>₹</i><p>This payment is saved in the <b>Expenses</b> tab, so the budget and the traveller-wise totals stay correct. The itinerary row only shows who paid.</p></div><label>Expense description<input name="label" maxlength="180" value="${esc((existing && existing.label) || item.title)}" required></label><div class="form-row"><label>Amount (₹)<input name="amount" type="number" min="1" step="0.01" value="${esc((existing && existing.amount) || item.cost || "")}" required></label><label>Date<input name="date" type="date" value="${esc((existing && existing.date) || item.date)}" required></label></div><div class="form-row"><label>Paid by<select name="paidBy" required>${payers.map((payer) => `<option${((existing && existing.paidBy) || state.currentUser) === payer ? " selected" : ""}>${esc(payer)}</option>`).join("")}</select></label><label>Category<select name="category">${categories.map((value) => `<option${((existing && existing.category) || category) === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="form-actions">${existing && isAdmin() ? `<button type="button" id="removePlanPayment" class="danger-action">Remove payment</button>` : ""}<button type="button" data-cancel>Cancel</button><button type="submit">${existing ? "Save payment" : "Record payment"}</button></div></form>`);
    const form = $("#planPaymentForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const record = { id: planExpensePrefix + item.id, ...values, amount: Number(values.amount), createdBy: state.currentUser };
      const submit = form.querySelector("button[type=submit]");
      submit.disabled = true; submit.textContent = "Saving…";
      try {
        if (!state.demoMode) {
          if (existing) await api("updateRecord", authPayload({ sheet: "Expenses", id: record.id, record: values }));
          else await api("addExpense", authPayload({ record }));
          if (String(item.status || "") !== "Paid") await api("updateRecord", authPayload({ sheet: "Itinerary", id: item.id, record: { status: "Paid" } }));
        }
        if (existing) Object.assign(existing, record); else state.data.expenses.push(record);
        item.status = "Paid";
        closeModal(); render(); hydrateShell(); updatePrintArea(); toast(`Payment saved · ${record.paidBy}`);
      } catch (error) { submit.disabled = false; submit.textContent = existing ? "Save payment" : "Record payment"; toast(error.message, true); }
    });
    if ($("#removePlanPayment")) $("#removePlanPayment").addEventListener("click", async () => {
      try {
        if (!state.demoMode) {
          await api("deleteRecord", authPayload({ sheet: "Expenses", id: existing.id }));
          await api("updateRecord", authPayload({ sheet: "Itinerary", id: item.id, record: { status: "Booked" } }));
        }
        state.data.expenses = state.data.expenses.filter((expense) => String(expense.id) !== String(existing.id));
        item.status = "Booked";
        closeModal(); render(); hydrateShell(); updatePrintArea(); toast("Payment removed from Expenses");
      } catch (error) { toast(error.message, true); }
    });
    $("[data-cancel]").addEventListener("click", closeModal);
  }

  function planCost(item) { return Number(item.cost) > 0 ? Number(item.cost) : 0; }


  /** One itinerary row, reusable so a single row can be patched in place. */
  function planRowMarkup(item, previous, all) {
    const canEdit = canEditRecords("Itinerary");
    const firstOfDay = !previous || previous.date !== item.date;
    const dayBreak = "";
      if (String(state.planRowEditId) === String(item.id)) return dayBreak + renderPlanRowEditor(item);
      if (String(state.planRowDeleteId) === String(item.id)) return dayBreak + `<div class="plan-row plan-row-deleting"><span class="plan-delete-message"><b>Delete “${esc(item.title)}”?</b><small>${displayDate(item.date, { weekday: "short", day: "numeric", month: "short" })}${item.time ? " · " + esc(displayTime(item.time)) : ""} · removed for everyone</small></span><span class="plan-row-actions"><button class="delete" data-confirm-plan-delete="${esc(item.id)}">Yes, delete row</button><button type="button" data-cancel-plan-delete>Keep row</button></span></div>`;

      const done = String(item.status || "") === "Done";
      const tick = canEdit ? `<button class="plan-tick${done ? " on" : ""}" data-toggle-plan-done="${esc(item.id)}" title="${done ? "Mark as not done" : "Mark as done"}" aria-pressed="${done}">${done ? "☑" : "☐"}</button>` : "";
      const paid = expenseForPlan(item);
      const payButton = canViewExpenses() && canAdd("expense") ? `<button class="plan-pay${paid ? " on" : ""}" data-plan-pay="${esc(item.id)}" title="${paid ? "Update who paid" : "Record who paid (saved in Expenses)"}">₹</button>` : "";
      const actions = `${tick}${payButton}${canEdit ? `<button class="row-edit" data-row-edit-plan="${esc(item.id)}">Row edit</button>` : ""}${canAdd("plan") ? `<button data-duplicate-plan="${esc(item.id)}" title="Duplicate this row">⧉</button>` : ""}${canEdit ? `<button data-edit data-sheet="Itinerary" data-id="${esc(item.id)}">Edit</button>` : ""}${isAdmin() ? `<button class="delete" data-row-delete-plan="${esc(item.id)}">Delete</button>` : ""}`;
      const mapLink = item.place ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place)}" target="_blank" rel="noreferrer">⌖ ${esc(item.place)}</a>` : `<span class="plan-muted">Not set</span>`;
      const category = item.category && planCategories.includes(item.category) ? item.category : "";
      const chips = `${category ? `<em class="plan-chip" style="--chip:${planCategoryTint[category]}">${esc(category)}</em>` : ""}${item.status ? `<em class="plan-status status-${esc(String(item.status).toLowerCase().replace(/\s+/g, "-"))}">${esc(item.status)}</em>` : ""}`;
      const meta = `${item.bookingRef ? `<small class="plan-ref">REF ${esc(item.bookingRef)}</small>` : ""}${planCost(item) && !paid ? `<small class="plan-cost">Est ${money.format(planCost(item))}</small>` : ""}${planPaymentTag(item)}`;
      const dayRowIds = all.filter((row) => row.date === item.date).map((row) => String(row.id));
      const positionInDay = dayRowIds.indexOf(String(item.id));
      const handle = canEdit ? `<span class="plan-move"><i class="plan-drag" data-plan-drag="${esc(item.id)}" title="Drag to reorder inside this day">⠿</i><button type="button" data-move-plan="${esc(item.id)}" data-direction="-1"${positionInDay === 0 ? " disabled" : ""} title="Move up in this day">↑</button><button type="button" data-move-plan="${esc(item.id)}" data-direction="1"${positionInDay === dayRowIds.length - 1 ? " disabled" : ""} title="Move down in this day">↓</button></span>` : "";
      const photoThumb = item.photoUrl ? `<button type="button" class="plan-photo-thumb" data-plan-photo="${esc(item.id)}" title="Preview photo"><img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async"></button>` : "";
      return `<div class="plan-row${firstOfDay ? " day-start" : ""}" draggable="false" data-plan-row="${esc(item.id)}" data-plan-date="${esc(item.date)}"><span class="plan-cell-day">${handle}<span>${firstOfDay ? `<small>${displayDate(item.date, { weekday: "short" }).toUpperCase()}</small><b>${displayDate(item.date, { day: "2-digit", month: "short" })}</b>` : `<em class="plan-same-day">same day</em>`}</span></span><span class="plan-cell-time">${item.time ? esc(displayTime(item.time)) : "Any time"}</span><span class="plan-cell-title">${photoThumb}<b>${esc(item.title)}</b>${chips ? `<span class="plan-chips">${chips}</span>` : ""}</span><span class="plan-cell-place">${mapLink}${meta ? `<span class="plan-meta">${meta}</span>` : ""}</span><span class="plan-cell-remark">${esc(item.notes || "—")}</span><span class="plan-row-actions">${actions}</span></div>`;
    }


  function renderItinerary() {
    const all = sortedPlans();
    const days = [...new Set(all.map((item) => item.date).filter(Boolean))];
    if (state.planDayFilter && !days.includes(state.planDayFilter)) state.planDayFilter = "";
    const items = state.planDayFilter ? all.filter((item) => item.date === state.planDayFilter) : all;
    const canEdit = canEditRecords("Itinerary");
    const plannedTotal = all.reduce((sum, item) => sum + planCost(item), 0);

    const filterRow = `<div class="filter-row plan-filter-row"><button class="${state.planDayFilter ? "" : "active"}" data-plan-day="">All days</button>${days.map((date, index) => `<button class="${state.planDayFilter === date ? "active" : ""}" data-plan-day="${esc(date)}">Day ${index + 1} · ${displayDate(date, { day: "numeric", month: "short" })}</button>`).join("")}${state.planDayFilter ? `<span class="plan-day-actions">${canPrintReports() ? `<button type="button" data-print-day="${esc(state.planDayFilter)}">▤ Print this day</button>` : ""}${canAdd("plan") ? `<button type="button" data-add-plan-row="${esc(state.planDayFilter)}">＋ Add row to this day</button>` : ""}</span>` : ""}</div>`;

    const rows = items.map((item, index) => planRowMarkup(item, items[index - 1], all)).join("");

    const newRow = canAdd("plan")
      ? (state.planAddDate
        ? renderPlanRowEditor({ id: "", date: state.planAddDate, time: "", title: "", place: "", notes: "", category: "", status: "To book", bookingRef: "", cost: "" }, true)
        : `<div class="plan-add-row"><button type="button" data-add-plan-row="${esc(state.planDayFilter || state.data.trip.startDate || "")}">＋ Add itinerary row</button><span>Type straight into the row — no dialog needed.</span></div>`)
      : "";

    return `${heading("DAY BY DAY", "Trip itinerary", "Add, edit, reorder and delete rows in place. Use the header grips to size columns.", "plan")}${filterRow}${canAdd("plan") ? quickAddBar() : ""}${planMapOpen() ? planMapSlot(items) : ""}<section class="table-panel plan-record-panel"><div class="table-headline"><div><span class="kicker">DAY PLANNER</span><h2>Itinerary table</h2><p>${all.length} ${all.length === 1 ? "plan" : "plans"} across ${days.length} ${days.length === 1 ? "day" : "days"}${plannedTotal ? " · " + money.format(plannedTotal) + " planned cost" : ""}.</p></div><span class="plan-table-tools"><button type="button" class="plan-tool${planMapOpen() ? " active" : ""}" data-plan-map title="Show the day on a map">⌖ ${planMapOpen() ? "Hide map" : "Map"}</button><button type="button" class="plan-tool plan-view-toggle" data-plan-view title="Switch between compact cards and the full table">${planWideView() ? "☰ Card view" : "▦ Table view"}</button><button type="button" class="plan-tool" data-sort-plan-time="${esc(state.planDayFilter || "")}" title="Put rows in clock order">⏱ Sort by time</button>${printOptionsMenu(`<label class="plan-print-line"><span>Column widths</span><button type="button" class="plan-tool" data-reset-plan-columns>⇔ Reset</button></label>`)}${canPrintReports() ? `<button class="plan-tool primary-tool" data-print="itinerary">▤ Print itinerary</button>` : ""}</span></div><div class="plan-table${planWideView() ? " plan-table-wide" : ""}" style="${planColumnStyle()}"><div class="plan-table-header">${planColumnLabels.map((label, index) => `<span>${label}${index < planColumnLabels.length - 1 ? `<i class="plan-col-grip" data-plan-col="${index}" title="Drag to resize this column"></i>` : ""}</span>`).join("")}</div>${rows || `<div class="plan-empty-row"><b>No itinerary added yet</b><p>Add the first plan for this trip.</p></div>`}${newRow}</div></section>`;
  }

  function renderExperiences() {
    if (!canViewExperiences()) return `<section class="feature-locked"><i>✍</i><h2>Experiences hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const all = [...state.data.experiences].sort((a, b) => `${a.date}${a.createdAt || ""}`.localeCompare(`${b.date}${b.createdAt || ""}`));
    const filter = state.experienceTypeFilter || "all";
    const experiences = filter === "all" ? all : all.filter((item) => (filter === "learning" ? item.noteType === "Learning" : item.noteType !== "Learning"));
    const learningCount = all.filter((item) => item.noteType === "Learning").length;
    const filterChips = `<div class="xp-group experience-type-filter"><div class="xp-chips">${[["all", `All (${all.length})`], ["memory", `✍ Memories (${all.length - learningCount})`], ["learning", `💡 Learnings (${learningCount})`]].map(([v, l]) => `<button type="button" data-experience-type-filter="${v}" class="${filter === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
    const experienceCards = experiences.map((item, index) => {
      const learning = item.noteType === "Learning";
      return `<article class="experience-card${learning ? " learning-note" : ` colour-${index % 5}`}"><div class="experience-date"><small>${displayDate(item.date, { weekday: "short" }).toUpperCase()}</small><b>${displayDate(item.date, { day: "2-digit" })}</b><span>${displayDate(item.date, { month: "short" })}</span></div>${item.photoUrl ? `<button type="button" class="experience-photo-thumb" data-experience-photo="${esc(item.id)}" title="View photo"><img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async"></button>` : ""}<div class="experience-copy">${learning ? `<em class="experience-learning-badge">💡 Learning for next time</em>` : ""}<span class="experience-place">${item.place ? `⌖ ${esc(item.place)}` : "TRIP MEMORY"}${item.visibility === "Only me" ? `<em class="experience-private-badge">🔒 Only me</em>` : ""}</span><p>${formatNote(item.note)}</p><strong>✍ Written by ${esc(item.writer || "Trip member")}</strong></div><span class="record-actions">${canEditRecords("ExperienceNotes") ? `<button class="edit-control" data-edit data-sheet="ExperienceNotes" data-id="${esc(item.id)}">Edit</button>` : ""}${isAdmin() ? `<button class="delete-control" data-delete data-sheet="ExperienceNotes" data-id="${esc(item.id)}">Delete</button>` : ""}</span></article>`;
    }).join("");
    return `<section class="experience-section experience-page"><div class="experience-hero"><div><span class="kicker">COLOURFUL TRAVEL JOURNAL</span><h2>Experiences worth remembering</h2><p>Keep every place, feeling and story together in a separate journal.</p></div>${canAdd("experience") ? `<button class="primary" data-add="experience">＋ Add experience</button>` : ""}</div><div class="experience-summary"><article><i>✍</i><div><small>MEMORIES</small><b>${all.length}</b></div></article><article><i>⌖</i><div><small>PLACES</small><b>${new Set(all.map((item) => item.place).filter(Boolean)).size}</b></div></article><article><i>☀</i><div><small>WRITERS</small><b>${new Set(all.map((item) => item.writer).filter(Boolean)).size}</b></div></article><article><i>💡</i><div><small>LEARNINGS</small><b>${learningCount}</b></div></article></div>${filterChips}<div class="experience-list">${experienceCards || `<div class="empty-experiences"><b>${filter === "all" ? "No experience notes yet" : `No ${filter === "learning" ? "learnings" : "memories"} yet`}</b><p>${filter === "all" ? "Add the first colourful memory from this trip." : "Try the other filter, or add one with the button above."}</p></div>`}</div></section>`;
  }
  document.addEventListener("click", (event) => { const b = event.target.closest("[data-experience-type-filter]"); if (b) { state.experienceTypeFilter = b.dataset.experienceTypeFilter; render(); } });

  function photoUploadsEnabled() {
    return state.permissions.photoUploadsEnabled !== false && String(state.data.trip.photoUploadsEnabled || "TRUE").toUpperCase() !== "FALSE";
  }

  function mayManagePhoto(photo) {
    return isAdmin() || Boolean(state.travellerId && String(photo.uploaderId || "").toUpperCase() === String(state.travellerId).toUpperCase());
  }

  function mayReplacePhoto(photo) {
    return isAdmin() || (mayManagePhoto(photo) && photoUploadsEnabled() && Number(state.permissions.photoUploadLimit || 0) > 0);
  }

  function renderPhotos() {
    const photos = [...state.data.photos].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const enabled = photoUploadsEnabled();
    const limit = Number(state.permissions.photoUploadLimit || 0);
    const count = Number(state.permissions.photoUploadCount || 0);
    const remainingPhotos = Math.max(0, Number(state.permissions.photoUploadRemaining || 0));
    const mayAdd = isAdmin() || state.permissions.addPhotos === true;
    const accessText = isAdmin()
      ? `${enabled ? "Traveller uploads are enabled" : "Traveller uploads are disabled"}. Administrator uploads remain available.`
      : (!state.travellerId ? "Shared trip access can view photos but cannot add them." : (enabled && limit > 0 ? `${count} of ${limit} photo slots used · ${remainingPhotos} remaining` : "Photo addition is disabled for your account in this trip."));
    const cards = photos.map((photo, index) => `<article class="trip-photo-card colour-${index % 6}"><button class="trip-photo-open" data-open-photo="${esc(photo.id)}" aria-label="View photo"><img src="${esc(tripPhotoUrl(photo.photoUrl, 800))}" loading="lazy" decoding="async" alt="${esc(photo.caption || `Trip photo by ${photo.uploadedBy || "Trip member"}`)}" width="900" height="600" loading="lazy" decoding="async" fetchpriority="low"></button><div><span class="photo-number">PHOTO ${String(index + 1).padStart(2, "0")}</span><h3>${esc(photo.caption || "A trip memory")}</h3><p>📷 ${esc(photo.uploadedBy || "Trip member")} · ${displayDate(String(photo.createdAt || "").slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</p>${mayManagePhoto(photo) ? `<span class="trip-photo-actions"><button data-edit-caption="${esc(photo.id)}">Edit caption</button>${mayReplacePhoto(photo) ? `<button data-replace-photo="${esc(photo.id)}">Replace</button>` : ""}<button class="delete" data-delete-photo="${esc(photo.id)}">Delete</button></span>` : ""}</div></article>`).join("");
    const albumUrl = String((state.data.trip || {}).photoAlbumUrl || "").trim();
    const albumPanel = `<section class="photo-album-panel"><div class="photo-album-head"><div><span class="kicker">SHARED ALBUM</span><h3>Google Photos album</h3><p>Everyone with the link can view, and add their own photos &amp; videos if Collaborate is turned on.</p></div>${isAdmin() ? `<button type="button" class="ghost-button" data-manage-photo-album>${albumUrl ? "Replace link" : "Add album link"}</button>` : ""}</div>${albumUrl ? `<a class="photo-album-open" target="_blank" rel="noopener" href="${esc(albumUrl)}">📷 Open the shared album ↗</a>` : `<p class="photo-album-empty">${isAdmin() ? "No shared album linked yet — create one in the Google Photos app (name it, turn on Collaborate), then paste the link here." : "The Administrator hasn’t linked a shared album for this trip yet."}</p>`}</section>`;
    return `<section class="trip-photos-page"><div class="trip-photos-hero"><div><span class="kicker">COLOURFUL TRIP GALLERY</span><h2>Photos from the journey</h2><p>Keep selected trip photographs together. Images are stored in Google Drive and photo details are stored in Google Sheets.</p></div><div class="trip-photos-hero-actions">${isAdmin() ? `<button class="photo-access-toggle ${enabled ? "enabled" : "disabled"}" data-toggle-photo-uploads>${enabled ? "Disable traveller uploads" : "Enable traveller uploads"}</button>` : ""}${mayAdd ? `<button class="primary" data-add-trip-photo>＋ Add photo</button>` : ""}</div></div>${albumPanel}<div class="photo-access-strip ${enabled ? "enabled" : "disabled"}"><i>${enabled ? "●" : "○"}</i><div><b>${isAdmin() ? "Administrator photo control" : "Your photo allowance"}</b><p>${esc(accessText)}</p></div>${!isAdmin() && state.travellerId ? `<strong>${count}/${limit}</strong>` : `<strong>${photos.length} photos</strong>`}</div><div class="trip-photo-grid">${cards || `<div class="empty-photo-gallery"><i>▣</i><b>No trip photos yet</b><p>${mayAdd ? "Add the first colourful memory from this journey." : "An authorised traveller or the Administrator can add the first photo."}</p></div>`}</div></section>`;
  }
  function manageTripPhotoAlbum() {
    if (!isAdmin()) return toast("Global Administrator access required", true);
    const trip = state.data.trip || {};
    const suggestedName = `${trip.name || "Trip"} (${displayDate(trip.startDate, { day: "numeric", month: "short" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })})`;
    showModal("Shared Google Photos album", `<form class="modal-form" id="photoAlbumForm"><div class="security-note"><i>📷</i><p>In the Google Photos app: create a new album named something like "<b>${esc(suggestedName)}</b>", turn on <b>Collaborate</b> so travellers can add their own photos, then copy its share link here.</p></div><label>Album share link<input name="photoAlbumUrl" type="url" maxlength="1000" value="${esc(trip.photoAlbumUrl || "")}" placeholder="https://photos.app.goo.gl/…" required></label><div class="form-actions">${trip.photoAlbumUrl ? `<button type="button" id="removePhotoAlbum" class="danger-link">Remove link</button>` : ""}<button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>`);
    $('[data-cancel]').addEventListener("click", closeModal);
    if ($("#removePhotoAlbum")) $("#removePhotoAlbum").addEventListener("click", async () => {
      try { if (!state.demoMode) await api("updateTrip", authPayload({ trip: { photoAlbumUrl: "" } })); state.data.trip.photoAlbumUrl = ""; closeModal(); render(); toast("Album link removed"); } catch (error) { toast(error.message, true); }
    });
    $("#photoAlbumForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const photoAlbumUrl = String(event.currentTarget.elements.photoAlbumUrl.value || "").trim();
      const button = event.submitter; if (button) { button.disabled = true; button.textContent = "Saving…"; }
      try {
        if (!state.demoMode) await api("updateTrip", authPayload({ trip: { photoAlbumUrl } }));
        state.data.trip.photoAlbumUrl = photoAlbumUrl; closeModal(); render(); toast("Album link saved");
      } catch (error) { if (button) { button.disabled = false; button.textContent = "Save"; } toast(error.message, true); }
    });
  }
  document.addEventListener("click", (event) => { if (event.target.closest("[data-manage-photo-album]")) manageTripPhotoAlbum(); });

  function renderPlaces() {
    const tripKey = String(state.data.trip.tripId || "");
    if (state.mapTripId !== tripKey || !state.mapQuery) { state.mapTripId = tripKey; state.mapQuery = String(state.data.trip.destination || state.data.trip.name || "India").trim(); }
    if (!canViewPlaces()) return `<section class="feature-locked"><i>⌖</i><h2>Places & Map hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    return `${heading("DISCOVER & SAVE", "Places and map", "Travellers can save and edit places; the administrator can also remove them.", "place")}<div class="map-search"><input id="mapQuery" value="${esc(state.mapQuery)}" aria-label="Search Google Maps"><button id="mapSearchButton">⌖ Search Google Maps</button></div><div class="places-layout"><div class="map-frame"><iframe title="Trip map" src="https://www.google.com/maps?q=${encodeURIComponent(state.mapQuery)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><div class="places-list">${state.data.places.map((place) => `<article class="place"><i class="place-icon">⌖</i><div><h3>${esc(place.name)}</h3><p>${esc(place.area)} · ${esc(place.category)}</p><small>${esc(place.plannedDay || "Unplanned")}</small></div><span class="row-actions"><button data-map="${esc(`${place.name}, ${place.area}`)}">Map ↗</button>${canEditRecords("Places") ? `<button class="edit-control mini" data-edit data-sheet="Places" data-id="${esc(place.id)}">Edit</button>` : ""}${isAdmin() ? `<button class="delete-control mini" data-delete data-sheet="Places" data-id="${esc(place.id)}">×</button>` : ""}</span></article>`).join("")}</div></div>`;
  }

  function splitMemberNames() {
    return splitGroups().flat();
  }

  function splitGroups() {
    const raw = state.data && state.data.trip ? String(state.data.trip.splitMembers || "") : "";
    return raw.split("|").map((g) => g.split("+").map((n) => n.trim()).filter(Boolean)).filter((g) => g.length);
  }

  function openSplitMembers() {
    const names = visibleTripMembers().map((m) => String(m.name || "").trim()).filter(Boolean);
    const groups = splitGroups();
    const all = !groups.length;
    const choiceFor = (n) => {
      if (all) return "own";
      const g = groups.find((grp) => grp.some((x) => x.toLowerCase() === n.toLowerCase()));
      if (!g) return "none";
      return g[0].toLowerCase() === n.toLowerCase() ? "own" : "with:" + g[0];
    };
    const rows = names.map((n) => {
      const cur = choiceFor(n);
      const others = names.filter((o) => o !== n).map((o) => `<option value="with:${esc(o)}" ${cur.toLowerCase() === ("with:" + o).toLowerCase() ? "selected" : ""}>Same family as ${esc(o)}</option>`).join("");
      return `<div class="split-row"><span class="split-who">${avatarSlot({ name: n })}<b>${esc(n)}</b></span><select name="split" data-name="${esc(n)}"><option value="own" ${cur === "own" ? "selected" : ""}>Own share</option>${others}<option value="none" ${cur === "none" ? "selected" : ""}>Not sharing</option></select></div>`;
    }).join("");
    showModal("Who shares the expenses", `<form id="splitForm" class="split-form"><p class="split-hint">The total is split equally between shares. To make a family one share, choose "Same family as" for its other members. Travellers who are not sharing still get back anything they paid.</p><div class="split-list">${rows || "<p>No travellers on this trip yet.</p>"}</div><div class="split-preview" id="splitPreview"></div>${actions}</form>`);
    const form = $("#splitForm");
    const build = () => {
      const pick = new Map([...form.querySelectorAll("select[name=split]")].map((s) => [s.dataset.name, s.value]));
      const rootOf = (n, seen = new Set()) => {
        const v = pick.get(n);
        if (!v || v === "none") return null;
        if (v === "own" || seen.has(n)) return n;
        seen.add(n);
        const target = v.slice(5);
        return pick.has(target) ? (rootOf(target, seen) || n) : n;
      };
      const map = new Map();
      names.forEach((n) => { const r = rootOf(n); if (!r) return; if (!map.has(r)) map.set(r, [r]); if (r !== n) map.get(r).push(n); });
      return [...map.values()];
    };
    const preview = () => {
      const g = build();
      $("#splitPreview").innerHTML = g.length ? `<b>${g.length} share${g.length > 1 ? "s" : ""}</b>${g.map((grp) => `<span>${grp.map(esc).join(" + ")}</span>`).join("")}` : "<b>No one is sharing</b>";
    };
    form.addEventListener("change", preview); preview();
    form.querySelector("[data-cancel]").addEventListener("click", closeModal);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const g = build();
      if (!g.length) { toast("At least one traveller must share", true); return; }
      const everyoneOwn = g.length === names.length;
      const value = everyoneOwn ? "" : g.map((grp) => grp.join("+")).join("|");
      try {
        if (!state.demoMode) {
          const saved = await api("updateTrip", authPayload({ trip: { splitMembers: value } }));
          const check = await api("getTrip", authPayload());
          const stored = String(((check && check.trip) || (saved && saved.trip) || {}).splitMembers || "");
          if (stored !== value) { toast("Not saved: your live backend is older than 4.15.0. Deploy the new Code.gs as a New version, then try again.", true); return; }
        }
        state.data.trip.splitMembers = value; closeModal(); render(); toast("Expense sharing saved");
      } catch (error) { toast(error.message, true); }
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-split-members]")) return;
    event.preventDefault(); openSplitMembers();
  });

  function settleUpPlan() {
    const members = visibleTripMembers().map((m) => String(m.name || "").trim()).filter(Boolean);
    const paid = new Map();
    const add = (name, amt) => { const k = name.toLowerCase(); if (!paid.has(k)) paid.set(k, { name, paid: 0 }); paid.get(k).paid += amt; };
    members.forEach((n) => add(n, 0));
    state.data.expenses.forEach((e) => { const n = String(e.paidBy || "").trim(); if (n) add(n, Number(e.amount || 0)); });
    let groups = splitGroups();
    if (!groups.length) groups = members.map((n) => [n]);
    const used = new Set();
    const units = groups.map((grp) => {
      grp.forEach((n) => { used.add(n.toLowerCase()); if (!paid.has(n.toLowerCase())) add(n, 0); });
      const people = grp.map((n) => paid.get(n.toLowerCase()));
      return { name: grp.length > 1 ? `${grp[0]} family` : grp[0], members: grp, lead: grp[0], paid: people.reduce((s, p) => s + p.paid, 0), shares: true };
    });
    [...paid.values()].forEach((p) => { if (!used.has(p.name.toLowerCase()) && p.paid > 0) units.push({ name: p.name, members: [p.name], lead: p.name, paid: p.paid, shares: false }); });
    const total = units.reduce((s, u) => s + u.paid, 0);
    const shareCount = units.filter((u) => u.shares).length;
    if (!units.length || !total || !shareCount) return { people: [], transfers: [], share: 0, total, shareCount: 0 };
    const share = total / shareCount;
    const sharing = units.filter((u) => u.shares); units.forEach((u) => { u.owed = 0; });
    state.data.expenses.forEach((e) => {
      const amt = Number(e.amount || 0); if (!amt) return;
      const sb = String(e.sharedBy || "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
      let us = sb.length ? sharing.filter((u) => u.members.some((m) => sb.includes(m.toLowerCase()))) : sharing;
      if (!us.length) us = sharing; us.forEach((u) => { u.owed += amt / us.length; });
    });
    units.forEach((u) => { u.net = Math.round((u.paid - u.owed) * 100) / 100; });
    /* Administrator-confirmed settlement payments move money directly between
       two people outside the shared expense pool, so they adjust the net
       balance here rather than being added as a new trip expense (which
       would wrongly get split across everyone again). */
    const unitFor = (name) => { const k = String(name || "").trim().toLowerCase(); return units.find((u) => u.members.some((m) => m.toLowerCase() === k)); };
    (state.data.settlements || []).forEach((s) => {
      const amt = Number(s.amount || 0); if (!amt) return;
      const from = unitFor(s.fromPerson), to = unitFor(s.toPerson);
      if (from) from.net = Math.round((from.net + amt) * 100) / 100;
      if (to) to.net = Math.round((to.net - amt) * 100) / 100;
    });
    const owe = units.filter((u) => u.net < -0.5).map((u) => ({ ...u, left: -u.net })).sort((a, b) => b.left - a.left);
    const get = units.filter((u) => u.net > 0.5).map((u) => ({ ...u, left: u.net })).sort((a, b) => b.left - a.left);
    const transfers = [];
    let i = 0, j = 0;
    while (i < owe.length && j < get.length) {
      const amt = Math.min(owe[i].left, get[j].left);
      if (amt >= 1) transfers.push({ from: owe[i].name, to: get[j].name, amount: Math.round(amt) });
      owe[i].left -= amt; get[j].left -= amt;
      if (owe[i].left < 0.5) i++; if (get[j].left < 0.5) j++;
    }
    return { people: units.sort((a, b) => b.net - a.net), transfers, share, total, shareCount, families: units.some((u) => u.members.length > 1) };
  }

  function settleShown() {
    const trip = (state.data && state.data.trip) || {};
    if (String(trip.settleVisible).toUpperCase() === "TRUE") return true;
    const end = trip.endDate ? new Date(`${String(trip.endDate).slice(0, 10)}T23:59:59`) : null;
    return Boolean(end && !Number.isNaN(end.getTime()) && Date.now() > end.getTime());
  }

  async function setSettleVisible(on) {
    const value = on ? "TRUE" : "FALSE";
    try {
      if (!state.demoMode) await api("updateTrip", authPayload({ trip: { settleVisible: value } }));
      state.data.trip.settleVisible = value; render(); toast(on ? "Settle up shown to everyone" : "Settle up hidden until the trip ends");
    } catch (error) { toast(error.message, true); }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settle-toggle]");
    if (!button) return;
    event.preventDefault(); setSettleVisible(button.dataset.settleToggle === "show");
  });

  function renderSettleUp() {
    const plan = settleUpPlan();
    if (!plan.total) return "";
    const forced = String((state.data.trip || {}).settleVisible).toUpperCase() === "TRUE";
    if (!settleShown()) return isAdmin() ? `<section class="settle-collapsed"><div><b>Settle up is hidden</b><small>Travellers will see who owes whom after the trip ends.</small></div><div class="settle-collapsed-actions"><button type="button" data-split-members>Choose who shares</button><button type="button" data-resplit>Re-split past expenses</button><button type="button" data-currency-setup>Currency</button><button type="button" class="settle-show" data-settle-toggle="show">Show now</button></div></section>` : "";
    const rows = plan.people.map((p) => `<div class="settle-person"><span class="settle-name">${avatarSlot({ name: p.lead })}<b>${esc(p.name)}</b></span><small>${p.members.length > 1 ? `${p.members.map(esc).join(" + ")} · ` : ""}Paid ${money.format(p.paid)}${p.shares ? "" : " · not sharing"}</small><strong class="${p.net >= 0 ? "settle-get" : "settle-owe"}">${p.net >= 0 ? "Gets back " : "Owes "}${money.format(Math.abs(p.net))}</strong></div>`).join("");
    const moves = plan.transfers.length ? plan.transfers.map((t) => `<li><b>${esc(t.from)}</b><span>pays</span><b>${esc(t.to)}</b><strong>${money.format(t.amount)}</strong><span class="settle-move-actions"><a class="settle-remind" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`MyTrip · ${(state.data.trip || {}).name || "Trip"}: ${t.from} pays ${t.to} ${money.format(t.amount)} to settle up. Thank you!`)}">✆ Remind</a>${isAdmin() ? `<button type="button" class="settle-mark-done" data-settle-from="${esc(t.from)}" data-settle-to="${esc(t.to)}" data-settle-amount="${t.amount}">✓ Mark settled</button>` : ""}</span></li>`).join("") : `<li class="settle-done"><b>All settled</b><span>Every share is paid equally.</span></li>`;
    const settlements = (state.data.settlements || []).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const settledTotal = settlements.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const history = settlements.length ? `<div class="settle-history"><h3>✓ Settlements saved <small>${settlements.length} recorded · ${money.format(settledTotal)} paid back</small></h3><ul class="settle-history-list">${settlements.map((x) => `<li><em class="settle-saved-badge">✓ Saved</em><span class="settle-history-who">${esc(x.fromPerson)} → ${esc(x.toPerson)}</span><strong>${money.format(x.amount)}</strong><small>${x.createdAt ? displayDate(String(x.createdAt).slice(0, 10)) : ""}${x.settledBy ? ` · confirmed by ${esc(x.settledBy)}` : ""}${x.note ? ` · ${esc(x.note)}` : ""}</small>${isAdmin() ? `<button type="button" class="settle-undo" data-settle-undo="${esc(x.id)}">Undo</button>` : ""}</li>`).join("")}</ul>${isAdmin() ? `<p class="settle-history-foot">Stored in your Google Sheet, tab “Settlements”.</p>` : ""}</div>` : "";
    return `<section class="settle-panel"><div class="settle-head"><div><span class="kicker">SETTLE UP</span><h2>Who owes whom</h2><p>${state.data.expenses.some((e) => String(e.sharedBy || "").trim()) ? `Shared across ${plan.shareCount} ${plan.families ? "shares" : "travellers"} · some expenses re-split` : `Split equally across ${plan.shareCount} ${plan.families ? "shares" : "travellers"} · ${money.format(Math.round(plan.share))} each`}</p></div>${isAdmin() ? `<div class="settle-admin"><button type="button" class="ghost-button" data-split-members>Choose who shares</button><button type="button" class="ghost-button" data-resplit>Re-split</button><button type="button" class="ghost-button" data-currency-setup>Currency</button>${forced ? `<button type="button" class="ghost-button" data-settle-toggle="hide">Hide</button>` : ""}</div>` : ""}</div><div class="settle-grid"><div class="settle-people">${rows}</div><ol class="settle-moves">${moves}</ol></div>${history}</section>`;
  }
  function openSettlementConfirm(from, to, amount) {
    if (!isAdmin()) return toast("Administrator access is required to confirm a settlement", true);
    showModal("Confirm settlement", `<form class="modal-form" data-form="settlement"><p style="margin:0 0 4px;color:#5B6574;font-size:13px"><b>${esc(from)}</b> pays <b>${esc(to)}</b> to settle up.</p><label>Amount<input name="amount" type="number" min="1" step="1" value="${Math.round(Number(amount) || 0)}" required></label><label>Note <small>(optional)</small><input name="note" maxlength="200" placeholder="e.g. Paid via UPI"></label><input type="hidden" name="fromPerson" value="${esc(from)}"><input type="hidden" name="toPerson" value="${esc(to)}"><div class="form-actions"><button type="button" id="cancelSettlement">Cancel</button><button type="submit" class="primary">Confirm settlement</button></div></form>`);
    const cancelBtn = $("#cancelSettlement"); if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  }
  async function undoSettlement(id) {
    if (!isAdmin()) return toast("Administrator access is required", true);
    if (!confirm("Undo this settlement? The amount will count as outstanding again in Settle Up.")) return;
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet: "Settlements", id }));
      state.data.settlements = (state.data.settlements || []).filter((s) => String(s.id) !== String(id)); state.mtSettleOpen = true;
      render(); toast("Settlement removed");
    } catch (error) { toast(error.message, true); }
  }
  document.addEventListener("click", (event) => {
    const mark = event.target.closest("[data-settle-from]");
    if (mark) { openSettlementConfirm(mark.dataset.settleFrom, mark.dataset.settleTo, mark.dataset.settleAmount); return; }
    const undo = event.target.closest("[data-settle-undo]");
    if (undo) undoSettlement(undo.dataset.settleUndo);
  });

  function mtDefaultDate() {
    const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    const s = String(state.data.trip.startDate || ""), e = String(state.data.trip.endDate || "");
    return (!s || today >= s) && (!e || today <= e) ? today : (s || today);
  }
  function mtExpenseSheet() {
    let last = {}; try { last = JSON.parse(localStorage.getItem("mytrip_last_expense") || "{}") || {}; } catch {}
    const cats = ["Food", "Travel", "Local travel", "Stay", "Activities", "Shopping", "Other"];
    const cat = cats.includes(last.category) ? last.category : "Food";
    const payers = visibleTripMembers(); const list = payers.length ? payers : [{ name: state.currentUser }];
    const payer = list.some((m) => m.name === last.paidBy) ? last.paidBy : (list.some((m) => m.name === state.currentUser) ? state.currentUser : list[0].name);
    return `<form class="modal-form mt-xsheet" data-form="expense"><label class="mt-x-amount"><span>₹</span><input name="amount" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0" required autofocus></label><div class="mt-x-group"><span class="mt-x-label">Category</span><div class="mt-x-chips">${cats.map((c) => `<label><input type="radio" name="category" value="${c}"${c === cat ? " checked" : ""}><span>${c}</span></label>`).join("")}</div></div><div class="mt-x-group"><span class="mt-x-label">Paid by</span><div class="mt-x-chips mt-x-payers">${list.map((m) => `<label><input type="radio" name="paidBy" value="${esc(m.name)}"${m.name === payer ? " checked" : ""}><span>${avatarSlot(m)}${esc(m.name)}</span></label>`).join("")}</div></div><label class="mt-x-field">What for? <small>(optional)</small><input name="label" placeholder="e.g. Lunch, auto, tickets" maxlength="120"></label><label class="mt-x-field">Date<input name="date" type="date" value="${esc(mtDefaultDate())}" required></label><div class="mt-x-actions"><button type="submit" class="mt-x-save">Save</button><button type="submit" class="mt-x-again" data-again>Save &amp; add another</button><button type="button" class="mt-x-cancel" data-cancel>Cancel</button></div></form>`;
  }
  function mtMoneyMobile() {
    const budget = Number(state.data.trip.budget || 0), total = spent();
    const d = (off) => { const t = new Date(); t.setDate(t.getDate() - off); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
    const today = d(0), yday = d(1), f = state.mtExpFilter || "all";
    const travellerFilter = state.expenseTravellerFilter || "";
    const all = [...state.data.expenses].sort((x, y) => `${y.date || ""}${y.id || ""}`.localeCompare(`${x.date || ""}${x.id || ""}`));
    const sum = (arr) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);
    const todaySum = sum(all.filter((e) => String(e.date) === today));
    const byDate = f === "today" ? all.filter((e) => String(e.date) === today) : f === "yday" ? all.filter((e) => String(e.date) === yday) : all;
    const shown = travellerFilter ? byDate.filter((e) => e.paidBy === travellerFilter) : byDate;
    const canEdit = canEditRecords("Expenses"), canDel = isAdmin();
    const groups = []; shown.forEach((e) => { const k = String(e.date || ""); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, items: [] }); g.items.push(e); });
    const list = groups.map((g) => `<div class="mt-xday"><div class="mt-xday-head"><b>${g.k === today ? "Today" : g.k === yday ? "Yesterday" : esc(displayDate(g.k, { weekday: "short", day: "numeric", month: "short" }))}</b><span>${money.format(sum(g.items))}</span></div>${g.items.map((e) => `<div class="mt-xrow-wrap">${canDel ? `<button type="button" class="mt-xrow-del" data-delete-expense="${esc(e.id)}">Delete</button>` : ""}<button type="button" class="mt-xrow"${canEdit ? ` data-edit data-sheet="Expenses" data-id="${esc(e.id)}"` : ` data-view-expense="${esc(e.id)}"`}><i class="mt-xcat">${esc(String(e.category || "Other").slice(0, 1))}</i><span class="mt-xwhat"><b>${esc(e.label || e.category || "Expense")}</b><small class="mt-xmeta"><span class="mt-xpayer">${avatarSlot({ name: e.paidBy || "" })}</span><span class="mt-xmeta-text">${esc(e.paidBy || "Not specified")} · ${esc(e.category || "Other")}${e.receiptUrl ? " · 🧾" : ""}${e.currency && Number(e.foreignAmount) > 0 ? ` · ${esc(e.currency)} ${Number(e.foreignAmount).toLocaleString("en-IN")}` : ""}</span></small></span><strong>${money.format(e.amount)}</strong></button></div>`).join("")}</div>`).join("");
    const chips = [["today", "Today"], ["yday", "Yesterday"], ["all", "All"]].map(([k, l]) => `<button type="button" data-mt-xfilter="${k}" class="${f === k ? "on" : ""}">${l}</button>`).join("");
    const filterPeople = expenseFilterPeople();
    const travellerChips = filterPeople.length ? `<div class="mt-xfilters mt-xtraveller-filters">${[["", "Everyone"]].concat(filterPeople.map((n) => [n, n])).map(([v, l]) => `<button type="button" data-mt-xtraveller="${esc(v)}" class="${travellerFilter === v ? "on" : ""}">${esc(l)}</button>`).join("")}</div>` : "";
    const travellerCards = expenseTotalsByTraveller().map((row) => `<article class="traveller-expense-card"><i>${avatarSlot(row)}</i><div><b>${esc(row.name)}</b><small>${row.count} ${row.count === 1 ? "payment" : "payments"}</small></div><strong>${money.format(row.total)}</strong></article>`).join("");
    const fold = (t, s, body, open) => `<details class="mt-fold"${open ? " open" : ""}><summary><span><b>${t}</b><small>${s}</small></span><i>⌄</i></summary><div class="mt-fold-body">${body}</div></details>`;
    const left = budget - total;
    return `<section class="mt-money"><div class="mt-money-strip"><div><small>TODAY</small><b>${money.format(todaySum)}</b></div><div><small>TRIP TOTAL</small><b>${money.format(total)}</b></div><div><small>${left < 0 ? "OVER BUDGET" : "BUDGET LEFT"}</small><b class="${left < 0 ? "neg" : ""}">${budget ? money.format(Math.abs(left)) : "—"}</b></div></div>${canAdd("expense") ? `<button type="button" class="mt-today-add primary mt-money-add" data-mt-add="expense">＋ Add expense</button>` : ""}<div class="mt-xfilters">${chips}</div>${travellerChips}<div class="mt-xlist">${list || `<p class="mt-today-empty">${travellerFilter ? `No expenses for ${esc(travellerFilter)}${f !== "all" ? " on this day" : ""}.` : f === "all" ? "No expenses yet. Tap ＋ to add the first one." : "No expenses on this day."}</p>`}</div>${canDel ? `<p class="mt-xhint">Tip: swipe a row left to delete · tap to edit</p>` : canEdit ? `<p class="mt-xhint">Tap a row to edit</p>` : ""}${fold("Who paid", "Traveller-wise totals", `<div class="traveller-expense-grid">${travellerCards || `<p class="empty-overview">No payments yet.</p>`}</div>`)}${fold("Settle up", "Who owes whom", renderSettleUp(), state.mtSettleOpen)}${fold("Spending chart", "Category & budget", renderSpendChart(total, budget))}${canPrintReports() ? `<button type="button" class="mt-today-add mt-money-print" data-print="expenses">▤ Print expenses</button>` : ""}</section>`;
  }
  document.addEventListener("click", (event) => { const c = event.target.closest("[data-mt-xfilter]"); if (c) { state.mtExpFilter = c.dataset.mtXfilter; render(); } });
  document.addEventListener("click", (event) => { const c = event.target.closest("[data-mt-xtraveller]"); if (c) { state.expenseTravellerFilter = c.dataset.mtXtraveller; render(); } });
  (() => {
    let timer = 0, long = false;
    document.addEventListener("pointerdown", (e) => { const p = e.target.closest("[data-mt-plus]"); if (!p) return; long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; if (canViewItinerary() && canAdd("plan")) { navigator.vibrate && navigator.vibrate(15); showAddModal("plan"); } }, 520); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => document.addEventListener(t, () => clearTimeout(timer)));
    document.addEventListener("click", (e) => { const p = e.target.closest("[data-mt-plus]"); if (!p) return; e.preventDefault(); if (long) { long = false; return; } if (canViewExpenses() && canAdd("expense")) showAddModal("expense"); else if (canViewItinerary() && canAdd("plan")) showAddModal("plan"); });
    document.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-mt-plus]")) e.preventDefault(); });
    let sx = 0, sy = 0, row = null;
    document.addEventListener("touchstart", (e) => { const r = e.target.closest(".mt-xrow"); document.querySelectorAll(".mt-xrow-wrap.swiped").forEach((w) => { if (!r || w !== r.parentElement) w.classList.remove("swiped"); }); if (!r || !r.parentElement.querySelector(".mt-xrow-del")) { row = null; return; } row = r; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    document.addEventListener("touchend", (e) => { if (!row) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy); if (dy < 30 && dx < -50) row.parentElement.classList.add("swiped"); else if (dy < 30 && dx > 40) row.parentElement.classList.remove("swiped"); row = null; }, { passive: true });
    document.addEventListener("click", (e) => { const r = e.target.closest(".mt-xrow"); if (r && r.parentElement.classList.contains("swiped")) { e.stopPropagation(); e.preventDefault(); r.parentElement.classList.remove("swiped"); } }, true);
  })();
  function expenseFilterPeople() {
    return [...new Set([...visibleTripMembers().map((m) => m.name), ...state.data.expenses.map((e) => e.paidBy).filter(Boolean)])];
  }
  function renderExpenses() {
    if (!canViewExpenses()) return `<section class="feature-locked"><i>₹</i><h2>Expenses hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    if (mtIsPhone()) return mtMoneyMobile();
    const budget = Number(state.data.trip.budget || 0), total = spent();
    const travellerTotals = expenseTotalsByTraveller();
    const travellerFilter = state.expenseTravellerFilter || "";
    const travellerCards = travellerTotals.map((row) => {
      const percent = total ? Math.round(row.total / total * 100) : 0;
      return `<article class="traveller-expense-card"><i>${avatarSlot(row)}</i><div><b>${esc(row.name)}</b><small>${row.count} ${row.count === 1 ? "payment" : "payments"} · ${percent}% of total</small><span><em style="width:${percent}%"></em></span></div><strong>${money.format(row.total)}</strong></article>`;
    }).join("");
    const filterPeople = expenseFilterPeople();
    const travellerFilterBar = filterPeople.length ? `<div class="xp-group expense-traveller-filter"><span class="xp-label">Viewing &amp; editing for</span><div class="xp-chips">${[["", "Everyone"]].concat(filterPeople.map((n) => [n, n])).map(([v, l]) => `<button type="button" data-expense-traveller-filter="${esc(v)}" class="${travellerFilter === v ? "on" : ""}">${esc(l)}</button>`).join("")}</div></div>` : "";
    const visibleExpenses = travellerFilter ? state.data.expenses.filter((e) => e.paidBy === travellerFilter) : state.data.expenses;
    const filteredTotal = travellerFilter ? visibleExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) : total;
    const rows = [...visibleExpenses].sort((a, b) => `${b.date || ""}${b.id || ""}`.localeCompare(`${a.date || ""}${a.id || ""}`)).map((expense) => {
      if (String(state.expenseRowEditId) === String(expense.id)) return renderExpenseRowEditor(expense);
      const editActions = canEditRecords("Expenses") ? `<button class="row-edit" data-row-edit-expense="${esc(expense.id)}">Row edit</button><button data-edit data-sheet="Expenses" data-id="${esc(expense.id)}">Edit</button>` : "";
      const deleteAction = isAdmin() ? `<button class="delete" data-delete-expense="${esc(expense.id)}">Delete</button>` : "";
      return `<div class="expense-row"><span class="expense-description"><i>₹</i><b>${esc(expense.label)}</b></span><span>${displayDate(expense.date)}</span><span><em class="expense-category">${esc(expense.category || "Other")}</em></span><span><b class="expense-payer">${esc(expense.paidBy || "Not specified")}</b></span><span class="expense-amount"><strong>${money.format(expense.amount)}</strong></span><span class="expense-row-actions"><button data-view-expense="${esc(expense.id)}">View</button>${expense.receiptUrl || canEditRecords("Expenses") ? `<button class="receipt-btn${expense.receiptUrl ? " has" : ""}" data-receipt-open="${esc(expense.id)}" title="${expense.receiptUrl ? "View receipt" : "Add receipt photo"}">🧾</button>` : ""}${editActions}${deleteAction}</span></div>`;
    }).join("");
    return `${heading("EXPENSE TRACKER", "Expenses and payments", "View every payment in one row. Allowed accounts can use quick row editing or the full editor; deletion is controlled by the Administrator.", "expense")}<section class="expense-summary"><article class="summary-card budget-card"><small>TRIP BUDGET</small><strong>${money.format(budget)}</strong><span>Planned spending limit</span></article><article class="summary-card spent-card"><small>TOTAL EXPENSES</small><strong>${money.format(total)}</strong><span>${budget ? Math.round(total / budget * 100) : 0}% of the budget used</span></article><article class="summary-card balance-card"><small>${budget - total < 0 ? "OVER BUDGET" : "BALANCE AVAILABLE"}</small><strong>${money.format(Math.abs(budget - total))}</strong><span>${budget - total < 0 ? "Review trip spending" : "Remaining for this trip"}</span></article></section>${renderSpendChart(total, budget)}<section class="traveller-expense-panel"><div class="traveller-expense-heading"><div><span class="kicker">WHO PAID</span><h2>Traveller-wise expense totals</h2><p>Only travellers with a positive recorded payment are shown.</p></div><strong>${money.format(total)} total</strong></div><div class="traveller-expense-grid">${travellerCards || `<p class="empty-overview">No traveller expenses recorded.</p>`}</div></section>${renderSettleUp()}<section class="table-panel expense-record-panel"><div class="table-headline"><div><span class="kicker">COMPLETE RECORD</span><h2>${travellerFilter ? `${esc(travellerFilter)}'s expenses` : "Detailed expense statement"}</h2><p>${travellerFilter ? `${rows ? visibleExpenses.length : 0} ${visibleExpenses.length === 1 ? "entry" : "entries"} · ${money.format(filteredTotal)} total. Use Row edit for a quick change or Edit for every field.` : "Use Row edit for a quick change or Edit for every field."}</p></div>${canPrintReports() ? `<span class="plan-table-tools">${printOptionsMenu(`<label class="plan-print-line"><span>Column widths</span><button type="button" class="plan-tool" data-reset-expense-columns>⇔ Reset</button></label>`)}<button class="plan-tool primary-tool" data-print="expenses">▤ Print expenses</button></span>` : ""}</div>${travellerFilterBar}<div class="expense-table expense-action-table" style="${expenseColumnStyle()}"><div class="expense-table-header">${expenseColumnLabels.map((label, index) => `<span>${label}${index < expenseColumnLabels.length - 1 ? `<i class="expense-col-grip" data-exp-col="${index}" title="Drag to resize this column">⋮⋮</i>` : ""}</span>`).join("")}</div>${rows || `<div class="expense-empty-row"><b>${travellerFilter ? `No expenses recorded for ${esc(travellerFilter)}` : "No expenses recorded"}</b><p>${travellerFilter ? "Try another traveller or clear the filter." : "Add the first trip payment."}</p></div>`}</div></section>`;
  }
  document.addEventListener("click", (event) => { const t = event.target.closest("[data-expense-traveller-filter]"); if (!t) return; event.preventDefault(); state.expenseTravellerFilter = t.dataset.expenseTravellerFilter; render(); });

  function renderExpenseRowEditor(expense) {
    const categories = ["Food", "Stay", "Travel", "Local travel", "Activities", "Shopping", "Other"];
    if (expense.category && !categories.includes(expense.category)) categories.push(expense.category);
    const payers = [...new Set([...visibleTripMembers().map((member) => member.name), expense.paidBy, state.currentUser || "Traveller"].filter(Boolean))];
    return `<form class="expense-row expense-row-editing" data-expense-row-form="${esc(expense.id)}"><label><small>DESCRIPTION</small><input name="label" maxlength="180" value="${esc(expense.label)}" required></label><label><small>DATE</small><input name="date" type="date" value="${esc(expense.date)}" required></label><label><small>CATEGORY</small><select name="category">${categories.map((category) => `<option ${category === expense.category ? "selected" : ""}>${esc(category)}</option>`).join("")}</select></label><label><small>PAID BY</small><select name="paidBy" required>${payers.map((payer) => `<option ${payer === expense.paidBy ? "selected" : ""}>${esc(payer)}</option>`).join("")}</select></label><label><small>AMOUNT</small><input name="amount" type="number" min="0.01" step="0.01" value="${esc(expense.amount)}" required></label><span class="expense-row-actions editing"><button class="save" type="submit">Save row</button><button type="button" data-cancel-expense-row>Cancel</button></span></form>`;
  }

  function showExpenseDetails(id) { const r = showExpenseDetailsInner(id); injectReceiptBlock(id); return r; }
  function showExpenseDetailsInner(id) {
    const expense = state.data.expenses.find((item) => String(item.id) === String(id));
    if (!expense) return toast("Expense not found", true);
    showModal("Expense details", `<div class="expense-view-card"><span class="expense-view-icon">₹</span><div><small>EXPENSE</small><h3>${esc(expense.label)}</h3><p>${esc(expense.notes || "No additional note")}</p></div><dl><div><dt>DATE</dt><dd>${displayDate(expense.date)}</dd></div><div><dt>CATEGORY</dt><dd>${esc(expense.category || "Other")}</dd></div><div><dt>PAID BY</dt><dd>${esc(expense.paidBy || "Not specified")}</dd></div><div><dt>AMOUNT</dt><dd>${money.format(expense.amount)}</dd></div></dl><div class="form-actions"><button id="closeExpenseView" type="button">Close</button>${canEditRecords("Expenses") ? `<button id="editExpenseFromView" type="button">Edit expense</button>` : ""}</div></div>`);
    $("#closeExpenseView").addEventListener("click", closeModal);
    if ($("#editExpenseFromView")) $("#editExpenseFromView").addEventListener("click", () => showEditRecord("Expenses", expense.id));
  }

  async function saveExpenseRow(event) {
    event.preventDefault();
    const form = event.target.closest("[data-expense-row-form]");
    if (!form) return;
    const id = form.dataset.expenseRowForm;
    const expense = state.data.expenses.find((item) => String(item.id) === String(id));
    if (!expense || !canEditRecords("Expenses")) return toast("Expense editing is not allowed for this account", true);
    const update = Object.fromEntries(new FormData(form).entries());
    update.amount = Number(update.amount);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Saving…";
    try {
      if (!state.demoMode) await api("updateRecord", authPayload({ sheet: "Expenses", id, record: update }));
      Object.assign(expense, update); state.expenseRowEditId = ""; render(); hydrateShell(); updatePrintArea(); toast("Expense row saved to Google Sheet");
    } catch (error) { submit.disabled = false; submit.textContent = "Save row"; toast(error.message, true); }
  }

  function showDeleteExpenseConfirmation(id) {
    if (!isAdmin()) return toast("Administrator access is required to delete an expense", true);
    const expense = state.data.expenses.find((item) => String(item.id) === String(id));
    if (!expense) return toast("Expense not found", true);
    showModal("Delete expense", `<div class="delete-confirmation expense-delete-confirmation"><div class="security-note danger-note"><i>!</i><p>Delete <b>${esc(expense.label)}</b> for <b>${money.format(expense.amount)}</b>? This removes the row from the Expenses Google Sheet.</p></div><div class="form-actions"><button id="cancelExpenseDelete" type="button">Cancel</button><button class="danger-button" id="confirmExpenseDelete" type="button">Delete expense</button></div></div>`);
    $("#cancelExpenseDelete").addEventListener("click", closeModal);
    $("#confirmExpenseDelete").addEventListener("click", async () => { closeModal(); await deleteItem("Expenses", expense.id); });
  }

  function renderPeople() {
    if (!canViewTravellers()) return `<section class="feature-locked"><i>♙</i><h2>Traveller list hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const members = visibleTripMembers();
    const totals = Object.fromEntries(members.map((member) => [member.name, state.data.expenses.filter((expense) => expense.paidBy === member.name).reduce((sum, expense) => sum + Number(expense.amount), 0)]));
    const accessFields = ["canViewItinerary", "canViewExperiences", "canViewPlaces", "canViewExpenses", "canViewTravellers", "canPrint", "canWriteStickyNotes"];
    const cards = members.map((member) => {
      const assignment = member.travellerId ? assignmentForTraveller(member.travellerId) : null;
      const enabledFeatures = accessFields.filter((field) => assignmentAllows(assignment, field)).length;
      const accessBadge = isAdmin() && member.travellerId ? `<div class="feature-access-badge"><b>${enabledFeatures}/7 ACCESS OPTIONS</b><button data-feature-access="${esc(member.id)}">Control access</button></div>` : "";
      const paidTotal = canViewExpenses() ? `<span><small>PAID FOR TRIP</small><b>${money.format(totals[member.name] || 0)}</b></span>` : `<span><small>TRIP ACCESS</small><b>${esc(member.role)}</b></span>`;
      return `<article class="person ${member.travellerId ? "personal-access" : "shared-only"}"><i${isAdmin() && member.travellerId ? ` class="avatar-edit" data-photo-upload="${esc(member.travellerId)}" title="Change ${esc(member.name)}'s photo"` : ""}>${avatarSlot(member)}${isAdmin() && member.travellerId ? "<em>📷</em>" : ""}</i><div><h3>${esc(member.name)}</h3><p>${member.travellerId ? `Username · ${esc(member.travellerId)}` : (member.role === "Organiser" ? "Trip organiser" : "Trip member without an account")}</p></div><span>${esc(member.role)}</span><div class="person-access-badge ${member.travellerId ? "enabled" : "pending"}">${isAdmin() ? (member.travellerId ? "ENABLED FOR THIS TRIP" : (member.role === "Organiser" ? "ADMIN" : "ACCOUNT REQUIRED")) : (member.travellerId ? "TRAVELLER ACCOUNT" : (member.role === "Organiser" ? "ORGANISER" : "TRIP MEMBER"))}</div>${accessBadge}<footer>${paidTotal}<span class="person-footer-actions">${isAdmin() && member.travellerId ? `<button class="pin-reset-control" data-reset-member-pin="${esc(member.id)}" aria-label="Edit password for ${esc(member.name)}">✎ Edit password</button>` : ""}${isAdmin() && !member.travellerId && member.role !== "Organiser" ? `<button class="pin-reset-control" data-give-pin="${esc(member.id)}" aria-label="Create account for ${esc(member.name)}">＋ Create account</button>` : ""}${isAdmin() && member.role !== "Organiser" ? `<button class="delete-control trip-disable-control" data-remove-trip-member="${esc(member.id)}">Remove from trip</button>` : ""}</span></footer></article>`;
    }).join("");
    return `${heading("YOUR TRAVEL GROUP", isAdmin() ? "Traveller accounts and feature access" : "Travellers and trip members", isAdmin() ? "Open Control access on a traveller to show or hide each dashboard feature." : "The complete trip member list is shown here.", "travellers")}<div class="share-banner"><div><h3>${isAdmin() ? "Trip-specific traveller access" : `${members.length} trip ${members.length === 1 ? "member" : "members"}`}</h3><p>Trip ID <b>${esc(state.data.trip.tripId)}</b> · ${isAdmin() ? "Feature controls apply to each personal username; shared trip access remains separate" : "Full traveller and member list"}</p></div>${isAdmin() ? `<span class="banner-actions"><button data-add-existing-travellers>＋ Existing traveller</button><button data-add="travellers">＋ New traveller</button><button data-manage-current-trip>Manage access</button><button data-all-trips>All trips</button></span>` : `<span class="readonly-label">TRIP GROUP</span>`}</div><div class="people-grid">${cards || `<div class="empty-trip-members"><b>No trip members yet</b><p>No traveller or member has been added to this trip.</p></div>`}</div>`;
  }

  function renderPrint() {
    if (!canPrintReports()) return `<section class="feature-locked"><i>▤</i><h2>Print & Export hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const planCard = canViewItinerary() || canViewExperiences() ? `<article class="print-card"><i>▦</i><h3>Itinerary & experiences</h3><p>Print the plan and experience notes currently available to you.</p><button data-print="plan">Print itinerary →</button></article>` : "";
    const itineraryCard = canViewItinerary() ? `<article class="print-card"><i>▦</i><h3>Itinerary only</h3><p>A clean day-by-day table with a tick column — carry it before the trip for easy management.</p><button data-print="itinerary">Print itinerary →</button></article>` : "";
    const expenseCard = canViewExpenses() ? `<article class="print-card"><i>₹</i><h3>Expenses only</h3><p>Budget summary and every expense entry.</p><button data-print="expenses">Print expenses →</button></article>` : "";
    return `${heading("READY FOR PAPER", "Print and export", "Create a clean A4 copy or save allowed reports as PDF.")}<div class="print-grid">${itineraryCard}${planCard}${expenseCard}${isAdmin() ? `<article class="print-card"><i>⟲</i><h3>History &amp; backups</h3><p>Who added, changed or deleted what — and nightly copies of the whole Sheet.</p><div class="csv-buttons"><button data-history>Change history</button><button data-backups>Backups</button></div></article>` : ""}<article class="print-card"><i>⇩</i><h3>Excel / CSV</h3><p>Download a spreadsheet that opens in Excel or Google Sheets.</p><div class="csv-buttons">${canViewExpenses() ? `<button data-csv="expenses">Expenses ⇩</button>` : ""}${canViewItinerary() ? `<button data-csv="itinerary">Itinerary ⇩</button>` : ""}<button data-csv="checklist">Checklist ⇩</button></div></article><article class="print-card"><i>▤</i><h3>Available trip book</h3><p>Only the sections enabled by the Administrator are included.</p><button data-print="full">Print available sections →</button></article></div>`;
  }

  function skeletonView() {
    return `<div class="skeleton-view" aria-hidden="true"><div class="skeleton-head"></div>${[0,1,2,3,4].map(() => `<div class="skeleton-row"><i></i><i></i><i></i><i></i></div>`).join("")}</div>`;
  }

  function showSkeleton() { if ($("#view")) $("#view").innerHTML = skeletonView(); }

  const FAQ = [
    { group: "Getting started", go: "overview", items: [
      ["How do I sign in?", "Use your Traveller ID and password from the Administrator. For one shared trip, use the Trip ID and trip password."],
      ["How do I switch trips?", "Tap All trips (admin) or My trips (traveller) at the top, or in ⋯ More on mobile, then choose a trip."],
      ["How can a new person join?", "Administrator: Invite › Create link and send it on WhatsApp. They fill name and password; you tap Allow. The link expires after the trip."],
      ["How do I change my password?", "Open My trips and tap ⚿ Change my password. A trip creator can also reset travellers in their own trips."],
      ["What is on Overview?", "Days to go or today's plan, trip progress, what's next and the pinned sticky note."]] },
    { group: "Itinerary", go: "itinerary", items: [
      ["How do I add a plan?", "Tap ＋ (bottom right on mobile) or Add plan. Enter day, time, what and an optional remark, then Save."],
      ["How do I edit or delete a row?", "Tap Row edit to change it in place, then Save. Admins also see Delete. On mobile, tap a card to see its actions."],
      ["How do I change the order?", "Drag a row by its handle ⋮⋮ to a new place. Rows on the same day can also be sorted by time."],
      ["How do I mark a plan done?", "Tick the box at the start of the row. Everyone sees it as done."],
      ["How do I record who paid?", "Tap ₹ on the row. The amount is added to Expenses with the payer's name."],
      ["How do I resize columns?", "Drag the edge of a column heading. The width is remembered on that device."]] },
    { group: "Expenses & settle up", go: "expenses", items: [
      ["How do I add an expense?", "Open Expenses and tap ＋. Choose Paid by carefully. It must match the traveller's name."],
      ["Who shares the cost?", "The Administrator taps Choose who shares. Each person can be Own share, Same family as someone, or Not sharing."],
      ["Someone skipped a day — how do I fix the split?", "Administrator: in Settle up tap Re-split past expenses. Choose Whole trip, One day or Pick expenses, untick who did not share, check the preview and tap Update."],
      ["Can I add a receipt photo?", "Yes. Open the expense and tap 📷 Camera or 🖼 Gallery in the Receipt box. It is saved small in Drive. Rows with a bill show 🧾."],
      ["How do I enter a foreign currency?", "Administrator: Settle up › Currency, pick the currency and the ₹ rate. Then in Add expense choose that currency; MyTrip saves the ₹ value with the rate locked."],
      ["What if there is no signal?", "Keep adding. Entries are saved on the phone with an amber You're offline note and sync by themselves when signal returns."],
      ["How do I remind someone to pay?", "In Settle up tap ✆ Remind next to a payment. WhatsApp opens with a ready message."],
      ["When is Settle up shown?", "The Administrator decides. It can stay hidden until the journey ends, then show who pays whom."]] },
    { group: "Sticky notes", go: "overview", items: [
      ["What is the pinned sticky note?", "A shared note on Overview that every traveller on the trip can read."],
      ["Who can edit it?", "The Administrator, and any traveller the Administrator allows. Type directly in the note and tap Save."],
      ["Can the sticky note be hidden?", "Yes. Administrator: open the sticky panel and tap 🙈 Hide for travellers. Tap 👁 Show to travellers to bring it back."],
      ["Why don't I see my change?", "Always tap Save before leaving. Then pull to refresh or tap Refresh data on the other device."]] },
    { group: "Photos & travellers", go: "people", items: [
      ["How do I add my photo?", "Tap your name or picture, then Change photo. Admins can set anyone's photo."],
      ["How do I add trip photos?", "Open Trip photos and tap Upload. The Administrator can turn uploads on or off."],
      ["Why can't I choose Original photo?", "The Administrator sets photo quality and the number of photos for each traveller: Traveller chooses, Compressed only or Original only."],
      ["Why is a feature missing for me?", "The Administrator can hide features for each Traveller ID. Ask them to turn it on."]] },
    { group: "Checklist", go: "checklist", items: [
      ["How does the checklist work?", "Open Checklist (⋯ More on mobile). Add an item, choose who it is for and a day if needed, then tick it when done. Everyone sees it."],
      ["Who can delete an item?", "The person who added it, or the Administrator."]] },
    { group: "Print & settings", go: "print", items: [
      ["Is my data backed up?", "Yes, once the Administrator presses Run All. A full copy of the Sheet is saved every night in Drive › MyTrip Backups (latest 14 kept). Print & export › Backups shows them and has Back up now."],
      ["Can I see who changed something?", "Administrator: Print & export › Change history lists every add, edit and delete with the person and time."],
      ["How do I download Excel?", "Open Print & export and tap Expenses, Itinerary or Checklist in the Excel / CSV card. It opens in Excel or Google Sheets."],
      ["How do I print expenses person-wise?", "Print & export › Print expenses, choose a person, font size, layout and alignment, then Print."],
      ["How do I print the itinerary?", "Open Print & export, choose wrap, layout and alignment, then Print or Save as PDF."],
      ["How do I make text bigger?", "Use A− / A+ at the top, or in ⋯ More on mobile. Your choice is remembered."],
      ["Why was I signed out?", "The Administrator can set auto sign-out after 5 min, 30 min, 1 hr or 2 hr without use."]] }
  ];
  /* Sticky notes is excluded from ratings: admin controls who may use it
     (and can hide it entirely for travellers), so it isn't a feature every
     traveller experiences the same way. */
  const FEEDBACK_FEATURES = [["overall", "Overall"], ["itinerary", "Itinerary"], ["expenses", "Expenses"], ["photos", "Photos"]];
  function feedbackKey() { return `mytrip.feedback.${state.data ? state.data.trip.tripId : ""}.${state.travellerId || state.accountUsername || state.currentUser || ""}`; }
  function feedbackDraft() {
    if (!state.feedbackDraft) { try { state.feedbackDraft = JSON.parse(localStorage.getItem(feedbackKey()) || "null"); } catch (e) {} }
    if (!state.feedbackDraft) state.feedbackDraft = { ratings: {}, suggestion: "" };
    return state.feedbackDraft;
  }
  function rateReminder() {
    try {
      if (tripOverviewStage(new Date().toISOString().slice(0, 10)) !== "completed") return "";
      if (localStorage.getItem(feedbackKey()) || localStorage.getItem(feedbackKey() + ".later")) return "";
    } catch (e) { return ""; }
    return `<div class="rate-reminder"><span>${mtIcon("feedback")}</span><p><b>How was MyTrip on this trip?</b><small>Rate it in 20 seconds and help make it better.</small></p><button type="button" data-go="help">Rate</button><button type="button" class="rate-later" data-rate-later aria-label="Not now">×</button></div>`;
  }
  function maybeWelcome() {
    try {
      if (!state.data || state.welcomeShown || localStorage.getItem("mytrip.welcomed.v1")) return;
      state.welcomeShown = true; localStorage.setItem("mytrip.welcomed.v1", "1");
    } catch (e) { return; }
    const steps = [["overview", "Today at a glance", "Overview shows what's next, trip progress and the pinned sticky note."], ["itinerary", "Plan together", "Add plans, drag rows to reorder and tick them off as you go."], ["expenses", "Track money", "Record who paid. Settle up shows who owes whom when the Administrator allows it."], ["help", "Help is always here", "Open Help & Feedback in the menu for answers, or to rate features."]];
    setTimeout(() => {
      if ($("#modal") && !$("#modal").classList.contains("hidden")) return;
      showModal("Welcome to MyTrip", `<div class="welcome-tour">${steps.map(([icon, t, d], i) => `<div class="welcome-step"><span>${mtIcon(icon)}</span><p><b>${i + 1}. ${t}</b><small>${d}</small></p></div>`).join("")}<div class="welcome-actions"><button type="button" class="secondary" data-welcome-help>Open Help</button><button type="button" data-welcome-close>Got it</button></div></div>`);
      const body = $("#modalBody");
      body.querySelector("[data-welcome-close]").addEventListener("click", closeModal);
      body.querySelector("[data-welcome-help]").addEventListener("click", () => { closeModal(); setTab("help"); });
    }, 700);
  }
  function starRow(key, label, value) {
    return `<div class="fb-row"><span>${label}</span><div class="fb-stars" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= value ? "on" : ""}" data-fb-star="${key}:${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div></div>`;
  }
  function renderHelp() {
    const q = (state.helpQuery || "").trim().toLowerCase();
    const groups = FAQ.map((g) => ({ ...g, items: g.items.filter(([qq, a]) => !q || (qq + " " + a + " " + g.group).toLowerCase().includes(q)) })).filter((g) => g.items.length);
    const faq = groups.length ? groups.map((g) => `<div class="faq-group"><div class="faq-group-head"><h3>${g.group}</h3><button type="button" class="faq-go" data-go="${g.go}">Go there ›</button></div>${g.items.map(([qq, a]) => `<details class="faq-item" ${q ? "open" : ""}><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`).join("") : `<p class="faq-empty">No answers match "${esc(state.helpQuery)}". Try another word, or send it as a suggestion below.</p>`;
    const d = feedbackDraft();
    const sent = d.sentAt ? `<small class="fb-sent">Sent ${esc(displayDate(d.sentAt.slice(0, 10)))} · you can change it any time</small>` : "";
    const form = `<section class="fb-card" id="feedbackCard"><div class="fb-head"><span>${mtIcon("feedback")}</span><div><h3>Rate &amp; suggest</h3><p>Tap the stars for each feature. Only the Administrator sees replies.</p></div></div>${FEEDBACK_FEATURES.map(([k, l]) => starRow(k, l, Number(d.ratings[k] || 0))).join("")}<label class="fb-label" for="fbSuggestion">What would you like added or improved?</label><textarea id="fbSuggestion" rows="3" maxlength="600" placeholder="e.g. Show weather for each day">${esc(d.suggestion || "")}</textarea><div class="fb-actions">${sent}<button type="button" data-fb-send>${d.sentAt ? "Update feedback" : "Send feedback"}</button></div></section>`;
    const admin = isAdmin() ? renderFeedbackSummary() : "";
    return `<section class="help-page"><div class="view-head"><div><span class="kicker">HELP &amp; FEEDBACK</span><h2>How can we help?</h2></div><button type="button" class="help-update" data-app-update>↻ Clear cache &amp; update</button></div><p class="help-version">You are on FE v${frontendVersion}${backendVersion ? ` · BE v${esc(backendVersion)}` : ""}. If a new version doesn't show, tap Clear cache &amp; update.</p><div class="help-search"><span>${mtIcon("help")}</span><input id="helpSearch" type="search" placeholder="Search e.g. settle, sticky, print" value="${esc(state.helpQuery || "")}" autocomplete="off"></div><div class="help-grid"><div class="faq-list">${faq}</div><div class="help-side">${form}${admin}</div></div></section>`;
  }
  function renderFeedbackSummary() {
    const s = state.feedbackSummary;
    if (!s) { loadFeedbackSummary(); return `<section class="fb-card fb-admin"><h3>Feedback from travellers</h3><p class="fb-muted">Loading…</p></section>`; }
    const avg = FEEDBACK_FEATURES.map(([k, l]) => { const a = s.averages[k]; return `<div class="fb-avg"><span>${l}</span><b>${a && a.count ? `★ ${a.average.toFixed(1)}` : "—"}</b><small>${a && a.count ? `${a.count} rating${a.count > 1 ? "s" : ""}` : "No ratings"}</small></div>`; }).join("");
    const list = (s.suggestions || []).length ? s.suggestions.map((x) => `<li><p>${esc(x.suggestion)}</p><small>${esc(x.name || "Traveller")} · ${esc(x.tripId)} · ${esc(displayDate(String(x.updatedAt || "").slice(0, 10)))}</small></li>`).join("") : `<li class="fb-muted">No suggestions yet.</li>`;
    return `<section class="fb-card fb-admin"><div class="fb-admin-head"><h3>Feedback from travellers</h3><small>${s.total} repl${s.total === 1 ? "y" : "ies"} · all trips</small></div><div class="fb-avg-grid">${avg}</div><h4>Latest suggestions</h4><ul class="fb-list">${list}</ul></section>`;
  }
  async function loadFeedbackSummary() {
    if (state.feedbackLoading) return; state.feedbackLoading = true;
    try {
      if (state.demoMode) state.feedbackSummary = { total: 0, averages: {}, suggestions: [] };
      else state.feedbackSummary = await api("getFeedback", authPayload());
    } catch (error) { state.feedbackSummary = { total: 0, averages: {}, suggestions: [], error: error.message }; }
    state.feedbackLoading = false;
    if (state.tab === "help") render();
  }
  async function sendFeedback() {
    const d = feedbackDraft();
    d.suggestion = ($("#fbSuggestion") || {}).value || "";
    if (!Object.keys(d.ratings).length && !d.suggestion.trim()) return toast("Tap some stars or write a suggestion first", true);
    const btn = $("[data-fb-send]"); if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    try {
      if (!state.demoMode) await api("saveFeedback", authPayload({ feedback: { ...d.ratings, suggestion: d.suggestion.trim(), name: state.currentUser || "" } }));
      d.sentAt = new Date().toISOString();
      try { localStorage.setItem(feedbackKey(), JSON.stringify(d)); } catch (e) {}
      state.feedbackSummary = null; toast("Thanks! Your feedback was sent"); render();
    } catch (error) { toast(error.message, true); if (btn) { btn.disabled = false; btn.textContent = "Send feedback"; } }
  }
  document.addEventListener("click", (event) => { if (event.target.closest("[data-app-update]")) clearAppCacheAndReload(); });
  document.addEventListener("click", (event) => {
    const star = event.target.closest("[data-fb-star]");
    if (star) { const [k, n] = star.dataset.fbStar.split(":"); const d = feedbackDraft(); const ta = $("#fbSuggestion"); if (ta) d.suggestion = ta.value; d.ratings[k] = Number(d.ratings[k]) === Number(n) ? 0 : Number(n); if (!d.ratings[k]) delete d.ratings[k]; render(); return; }
    if (event.target.closest("[data-fb-send]")) { sendFeedback(); return; }
    if (event.target.closest("[data-rate-later]")) { try { localStorage.setItem(feedbackKey() + ".later", "1"); } catch (e) {} render(); }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id !== "helpSearch") return;
    state.helpQuery = event.target.value;
    const pos = event.target.selectionStart; render();
    const el = $("#helpSearch"); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
  });

  /* ---------- v4.35.0: motion, night mode, weather, swipe, pull-to-refresh, offline, quick chips ---------- */
  function mtFadeView() { const v = $("#view"); if (!v) return; v.classList.remove("mt-fade"); void v.offsetWidth; v.classList.add("mt-fade"); }

  const themeKey = "mytrip.theme";
  function themeChoice() { try { return localStorage.getItem(themeKey) || "auto"; } catch { return "auto"; } }
  const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const choice = themeChoice();
    const dark = choice === "dark" || (choice === "auto" && darkQuery && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#0E1418" : "#F7F6F2";
    $$("[data-night-label]").forEach((el) => { el.textContent = choice === "auto" ? "Auto" : (choice === "dark" ? "On" : "Off"); });
  }
  function setTheme(choice) { try { localStorage.setItem(themeKey, choice); } catch {} applyTheme(); $$("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === choice)); }
  function nightModeRow() {
    const c = themeChoice();
    return `<div class="mt-more-row mt-more-theme"><span>Night mode</span><div class="theme-seg">${[["auto", "Auto"], ["light", "Off"], ["dark", "On"]].map(([v, l]) => `<button type="button" data-theme-set="${v}" class="${c === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", applyTheme);
  applyTheme();

  const WMO = { 0: ["Clear sky", "☀"], 1: ["Mostly clear", "🌤"], 2: ["Partly cloudy", "⛅"], 3: ["Cloudy", "☁"], 45: ["Fog", "🌫"], 48: ["Fog", "🌫"], 51: ["Light drizzle", "🌦"], 53: ["Drizzle", "🌦"], 55: ["Heavy drizzle", "🌧"], 61: ["Light rain", "🌦"], 63: ["Rain", "🌧"], 65: ["Heavy rain", "🌧"], 80: ["Rain showers", "🌦"], 81: ["Rain showers", "🌧"], 82: ["Heavy showers", "⛈"], 95: ["Thunderstorm", "⛈"], 96: ["Thunderstorm", "⛈"], 99: ["Thunderstorm", "⛈"], 71: ["Snow", "🌨"], 73: ["Snow", "🌨"], 75: ["Heavy snow", "❄"] };
  function weatherTarget() {
    if (!state.data || !state.data.trip) return null;
    const trip = state.data.trip; const today = new Date().toISOString().slice(0, 10);
    const place = String(trip.destination || trip.name || "").split(/[,·|/-]/)[0].trim();
    if (!place || (trip.endDate && trip.endDate < today)) return null;
    const day = trip.startDate && trip.startDate > today ? trip.startDate : today;
    const ahead = Math.round((new Date(day) - new Date(today)) / 86400000);
    return { place, day, ahead: Math.max(0, Math.min(ahead, 15)) };
  }
  function weatherSlot() { return weatherTarget() ? `<div id="weatherSlot" class="weather-card weather-loading" aria-live="polite"></div>` : ""; }
  async function loadWeather() {
    const t = weatherTarget(); const slot = $("#weatherSlot"); if (!t || !slot) return;
    const key = "mytrip.weather." + t.place.toLowerCase() + "." + t.day;
    let w = null; try { w = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    if (!w || Date.now() - w.at > 3600000) {
      try {
        let geo = null; const gk = "mytrip.geo." + t.place.toLowerCase();
        try { geo = JSON.parse(localStorage.getItem(gk) || "null"); } catch {}
        if (!geo) {
          const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(t.place))).json();
          if (!g.results || !g.results.length) { slot.remove(); return; }
          geo = { lat: g.results[0].latitude, lon: g.results[0].longitude, name: g.results[0].name };
          try { localStorage.setItem(gk, JSON.stringify(geo)); } catch {}
        }
        const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${t.day}&end_date=${t.day}`)).json();
        w = { at: Date.now(), name: geo.name, now: f.current ? Math.round(f.current.temperature_2m) : null, code: t.ahead ? f.daily.weather_code[0] : (f.current ? f.current.weather_code : f.daily.weather_code[0]), max: Math.round(f.daily.temperature_2m_max[0]), min: Math.round(f.daily.temperature_2m_min[0]), rain: f.daily.precipitation_probability_max[0] };
        try { localStorage.setItem(key, JSON.stringify(w)); } catch {}
      } catch { if (!w) { slot.remove(); return; } }
    }
    const el = $("#weatherSlot"); if (!el) return;
    const [label, icon] = WMO[w.code] || ["Weather", "⛅"];
    const when = t.ahead ? `${displayDate(t.day, { weekday: "short", day: "numeric", month: "short" })} · first day` : "Today";
    const tip = w.rain >= 50 ? "Carry an umbrella" : (w.max >= 33 ? "Stay hydrated" : "Good day to be outside");
    el.classList.remove("weather-loading");
    el.innerHTML = `<span class="weather-icon" aria-hidden="true">${icon}</span><div class="weather-main"><b>${esc(w.name)} · ${t.ahead || w.now == null ? w.max : w.now}°</b><small>${when} · ${label} · ${w.min}°–${w.max}°</small></div><div class="weather-rain"><b>${w.rain ?? 0}%</b><small>rain</small></div><p class="weather-tip">${tip}</p>`;
  }

  function setOfflineState(offline) {
    document.body.classList.toggle("is-offline", !!offline);
    let bar = $("#offlineBar");
    if (offline && !bar) { bar = document.createElement("div"); bar.id = "offlineBar"; bar.setAttribute("role", "status"); bar.textContent = "Offline — showing your saved copy. Changes need internet."; document.body.appendChild(bar); }
    if (!offline && bar) bar.remove();
  }
  addEventListener("offline", () => { if (state.authenticated) setOfflineState(true); });
  addEventListener("online", () => { setOfflineState(false); if (state.authenticated && state.data && !state.demoMode) pullRefresh(true); });

  let pulling = false;
  async function pullRefresh(quiet = false) {
    if (pulling || !state.data || state.demoMode) return; pulling = true;
    try {
      const fresh = await api("getTrip", authPayload());
      if (fresh && fresh.trip && String(fresh.trip.tripId) === String(state.data.trip.tripId)) {
        const prevPerms = state.data.permissions;
        state.data = normalize(clone(fresh)); if (!state.data.permissions && prevPerms) state.data.permissions = prevPerms;
        saveOfflineTripCache({ ...(readOfflineTripCache(fresh.trip.tripId) || {}), data: state.data });
        hydrateShell(); render(); setOfflineState(false); if (!quiet) toast("Up to date");
      }
    } catch (error) { if (!quiet) toast(error.message, true); }
    pulling = false;
  }
  (function bindTouchGestures() {
    const mobile = () => matchMedia("(max-width: 760px)").matches;
    let sx = 0, sy = 0, row = null, pull = 0, mode = "", ind = null;
    document.addEventListener("touchstart", (e) => {
      if (!mobile() || !state.authenticated || e.touches.length !== 1) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; mode = ""; pull = 0;
      row = e.target.closest(".plan-row, .timeline-row");
      if (row && (!row.querySelector("[data-toggle-plan-done]") || row.querySelector("input, textarea") || e.target.closest("button, a, input, textarea, select, .plan-drag"))) row = null;
      if (!row && (document.scrollingElement.scrollTop > 0 || e.target.closest("#modal, input, textarea, .sticky-note"))) mode = "none";
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (mode === "none" || !e.touches.length) return;
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (!mode) { if (row && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) mode = "swipe"; else if (!row && dy > 12 && Math.abs(dy) > Math.abs(dx) && document.scrollingElement.scrollTop <= 0) mode = "pull"; else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) mode = "none"; }
      if (mode === "swipe") { const x = Math.max(-120, Math.min(120, dx)); row.style.transform = `translateX(${x}px)`; row.classList.toggle("swipe-done", x > 60); row.classList.toggle("swipe-delete", x < -60 && isAdmin()); }
      if (mode === "pull") { pull = Math.min(110, dy * 0.5); if (!ind) { ind = document.createElement("div"); ind.id = "pullIndicator"; document.body.appendChild(ind); } ind.classList.add("show"); ind.style.transform = `translate(-50%, ${pull}px)`; ind.textContent = pull > 64 ? "↻ Release to refresh" : "↓ Pull to refresh"; }
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (mode === "swipe" && row) {
        const x = parseFloat((row.style.transform.match(/-?[\d.]+/) || [0])[0]);
        const id = row.querySelector("[data-toggle-plan-done]").dataset.togglePlanDone;
        row.style.transform = ""; row.classList.remove("swipe-done", "swipe-delete");
        if (x > 60) { togglePlanDone(id); if (navigator.vibrate) navigator.vibrate(12); }
        else if (x < -60 && isAdmin()) { state.planRowDeleteId = id; render(); }
      }
      if (mode === "pull" && ind) { const go = pull > 64; ind.remove(); ind = null; if (go) pullRefresh(); }
      row = null; mode = ""; pull = 0;
    });
  })();

  const QUICK_PLANS = ["Flight", "Train", "Cab", "Check-in", "Check-out", "Breakfast", "Lunch", "Dinner", "Sightseeing", "Temple visit", "Beach", "Shopping"];
  function addQuickPlanChips() {
    const input = $("#modalBody input[name=\"title\"][placeholder=\"e.g. Sunset cruise\"]");
    if (!input || input.dataset.chips) return; input.dataset.chips = "1";
    const box = document.createElement("div"); box.className = "quick-plan-chips";
    box.innerHTML = QUICK_PLANS.map((p) => `<button type="button" data-quick-plan="${esc(p)}">${esc(p)}</button>`).join("");
    (input.closest("label") || input).insertAdjacentElement("afterend", box);
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-quick-plan]"); if (!b) return; const v = input.value.trim(); input.value = v && !QUICK_PLANS.includes(v) ? `${b.dataset.quickPlan} · ${v}` : b.dataset.quickPlan; input.focus(); box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-theme-set]"); if (t) { setTheme(t.dataset.themeSet); return; }
    if (e.target.closest("[data-night-toggle]")) { const c = themeChoice(); setTheme(c === "auto" ? "dark" : c === "dark" ? "light" : "auto"); toast("Night mode: " + (themeChoice() === "auto" ? "Auto (follows your device)" : themeChoice() === "dark" ? "On" : "Off")); }
  });

  /* Day map — OpenStreetMap + Leaflet, loaded only when opened (v4.36.0) */
  const planMapKey = "mytrip_plan_map_v1";
  const geoCacheKey = "mytrip_geo_cache_v1";
  function planMapOpen() { try { return localStorage.getItem(planMapKey) === "1"; } catch { return false; } }
  function planMapPoints(items) {
    return items.filter((item) => String(item.place || item.title || "").trim()).slice(0, 25);
  }
  function planMapSlot(items) {
    const pts = planMapPoints(items);
    const label = state.planDayFilter ? displayDate(state.planDayFilter, { weekday: "short", day: "numeric", month: "short" }) : "All days";
    return `<section class="plan-map-panel"><div class="plan-map-head"><b>Map · ${esc(label)}</b><small id="planMapStatus">${pts.length ? `${pts.length} stop${pts.length > 1 ? "s" : ""}` : "Add a place to a plan to see it here"}</small></div><div id="planMap" class="plan-map"></div><small class="plan-map-credit">Map © OpenStreetMap contributors</small></section>`;
  }
  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.async = true;
      s.onload = () => resolve(window.L); s.onerror = () => { leafletPromise = null; reject(new Error("Map could not load. Check the internet connection.")); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }
  function geoCache() { try { return JSON.parse(localStorage.getItem(geoCacheKey) || "{}"); } catch { return {}; } }
  function saveGeoCache(cache) { try { const keys = Object.keys(cache); if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete cache[k]); localStorage.setItem(geoCacheKey, JSON.stringify(cache)); } catch {} }
  let geoQueue = Promise.resolve();
  function geocode(query) {
    const key = query.toLowerCase().trim();
    const cache = geoCache();
    if (Object.prototype.hasOwnProperty.call(cache, key)) return Promise.resolve(cache[key]);
    geoQueue = geoQueue.then(() => new Promise((r) => setTimeout(r, 1100))).then(async () => {
      const c = geoCache(); if (Object.prototype.hasOwnProperty.call(c, key)) return c[key];
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
        const list = res.ok ? await res.json() : [];
        const hit = list && list[0] ? [Number(list[0].lat), Number(list[0].lon)] : null;
        c[key] = hit; saveGeoCache(c); return hit;
      } catch { return undefined; }
    });
    return geoQueue;
  }
  let planMapInstance = null; let planMapRun = 0;
  async function initPlanMap() {
    const el = $("#planMap"); if (!el) return;
    const run = ++planMapRun;
    const all = sortedPlans();
    const items = planMapPoints(state.planDayFilter ? all.filter((i) => i.date === state.planDayFilter) : all);
    const status = $("#planMapStatus");
    let L;
    try { L = await loadLeaflet(); } catch (error) { if (status) status.textContent = error.message; return; }
    if (run !== planMapRun || !document.body.contains(el)) return;
    if (planMapInstance) { try { planMapInstance.remove(); } catch {} }
    const map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    planMapInstance = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, subdomains: "abc" }).addTo(map);
    const dest = String((state.data.trip && state.data.trip.destination) || "").trim();
    const home = dest ? await geocode(dest) : null;
    if (run !== planMapRun) return;
    map.setView(home || [20.59, 78.96], home ? 11 : 4);
    const layer = L.layerGroup().addTo(map); const line = [];
    let found = 0;
    for (let n = 0; n < items.length; n++) {
      const item = items[n];
      const place = String(item.place || item.title || "").trim();
      const query = dest && !place.toLowerCase().includes(dest.toLowerCase()) ? `${place}, ${dest}` : place;
      if (status) status.textContent = `Finding places… ${n + 1}/${items.length}`;
      let pt = await geocode(query);
      if (!pt && query !== place) pt = await geocode(place);
      if (run !== planMapRun) return;
      if (!pt) continue;
      found++; line.push(pt);
      const done = String(item.status || "").toLowerCase() === "done" || item.done === true || item.done === "true";
      const icon = L.divIcon({ className: "plan-pin-wrap", html: `<span class="plan-pin${done ? " done" : ""}">${n + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const dirs = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
      L.marker(pt, { icon }).addTo(layer).bindPopup(`<b>${esc(item.title || place)}</b><br><small>${esc([displayDate(item.date, { day: "numeric", month: "short" }), item.time].filter(Boolean).join(" · "))}</small><br><a href="${dirs}" target="_blank" rel="noopener">Directions ↗</a>`);
    }
    if (line.length > 1) L.polyline(line, { color: "#0F6E6A", weight: 3, opacity: .6, dashArray: "6 6" }).addTo(layer);
    if (line.length) map.fitBounds(L.latLngBounds(line).pad(0.25), { maxZoom: 15 });
    if (status) status.textContent = items.length ? `${found} of ${items.length} stop${items.length > 1 ? "s" : ""} on map${found < items.length ? " · add a clearer place name for the rest" : ""}` : "Add a place to a plan to see it here";
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 120);
  }
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-plan-map]")) return;
    try { localStorage.setItem(planMapKey, planMapOpen() ? "0" : "1"); } catch {}
    render();
  });

  /* Spending by category (v4.37.0) */
  const SPEND_COLORS = ["#0F6E6A", "#E0A526", "#4B3F99", "#C4553F", "#2F7FB8", "#7A8C84", "#B0548A", "#9AA1AB"];
  function renderSpendChart(total, budget) {
    if (!total) return "";
    const map = new Map();
    state.data.expenses.forEach((e) => { const k = String(e.category || "Other").trim() || "Other"; map.set(k, (map.get(k) || 0) + Number(e.amount || 0)); });
    let cats = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (cats.length > 7) { const rest = cats.slice(6).reduce((s, [, v]) => s + v, 0); cats = [...cats.slice(0, 6), ["Other", rest]]; }
    let acc = 0;
    const stops = cats.map(([, v], i) => { const from = acc / total * 100; acc += v; return `${SPEND_COLORS[i % SPEND_COLORS.length]} ${from.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`; }).join(",");
    const used = budget ? Math.round(total / budget * 100) : 0;
    const legend = cats.map(([k, v], i) => `<li><i style="background:${SPEND_COLORS[i % SPEND_COLORS.length]}"></i><span>${esc(k)}</span><b>${money.format(Math.round(v))}</b><small>${Math.round(v / total * 100)}%</small></li>`).join("");
    return `<section class="spend-chart"><div class="spend-ring" style="background:conic-gradient(${stops})"><div><b>${budget ? used + "%" : money.format(Math.round(total))}</b><small>${budget ? "OF BUDGET" : "SPENT"}</small></div></div><div class="spend-legend"><span class="kicker">WHERE THE MONEY WENT</span><ul>${legend}</ul></div>${spendByDay()}</section>`;
  }

  function spendByDay() {
    const m = new Map();
    state.data.expenses.forEach((e) => { const d = String(e.date || "").slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + Number(e.amount || 0)); });
    const days = [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14);
    if (days.length < 2) return "";
    const max = Math.max(...days.map(([, v]) => v)) || 1; const top = days.reduce((a, b) => b[1] > a[1] ? b : a)[0];
    const bars = days.map(([d, v]) => `<li title="${esc(d)} · ${money.format(Math.round(v))}" class="${d === top ? "is-top" : ""}"><i style="height:${Math.max(6, Math.round(v / max * 100))}%"></i><small>${esc(d.slice(8, 10))}</small></li>`).join("");
    return `<div class="spend-days"><span class="kicker">BY DAY · avg ${money.format(Math.round(days.reduce((s, [, v]) => s + v, 0) / days.length))}</span><ul>${bars}</ul></div>`;
  }
  /* Quick add: "Wed 10am backwater cruise at Poovar" (v4.37.0) */
  function quickAddBar() {
    return `<form class="quick-add" data-quick-add><span class="quick-add-ico">＋</span><input name="q" autocomplete="off" placeholder="Quick add: Wed 10am backwater cruise at Poovar" aria-label="Quick add a plan"><button type="submit">Add</button><small class="quick-add-hint" id="quickAddHint">Type a day, time and what. Paste several lines to add many.</small></form>`;
  }
  function tripDates() {
    const t = state.data.trip; const out = [];
    const s = new Date(`${t.startDate}T12:00:00`), e = new Date(`${t.endDate || t.startDate}T12:00:00`);
    if (isNaN(s)) return out;
    for (let d = new Date(s); d <= e && out.length < 120; d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  }
  function parseQuickPlan(text) {
    let s = " " + String(text || "").replace(/\s+/g, " ").trim() + " ";
    const dates = tripDates();
    const fallback = state.planDayFilter || dates[0] || new Date().toISOString().slice(0, 10);
    let date = "", time = "";
    const take = (re, fn) => { const m = s.match(re); if (m) { const v = fn(m); if (v) { s = s.replace(m[0], " "); return v; } } return ""; };
    const iso = (d) => d.toISOString().slice(0, 10);
    time = take(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i, (m) => { let h = Number(m[1]) % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2] || "00"}`; })
      || take(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/, (m) => `${m[1].padStart(2, "0")}:${m[2]}`);
    date = take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => `${m[1]}-${m[2]}-${m[3]}`)
      || take(/\bday\s*(\d{1,2})\b/i, (m) => dates[Number(m[1]) - 1] || "")
      || take(/\b(today|tomorrow)\b/i, (m) => { const d = new Date(); if (/tomorrow/i.test(m[1])) d.setDate(d.getDate() + 1); return iso(d); })
      || take(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\/.-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})[a-z]*\.?(?:[\s\/.-](\d{4}|\d{2}(?![:.]\d)))?\b/i, (m) => {
          const months = "janfebmaraprmayjunjulaugsepoctnovdec"; const mon = isNaN(m[2]) ? months.indexOf(m[2].slice(0, 3).toLowerCase()) / 3 : Number(m[2]) - 1;
          if (mon < 0 || mon > 11) return ""; const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number((dates[0] || iso(new Date())).slice(0, 4));
          const d = new Date(y, mon, Number(m[1]), 12); return isNaN(d) ? "" : iso(d); })
      || take(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i, (m) => { const w = "sunmontuewedthufrisat".indexOf(m[1].slice(0, 3).toLowerCase()) / 3; return dates.find((d) => new Date(`${d}T12:00:00`).getDay() === w) || ""; });
    s = s.replace(/\s+/g, " ").trim().replace(/^[-–·,:]+|[-–·,:]+$/g, "").trim();
    let place = "";
    const at = s.match(/^(.*\S)\s+(?:at|@|in)\s+(.+)$/i);
    if (at) { s = at[1]; place = at[2]; }
    const flight = s.match(/\b([A-Z0-9]{2})\s?(\d{2,4})\b/);
    let category = "";
    if (flight && /flight|pnr|dep|arr|→|->/i.test(text)) { category = "Travel"; if (!/flight/i.test(s)) s = `Flight ${flight[1]} ${flight[2]}`; }
    const title = s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    return { date: date || fallback, time, title, place, category };
  }
  async function submitQuickAdd(form) {
    const input = form.querySelector('input[name="q"]'); const btn = form.querySelector("button");
    const lines = String(input.value || "").split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    const plans = lines.map(parseQuickPlan).filter((p) => p.title);
    if (!plans.length) return toast("Type what the plan is, e.g. Wed 10am backwater cruise", true);
    btn.disabled = true; btn.textContent = "Adding…";
    try {
      for (const p of plans) {
        const record = { id: uid(), date: p.date, time: p.time, title: p.title, place: p.place, notes: "", category: p.category, status: "", bookingRef: "", cost: "", sortOrder: nextPlanSortOrder(p.date), createdBy: state.currentUser };
        if (!state.demoMode) await api("addPlan", authPayload({ record }));
        state.data.itinerary.push(record);
      }
      toast(plans.length > 1 ? `${plans.length} plans added` : `Added · ${plans[0].title} on ${displayDate(plans[0].date, { weekday: "short", day: "numeric", month: "short" })}`);
      render();
    } catch (error) { toast(error.message, true); btn.disabled = false; btn.textContent = "Add"; }
  }
  document.addEventListener("submit", (event) => { const f = event.target.closest && event.target.closest("[data-quick-add]"); if (!f) return; event.preventDefault(); submitQuickAdd(f); });
  document.addEventListener("input", (event) => {
    const f = event.target.closest && event.target.closest("[data-quick-add]"); if (!f) return;
    const hint = $("#quickAddHint"); if (!hint) return;
    const v = event.target.value.trim(); if (!v) { hint.textContent = "Type a day, time and what. Paste several lines to add many."; return; }
    const p = parseQuickPlan(v.split(/\n|;/)[0]);
    hint.innerHTML = [`📅 ${esc(displayDate(p.date, { weekday: "short", day: "numeric", month: "short" }))}`, p.time ? `🕙 ${esc(p.time)}` : "", p.place ? `📍 ${esc(p.place)}` : "", p.title ? `<b>${esc(p.title)}</b>` : ""].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
  });
  document.addEventListener("paste", (event) => {
    const input = event.target; if (!input.closest || !input.closest("[data-quick-add]")) return;
    const text = (event.clipboardData || window.clipboardData).getData("text");
    if (text && /\n/.test(text.trim())) { event.preventDefault(); input.value = text.trim().split(/\r?\n/).filter(Boolean).join("; "); input.dispatchEvent(new Event("input", { bubbles: true })); }
  });

  let lastCrashToast = 0;
  function reportCrash(reason) {
    try { console.error("MyTrip:", reason); } catch {}
    const now = Date.now(); if (now - lastCrashToast < 8000) return; lastCrashToast = now;
    try { toast(reason && reason.message ? reason.message : String(reason || ""), true); } catch {}
  }
  window.addEventListener("error", (event) => { if (event && event.target && event.target !== window) return; reportCrash(event.error || event.message); });
  window.addEventListener("unhandledrejection", (event) => { reportCrash(event.reason); });

  function render() {
    try { renderInner(); } catch (error) { reportCrash(error); try { $("#view").innerHTML = `<section class="crash-card"><h2>This screen didn't open</h2><p>Nothing is lost. Tap Try again, or open another tab.</p><button type="button" onclick="location.reload()">Try again</button></section>`; } catch {} }
  }
  function renderInner() {
    if (!state.data) { try { hideTabbar(); } catch (error) {} return; }
    const renderers = { overview: renderOverview, itinerary: renderItinerary, experiences: renderExperiences, photos: renderPhotos, places: renderPlaces, expenses: renderExpenses, people: renderPeople, checklist: renderChecklist, print: renderPrint, help: renderHelp };
    $("#view").innerHTML = accessNotice() + (state.tab === "overview" ? greetingStrip() + rateReminder() + weatherSlot() : "") + renderers[state.tab]();
    maybeWelcome(); if (state.tab === "overview") loadWeather();
    if (state.tab === "itinerary" && planMapOpen()) { try { initPlanMap(); } catch (error) {} }
    try { applyLineIcons(); } catch {} try { updateTabbar(); } catch {}
    if (state.tab === "itinerary") { bindPlanColumnResizers(); bindPlanRowDragging(); }
    if (state.tab === "expenses") bindExpenseColumnResizers();
    const printMenu = $(".plan-print-menu");
    if (printMenu) printMenu.addEventListener("toggle", () => { state.printMenuOpen = printMenu.open; });
  }

  function handleViewClick(event) {
    const button = event.target.closest("button,[data-map]");
    if (!button || !$("#view").contains(button)) return;
    if (button.dataset.go) return setTab(button.dataset.go);
    if (button.dataset.add) return showAddModal(button.dataset.add);
    if (button.dataset.print === "expenses" && !button.hasAttribute("data-xp-go")) { if (proLocked("personPrint")) state.printPerson = ""; return showExpensePrintSheet(); }
    if (button.dataset.print) { if (button.hasAttribute("data-xp-go")) closeModal(); return printReport(button.dataset.print); }
    if (button.dataset.map) return openMap(button.dataset.map);
    if (button.hasAttribute("data-invite")) return showInvite();
    if (button.hasAttribute("data-all-trips")) return showAllTrips();
    if (button.hasAttribute("data-my-trips")) return showMyTrips();
    if (button.hasAttribute("data-security")) return showSecurity();
    if (button.hasAttribute("data-open-sticky")) return openStickyPanel();
    if (button.hasAttribute("data-open-quick-find")) return openQuickFind();
    if (button.hasAttribute("data-edit")) return showEditRecord(button.dataset.sheet, button.dataset.id);
    if (button.dataset.viewExpense) return showExpenseDetails(button.dataset.viewExpense);
    if (button.dataset.rowEditExpense) { state.expenseRowEditId = button.dataset.rowEditExpense; return render(); }
    if (button.dataset.movePlan) return movePlanRow(button.dataset.movePlan, Number(button.dataset.direction));
    if (button.hasAttribute("data-plan-view")) return togglePlanView();
    if (button.dataset.sortPlanTime !== undefined) return sortPlansByTime(button.dataset.sortPlanTime);
    if (button.dataset.planPay) return showPlanPayment(button.dataset.planPay);
    if (button.dataset.togglePlanDone) return togglePlanDone(button.dataset.togglePlanDone);
    if (button.dataset.experiencePhoto) { const item = state.data.experiences.find((e) => String(e.id) === String(button.dataset.experiencePhoto)); if (item && item.photoUrl) { showModal(item.place || "Trip photo", `<div class="trip-photo-view"><img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async"><div><span>MEMORY</span><h3>${esc(item.place || "A trip memory")}</h3></div><div class="form-actions"><button type="button" data-cancel>Close</button>${canEditRecords("ExperienceNotes") ? `<button type="button" data-edit data-sheet="ExperienceNotes" data-id="${esc(item.id)}">Edit</button>` : ""}</div></div>`); $('[data-cancel]').addEventListener("click", closeModal); } return; }
    if (button.dataset.planPhoto) { const item = sortedPlans().find((p) => String(p.id) === String(button.dataset.planPhoto)); if (item && item.photoUrl) { showModal(item.title || "Preview photo", `<div class="trip-photo-view"><img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async"><div><span>PREVIEW</span><h3>${esc(item.title || "")}</h3>${item.place ? `<p>⌖ ${esc(item.place)}</p>` : ""}</div><div class="form-actions"><button type="button" data-cancel>Close</button>${canEditRecords("Itinerary") ? `<button type="button" data-edit data-sheet="Itinerary" data-id="${esc(item.id)}">Edit</button>` : ""}</div></div>`); $('[data-cancel]').addEventListener("click", closeModal); } return; }
    if (button.dataset.duplicatePlan) return duplicatePlanRow(button.dataset.duplicatePlan);
    if (button.dataset.planDay !== undefined) { state.planDayFilter = button.dataset.planDay; return render(); }
    if (button.dataset.printDay) return printReport("itinerary", button.dataset.printDay);
    if (button.dataset.rowDeletePlan) { if (!isAdmin()) return toast("Administrator access is required to delete an itinerary row", true); state.planRowEditId = ""; state.planRowDeleteId = button.dataset.rowDeletePlan; return render(); }
    if (button.hasAttribute("data-cancel-plan-delete")) { state.planRowDeleteId = ""; return render(); }
    if (button.dataset.confirmPlanDelete) return deletePlanRow(button.dataset.confirmPlanDelete);
    if (button.closest(".plan-print-menu")) state.printMenuOpen = true;
    if (button.dataset.printWidth) return stepPrintWidth(Number(button.dataset.printWidth));
    if (button.dataset.printLayout) return setPrintLayout(button.dataset.printLayout);
    if (button.dataset.printAlign) return setPrintAlign(button.dataset.printAlign);
    if (button.hasAttribute("data-reset-plan-columns")) { savePlanColumns([...planColumnDefaults]); return render(); }
    if (button.hasAttribute("data-reset-expense-columns")) { saveExpenseColumns([...expenseColumnDefaults]); return render(); }
    if (button.hasAttribute("data-print-wrap")) return togglePrintWrap();
    if (button.dataset.rowEditPlan) { state.planRowEditId = button.dataset.rowEditPlan; return render(); }
    if (button.hasAttribute("data-cancel-plan-row")) { state.planRowEditId = ""; state.planAddDate = ""; return render(); }
    if (button.dataset.addPlanRow !== undefined) { if (!canAdd("plan")) return toast("Adding itinerary rows is not allowed for this account", true); state.planRowEditId = ""; state.planAddDate = button.dataset.addPlanRow || state.data.trip.startDate || localDateKey(); return render(); }
    if (button.hasAttribute("data-cancel-expense-row")) { state.expenseRowEditId = ""; return render(); }
    if (button.dataset.deleteExpense) return showDeleteExpenseConfirmation(button.dataset.deleteExpense);
    if (button.dataset.givePin) return showAddTravellersToCurrentTrip(state.data.members.find((member) => String(member.id) === String(button.dataset.givePin)));
    if (button.dataset.resetMemberPin) return showResetCurrentTravellerPin(state.data.members.find((member) => String(member.id) === String(button.dataset.resetMemberPin)));
    if (button.dataset.featureAccess) return showTravellerFeatureAccess(state.data.members.find((member) => String(member.id) === String(button.dataset.featureAccess)));
    if (button.hasAttribute("data-trip-photo")) return showTripPhotoSettings();
    if (button.hasAttribute("data-add-trip-photo")) return showTripGalleryPhotoEditor();
    if (button.dataset.editCaption) return editPhotoCaption(state.data.photos.find((photo) => String(photo.id) === String(button.dataset.editCaption)));
    if (button.dataset.replacePhoto) return showTripGalleryPhotoEditor(state.data.photos.find((photo) => String(photo.id) === String(button.dataset.replacePhoto)));
    if (button.dataset.deletePhoto) return showDeleteTripGalleryPhoto(state.data.photos.find((photo) => String(photo.id) === String(button.dataset.deletePhoto)));
    if (button.dataset.openPhoto) return showTripGalleryPhoto(state.data.photos.find((photo) => String(photo.id) === String(button.dataset.openPhoto)));
    if (button.hasAttribute("data-toggle-photo-uploads")) return toggleTripPhotoUploads();
    if (button.hasAttribute("data-add-existing-travellers")) return showAddExistingTravellersToCurrentTrip();
    if (button.hasAttribute("data-manage-current-trip")) return showCurrentTripTravellerAccess();
    if (button.dataset.removeTripMember) return showRemoveTravellerFromCurrentTrip(state.data.members.find((member) => String(member.id) === String(button.dataset.removeTripMember)));
    if (button.hasAttribute("data-delete")) return deleteItem(button.dataset.sheet, button.dataset.id);
    if (button.id === "mapSearchButton") {
      state.mapQuery = $("#mapQuery").value.trim() || state.data.trip.destination;
      openMap(state.mapQuery); render();
    }
  }

  function handleViewSubmit(event) {
    if (event.target.matches("[data-expense-row-form]")) saveExpenseRow(event);
    if (event.target.matches("[data-plan-row-form]")) savePlanRow(event);
  }

  function openMap(query) { window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer"); }
  function showModal(title, html) {
    const accountWording = String(html)
      .replaceAll("Edit PIN", "Edit password")
      .replaceAll("personal PIN", "personal password")
      .replaceAll("Their PIN", "Their password")
      .replaceAll("their PIN", "their password")
      .replaceAll("Traveller PIN", "shared trip password")
      .replaceAll("shared trip-PIN users", "shared one-trip users")
      .replaceAll("password/PIN", "password");
    closeQuickFind();
    setTimeout(addQuickPlanChips, 30);
    requestAnimationFrame(addModalTextSizeControl);
    $("#modalTitle").textContent = title; $("#modalBody").innerHTML = accountWording; $("#modal").classList.remove("hidden");
    document.body.classList.add("overlay-open");
    requestAnimationFrame(() => $("#closeModal").focus());
  }
  function closeModal() { $("#modal").classList.add("hidden"); $("#modalBody").innerHTML = ""; if ($("#quickFindLayer").classList.contains("hidden")) document.body.classList.remove("overlay-open"); }
  const actions = `<div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save for everyone</button></div>`;

  function stickyStorageKey() {
    const tripId = state.data && state.data.trip ? String(state.data.trip.tripId || "TRIP") : "TRIP";
    return `${stickyStoragePrefix}:${tripId}`;
  }

  /* Google's text cleaner strips control characters, and \n is one of them.
     Sticky details therefore travel as U+2028 LINE SEPARATOR, which survives
     every backend build, and are decoded back to \n for display and editing. */
  const stickyLineSeparator = "\u2028";
  const encodeStickyText = (text) => String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n").join(stickyLineSeparator);
  const decodeStickyText = (text) => String(text == null ? "" : text).replace(/\r\n?/g, "\n").replace(/\u2029/g, stickyLineSeparator).split(stickyLineSeparator).join("\n");

  function normaliseSticky(note, index) {
    const value = note || {};
    return {
      id: String(value.id || uid()),
      type: value.type === "Reminder" ? "Reminder" : "Target",
      title: String(value.title || "Untitled note").slice(0, 120),
      body: decodeStickyText(value.body || value.details).slice(0, 2000),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.dueDate || "")) ? String(value.dueDate) : "",
      colour: stickyColours.includes(value.colour) ? value.colour : stickyColours[index % stickyColours.length],
      pinned: value.pinned === true || /^(true|1|yes)$/i.test(String(value.pinned || "")),
      completed: value.completed === true || /^(true|1|yes)$/i.test(String(value.completed || "")),
      x: Number.isFinite(Number(value.x)) ? Number(value.x) : Math.max(270, innerWidth - 390 - index * 22),
      y: Number.isFinite(Number(value.y)) ? Number(value.y) : 118 + index * 28,
      width: Math.min(520, Math.max(260, Number(value.width) || 330)),
      height: Math.min(620, Math.max(190, Number(value.height) || 260)),
      createdAt: String(value.createdAt || new Date().toISOString()),
      updatedAt: String(value.updatedAt || value.createdAt || ""),
      completedAt: String(value.completedAt || ""),
      completedBy: String(value.completedBy || "")
    };
  }

  /**
   * One note per id. If older builds left two copies of the same note (same
   * title), show only the most recently SAVED copy — never the longest one.
   * Showing the longest copy was why an edit looked lost after re-login and
   * why an unpinned note kept popping back: the other, stale copy was shown.
   */
  function dedupeStickyNotes(list) {
    const byId = new Map();
    list.forEach((note) => { if (!byId.has(String(note.id))) byId.set(String(note.id), note); });
    const byTitle = new Map();
    [...byId.values()].forEach((note) => {
      const key = note.title.trim().toLowerCase();
      const rival = byTitle.get(key);
      if (!rival || String(note.updatedAt || note.createdAt) > String(rival.updatedAt || rival.createdAt)) byTitle.set(key, note);
    });
    return [...byTitle.values()];
  }

  /* floatingStickyCard() clamps to the viewport at paint time, so a window
     resize only needs a repaint — the authored position is never rewritten. */
  function reflowStickyNotes() { renderStickyNotes(); }

  function loadStickyNotes() {
    if (state.data && !state.demoMode) {
      stickyNotes = dedupeStickyNotes((state.data.stickyNotes || []).map((note, index) => normaliseSticky({ ...note, body: note.details || note.body }, index)));
      renderStickyNotes();
      migrateDeviceStickyNotes();
      return;
    }
    let parsed = [];
    try { parsed = JSON.parse(localStorage.getItem(stickyStorageKey()) || "[]"); } catch { parsed = []; }
    stickyNotes = Array.isArray(parsed) ? parsed.map(normaliseSticky) : [];
    renderStickyNotes();
  }

  /**
   * One-time lift: notes left in this browser move into the shared Google Sheet.
   * Runs ONCE per trip per browser and skips any note whose id or title already
   * exists on the server — matching on title+body used to re-upload an older,
   * shorter copy of a note as a duplicate.
   */
  async function migrateDeviceStickyNotes() {
    if (stickyMigrationRunning || state.demoMode || !canWriteStickyNotes()) return;
    const doneKey = `${stickyStorageKey()}:migrated`;
    if (localStorage.getItem(doneKey)) { try { localStorage.removeItem(stickyStorageKey()); } catch {} return; }
    let parsed = [];
    try { parsed = JSON.parse(localStorage.getItem(stickyStorageKey()) || "[]"); } catch { parsed = []; }
    const serverIds = new Set(stickyNotes.map((item) => String(item.id)));
    const serverTitles = new Set(stickyNotes.map((item) => item.title.trim().toLowerCase()));
    const legacy = dedupeStickyNotes((Array.isArray(parsed) ? parsed : []).filter((note) => !note.completed).map(normaliseSticky))
      .filter((note) => !serverIds.has(String(note.id)) && !serverTitles.has(note.title.trim().toLowerCase()));
    try { localStorage.setItem(doneKey, new Date().toISOString()); } catch {}
    if (!legacy.length) { try { localStorage.removeItem(stickyStorageKey()); } catch {} return; }
    stickyMigrationRunning = true;
    let moved = 0;
    for (const note of legacy) {
      const saved = await persistStickyPosition(note);
      if (saved) { stickyNotes.push(normaliseSticky({ ...saved, body: saved.details }, stickyNotes.length)); moved++; }
    }
    stickyMigrationRunning = false;
    try { localStorage.removeItem(stickyStorageKey()); } catch {}
    if (moved) { renderStickyNotes(); toast(`${moved} sticky ${moved === 1 ? "note" : "notes"} moved into the shared trip sheet`); }
  }

  /** Re-seats every pinned note inside the current window and saves the position. */
  async function recallPinnedStickyNotes() {
    const pinned = stickyNotes.filter((note) => note.pinned && !note.completed);
    if (!pinned.length) return toast("No pinned notes to bring back");
    try { localStorage.setItem(pinnedScreenKey, "on"); } catch {}
    /* Tile the notes into a real grid, shrinking them (down to a readable
       minimum) so that every pinned note fits on screen at once. If even the
       minimum size cannot fit them all, the remainder cascades — and
       click-to-front then reaches any of them in one tap. */
    const gap = 12;
    const top = 96;
    const left = innerWidth < 1100 ? gap : 220;
    const areaWidth = innerWidth - left - gap;
    const areaHeight = innerHeight - top - gap;
    const minWidth = 260, minHeight = 190;

    let columns = Math.max(1, Math.min(pinned.length, Math.floor((areaWidth + gap) / (minWidth + gap))));
    let rows = Math.ceil(pinned.length / columns);
    while (rows * (minHeight + gap) - gap > areaHeight && columns < pinned.length) {
      columns += 1;
      rows = Math.ceil(pinned.length / columns);
    }
    const cellWidth = Math.floor((areaWidth - gap * (columns - 1)) / columns);
    const cellHeight = Math.floor((areaHeight - gap * (rows - 1)) / rows);
    const fits = cellWidth >= minWidth && cellHeight >= minHeight;

    let cascade = 0;
    pinned.forEach((note, index) => {
      if (fits) {
        note.width = Math.min(Math.max(note.width, minWidth), cellWidth);
        note.height = Math.min(Math.max(note.height, minHeight), cellHeight);
        note.x = left + (index % columns) * (cellWidth + gap);
        note.y = top + Math.floor(index / columns) * (cellHeight + gap);
        return;
      }
      note.width = Math.min(note.width, Math.max(minWidth, areaWidth));
      note.height = Math.min(note.height, Math.max(minHeight, areaHeight));
      note.x = Math.max(gap, Math.min(innerWidth - note.width - gap, left + cascade * 30));
      note.y = Math.max(top, Math.min(innerHeight - note.height - gap, top + cascade * 30));
      cascade++;
    });
    renderStickyNotes();
    if (canWriteStickyNotes()) await Promise.all(pinned.map((note) => persistStickyPosition(note)));
    toast(`${pinned.length} pinned ${pinned.length === 1 ? "note" : "notes"} brought into view`);
  }

  let stickyRefreshAt = 0;
  let stickyRefreshing = false;
  const stickyPendingSaves = new Set();
  let stickyLocalChangeAt = 0;
  function markStickyChanged() { stickyLocalChangeAt = Date.now(); }
  function stickySignature(list) {
    return JSON.stringify(list.map((note) => [note.id, note.title, note.body, note.pinned, note.colour, note.dueDate, Math.round(note.x), Math.round(note.y), Math.round(note.width), Math.round(note.height)]));
  }
  function stickyEditingNow() {
    const active = document.activeElement;
    return Boolean((active && active.closest && active.closest("[data-sticky-inline], #stickyEditorForm, .floating-sticky")) || $("#stickyEditorForm"));
  }

  /**
   * Pulls the sticky board straight from the Google Sheet and repaints it.
   * The shared board is the one thing two people edit at the same time, so it
   * is never trusted from a cached bundle — a stale copy was showing an older
   * version of a note (an earlier line count) on the second machine.
   */
  async function refreshStickyNotes(force = false) {
    if (state.demoMode || !state.data || stickyRefreshing) return;
    if (!force && Date.now() - stickyRefreshAt < 4000) return;
    if (stickyPendingSaves.size || stickyEditingNow() || Date.now() - stickyLocalChangeAt < 10000) return;
    stickyRefreshing = true;
    const badge = $("#stickyRefreshButton");
    if (badge) badge.classList.add("busy");
    try {
      const fresh = await api("getTrip", authPayload());
      if (fresh && fresh.trip && String(fresh.trip.tripId) === String(state.data.trip.tripId)) {
        stickyRefreshAt = Date.now();
        if (stickyPendingSaves.size || stickyEditingNow() || Date.now() - stickyLocalChangeAt < 10000) return;
        const before = stickySignature(stickyNotes);
        state.data.stickyNotes = fresh.stickyNotes || [];
        state.data.stickyDiary = fresh.stickyDiary || [];
        const next = dedupeStickyNotes(state.data.stickyNotes.map((note, index) => normaliseSticky({ ...note, body: note.details || note.body }, index)));
        if (stickySignature(next) !== before) { stickyNotes = next; renderStickyNotes(); }
      }
    } catch {} finally {
      stickyRefreshing = false;
      if (badge) badge.classList.remove("busy");
    }
  }

  function stickyRecord(note) {
    return { id: note.id, type: note.type, title: note.title, details: encodeStickyText(note.body), dueDate: note.dueDate, colour: note.colour, pinned: note.pinned, x: Math.round(note.x), y: Math.round(note.y), width: Math.round(note.width), height: Math.round(note.height), createdAt: note.createdAt };
  }

  function mirrorStickyNotes() {
    if (state.data) state.data.stickyNotes = stickyNotes.map(stickyRecord);
  }

  let lastStickyError = "";

  /** Saves one shared note to the trip's StickyNotes Google Sheet so everyone sees it. */
  /**
   * Saves a note. Moving or resizing passes geometryOnly, which sends just the
   * position fields — a browser holding a stale copy of the text can no longer
   * overwrite a newer version simply by dragging the note.
   */
  async function persistStickyPosition(note) {
    if (!note || state.demoMode || !canWriteStickyNotes()) return null;
    markStickyChanged();
    const pendingKey = `pos:${note.id}:${Date.now()}`;
    stickyPendingSaves.add(pendingKey);
    try {
      return await api("saveStickyNote", authPayload({
        record: { id: note.id, title: note.title, pinned: note.pinned, x: Math.round(note.x), y: Math.round(note.y), width: Math.round(note.width), height: Math.round(note.height) },
        geometryOnly: true,
        author: state.currentUser
      }));
    } catch { return null; }
    finally { stickyPendingSaves.delete(pendingKey); markStickyChanged(); }
  }

  async function persistSticky(note, silent = false) {
    if (!note) return null;
    if (state.demoMode) { saveStickyNotes(); mirrorStickyNotes(); return note; }
    markStickyChanged();
    const pendingKey = `${note.id}:${Date.now()}:${Math.random()}`;
    stickyPendingSaves.add(pendingKey);
    try { return await persistStickyNow(note, silent); }
    finally { stickyPendingSaves.delete(pendingKey); markStickyChanged(); }
  }

  async function persistStickyNow(note, silent) {
    try {
      const saved = await api("saveStickyNote", authPayload({ record: stickyRecord(note), author: state.currentUser }));
      note.id = saved.id; note.createdAt = saved.createdAt || note.createdAt; note.updatedAt = saved.updatedAt || new Date().toISOString();
      /* Confirm the sheet kept every line, rather than trusting the request. */
      const storedBody = decodeStickyText(saved.details);
      const trim = (text) => String(text).replace(/\n+$/, "");
      if (trim(storedBody) !== trim(note.body)) {
        const lost = trim(note.body).length - trim(storedBody).length;
        note.body = storedBody;
        if (!silent && lost > 0) toast("Saved, but the trip sheet shortened the text — showing what was stored", true);
      } else {
        note.body = storedBody;
      } note.saved = true;
      mirrorStickyNotes();
      return saved;
    } catch (error) {
      lastStickyError = error.message || "The trip sheet did not accept the note.";
      if (/not found|no sticky/i.test(lastStickyError)) {
        try {
          const record = stickyRecord(note); delete record.id;
          const rescued = await api("saveStickyNote", authPayload({ record, author: state.currentUser }));
          note.id = rescued.id; mirrorStickyNotes(); lastStickyError = "";
          return rescued;
        } catch (retryError) { lastStickyError = retryError.message || lastStickyError; }
      }
      if (!silent) toast(lastStickyError, true);
      return null;
    }
  }

  function saveStickyNotes() {
    if (!state.demoMode) return;
    try { localStorage.setItem(stickyStorageKey(), JSON.stringify(stickyNotes)); }
    catch { toast("This browser could not save sticky notes", true); }
  }

  const stickyTabPositionKey = "mytrip_sticky_tab_position_v1";

  function applyStickyTabPosition() {
    const tab = $("#stickyEdgeTab");
    if (!tab) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(stickyTabPositionKey) || "null"); } catch { saved = null; }
    if (!saved || !Number.isFinite(Number(saved.x)) || !Number.isFinite(Number(saved.y))) return;
    /* offsetWidth is 0 while the tab is still hidden, so fall back to its real size
       — otherwise the clamp parks the launcher off the bottom-right of the screen. */
    const width = tab.offsetWidth || 42;
    const height = tab.offsetHeight || 132;
    const x = Math.max(2, Math.min(Math.max(2, innerWidth - width - 2), Number(saved.x)));
    const y = Math.max(60, Math.min(Math.max(60, innerHeight - height - 8), Number(saved.y)));
    tab.style.left = `${Math.round(x)}px`;
    tab.style.top = `${Math.round(y)}px`;
    tab.style.right = "auto";
    tab.style.bottom = "auto";
    tab.style.transform = "rotate(180deg)";
  }

  /** The Administrator can drag the sticky launcher anywhere on the screen. */
  function makeStickyTabDraggable() {
    const tab = $("#stickyEdgeTab");
    if (!tab || tab.dataset.draggable === "true") return;
    tab.dataset.draggable = "true";
    let moved = false;
    tab.addEventListener("pointerdown", (event) => {
      if (!isAdmin()) return;
      const rect = tab.getBoundingClientRect();
      const offsetX = event.clientX - rect.left, offsetY = event.clientY - rect.top;
      moved = false;
      tab.setPointerCapture(event.pointerId);
      tab.classList.add("dragging");
      const move = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - event.clientX) + Math.abs(moveEvent.clientY - event.clientY) > 4) moved = true;
        const x = Math.max(2, Math.min(innerWidth - tab.offsetWidth - 2, moveEvent.clientX - offsetX));
        const y = Math.max(60, Math.min(innerHeight - tab.offsetHeight - 8, moveEvent.clientY - offsetY));
        tab.style.left = `${Math.round(x)}px`; tab.style.top = `${Math.round(y)}px`;
        tab.style.right = "auto"; tab.style.bottom = "auto"; tab.style.transform = "rotate(180deg)";
      };
      const finish = () => {
        tab.removeEventListener("pointermove", move); tab.removeEventListener("pointerup", finish); tab.removeEventListener("pointercancel", finish);
        tab.classList.remove("dragging");
        if (moved) {
          const box = tab.getBoundingClientRect();
          try { localStorage.setItem(stickyTabPositionKey, JSON.stringify({ x: box.left, y: box.top })); } catch {}
        }
      };
      tab.addEventListener("pointermove", move); tab.addEventListener("pointerup", finish); tab.addEventListener("pointercancel", finish);
    });
    tab.addEventListener("click", (event) => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
    tab.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); if (isAdmin()) resetStickyTabPosition(); }, true);
    addEventListener("resize", () => { if (!tab.classList.contains("hidden")) applyStickyTabPosition(); });
  }

  /** Puts the launcher back on the right edge if it was dragged out of reach. */
  function resetStickyTabPosition(notify = true) {
    const tab = $("#stickyEdgeTab");
    if (!tab) return;
    try { localStorage.removeItem(stickyTabPositionKey); } catch {}
    tab.style.left = ""; tab.style.top = ""; tab.style.right = ""; tab.style.bottom = ""; tab.style.transform = "";
    if (notify) toast("Sticky button moved back to the right edge");
  }

  function stickyHiddenForTrip() { return String(((state.data && state.data.trip) || {}).stickyHidden).toUpperCase() === "TRUE"; }
  function stickyHiddenForMe() { return !isAdmin() && stickyHiddenForTrip(); }
  async function toggleStickyHidden() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const hide = !stickyHiddenForTrip(); const value = hide ? "TRUE" : "FALSE";
    try {
      if (!state.demoMode) await api("updateTrip", authPayload({ trip: { stickyHidden: value } }));
      state.data.trip.stickyHidden = value; renderStickyNotes(); render();
      toast(hide ? "Sticky note hidden for all travellers in this trip" : "Sticky note shown to all travellers again");
    } catch (error) { toast(error.message, true); }
  }
  function setStickyControlsVisible(visible) {
    visible = visible && !stickyHiddenForMe();
    makeStickyTabDraggable();
    const tab = $("#stickyEdgeTab");
    tab.classList.toggle("draggable", isAdmin());
    tab.classList.toggle("hidden", !visible);
    if (visible) applyStickyTabPosition();
    if (!visible) closeStickyPanel();
    renderStickyNotes();
  }

  function openStickyPanel() {
    if (stickyHiddenForMe()) return toast("The Administrator has hidden the sticky note for this trip");
    const panel = $("#stickyPanel");
    clearTimeout(openStickyPanel.hideTimer);
    panel.classList.remove("hidden");
    $("#stickyPanelBackdrop").classList.remove("hidden");
    requestAnimationFrame(() => panel.classList.add("open"));
    panel.setAttribute("aria-hidden", "false");
    $("#stickyEdgeTab").setAttribute("aria-expanded", "true");
    refreshStickyNotes();
  }

  function closeStickyPanel() {
    const panel = $("#stickyPanel");
    if (!panel) return;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    $("#stickyPanelBackdrop").classList.add("hidden");
    $("#stickyEdgeTab").setAttribute("aria-expanded", "false");
    clearTimeout(openStickyPanel.hideTimer);
    openStickyPanel.hideTimer = setTimeout(() => { if (!panel.classList.contains("open")) panel.classList.add("hidden"); }, 260);
  }

  function stickyDueText(note) {
    if (!note.dueDate) return "No due date";
    const today = new Date().toISOString().slice(0, 10);
    const prefix = note.dueDate < today && !note.completed ? "Overdue · " : "Due · ";
    return prefix + displayDate(note.dueDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  /** Escapes a note body, keeps its line breaks and renders **bold** runs. */
  function stickyBodyHtml(note) {
    const raw = note.body || (canWriteStickyNotes() ? "Tap to add details" : "No additional details");
    return esc(raw).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }

  function stickyPanelCard(note) {
    const inline = (field) => canWriteStickyNotes() ? ` contenteditable="plaintext-only" spellcheck="false" class="sticky-inline" data-sticky-inline="${esc(note.id)}" data-sticky-field="${field}" title="Click to edit"` : "";
    const controls = canWriteStickyNotes() ? `<footer><button data-sticky-pin="${esc(note.id)}">📌 ${note.pinned ? "Unpin" : "Pin"}</button><button class="complete" data-sticky-complete="${esc(note.id)}">✓ Complete</button><button data-sticky-edit="${esc(note.id)}">Edit</button><button class="delete" data-sticky-delete="${esc(note.id)}">Delete</button></footer>` : `<span class="sticky-readonly">VIEW ONLY · Editing disabled by Administrator</span>`;
    return `<article class="sticky-card colour-${esc(note.colour)}"><header><span>${esc(note.type)}</span><small>${esc(stickyDueText(note))}</small></header><h4${inline("title")}>${esc(note.title)}</h4><p${inline("body")}>${stickyBodyHtml(note)}</p>${controls}</article>`;
  }

  function stickyDiaryCard(note) {
    const completedOn = note.completedAt ? new Date(note.completedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Completed";
    const byline = note.completedBy ? ` · ${esc(note.completedBy)}` : "";
    const controls = isAdmin() ? `<footer><button data-sticky-diary-reopen="${esc(note.id)}">Reopen</button><button data-sticky-diary-delete="${esc(note.id)}">Delete</button></footer>` : "";
    return `<article class="sticky-diary-card colour-${esc(note.colour)}"><small>✓ COMPLETED · ${esc(completedOn)}${byline}</small><span>${esc(note.type)} · ${esc(stickyDueText(note))}</span><b>${esc(note.title)}</b><p>${esc(note.body || note.details || "No additional details")}</p>${controls}</article>`;
  }

  function floatingStickyCard(note) {
    const inline = (field) => canWriteStickyNotes() ? ` contenteditable="plaintext-only" spellcheck="false" class="sticky-inline" data-sticky-inline="${esc(note.id)}" data-sticky-field="${field}" title="Click to edit"` : "";
    const safeWidth = Math.min(note.width, Math.max(260, innerWidth - 8));
    const safeHeight = Math.min(note.height, Math.max(190, innerHeight - 92));
    const safeX = Math.max(4, Math.min(Math.max(4, innerWidth - safeWidth - 4), note.x));
    const safeY = Math.max(76, Math.min(Math.max(76, innerHeight - safeHeight - 8), note.y));
    return `<article class="floating-sticky colour-${esc(note.colour)}" data-floating-sticky="${esc(note.id)}" style="left:${Math.round(safeX)}px;top:${Math.round(safeY)}px;width:${Math.round(safeWidth)}px;height:${Math.round(safeHeight)}px"><header class="sticky-drag-handle" data-sticky-drag="${esc(note.id)}"><span>${canWriteStickyNotes() ? "↕ Move note" : "📌 Pinned for everyone"}</span><button data-sticky-hide-screen title="Hide pinned notes from my screen">×</button></header><div class="floating-sticky-content"><small>${esc(note.type)} · ${esc(stickyDueText(note))}</small><h3${inline("title")}>${esc(note.title)}</h3><p${inline("body")}>${stickyBodyHtml(note)}</p></div>${canWriteStickyNotes() ? `<footer><button data-sticky-complete="${esc(note.id)}">✓ Complete</button><button data-sticky-edit="${esc(note.id)}">Edit</button><button data-sticky-autofit="${esc(note.id)}">Auto-fit</button></footer>` : ""}</article>`;
  }

  function renderStickyNotes() {
    if (!$("#stickyActiveList")) return;
    if (stickyHiddenForMe()) { $("#stickyEdgeTab").classList.add("hidden"); const layer = $("#floatingStickyLayer"); if (layer) { layer.innerHTML = ""; layer.classList.add("hidden"); } closeStickyPanel(); return; }
    if ($("#stickyHideToggle")) { $("#stickyHideToggle").classList.toggle("hidden", !isAdmin()); $("#stickyHideToggle").textContent = stickyHiddenForTrip() ? "👁 Show to travellers" : "🙈 Hide for travellers"; $("#stickyHideToggle").classList.toggle("is-on", stickyHiddenForTrip()); }
    const active = stickyNotes.filter((note) => !note.completed);
    const remoteCompleted = state.data ? (state.data.stickyDiary || []).map((note, index) => normaliseSticky({ ...note, body: note.details, completed: true }, index)) : [];
    const remoteIds = new Set(remoteCompleted.map((note) => String(note.id)));
    const legacyCompleted = stickyNotes.filter((note) => note.completed && !remoteIds.has(String(note.id)));
    const completed = [...remoteCompleted, ...legacyCompleted].sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    $("#stickyEdgeCount").textContent = active.length;
    $("#stickyActiveCount").textContent = `${active.length} active`;
    $("#stickyCompletedCount").textContent = `${completed.length} completed`;
    $("#addStickyNote").classList.toggle("hidden", !canWriteStickyNotes());
    if ($("#stickyAccessButton")) $("#stickyAccessButton").classList.toggle("hidden", !isAdmin());
    if ($("#stickyRecallButton")) $("#stickyRecallButton").classList.toggle("hidden", !active.some((note) => note.pinned));
    $(".sticky-device-note").innerHTML = { edit: `Pinned notes are shared with every traveller in this trip and saved in the <b>StickyNotes</b> Google Sheet. The Administrator allowed you to edit them.`, view: `Pinned notes are shared with every traveller. Your Traveller ID is <b>view only</b> — ask the Administrator for edit access.` }[stickyAccessLevel()];
    $("#stickyActiveList").innerHTML = active.map(stickyPanelCard).join("") || `<div class="sticky-empty"><b>No active sticky notes</b><p>${canWriteStickyNotes() ? "Add a target or reminder whenever something needs attention." : "The Administrator has not added an active note on this device."}</p></div>`;
    $("#stickyDiaryList").innerHTML = completed.map(stickyDiaryCard).join("") || `<div class="sticky-empty compact"><b>No completed notes yet</b></div>`;
    const pinned = active.filter((note) => note.pinned);
    const onScreen = pinnedOnScreen() ? pinned : [];
    const layer = $("#floatingStickyLayer");
    layer.classList.toggle("hidden", !state.data || !onScreen.length);
    layer.innerHTML = onScreen.map(floatingStickyCard).join("");
    const toggle = $("#stickyScreenToggle");
    if (toggle) {
      toggle.classList.toggle("hidden", !pinned.length);
      toggle.classList.toggle("on", pinnedOnScreen());
      toggle.textContent = pinnedOnScreen() ? "📌 Hide from screen" : `📌 Show ${pinned.length} on screen`;
    }
    bindStickyActions();
    bindStickyFrontmost();
  }

  /* Per browser, default OFF: pinned notes never pop over the dashboard by
     themselves. Pinning still shares the note with everyone; each person
     decides whether it floats on their own screen. */
  const pinnedScreenKey = "mytrip_pinned_on_screen_v1";
  function pinnedOnScreen() { return localStorage.getItem(pinnedScreenKey) === "on"; }
  function setPinnedOnScreen(on) {
    try { localStorage.setItem(pinnedScreenKey, on ? "on" : "off"); } catch {}
    renderStickyNotes();
  }

  function updateSticky(id, changes) {
    if (!canWriteStickyNotes()) return toast("Sticky-note writing is disabled by the Administrator", true);
    const note = stickyNotes.find((item) => item.id === id);
    if (!note) return;
    Object.assign(note, changes); markStickyChanged(); saveStickyNotes(); renderStickyNotes(); persistSticky(note);
  }

  function showStickyEditor(note) {
    if (!canWriteStickyNotes()) return toast("Sticky-note writing is disabled by the Administrator", true);
    const editing = Boolean(note);
    const current = note || normaliseSticky({ colour: stickyColours[stickyNotes.length % stickyColours.length] }, stickyNotes.length);
    showModal(editing ? "Edit sticky note" : "Add sticky note", `<form class="modal-form sticky-editor-form" id="stickyEditorForm"><div class="sticky-editor-preview colour-${esc(current.colour)}"><i>✦</i><div><b>${editing ? "UPDATE THIS NOTE" : "NEW TRIP STICKY"}</b><span>Colourful target or reminder</span></div></div><div class="form-row"><label>Note type<select name="type"><option ${current.type === "Target" ? "selected" : ""}>Target</option><option ${current.type === "Reminder" ? "selected" : ""}>Reminder</option></select></label><label>Due date <small>(optional)</small><input name="dueDate" type="date" value="${esc(current.dueDate)}"></label></div><label>Title<input name="title" maxlength="120" value="${editing ? esc(current.title) : ""}" placeholder="What needs attention?" required></label><label>Details<textarea name="body" rows="5" maxlength="2000" placeholder="Use multiple lines for tasks, ideas or preparation notes.">${editing ? esc(current.body) : ""}</textarea></label><label>Sticky colour<select name="colour">${stickyColours.map((colour) => `<option value="${colour}" ${current.colour === colour ? "selected" : ""}>${colour[0].toUpperCase() + colour.slice(1)}</option>`).join("")}</select></label><label class="sticky-pin-choice"><input name="pinned" type="checkbox" ${current.pinned ? "checked" : ""}><span><b>Pin above dashboard</b><small>You can drag and resize it after saving.</small></span></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${editing ? "Save changes" : "Add sticky"}</button></div></form>`);
    const form = $("#stickyEditorForm");
    const colourInput = form.elements.colour;
    colourInput.addEventListener("change", () => { const preview = $(".sticky-editor-preview", form); stickyColours.forEach((colour) => preview.classList.remove(`colour-${colour}`)); preview.classList.add(`colour-${colourInput.value}`); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const changes = { type: values.type, dueDate: values.dueDate || "", title: values.title, body: values.body || "", colour: values.colour, pinned: Boolean(values.pinned) };
      const target = editing ? Object.assign(note, changes) : normaliseSticky({ ...current, ...changes }, stickyNotes.length);
      if (!editing) stickyNotes.push(target);
      saveStickyNotes(); closeModal(); renderStickyNotes();
      const saved = await persistSticky(target);
      renderStickyNotes();
      if (saved) toast(editing ? "Sticky note updated for everyone" : "Sticky note saved for everyone");
      else if (!state.demoMode) toast(lastStickyError || "The note could not be saved to the trip sheet", true);
    });
    $("[data-cancel]").addEventListener("click", closeModal);
  }

  async function archiveStickyRecord(note, silent = false) {
    if (!note || !canWriteStickyNotes()) {
      if (!silent) toast("Sticky-note writing is disabled by the Administrator", true);
      return false;
    }
    const alreadySaved = (state.data.stickyDiary || []).find((item) => String(item.id) === String(note.id));
    try {
      const record = { id: note.id, type: note.type, title: note.title, details: encodeStickyText(note.body), dueDate: note.dueDate, colour: note.colour, createdAt: note.createdAt, completedBy: state.currentUser };
      const saved = alreadySaved || (state.demoMode ? { ...record, tripId: state.data.trip.tripId, completedAt: new Date().toISOString() } : await api("archiveStickyNote", authPayload({ record })));
      if (!alreadySaved) state.data.stickyDiary.push(saved);
      stickyNotes = stickyNotes.filter((item) => String(item.id) !== String(note.id));
      saveStickyNotes(); renderStickyNotes();
      if (!silent) toast("Completed note saved in the StickyNoteDiary Google Sheet");
      return true;
    } catch (error) {
      if (!silent) toast(error.message, true);
      return false;
    }
  }

  async function completeStickyNote(id) {
    const note = stickyNotes.find((item) => String(item.id) === String(id));
    await archiveStickyRecord(note);
  }

  async function migrateCompletedStickyNotes() {
    if (stickyMigrationRunning || !state.data || !canWriteStickyNotes()) return;
    const legacy = stickyNotes.filter((note) => note.completed);
    if (!legacy.length) return;
    stickyMigrationRunning = true;
    let migrated = 0;
    for (const note of legacy) if (await archiveStickyRecord(note, true)) migrated++;
    stickyMigrationRunning = false;
    if (migrated) toast(`${migrated} completed sticky ${migrated === 1 ? "entry" : "entries"} moved to Google Sheet`);
  }

  async function reopenStickyDiary(id) {
    if (!isAdmin()) return toast("Only the Administrator can reopen completed sticky notes", true);
    const note = (state.data.stickyDiary || []).find((item) => String(item.id) === String(id));
    if (!note) return toast("Completed sticky note not found", true);
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet: "StickyNoteDiary", id }));
      state.data.stickyDiary = state.data.stickyDiary.filter((item) => String(item.id) !== String(id));
      stickyNotes.push(normaliseSticky({ ...note, body: note.details, completed: false, completedAt: "", pinned: false }, stickyNotes.length));
      saveStickyNotes(); renderStickyNotes(); toast("Sticky note reopened on this device");
    } catch (error) { toast(error.message, true); }
  }

  async function deleteStickyDiary(id) {
    if (!isAdmin()) return toast("Only the Administrator can delete completed sticky notes", true);
    const note = (state.data.stickyDiary || []).find((item) => String(item.id) === String(id));
    if (!note || !confirm(`Delete completed sticky note “${note.title}” from Google Sheet?`)) return;
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet: "StickyNoteDiary", id }));
      state.data.stickyDiary = state.data.stickyDiary.filter((item) => String(item.id) !== String(id));
      renderStickyNotes(); toast("Completed sticky note deleted from Google Sheet");
    } catch (error) { toast(error.message, true); }
  }

  async function deleteSharedSticky(note) {
    if (!canWriteStickyNotes()) return toast("Sticky-note editing is disabled by the Administrator", true);
    try {
      if (!state.demoMode) await api("deleteStickyNote", authPayload({ id: note.id }));
    } catch (error) {
      if (!/not found/i.test(error.message)) return toast(error.message, true);
    }
    stickyNotes = stickyNotes.filter((item) => String(item.id) !== String(note.id));
    saveStickyNotes(); mirrorStickyNotes(); renderStickyNotes(); toast("Sticky note deleted for everyone");
  }

  /** Administrator control: who may edit or comment on the shared pinned board. */
  function showStickyBoardAccess() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const members = visibleTripMembers().filter((member) => member.travellerId);
    if (!members.length) return toast("Create Traveller ID accounts for this trip first", true);
    const levels = ["view", "edit"];
    const rows = members.map((member) => {
      const assignment = assignmentForTraveller(member.travellerId) || {};
      const current = levels.includes(String(assignment.stickyNoteAccess || "").toLowerCase())
        ? String(assignment.stickyNoteAccess).toLowerCase()
        : (String(assignment.canWriteStickyNotes).toUpperCase() === "TRUE" ? "edit" : "view");
      return `<label class="sticky-access-row"><span><b>${esc(member.name)}</b><small>${esc(member.travellerId)}</small></span><select name="${esc(member.travellerId)}">${levels.map((level) => `<option value="${level}" ${current === level ? "selected" : ""}>${stickyAccessLabel(level)}</option>`).join("")}</select></label>`;
    }).join("");
    showModal("Who can work on the pinned sticky notes", `<form class="modal-form" id="stickyAccessForm"><div class="security-note"><i>📌</i><p>Every traveller in <b>${esc(state.data.trip.name)}</b> sees the pinned notes. Choose who may edit and complete them, and who may only read them.</p></div><div class="sticky-access-bulk"><label>Set everyone to<select id="stickyAccessBulkLevel">${levels.map((level) => `<option value="${level}">${stickyAccessLabel(level)}</option>`).join("")}</select></label><button type="button" id="stickyAccessApplyAll">Apply to all travellers</button></div><div class="sticky-access-list">${rows}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save access</button></div></form>`);
    const form = $("#stickyAccessForm");
    $("#stickyAccessApplyAll").addEventListener("click", () => {
      const level = $("#stickyAccessBulkLevel").value;
      $$("select[name]", form).forEach((select) => { select.value = level; });
      toast(`All travellers set to “${stickyAccessLabel(level)}” — press Save access`);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const picks = $$("select[name]", form).map((select) => [select.name, select.value]);
      const submit = form.querySelector("button[type=submit]");
      submit.disabled = true; submit.textContent = "Saving…";
      try {
        const sameLevel = picks.every(([, level]) => level === picks[0][1]);
        if (!state.demoMode) {
          if (sameLevel) await api("setTravellerStickyAccess", authPayload({ travellerId: "ALL", level: picks[0][1] }));
          else for (const [travellerId, level] of picks) await api("setTravellerStickyAccess", authPayload({ travellerId, level }));
        }
        picks.forEach(([travellerId, level]) => {
          const assignment = assignmentForTraveller(travellerId);
          if (assignment) { assignment.stickyNoteAccess = level; assignment.canWriteStickyNotes = level === "edit" ? "TRUE" : "FALSE"; }
        });
        closeModal(); render(); renderStickyNotes(); toast("Sticky note access updated");
      } catch (error) { submit.disabled = false; submit.textContent = "Save access"; toast(error.message, true); }
    });
    $("[data-cancel]").addEventListener("click", closeModal);
  }

  /** Saves an in-place edit made straight on the note. */
  async function saveInlineSticky(element) {
    const note = stickyNotes.find((item) => String(item.id) === String(element.dataset.stickyInline));
    if (!note) return;
    const field = element.dataset.stickyField;
    const placeholder = field === "body" ? "Tap to add details" : "";
    const next = (element.innerText || element.textContent || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    const clean = next === placeholder ? "" : next;
    const previous = field === "title" ? note.title : note.body;
    if (clean === previous) return;
    if (field === "title" && !clean) { element.textContent = previous; return toast("A sticky note needs a title", true); }
    note[field] = field === "title" ? clean.slice(0, 120) : clean.slice(0, 2000);
    element.dataset.saving = "true";
    lastStickyError = "";
    const saved = await persistStickyPosition(note);
    delete element.dataset.saving;
    if (saved) { mirrorStickyNotes(); toast("Sticky note saved"); renderStickyNotes(); }
    else { note[field] = previous; element.textContent = previous; toast(lastStickyError || "The note could not be saved to the trip sheet", true); }
  }

  /** Wraps the selected words in ** ** so they render bold once saved. */
  function wrapStickySelection(element) {
    element.focus();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !element.contains(selection.anchorNode)) return toast("Select the words to make bold first", true);
    const text = selection.toString();
    if (!text.trim()) return toast("Select the words to make bold first", true);
    const bolded = /^\*\*[\s\S]+\*\*$/.test(text) ? text.slice(2, -2) : `**${text.trim()}**`;
    document.execCommand("insertText", false, bolded);
    element.dispatchEvent(new Event("input"));
  }

  function removeInlineActions(card) {
    const bar = card && card.querySelector(".sticky-inline-actions");
    if (bar) bar.remove();
  }

  /** Shows an explicit Save / Cancel bar while a note is being edited in place. */
  function showInlineActions(element) {
    const card = element.closest(".sticky-card, .floating-sticky");
    if (!card || card.querySelector(".sticky-inline-actions")) return;
    const bar = document.createElement("div");
    bar.className = "sticky-inline-actions";
    const boldButton = element.dataset.stickyField === "body" ? '<button type="button" class="bold" data-inline-bold title="Bold the selected words"><b>B</b></button>' : "";
    bar.innerHTML = '<span>Editing…</span>' + boldButton + '<button type="button" data-inline-cancel>Cancel</button><button type="button" class="primary" data-inline-save>✓ Save</button>';
    card.appendChild(bar);
    bar.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
    const bold = bar.querySelector("[data-inline-bold]");
    if (bold) bold.addEventListener("click", () => wrapStickySelection(element));
    bar.querySelector("[data-inline-save]").addEventListener("click", () => { element.dataset.commit = "true"; element.blur(); });
    bar.querySelector("[data-inline-cancel]").addEventListener("click", () => { element.dataset.revert = "true"; element.blur(); renderStickyNotes(); });
  }

  /** Tapping a pinned note raises it above the others. */
  function bindStickyFrontmost() {
    const layer = $("#floatingStickyLayer");
    if (!layer) return;
    $$("[data-floating-sticky]", layer).forEach((article) => {
      article.addEventListener("pointerdown", () => {
        if (article !== layer.lastElementChild) layer.appendChild(article);
      }, true);
    });
  }

  function bindStickyActions() {
    $$('[data-sticky-inline]').forEach((element) => {
      element.addEventListener("pointerdown", (event) => event.stopPropagation());
      element.addEventListener("click", (event) => { event.stopPropagation(); if (document.activeElement !== element) element.focus(); });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); element.blur(); renderStickyNotes(); }
        if (event.key === "Enter" && (element.dataset.stickyField === "title" || event.metaKey || event.ctrlKey)) { event.preventDefault(); element.blur(); }
      });
      element.addEventListener("focus", () => {
        const note = stickyNotes.find((item) => String(item.id) === String(element.dataset.stickyInline));
        if (note && element.dataset.stickyField === "body") element.textContent = note.body || "";
        if (element.textContent.trim() === "Tap to add details") element.textContent = "";
        showInlineActions(element);
      });
      element.addEventListener("input", () => showInlineActions(element));
      element.addEventListener("blur", () => {
        const card = element.closest(".sticky-card, .floating-sticky");
        if (element.dataset.revert === "true") { delete element.dataset.revert; removeInlineActions(card); return; }
        delete element.dataset.commit;
        removeInlineActions(card);
        saveInlineSticky(element);
      });
    });
    $$('[data-sticky-hide-screen]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); setPinnedOnScreen(false); toast("Pinned notes hidden from your screen · still in the sticky panel"); }));
    $$('[data-sticky-pin]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const note = stickyNotes.find((item) => item.id === button.dataset.stickyPin); if (note) updateSticky(note.id, { pinned: !note.pinned }); }));
    $$('[data-sticky-complete]').forEach((button) => button.addEventListener("click", () => completeStickyNote(button.dataset.stickyComplete)));
    $$('[data-sticky-diary-reopen]').forEach((button) => button.addEventListener("click", () => reopenStickyDiary(button.dataset.stickyDiaryReopen)));
    $$('[data-sticky-diary-delete]').forEach((button) => button.addEventListener("click", () => deleteStickyDiary(button.dataset.stickyDiaryDelete)));
    $$('[data-sticky-edit]').forEach((button) => button.addEventListener("click", () => showStickyEditor(stickyNotes.find((item) => item.id === button.dataset.stickyEdit))));
    $$('[data-sticky-delete]').forEach((button) => button.addEventListener("click", () => { const note = stickyNotes.find((item) => item.id === button.dataset.stickyDelete); if (note && confirm(`Delete shared sticky note “${note.title}” for everyone?`)) deleteSharedSticky(note); }));
    $$('[data-sticky-autofit]').forEach((button) => button.addEventListener("click", () => { const note = stickyNotes.find((item) => item.id === button.dataset.stickyAutofit), element = $(`[data-floating-sticky="${button.dataset.stickyAutofit}"]`); if (!note || !element) return; element.style.height = "auto"; element.style.width = `${Math.min(430, Math.max(290, element.scrollWidth + 8))}px`; element.style.height = `${Math.min(520, Math.max(190, element.scrollHeight + 8))}px`; const box = element.getBoundingClientRect(); updateSticky(note.id, { width: box.width, height: box.height }); }));
    if (canWriteStickyNotes()) $$('[data-sticky-drag]').forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        const note = stickyNotes.find((item) => item.id === handle.dataset.stickyDrag), element = handle.closest(".floating-sticky");
        if (!note || !element) return;
        event.preventDefault(); handle.setPointerCapture(event.pointerId);
        const rect = element.getBoundingClientRect(), offsetX = event.clientX - rect.left, offsetY = event.clientY - rect.top;
        const move = (moveEvent) => { const x = Math.max(4, Math.min(innerWidth - element.offsetWidth - 4, moveEvent.clientX - offsetX)); const y = Math.max(76, Math.min(innerHeight - 70, moveEvent.clientY - offsetY)); element.style.left = `${x}px`; element.style.top = `${y}px`; note.x = x; note.y = y; };
        const finish = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", finish); saveStickyNotes(); persistStickyPosition(note); };
        handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
      });
    });
    $$('.floating-sticky').forEach((element) => element.addEventListener("pointerup", () => { const note = stickyNotes.find((item) => item.id === element.dataset.floatingSticky); if (!note) return; const box = element.getBoundingClientRect(); note.width = box.width; note.height = box.height; saveStickyNotes(); persistStickyPosition(note); }));
  }

  function ordinalDay(day) {
    const remainder100 = day % 100;
    if (remainder100 >= 11 && remainder100 <= 13) return `${day}th`;
    return `${day}${day % 10 === 1 ? "st" : (day % 10 === 2 ? "nd" : (day % 10 === 3 ? "rd" : "th"))}`;
  }

  function currentHeaderDateTime(now = new Date()) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `◆ ${ordinalDay(now.getDate())}-${months[now.getMonth()]}-${now.getFullYear()} (${weekdays[now.getDay()]}) │ ${time}`;
  }

  function updateHeaderDateTime() {
    const value = currentHeaderDateTime();
    [$("#dashboardDateTime"), $("#hubDateTime")].filter(Boolean).forEach((element) => { if (element.textContent !== value) element.textContent = value; });
  }

  function updateVersionLabels() {
    const backendLabel = backendVersion ? `v${backendVersion}` : (backendState === "checking" ? "Checking…" : "Not connected");
    if ($("#loginFrontendVersion")) $("#loginFrontendVersion").textContent = `v${frontendVersion}`;
    if ($("#loginBackendVersion")) $("#loginBackendVersion").textContent = backendLabel;
    if ($("#dashboardVersion")) $("#dashboardVersion").textContent = `FE v${frontendVersion} · BE ${backendLabel}`;
    if ($("#hubVersion")) $("#hubVersion").textContent = `FE v${frontendVersion} · BE ${backendLabel}`;
  }

  function updateBackendStatus() {
    const button = $("#connectBackendButton");
    if (button) {
      button.textContent = backendState === "outdated" ? "Update backend settings" : (backendState === "missing" || backendState === "error" ? "Connect backend" : "Backend settings");
      button.classList.toggle("attention", backendState === "outdated" || backendState === "missing" || backendState === "error");
    }
    updateVersionLabels();
  }

  function showBackendSetup(afterConnect) {
    showModal("Connect Google backend", `<form class="modal-form" id="backendForm"><div class="setup-note"><i>G</i><div><b>MyTrip backend v4.6.0 account build required</b><p>Replace Apps Script <code>Code.gs</code>, run <code>setupMyTrip()</code>, and deploy a <b>New version</b>. This enables common login, traveller trip-creation permission, the Drive photo gallery and the <code>StickyNoteDiary</code> Google Sheet.</p></div></div><label>Google Apps Script Web App URL<input name="apiUrl" type="url" value="${esc(apiUrl)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="url" required></label><p class="form-help">Use the deployed <b>/exec</b> URL, not the testing <b>/dev</b> URL. Account login, traveller credentials, photo gallery, version and Sticky Note Diary capabilities are checked before saving.</p><a class="setup-guide-link" href="SETUP-GUIDE.md" target="_blank" rel="noreferrer">Open the Google setup guide ↗</a><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Test and connect</button></div></form>`);
    const form = $("#backendForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const candidate = String(new FormData(form).get("apiUrl") || "").trim();
      if (!validApiUrl(candidate)) return toast("Enter a valid Apps Script URL ending in /exec", true);
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; submit.textContent = "Checking…";
      try {
        const info = await verifyBackendVersion(candidate);
        apiUrl = candidate; backendVersion = String(info.version || ""); backendInfo = info; backendVerifiedAt = Date.now(); backendVerifiedUrl = candidate; backendState = "ready"; saveStoredApiUrl(candidate); updateBackendStatus(); closeModal(); toast(`Google backend version ${backendVersion} connected`);
        if (typeof afterConnect === "function") afterConnect();
      } catch (error) {
        backendState = error.code === "BACKEND_UPGRADE_REQUIRED" ? "outdated" : "error";
        updateBackendStatus();
        toast(error.code === "BACKEND_UPGRADE_REQUIRED" ? error.message : `Could not connect: ${error.message}`, true);
        submit.disabled = false; submit.textContent = "Test version 4.6 & connect";
      }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  /* ---- personal trip order: each login arranges its own trip library ---- */
  function savedTripOrder() {
    return (state.libraryTrips || [])
      .filter((trip) => Number(trip.listOrder) > 0)
      .sort((a, b) => Number(a.listOrder) - Number(b.listOrder))
      .map((trip) => String(trip.tripId));
  }
  function orderedTrips(trips) {
    const order = savedTripOrder();
    if (!order.length) return [...trips];
    return [...trips].sort((a, b) => {
      const indexA = order.indexOf(String(a.tripId)), indexB = order.indexOf(String(b.tripId));
      if (indexA < 0 && indexB < 0) return 0;
      if (indexA < 0) return 1;
      if (indexB < 0) return -1;
      return indexA - indexB;
    });
  }
  /** Writes the shared order to the Trips sheet so every login sees it. */
  async function saveTripOrder(ids) {
    const order = ids.map(String);
    (state.libraryTrips || []).forEach((trip) => {
      const position = order.indexOf(String(trip.tripId));
      trip.listOrder = position < 0 ? 0 : (position + 1) * 10;
    });
    if (state.demoMode) return true;
    try { await api("setTripListOrder", { order, tripId: (state.libraryTrips[0] || {}).tripId || "", ...adminAuth(state.administratorSecret || state.pin) }); return true; }
    catch (error) { toast(error.message, true); return false; }
  }
  async function moveTripInOrder(tripId, direction, trips) {
    const ids = orderedTrips(trips).map((trip) => String(trip.tripId));
    const index = ids.indexOf(String(tripId));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return false;
    ids.splice(target, 0, ids.splice(index, 1)[0]);
    return await saveTripOrder(ids);
  }
  /** Order + visibility controls as one bar: absolute on desktop, full-width row on mobile. */
  function libraryCover(trip) {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const s = new Date(`${trip.startDate}T12:00:00`), e = new Date(`${trip.endDate || trip.startDate}T12:00:00`);
    let chip = "";
    if (!isNaN(s)) {
      const d = Math.round((s - today) / 86400000);
      chip = d > 1 ? `In ${d} days` : d === 1 ? "Tomorrow" : today <= e ? "On trip now" : "Completed";
    }
    const url = String(trip.photoUrl || "").trim();
    const letter = esc(String(trip.destination || trip.name || "T").trim().charAt(0).toUpperCase());
    const thumb = url ? tripThumbs()[String(trip.tripId || "").toUpperCase()] : "";
    return `<div class="library-cover${url ? " has-photo" : ""}" data-cover-trip="${esc(String(trip.tripId || "").toUpperCase())}">${url ? `<img src="${esc(thumb || url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-letter="${letter}">` : `<span class="library-cover-letter">${letter}</span>`}${chip ? `<b class="library-chip${chip === "Completed" ? " done" : chip === "On trip now" ? " live" : ""}">${chip}</b>` : ""}</div>`;
  }

  function tripCardTools(trip, position, total) {
    return `<span class="trip-card-tools">${tripOrderControls(trip, position, total)}${tripVisibilityButton(trip)}</span>`;
  }

  function tripOrderControls(trip, position, total) {
    return `<span class="trip-order-controls"><b title="Position in your list">#${position + 1}</b><button type="button" data-move-trip="${esc(trip.tripId)}" data-direction="-1"${position === 0 ? " disabled" : ""} aria-label="Move up">↑</button><button type="button" data-move-trip="${esc(trip.tripId)}" data-direction="1"${position === total - 1 ? " disabled" : ""} aria-label="Move down">↓</button></span>`;
  }

  /* ---- personal hidden trips: kept out of this login's library view ---- */
  /* Hidden state and list order live in the Trips sheet, so they apply to
     every login on every device until the Administrator changes them. */
  function isTripHidden(tripId) {
    const trip = (state.libraryTrips || []).find((item) => String(item.tripId) === String(tripId));
    return Boolean(trip && trip.listHidden === true);
  }
  async function toggleTripHidden(tripId) {
    const trip = (state.libraryTrips || []).find((item) => String(item.tripId) === String(tripId));
    if (!trip) return false;
    const hidden = !(trip.listHidden === true);
    trip.listHidden = hidden;
    try {
      if (!state.demoMode) await api("setTripListHidden", { tripId, hidden, ...adminAuth(state.administratorSecret || state.pin) });
      toast(hidden ? `${tripId} hidden for everyone` : `${tripId} visible again`);
      return true;
    } catch (error) { trip.listHidden = !hidden; toast(/listHidden|not found/i.test(error.message) ? "Deploy backend 4.10.0 first: replace Code.gs, run runAll(), then Deploy a New version." : error.message, true); return false; }
  }
  function visibleLibraryTrips(trips) {
    state.libraryTrips = trips || state.libraryTrips || [];
    const all = orderedTrips(state.libraryTrips);
    return state.showHiddenTrips ? all : all.filter((trip) => !isTripHidden(trip.tripId));
  }
  function hiddenTripsBar(trips) {
    const count = (trips || []).filter((trip) => isTripHidden(trip.tripId)).length;
    if (!count && !state.showHiddenTrips) return "";
    return `<button id="toggleHiddenTrips" class="secondary-action${state.showHiddenTrips ? " on" : ""}" type="button">${state.showHiddenTrips ? `◉ Hiding ${count} again` : `◎ Show ${count} hidden`}</button>`;
  }
  function tripVisibilityButton(trip) {
    return `<button type="button" class="trip-hide-button${isTripHidden(trip.tripId) ? " hidden-on" : ""}" data-hide-trip="${esc(trip.tripId)}" title="${isTripHidden(trip.tripId) ? "Show this trip in your list" : "Hide this trip from your list"}">${isTripHidden(trip.tripId) ? "◎" : "◉"}</button>`;
  }

  function tripEnabled(trip) { return trip.enabled !== false && String(trip.enabled).toUpperCase() !== "FALSE"; }

  async function openListedTrip(tripId, pin, demoMode, role, traveller) {
    try {
      if (demoMode) {
        const summary = demoTrips.find((trip) => trip.tripId === tripId);
        if (!summary) return toast(`Trip ${tripId} is not available in the preview`, true);
        const bundle = clone(demo); bundle.trip = { ...bundle.trip, ...summary };
        /* the sample bundle only holds records for the sample trip — every other
           preview trip opens empty instead of showing another trip's data */
        if (String(demo.trip.tripId) !== String(tripId)) {
          ["itinerary", "places", "experiences", "expenses", "photos", "stickyNotes", "stickyDiary"].forEach((key) => { bundle[key] = []; });
        }
        if (traveller) {
          const assignment = bundle.assignments.find((item) => item.travellerId === traveller.travellerId && item.tripId === tripId) || { photoLimit: 0 };
          const photoCount = bundle.photos.filter((photo) => photo.uploaderId === traveller.travellerId).length;
          const photoLimit = Number(assignment.photoLimit || 0);
          bundle.permissions = { viewItinerary: true, viewExperiences: true, viewPlaces: true, viewExpenses: assignment.canViewExpenses !== false, viewTravellers: true, printReports: true, writeStickyNotes: false, viewPhotos: true, photoUploadsEnabled: true, photoUploadLimit: photoLimit, photoUploadCount: photoCount, photoUploadRemaining: Math.max(0, photoLimit - photoCount), addPhotos: photoCount < photoLimit };
        } else bundle.permissions = { viewPhotos: true, addPhotos: true, photoUploadsEnabled: true, photoUploadCount: bundle.photos.length };
        closeModal(); await openTrip(bundle, pin, true, traveller ? traveller.name : ((summary && summary.createdBy) || state.accountUsername || "Administrator"), role, traveller ? traveller.travellerId : "", traveller ? "personal" : "admin");
      } else {
        const payload = { tripId, username: state.accountUsername, password: pin, pin, ...(traveller ? { travellerId: traveller.travellerId } : {}) };
        const cached = readCachedTrip(tripId);
        if (cached && cached.meta && cached.meta.role === role && (traveller ? String(cached.meta.travellerId || "") === String(traveller.travellerId) && cached.meta.loginMode === "personal" : !cached.meta.travellerId && (cached.meta.loginMode || "admin") === "admin")) {
          closeModal();
          await openTrip(cached.data, pin, false, cached.meta.name, cached.meta.role, cached.meta.travellerId || "", cached.meta.loginMode || "admin");
          syncPill("refreshing");
          api("getTrip", payload).then((fresh) => {
            if (!fresh || !fresh.trip || String(fresh.trip.tripId) !== String(tripId)) return syncPill("");
            state.data = normalize(fresh); state.permissions = fresh.permissions || {};
            cacheTripBundle(fresh, cached.meta);
            const y = window.scrollY; loadStickyNotes(); hydrateShell(); render(); updatePrintArea(); stickyRefreshAt = Date.now(); try { window.scrollTo(0, y); } catch {}
            syncPill("done");
          }).catch(() => syncPill(navigator.onLine === false ? "offline" : ""));
          return;
        }
        showSkeleton();
        const bundle = await api("getTrip", payload);
        if (!bundle || !bundle.trip) { hideSkeletonSafe(); return toast("This trip could not be opened. It may have been removed or hidden. Please pick it again from the list.", true); }
        if (bundle && bundle.trip && String(bundle.trip.tripId).trim().toUpperCase() !== String(tripId).trim().toUpperCase()) {
          return toast(`The server returned ${bundle.trip.tripId} instead of ${tripId}. Please try again.`, true);
        }
        const meta = { name: traveller ? traveller.name : bundle.trip.createdBy, role, travellerId: traveller ? traveller.travellerId : "", loginMode: traveller ? "personal" : "admin" };
        cacheTripBundle(bundle, meta);
        closeModal(); await openTrip(bundle, pin, false, meta.name, role, meta.travellerId, meta.loginMode);
      }
    } catch (error) { toast(error.message, true); }
  }

  /** Administrator: how long any login may stay idle before it is signed out. */
  function showIdleSignoutSetting(administratorSecret, trips, demoMode) {
    showModal("Auto sign-out", `<form class="modal-form" id="idleSignoutForm"><div class="security-note"><i>⏻</i><p>Every Administrator and traveller login is signed out after this much inactivity, on every device. The change applies from each person's next action.</p></div><div class="idle-choice-grid">${idleChoices.map((minutes) => `<label class="idle-choice"><input type="radio" name="minutes" value="${minutes}"${minutes === idleMinutes ? " checked" : ""}><span>${idleLabel(minutes)}</span></label>`).join("")}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save for everyone</button></div></form>`);
    const form = $("#idleSignoutForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const minutes = Number(new FormData(form).get("minutes"));
      const submit = form.querySelector("button[type=submit]");
      submit.disabled = true; submit.textContent = "Saving…";
      try {
        if (!demoMode) await api("setIdleTimeout", { minutes, ...adminAuth(administratorSecret) });
        applyIdleMinutes(minutes);
        closeModal(); renderAllTrips(state.libraryTrips || trips, administratorSecret, demoMode);
        toast(`Auto sign-out set to ${idleLabel(minutes)} for everyone`);
      } catch (error) { submit.disabled = false; submit.textContent = "Save for everyone"; toast(error.message, true); }
    });
    $("[data-cancel]").addEventListener("click", closeModal);
  }

  function renderAllTrips(trips, administratorSecret, demoMode) {
    loadProfilePhotos();
    const items = visibleLibraryTrips(trips);
    $("#accountHubContent").innerHTML = `<section class="account-hub-shell"><div class="account-hub-hero admin"><div><span>ACCOUNT DASHBOARD</span><h1>All trips in one place</h1><p>Signed in as <b>${esc(state.accountUsername)}</b>. Open and manage every trip, traveller and permission from here.</p></div><strong>${items.length} ${items.length === 1 ? "TRIP" : "TRIPS"}</strong></div><div class="all-trips-modal"><div class="all-trips-summary"><i class="avatar-edit admin-avatar" data-photo-upload="admin" title="Change the Administrator photo">${avatarSlot({ name: state.currentUser || "Administrator", isAdmin: true })}<em>📷</em></i><span><small>ADMINISTRATOR LIBRARY</small><b>${items.length} ${items.length === 1 ? "trip" : "trips"}</b></span><span class="summary-actions"><button id="changeAdministratorLogin" class="secondary-action" type="button">⚿ Change login</button><button id="idleSignoutSetting" class="secondary-action" type="button">⏻ Auto sign-out: ${idleLabel(idleMinutes)}</button><button id="manageTravellerAccounts" class="secondary-action" type="button">♙ Traveller profiles</button>${hiddenTripsBar(trips)}<button id="resetTripOrder" class="secondary-action" type="button">↕ Reset order</button><button id="createFromTrips" type="button">＋ Create trip</button></span></div><div class="trip-library admin-library">${items.map((trip, position) => `<article class="trip-library-card ${tripEnabled(trip) ? "" : "disabled-trip"}">${libraryCover(trip)}${tripCardTools(trip, position, items.length)}<div class="trip-card-copy"><span class="trip-code">TRIP ID · ${esc(trip.tripId)}</span><h3>${esc(trip.name)}</h3><p>${esc(trip.destination)} · ${displayDate(trip.startDate, { day: "numeric", month: "short", year: "numeric" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}</p><small>Budget ${money.format(Number(trip.budget || 0))} · Spent ${money.format(Number(trip.spent || 0))} · Organiser ${esc(trip.createdBy || "—")}</small><small>${Number(trip.travellerCount || 0)} members · ${Number(trip.assignedTravellerCount || 0)} assigned profiles${trip.updatedAt ? ` · Updated ${displayDate(String(trip.updatedAt).slice(0, 10))}` : ""}</small><b class="status-pill ${tripEnabled(trip) ? "active" : "disabled"}">${tripEnabled(trip) ? "ACTIVE" : "DISABLED"}</b></div><div class="trip-card-actions"><button data-open-admin-trip="${esc(trip.tripId)}" type="button">Open</button><button data-edit-listed-trip="${esc(trip.tripId)}" type="button">Edit</button><button data-assign-trip="${esc(trip.tripId)}" type="button">Travellers</button><button data-toggle-trip="${esc(trip.tripId)}" data-enabled="${tripEnabled(trip)}" type="button">${tripEnabled(trip) ? "Disable" : "Enable"}</button><button class="danger-link" data-delete-trip="${esc(trip.tripId)}" type="button">Delete</button></div></article>`).join("") || `<div class="empty-trips"><b>No trips yet</b><p>Create your first trip with this Administrator account.</p></div>`}</div><p class="global-access-note">◆ This Administrator username and password control every trip. Traveller profiles can exist without a trip assignment.</p></div></section>`;
    $$('[data-move-trip]').forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      if (await moveTripInOrder(button.dataset.moveTrip, Number(button.dataset.direction), items)) { renderAllTrips(state.libraryTrips, administratorSecret, demoMode); toast("Trip order saved for everyone"); }
      else button.disabled = false;
    }));
    if ($("#resetTripOrder")) $("#resetTripOrder").addEventListener("click", async () => { await saveTripOrder([]); renderAllTrips(state.libraryTrips, administratorSecret, demoMode); toast("Trip order reset for everyone"); });
    $$('[data-hide-trip]').forEach((button) => button.addEventListener("click", async () => { button.disabled = true; await toggleTripHidden(button.dataset.hideTrip); renderAllTrips(state.libraryTrips, administratorSecret, demoMode); }));
    if ($("#toggleHiddenTrips")) $("#toggleHiddenTrips").addEventListener("click", () => { state.showHiddenTrips = !state.showHiddenTrips; renderAllTrips(trips, administratorSecret, demoMode); });
    showAccountHub("administrator", `ADMINISTRATOR · ${state.accountUsername}`);
    $("#createFromTrips").addEventListener("click", () => { closeModal(); showCreateTrip(); });
    $("#changeAdministratorLogin").addEventListener("click", () => showAdministratorLoginChange(administratorSecret, items, demoMode));
    $("#idleSignoutSetting").addEventListener("click", () => showIdleSignoutSetting(administratorSecret, trips, demoMode));
    $("#manageTravellerAccounts").addEventListener("click", () => loadTravellerAccounts(administratorSecret, items, demoMode));
    $$('[data-open-admin-trip]').forEach((button) => button.addEventListener("click", () => openListedTrip(button.dataset.openAdminTrip, administratorSecret, demoMode, "administrator")));
    $$('[data-edit-listed-trip]').forEach((button) => button.addEventListener("click", async () => { await openListedTrip(button.dataset.editListedTrip, administratorSecret, demoMode, "administrator"); showEditTrip(); }));
    $$('[data-assign-trip]').forEach((button) => button.addEventListener("click", () => showTripTravellerAssignments(items.find((trip) => trip.tripId === button.dataset.assignTrip), items, administratorSecret, demoMode)));
    $$('[data-toggle-trip]').forEach((button) => button.addEventListener("click", async () => {
      const tripId = button.dataset.toggleTrip, enabled = button.dataset.enabled !== "true";
      try {
        if (demoMode) { const trip = demoTrips.find((item) => item.tripId === tripId); if (trip) trip.enabled = enabled; }
        else await api("setTripEnabled", { tripId, username: state.accountUsername, password: administratorSecret, pin: administratorSecret, enabled });
        toast(`Trip ${enabled ? "enabled" : "disabled"}`); await loadAllTrips(administratorSecret, demoMode);
      } catch (error) { toast(error.message, true); }
    }));
    $$('[data-delete-trip]').forEach((button) => button.addEventListener("click", () => showDeleteTripConfirmation(button.dataset.deleteTrip, administratorSecret, demoMode)));
  }

  function showAdministratorLoginChange(currentPassword, trips, demoMode) {
    showModal("Change Administrator login", `<form class="modal-form" id="administratorLoginForm"><div class="security-note"><i>⚿</i><p>Choose your permanent Administrator username and password. The old login will stop working immediately after saving.</p></div><label>New Administrator username<input name="newUsername" minlength="3" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value="${esc(state.accountUsername)}" autocomplete="username" required></label><div class="form-row"><label>New password<input name="newPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password" placeholder="6–64 characters" required></label><label>Confirm new password<input name="confirmPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password" required></label></div><p class="form-help">This changes the global Administrator login only. Shared trip passwords and Traveller passwords are not changed.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save new login</button></div></form>`);
    $("#administratorLoginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.newPassword !== values.confirmPassword) return toast("The two password entries do not match", true);
      try {
        if (!demoMode) await api("changeAdministratorLogin", { username: state.accountUsername, password: currentPassword, newUsername: values.newUsername, newPassword: values.newPassword });
        const savedLogin = readSavedAccountLogin();
        state.accountUsername = String(values.newUsername || "").trim().toLowerCase();
        state.pin = String(values.newPassword);
        if (savedLogin) saveAccountLogin(state.accountUsername);
        closeModal();
        renderAllTrips(trips, state.pin, demoMode);
        toast("Administrator username and password updated");
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showDeleteTripConfirmation(tripId, administratorSecret = state.pin, demoMode = state.demoMode) {
    showModal("Permanently delete trip", `<form class="modal-form" id="deleteTripForm"><div class="danger-note"><b>This cannot be undone</b><p>All plans, places, expenses, members and traveller assignments for <strong>${esc(tripId)}</strong> will be deleted.</p></div><label>Type the exact Trip ID to confirm<input name="confirmTripId" autocomplete="off" placeholder="${esc(tripId)}" required></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button class="danger-submit" type="submit">Delete permanently</button></div></form>`);
    $("#deleteTripForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const confirmation = String(new FormData(event.currentTarget).get("confirmTripId") || "").trim().toUpperCase();
      if (confirmation !== tripId) return toast(`Type ${tripId} exactly`, true);
      try {
        if (demoMode) { const index = demoTrips.findIndex((trip) => trip.tripId === tripId); if (index >= 0) demoTrips.splice(index, 1); }
        else await api("deleteTrip", { tripId, username: state.accountUsername, password: administratorSecret, pin: administratorSecret, confirmTripId: confirmation });
        toast(`Trip ${tripId} deleted`); await loadAllTrips(administratorSecret, demoMode);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  async function loadAllTrips(administratorSecret, demoMode, username = state.accountUsername || "administrator") {
    try {
      if (!demoMode) await ensureCurrentBackend();
      state.accountUsername = String(username || "administrator").trim().toLowerCase(); state.pin = administratorSecret; state.administratorSecret = administratorSecret; state.demoMode = demoMode; state.authenticated = true; state.accessRole = "administrator";
      const trips = demoMode ? demoTrips : (await api("listTrips", { username: state.accountUsername, password: administratorSecret, pin: administratorSecret })).trips;
      renderAllTrips(trips, administratorSecret, demoMode);
    } catch (error) { toast(error.message, true); }
  }

  function showAllTrips() {
    if (state.authenticated && isAdmin()) return loadAllTrips(state.pin, state.demoMode, state.accountUsername);
    performLogout("Please sign in with your username and password.");
  }

  async function loadMyTrips(pin, traveller, demoMode) {
    try {
      if (!demoMode) await ensureCurrentBackend();
      state.accountUsername = String(traveller.travellerId || state.accountUsername || "").trim().toUpperCase(); state.pin = pin; state.demoMode = demoMode; state.authenticated = true; state.accessRole = "traveller"; state.travellerId = state.accountUsername;
      const result = demoMode ? { traveller, trips: demoTrips.filter((trip) => tripEnabled(trip) && traveller.tripIds.includes(trip.tripId)) } : await api("listMyTrips", { username: state.accountUsername, password: pin, travellerId: state.accountUsername, pin });
      renderMyTrips(result.trips || [], pin, result.traveller || traveller, demoMode);
    } catch (error) { toast(error.message, true); }
  }

  function travellerTripQuotaInfo(traveller) {
    const fallbackLimit = traveller?.canCreateTrips === true ? 1 : 0;
    const limit = Math.max(0, Number.isFinite(Number(traveller?.tripCreationLimit)) ? Number(traveller.tripCreationLimit) : fallbackLimit);
    const created = Math.max(0, Number(traveller?.createdTripCount || 0));
    const remaining = Math.max(0, Number.isFinite(Number(traveller?.tripCreationRemaining)) ? Number(traveller.tripCreationRemaining) : limit - created);
    return { limit, created, remaining, enabled: limit > 0, canCreateAnother: limit > 0 && remaining > 0 };
  }

  function travellerTripQuotaLabel(quota) {
    if (!quota.enabled) return "TRIP CREATION DISABLED";
    if (!quota.canCreateAnother) return `LIMIT REACHED · ${quota.created}/${quota.limit}`;
    return `CREATED ${quota.created} OF ${quota.limit} · ${quota.remaining} LEFT`;
  }

  function renderMyTrips(trips, pin, traveller, demoMode) {
    state.pwCtx = { pin, traveller, demoMode };
    loadProfilePhotos();
    const quota = travellerTripQuotaInfo(traveller);
    const canCreateTrips = quota.enabled;
    const canCreateAnotherTrip = quota.canCreateAnother;
    const orderedList = visibleLibraryTrips(trips);
    const tripCards = orderedList.map((trip, position) => {
      const permissions = trip.permissions || {};
      const details = [];
      if (permissions.viewTravellers !== false && typeof trip.travellerCount !== "undefined") details.push(`${Number(trip.travellerCount || 0)} travellers`);
      if (permissions.viewExpenses !== false && typeof trip.spent !== "undefined") details.push(`${money.format(Number(trip.spent || 0))} spent`);
      const featureCount = ["viewItinerary", "viewExperiences", "viewPlaces", "viewExpenses", "viewTravellers", "printReports", "writeStickyNotes"].filter((key) => permissions[key] === true || (key !== "writeStickyNotes" && permissions[key] !== false)).length;
      details.push(`${featureCount}/7 access options available`);
      return `<article class="trip-library-card"><i>♙</i><div><span class="trip-code">TRIP ID · ${esc(trip.tripId)}</span><h3>${esc(trip.name)}</h3><p>${esc(trip.destination)} · ${displayDate(trip.startDate, { day: "numeric", month: "short", year: "numeric" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}</p><small>${details.join(" · ")}</small></div><button data-open-my-trip="${esc(trip.tripId)}" type="button">Open →</button></article>`;
    }).join("");
    $("#accountHubContent").innerHTML = `<section class="account-hub-shell"><div class="account-hub-hero traveller"><div><span>MY TRAVEL DASHBOARD</span><h1>Every permitted trip</h1><p>Signed in as <b>${esc(traveller.travellerId)}</b>. Open a trip to view and manage every feature allowed by the Administrator.</p></div><strong>${trips.length} ${trips.length === 1 ? "TRIP" : "TRIPS"}</strong></div><div class="all-trips-modal"><div class="self-profile-card"><i class="avatar-edit" data-photo-upload="${esc(traveller.travellerId)}" title="Change my photo">${avatarSlot(traveller)}<em>📷</em></i><div><span>USERNAME · ${esc(traveller.travellerId)}</span><h3>${esc(traveller.name)}</h3><p>${[traveller.phone, traveller.email, traveller.city].filter(Boolean).map(esc).join(" · ") || "Personal traveller profile"}</p></div><b class="${canCreateAnotherTrip ? "trip-creation-allowed" : ""}">${travellerTripQuotaLabel(quota)}</b></div>${proMemberCard(traveller)}<div class="pw-tools"><button type="button" class="secondary-action" data-change-my-pw>⚿ Change my password</button><button type="button" class="secondary-action" data-owner-reset-pw>♙ Reset traveller password</button></div><div class="profile-trip-heading self"><div><span class="kicker">ALL MY TRIPS</span><h3>Trips available with this account</h3></div>${canCreateAnotherTrip ? `<button id="createTravellerTrip" type="button">＋ Create trip (${quota.remaining} left)</button>` : ""}</div><div class="trip-library">${tripCards || `<div class="empty-trips"><b>No active trips assigned</b><p>${canCreateAnotherTrip ? "Create a new trip using the button above." : `Ask the Administrator to assign trips or increase the creation limit for username ${esc(traveller.travellerId)}.`}</p></div>`}</div><p class="global-access-note">♙ ${canCreateTrips ? (canCreateAnotherTrip ? `The Global Administrator allows up to ${quota.limit} created ${quota.limit === 1 ? "trip" : "trips"}; ${quota.remaining} ${quota.remaining === 1 ? "slot remains" : "slots remain"}.` : `Your creation limit is ${quota.limit}; existing trips are preserved, but no new trip can be created until the Administrator increases the limit.`) : "Trip creation is disabled. This account still shows every active trip assigned now or in the future."}</p></div></section>`;

    showAccountHub("traveller", `TRAVELLER · ${traveller.travellerId}`);
    $$('[data-open-my-trip]').forEach((button) => button.addEventListener("click", () => openListedTrip(button.dataset.openMyTrip, pin, demoMode, "traveller", traveller)));
    if ($("#createTravellerTrip")) $("#createTravellerTrip").addEventListener("click", () => showTravellerCreateTrip(trips, pin, traveller, demoMode));
  }

  function showTravellerCreateTrip(trips, personalPassword, traveller, demoMode) {
    const quota = travellerTripQuotaInfo(traveller);
    if (!quota.enabled) return toast("The Global Administrator has disabled trip creation for this account", true);
    if (!quota.canCreateAnother) return toast(`Trip-creation limit reached (${quota.created} of ${quota.limit})`, true);
    showModal("Create a new trip", `<form class="modal-form" id="travellerCreateTripForm"><div class="security-note traveller-note"><i>＋</i><p>You may create <b>${quota.remaining}</b> more ${quota.remaining === 1 ? "trip" : "trips"} under the Administrator-set limit of <b>${quota.limit}</b>. You will be recorded as organiser, while the Global Administrator retains full control.</p></div><label>Trip name<input name="name" maxlength="100" placeholder="e.g. Kerala family holiday" required></label><label>Destination<input name="destination" maxlength="120" placeholder="e.g. Kochi, Kerala" required></label><div class="form-row"><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date" required></label></div><label>Total budget (₹)<input name="budget" type="number" min="0" step="0.01" value="50000" required></label><div class="form-row"><label>Shared password for this trip<input name="sharedPassword" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label><label>Confirm shared password<input name="confirmSharedPassword" type="password" minlength="4" maxlength="64" autocomplete="new-password" required></label></div><p class="form-help">The shared password opens only this trip. It must be different from your personal account password.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Create trip</button></div></form>`);
    $("#travellerCreateTripForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (new Date(values.endDate) < new Date(values.startDate)) return toast("End date cannot be before the start date", true);
      if (values.sharedPassword !== values.confirmSharedPassword) return toast("The two shared-password entries do not match", true);
      if (values.sharedPassword === personalPassword) return toast("Choose a shared trip password different from your personal password", true);
      const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Creating…";
      try {
        let tripId;
        if (demoMode) {
          const prefix = String(values.destination || "TRIP").replace(/[^A-Za-z]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
          tripId = `${prefix}${Math.floor(100 + Math.random() * 900)}`;
          const summary = { tripId, name: values.name, destination: values.destination, startDate: values.startDate, endDate: values.endDate, budget: Number(values.budget), spent: 0, travellerCount: 1, assignedTravellerCount: 1, assignedTravellerIds: [traveller.travellerId], enabled: true, createdBy: traveller.name, permissions: { viewItinerary: true, viewExperiences: true, viewPlaces: true, viewExpenses: true, viewTravellers: true, printReports: true, writeStickyNotes: false } };
          demoTrips.push(summary); traveller.tripIds = [...new Set([...(traveller.tripIds || []), tripId])];
          const demoAccount = demoTravellerAccounts.find((item) => item.travellerId === traveller.travellerId);
          traveller.createdTripCount = Number(traveller.createdTripCount || 0) + 1; traveller.tripCreationRemaining = Math.max(0, Number(traveller.tripCreationLimit || 0) - traveller.createdTripCount); traveller.canCreateAnotherTrip = traveller.tripCreationRemaining > 0;
          if (demoAccount) { demoAccount.tripIds = [...new Set([...(demoAccount.tripIds || []), tripId])]; demoAccount.tripCount = demoAccount.tripIds.length; demoAccount.createdTripCount = Number(demoAccount.createdTripCount || 0) + 1; demoAccount.tripCreationRemaining = Math.max(0, Number(demoAccount.tripCreationLimit || 0) - demoAccount.createdTripCount); demoAccount.canCreateAnotherTrip = demoAccount.tripCreationRemaining > 0; }
        } else {
          const result = await api("createTravellerTrip", { username: traveller.travellerId, password: personalPassword, trip: { name: values.name, destination: values.destination, startDate: values.startDate, endDate: values.endDate, budget: Number(values.budget) }, sharedPassword: values.sharedPassword });
          tripId = result.trip.tripId;
        }
        await loadMyTrips(personalPassword, traveller, demoMode);
        toast(`Trip created successfully · ${tripId}`);
      } catch (error) { submit.disabled = false; submit.textContent = "Create trip"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showMyTrips() {
    if (state.authenticated && state.travellerId) return loadMyTrips(state.pin, { travellerId: state.travellerId, name: state.currentUser, tripIds: demoTraveller.tripIds || ["GOA26", "KER27"] }, state.demoMode);
    performLogout("Please sign in with your username and password.");
  }

  async function loadTravellerAccounts(administratorSecret, trips, demoMode) {
    try {
      const travellers = demoMode ? demoTravellerAccounts : (await api("listTravellerAccounts", { ...adminAuth(administratorSecret) })).travellers;
      renderTravellerAccounts(travellers || [], trips || [], administratorSecret, demoMode);
    } catch (error) { toast(error.message, true); }
  }

  function renderTravellerAccounts(travellers, trips, administratorSecret, demoMode) {
    state.planCtx = { travellers, trips, administratorSecret, demoMode };
    showModal("Traveller profiles", `<div class="traveller-manager"><div class="all-trips-summary"><span><small>PERMANENT TRAVELLER DIRECTORY</small><b>${travellers.length} profiles</b></span><span class="summary-actions"><button id="backToAllTrips" class="secondary-action" type="button">← All trips</button><button id="proRulesToggle" type="button" class="secondary-action">Pro rules…</button><button id="createTravellerAccount" type="button">＋ Add traveller</button></span></div><p class="directory-note">Use <b>Trip limit</b> to cap, increase, reduce or disable how many trips a traveller may create. Assigned trips do not consume this limit.</p><div class="account-list">${travellers.map((traveller) => `<article class="account-card ${traveller.active ? "" : "inactive"}"><span class="account-avatar${isAdmin() || state.administratorSecret ? " avatar-edit" : ""}"${isAdmin() || state.administratorSecret ? ` data-photo-upload="${esc(traveller.travellerId)}" title="Change ${esc(traveller.name)}'s photo"` : ""}>${avatarSlot(traveller)}${isAdmin() || state.administratorSecret ? "<em>📷</em>" : ""}</span><div class="account-profile"><span>${esc(traveller.travellerId)}</span><h3>${esc(traveller.name)}</h3><p>${[traveller.phone, traveller.email].filter(Boolean).map(esc).join(" · ") || "Contact details not added"}</p><small>${[traveller.city, traveller.emergencyContact ? `Emergency: ${traveller.emergencyContact}` : ""].filter(Boolean).map(esc).join(" · ") || "City and emergency contact not added"}</small><div class="account-trip-status ${Number(traveller.tripCount || 0) ? "assigned" : "unassigned"}">${Number(traveller.tripCount || 0) ? `${Number(traveller.tripCount)} assigned ${Number(traveller.tripCount) === 1 ? "trip" : "trips"}: ${(traveller.tripIds || []).map(esc).join(", ")}` : "NO TRIP ASSIGNED"}</div></div><div class="account-actions"><button data-view-account="${esc(traveller.travellerId)}">View profile</button><button data-account-trips="${esc(traveller.travellerId)}">Assign trips</button><button class="pin-account-control" data-edit-account-login="${esc(traveller.travellerId)}">✎ Edit login</button><button class="plan-account-control${traveller.plan === "pro" ? " is-pro" : ""}" data-account-plan="${esc(traveller.travellerId)}">${traveller.plan === "pro" ? `<span class="pro-coin" aria-hidden="true">✦</span>PRO MEMBER` : "Free · tap to give Pro"}${traveller.plan === "pro" && traveller.planExpires ? ` · till ${esc(traveller.planExpires)}` : ""}</button><button class="global-profile-control" data-toggle-account="${esc(traveller.travellerId)}" data-active="${Boolean(traveller.active)}">${traveller.active ? "Disable everywhere" : "Enable profile"}</button><button class="delete-profile-control" data-delete-account="${esc(traveller.travellerId)}">Delete profile</button></div></article>`).join("") || `<div class="empty-trips"><b>No traveller profiles</b><p>Add a traveller profile now. A trip does not need to be assigned.</p></div>`}</div></div>`);
    travellers.forEach((traveller) => {
      const viewButton = $$('[data-view-account]').find((button) => button.dataset.viewAccount === traveller.travellerId);
      const card = viewButton?.closest(".account-card");
      if (!card) return;
      const quota = travellerTripQuotaInfo(traveller);
      card.querySelector(".account-profile")?.insertAdjacentHTML("beforeend", `<span class="trip-create-permission-status ${quota.canCreateAnother ? "allowed" : ""}">${esc(travellerTripQuotaLabel(quota))}</span>`);
      card.querySelector(".account-actions")?.insertAdjacentHTML("afterbegin", `<button class="trip-create-permission-control ${quota.enabled ? "allowed" : ""}" data-set-trip-limit="${esc(traveller.travellerId)}">Set trip limit</button>`);
    });
    $("#backToAllTrips").addEventListener("click", () => renderAllTrips(trips, administratorSecret, demoMode));
    $("#createTravellerAccount").addEventListener("click", () => showCreateTravellerAccount(trips, administratorSecret, demoMode));
    $$('[data-view-account]').forEach((button) => button.addEventListener("click", () => showTravellerProfile(travellers.find((item) => item.travellerId === button.dataset.viewAccount), trips, administratorSecret, demoMode)));
    $$('[data-account-trips]').forEach((button) => button.addEventListener("click", () => showTravellerTripAssignments(travellers.find((item) => item.travellerId === button.dataset.accountTrips), trips, administratorSecret, demoMode)));
    $$('[data-edit-account-login]').forEach((button) => button.addEventListener("click", () => showEditTravellerCredentials(travellers.find((item) => item.travellerId === button.dataset.editAccountLogin), trips, administratorSecret, demoMode)));
    $$('[data-delete-account]').forEach((button) => button.addEventListener("click", () => showDeleteTravellerAccount(travellers.find((item) => item.travellerId === button.dataset.deleteAccount), trips, administratorSecret, demoMode)));
    $$('[data-set-trip-limit]').forEach((button) => button.addEventListener("click", () => showTravellerTripCreationLimit(travellers.find((item) => item.travellerId === button.dataset.setTripLimit), trips, administratorSecret, demoMode)));
    $$('[data-toggle-account]').forEach((button) => button.addEventListener("click", async () => {
      const travellerId = button.dataset.toggleAccount, active = button.dataset.active !== "true";
      try {
        if (demoMode) { const account = demoTravellerAccounts.find((item) => item.travellerId === travellerId); if (account) account.active = active; }
        else await api("setTravellerActive", { ...adminAuth(administratorSecret), travellerId, active });
        toast(active ? "Traveller profile enabled across assigned trips" : "Traveller profile disabled everywhere"); await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { toast(error.message, true); }
    }));
  }

  function showTravellerTripCreationLimit(traveller, trips, administratorSecret, demoMode) {
    if (!traveller) return toast("Traveller profile not found", true);
    const quota = travellerTripQuotaInfo(traveller);
    showModal("Traveller trip-creation limit", `<form class="modal-form trip-creation-quota-form" id="travellerTripCreationLimitForm"><div class="profile-id-banner"><span>TRAVELLER USERNAME</span><b>${esc(traveller.travellerId)}</b><small>${esc(traveller.name)}</small></div><div class="quota-summary"><span><small>CREATED BY TRAVELLER</small><b>${quota.created}</b></span><span><small>CURRENT LIMIT</small><b>${quota.limit}</b></span><span><small>REMAINING</small><b>${quota.remaining}</b></span></div><label>Maximum trips this traveller may create<input name="tripCreationLimit" type="number" min="0" max="100" step="1" value="${quota.limit}" required></label><div class="security-note traveller-note"><i>◆</i><p>Enter <b>0</b> to disable trip creation. You can increase or reduce this limit later. Existing trips are never deleted; if the limit is reduced below the number already created, only further creation is blocked.</p></div><p class="form-help">Trips merely assigned by the Administrator are not counted. Only trips created by this traveller use the quota.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save trip limit</button></div></form>`);
    $("#travellerTripCreationLimitForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const limit = Number(new FormData(event.currentTarget).get("tripCreationLimit"));
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) return toast("Enter a whole-number limit from 0 to 100", true);
      const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Saving…";
      try {
        if (demoMode) {
          const account = demoTravellerAccounts.find((item) => item.travellerId === traveller.travellerId);
          if (account) { account.tripCreationLimit = limit; account.canCreateTrips = limit > 0; account.tripCreationRemaining = Math.max(0, limit - Number(account.createdTripCount || 0)); account.canCreateAnotherTrip = account.tripCreationRemaining > 0; }
        } else await api("setTravellerTripCreationLimit", { ...adminAuth(administratorSecret), travellerId: traveller.travellerId, limit });
        toast(limit > 0 ? `Trip-creation limit set to ${limit}` : "Trip creation disabled for this traveller");
        await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { submit.disabled = false; submit.textContent = "Save trip limit"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function showDeleteTravellerAccount(traveller, trips, administratorSecret, demoMode) {
    if (!traveller) return toast("Traveller profile not found", true);
    const tripIds = traveller.tripIds || [];
    showModal("Delete duplicate traveller profile", `<form class="modal-form" id="deleteTravellerAccountForm"><div class="danger-note"><b>Permanent profile deletion</b><p>This permanently deletes <strong>${esc(traveller.name)}</strong> · ${esc(traveller.travellerId)} and removes that Traveller ID from ${tripIds.length} assigned ${tripIds.length === 1 ? "trip" : "trips"}.</p></div><p class="trip-access-note">Use this only for a duplicate or mistakenly created account. Historical expenses and experience notes already written under this name will remain unchanged.</p><label>Type the exact Traveller ID to confirm<input name="confirmTravellerId" autocomplete="off" placeholder="${esc(traveller.travellerId)}" required></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button class="danger-submit" type="submit">Delete profile permanently</button></div></form>`);
    $("#deleteTravellerAccountForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const confirmTravellerId = String(new FormData(event.currentTarget).get("confirmTravellerId") || "").trim().toUpperCase();
      if (confirmTravellerId !== String(traveller.travellerId).trim().toUpperCase()) return toast("Type the exact Traveller ID to confirm deletion", true);
      const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Deleting…";
      try {
        if (demoMode) {
          const index = demoTravellerAccounts.findIndex((item) => item.travellerId === traveller.travellerId);
          if (index >= 0) demoTravellerAccounts.splice(index, 1);
          demoTrips.forEach((trip) => { trip.assignedTravellerIds = (trip.assignedTravellerIds || []).filter((id) => id !== traveller.travellerId); trip.assignedTravellerCount = trip.assignedTravellerIds.length; });
          demo.assignments = (demo.assignments || []).filter((item) => item.travellerId !== traveller.travellerId);
          demo.members = (demo.members || []).filter((item) => item.travellerId !== traveller.travellerId);
          if (state.data) { state.data.assignments = (state.data.assignments || []).filter((item) => item.travellerId !== traveller.travellerId); state.data.members = (state.data.members || []).filter((item) => item.travellerId !== traveller.travellerId); }
        } else await api("deleteTravellerAccount", { ...adminAuth(administratorSecret), travellerId: traveller.travellerId, confirmTravellerId });
        toast(`Duplicate profile ${traveller.travellerId} deleted. Historical expenses were preserved.`);
        await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { submit.disabled = false; submit.textContent = "Delete profile permanently"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function currentTripTravellerIds() {
    const tripId = String(state.data.trip.tripId || "").trim().toUpperCase();
    const assigned = new Set((state.data.assignments || []).filter((assignment) => !assignment.tripId || String(assignment.tripId).trim().toUpperCase() === tripId).map((assignment) => String(assignment.travellerId || "").trim().toUpperCase()).filter(Boolean));
    state.data.members.filter((member) => member.travellerId).forEach((member) => assigned.add(String(member.travellerId).trim().toUpperCase()));
    return assigned;
  }

  function updateDemoCurrentTripAssignments(selected, travellers = demoTravellerAccounts) {
    const tripId = String(state.data.trip.tripId || "").trim().toUpperCase();
    const profiles = new Map(travellers.map((traveller) => [String(traveller.travellerId).trim().toUpperCase(), traveller]));
    const existingMembers = new Map(state.data.members.filter((member) => member.travellerId).map((member) => [String(member.travellerId).trim().toUpperCase(), member]));
    const existingAssignments = new Map((state.data.assignments || []).filter((assignment) => assignment.travellerId).map((assignment) => [String(assignment.travellerId).trim().toUpperCase(), assignment]));
    state.data.assignments = [...selected].map((travellerId) => ({ ...(existingAssignments.get(travellerId) || {}), id: existingAssignments.get(travellerId)?.id || uid(), tripId, travellerId, role: existingAssignments.get(travellerId)?.role || existingMembers.get(travellerId)?.role || "Editor" }));
    state.data.members = [...state.data.members.filter((member) => !member.travellerId), ...[...selected].map((travellerId) => {
      const member = existingMembers.get(travellerId), profile = profiles.get(travellerId);
      return member || { id: uid(), travellerId, name: profile?.name || travellerId, role: "Editor" };
    })];
    demoTravellerAccounts.forEach((account) => {
      account.tripIds = account.tripIds || [];
      account.tripIds = selected.has(String(account.travellerId).trim().toUpperCase()) ? [...new Set([...account.tripIds, tripId])] : account.tripIds.filter((id) => String(id).trim().toUpperCase() !== tripId);
      account.tripCount = account.tripIds.length;
    });
    const tripSummary = demoTrips.find((trip) => String(trip.tripId).trim().toUpperCase() === tripId);
    if (tripSummary) { tripSummary.assignedTravellerIds = [...selected]; tripSummary.assignedTravellerCount = selected.size; tripSummary.travellerCount = state.data.members.length; }
    if (String(demo.trip.tripId).trim().toUpperCase() === tripId) { demo.assignments = clone(state.data.assignments); demo.members = clone(state.data.members); }
  }

  async function reloadCurrentTripAccess() {
    if (state.demoMode) return;
    const latest = await api("getTrip", authPayload());
    state.data = normalize(latest); state.accessRole = latest.accessRole; state.permissions = latest.permissions || {};
  }

  async function showCurrentTripTravellerAccess() {
    if (!isAdmin()) return toast("Administrator access required", true);
    try {
      const travellers = state.demoMode ? demoTravellerAccounts : (await api("listTravellerAccounts", { ...adminAuth() })).travellers || [];
      const current = currentTripTravellerIds();
      showModal(`Trip access · ${state.data.trip.tripId}`, `<form class="modal-form assignment-form" id="currentTripTravellerAccessForm"><div class="security-note traveller-note"><i>♙</i><p>Choose the traveller profiles allowed to open <b>${esc(state.data.trip.name)}</b>.</p></div><p class="trip-access-note"><b>Trip-specific control:</b> unchecking a traveller disables only this trip. Their personal PIN, profile and other trip assignments are not changed.</p><div class="check-list">${travellers.map((traveller) => { const travellerId = String(traveller.travellerId).trim().toUpperCase(); return `<label class="check-card ${traveller.active ? "" : "inactive"}"><input type="checkbox" name="travellerIds" value="${esc(travellerId)}" ${current.has(travellerId) ? "checked" : ""}><span><b>${esc(traveller.name)}</b><small>${esc(travellerId)} · ${traveller.active ? "Profile active" : "Profile globally disabled"}</small></span></label>`; }).join("") || `<p>No traveller profiles exist yet. Add a traveller profile first.</p>`}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save trip access</button></div></form>`);
      $("#currentTripTravellerAccessForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Saving…";
        const selected = new Set(new FormData(event.currentTarget).getAll("travellerIds").map((id) => String(id).trim().toUpperCase()));
        const additions = [...selected].filter((id) => !current.has(id)), removals = [...current].filter((id) => !selected.has(id));
        try {
          if (state.demoMode) updateDemoCurrentTripAssignments(selected, travellers);
          else {
            if (additions.length) await api("assignTravellers", authPayload({ travellerIds: additions }));
            for (const travellerId of removals) await api("removeTravellerAssignment", authPayload({ travellerId }));
            await reloadCurrentTripAccess();
          }
          closeModal(); hydrateShell(); render(); updatePrintArea(); toast("Trip access updated. Other trips were not changed.");
        } catch (error) { submit.disabled = false; submit.textContent = "Save trip access"; toast(error.message, true); }
      });
      $('[data-cancel]').addEventListener("click", closeModal);
    } catch (error) { toast(error.message, true); }
  }

  async function showAddExistingTravellersToCurrentTrip() {
    if (!isAdmin()) return toast("Administrator access required", true);
    try {
      const travellers = state.demoMode ? demoTravellerAccounts : (await api("listTravellerAccounts", { ...adminAuth() })).travellers || [];
      const current = currentTripTravellerIds();
      const available = travellers.filter((traveller) => !current.has(String(traveller.travellerId || "").trim().toUpperCase()));
      showModal("Add existing traveller", `<form class="modal-form assignment-form" id="addExistingTravellerForm"><div class="security-note traveller-note"><i>♙</i><p>Select saved traveller profiles to add to <b>${esc(state.data.trip.name)}</b>. Their existing Traveller ID and personal PIN will continue to work.</p></div><p class="trip-access-note"><b>Reusable profile:</b> adding a traveller here does not remove or alter any of their other trips.</p><div class="check-list">${available.map((traveller) => { const tripIds = (traveller.tripIds || []).filter((id) => String(id).trim().toUpperCase() !== String(state.data.trip.tripId).trim().toUpperCase()); return `<label class="check-card ${traveller.active ? "" : "inactive"}"><input type="checkbox" name="travellerIds" value="${esc(traveller.travellerId)}" ${traveller.active ? "" : "disabled"}><span><b>${esc(traveller.name)}</b><small>${esc(traveller.travellerId)} · ${tripIds.length ? `Already in: ${tripIds.map(esc).join(", ")}` : "Saved profile · no other trip"}${traveller.active ? "" : " · Profile disabled"}</small></span></label>`; }).join("") || `<div class="empty-trips"><b>No available traveller profiles</b><p>Every saved profile is already assigned to this trip, or no profiles have been created.</p></div>`}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit" ${available.some((traveller) => traveller.active) ? "" : "disabled"}>Add selected travellers</button></div></form>`);
      $("#addExistingTravellerForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const selectedIds = new FormData(event.currentTarget).getAll("travellerIds").map((id) => String(id).trim().toUpperCase());
        if (!selectedIds.length) return toast("Select at least one existing traveller", true);
        const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Adding…";
        try {
          if (state.demoMode) updateDemoCurrentTripAssignments(new Set([...current, ...selectedIds]), travellers);
          else { await api("assignTravellers", authPayload({ travellerIds: selectedIds })); await reloadCurrentTripAccess(); }
          closeModal(); hydrateShell(); render(); updatePrintArea(); toast(`${selectedIds.length} existing ${selectedIds.length === 1 ? "traveller" : "travellers"} added. Other trips are unchanged.`);
        } catch (error) { submit.disabled = false; submit.textContent = "Add selected travellers"; toast(error.message, true); }
      });
      $('[data-cancel]').addEventListener("click", closeModal);
    } catch (error) { toast(error.message, true); }
  }

  function showRemoveTravellerFromCurrentTrip(member) {
    if (!isAdmin()) return toast("Administrator access required", true);
    if (!member) return toast("Traveller not found", true);
    if (member.role === "Organiser") return toast("The trip organiser cannot be removed", true);
    const profileNote = member.travellerId
      ? "Their permanent traveller profile, personal PIN and access to every other trip will remain unchanged. You can add them to this trip again from Manage trip access."
      : "Only this trip-member entry will be removed.";
    showModal("Remove traveller from trip", `<div class="trip-disable-confirmation"><div class="danger-note"><b>Remove from this trip only</b><p><strong>${esc(member.name)}</strong> will be removed from <strong>${esc(state.data.trip.name)}</strong>.</p></div><p class="trip-access-note">${profileNote} Existing expense records paid by ${esc(member.name)} will remain in the expense statement.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button class="danger-confirm" id="confirmRemoveTripTraveller" type="button">Remove from trip</button></div></div>`);
    $("#confirmRemoveTripTraveller").addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = "Removing…";
      try {
        if (state.demoMode) {
          if (member.travellerId) { const selected = currentTripTravellerIds(); selected.delete(String(member.travellerId).trim().toUpperCase()); updateDemoCurrentTripAssignments(selected); }
          else state.data.members = state.data.members.filter((item) => String(item.id) !== String(member.id));
        } else {
          if (member.travellerId && currentTripTravellerIds().has(String(member.travellerId).trim().toUpperCase())) await api("removeTravellerAssignment", authPayload({ travellerId: member.travellerId }));
          else await api("deleteRecord", authPayload({ sheet: "Members", id: member.id }));
          await reloadCurrentTripAccess();
        }
        closeModal(); hydrateShell(); render(); updatePrintArea(); toast(`${member.name} removed from ${state.data.trip.tripId}. Profile and other trips are unchanged.`);
      } catch (error) { button.disabled = false; button.textContent = "Remove from trip"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showCreateTravellerAccount(trips, administratorSecret, demoMode) {
    showModal("Add traveller account", `<form class="modal-form" id="createTravellerAccountForm"><div class="security-note traveller-note"><i>♙</i><p>This creates an independent username and password. <b>No trip will be assigned automatically.</b></p></div><div class="form-row"><label>Traveller name<input name="name" maxlength="80" placeholder="e.g. Anita Sutar" required></label><label>Username <small>(optional)</small><input name="travellerId" maxlength="30" placeholder="Generated if blank"></label></div><div class="form-row"><label>Phone<input name="phone" type="tel" maxlength="30" placeholder="e.g. +91 98765 43210"></label><label>Email<input name="email" type="email" maxlength="120" placeholder="name@example.com"></label></div><label>City or location<input name="city" maxlength="80" placeholder="e.g. Bengaluru"></label><label>Emergency contact<input name="emergencyContact" maxlength="120" placeholder="Name and phone number"></label><label>Notes<textarea name="notes" rows="3" maxlength="1000" placeholder="Food preference, accessibility requirement or other useful note"></textarea></label><label>Personal password<input name="pin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label><p class="form-help">The permanent username is the Traveller ID. After saving, assign one or more trips when required.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Create account</button></div></form>`);
    const createForm = $("#createTravellerAccountForm");
    createForm.querySelector(".form-actions").insertAdjacentHTML("beforebegin", `<label>Trip-creation limit<input type="number" name="tripCreationLimit" min="0" max="100" step="1" value="0" required><small>Use 0 to disable creation. The Administrator can increase or reduce this limit later.</small></label>`);
    createForm.addEventListener("submit", async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); values.tripCreationLimit = Number(values.tripCreationLimit); values.canCreateTrips = values.tripCreationLimit > 0;
      try {
        let created;
        if (demoMode) { created = { ...values, travellerId: String(values.travellerId || `TRV-${Math.floor(100 + Math.random() * 900)}`).toUpperCase(), active: true, tripCount: 0, tripIds: [] }; delete created.pin; demoTravellerAccounts.push(created); }
        else created = await api("createTravellerAccount", { ...adminAuth(administratorSecret), traveller: values });
        toast(`Traveller profile saved without a trip · ID ${created.travellerId}`); await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function showTravellerProfile(traveller, trips, administratorSecret, demoMode) {
    if (!traveller) return toast("Traveller profile not found", true);
    const allowed = (traveller.tripIds || []).map((tripId) => trips.find((trip) => trip.tripId === tripId)).filter(Boolean);
    showModal("Traveller profile", `<div class="traveller-profile-view"><div class="profile-hero"><i class="avatar-edit" data-photo-upload="${esc(traveller.travellerId)}" title="Change this traveller's photo">${avatarSlot(traveller)}<em>📷</em></i><div><span>${esc(traveller.travellerId)}</span><h2>${esc(traveller.name)}</h2><p>${traveller.active ? "Active personal access" : "Inactive personal access"}</p></div></div><div class="profile-detail-grid"><span><small>PHONE</small><b>${esc(traveller.phone || "Not added")}</b></span><span><small>EMAIL</small><b>${esc(traveller.email || "Not added")}</b></span><span><small>CITY</small><b>${esc(traveller.city || "Not added")}</b></span><span><small>EMERGENCY CONTACT</small><b>${esc(traveller.emergencyContact || "Not added")}</b></span></div>${traveller.notes ? `<div class="profile-notes"><small>NOTES</small><p>${esc(traveller.notes)}</p></div>` : ""}<div class="profile-trip-heading"><div><span class="kicker">ALLOWED TRIPS</span><h3>${allowed.length} ${allowed.length === 1 ? "trip" : "trips"} in this profile</h3></div><button id="profileAssignTrips" type="button">Manage trips</button></div><div class="profile-trip-list">${allowed.map((trip) => `<article><div><span>TRIP ID · ${esc(trip.tripId)}</span><h4>${esc(trip.name)}</h4><p>${esc(trip.destination)} · ${displayDate(trip.startDate, { day: "numeric", month: "short", year: "numeric" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}</p></div><b class="status-pill ${tripEnabled(trip) ? "active" : "disabled"}">${tripEnabled(trip) ? "ACTIVE" : "DISABLED"}</b></article>`).join("") || `<div class="empty-profile-trips"><b>No trip assigned</b><p>This permanent profile is ready. Trips can be added later.</p></div>`}</div><div class="form-actions profile-actions"><button id="profileBack" type="button">← Back</button><button id="profileTripLimit" type="button">Trip limit</button><button id="profileEdit" type="button">Edit details</button><button id="profileEditLogin" class="pin-primary-action" type="button">✎ Edit login</button></div></div>`);
    const quota = travellerTripQuotaInfo(traveller);
    $(".profile-detail-grid")?.insertAdjacentHTML("beforeend", `<span class="trip-creation-detail ${quota.canCreateAnother ? "allowed" : ""}"><small>TRIP CREATION</small><b>${esc(travellerTripQuotaLabel(quota))}</b></span>`);
    $("#profileAssignTrips").addEventListener("click", () => showTravellerTripAssignments(traveller, trips, administratorSecret, demoMode));
    $("#profileTripLimit").addEventListener("click", () => showTravellerTripCreationLimit(traveller, trips, administratorSecret, demoMode));
    $("#profileEdit").addEventListener("click", () => showEditTravellerAccount(traveller, trips, administratorSecret, demoMode));
    $("#profileEditLogin").addEventListener("click", () => showEditTravellerCredentials(traveller, trips, administratorSecret, demoMode));
    $("#profileBack").addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function showEditTravellerAccount(traveller, trips, administratorSecret, demoMode) {
    if (!traveller) return toast("Traveller profile not found", true);
    showModal("Edit traveller details", `<form class="modal-form" id="editTravellerAccountForm"><div class="profile-id-banner"><span>TRAVELLER ID</span><b>${esc(traveller.travellerId)}</b><small>${Number(traveller.tripCount || 0) ? `${Number(traveller.tripCount)} assigned trips` : "No trip assigned"}</small></div><label>Traveller name<input name="name" maxlength="80" value="${esc(traveller.name)}" required></label><div class="form-row"><label>Phone<input name="phone" type="tel" maxlength="30" value="${esc(traveller.phone || "")}"></label><label>Email<input name="email" type="email" maxlength="120" value="${esc(traveller.email || "")}"></label></div><label>City or location<input name="city" maxlength="80" value="${esc(traveller.city || "")}"></label><label>Emergency contact<input name="emergencyContact" maxlength="120" value="${esc(traveller.emergencyContact || "")}"></label><label>Notes<textarea name="notes" rows="3" maxlength="1000">${esc(traveller.notes || "")}</textarea></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save details</button></div></form>`);
    $("#editTravellerAccountForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        if (demoMode) Object.assign(traveller, values);
        else await api("updateTravellerAccount", { ...adminAuth(administratorSecret), travellerId: traveller.travellerId, traveller: values });
        toast("Traveller details updated"); await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function showResetTravellerPin(traveller, trips, administratorSecret, demoMode) {
    showModal("Edit traveller password", `<form class="modal-form" id="resetTravellerPinForm"><div class="security-note traveller-note"><i>♙</i><p>Administrator is setting a new password for <b>${esc(traveller.name)}</b> · username ${esc(traveller.travellerId)}. Their old password will stop working immediately.</p></div><label>New personal password<input name="newPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label><label>Confirm new password<input name="confirmPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="Enter the same password again" required></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save new password</button></div></form>`);
    $("#resetTravellerPinForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.newPin !== values.confirmPin) return toast("The two password entries do not match", true);
      try { if (!demoMode) await api("resetTravellerPin", { username: state.accountUsername, password: administratorSecret, pin: administratorSecret, travellerId: traveller.travellerId, newPin: values.newPin }); toast("Traveller password updated"); await loadTravellerAccounts(administratorSecret, trips, demoMode); }
      catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function showEditTravellerCredentials(traveller, trips, administratorSecret, demoMode) {
    const oldId = String(traveller.travellerId || "").trim().toUpperCase();
    showModal("Edit traveller login", `<form class="modal-form" id="editTravellerCredentialsForm"><div class="security-note traveller-note"><i>♙</i><p>The Administrator can change both the username and password for <b>${esc(traveller.name)}</b>. The old login will stop working immediately.</p></div><label>Traveller username<input name="newTravellerId" value="${esc(oldId)}" minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9-]{2,29}" autocomplete="username" required></label><div class="form-row"><label>New personal password<input name="newPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label><label>Confirm new password<input name="confirmPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" required></label></div><label>Type current username to confirm<input name="confirmTravellerId" maxlength="30" placeholder="${esc(oldId)}" autocomplete="off" required></label><p class="form-help">Changing the username updates all assigned trips. Historical expenses and diary entries remain unchanged.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save new login</button></div></form>`);
    $("#editTravellerCredentialsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const newId = String(values.newTravellerId || "").trim().toUpperCase();
      if (String(values.confirmTravellerId || "").trim().toUpperCase() !== oldId) return toast("Type the current username exactly to confirm", true);
      if (values.newPin !== values.confirmPin) return toast("The two password entries do not match", true);
      try {
        if (demoMode) {
          if (demoTravellerAccounts.some((item) => item !== traveller && String(item.travellerId).trim().toUpperCase() === newId)) throw new Error("That traveller username already exists.");
          traveller.travellerId = newId;
          demoTrips.forEach((trip) => { trip.assignedTravellerIds = (trip.assignedTravellerIds || []).map((id) => String(id).trim().toUpperCase() === oldId ? newId : id); });
          demo.assignments.forEach((assignment) => { if (String(assignment.travellerId).trim().toUpperCase() === oldId) assignment.travellerId = newId; });
          demo.members.forEach((member) => { if (String(member.travellerId).trim().toUpperCase() === oldId) member.travellerId = newId; });
        } else {
          await api("updateTravellerCredentials", { ...adminAuth(administratorSecret), travellerId: oldId, newTravellerId: newId, newPin: values.newPin, confirmTravellerId: values.confirmTravellerId });
        }
        toast(`Traveller login updated · ${newId}`);
        const refreshedTrips = demoMode ? demoTrips : ((await api("listTrips", { ...adminAuth(administratorSecret) })).trips || []);
        await loadTravellerAccounts(administratorSecret, refreshedTrips, demoMode);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => showTravellerProfile(traveller, trips, administratorSecret, demoMode));
  }

  function showTripTravellerAssignments(trip, trips, administratorSecret, demoMode) {
    if (!trip) return toast("Trip not found", true);
    const continueWith = (travellers) => {
      const current = new Set(trip.assignedTravellerIds || []);
      showModal(`Travellers · ${trip.tripId}`, `<form class="modal-form assignment-form" id="tripTravellerAssignmentForm"><div class="security-note"><i>♙</i><p>Select the traveller profiles allowed to open <b>${esc(trip.name)}</b>. One traveller can be assigned to many trips.</p></div><p class="trip-access-note"><b>Independent access:</b> unchecking a profile disables only this trip. Their PIN, profile and other trips remain unchanged.</p><div class="check-list">${travellers.map((traveller) => `<label class="check-card ${traveller.active ? "" : "inactive"}"><input type="checkbox" name="travellerIds" value="${esc(traveller.travellerId)}" ${current.has(traveller.travellerId) ? "checked" : ""}><span><b>${esc(traveller.name)}</b><small>${esc(traveller.travellerId)} · ${traveller.active ? "Profile active" : "Profile globally disabled"}</small></span></label>`).join("") || `<p>No traveller accounts exist yet.</p>`}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save trip access</button></div></form>`);
      $("#tripTravellerAssignmentForm").addEventListener("submit", async (event) => {
        event.preventDefault(); const selected = new Set(new FormData(event.currentTarget).getAll("travellerIds")); const additions = [...selected].filter((id) => !current.has(id)); const removals = [...current].filter((id) => !selected.has(id));
        try {
          if (demoMode) {
            trip.assignedTravellerIds = [...selected]; trip.assignedTravellerCount = selected.size;
            demoTravellerAccounts.forEach((account) => { account.tripIds = account.tripIds || []; account.tripIds = selected.has(account.travellerId) ? [...new Set([...account.tripIds, trip.tripId])] : account.tripIds.filter((id) => id !== trip.tripId); account.tripCount = account.tripIds.length; });
          } else {
            if (additions.length) await api("assignTravellers", { tripId: trip.tripId, ...adminAuth(administratorSecret), travellerIds: additions });
            for (const travellerId of removals) await api("removeTravellerAssignment", { tripId: trip.tripId, ...adminAuth(administratorSecret), travellerId });
          }
          toast("Trip access updated. Other trips were not changed."); await loadAllTrips(administratorSecret, demoMode);
        } catch (error) { toast(error.message, true); }
      });
      $('[data-cancel]').addEventListener("click", () => renderAllTrips(trips, administratorSecret, demoMode));
    };
    if (demoMode) continueWith(demoTravellerAccounts); else api("listTravellerAccounts", { ...adminAuth(administratorSecret) }).then((result) => continueWith(result.travellers || [])).catch((error) => toast(error.message, true));
  }

  function showTravellerTripAssignments(traveller, trips, administratorSecret, demoMode) {
    const current = new Set(traveller.tripIds || []);
    showModal(`Assign trips · ${traveller.name}`, `<form class="modal-form assignment-form" id="travellerTripAssignmentForm"><div class="security-note traveller-note"><i>♙</i><p>Select every trip that <b>${esc(traveller.name)}</b> should open with personal Traveller ID ${esc(traveller.travellerId)}.</p></div><p class="trip-access-note">Each checkbox controls only that trip. Removing one trip does not change the traveller’s PIN, profile or other trip access.</p><div class="check-list">${trips.map((trip) => `<label class="check-card"><input type="checkbox" name="tripIds" value="${esc(trip.tripId)}" ${current.has(trip.tripId) ? "checked" : ""}><span><b>${esc(trip.name)}</b><small>${esc(trip.tripId)} · ${tripEnabled(trip) ? "Active" : "Disabled"}</small></span></label>`).join("")}</div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save trip access</button></div></form>`);
    $("#travellerTripAssignmentForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const selected = new Set(new FormData(event.currentTarget).getAll("tripIds")); const additions = [...selected].filter((id) => !current.has(id)); const removals = [...current].filter((id) => !selected.has(id));
      try {
        if (demoMode) { traveller.tripIds = [...selected]; traveller.tripCount = selected.size; demoTrips.forEach((trip) => { trip.assignedTravellerIds = trip.assignedTravellerIds || []; trip.assignedTravellerIds = selected.has(trip.tripId) ? [...new Set([...trip.assignedTravellerIds, traveller.travellerId])] : trip.assignedTravellerIds.filter((id) => id !== traveller.travellerId); trip.assignedTravellerCount = trip.assignedTravellerIds.length; }); }
        else {
          if (additions.length) await api("assignTravellerToTrips", { ...adminAuth(administratorSecret), travellerId: traveller.travellerId, tripIds: additions, role: "Editor" });
          for (const tripId of removals) await api("removeTravellerAssignment", { tripId, ...adminAuth(administratorSecret), travellerId: traveller.travellerId });
        }
        toast("Traveller trip access updated independently"); await loadTravellerAccounts(administratorSecret, trips, demoMode);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", () => loadTravellerAccounts(administratorSecret, trips, demoMode));
  }

  function travellerPinRow(index, member) {
    const lockedName = Boolean(member);
    return `<section class="bulk-traveller-row"><header><b>Traveller ${index + 1}</b>${lockedName ? `<span>Existing trip member</span>` : `<button type="button" data-remove-traveller aria-label="Remove traveller">×</button>`}</header><div class="form-row"><label>Traveller name<input data-field="name" maxlength="80" value="${esc(member ? member.name : "")}" ${lockedName ? "readonly" : ""} placeholder="Full name" required></label><label>Personal password<input data-field="pin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label></div><div class="form-row"><label>Phone <small>(optional)</small><input data-field="phone" type="tel" maxlength="30" placeholder="+91 …"></label><label>Email <small>(optional)</small><input data-field="email" type="email" maxlength="120" placeholder="name@example.com"></label></div><div class="form-row"><label>City <small>(optional)</small><input data-field="city" maxlength="80"></label><label>Trip role<select data-field="role"><option>Editor</option><option>Viewer</option></select></label></div></section>`;
  }

  function showAddTravellersToCurrentTrip(existingMember) {
    if (!isAdmin()) return toast("Administrator access required", true);
    const singleMember = Boolean(existingMember);
    showModal(singleMember ? "Create traveller account" : "Add travellers with passwords", `<form class="modal-form" id="bulkTravellerForm"><div class="security-note traveller-note"><i>♙</i><p>${singleMember ? `Create username/password access for <b>${esc(existingMember.name)}</b> and assign it to this trip.` : `Add several travellers to <b>${esc(state.data.trip.name)}</b>. Enter a different password for every traveller.`}</p></div><div id="newTravellerRows"></div>${singleMember ? "" : `<button class="add-row-button" id="addTravellerRow" type="button">＋ Add another traveller</button>`}<p class="form-help">Each traveller receives a permanent Traveller ID used as username. Passwords are securely hashed and cannot be viewed later.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${singleMember ? "Create account and assign" : "Create and add to trip"}</button></div></form>`);
    const rows = $("#newTravellerRows");
    const addRow = (member) => {
      rows.insertAdjacentHTML("beforeend", travellerPinRow(rows.children.length, member));
      $$('[data-remove-traveller]', rows).forEach((button) => { button.onclick = () => { button.closest(".bulk-traveller-row").remove(); $$(".bulk-traveller-row header b", rows).forEach((label, index) => { label.textContent = `Traveller ${index + 1}`; }); }; });
    };
    addRow(existingMember || null);
    if ($("#addTravellerRow")) $("#addTravellerRow").addEventListener("click", () => addRow(null));
    $("#bulkTravellerForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const travellers = $$(".bulk-traveller-row", rows).map((row) => Object.fromEntries(["name", "pin", "phone", "email", "city", "role"].map((field) => [field, row.querySelector(`[data-field="${field}"]`).value.trim()])));
      if (!travellers.length) return toast("Add at least one traveller", true);
      const pinSet = new Set(travellers.map((traveller) => traveller.pin));
      if (pinSet.size !== travellers.length) return toast("Choose a different personal password for every traveller", true);
      try {
        let assigned;
        if (state.demoMode) {
          assigned = travellers.map((traveller) => {
            const travellerId = `${traveller.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "TRV"}-${Math.floor(100 + Math.random() * 900)}`;
            const profile = { ...traveller, travellerId, active: true, tripCount: 1, tripIds: [state.data.trip.tripId] }; delete profile.pin; demoTravellerAccounts.push(profile);
            const member = state.data.members.find((item) => !item.travellerId && item.name === traveller.name);
            if (member) { member.travellerId = travellerId; member.role = traveller.role; }
            else state.data.members.push({ id: uid(), travellerId, name: traveller.name, role: traveller.role });
            return { traveller: profile, role: traveller.role };
          });
        } else {
          const result = await api("assignTravellers", authPayload({ travellers })); assigned = result.travellers || [];
          const latest = await api("getTrip", authPayload()); state.data = normalize(latest); state.accessRole = latest.accessRole; state.permissions = latest.permissions || {};
        }
        hydrateShell(); render(); updatePrintArea(); showCreatedTravellerAccess(travellers, assigned);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showCreatedTravellerAccess(travellers, assigned) {
    const accessRows = travellers.map((traveller, index) => ({ ...traveller, travellerId: assigned[index] && assigned[index].traveller ? assigned[index].traveller.travellerId : "Created" }));
    const copyText = accessRows.map((item) => `${item.name}\nUsername: ${item.travellerId}\nPassword: ${item.pin}\nAssigned trip: ${state.data.trip.tripId}`).join("\n\n");
    showModal("Traveller accounts created", `<div class="created-access"><div class="success-note"><b>✓ ${accessRows.length} traveller ${accessRows.length === 1 ? "account" : "accounts"} created</b><p>Give each traveller only their own username and password. Passwords are shown once on this screen.</p></div><div class="created-access-list">${accessRows.map((item) => `<article><i>${avatarSlot(item)}</i><div><h3>${esc(item.name)}</h3><span>USERNAME <b>${esc(item.travellerId)}</b></span><span>PASSWORD <b>${esc(item.pin)}</b></span><span>ASSIGNED TRIP <b>${esc(state.data.trip.tripId)}</b></span></div></article>`).join("")}</div><div class="form-actions"><button id="copyTravellerAccess" type="button">Copy all account details</button><button id="finishTravellerAccess" type="button">Done</button></div></div>`);
    $("#copyTravellerAccess").addEventListener("click", async () => { try { await navigator.clipboard.writeText(copyText); toast("Traveller access details copied"); } catch { toast("Could not copy automatically", true); } });
    $("#finishTravellerAccess").addEventListener("click", closeModal);
  }

  function showTravellerFeatureAccess(member) {
    if (!isAdmin()) return toast("Administrator access required", true);
    if (!member || !member.travellerId) return toast("Create personal Traveller ID access first", true);
    const assignment = assignmentForTraveller(member.travellerId) || {};
    const currentPhotoLimit = Math.max(0, Number(assignment.photoLimit || 0));
    const currentPhotoCount = state.data.photos.filter((photo) => String(photo.uploaderId || "").toUpperCase() === String(member.travellerId).toUpperCase()).length;
    const options = [
      ["viewItinerary", "canViewItinerary", "Itinerary", "Plans, dates, places and planning notes"],
      ["viewExperiences", "canViewExperiences", "Experience notes", "Travel journal entries and writer names"],
      ["viewPlaces", "canViewPlaces", "Places & Map", "Saved places and Google Maps tools"],
      ["viewExpenses", "canViewExpenses", "Expenses", "Budget, payments and traveller totals"],
      ["viewTravellers", "canViewTravellers", "Traveller list", "Names, roles and Traveller IDs in this trip"],
      ["printReports", "canPrint", "Print & Export", "Printable reports for other enabled sections"],
    ];
    const stickyLevels = ["view", "edit"];
    const currentStickyLevel = stickyLevels.includes(String(assignment.stickyNoteAccess || "").toLowerCase())
      ? String(assignment.stickyNoteAccess).toLowerCase()
      : (String(assignment.canWriteStickyNotes).toUpperCase() === "TRUE" ? "edit" : "view");
    showModal("Control traveller access", `<form class="modal-form" id="featureAccessForm"><div class="profile-id-banner"><span>TRAVELLER ID</span><b>${esc(member.travellerId)}</b><small>${esc(member.name)}</small></div><div class="security-note"><i>◆</i><p>Choose exactly what this personal Traveller ID can see or write in <b>${esc(state.data.trip.name)}</b>. Sticky writing is off until the Administrator enables it. Shared trip-PIN users remain view-only for sticky notes.</p></div><div class="feature-access-list">${options.map(([permission, field, label, help]) => `<label class="feature-access-option"><input type="checkbox" name="${permission}" ${assignmentAllows(assignment, field) ? "checked" : ""}><span><b>${label}</b><small>${help}</small></span><em>ALLOW</em></label>`).join("")}</div><div class="feature-access-actions"><button type="button" id="allowAllFeatures">Allow all</button><button type="button" id="hideAllFeatures">Hide all</button></div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save access</button></div></form>`);
    const form = $("#featureAccessForm");
    form.querySelector(".feature-access-actions").insertAdjacentHTML("beforebegin", `<label class="sticky-level-control"><span><b>Pinned sticky notes</b><small>Everyone sees the pinned board. Choose whether this traveller may edit it.</small></span><select name="stickyAccess">${stickyLevels.map((level) => `<option value="${level}" ${currentStickyLevel === level ? "selected" : ""}>${stickyAccessLabel(level)}</option>`).join("")}</select></label><label class="photo-limit-control"><span><b>Maximum photos this traveller may add</b><small>${currentPhotoCount} currently stored · enter 0 to disable photo addition for this traveller · maximum 50</small></span><input name="photoLimit" type="number" min="0" max="50" step="1" value="${currentPhotoLimit}" required></label><label class="photo-limit-control"><span><b>Photo quality for this traveller</b><small>Compressed ≈ 1 MB (fast, saves Drive space) · Original = full size up to 15 MB</small></span><select name="photoQuality">${[["choice", "Traveller chooses"], ["compressed", "Compressed only"], ["original", "Original only"]].map(([v, l]) => `<option value="${v}" ${(String(assignment.photoQuality || "choice").toLowerCase()) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`);
    $("#allowAllFeatures").addEventListener("click", () => $$('input[type="checkbox"]', form).forEach((input) => { input.checked = true; }));
    $("#hideAllFeatures").addEventListener("click", () => $$('input[type="checkbox"]', form).forEach((input) => { input.checked = false; }));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const permissions = Object.fromEntries(options.map(([permission]) => [permission, Boolean(form.elements[permission].checked)]));
      permissions.stickyAccess = form.elements.stickyAccess.value;
      const photoLimit = Number(form.elements.photoLimit.value);
      if (!Number.isInteger(photoLimit) || photoLimit < 0 || photoLimit > 50) return toast("Photo limit must be a whole number from 0 to 50", true);
      try {
        let saved = permissions;
        if (!state.demoMode) {
          const result = await api("setTravellerFeatureAccess", authPayload({ travellerId: member.travellerId, permissions }));
          saved = result.permissions || permissions;
          await api("setTravellerPhotoLimit", authPayload({ travellerId: member.travellerId, limit: photoLimit, quality: form.elements.photoQuality.value }));
        }
        assignment.photoLimit = photoLimit; assignment.photoQuality = form.elements.photoQuality.value;
        const fieldByPermission = Object.fromEntries(options.map(([permission, field]) => [permission, field]));
        Object.entries(saved).forEach(([permission, allowed]) => { if (fieldByPermission[permission]) assignment[fieldByPermission[permission]] = allowed ? "TRUE" : "FALSE"; });
        assignment.stickyNoteAccess = permissions.stickyAccess;
        assignment.canWriteStickyNotes = permissions.stickyAccess === "edit" ? "TRUE" : "FALSE";
        closeModal(); render(); toast(`Feature access updated for ${member.name}`);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function updateLocalPhotoUsage(change) {
    if (isAdmin()) return;
    const nextCount = Math.max(0, Number(state.permissions.photoUploadCount || 0) + change);
    const limit = Number(state.permissions.photoUploadLimit || 0);
    state.permissions.photoUploadCount = nextCount;
    state.permissions.photoUploadRemaining = Math.max(0, limit - nextCount);
    state.permissions.addPhotos = photoUploadsEnabled() && limit > nextCount;
  }

  /* Shrink big phone photos before upload (keeps them sharp: max 2048px, JPEG ~85%). */
  const photoOriginalMax = 15728640;
  function keepOriginalPref(value) { try { if (typeof value === "boolean") localStorage.setItem("mytrip_photo_original", value ? "1" : "0"); return localStorage.getItem("mytrip_photo_original") !== "0"; } catch { return true; } }
  function adminPhotoQuality() { if (isAdmin()) return "choice"; const q = String((state.permissions || {}).photoQuality || "choice").toLowerCase(); return q === "compressed" || q === "original" ? q : "choice"; }
  function originalToggle() { const aq = adminPhotoQuality(); if (aq !== "choice") return `<fieldset class="photo-quality-choice"><legend>Photo quality</legend><input type="hidden" name="photoQuality" value="${aq === "original" ? "original" : "smaller"}"><p class="pq-fixed">${aq === "original" ? "<b>Original quality</b> · set by the Administrator (up to 15 MB)" : "<b>Compressed</b> · about 1 MB · set by the Administrator"}</p></fieldset>`; if (proLocked("originalPhotos")) return `<fieldset class="photo-quality-choice"><legend>Photo quality</legend><label><input type="radio" name="photoQuality" value="smaller" checked><span><b>Smaller</b><small>About 1 MB · faster, saves space</small></span></label><button type="button" class="pro-inline" data-pro-feature="originalPhotos">🔒 Original quality is a Pro feature</button></fieldset>`; const o = keepOriginalPref(); return `<fieldset class="photo-quality-choice"><legend>Photo quality</legend><label><input type="radio" name="photoQuality" value="original" ${o ? "checked" : ""}><span><b>Original</b><small>Full size, up to 15 MB · best for printing</small></span></label><label><input type="radio" name="photoQuality" value="smaller" ${o ? "" : "checked"}><span><b>Smaller</b><small>About 1 MB · faster, saves space</small></span></label></fieldset>`; }
  const mtFileCache = new WeakMap();
  document.addEventListener("change", (e) => {
    const input = e.target;
    if (!input || input.type !== "file" || !input.files) return;
    Array.from(input.files).forEach((f) => { if (!mtFileCache.has(f)) mtFileCache.set(f, f.arrayBuffer().then((buf) => new File([buf], f.name || "photo.jpg", { type: f.type || guessImageType(f.name), lastModified: f.lastModified })).catch(() => null)); });
  }, true);
  function guessImageType(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" })[ext] || "image/jpeg";
  }
  async function snapshotFile(file) {
    if (!file) return file;
    const cached = mtFileCache.get(file);
    if (cached) { const f = await cached; if (f && f.size) return f; }
    try { const buf = await file.arrayBuffer(); if (buf.byteLength) return new File([buf], file.name || "photo.jpg", { type: file.type || guessImageType(file.name) }); } catch {}
    throw new Error("Phone could not open this photo. In Gallery/Google Photos tap ⋮ → Download (save to phone), then choose it again.");
  }
  async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  async function fileToDataUrl(file) { return "data:" + (file.type || "image/jpeg") + ";base64," + await fileToBase64(file); }
  async function preparePhoto(file, keepOriginal) {
    file = await snapshotFile(file);
    if (/image\/(heic|heif)/.test(file.type)) keepOriginal = false;
    keepOriginalPref(Boolean(keepOriginal));
    const okType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (keepOriginal && okType && file.size <= photoOriginalMax) return file;
    if (keepOriginal && okType && file.size > photoOriginalMax) toast("Photo is over 15 MB, so it was reduced slightly");
    return shrinkPhoto(file, keepOriginal ? 4096 : 2048, keepOriginal ? 14000000 : 2800000);
  }
  async function shrinkPhoto(file, maxSide = 2048, maxBytes = 2800000) {
    if (!file) return file;
    if (file.size <= 1500000 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { try { bitmap = await createImageBitmap(file); } catch { bitmap = null; } }
    let img = bitmap;
    if (!img) {
      img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("This photo type can't be opened. Choose a JPEG, PNG or WebP photo.")); i.src = URL.createObjectURL(file); });
    }
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    let side = maxSide, quality = 0.85, blob = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(w0, h0));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w0 * scale); canvas.height = Math.round(h0 * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) break;
      if (quality > 0.7) quality -= 0.08; else side = Math.round(side * 0.8);
    }
    if (bitmap && bitmap.close) bitmap.close();
    if (!blob) throw new Error("Could not prepare that photo. Try another one.");
    const name = String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  }

  function validateGalleryPhotoFile(file) {
    if (!file) throw new Error("Choose a photo from this device.");
    if (file.size > photoOriginalMax) throw new Error("This photo is too large. Try another one.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  }

  async function readPhotoFile(file) {
    const f = await snapshotFile(file);
    return { name: f.name, type: f.type || "image/jpeg", data: await fileToBase64(f) };
  }

  function showTripGalleryPhotoEditor(photo = null) {
    if (!isAdmin() && (!state.travellerId || (photo ? !mayReplacePhoto(photo) : state.permissions.addPhotos !== true))) return toast("Photo addition or replacement is not allowed for this account", true);
    const replacing = Boolean(photo);
    showModal(replacing ? "Replace trip photo" : "Add trip photo", `<form class="modal-form trip-gallery-photo-form" id="tripGalleryPhotoForm"><div class="security-note traveller-note"><i>▣</i><p>${replacing ? "The new image will replace this photo without using another allowance slot." : "Upload one selected trip photo. It will be stored in Google Drive."} JPEG, PNG or WebP · up to 15 MB.</p></div>${replacing ? `<div class="photo-preview"><img loading="lazy" decoding="async" src="${esc(photo.photoUrl)}" alt="Current photo"></div>` : ""}<label>${replacing ? "Replacement photo" : "Photo from this device"}<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp" required></label>${originalToggle()}<label>Caption <small>(optional)</small><input name="caption" maxlength="240" value="${esc(photo?.caption || "")}" placeholder="What should everyone remember about this photo?"></label><p class="form-help">Travellers can replace only their own photos. The Administrator can replace any photo.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${replacing ? "Replace photo" : "Save photo"}</button></div></form>`);
    const form = $("#tripGalleryPhotoForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      let file = form.elements.photoFile.files[0];
      const caption = String(form.elements.caption.value || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      try {
        if (!file) throw new Error("Choose a photo from this device.");
        submit.disabled = true; submit.textContent = "Preparing photo…";
        file = await preparePhoto(file, (adminPhotoQuality() === "original" || !proLocked("originalPhotos")) && (form.querySelector('input[name="photoQuality"]:checked, input[type="hidden"][name="photoQuality"]') || {}).value !== "smaller");
        submit.textContent = "Uploading…";
        validateGalleryPhotoFile(file);
        submit.disabled = true; submit.textContent = replacing ? "Replacing…" : "Uploading…";
        let savedPhoto;
        if (state.demoMode) {
          savedPhoto = { ...(photo || {}), id: photo?.id || uid(), photoUrl: URL.createObjectURL(file), caption, uploadedBy: photo?.uploadedBy || state.currentUser, uploaderId: photo?.uploaderId || state.travellerId, createdAt: photo?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        } else {
          const filePayload = await readPhotoFile(file);
          const result = await api(replacing ? "replaceTripMemoryPhoto" : "uploadTripMemoryPhoto", authPayload({ ...(replacing ? { photoId: photo.id } : {}), file: filePayload, caption }));
          savedPhoto = result.photo;
        }
        if (replacing) {
          const index = state.data.photos.findIndex((item) => String(item.id) === String(photo.id));
          if (index >= 0) state.data.photos[index] = savedPhoto;
        } else {
          state.data.photos.push(savedPhoto); updateLocalPhotoUsage(1);
        }
        closeModal(); render(); toast(replacing ? "Photo replaced in Google Drive" : "Photo saved to Google Drive");
      } catch (error) { submit.disabled = false; submit.textContent = replacing ? "Replace photo" : "Save photo"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showTripGalleryPhoto(photo) {
    if (!photo) return toast("Photo not found", true);
    showModal("Trip photo", `<div class="trip-photo-view"><img src="${esc(tripPhotoUrl(photo.photoUrl, 600))}" loading="lazy" decoding="async" alt="${esc(photo.caption || "Trip photo")}"><div><span>TRIP MEMORY</span><h3>${esc(photo.caption || "A trip memory")}</h3><p>Uploaded by <b>${esc(photo.uploadedBy || "Trip member")}</b>${photo.createdAt ? ` · ${displayDate(String(photo.createdAt).slice(0, 10))}` : ""}</p></div><div class="form-actions"><button type="button" data-cancel>Close</button>${mayManagePhoto(photo) ? `<button id="editViewedPhotoCaption" type="button">Edit caption</button>` : ""}${mayReplacePhoto(photo) ? `<button id="replaceViewedPhoto" type="button">Replace</button>` : ""}</div></div>`);
    $('[data-cancel]').addEventListener("click", closeModal);
    if ($("#replaceViewedPhoto")) $("#replaceViewedPhoto").addEventListener("click", () => showTripGalleryPhotoEditor(photo));
    if ($("#editViewedPhotoCaption")) $("#editViewedPhotoCaption").addEventListener("click", () => editPhotoCaption(photo));
  }

  function editPhotoCaption(photo) {
    if (!photo || !mayManagePhoto(photo)) return toast("You can edit captions only for photos you uploaded", true);
    showModal("Edit caption", `<form class="modal-form" id="editCaptionForm"><div class="photo-preview"><img loading="lazy" decoding="async" src="${esc(tripPhotoUrl(photo.photoUrl, 400))}" alt="Trip photo"></div><label>Caption <small>(optional)</small><input name="caption" maxlength="240" value="${esc(photo.caption || "")}" placeholder="What should everyone remember about this photo?"></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save caption</button></div></form>`);
    $('[data-cancel]').addEventListener("click", closeModal);
    $("#editCaptionForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const caption = String(event.currentTarget.elements.caption.value || "").trim();
      const button = event.submitter; if (button) { button.disabled = true; button.textContent = "Saving…"; }
      try {
        if (!state.demoMode) await api("updateRecord", authPayload({ sheet: "TripPhotos", id: photo.id, record: { caption } }));
        const stored = state.data.photos.find((item) => String(item.id) === String(photo.id));
        if (stored) stored.caption = caption;
        closeModal(); render(); updatePrintArea(); toast("Caption updated");
      } catch (error) { if (button) { button.disabled = false; button.textContent = "Save caption"; } toast(error.message, true); }
    });
  }

  function showDeleteTripGalleryPhoto(photo) {
    if (!photo || !mayManagePhoto(photo)) return toast("You can delete only photos that you uploaded", true);
    showModal("Delete trip photo", `<div class="delete-confirmation"><div class="danger-note"><b>Delete this photo?</b><p>The image will be moved to Google Drive trash and removed from the TripPhotos Google Sheet.</p></div><div class="photo-preview"><img src="${esc(tripPhotoUrl(photo.photoUrl, 600))}" loading="lazy" decoding="async" alt="${esc(photo.caption || "Trip photo")}"></div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button class="danger-button" id="confirmTripPhotoDelete" type="button">Delete photo</button></div></div>`);
    $("#confirmTripPhotoDelete").addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = "Deleting…";
      try {
        if (!state.demoMode) await api("deleteTripMemoryPhoto", authPayload({ photoId: photo.id }));
        state.data.photos = state.data.photos.filter((item) => String(item.id) !== String(photo.id)); updateLocalPhotoUsage(-1);
        closeModal(); render(); toast("Photo deleted from the trip gallery");
      } catch (error) { button.disabled = false; button.textContent = "Delete photo"; toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  async function toggleTripPhotoUploads() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const enabled = !photoUploadsEnabled();
    try {
      if (!state.demoMode) await api("setTripPhotoUploadEnabled", authPayload({ enabled }));
      state.data.trip.photoUploadsEnabled = enabled ? "TRUE" : "FALSE";
      state.permissions.photoUploadsEnabled = enabled;
      render(); toast(enabled ? "Traveller photo uploads enabled" : "Traveller photo uploads disabled for this trip");
    } catch (error) { toast(error.message, true); }
  }

  function showTripPhotoSettings() {
    if (!isAdmin()) return toast("Administrator access required to change the trip photo", true);
    const current = String(state.data.trip.photoUrl || "");
    showModal(current ? "Change trip photo" : "Add trip photo", `<form class="modal-form" id="tripPhotoForm"><div class="security-note traveller-note"><i>▣</i><p>Upload any JPEG, PNG or WebP photo up to 15 MB. It will be stored in your Google Drive by the MyTrip backend. You can alternatively paste a public HTTPS image link.</p></div><label>Upload from this device<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label>${originalToggle()}<div class="or"><span>or</span></div><label>Public photo link <small>(optional)</small><input name="photoUrl" type="url" value="${esc(current)}" placeholder="https://…"></label>${current ? `<div class="photo-preview"><img loading="lazy" decoding="async" src="${esc(tripPhotoUrl(current))}" alt="Current trip photo"></div>` : ""}<div class="form-actions">${current ? `<button type="button" id="removeTripPhoto" class="danger-link">Remove photo</button>` : `<button type="button" data-cancel>Cancel</button>`}<button type="submit">Save photo</button></div></form>`);
    const form = $("#tripPhotoForm");
    const savePhoto = async () => {
      try {
        let file = form.elements.photoFile.files[0];
        const photoUrl = String(form.elements.photoUrl.value || "").trim();
        if (!file && !photoUrl) return toast("Choose a photo file or enter a public photo link", true);
        if (file) { try { toast("Preparing photo…"); file = await preparePhoto(file, (form.querySelector('input[name="photoQuality"]:checked, input[type="hidden"][name="photoQuality"]') || {}).value !== "smaller"); } catch (error) { return toast(error.message, true); } }
        if (file && file.size > photoOriginalMax) return toast("This photo is too large. Try another one.", true);
        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast("Choose a JPEG, PNG or WebP photo", true);
        if (photoUrl && !/^https:\/\//i.test(photoUrl)) return toast("Trip photo link must start with https://", true);
        let savedUrl = photoUrl;
        if (file) {
          if (state.demoMode) savedUrl = URL.createObjectURL(file);
          else {
            const dataUrl = await fileToDataUrl(file);
            const thumb = await makeCardThumb(file).catch(() => "");
            const result = await api("uploadTripPhoto", authPayload({ file: { name: file.name, type: file.type, data: dataUrl.split(",")[1] || "", thumb } }));
            if (thumb) setTripThumb(state.data.trip.tripId, thumb);
            savedUrl = result.photoUrl;
          }
        } else if (!state.demoMode) await api("updateTrip", authPayload({ trip: { photoUrl } }));
        state.data.trip.photoUrl = savedUrl; closeModal(); render(); updatePrintArea(); toast("Trip photo updated");
      } catch (error) { toast(error.message, true); }
    };
    form.addEventListener("submit", (event) => { event.preventDefault(); savePhoto(); });
    if ($("#removeTripPhoto")) $("#removeTripPhoto").addEventListener("click", async () => {
      try {
        if (!state.demoMode) await api("removeTripPhoto", authPayload());
        state.data.trip.photoUrl = ""; closeModal(); render(); updatePrintArea(); toast("Trip photo removed");
      } catch (error) { toast(error.message, true); }
    });
    if ($('[data-cancel]')) $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showResetCurrentTravellerPin(member) {
    if (!isAdmin()) return toast("Administrator access required", true);
    if (!member || !member.travellerId) return toast("This traveller does not have personal access yet", true);
    showModal("Edit traveller password", `<form class="modal-form" id="currentTravellerPinForm"><div class="profile-id-banner"><span>USERNAME</span><b>${esc(member.travellerId)}</b><small>${esc(member.name)}</small></div><div class="security-note"><i>⚿</i><p>Only the Administrator can change this personal password. The traveller’s old password will stop working immediately.</p></div><label>New personal password<input name="newPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label><label>Confirm new password<input name="confirmPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" required></label><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save new password</button></div></form>`);
    $("#currentTravellerPinForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.newPin !== values.confirmPin) return toast("The two password entries do not match", true);
      try {
        if (!state.demoMode) await api("resetTravellerPin", { username: state.accountUsername, password: state.pin, pin: state.pin, travellerId: member.travellerId, newPin: values.newPin });
        closeModal(); toast(`Personal password updated for ${member.name}`);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showAddModal(type) {
    if (!canAdd(type)) return toast("Global Administrator access required for this action", true);
    if (type === "travellers") return showAddTravellersToCurrentTrip();
    if (type === "plan") showModal("Add to itinerary", `<form class="modal-form" data-form="plan"><label>Plan title<input name="title" placeholder="e.g. Sunset cruise" required></label><div class="form-row"><label>Date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(state.data.trip.startDate)}" required></label><label>Time<input name="time" type="time" value="10:00" required></label></div><label>Place<input name="place" placeholder="Place or address" required></label><label>Planning note<textarea name="notes" rows="3" placeholder="Tickets, reminders, meeting point or other preparation"></textarea></label><details class="plan-extra-fields"><summary>Optional booking detail</summary><div class="form-row"><label>Category<select name="category"><option value="">—</option>${planCategories.map((value) => `<option>${value}</option>`).join("")}</select></label><label>Status<select name="status"><option value="">—</option>${planStatuses.map((value) => `<option${value === "To book" ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="form-row"><label>Booking reference<input name="bookingRef" maxlength="80" placeholder="PNR / confirmation"></label><label>Planned cost (₹)<input name="cost" type="number" min="0" step="1" placeholder="0"></label></div><label>Preview photo link <small>(optional — paste an image link so you can visualise this before the trip)</small><input name="photoUrl" type="url" maxlength="1000" placeholder="e.g. a Google Images link, or a Google Drive share link, for Kanyakumari sunset"></label></details>${actions}</form>`);
    if (type === "experience") {
      const writer = state.currentUser === "Traveller" ? "" : state.currentUser;
      const writerNames = [...new Set(visibleTripMembers().map((member) => member.name).filter(Boolean))];
      showModal("Add experience note", `<form class="modal-form" data-form="experience"><div class="security-note traveller-note"><i>✍</i><p>This note will appear below the itinerary and in the printed trip book with the writer’s name.</p></div><div class="form-row"><label>Experience date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(state.data.trip.startDate)}" required></label><label>Place <small>(optional)</small><input name="place" maxlength="180" placeholder="e.g. Padmanabhaswamy Temple"></label></div><label>Experience note${noteToolbarHtml()}<textarea name="note" rows="5" maxlength="4000" placeholder="What happened? What did you enjoy, learn or want to remember?" required></textarea></label><div class="form-row"><label>Written by<input name="writer" list="experienceWriterNames" maxlength="80" value="${esc(writer)}" placeholder="Enter the writer’s name" required><datalist id="experienceWriterNames">${writerNames.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist></label><label>Who can see this<select name="visibility"><option value="Everyone" selected>Everyone on the trip</option><option value="Only me">Only me</option></select></label></div><label>What kind of note is this?<select name="noteType"><option value="Memory" selected>✍ Memory — something worth remembering</option><option value="Learning">💡 Learning — a shortcoming or tip for next time</option></select></label>${experiencePhotoFieldHtml("")}${actions}</form>`);
    }
    if (type === "place") showModal("Save a place", `<form class="modal-form" data-form="place"><label>Place name<input name="name" placeholder="e.g. Dudhsagar Falls" required></label><label>Area or address<input name="area" placeholder="Goa" required></label><div class="form-row"><label>Category<select name="category"><option>Beach</option><option>Food</option><option>Culture</option><option>Nature</option><option>Shopping</option><option>Stay</option></select></label><label>Plan for<select name="plannedDay"><option>Unplanned</option><option>Day 1</option><option>Day 2</option><option>Day 3</option><option>Day 4</option><option>Day 5</option></select></label></div>${actions}</form>`);
    if (type === "expense" && mtIsPhone()) { showModal("Add expense", mtExpenseSheet()); }
    else if (type === "expense") { const payers = visibleTripMembers(); showModal("Add an expense", `<form class="modal-form" data-form="expense"><label>What was it for?<input name="label" placeholder="e.g. Dinner at Fisherman’s Wharf" required></label><div class="form-row"><label>Amount (₹)<input name="amount" type="number" min="1" step="0.01" required></label><label>Date<input name="date" type="date" value="${esc(mtDefaultDate())}" required></label></div><div class="form-row"><label>Category<select name="category"><option>Food</option><option>Stay</option><option>Travel</option><option>Local travel</option><option>Activities</option><option>Shopping</option><option>Other</option></select></label><label>Paid by<select name="paidBy">${(payers.length ? payers : [{ name: state.currentUser }]).map((member) => `<option>${esc(member.name)}</option>`).join("")}</select></label></div>${actions}</form>`); }
    if (type === "traveller") showModal("Add a traveller", `<form class="modal-form" data-form="member"><label>Name<input name="name" placeholder="Traveller’s name" required></label><label>Access role<select name="role"><option>Editor</option><option>Viewer</option></select></label>${actions}</form>`);
    const form = $('[data-form]'); if (form) form.addEventListener("submit", saveForm); const cancel = $('[data-cancel]'); if (cancel) cancel.addEventListener("click", closeModal);
  }

  async function saveForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.saving === "1") return;
    form.dataset.saving = "1"; form.querySelectorAll("button[type=submit]").forEach((b) => { b.disabled = true; });
    try { return await saveFormInner(event, form); }
    finally { if (form.isConnected) { form.dataset.saving = ""; form.querySelectorAll("button[type=submit]").forEach((b) => { b.disabled = false; }); } }
  }
  async function saveFormInner(event, form) {
    const type = form.dataset.form, values = Object.fromEntries(new FormData(form).entries());
    if (!canAdd(type)) return toast("Global Administrator access required for this action", true);
    const record = { id: uid(), ...values }; if (type === "expense") { record.amount = Number(record.amount); if (!String(record.label || "").trim()) record.label = record.category || "Expense"; }
    const again = type === "expense" && event.submitter && event.submitter.hasAttribute("data-again");
    if (type === "plan") { record.cost = Number(record.cost) > 0 ? Number(record.cost) : ""; record.sortOrder = nextPlanSortOrder(record.date); }
    if (type === "settlement") { record.amount = Number(record.amount); record.settledBy = state.currentUser; record.createdAt = new Date().toISOString(); state.mtSettleOpen = true; }
    record.createdBy = type === "experience" ? values.writer : state.currentUser;
    const collection = { plan: "itinerary", place: "places", expense: "expenses", experience: "experiences", member: "members", settlement: "settlements" }[type];
    try {
      if (!state.demoMode) await api(`add${type[0].toUpperCase()}${type.slice(1)}`, authPayload({ record }));
      state.data[collection].push(record); closeModal(); render(); hydrateShell(); updatePrintArea(); if (type === "expense") { try { localStorage.setItem("mytrip_last_expense", JSON.stringify({ paidBy: record.paidBy, category: record.category })); } catch {} if (again) setTimeout(() => showAddModal("expense"), 60); }
      toast(type === "experience" ? `Experience note saved · Written by ${values.writer}` : type === "settlement" ? "✓ Settlement saved and recorded in your Google Sheet" : `${type === "member" ? "Traveller" : type[0].toUpperCase() + type.slice(1)} saved for everyone`);
    } catch (error) { toast(error.message, true); }
  }

  function inviteMessage(link) {
    return `You're invited to view and manage our trip "${(state.data.trip || {}).name || "our trip"}" on MyTrip.\n\nOpen this link: ${link}\nTrip code: ${state.data.trip.tripId}\n\nIf you don't have a login yet, use "Join by link" on that page — the Administrator will approve you.`;
  }
  function showInvite() {
    if (!isAdmin()) return toast("Global Administrator access required to invite travellers", true);
    const inviteParams = new URLSearchParams({ trip: state.data.trip.tripId });
    if (!validApiUrl(config.API_URL) && apiUrlReady()) inviteParams.set("api", apiUrl);
    const link = `${location.origin}${location.pathname}?${inviteParams.toString()}`;
    showModal("Invite your travel group", `<div class="join-admin" id="joinAdmin"><span class="kicker">JOIN BY LINK · NO PASSWORD TO SHARE</span><p class="form-help">Loading…</p></div><div class="invite-box"><p>Share this link and only this trip’s Traveller PIN. Never share the global Administrator password/PIN.</p><div class="copy-field"><input id="inviteLink" value="${esc(link)}" readonly><button id="copyInvite">Copy</button></div><div class="pin-box"><span>TRIP CODE<b>${esc(state.data.trip.tripId)}</b></span><span>TRAVELLER PIN<b>••••</b></span></div><small>The Traveller PIN is different for each trip and is not displayed after creation.</small></div><div class="invite-share"><div class="invite-share-head"><span class="kicker">SEND TO YOUR TRAVELLERS</span><button type="button" id="copyInviteMessage" class="ghost-button">📋 Copy message</button></div><div id="inviteShareList" class="invite-share-list"><p class="form-help">Loading travellers…</p></div></div>`);
    $("#copyInvite").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); } catch {} toast("Invite link copied"); });
    $("#copyInviteMessage").addEventListener("click", async () => { try { await navigator.clipboard.writeText(inviteMessage(link)); } catch {} toast("Message copied — paste it in a group chat or email"); });
    loadJoinAdmin();
    loadInviteShareList(link);
  }
  async function loadInviteShareList(link) {
    const slot = $("#inviteShareList");
    if (!slot) return;
    try {
      const travellers = state.demoMode ? demoTravellerAccounts : (await api("listTravellerAccounts", { ...adminAuth() })).travellers || [];
      const tripId = state.data.trip.tripId;
      const here = travellers.filter((t) => Array.isArray(t.tripIds) && t.tripIds.includes(tripId));
      if (!here.length) { slot.innerHTML = `<p class="form-help">No traveller accounts are assigned to this trip yet.</p>`; return; }
      const message = inviteMessage(link);
      slot.innerHTML = here.map((t) => {
        const mail = t.email ? `<a href="mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(`Join "${(state.data.trip || {}).name || "our trip"}" on MyTrip`)}&body=${encodeURIComponent(message)}">✉ Email</a>` : `<span class="invite-share-muted">No email on file</span>`;
        const wa = t.phone ? `<a target="_blank" rel="noopener" href="https://wa.me/${String(t.phone).replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}">✆ WhatsApp</a>` : `<span class="invite-share-muted">No phone on file</span>`;
        return `<div class="invite-share-row"><b>${esc(t.name)}</b><span class="invite-share-actions">${mail}${wa}</span></div>`;
      }).join("");
    } catch (error) { slot.innerHTML = `<p class="form-help">Couldn’t load travellers — ${esc(error.message)}</p>`; }
  }

  function showSecurity() {
    if (!isAdmin()) return toast("Global Administrator access required for Security settings", true);
    showModal("Account & security", `<form class="modal-form" id="securityForm"><div class="security-note"><i>◆</i><p>The Administrator username and password open every trip. The shared trip password below changes only for <b>${esc(state.data.trip.name)}</b>.</p></div><label>Administrator username<input name="adminUsername" minlength="3" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value="${esc(state.accountUsername)}" autocomplete="username" required></label><label>New Administrator password<input name="adminPin" type="password" minlength="6" maxlength="64" autocomplete="new-password" placeholder="6–64 characters" required></label><label>New shared password for this trip<input name="travellerPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4–64 characters" required></label>${actions}</form>`);
    $("#securityForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.adminPin === values.travellerPin) return toast("The Administrator password and shared trip password must be different", true);
      try {
        if (!state.demoMode) await api("changePins", { tripId: state.data.trip.tripId, username: state.accountUsername, password: state.pin, pin: state.pin, adminUsername: values.adminUsername, adminPin: values.adminPin, travellerPin: values.travellerPin });
        state.accountUsername = String(values.adminUsername).trim().toLowerCase(); state.pin = String(values.adminPin); closeModal(); hydrateShell(); toast("Administrator username/password and this trip’s shared password were updated");
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  function showEditTrip() {
    if (!isAdmin()) return toast("Global Administrator access required to edit trip settings", true);
    const trip = state.data.trip;
    showModal("Edit trip settings", `<form class="modal-form" id="editTripForm"><label>Trip name<input name="name" value="${esc(trip.name)}" required></label><label>Destination<input name="destination" value="${esc(trip.destination)}" required></label><div class="form-row"><label>Start date<input name="startDate" type="date" value="${esc(trip.startDate)}" required></label><label>End date<input name="endDate" type="date" value="${esc(trip.endDate)}" required></label></div><label>Total budget (₹)<input name="budget" type="number" min="0" step="0.01" value="${esc(trip.budget)}" required></label>${actions}</form>`);
    $("#editTripForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (new Date(values.endDate) < new Date(values.startDate)) return toast("End date cannot be before the start date", true);
      const update = { ...values, budget: Number(values.budget) };
      try {
        if (!state.demoMode) await api("updateTrip", authPayload({ trip: update }));
        state.data.trip = { ...trip, ...update }; closeModal(); hydrateShell(); render(); updatePrintArea(); toast("Trip settings updated by administrator");
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  async function toggleCurrentTripStatus() {
    if (!isAdmin()) return toast("Administrator access required", true);
    const enabled = !(state.data.trip.enabled !== false && String(state.data.trip.enabled).toUpperCase() !== "FALSE");
    try {
      if (!state.demoMode) await api("setTripEnabled", authPayload({ enabled }));
      state.data.trip.enabled = enabled; hydrateShell(); render(); toast(`Trip ${enabled ? "enabled" : "disabled"}`);
    } catch (error) { toast(error.message, true); }
  }

  function showEditRecord(sheet, id) { const r = showEditRecordInner(sheet, id); if (sheet === "Expenses") injectReceiptBlock(id); return r; }
  function showEditRecordInner(sheet, id) {
    if (!canEditRecords(sheet)) return toast("The Administrator has hidden this feature for your Traveller ID", true);
    const collection = { Itinerary: "itinerary", ExperienceNotes: "experiences", Places: "places", Expenses: "expenses" }[sheet];
    const record = collection && state.data[collection].find((item) => String(item.id) === String(id));
    if (!record) return toast("Record not found", true);
    let fields = "";
    if (sheet === "Itinerary") fields = `<label>Plan title<input name="title" value="${esc(record.title)}" required></label><div class="form-row"><label>Date<input name="date" type="date" value="${esc(record.date)}" required></label><label>Time<input name="time" type="time" value="${esc(record.time)}"></label></div><label>Place<input name="place" value="${esc(record.place || "")}"></label><label>Planning note<textarea name="notes" rows="3">${esc(record.notes || "")}</textarea></label><details class="plan-extra-fields"${record.photoUrl ? " open" : ""}><summary>Optional booking detail</summary><div class="form-row"><label>Category<select name="category"><option value="">—</option>${planCategories.map((value) => `<option${record.category === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Status<select name="status"><option value="">—</option>${planStatuses.map((value) => `<option${record.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="form-row"><label>Booking reference<input name="bookingRef" maxlength="80" value="${esc(record.bookingRef || "")}"></label><label>Planned cost (₹)<input name="cost" type="number" min="0" step="1" value="${esc(record.cost || "")}"></label></div><label>Preview photo link <small>(optional — paste an image link so you can visualise this before the trip)</small><input name="photoUrl" type="url" maxlength="1000" value="${esc(record.photoUrl || "")}" placeholder="e.g. a Google Images link for Kanyakumari sunset"></label></details>`;
    if (sheet === "ExperienceNotes") fields = `<div class="form-row"><label>Experience date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(record.date)}" required></label><label>Place <small>(optional)</small><input name="place" maxlength="180" value="${esc(record.place || "")}"></label></div><label>Experience note${noteToolbarHtml()}<textarea name="note" rows="5" maxlength="4000" required>${esc(record.note || "")}</textarea></label><div class="form-row"><label>Written by<input name="writer" maxlength="80" value="${esc(record.writer || "")}" required></label><label>Who can see this<select name="visibility"><option value="Everyone"${record.visibility === "Only me" ? "" : " selected"}>Everyone on the trip</option><option value="Only me"${record.visibility === "Only me" ? " selected" : ""}>Only me</option></select></label></div><label>What kind of note is this?<select name="noteType"><option value="Memory"${record.noteType === "Learning" ? "" : " selected"}>✍ Memory — something worth remembering</option><option value="Learning"${record.noteType === "Learning" ? " selected" : ""}>💡 Learning — a shortcoming or tip for next time</option></select></label>${experiencePhotoFieldHtml(record.photoUrl || "")}`;
    if (sheet === "Places") fields = `<label>Place name<input name="name" value="${esc(record.name)}" required></label><label>Area or address<input name="area" value="${esc(record.area || "")}"></label><div class="form-row"><label>Category<input name="category" value="${esc(record.category || "")}"></label><label>Planned day<input name="plannedDay" value="${esc(record.plannedDay || "Unplanned")}"></label></div><label>Notes<textarea name="notes" rows="3">${esc(record.notes || "")}</textarea></label>`;
    if (sheet === "Expenses") fields = `<label>Expense description<input name="label" value="${esc(record.label)}" required></label><div class="form-row"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" value="${esc(record.amount)}" required></label><label>Date<input name="date" type="date" value="${esc(record.date)}" required></label></div><div class="form-row"><label>Category<input name="category" value="${esc(record.category || "")}"></label><label>Paid by<input name="paidBy" value="${esc(record.paidBy || "")}" required></label></div><label>Notes<textarea name="notes" rows="3">${esc(record.notes || "")}</textarea></label>`;
    showModal(sheet === "ExperienceNotes" ? "Edit experience note" : `Edit ${sheet === "Itinerary" ? "plan" : sheet.slice(0, -1).toLowerCase()}`, `<form class="modal-form" id="editRecordForm">${fields}<div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save changes</button></div></form>`);
    $("#editRecordForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const update = Object.fromEntries(new FormData(event.currentTarget).entries()); if (sheet === "Expenses") update.amount = Number(update.amount);
      try {
        if (!state.demoMode) await api("updateRecord", authPayload({ sheet, id, record: update }));
        Object.assign(record, update); closeModal(); render(); updatePrintArea(); toast("Changes saved for everyone");
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  async function deleteItem(sheet, id) {
    if (!isAdmin()) return toast("Global Administrator access required to delete records", true);
    const collection = { Itinerary: "itinerary", ExperienceNotes: "experiences", Places: "places", Expenses: "expenses", Members: "members" }[sheet];
    if (sheet !== "Members") { if (sheet === "Expenses" && String(state.expenseRowEditId) === String(id)) state.expenseRowEditId = ""; return undoableDelete(sheet, collection, id, { Itinerary: "Itinerary row deleted", ExperienceNotes: "Note deleted", Places: "Place deleted", Expenses: "Expense deleted" }[sheet] || "Deleted"); }
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet, id }));
      state.data[collection] = state.data[collection].filter((item) => String(item.id) !== String(id));
      if (sheet === "Expenses" && String(state.expenseRowEditId) === String(id)) state.expenseRowEditId = "";
      hydrateShell(); render(); updatePrintArea(); toast("Record deleted by administrator");
    } catch (error) { toast(error.message, true); }
  }

  function buildPrintArea() {
    if (!state.data) return; const budget = Number(state.data.trip.budget || 0), members = visibleTripMembers();
    const printedExperiences = [...state.data.experiences].sort((a,b)=>`${a.date}${a.createdAt || ""}`.localeCompare(`${b.date}${b.createdAt || ""}`)).map((item) => `<article><time>${displayDate(item.date, { weekday:"short", day:"2-digit", month:"short" })}</time><div><h3>${esc(item.place || "Trip experience")}</h3><p>${formatNote(item.note)}</p><strong>Written by ${esc(item.writer || "Trip member")}</strong></div></article>`).join("");
    const printedTravellerTotals = expenseTotalsByTraveller().map((row) => `<tr><td>${esc(row.name)}</td><td>${row.count}</td><td>${money.format(row.total)}</td></tr>`).join("");
    const photo = tripPhotoUrl(state.data.trip.photoUrl);
    const memberText = canViewTravellers() ? ` · ${members.length} trip members` : "";
    const printPlans = sortedPlans().filter((item) => !state.printDay || item.date === state.printDay);
    const printDays = [...new Set(printPlans.map((item) => item.date))];
    const printWidths = planColumnWidths();
    const printTotal = printWidths.reduce((sum, width) => sum + width, 0);
    const printCols = printWidths.map((width) => `<col style="width:${Math.round(width / printTotal * 100)}%">`).join("") + '<col style="width:24px">';
    const printedPlans = printDays.map((date) => {
      const dayRows = printPlans.filter((item) => item.date === date);
      const dayCost = dayRows.reduce((sum, item) => sum + planCost(item), 0);
      const header = "";
      const body = dayRows.map((item, rowIndex) => {
        const tags = [item.category, item.status].filter(Boolean).join(" · ");
        const paidExpense = expenseForPlan(item);
        const extra = [item.bookingRef ? `Ref ${item.bookingRef}` : "", paidExpense ? `${money.format(Number(paidExpense.amount || 0))} paid by ${paidExpense.paidBy || "—"}` : (planCost(item) ? `Est ${money.format(planCost(item))}` : "")].filter(Boolean).join(" · ");
        return `<tr class="${rowIndex === 0 ? "print-day-start" : ""}"><td>${rowIndex === 0 ? `<b>${displayDate(item.date, { weekday: "short", day: "2-digit", month: "short" })}</b>${dayCost ? `<span class="print-tag">${money.format(dayCost)}</span>` : ""}` : ""}</td><td>${item.time ? displayTime(item.time) : "Any time"}</td><td><b>${esc(item.title)}</b>${tags ? `<span class="print-tag">${esc(tags)}</span>` : ""}</td><td>${esc(item.place || "—")}${extra ? `<span class="print-tag">${esc(extra)}</span>` : ""}</td><td>${esc(item.notes || "—")}</td><td class="print-tick">${String(item.status || "") === "Done" ? "☑" : ""}</td></tr>`;
      }).join("");
      const lines = "";
      return header + body + lines;
    }).join("");
    const planTitle = state.printDay ? `Itinerary · ${displayDate(state.printDay, { weekday: "long", day: "numeric", month: "long" })}` : "Itinerary";
    const planSection = canViewItinerary() ? `<section class="print-plan"><h2>${esc(planTitle)}</h2><table class="print-plan-table"><colgroup>${printCols}</colgroup><thead><tr><th>Day</th><th>Time</th><th>Itinerary</th><th>Place</th><th>Remark</th><th class="print-tick">✓</th></tr></thead><tbody>${printedPlans || `<tr><td colspan="6">No itinerary items were added.</td></tr>`}</tbody></table></section>` : "";
    const experienceSection = canViewExperiences() ? `<section class="print-experiences"><h2>Trip experience notes</h2>${printedExperiences || `<p>No experience notes were added.</p>`}</section>` : "";
    const xpWho = state.printPerson || "";
    const xpSorted = [...state.data.expenses].sort((x, y) => `${x.date || ""}`.localeCompare(`${y.date || ""}`));
    const xpTable = (rows, showPayer = true) => `<table class="print-expense-table"><thead><tr><th>Date</th><th>Expense</th><th>Category</th>${showPayer ? "<th>Paid by</th>" : ""}<th>Amount</th></tr></thead><tbody>${rows.map((expense) => `<tr><td>${displayDate(expense.date)}</td><td>${esc(expense.label || expense.category || "")}</td><td>${esc(expense.category || "")}</td>${showPayer ? `<td>${esc(expense.paidBy || "")}</td>` : ""}<td>${money.format(expense.amount)}</td></tr>`).join("") || `<tr><td colspan="${showPayer ? 5 : 4}">No expenses recorded.</td></tr>`}</tbody><tfoot><tr><td colspan="${showPayer ? 4 : 3}"><b>Total</b></td><td><b>${money.format(rows.reduce((s, e) => s + Number(e.amount || 0), 0))}</b></td></tr></tfoot></table>`;
    const xpPeople = () => [...new Set([...visibleTripMembers().map((m) => m.name), ...xpSorted.map((e) => e.paidBy || "Not specified")])].filter((n) => xpSorted.some((e) => (e.paidBy || "Not specified") === n));
    const xpDetail = () => xpWho === "__each" ? xpPeople().map((n) => `<div class="print-person-block"><h3>${esc(n)} · paid ${money.format(xpSorted.filter((e) => (e.paidBy || "Not specified") === n).reduce((s, e) => s + Number(e.amount || 0), 0))}</h3>${xpTable(xpSorted.filter((e) => (e.paidBy || "Not specified") === n), false)}</div>`).join("") : xpWho ? `<h3>Expenses paid by ${esc(xpWho)}</h3>${xpTable(xpSorted.filter((e) => (e.paidBy || "Not specified") === xpWho), false)}` : `<h3>Detailed expense statement</h3>${xpTable(xpSorted)}`;
    const expenseSection = canViewExpenses() ? `<section class="print-expenses${xpWho ? " print-xp-person" : ""}"><h2>${xpWho && xpWho !== "__each" ? `Expense statement · ${esc(xpWho)}` : xpWho === "__each" ? "Expense statement · person-wise" : "Expense statement"}</h2><div class="print-totals"><span><small>Budget</small><b>${money.format(budget)}</b></span><span><small>Spent</small><b>${money.format(spent())}</b></span><span><small>Balance</small><b>${money.format(remaining())}</b></span></div><div class="print-traveller-totals"><h3>Traveller-wise expense totals</h3><table class="print-expense-table"><thead><tr><th>Traveller</th><th>Payments</th><th>Total paid</th></tr></thead><tbody>${printedTravellerTotals || `<tr><td colspan="3">No traveller expenses recorded.</td></tr>`}</tbody></table></div>${xpDetail()}</section>` : "";
    $("#printArea").innerHTML = `${photo ? `<img loading="lazy" decoding="async" class="print-cover-photo" src="${esc(photo)}" alt="Trip cover photo">` : ""}<header><div><span class="kicker">MYTRIP · TRIP BOOK · FRONTEND v${frontendVersion}</span><h1>${esc(state.data.trip.name)}</h1><p>${displayDate(state.data.trip.startDate)}–${displayDate(state.data.trip.endDate)}${memberText}</p></div><b>${esc(state.data.trip.tripId)}</b></header>${planSection}${experienceSection}${expenseSection}`;
    printAreaDirty = false;
  }

  function updatePrintArea(force = false) { printAreaDirty = true; if (force) buildPrintArea(); }

  function printReport(target, day = "") { if (!canPrintReports()) return toast("Print & Export is hidden for your Traveller ID", true); if ((target === "itinerary" || target === "plan") && !canViewItinerary()) return toast("Itinerary access is hidden for your Traveller ID", true); if (target === "expenses" && !canViewExpenses()) return toast("Expense access is hidden for your Traveller ID", true); state.printDay = day; document.body.dataset.print = target; buildPrintArea(); const clear = () => { delete document.body.dataset.print; state.printDay = ""; printAreaDirty = true; removeEventListener("afterprint", clear); }; addEventListener("afterprint", clear); print(); setTimeout(clear, 1200); }

  async function refreshTrip() {
    if (state.demoMode) return toast("Demo data is already up to date");
    try { const data = await api("getTrip", authPayload()); state.data = normalize(data); state.accessRole = data.accessRole; state.permissions = data.permissions || {}; cacheTripBundle(data, { name: state.currentUser, role: state.accessRole, travellerId: state.travellerId, loginMode: state.loginMode }); loadStickyNotes(); hydrateShell(); render(); renderStickyNotes(); updatePrintArea(); migrateCompletedStickyNotes(); toast("Latest trip data loaded"); } catch (error) { toast(error.message, true); }
  }

  function showCreateTrip() {
    showModal("Create a new trip", `<form class="modal-form" id="createTripForm"><label>Trip name<input name="name" placeholder="e.g. Kerala family holiday" required></label><label>Destination<input name="destination" placeholder="e.g. Kochi, Kerala" required></label><div class="form-row"><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date" required></label></div><div class="form-row"><label>Total budget (₹)<input name="budget" type="number" min="0" value="50000" required></label><label>Your name<input name="createdBy" required></label></div><label>Administrator username<input name="adminUsername" minlength="3" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value="${esc(state.accountUsername || "administrator")}" autocomplete="username" required></label><label>Administrator password<input name="adminPin" type="password" minlength="6" maxlength="64" autocomplete="current-password" placeholder="Same Administrator password for every trip" required></label><label>Shared password for this trip<input name="travellerPin" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="Optional shared one-trip access" required></label><p class="form-help">The Administrator account opens every trip. Named travellers use their Traveller ID as username and their own personal password.</p>${actions}</form>`);
    $("#createTripForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.adminPin === values.travellerPin) return toast("The Administrator password and shared trip password must be different", true);
      try {
        await ensureCurrentBackend();
        const result = await api("createTrip", { username: values.adminUsername, trip: { ...values, budget: Number(values.budget) }, adminUsername: values.adminUsername, adminPin: values.adminPin, travellerPin: values.travellerPin });
        state.accountUsername = String(values.adminUsername).trim().toLowerCase(); closeModal(); await openTrip(result, values.adminPin, false, values.createdBy, "administrator"); toast(`Trip created. Code: ${result.trip.tripId}`);
      } catch (error) { toast(error.message, true); }
    });
    $('[data-cancel]').addEventListener("click", closeModal);
  }

  async function loginAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const username = String(values.username || "").trim();
    const password = String(values.password || "");
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Signing in…";
    try {
      const [result] = await Promise.all([api("login", { username, password }), ensureCurrentBackend()]);
      if (Boolean(values.rememberLogin)) saveAccountLogin(username); else clearSavedAccountLogin();
      state.accountUsername = String(result.account && result.account.username || username);
      state.pin = password; state.authenticated = true; state.demoMode = false; state.accessRole = result.accessRole;
      if (result.accessRole === "administrator") {
        state.travellerId = ""; state.currentUser = "Administrator";
        renderAllTrips(result.trips || [], password, false);
      } else {
        const traveller = result.traveller || { travellerId: state.accountUsername, name: "Traveller" };
        state.travellerId = traveller.travellerId; state.currentUser = traveller.name || "Traveller";
        renderMyTrips(result.trips || [], password, traveller, false);
      }
      toast("Signed in successfully");
    } catch (error) {
      state.pin = ""; state.accountUsername = ""; state.authenticated = false;
      toast(error.message, true);
    } finally {
      submit.disabled = false; submit.textContent = "Sign in";
    }
  }

  $("#joinForm").addEventListener("submit", (event) => { if (!apiUrlReady()) { event.preventDefault(); event.stopImmediatePropagation(); showBackendSetup(() => $("#joinForm").requestSubmit()); } }, true);
  $("#joinForm").addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { state.accountUsername = ""; const [trip] = await Promise.all([api("getTrip", { tripId: String(data.get("tripId")).trim().toUpperCase(), pin: String(data.get("pin")) }), ensureCurrentBackend()]); await openTrip(trip, String(data.get("pin")), false, "Shared traveller", "traveller", "", "shared"); } catch (error) { toast(error.message, true); } });
  $("#accountLoginForm").addEventListener("submit", loginAccount);
  $("#toggleLoginPassword").addEventListener("click", () => setLoginPasswordVisible($("#loginPassword").type === "password"));
  $("#rememberLogin").addEventListener("change", (event) => { if (!event.currentTarget.checked) clearSavedAccountLogin(); });
  $("#previewDemoButton").addEventListener("click", () => { state.accountUsername = "administrator"; state.pin = "654321"; state.demoMode = true; state.authenticated = true; state.accessRole = "administrator"; renderAllTrips(demoTrips, state.pin, true); });
  $("#showCreateButton").addEventListener("click", async () => {
    if (!apiUrlReady()) return showBackendSetup(() => $("#showCreateButton").click());
    try { await ensureCurrentBackend(); showCreateTrip(); }
    catch (error) { toast(error.message, true); showBackendSetup(() => $("#showCreateButton").click()); }
  });
  $("#closeModal").addEventListener("click", closeModal); $("#modal").addEventListener("mousedown", (event) => { if (event.target === event.currentTarget) closeModal(); });

  const mtIcons = { checklist: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8.5 12.2l2.4 2.4 4.6-5"></path>', help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2V14"></path><path d="M12 17.2v.1"></path>', feedback: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"></path>',
    overview: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    itinerary: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    experiences: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>',
    photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
    places: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    expenses: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    trips: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'
  };
  function mtIcon(name) { return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${mtIcons[name] || ""}</svg>`; }
  function applyLineIcons() {
    $$("#mainNav [data-tab]").forEach((button) => { const i = button.querySelector("i"); if (i && !i.dataset.lined) { i.innerHTML = mtIcon(button.dataset.tab); i.dataset.lined = "1"; i.classList.add("mt-line-icon"); } });
    $$("#mtTabbar [data-icon]").forEach((i) => { if (!i.dataset.lined) { i.innerHTML = mtIcon(i.dataset.icon); i.dataset.lined = "1"; } });
  }
  const mtAllowed = () => ({ itinerary: canViewItinerary(), experiences: canViewExperiences(), photos: true, places: canViewPlaces(), expenses: canViewExpenses(), people: canViewTravellers(), print: canPrintReports() });
  function hideTabbar() { const bar = $("#mtTabbar"), fab = $("#mtFab"); if (bar) bar.hidden = true; if (fab) fab.hidden = true; document.body.classList.remove("mt-has-tabbar"); }
  function updateTabbar() {
    const bar = $("#mtTabbar"), fab = $("#mtFab"); if (!bar) return;
    if (!state.data) { hideTabbar(); return; }
    const allowed = mtAllowed();
    bar.querySelector('[data-tab="itinerary"]').hidden = !allowed.itinerary;
    bar.querySelector('[data-tab="expenses"]').hidden = !allowed.expenses;
    const sidePhotos = $('#mainNav [data-tab="photos"]'); if (sidePhotos) allowed.photos = !sidePhotos.hidden && getComputedStyle(sidePhotos).display !== "none";
    const addType = state.tab === "expenses" ? (allowed.expenses ? "expense" : "") : state.tab === "places" ? (allowed.places ? "place" : "") : state.tab === "experiences" ? (allowed.experiences ? "experience" : "") : (state.tab === "overview" || state.tab === "itinerary") && allowed.itinerary ? "plan" : "";
    fab.dataset.add = addType; fab.hidden = !addType || !state.data;
    const plus = bar.querySelector("[data-mt-plus]"); if (plus) plus.hidden = !((allowed.expenses && canAdd("expense")) || (allowed.itinerary && canAdd("plan")));
    bar.hidden = !state.data;
    document.body.classList.toggle("mt-has-tabbar", Boolean(state.data));
    const inMore = ["experiences", "photos", "places", "people", "checklist", "print"].includes(state.tab);
    bar.querySelector("[data-mt-more]").classList.toggle("active", inMore);
  }
  function openMoreSheet() {
    const allowed = mtAllowed();
    const items = [["experiences", "Experiences"], ["photos", "Trip photos"], ["places", "Places & map"], ["people", "Travellers"], ["checklist", "Checklist"], ["print", "Print & export"], ["help", "Help & feedback"]]
      .filter(([tab]) => allowed[tab] !== false).map(([tab, label]) => `<button type="button" class="mt-more-row" data-mt-go="${tab}">${mtIcon(tab)}<span>${label}</span><em>›</em></button>`).join("");
    const trips = state.travellerId && !isAdmin() ? `<button type="button" class="mt-more-row" data-mt-action="mytrips">${mtIcon("trips")}<span>My trips</span><em>›</em></button>` : (isAdmin() ? `<button type="button" class="mt-more-row" data-mt-action="alltrips">${mtIcon("trips")}<span>All trips</span><em>›</em></button>` : "");
    const size = $("#textSizeValue") ? $("#textSizeValue").textContent : "100%";
    showModal("More", `<div class="mt-more"><div class="mt-more-group">${items}</div><div class="mt-more-label">SETTINGS</div><div class="mt-more-group">${trips}${nightModeRow()}<div class="mt-more-row mt-more-size"><span>Text size</span><div><button type="button" data-mt-action="size-down">A−</button><b>${esc(size)}</b><button type="button" data-mt-action="size-up">A+</button></div></div><button type="button" class="mt-more-row" data-mt-action="update"><span class="mt-update-ico">↻</span><span>Clear cache &amp; update</span><em>›</em></button><button type="button" class="mt-more-row mt-more-danger" data-mt-action="logout">${mtIcon("logout")}<span>Sign out</span></button></div><p class="mt-more-meta">Trip ID ${esc((state.data && state.data.trip && state.data.trip.tripId) || "")} · FE v${frontendVersion}${typeof backendVersion !== "undefined" && backendVersion ? ` · BE v${esc(backendVersion)}` : ""}</p></div>`);
    $("#modalBody").querySelectorAll("[data-mt-go]").forEach((b) => b.addEventListener("click", () => { closeModal(); setTab(b.dataset.mtGo); }));
    $("#modalBody").querySelectorAll("[data-mt-action]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.mtAction;
      if (a === "size-down" || a === "size-up") { const t = $(a === "size-down" ? "#textSizeDown" : "#textSizeUp"); if (t) t.click(); const v = b.parentElement.querySelector("b"); if (v && $("#textSizeValue")) v.textContent = $("#textSizeValue").textContent; return; }
      closeModal();
      if (a === "update") { clearAppCacheAndReload(); return; }
      if (a === "logout") performLogout();
      if (a === "mytrips") showMyTrips();
      if (a === "alltrips") showAllTrips();
    }));
  }
  if ($("#mtTabbar")) {
    $("#mtTabbar").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]"); if (tab) { setTab(tab.dataset.tab); return; }
      if (event.target.closest("[data-mt-more]")) openMoreSheet();
    });
    $("#mtFab").addEventListener("click", () => { if ($("#mtFab").dataset.add) showAddModal($("#mtFab").dataset.add); });
  }
  $("#mainNav").addEventListener("click", (event) => { const button = event.target.closest("[data-tab]"); if (button) setTab(button.dataset.tab); });
  $("#view").addEventListener("click", handleViewClick);
  $("#view").addEventListener("submit", handleViewSubmit);
  $("#stickyEdgeTab").addEventListener("click", openStickyPanel);
  $("#closeStickyPanel").addEventListener("click", closeStickyPanel);
  $("#stickyPanelBackdrop").addEventListener("click", closeStickyPanel);
  addEventListener("resize", () => { if (state.data) reflowStickyNotes(); }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshStickyNotes(); });
  $("#addStickyNote").addEventListener("click", () => showStickyEditor());
  if ($("#stickyAccessButton")) $("#stickyAccessButton").addEventListener("click", showStickyBoardAccess);
  if ($("#stickyHideToggle")) $("#stickyHideToggle").addEventListener("click", toggleStickyHidden);
  if ($("#stickyRecallButton")) $("#stickyRecallButton").addEventListener("click", recallPinnedStickyNotes);
  if ($("#stickyScreenToggle")) $("#stickyScreenToggle").addEventListener("click", () => setPinnedOnScreen(!pinnedOnScreen()));
  if ($("#stickyRefreshButton")) $("#stickyRefreshButton").addEventListener("click", () => refreshStickyNotes(true));
  if ($("#textSizeDown")) $("#textSizeDown").addEventListener("click", () => stepTextScale(-1));
  if ($("#textSizeUp")) $("#textSizeUp").addEventListener("click", () => stepTextScale(1));
  applyTextScale();
  $("#closeQuickFind").addEventListener("click", closeQuickFind);
  $("#quickFindLayer").addEventListener("mousedown", (event) => { if (event.target === event.currentTarget) closeQuickFind(); });
  $("#quickFindInput").addEventListener("input", renderQuickFindResults);
  $("#quickFindInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && quickFindVisibleResults.length) { event.preventDefault(); openQuickFindResult(0); }
    if (event.key === "ArrowDown") { const first = $("#quickFindResults button"); if (first) { event.preventDefault(); first.focus(); } }
  });
  $("#quickFindResults").addEventListener("click", (event) => { const button = event.target.closest("[data-quick-find-index]"); if (button) openQuickFindResult(button.dataset.quickFindIndex); });
  $("#quickFindResults").addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const buttons = $$("#quickFindResults button");
    const current = buttons.indexOf(document.activeElement);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
  });
  $("#backToTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  $("#hubSignOut").addEventListener("click", () => performLogout());
  $("#inviteButton").addEventListener("click", showInvite); $("#allTripsButton").addEventListener("click", () => isAdmin() ? showAllTrips() : showMyTrips()); $("#connectBackendButton").addEventListener("click", () => showBackendSetup()); $("#editTripButton").addEventListener("click", showEditTrip); $("#tripPhotoButton").addEventListener("click", showTripPhotoSettings); $("#tripStatusButton").addEventListener("click", toggleCurrentTripStatus); $("#deleteTripButton").addEventListener("click", () => showDeleteTripConfirmation(state.data.trip.tripId)); $("#syncButton").addEventListener("click", refreshTrip); $("#leaveTrip").addEventListener("click", () => performLogout());
  $$('[data-add]').forEach((button) => button.addEventListener("click", () => showAddModal(button.dataset.add)));

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => addEventListener(eventName, recordActivity, { passive: true }));
  addEventListener("scroll", updateBackToTop, { passive: true });
  addEventListener("online", () => updateConnectionStatus(true));
  addEventListener("offline", () => updateConnectionStatus(true));
  addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openQuickFind(); return; }
    if (event.key !== "Escape") return;
    if (!$("#quickFindLayer").classList.contains("hidden")) closeQuickFind();
    else if (!$("#modal").classList.contains("hidden")) closeModal();
    else if ($("#stickyPanel").classList.contains("open")) closeStickyPanel();
    else { const openMenu = $(".trip-tools[open]"); if (openMenu) openMenu.removeAttribute("open"); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkIdleTimeout(); });
  addEventListener("pagehide", () => persistSession(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) persistSession(true); });
  addEventListener("pageshow", (event) => { if (event.persisted && state.authenticated) checkIdleTimeout(); });

  const inviteQuery = new URLSearchParams(location.search);
  const invitedApi = inviteQuery.get("api");
  if (!validApiUrl(config.API_URL) && validApiUrl(invitedApi)) { apiUrl = invitedApi; saveStoredApiUrl(apiUrl); }
  updateBackendStatus();
  updateConnectionStatus();
  updateHeaderDateTime();
  setInterval(() => { if (!document.hidden) updateHeaderDateTime(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateHeaderDateTime(); });
  restoreSavedAccountLogin();
  if (!new URLSearchParams(location.search).get("trip")) setTimeout(() => { resumeSession(); }, 0);
  if (inviteQuery.get("join")) setTimeout(() => showJoinByInvite(inviteQuery.get("join")), 700);
  const scheduleBackgroundTask = (task) => "requestIdleCallback" in window ? requestIdleCallback(task, { timeout: 1500 }) : setTimeout(task, 40);
  if (apiUrlReady()) scheduleBackgroundTask(() => ensureCurrentBackend().catch(() => {}));
  /* Self-healing update: registers the worker, forces an update check, and
     reloads once when a newer build takes control — so a phone can never keep
     running an old cached app.js. */
  if ("serviceWorker" in navigator && location.protocol === "https:") scheduleBackgroundTask(async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
      registration.update().catch(() => {});
      const reloadKey = "mytrip_sw_reloaded_" + frontendVersion;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem(reloadKey)) return;
        try { sessionStorage.setItem(reloadKey, "1"); } catch {}
        location.reload();
      });
      setInterval(() => registration.update().catch(() => {}), 15 * 60 * 1000);
    } catch {}
  });
  const invitedTrip = inviteQuery.get("trip"); if (invitedTrip) $("#joinTripId").value = invitedTrip.toUpperCase();
  /** Print size, wrap, page layout and alignment — shared by every printable view. */
  function printOptionsMenu(extra = "") {
    return `<details class="plan-print-menu"${state.printMenuOpen ? " open" : ""}><summary class="plan-tool">▤ Print options</summary><div class="plan-print-panel"><label class="plan-print-line"><span>Text size</span><span class="plan-width-control"><button type="button" data-print-width="-1" aria-label="Smaller">−</button><b>${printPlanScale()}pt</b><button type="button" data-print-width="1" aria-label="Larger">＋</button></span></label><label class="plan-print-line"><span>Wrap long text</span><button type="button" class="plan-switch${printPlanWrap() ? " on" : ""}" data-print-wrap aria-pressed="${printPlanWrap()}">${printPlanWrap() ? "On" : "Off"}</button></label><label class="plan-print-line"><span>Page layout</span><span class="plan-seg">${[["portrait", "▯ Portrait"], ["landscape", "▭ Landscape"]].map(([value, label]) => `<button type="button" data-print-layout="${value}" class="${printPlanLayout() === value ? "on" : ""}">${label}</button>`).join("")}</span></label><label class="plan-print-line"><span>Alignment</span><span class="plan-seg">${[["left", "⇤ Left"], ["center", "⇔ Centre"], ["right", "⇥ Right"]].map(([value, label]) => `<button type="button" data-print-align="${value}" class="${printPlanAlign() === value ? "on" : ""}" title="Align ${value}">${label}</button>`).join("")}</span></label>${extra}</div></details>`;
  }

  /* Phone only: compact timeline cards (default) or the full desktop table
     scrolled sideways. Remembered per browser. */
  const planViewKey = "mytrip_plan_view_v1";
  function planWideView() { return localStorage.getItem(planViewKey) === "table"; }
  function togglePlanView() {
    try { localStorage.setItem(planViewKey, planWideView() ? "cards" : "table"); } catch {}
    render();
  }

  function renderPlanRowEditor(item, isNew = false) {
    const category = planCategories.includes(item.category) ? item.category : "";
    const status = planStatuses.includes(item.status) ? item.status : (isNew ? "To book" : "");
    return `<form class="plan-row plan-row-editing${isNew ? " plan-row-new" : ""}" data-plan-row-form="${esc(item.id)}"${isNew ? ' data-plan-row-new="true"' : ""}>${isNew ? `<span class="plan-new-flag">NEW ROW</span>` : ""}<label><small>DAY</small><input name="date" type="date" value="${esc(item.date)}" required></label><label><small>TIME</small><input name="time" type="time" value="${esc(item.time || "")}"></label><label><small>ITINERARY</small><input name="title" maxlength="180" value="${esc(item.title)}" placeholder="What happens" required></label><label><small>PLACE</small><input name="place" maxlength="180" value="${esc(item.place || "")}" placeholder="Where"></label><label><small>REMARK</small><input name="notes" maxlength="500" value="${esc(item.notes || "")}" placeholder="Booking detail, who arranges, what to carry"></label><input type="hidden" name="category" value="${esc(category)}"><input type="hidden" name="status" value="${esc(status)}"><input type="hidden" name="bookingRef" value="${esc(item.bookingRef || "")}"><input type="hidden" name="cost" value="${esc(item.cost || "")}"><span class="plan-row-actions editing"><button class="save" type="submit">Save row</button><button type="button" data-cancel-plan-row>Cancel</button>${!isNew && isAdmin() ? `<button type="button" class="delete" data-row-delete-plan="${esc(item.id)}">Delete</button>` : ""}</span></form>`;
  }

  async function savePlanRow(event) {
    event.preventDefault();
    const form = event.target.closest("[data-plan-row-form]");
    if (!form) return;
    const id = form.dataset.planRowForm;
    const update = Object.fromEntries(new FormData(form).entries());
    update.cost = Number(update.cost) > 0 ? Number(update.cost) : "";
    const submit = form.querySelector('button[type="submit"]');
    const isNew = form.dataset.planRowNew === "true";

    if (isNew) {
      if (!canAdd("plan")) return toast("Adding itinerary rows is not allowed for this account", true);
      const record = { id: uid(), ...update, sortOrder: nextPlanSortOrder(update.date), createdBy: state.currentUser };
      submit.disabled = true; submit.textContent = "Saving…";
      try {
        if (!state.demoMode) await api("addPlan", authPayload({ record }));
        state.data.itinerary.push(record);
        state.planAddDate = record.date;
        render(); hydrateShell(); updatePrintArea(); toast("Itinerary row added for everyone");
      } catch (error) { submit.disabled = false; submit.textContent = "Save row"; toast(error.message, true); }
      return;
    }

    const item = state.data.itinerary.find((row) => String(row.id) === String(id));
    if (!item || !canEditRecords("Itinerary")) return toast("Itinerary editing is not allowed for this account", true);
    submit.disabled = true; submit.textContent = "Saving…";
    try {
      if (!state.demoMode) await api("updateRecord", authPayload({ sheet: "Itinerary", id, record: update }));
      Object.assign(item, update); state.planRowEditId = ""; render(); hydrateShell(); updatePrintArea(); toast("Itinerary row saved to Google Sheet");
    } catch (error) { submit.disabled = false; submit.textContent = "Save row"; toast(error.message, true); }
  }

  /** New rows land at the end of their day; duplicates sit right after their source. */
  function nextPlanSortOrder(date) {
    const dayRows = state.data.itinerary.filter((row) => row.date === date);
    return dayRows.length ? Math.max(...dayRows.map((row) => Number(row.sortOrder || 0))) + 10 : 10;
  }

  /** The tick in the ACTIONS column is the same "Done" status the printed box shows. */
  /** Swaps one row's markup in place — no full redraw, no scroll jump. */
  function patchPlanRow(id) {
    const element = $(`[data-plan-row="${CSS.escape(String(id))}"]`);
    if (!element) { render(); return; }
    const all = sortedPlans();
    const item = all.find((row) => String(row.id) === String(id));
    if (!item) { render(); return; }
    const index = all.findIndex((row) => String(row.id) === String(id));
    const wrapper = document.createElement("div");
    wrapper.innerHTML = planRowMarkup(item, all[index - 1], all);
    const fresh = wrapper.firstElementChild;
    if (fresh) element.replaceWith(fresh);
    else render();
  }

  async function togglePlanDone(id) {
    const item = state.data.itinerary.find((row) => String(row.id) === String(id));
    if (!item || !canEditRecords("Itinerary")) return toast("Itinerary editing is not allowed for this account", true);
    const status = String(item.status || "") === "Done" ? "" : "Done";
    const previous = item.status || "";
    item.status = status;
    patchPlanRow(id);
    try { if (!state.demoMode) await api("updateRecord", authPayload({ sheet: "Itinerary", id, record: { status } })); updatePrintArea(); }
    catch (error) { item.status = previous; patchPlanRow(id); toast(error.message, true); }
  }

  /** Moves a row one step up or down inside its own day and saves the order. */
  async function movePlanRow(id, direction) {
    if (!canEditRecords("Itinerary")) return toast("Itinerary editing is not allowed for this account", true);
    const item = state.data.itinerary.find((row) => String(row.id) === String(id));
    if (!item) return;
    const dayRows = sortedPlans().filter((row) => row.date === item.date);
    const index = dayRows.findIndex((row) => String(row.id) === String(id));
    const target = index + direction;
    if (target < 0 || target >= dayRows.length) return;
    dayRows.splice(target, 0, dayRows.splice(index, 1)[0]);
    const changed = dayRows.map((row, position) => { row.sortOrder = (position + 1) * 10; return row; });
    render();
    if (await persistPlanOrder(changed)) { updatePrintArea(); toast("Row moved"); }
    else render();
  }

  async function duplicatePlanRow(id) {
    if (!canAdd("plan")) return toast("Adding itinerary rows is not allowed for this account", true);
    const source = state.data.itinerary.find((row) => String(row.id) === String(id));
    if (!source) return toast("Itinerary row not found", true);
    const record = { ...source, id: uid(), sortOrder: Number(source.sortOrder || 0) + 5, createdBy: state.currentUser };
    try {
      if (!state.demoMode) await api("addPlan", authPayload({ record }));
      state.data.itinerary.push(record); render(); hydrateShell(); updatePrintArea(); toast("Row duplicated");
    } catch (error) { toast(error.message, true); }
  }

  /** Saves the new running order after a drag, one row at a time. */
  async function persistPlanOrder(rows) {
    if (state.demoMode || !rows.length) return true;
    try {
      await Promise.all(rows.map((row) => api("updateRecord", authPayload({ sheet: "Itinerary", id: row.id, record: { sortOrder: row.sortOrder } }))));
      return true;
    } catch (error) { toast(error.message, true); return false; }
  }

  /** Drag a row by its grip. Listeners live on the document so the pointer can
      leave the small grip without the drag dying. */
  function bindPlanRowDragging() {
    const table = $(".plan-table");
    if (!table || table.dataset.dragBound === "true") return;
    table.dataset.dragBound = "true";
    table.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest("[data-plan-drag]");
      if (!handle) return;
      event.preventDefault();
      const row = handle.closest("[data-plan-row]");
      const date = row.dataset.planDate;
      const siblings = () => [...table.querySelectorAll(`[data-plan-row][data-plan-date="${date}"]`)];
      if (siblings().length < 2) return;
      row.classList.add("dragging");
      document.body.classList.add("plan-dragging");
      const move = (moveEvent) => {
        const target = siblings().find((candidate) => {
          if (candidate === row) return false;
          const box = candidate.getBoundingClientRect();
          return moveEvent.clientY >= box.top && moveEvent.clientY <= box.bottom;
        });
        if (!target) return;
        const box = target.getBoundingClientRect();
        const after = moveEvent.clientY > box.top + box.height / 2;
        target.parentNode.insertBefore(row, after ? target.nextSibling : target);
      };
      const finish = async () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        row.classList.remove("dragging");
        document.body.classList.remove("plan-dragging");
        const changed = siblings().map((element, index) => {
          const record = state.data.itinerary.find((candidate) => String(candidate.id) === element.dataset.planRow);
          if (record) record.sortOrder = (index + 1) * 10;
          return record;
        }).filter(Boolean);
        render();
        if (await persistPlanOrder(changed)) { updatePrintArea(); toast("Day order saved"); }
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
    });
  }
})();

;(()=>{const kill=()=>setTimeout(()=>{const i=document.getElementById("pullIndicator");if(i)i.remove();},350);document.addEventListener("touchend",kill,{passive:true});document.addEventListener("touchcancel",kill,{passive:true});window.addEventListener("pageshow",kill);})();

;(()=>{const sync=()=>{const d=document.documentElement.getAttribute("data-theme")==="dark";const m=document.querySelector('meta[name="color-scheme"]');if(m)m.content="only light";document.documentElement.style.colorScheme="only light";};sync();new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});})();

;(()=>{const MEDIA="img,video,canvas,iframe,picture,svg image";let q=0;
const scan=()=>{q=0;const dark=document.documentElement.getAttribute("data-theme")==="dark";
document.querySelectorAll("[data-mt-media]").forEach(e=>{if(!dark)e.removeAttribute("data-mt-media")});if(!dark)return;
const all=document.body.querySelectorAll("*");for(const e of all){if(e.closest(".leaflet-container")&&!e.classList.contains("leaflet-container"))continue;
let m=e.matches(MEDIA)||e.classList.contains("leaflet-container");
if(!m){const bg=getComputedStyle(e).backgroundImage;m=!!bg&&bg.includes("url(")&&!e.querySelector("h1,h2,h3,h4,p,button,a,input,textarea,select,label")&&(e.textContent||"").trim().length<30;}
if(m){if(e.parentElement&&e.parentElement.closest("[data-mt-media]"))e.removeAttribute("data-mt-media");else e.setAttribute("data-mt-media","");}
else if(e.hasAttribute("data-mt-media"))e.removeAttribute("data-mt-media");}};
const later=()=>{if(!q)q=requestAnimationFrame(()=>setTimeout(scan,60))};
new MutationObserver(ms=>{if(ms.every(m=>m.type==="attributes"&&m.attributeName==="data-mt-media"))return;later()}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["style","class","src","data-theme"]});
document.addEventListener("DOMContentLoaded",scan);window.addEventListener("load",scan);later();})();

;(()=>{const idOf=(u)=>{u=String(u||"");const m=u.match(/[?&]id=([A-Za-z0-9_-]{10,})/)||u.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)||u.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/);return m?m[1]:"";};
const chain=(id)=>["https://lh3.googleusercontent.com/d/"+id+"=w1600","https://drive.google.com/thumbnail?id="+id+"&sz=w1000","https://drive.usercontent.google.com/download?id="+id+"&export=view"];
document.addEventListener("error",(e)=>{const img=e.target;if(!img||img.tagName!=="IMG")return;const id=idOf(img.dataset.mtOrig||img.src);const step=Number(img.dataset.mtTry||0);
if(id&&step<3){if(!img.dataset.mtOrig)img.dataset.mtOrig=img.src;img.dataset.mtTry=String(step+1);img.src=chain(id)[step];return;}
const box=img.closest(".library-cover");if(box&&!box.querySelector(".library-cover-letter")){const s=document.createElement("span");s.className="library-cover-letter";s.textContent=img.dataset.letter||"";box.classList.remove("has-photo");box.prepend(s);}
img.style.display="none";},true);})();
