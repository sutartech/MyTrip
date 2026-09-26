(() => {
  "use strict";

  const config = window.MYTRIP_CONFIG || {};
  const apiStorageKey = "mytrip_google_backend_url";
  const savedUsernameStorageKey = "mytrip_saved_username_v2";
  const legacySavedLoginStorageKey = "mytrip_saved_account_login_v1";
  const obsoleteTabPasswordStorageKey = "mytrip_tab_password_v1";
  const frontendVersion = "4.25.0";
  const requiredBackendVersion = "4.12.1";
  const validApiUrl = (value) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value || "").trim());
  function readStoredApiUrl() { try { return localStorage.getItem(apiStorageKey) || ""; } catch { return ""; } }
  function saveStoredApiUrl(value) { try { localStorage.setItem(apiStorageKey, value); } catch {} }
  /* The URL the Administrator last connected and verified in the app wins over
     config.js; the other one stays as an automatic fallback. Before, config.js
     always won, so after a "New deployment" (new URL) the app kept calling the
     old, deleted URL and got HTTP 404. */
  function backendCandidates() {
    return [...new Set([readStoredApiUrl(), String(config.API_URL || "").trim()].filter(validApiUrl))];
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

  const state = { data: null, tab: "overview", pin: "", accountUsername: "", authenticated: false, travellerId: "", loginMode: "trip", demoMode: false, mapQuery: "Goa, India", currentUser: "Traveller", accessRole: "traveller", permissions: {}, expenseRowEditId: "" };
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
  const labels = { overview: "Overview", itinerary: "Itinerary", experiences: "Experiences", photos: "Trip Photos", places: "Places & Map", expenses: "Expenses", people: "Travellers", print: "Print & Export" };
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
  function toast(message, error = false) { const element = $("#toast"); element.textContent = `${error ? "!" : "✓"} ${message}`; element.style.background = error ? "#a34343" : "#17263c"; element.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add("hidden"), error ? 9000 : 2800); }
  function displayDate(date, options = { day: "2-digit", month: "short", year: "numeric" }) { if (!date) return "—"; return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options); }
  function displayTime(value) { if (!value) return ""; const [hours, minutes] = String(value).split(":"); const date = new Date(2000, 0, 1, Number(hours), Number(minutes)); return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
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
    if (navigator.onLine === false) throw new Error("No internet connection. Reconnect and try again.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    setRequestProgress(1);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...payload }), signal: controller.signal });
      if (!response.ok) throw new Error(`Google backend returned HTTP ${response.status}.${response.status === 404 ? " The saved Web App URL no longer exists — in Apps Script open Deploy → Manage deployments, copy the Web app URL, then paste it under Other setup tools → Connect backend (or into config.js)." : ""}`);
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
    return requestAt(apiUrl, action, payload);
  }

  function stopIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = 0;
    idleDeadline = 0;
  }

  function performLogout(message = "Signed out. Login is required again.") {
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
  }

  function startIdleTimer() {
    stopIdleTimer();
    lastActivitySignal = Date.now();
    idleDeadline = lastActivitySignal + idleLogoutMs;
    checkIdleTimeout();
  }

  async function clearAppCacheAndReload() {
    const button = $("#clearAppCache");
    button.disabled = true; button.textContent = "Clearing…";
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      try { sessionStorage.clear(); } catch {}
      const refreshedUrl = new URL(location.href);
      refreshedUrl.searchParams.set("refresh", String(Date.now()));
      location.replace(refreshedUrl.href);
    } catch (error) {
      button.disabled = false; button.textContent = "↻ Repair MyTrip cache/session";
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

  function normalize(data) {
    return { trip: data.trip || {}, members: data.members || [], assignments: data.assignments || [], places: data.places || [], itinerary: data.itinerary || [], experiences: data.experiences || [], photos: data.photos || [], stickyDiary: data.stickyDiary || [], stickyNotes: data.stickyNotes || [], expenses: (data.expenses || []).map((item) => ({ ...item, amount: Number(item.amount || 0) })) };
  }

  function isAdmin() { return state.accessRole === "administrator"; }
  function canViewItinerary() { return isAdmin() || state.permissions.viewItinerary !== false; }
  function canViewExperiences() { return isAdmin() || state.permissions.viewExperiences !== false; }
  function canViewPlaces() { return isAdmin() || state.permissions.viewPlaces !== false; }
  function canViewExpenses() { return isAdmin() || state.permissions.viewExpenses !== false; }
  function canViewTravellers() { return isAdmin() || state.permissions.viewTravellers !== false; }
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
    const allowed = { plan: canViewItinerary(), experience: canViewExperiences(), place: canViewPlaces(), expense: canViewExpenses(), travellers: isAdmin(), member: isAdmin() };
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
  function tripPhotoUrl(value) {
    const url = String(value || "").trim();
    const drivePath = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
    const driveQuery = url.match(/[?&]id=([A-Za-z0-9_-]+)/i);
    const id = drivePath ? drivePath[1] : (driveQuery ? driveQuery[1] : "");
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600` : url;
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
    state.data = normalize(clone(data)); state.pin = pin; state.demoMode = demoMode;
    state.accessRole = roleOverride || data.accessRole || "traveller";
    state.currentUser = name || (state.accessRole === "administrator" ? (data.trip.createdBy || "Administrator") : "Traveller");
    state.travellerId = travellerId; state.loginMode = loginMode;
    if (!state.accountUsername) state.accountUsername = travellerId || (state.accessRole === "administrator" ? "administrator" : "shared");
    state.authenticated = true;
    state.permissions = data.permissions || {};
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
    $("#topAvatars").innerHTML = canViewTravellers() ? members.slice(0, 3).map((member) => `<span title="${esc(member.name)}">${esc(initials(member.name))}</span>`).join("") + (members.length > 3 ? `<span>+${members.length - 3}</span>` : "") : "";
  }

  function setTab(tab) {
    const allowed = { itinerary: canViewItinerary(), experiences: canViewExperiences(), photos: true, places: canViewPlaces(), expenses: canViewExpenses(), people: canViewTravellers(), print: canPrintReports() };
    if (allowed[tab] === false) return toast("This feature is hidden for your Traveller ID by the Administrator", true);
    state.tab = tab; $("#crumbLabel").textContent = labels[tab];
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

  function renderJourneyStage(today) {
    const trip = state.data.trip;
    const stage = tripOverviewStage(today);
    const itinerary = [...state.data.itinerary].sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
    const activeSticky = stickyNotes.filter((note) => !note.completed);
    const reminder = importantStickyForToday(today);
    const destination = esc(trip.destination || trip.name || "your destination");
    if (stage === "preparation") {
      const daysToGo = Math.max(0, daysBetween(today, trip.startDate));
      const plannedDays = new Set(itinerary.map((item) => item.date).filter(Boolean)).size;
      const placesPlanned = state.data.places.filter((place) => String(place.plannedDay || "").toLowerCase() !== "unplanned").length;
      return `<section class="journey-stage preparation"><div class="journey-stage-hero"><div><span class="journey-stage-kicker">◇ TRIP PREPARATION</span><h2>${daysToGo === 1 ? "Tomorrow is the journey" : `${daysToGo} days to go`}</h2><p><b>${displayDate(trip.startDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b> · ${destination}</p></div><span class="journey-stage-badge">GET READY</span></div><div class="journey-prep-grid">${canViewItinerary() ? `<article><i>▦</i><small>PLANNED DAYS</small><strong>${plannedDays}</strong><span>${itinerary.length} itinerary entries</span></article>` : ""}${canViewPlaces() ? `<article><i>⌖</i><small>PLACES READY</small><strong>${placesPlanned}</strong><span>${state.data.places.length} places saved</span></article>` : ""}<article><i>📌</i><small>ACTIVE REMINDERS</small><strong>${activeSticky.length}</strong><span>${reminder ? esc(reminder.title) : "Nothing needs attention"}</span></article><article><i>▧</i><small>TRIP PHOTOS</small><strong>${state.data.photos.length}</strong><span>Gallery ready for memories</span></article></div></section>`;
    }

    if (stage === "completed") {
      const daysSince = Math.max(0, daysBetween(trip.endDate, today));
      const completedCopy = daysSince === 0 ? "Completed today" : (daysSince === 1 ? "Completed yesterday" : `Completed ${daysSince} days ago`);
      return `<section class="journey-stage completed"><div class="journey-stage-hero"><div><span class="journey-stage-kicker">✓ TRIP COMPLETED</span><h2>Keep the journey alive</h2><p><b>${completedCopy}</b> · ${destination}</p></div><span class="journey-stage-badge">MEMORIES</span></div><div class="journey-prep-grid">${canViewExpenses() ? `<article><i>₹</i><small>TOTAL SPENDING</small><strong>${money.format(spent())}</strong><span>${state.data.expenses.length} expense entries</span></article>` : ""}${canViewExperiences() ? `<article><i>✍</i><small>EXPERIENCES</small><strong>${state.data.experiences.length}</strong><span>Diary memories recorded</span></article>` : ""}<article><i>▧</i><small>TRIP PHOTOS</small><strong>${state.data.photos.length}</strong><span>Photos in the gallery</span></article>${canViewPlaces() ? `<article><i>⌖</i><small>PLACES VISITED</small><strong>${state.data.places.length}</strong><span>Saved trip places</span></article>` : ""}</div></section>`;
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
    return `<section class="journey-stage active"><div class="journey-stage-hero"><div><span class="journey-stage-kicker">◆ DAY ${tripDay} OF ${totalDays}</span><h2>Today’s Journey</h2><p><b>${displayDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b> · ${destination}</p></div><span class="journey-stage-badge">LIVE TODAY</span></div><div class="journey-live-grid"><div class="journey-main"><header><div><small>${next ? "UP NEXT" : (todayItems.length ? "TODAY’S PLAN" : "OPEN DAY")}</small><h3>${next ? esc(next.title || "Next plan") : (todayItems.length ? "Today’s scheduled plans are complete" : "No itinerary planned for today")}</h3><p>${next ? `${next.time ? `${esc(displayTime(next.time))} · ` : ""}${next.place ? `⌖ ${esc(next.place)}` : "Location not added"}` : "Use this free time for a spontaneous discovery or add a plan."}</p></div>${next && next.place ? `<a class="journey-navigate" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.place)}" target="_blank" rel="noreferrer">⌖ Navigate</a>` : ""}</header><div class="journey-plan-list">${journeyList || `<div class="journey-empty"><i>☀</i><b>Make today memorable</b><span>Add a plan, visit a saved place, or record an experience.</span></div>`}</div></div><aside class="journey-side">${canViewExpenses() ? `<article class="journey-metric"><small>TODAY’S SPENDING</small><strong>${money.format(todaySpent)}</strong><span>${todayExpenses.length} ${todayExpenses.length === 1 ? "payment" : "payments"} recorded</span></article>` : ""}${reminderCard}</aside></div></section>`;
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
    const cover = photo ? `<section class="trip-cover"><img src="${esc(photo)}" alt="Cover photo for ${esc(state.data.trip.name)}" width="1600" height="900" referrerpolicy="no-referrer" decoding="async" fetchpriority="high"><div><span>TRIP PHOTO</span><h2>${esc(state.data.trip.name)}</h2><p>${esc(state.data.trip.destination)}</p>${isAdmin() ? `<button data-trip-photo>Change photo</button>` : ""}</div></section>` : (isAdmin() ? `<section class="trip-cover trip-cover-empty"><div><span>TRIP PHOTO</span><h2>Add a memorable cover photo</h2><p>Use a public HTTPS image or Google Drive sharing link.</p><button data-trip-photo>Add photo</button></div></section>` : "");
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
    return `${renderJourneyStage(today)}<section class="quick-actions overview-primary-actions" aria-label="Quick actions">${planQuickAction}${expenseQuickAction}${placeQuickAction}${peopleQuickAction}${experienceQuickAction}${printQuickAction}</section>${cover}<section class="stats"><article class="stat"><i>◫</i><div><small>TRIP LENGTH</small><strong>${nights()} nights</strong><span>${displayDate(state.data.trip.startDate, { day: "numeric", month: "short" })}–${displayDate(state.data.trip.endDate, { day: "numeric", month: "short" })}</span></div></article>${expenseStat}${placeStat}${peopleStat}${notesStat}</section><section class="main-grid overview-grid ${canViewExpenses() ? "" : "no-expenses"}">${itineraryPanel}${expensePanels}</section>`;
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
      return `<div class="plan-row${firstOfDay ? " day-start" : ""}" draggable="false" data-plan-row="${esc(item.id)}" data-plan-date="${esc(item.date)}"><span class="plan-cell-day">${handle}<span>${firstOfDay ? `<small>${displayDate(item.date, { weekday: "short" }).toUpperCase()}</small><b>${displayDate(item.date, { day: "2-digit", month: "short" })}</b>` : `<em class="plan-same-day">same day</em>`}</span></span><span class="plan-cell-time">${item.time ? esc(displayTime(item.time)) : "Any time"}</span><span class="plan-cell-title"><b>${esc(item.title)}</b>${chips ? `<span class="plan-chips">${chips}</span>` : ""}</span><span class="plan-cell-place">${mapLink}${meta ? `<span class="plan-meta">${meta}</span>` : ""}</span><span class="plan-cell-remark">${esc(item.notes || "—")}</span><span class="plan-row-actions">${actions}</span></div>`;
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

    return `${heading("DAY BY DAY", "Trip itinerary", "Add, edit, reorder and delete rows in place. Use the header grips to size columns.", "plan")}${filterRow}<section class="table-panel plan-record-panel"><div class="table-headline"><div><span class="kicker">DAY PLANNER</span><h2>Itinerary table</h2><p>${all.length} ${all.length === 1 ? "plan" : "plans"} across ${days.length} ${days.length === 1 ? "day" : "days"}${plannedTotal ? " · " + money.format(plannedTotal) + " planned cost" : ""}.</p></div><span class="plan-table-tools"><button type="button" class="plan-tool" data-sort-plan-time="${esc(state.planDayFilter || "")}" title="Put rows in clock order">⏱ Sort by time</button>${printOptionsMenu(`<label class="plan-print-line"><span>Column widths</span><button type="button" class="plan-tool" data-reset-plan-columns>⇔ Reset</button></label>`)}${canPrintReports() ? `<button class="plan-tool primary-tool" data-print="itinerary">▤ Print itinerary</button>` : ""}</span></div><div class="plan-table" style="${planColumnStyle()}"><div class="plan-table-header">${planColumnLabels.map((label, index) => `<span>${label}${index < planColumnLabels.length - 1 ? `<i class="plan-col-grip" data-plan-col="${index}" title="Drag to resize this column"></i>` : ""}</span>`).join("")}</div>${rows || `<div class="plan-empty-row"><b>No itinerary added yet</b><p>Add the first plan for this trip.</p></div>`}${newRow}</div></section>`;
  }

  function renderExperiences() {
    if (!canViewExperiences()) return `<section class="feature-locked"><i>✍</i><h2>Experiences hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const experiences = [...state.data.experiences].sort((a, b) => `${a.date}${a.createdAt || ""}`.localeCompare(`${b.date}${b.createdAt || ""}`));
    const experienceCards = experiences.map((item, index) => `<article class="experience-card colour-${index % 5}"><div class="experience-date"><small>${displayDate(item.date, { weekday: "short" }).toUpperCase()}</small><b>${displayDate(item.date, { day: "2-digit" })}</b><span>${displayDate(item.date, { month: "short" })}</span></div><div class="experience-copy"><span class="experience-place">${item.place ? `⌖ ${esc(item.place)}` : "TRIP MEMORY"}</span><p>${esc(item.note)}</p><strong>✍ Written by ${esc(item.writer || "Trip member")}</strong></div><span class="record-actions">${canEditRecords("ExperienceNotes") ? `<button class="edit-control" data-edit data-sheet="ExperienceNotes" data-id="${esc(item.id)}">Edit</button>` : ""}${isAdmin() ? `<button class="delete-control" data-delete data-sheet="ExperienceNotes" data-id="${esc(item.id)}">Delete</button>` : ""}</span></article>`).join("");
    return `<section class="experience-section experience-page"><div class="experience-hero"><div><span class="kicker">COLOURFUL TRAVEL JOURNAL</span><h2>Experiences worth remembering</h2><p>Keep every place, feeling and story together in a separate journal.</p></div>${canAdd("experience") ? `<button class="primary" data-add="experience">＋ Add experience</button>` : ""}</div><div class="experience-summary"><article><i>✍</i><div><small>MEMORIES</small><b>${experiences.length}</b></div></article><article><i>⌖</i><div><small>PLACES</small><b>${new Set(experiences.map((item) => item.place).filter(Boolean)).size}</b></div></article><article><i>☀</i><div><small>WRITERS</small><b>${new Set(experiences.map((item) => item.writer).filter(Boolean)).size}</b></div></article></div><div class="experience-list">${experienceCards || `<div class="empty-experiences"><b>No experience notes yet</b><p>Add the first colourful memory from this trip.</p></div>`}</div></section>`;
  }

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
    const cards = photos.map((photo, index) => `<article class="trip-photo-card colour-${index % 6}"><button class="trip-photo-open" data-open-photo="${esc(photo.id)}" aria-label="View photo"><img src="${esc(photo.photoUrl)}" alt="${esc(photo.caption || `Trip photo by ${photo.uploadedBy || "Trip member"}`)}" width="900" height="600" loading="lazy" decoding="async" fetchpriority="low"></button><div><span class="photo-number">PHOTO ${String(index + 1).padStart(2, "0")}</span><h3>${esc(photo.caption || "A trip memory")}</h3><p>📷 ${esc(photo.uploadedBy || "Trip member")} · ${displayDate(String(photo.createdAt || "").slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</p>${mayManagePhoto(photo) ? `<span class="trip-photo-actions">${mayReplacePhoto(photo) ? `<button data-replace-photo="${esc(photo.id)}">Replace</button>` : ""}<button class="delete" data-delete-photo="${esc(photo.id)}">Delete</button></span>` : ""}</div></article>`).join("");
    return `<section class="trip-photos-page"><div class="trip-photos-hero"><div><span class="kicker">COLOURFUL TRIP GALLERY</span><h2>Photos from the journey</h2><p>Keep selected trip photographs together. Images are stored in Google Drive and photo details are stored in Google Sheets.</p></div><div class="trip-photos-hero-actions">${isAdmin() ? `<button class="photo-access-toggle ${enabled ? "enabled" : "disabled"}" data-toggle-photo-uploads>${enabled ? "Disable traveller uploads" : "Enable traveller uploads"}</button>` : ""}${mayAdd ? `<button class="primary" data-add-trip-photo>＋ Add photo</button>` : ""}</div></div><div class="photo-access-strip ${enabled ? "enabled" : "disabled"}"><i>${enabled ? "●" : "○"}</i><div><b>${isAdmin() ? "Administrator photo control" : "Your photo allowance"}</b><p>${esc(accessText)}</p></div>${!isAdmin() && state.travellerId ? `<strong>${count}/${limit}</strong>` : `<strong>${photos.length} photos</strong>`}</div><div class="trip-photo-grid">${cards || `<div class="empty-photo-gallery"><i>▣</i><b>No trip photos yet</b><p>${mayAdd ? "Add the first colourful memory from this journey." : "An authorised traveller or the Administrator can add the first photo."}</p></div>`}</div></section>`;
  }

  function renderPlaces() {
    if (!canViewPlaces()) return `<section class="feature-locked"><i>⌖</i><h2>Places & Map hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    return `${heading("DISCOVER & SAVE", "Places and map", "Travellers can save and edit places; the administrator can also remove them.", "place")}<div class="map-search"><input id="mapQuery" value="${esc(state.mapQuery)}" aria-label="Search Google Maps"><button id="mapSearchButton">⌖ Search Google Maps</button></div><div class="places-layout"><div class="map-frame"><iframe title="Trip map" src="https://www.google.com/maps?q=${encodeURIComponent(state.mapQuery)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><div class="places-list">${state.data.places.map((place) => `<article class="place"><i class="place-icon">⌖</i><div><h3>${esc(place.name)}</h3><p>${esc(place.area)} · ${esc(place.category)}</p><small>${esc(place.plannedDay || "Unplanned")}</small></div><span class="row-actions"><button data-map="${esc(`${place.name}, ${place.area}`)}">Map ↗</button>${canEditRecords("Places") ? `<button class="edit-control mini" data-edit data-sheet="Places" data-id="${esc(place.id)}">Edit</button>` : ""}${isAdmin() ? `<button class="delete-control mini" data-delete data-sheet="Places" data-id="${esc(place.id)}">×</button>` : ""}</span></article>`).join("")}</div></div>`;
  }

  function renderExpenses() {
    if (!canViewExpenses()) return `<section class="feature-locked"><i>₹</i><h2>Expenses hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const budget = Number(state.data.trip.budget || 0), total = spent();
    const travellerTotals = expenseTotalsByTraveller();
    const travellerCards = travellerTotals.map((row) => {
      const percent = total ? Math.round(row.total / total * 100) : 0;
      return `<article class="traveller-expense-card"><i>${esc(initials(row.name))}</i><div><b>${esc(row.name)}</b><small>${row.count} ${row.count === 1 ? "payment" : "payments"} · ${percent}% of total</small><span><em style="width:${percent}%"></em></span></div><strong>${money.format(row.total)}</strong></article>`;
    }).join("");
    const rows = [...state.data.expenses].sort((a, b) => `${b.date || ""}${b.id || ""}`.localeCompare(`${a.date || ""}${a.id || ""}`)).map((expense) => {
      if (String(state.expenseRowEditId) === String(expense.id)) return renderExpenseRowEditor(expense);
      const editActions = canEditRecords("Expenses") ? `<button class="row-edit" data-row-edit-expense="${esc(expense.id)}">Row edit</button><button data-edit data-sheet="Expenses" data-id="${esc(expense.id)}">Edit</button>` : "";
      const deleteAction = isAdmin() ? `<button class="delete" data-delete-expense="${esc(expense.id)}">Delete</button>` : "";
      return `<div class="expense-row"><span class="expense-description"><i>₹</i><b>${esc(expense.label)}</b></span><span>${displayDate(expense.date)}</span><span><em class="expense-category">${esc(expense.category || "Other")}</em></span><span><b class="expense-payer">${esc(expense.paidBy || "Not specified")}</b></span><span class="expense-amount"><strong>${money.format(expense.amount)}</strong></span><span class="expense-row-actions"><button data-view-expense="${esc(expense.id)}">View</button>${editActions}${deleteAction}</span></div>`;
    }).join("");
    return `${heading("EXPENSE TRACKER", "Expenses and payments", "View every payment in one row. Allowed accounts can use quick row editing or the full editor; deletion is controlled by the Administrator.", "expense")}<section class="expense-summary"><article class="summary-card budget-card"><small>TRIP BUDGET</small><strong>${money.format(budget)}</strong><span>Planned spending limit</span></article><article class="summary-card spent-card"><small>TOTAL EXPENSES</small><strong>${money.format(total)}</strong><span>${budget ? Math.round(total / budget * 100) : 0}% of the budget used</span></article><article class="summary-card balance-card"><small>${budget - total < 0 ? "OVER BUDGET" : "BALANCE AVAILABLE"}</small><strong>${money.format(Math.abs(budget - total))}</strong><span>${budget - total < 0 ? "Review trip spending" : "Remaining for this trip"}</span></article></section><section class="traveller-expense-panel"><div class="traveller-expense-heading"><div><span class="kicker">WHO PAID</span><h2>Traveller-wise expense totals</h2><p>Only travellers with a positive recorded payment are shown.</p></div><strong>${money.format(total)} total</strong></div><div class="traveller-expense-grid">${travellerCards || `<p class="empty-overview">No traveller expenses recorded.</p>`}</div></section><section class="table-panel expense-record-panel"><div class="table-headline"><div><span class="kicker">COMPLETE RECORD</span><h2>Detailed expense statement</h2><p>Use Row edit for a quick change or Edit for every field.</p></div>${canPrintReports() ? `<span class="plan-table-tools">${printOptionsMenu()}<button class="plan-tool primary-tool" data-print="expenses">▤ Print expenses</button></span>` : ""}</div><div class="expense-table expense-action-table"><div class="expense-table-header"><span>DESCRIPTION</span><span>DATE</span><span>CATEGORY</span><span>PAID BY</span><span>AMOUNT</span><span>ACTIONS</span></div>${rows || `<div class="expense-empty-row"><b>No expenses recorded</b><p>Add the first trip payment.</p></div>`}</div></section>`;
  }

  function renderExpenseRowEditor(expense) {
    const categories = ["Food", "Stay", "Travel", "Local travel", "Activities", "Shopping", "Other"];
    if (expense.category && !categories.includes(expense.category)) categories.push(expense.category);
    const payers = [...new Set([...visibleTripMembers().map((member) => member.name), expense.paidBy, state.currentUser || "Traveller"].filter(Boolean))];
    return `<form class="expense-row expense-row-editing" data-expense-row-form="${esc(expense.id)}"><label><small>DESCRIPTION</small><input name="label" maxlength="180" value="${esc(expense.label)}" required></label><label><small>DATE</small><input name="date" type="date" value="${esc(expense.date)}" required></label><label><small>CATEGORY</small><select name="category">${categories.map((category) => `<option ${category === expense.category ? "selected" : ""}>${esc(category)}</option>`).join("")}</select></label><label><small>PAID BY</small><select name="paidBy" required>${payers.map((payer) => `<option ${payer === expense.paidBy ? "selected" : ""}>${esc(payer)}</option>`).join("")}</select></label><label><small>AMOUNT</small><input name="amount" type="number" min="0.01" step="0.01" value="${esc(expense.amount)}" required></label><span class="expense-row-actions editing"><button class="save" type="submit">Save row</button><button type="button" data-cancel-expense-row>Cancel</button></span></form>`;
  }

  function showExpenseDetails(id) {
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
      return `<article class="person ${member.travellerId ? "personal-access" : "shared-only"}"><i>${esc(initials(member.name))}</i><div><h3>${esc(member.name)}</h3><p>${member.travellerId ? `Username · ${esc(member.travellerId)}` : (member.role === "Organiser" ? "Trip organiser" : "Trip member without an account")}</p></div><span>${esc(member.role)}</span><div class="person-access-badge ${member.travellerId ? "enabled" : "pending"}">${isAdmin() ? (member.travellerId ? "ENABLED FOR THIS TRIP" : (member.role === "Organiser" ? "ADMIN" : "ACCOUNT REQUIRED")) : (member.travellerId ? "TRAVELLER ACCOUNT" : (member.role === "Organiser" ? "ORGANISER" : "TRIP MEMBER"))}</div>${accessBadge}<footer>${paidTotal}<span class="person-footer-actions">${isAdmin() && member.travellerId ? `<button class="pin-reset-control" data-reset-member-pin="${esc(member.id)}" aria-label="Edit password for ${esc(member.name)}">✎ Edit password</button>` : ""}${isAdmin() && !member.travellerId && member.role !== "Organiser" ? `<button class="pin-reset-control" data-give-pin="${esc(member.id)}" aria-label="Create account for ${esc(member.name)}">＋ Create account</button>` : ""}${isAdmin() && member.role !== "Organiser" ? `<button class="delete-control trip-disable-control" data-remove-trip-member="${esc(member.id)}">Remove from trip</button>` : ""}</span></footer></article>`;
    }).join("");
    return `${heading("YOUR TRAVEL GROUP", isAdmin() ? "Traveller accounts and feature access" : "Travellers and trip members", isAdmin() ? "Open Control access on a traveller to show or hide each dashboard feature." : "The complete trip member list is shown here.", "travellers")}<div class="share-banner"><div><h3>${isAdmin() ? "Trip-specific traveller access" : `${members.length} trip ${members.length === 1 ? "member" : "members"}`}</h3><p>Trip ID <b>${esc(state.data.trip.tripId)}</b> · ${isAdmin() ? "Feature controls apply to each personal username; shared trip access remains separate" : "Full traveller and member list"}</p></div>${isAdmin() ? `<span class="banner-actions"><button data-add-existing-travellers>＋ Existing traveller</button><button data-add="travellers">＋ New traveller</button><button data-manage-current-trip>Manage access</button><button data-all-trips>All trips</button></span>` : `<span class="readonly-label">TRIP GROUP</span>`}</div><div class="people-grid">${cards || `<div class="empty-trip-members"><b>No trip members yet</b><p>No traveller or member has been added to this trip.</p></div>`}</div>`;
  }

  function renderPrint() {
    if (!canPrintReports()) return `<section class="feature-locked"><i>▤</i><h2>Print & Export hidden</h2><p>The Administrator has not enabled this feature for your Traveller ID.</p></section>`;
    const planCard = canViewItinerary() || canViewExperiences() ? `<article class="print-card"><i>▦</i><h3>Itinerary & experiences</h3><p>Print the plan and experience notes currently available to you.</p><button data-print="plan">Print itinerary →</button></article>` : "";
    const itineraryCard = canViewItinerary() ? `<article class="print-card"><i>▦</i><h3>Itinerary only</h3><p>A clean day-by-day table with a tick column — carry it before the trip for easy management.</p><button data-print="itinerary">Print itinerary →</button></article>` : "";
    const expenseCard = canViewExpenses() ? `<article class="print-card"><i>₹</i><h3>Expenses only</h3><p>Budget summary and every expense entry.</p><button data-print="expenses">Print expenses →</button></article>` : "";
    return `${heading("READY FOR PAPER", "Print and export", "Create a clean A4 copy or save allowed reports as PDF.")}<div class="print-grid">${itineraryCard}${planCard}${expenseCard}<article class="print-card"><i>▤</i><h3>Available trip book</h3><p>Only the sections enabled by the Administrator are included.</p><button data-print="full">Print available sections →</button></article></div>`;
  }

  function skeletonView() {
    return `<div class="skeleton-view" aria-hidden="true"><div class="skeleton-head"></div>${[0,1,2,3,4].map(() => `<div class="skeleton-row"><i></i><i></i><i></i><i></i></div>`).join("")}</div>`;
  }

  function showSkeleton() { if ($("#view")) $("#view").innerHTML = skeletonView(); }

  function render() {
    if (!state.data) return;
    const renderers = { overview: renderOverview, itinerary: renderItinerary, experiences: renderExperiences, photos: renderPhotos, places: renderPlaces, expenses: renderExpenses, people: renderPeople, print: renderPrint };
    $("#view").innerHTML = accessNotice() + renderers[state.tab]();
    if (state.tab === "itinerary") { bindPlanColumnResizers(); bindPlanRowDragging(); }
    const printMenu = $(".plan-print-menu");
    if (printMenu) printMenu.addEventListener("toggle", () => { state.printMenuOpen = printMenu.open; });
  }

  function handleViewClick(event) {
    const button = event.target.closest("button,[data-map]");
    if (!button || !$("#view").contains(button)) return;
    if (button.dataset.go) return setTab(button.dataset.go);
    if (button.dataset.add) return showAddModal(button.dataset.add);
    if (button.dataset.print) return printReport(button.dataset.print);
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
    if (button.dataset.sortPlanTime !== undefined) return sortPlansByTime(button.dataset.sortPlanTime);
    if (button.dataset.planPay) return showPlanPayment(button.dataset.planPay);
    if (button.dataset.togglePlanDone) return togglePlanDone(button.dataset.togglePlanDone);
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

  function setStickyControlsVisible(visible) {
    makeStickyTabDraggable();
    const tab = $("#stickyEdgeTab");
    tab.classList.toggle("draggable", isAdmin());
    tab.classList.toggle("hidden", !visible);
    if (visible) applyStickyTabPosition();
    if (!visible) closeStickyPanel();
    renderStickyNotes();
  }

  function openStickyPanel() {
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
    return `<article class="floating-sticky colour-${esc(note.colour)}" data-floating-sticky="${esc(note.id)}" style="left:${Math.round(safeX)}px;top:${Math.round(safeY)}px;width:${Math.round(safeWidth)}px;height:${Math.round(safeHeight)}px"><header class="sticky-drag-handle" data-sticky-drag="${esc(note.id)}"><span>${canWriteStickyNotes() ? "↕ Move note" : "📌 Pinned for everyone"}</span>${canWriteStickyNotes() ? `<button data-sticky-pin="${esc(note.id)}" title="Unpin and return to panel">×</button>` : ""}</header><div class="floating-sticky-content"><small>${esc(note.type)} · ${esc(stickyDueText(note))}</small><h3${inline("title")}>${esc(note.title)}</h3><p${inline("body")}>${stickyBodyHtml(note)}</p></div>${canWriteStickyNotes() ? `<footer><button data-sticky-complete="${esc(note.id)}">✓ Complete</button><button data-sticky-edit="${esc(note.id)}">Edit</button><button data-sticky-autofit="${esc(note.id)}">Auto-fit</button></footer>` : ""}</article>`;
  }

  function renderStickyNotes() {
    if (!$("#stickyActiveList")) return;
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
    const layer = $("#floatingStickyLayer");
    layer.classList.toggle("hidden", !state.data || !pinned.length);
    layer.innerHTML = pinned.map(floatingStickyCard).join("");
    bindStickyActions();
    bindStickyFrontmost();
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
        closeModal(); await openTrip(bundle, pin, true, traveller ? traveller.name : summary.createdBy, role, traveller ? traveller.travellerId : "", traveller ? "personal" : "admin");
      } else {
        const payload = { tripId, username: state.accountUsername, password: pin, pin, ...(traveller ? { travellerId: traveller.travellerId } : {}) };
        const cached = readCachedTrip(tripId);
        if (cached && !traveller) {
          closeModal();
          await openTrip(cached.data, pin, false, cached.meta.name, cached.meta.role, cached.meta.travellerId || "", cached.meta.loginMode || "admin");
          toast("Showing your saved copy · refreshing…");
          api("getTrip", payload).then((fresh) => {
            if (!fresh || !fresh.trip || String(fresh.trip.tripId) !== String(tripId)) return;
            state.data = normalize(fresh); state.permissions = fresh.permissions || {};
            cacheTripBundle(fresh, cached.meta);
            loadStickyNotes(); hydrateShell(); render(); updatePrintArea(); stickyRefreshAt = Date.now();
          }).catch(() => {});
          return;
        }
        showSkeleton();
        const bundle = await api("getTrip", payload);
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
    const items = visibleLibraryTrips(trips);
    $("#accountHubContent").innerHTML = `<section class="account-hub-shell"><div class="account-hub-hero admin"><div><span>ACCOUNT DASHBOARD</span><h1>All trips in one place</h1><p>Signed in as <b>${esc(state.accountUsername)}</b>. Open and manage every trip, traveller and permission from here.</p></div><strong>${items.length} ${items.length === 1 ? "TRIP" : "TRIPS"}</strong></div><div class="all-trips-modal"><div class="all-trips-summary"><span><small>ADMINISTRATOR LIBRARY</small><b>${items.length} ${items.length === 1 ? "trip" : "trips"}</b></span><span class="summary-actions"><button id="changeAdministratorLogin" class="secondary-action" type="button">⚿ Change login</button><button id="idleSignoutSetting" class="secondary-action" type="button">⏻ Auto sign-out: ${idleLabel(idleMinutes)}</button><button id="manageTravellerAccounts" class="secondary-action" type="button">♙ Traveller profiles</button>${hiddenTripsBar(trips)}<button id="resetTripOrder" class="secondary-action" type="button">↕ Reset order</button><button id="createFromTrips" type="button">＋ Create trip</button></span></div><div class="trip-library admin-library">${items.map((trip, position) => `<article class="trip-library-card ${tripEnabled(trip) ? "" : "disabled-trip"}">${tripCardTools(trip, position, items.length)}<i>⌖</i><div class="trip-card-copy"><span class="trip-code">TRIP ID · ${esc(trip.tripId)}</span><h3>${esc(trip.name)}</h3><p>${esc(trip.destination)} · ${displayDate(trip.startDate, { day: "numeric", month: "short", year: "numeric" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}</p><small>Budget ${money.format(Number(trip.budget || 0))} · Spent ${money.format(Number(trip.spent || 0))} · Organiser ${esc(trip.createdBy || "—")}</small><small>${Number(trip.travellerCount || 0)} members · ${Number(trip.assignedTravellerCount || 0)} assigned profiles${trip.updatedAt ? ` · Updated ${displayDate(String(trip.updatedAt).slice(0, 10))}` : ""}</small><b class="status-pill ${tripEnabled(trip) ? "active" : "disabled"}">${tripEnabled(trip) ? "ACTIVE" : "DISABLED"}</b></div><div class="trip-card-actions"><button data-open-admin-trip="${esc(trip.tripId)}" type="button">Open</button><button data-edit-listed-trip="${esc(trip.tripId)}" type="button">Edit</button><button data-assign-trip="${esc(trip.tripId)}" type="button">Travellers</button><button data-toggle-trip="${esc(trip.tripId)}" data-enabled="${tripEnabled(trip)}" type="button">${tripEnabled(trip) ? "Disable" : "Enable"}</button><button class="danger-link" data-delete-trip="${esc(trip.tripId)}" type="button">Delete</button></div></article>`).join("") || `<div class="empty-trips"><b>No trips yet</b><p>Create your first trip with this Administrator account.</p></div>`}</div><p class="global-access-note">◆ This Administrator username and password control every trip. Traveller profiles can exist without a trip assignment.</p></div></section>`;
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
    $("#accountHubContent").innerHTML = `<section class="account-hub-shell"><div class="account-hub-hero traveller"><div><span>MY TRAVEL DASHBOARD</span><h1>Every permitted trip</h1><p>Signed in as <b>${esc(traveller.travellerId)}</b>. Open a trip to view and manage every feature allowed by the Administrator.</p></div><strong>${trips.length} ${trips.length === 1 ? "TRIP" : "TRIPS"}</strong></div><div class="all-trips-modal"><div class="self-profile-card"><i>${esc(initials(traveller.name))}</i><div><span>USERNAME · ${esc(traveller.travellerId)}</span><h3>${esc(traveller.name)}</h3><p>${[traveller.phone, traveller.email, traveller.city].filter(Boolean).map(esc).join(" · ") || "Personal traveller profile"}</p></div><b class="${canCreateAnotherTrip ? "trip-creation-allowed" : ""}">${travellerTripQuotaLabel(quota)}</b></div><div class="profile-trip-heading self"><div><span class="kicker">ALL MY TRIPS</span><h3>Trips available with this account</h3></div>${canCreateAnotherTrip ? `<button id="createTravellerTrip" type="button">＋ Create trip (${quota.remaining} left)</button>` : ""}</div><div class="trip-library">${tripCards || `<div class="empty-trips"><b>No active trips assigned</b><p>${canCreateAnotherTrip ? "Create a new trip using the button above." : `Ask the Administrator to assign trips or increase the creation limit for username ${esc(traveller.travellerId)}.`}</p></div>`}</div><p class="global-access-note">♙ ${canCreateTrips ? (canCreateAnotherTrip ? `The Global Administrator allows up to ${quota.limit} created ${quota.limit === 1 ? "trip" : "trips"}; ${quota.remaining} ${quota.remaining === 1 ? "slot remains" : "slots remain"}.` : `Your creation limit is ${quota.limit}; existing trips are preserved, but no new trip can be created until the Administrator increases the limit.`) : "Trip creation is disabled. This account still shows every active trip assigned now or in the future."}</p></div></section>`;

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
    showModal("Traveller profiles", `<div class="traveller-manager"><div class="all-trips-summary"><span><small>PERMANENT TRAVELLER DIRECTORY</small><b>${travellers.length} profiles</b></span><span class="summary-actions"><button id="backToAllTrips" class="secondary-action" type="button">← All trips</button><button id="createTravellerAccount" type="button">＋ Add traveller</button></span></div><p class="directory-note">Use <b>Trip limit</b> to cap, increase, reduce or disable how many trips a traveller may create. Assigned trips do not consume this limit.</p><div class="account-list">${travellers.map((traveller) => `<article class="account-card ${traveller.active ? "" : "inactive"}"><span class="account-avatar">${esc(initials(traveller.name))}</span><div class="account-profile"><span>${esc(traveller.travellerId)}</span><h3>${esc(traveller.name)}</h3><p>${[traveller.phone, traveller.email].filter(Boolean).map(esc).join(" · ") || "Contact details not added"}</p><small>${[traveller.city, traveller.emergencyContact ? `Emergency: ${traveller.emergencyContact}` : ""].filter(Boolean).map(esc).join(" · ") || "City and emergency contact not added"}</small><div class="account-trip-status ${Number(traveller.tripCount || 0) ? "assigned" : "unassigned"}">${Number(traveller.tripCount || 0) ? `${Number(traveller.tripCount)} assigned ${Number(traveller.tripCount) === 1 ? "trip" : "trips"}: ${(traveller.tripIds || []).map(esc).join(", ")}` : "NO TRIP ASSIGNED"}</div></div><div class="account-actions"><button data-view-account="${esc(traveller.travellerId)}">View profile</button><button data-account-trips="${esc(traveller.travellerId)}">Assign trips</button><button class="pin-account-control" data-edit-account-login="${esc(traveller.travellerId)}">✎ Edit login</button><button class="global-profile-control" data-toggle-account="${esc(traveller.travellerId)}" data-active="${Boolean(traveller.active)}">${traveller.active ? "Disable everywhere" : "Enable profile"}</button><button class="delete-profile-control" data-delete-account="${esc(traveller.travellerId)}">Delete profile</button></div></article>`).join("") || `<div class="empty-trips"><b>No traveller profiles</b><p>Add a traveller profile now. A trip does not need to be assigned.</p></div>`}</div></div>`);
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
    showModal("Traveller profile", `<div class="traveller-profile-view"><div class="profile-hero"><i>${esc(initials(traveller.name))}</i><div><span>${esc(traveller.travellerId)}</span><h2>${esc(traveller.name)}</h2><p>${traveller.active ? "Active personal access" : "Inactive personal access"}</p></div></div><div class="profile-detail-grid"><span><small>PHONE</small><b>${esc(traveller.phone || "Not added")}</b></span><span><small>EMAIL</small><b>${esc(traveller.email || "Not added")}</b></span><span><small>CITY</small><b>${esc(traveller.city || "Not added")}</b></span><span><small>EMERGENCY CONTACT</small><b>${esc(traveller.emergencyContact || "Not added")}</b></span></div>${traveller.notes ? `<div class="profile-notes"><small>NOTES</small><p>${esc(traveller.notes)}</p></div>` : ""}<div class="profile-trip-heading"><div><span class="kicker">ALLOWED TRIPS</span><h3>${allowed.length} ${allowed.length === 1 ? "trip" : "trips"} in this profile</h3></div><button id="profileAssignTrips" type="button">Manage trips</button></div><div class="profile-trip-list">${allowed.map((trip) => `<article><div><span>TRIP ID · ${esc(trip.tripId)}</span><h4>${esc(trip.name)}</h4><p>${esc(trip.destination)} · ${displayDate(trip.startDate, { day: "numeric", month: "short", year: "numeric" })}–${displayDate(trip.endDate, { day: "numeric", month: "short", year: "numeric" })}</p></div><b class="status-pill ${tripEnabled(trip) ? "active" : "disabled"}">${tripEnabled(trip) ? "ACTIVE" : "DISABLED"}</b></article>`).join("") || `<div class="empty-profile-trips"><b>No trip assigned</b><p>This permanent profile is ready. Trips can be added later.</p></div>`}</div><div class="form-actions profile-actions"><button id="profileBack" type="button">← Back</button><button id="profileTripLimit" type="button">Trip limit</button><button id="profileEdit" type="button">Edit details</button><button id="profileEditLogin" class="pin-primary-action" type="button">✎ Edit login</button></div></div>`);
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
    showModal("Traveller accounts created", `<div class="created-access"><div class="success-note"><b>✓ ${accessRows.length} traveller ${accessRows.length === 1 ? "account" : "accounts"} created</b><p>Give each traveller only their own username and password. Passwords are shown once on this screen.</p></div><div class="created-access-list">${accessRows.map((item) => `<article><i>${esc(initials(item.name))}</i><div><h3>${esc(item.name)}</h3><span>USERNAME <b>${esc(item.travellerId)}</b></span><span>PASSWORD <b>${esc(item.pin)}</b></span><span>ASSIGNED TRIP <b>${esc(state.data.trip.tripId)}</b></span></div></article>`).join("")}</div><div class="form-actions"><button id="copyTravellerAccess" type="button">Copy all account details</button><button id="finishTravellerAccess" type="button">Done</button></div></div>`);
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
    form.querySelector(".feature-access-actions").insertAdjacentHTML("beforebegin", `<label class="sticky-level-control"><span><b>Pinned sticky notes</b><small>Everyone sees the pinned board. Choose whether this traveller may edit it.</small></span><select name="stickyAccess">${stickyLevels.map((level) => `<option value="${level}" ${currentStickyLevel === level ? "selected" : ""}>${stickyAccessLabel(level)}</option>`).join("")}</select></label><label class="photo-limit-control"><span><b>Maximum photos this traveller may add</b><small>${currentPhotoCount} currently stored · enter 0 to disable photo addition for this traveller · maximum 50</small></span><input name="photoLimit" type="number" min="0" max="50" step="1" value="${currentPhotoLimit}" required></label>`);
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
          await api("setTravellerPhotoLimit", authPayload({ travellerId: member.travellerId, limit: photoLimit }));
        }
        assignment.photoLimit = photoLimit;
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

  function validateGalleryPhotoFile(file) {
    if (!file) throw new Error("Choose a photo from this device.");
    if (file.size > 3145728) throw new Error("Trip photo must be smaller than 3 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  }

  function readPhotoFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result || "").split(",")[1] || "" });
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.readAsDataURL(file);
    });
  }

  function showTripGalleryPhotoEditor(photo = null) {
    if (!isAdmin() && (!state.travellerId || (photo ? !mayReplacePhoto(photo) : state.permissions.addPhotos !== true))) return toast("Photo addition or replacement is not allowed for this account", true);
    const replacing = Boolean(photo);
    showModal(replacing ? "Replace trip photo" : "Add trip photo", `<form class="modal-form trip-gallery-photo-form" id="tripGalleryPhotoForm"><div class="security-note traveller-note"><i>▣</i><p>${replacing ? "The new image will replace this photo without using another allowance slot." : "Upload one selected trip photo. It will be stored in Google Drive."} JPEG, PNG or WebP · maximum 3 MB.</p></div>${replacing ? `<div class="photo-preview"><img src="${esc(photo.photoUrl)}" alt="Current photo"></div>` : ""}<label>${replacing ? "Replacement photo" : "Photo from this device"}<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp" required></label><label>Caption <small>(optional)</small><input name="caption" maxlength="240" value="${esc(photo?.caption || "")}" placeholder="What should everyone remember about this photo?"></label><p class="form-help">Travellers can replace only their own photos. The Administrator can replace any photo.</p><div class="form-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${replacing ? "Replace photo" : "Save photo"}</button></div></form>`);
    const form = $("#tripGalleryPhotoForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = form.elements.photoFile.files[0];
      const caption = String(form.elements.caption.value || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      try {
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
    showModal("Trip photo", `<div class="trip-photo-view"><img src="${esc(photo.photoUrl)}" alt="${esc(photo.caption || "Trip photo")}"><div><span>TRIP MEMORY</span><h3>${esc(photo.caption || "A trip memory")}</h3><p>Uploaded by <b>${esc(photo.uploadedBy || "Trip member")}</b>${photo.createdAt ? ` · ${displayDate(String(photo.createdAt).slice(0, 10))}` : ""}</p></div><div class="form-actions"><button type="button" data-cancel>Close</button>${mayReplacePhoto(photo) ? `<button id="replaceViewedPhoto" type="button">Replace</button>` : ""}</div></div>`);
    $('[data-cancel]').addEventListener("click", closeModal);
    if ($("#replaceViewedPhoto")) $("#replaceViewedPhoto").addEventListener("click", () => showTripGalleryPhotoEditor(photo));
  }

  function showDeleteTripGalleryPhoto(photo) {
    if (!photo || !mayManagePhoto(photo)) return toast("You can delete only photos that you uploaded", true);
    showModal("Delete trip photo", `<div class="delete-confirmation"><div class="danger-note"><b>Delete this photo?</b><p>The image will be moved to Google Drive trash and removed from the TripPhotos Google Sheet.</p></div><div class="photo-preview"><img src="${esc(photo.photoUrl)}" alt="${esc(photo.caption || "Trip photo")}"></div><div class="form-actions"><button type="button" data-cancel>Cancel</button><button class="danger-button" id="confirmTripPhotoDelete" type="button">Delete photo</button></div></div>`);
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
    showModal(current ? "Change trip photo" : "Add trip photo", `<form class="modal-form" id="tripPhotoForm"><div class="security-note traveller-note"><i>▣</i><p>Upload a JPEG, PNG or WebP photo up to 3 MB. It will be stored in your Google Drive by the MyTrip backend. You can alternatively paste a public HTTPS image link.</p></div><label>Upload from this device<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="or"><span>or</span></div><label>Public photo link <small>(optional)</small><input name="photoUrl" type="url" value="${esc(current)}" placeholder="https://…"></label>${current ? `<div class="photo-preview"><img src="${esc(tripPhotoUrl(current))}" alt="Current trip photo"></div>` : ""}<div class="form-actions">${current ? `<button type="button" id="removeTripPhoto" class="danger-link">Remove photo</button>` : `<button type="button" data-cancel>Cancel</button>`}<button type="submit">Save photo</button></div></form>`);
    const form = $("#tripPhotoForm");
    const savePhoto = async () => {
      try {
        const file = form.elements.photoFile.files[0];
        const photoUrl = String(form.elements.photoUrl.value || "").trim();
        if (!file && !photoUrl) return toast("Choose a photo file or enter a public photo link", true);
        if (file && file.size > 3145728) return toast("Trip photo must be smaller than 3 MB", true);
        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast("Choose a JPEG, PNG or WebP photo", true);
        if (photoUrl && !/^https:\/\//i.test(photoUrl)) return toast("Trip photo link must start with https://", true);
        let savedUrl = photoUrl;
        if (file) {
          if (state.demoMode) savedUrl = URL.createObjectURL(file);
          else {
            const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Could not read that photo")); reader.readAsDataURL(file); });
            const result = await api("uploadTripPhoto", authPayload({ file: { name: file.name, type: file.type, data: dataUrl.split(",")[1] || "" } }));
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
    if (type === "plan") showModal("Add to itinerary", `<form class="modal-form" data-form="plan"><label>Plan title<input name="title" placeholder="e.g. Sunset cruise" required></label><div class="form-row"><label>Date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(state.data.trip.startDate)}" required></label><label>Time<input name="time" type="time" value="10:00" required></label></div><label>Place<input name="place" placeholder="Place or address" required></label><label>Planning note<textarea name="notes" rows="3" placeholder="Tickets, reminders, meeting point or other preparation"></textarea></label><details class="plan-extra-fields"><summary>Optional booking detail</summary><div class="form-row"><label>Category<select name="category"><option value="">—</option>${planCategories.map((value) => `<option>${value}</option>`).join("")}</select></label><label>Status<select name="status"><option value="">—</option>${planStatuses.map((value) => `<option${value === "To book" ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="form-row"><label>Booking reference<input name="bookingRef" maxlength="80" placeholder="PNR / confirmation"></label><label>Planned cost (₹)<input name="cost" type="number" min="0" step="1" placeholder="0"></label></div></details>${actions}</form>`);
    if (type === "experience") {
      const writer = state.currentUser === "Traveller" ? "" : state.currentUser;
      const writerNames = [...new Set(visibleTripMembers().map((member) => member.name).filter(Boolean))];
      showModal("Add experience note", `<form class="modal-form" data-form="experience"><div class="security-note traveller-note"><i>✍</i><p>This note will appear below the itinerary and in the printed trip book with the writer’s name.</p></div><div class="form-row"><label>Experience date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(state.data.trip.startDate)}" required></label><label>Place <small>(optional)</small><input name="place" maxlength="180" placeholder="e.g. Padmanabhaswamy Temple"></label></div><label>Experience note<textarea name="note" rows="5" maxlength="4000" placeholder="What happened? What did you enjoy, learn or want to remember?" required></textarea></label><label>Written by<input name="writer" list="experienceWriterNames" maxlength="80" value="${esc(writer)}" placeholder="Enter the writer’s name" required><datalist id="experienceWriterNames">${writerNames.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist></label>${actions}</form>`);
    }
    if (type === "place") showModal("Save a place", `<form class="modal-form" data-form="place"><label>Place name<input name="name" placeholder="e.g. Dudhsagar Falls" required></label><label>Area or address<input name="area" placeholder="Goa" required></label><div class="form-row"><label>Category<select name="category"><option>Beach</option><option>Food</option><option>Culture</option><option>Nature</option><option>Shopping</option><option>Stay</option></select></label><label>Plan for<select name="plannedDay"><option>Unplanned</option><option>Day 1</option><option>Day 2</option><option>Day 3</option><option>Day 4</option><option>Day 5</option></select></label></div>${actions}</form>`);
    if (type === "expense") { const payers = visibleTripMembers(); showModal("Add an expense", `<form class="modal-form" data-form="expense"><label>What was it for?<input name="label" placeholder="e.g. Dinner at Fisherman’s Wharf" required></label><div class="form-row"><label>Amount (₹)<input name="amount" type="number" min="1" step="0.01" required></label><label>Date<input name="date" type="date" value="${esc(state.data.trip.startDate)}" required></label></div><div class="form-row"><label>Category<select name="category"><option>Food</option><option>Stay</option><option>Travel</option><option>Local travel</option><option>Activities</option><option>Shopping</option><option>Other</option></select></label><label>Paid by<select name="paidBy">${(payers.length ? payers : [{ name: state.currentUser }]).map((member) => `<option>${esc(member.name)}</option>`).join("")}</select></label></div>${actions}</form>`); }
    if (type === "traveller") showModal("Add a traveller", `<form class="modal-form" data-form="member"><label>Name<input name="name" placeholder="Traveller’s name" required></label><label>Access role<select name="role"><option>Editor</option><option>Viewer</option></select></label>${actions}</form>`);
    const form = $('[data-form]'); if (form) form.addEventListener("submit", saveForm); const cancel = $('[data-cancel]'); if (cancel) cancel.addEventListener("click", closeModal);
  }

  async function saveForm(event) {
    event.preventDefault();
    const form = event.currentTarget, type = form.dataset.form, values = Object.fromEntries(new FormData(form).entries());
    if (!canAdd(type)) return toast("Global Administrator access required for this action", true);
    const record = { id: uid(), ...values }; if (type === "expense") record.amount = Number(record.amount);
    if (type === "plan") { record.cost = Number(record.cost) > 0 ? Number(record.cost) : ""; record.sortOrder = nextPlanSortOrder(record.date); }
    record.createdBy = type === "experience" ? values.writer : state.currentUser;
    const collection = { plan: "itinerary", place: "places", expense: "expenses", experience: "experiences", member: "members" }[type];
    try {
      if (!state.demoMode) await api(`add${type[0].toUpperCase()}${type.slice(1)}`, authPayload({ record }));
      state.data[collection].push(record); closeModal(); render(); hydrateShell(); updatePrintArea(); toast(type === "experience" ? `Experience note saved · Written by ${values.writer}` : `${type === "member" ? "Traveller" : type[0].toUpperCase() + type.slice(1)} saved for everyone`);
    } catch (error) { toast(error.message, true); }
  }

  function showInvite() {
    if (!isAdmin()) return toast("Global Administrator access required to invite travellers", true);
    const inviteParams = new URLSearchParams({ trip: state.data.trip.tripId });
    if (!validApiUrl(config.API_URL) && apiUrlReady()) inviteParams.set("api", apiUrl);
    const link = `${location.origin}${location.pathname}?${inviteParams.toString()}`;
    showModal("Invite your travel group", `<div class="invite-box"><p>Share this link and only this trip’s Traveller PIN. Never share the global Administrator password/PIN.</p><div class="copy-field"><input id="inviteLink" value="${esc(link)}" readonly><button id="copyInvite">Copy</button></div><div class="pin-box"><span>TRIP CODE<b>${esc(state.data.trip.tripId)}</b></span><span>TRAVELLER PIN<b>••••</b></span></div><small>The Traveller PIN is different for each trip and is not displayed after creation.</small></div>`);
    $("#copyInvite").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); } catch {} toast("Invite link copied"); });
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

  function showEditRecord(sheet, id) {
    if (!canEditRecords(sheet)) return toast("The Administrator has hidden this feature for your Traveller ID", true);
    const collection = { Itinerary: "itinerary", ExperienceNotes: "experiences", Places: "places", Expenses: "expenses" }[sheet];
    const record = collection && state.data[collection].find((item) => String(item.id) === String(id));
    if (!record) return toast("Record not found", true);
    let fields = "";
    if (sheet === "Itinerary") fields = `<label>Plan title<input name="title" value="${esc(record.title)}" required></label><div class="form-row"><label>Date<input name="date" type="date" value="${esc(record.date)}" required></label><label>Time<input name="time" type="time" value="${esc(record.time)}"></label></div><label>Place<input name="place" value="${esc(record.place || "")}"></label><label>Planning note<textarea name="notes" rows="3">${esc(record.notes || "")}</textarea></label><details class="plan-extra-fields"><summary>Optional booking detail</summary><div class="form-row"><label>Category<select name="category"><option value="">—</option>${planCategories.map((value) => `<option${record.category === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Status<select name="status"><option value="">—</option>${planStatuses.map((value) => `<option${record.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="form-row"><label>Booking reference<input name="bookingRef" maxlength="80" value="${esc(record.bookingRef || "")}"></label><label>Planned cost (₹)<input name="cost" type="number" min="0" step="1" value="${esc(record.cost || "")}"></label></div></details>`;
    if (sheet === "ExperienceNotes") fields = `<div class="form-row"><label>Experience date<input name="date" type="date" min="${esc(state.data.trip.startDate)}" max="${esc(state.data.trip.endDate)}" value="${esc(record.date)}" required></label><label>Place <small>(optional)</small><input name="place" maxlength="180" value="${esc(record.place || "")}"></label></div><label>Experience note<textarea name="note" rows="5" maxlength="4000" required>${esc(record.note || "")}</textarea></label><label>Written by<input name="writer" maxlength="80" value="${esc(record.writer || "")}" required></label>`;
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
    try {
      if (!state.demoMode) await api("deleteRecord", authPayload({ sheet, id }));
      state.data[collection] = state.data[collection].filter((item) => String(item.id) !== String(id));
      if (sheet === "Expenses" && String(state.expenseRowEditId) === String(id)) state.expenseRowEditId = "";
      hydrateShell(); render(); updatePrintArea(); toast("Record deleted by administrator");
    } catch (error) { toast(error.message, true); }
  }

  function buildPrintArea() {
    if (!state.data) return; const budget = Number(state.data.trip.budget || 0), members = visibleTripMembers();
    const printedExperiences = [...state.data.experiences].sort((a,b)=>`${a.date}${a.createdAt || ""}`.localeCompare(`${b.date}${b.createdAt || ""}`)).map((item) => `<article><time>${displayDate(item.date, { weekday:"short", day:"2-digit", month:"short" })}</time><div><h3>${esc(item.place || "Trip experience")}</h3><p>${esc(item.note)}</p><strong>Written by ${esc(item.writer || "Trip member")}</strong></div></article>`).join("");
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
    const expenseSection = canViewExpenses() ? `<section class="print-expenses"><h2>Expense statement</h2><div class="print-totals"><span><small>Budget</small><b>${money.format(budget)}</b></span><span><small>Spent</small><b>${money.format(spent())}</b></span><span><small>Balance</small><b>${money.format(remaining())}</b></span></div><div class="print-traveller-totals"><h3>Traveller-wise expense totals</h3><table class="print-expense-table"><thead><tr><th>Traveller</th><th>Payments</th><th>Total paid</th></tr></thead><tbody>${printedTravellerTotals || `<tr><td colspan="3">No traveller expenses recorded.</td></tr>`}</tbody></table></div><h3>Detailed expense statement</h3><table class="print-expense-table"><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Paid by</th><th>Amount</th></tr></thead><tbody>${state.data.expenses.map((expense) => `<tr><td>${displayDate(expense.date)}</td><td>${esc(expense.label)}</td><td>${esc(expense.category)}</td><td>${esc(expense.paidBy)}</td><td>${money.format(expense.amount)}</td></tr>`).join("")}</tbody></table></section>` : "";
    $("#printArea").innerHTML = `${photo ? `<img class="print-cover-photo" src="${esc(photo)}" alt="Trip cover photo">` : ""}<header><div><span class="kicker">MYTRIP · TRIP BOOK · FRONTEND v${frontendVersion}</span><h1>${esc(state.data.trip.name)}</h1><p>${displayDate(state.data.trip.startDate)}–${displayDate(state.data.trip.endDate)}${memberText}</p></div><b>${esc(state.data.trip.tripId)}</b></header>${planSection}${experienceSection}${expenseSection}`;
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
  if ($("#stickyRecallButton")) $("#stickyRecallButton").addEventListener("click", recallPinnedStickyNotes);
  if ($("#stickyRefreshButton")) $("#stickyRefreshButton").addEventListener("click", () => refreshStickyNotes(true));
  if ($("#textSizeDown")) $("#textSizeDown").addEventListener("click", () => stepTextScale(-1));
  if ($("#textSizeUp")) $("#textSizeUp").addEventListener("click", () => stepTextScale(1));
  applyTextScale();
  $("#clearAppCache").addEventListener("click", clearAppCacheAndReload);
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
  addEventListener("pagehide", () => { state.pin = ""; stopIdleTimer(); });
  addEventListener("pageshow", (event) => { if (event.persisted && state.authenticated) performLogout("Page restored securely. Please log in again."); });

  const inviteQuery = new URLSearchParams(location.search);
  const invitedApi = inviteQuery.get("api");
  if (!validApiUrl(config.API_URL) && validApiUrl(invitedApi)) { apiUrl = invitedApi; saveStoredApiUrl(apiUrl); }
  updateBackendStatus();
  updateConnectionStatus();
  updateHeaderDateTime();
  setInterval(() => { if (!document.hidden) updateHeaderDateTime(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateHeaderDateTime(); });
  restoreSavedAccountLogin();
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
