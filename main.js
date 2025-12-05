// ========= Konfiguration (ANPASSEN) =========
const CLIENT_ID = "DEINE_CLIENT_ID_AUS_APP_REGISTRIERUNG";
const TENANT = "common";                                 // für Personal + Work/School
const REDIRECT_URI = "https://<fluffy giggle>.github.dev/"; // dieselbe Seite
const SCOPES = ["Files.ReadWrite", "offline_access", "User.Read"]; // delegierte Berechtigungen

// OneDrive-Dateipfade (CSV pro Person)
const BASE = "https://graph.microsoft.com/v1.0/me/drive/root:";
const MY_FILE = "/SharedLocations/lukas.csv";            // deine Datei
const OTHER_FILE = "/SharedLocations/nele.csv";        // Datei der anderen Person

// ========= PKCE-Hilfsfunktionen =========
function base64url(a) {
  return btoa(String.fromCharCode(...new Uint8Array(a)))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
async function sha256(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return base64url(buf);
}
// Einfacher zufälliger Code Verifier
function randomVerifier(len = 64) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  let out = ""; for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// ========= OAuth 2.0 Autorisieren (Code Flow mit PKCE) =========
async function loginWithPKCE() {
  const codeVerifier = randomVerifier();
  const codeChallenge = await sha256(codeVerifier);
  sessionStorage.setItem("code_verifier", codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`;
  window.location = AUTH_URL;
}

// Aufruf auf /auth-callback: Code gegen Token tauschen
async function handleAuthCallback() {
  const qs = new URLSearchParams(window.location.search);
  const code = qs.get("code");
  if (!code) return;

  const codeVerifier = sessionStorage.getItem("code_verifier");
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier
  });
  const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
  });
  if (!res.ok) { alert("Tokenabruf fehlgeschlagen"); return; }
  const token = await res.json();
  localStorage.setItem("access_token", token.access_token);
  if (token.refresh_token) localStorage.setItem("refresh_token", token.refresh_token);
  // zurück zur Hauptseite (ohne ?code)
  window.location.replace("/");
}

// Access-Token holen
function getAccessToken() {
  const t = localStorage.getItem("access_token");
  if (!t) throw new Error("Nicht angemeldet. Bitte 'Anmelden' klicken.");
  return t;
}

// ========= OneDrive-CSV: lesen/schreiben über Content-API =========
// (Graph verlangt immer Authorization: Bearer {token}) [3](https://www.linkedin.com/pulse/power-apps-pricing-overview-chaitanya-kanumukula-hg43e)[1](https://powerappsguide.com/blog/post/cheapest-way-to-use-dataverse-with-power-apps-2025)
async function putCsv(path, csvText) {
  const res = await fetch(`${BASE}${encodeURI(path)}:/content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "text/plain" },
    body: csvText
  });
  if (!res.ok) throw new Error("PUT " + res.status);
}
async function getCsv(path) {
  const res = await fetch(`${BASE}${encodeURI(path)}:/content`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  if (!res.ok) throw new Error("GET " + res.status);
  return await res.text();
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const keys = lines[0].split(","); const vals = lines[1].split(",");
  const obj = {};
  keys.forEach((k,i)=> obj[k] = vals[i]);
  obj.lat = parseFloat(obj.lat); obj.lon = parseFloat(obj.lon);
  return obj; // {lat, lon, updated}
}
function toCsv(lat, lon) {
  return `lat,lon,updated\n${lat},${lon},${new Date().toISOString()}`;
}

// ========= Haversine-Entfernung =========
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => (d*Math.PI)/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ========= Geolocation (Foreground) =========
// Läuft zuverlässig nur im Vordergrund (App offen halten). [4](https://www.webdevstory.com/onedrive-integration-react/)
function startTracking() {
  if (!("geolocation" in navigator)) { alert("Geolocation nicht verfügbar"); return; }
  navigator.geolocation.watchPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    document.getElementById("myPos").textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    // Eigene CSV schreiben
    await putCsv(MY_FILE, toCsv(lat, lon));

    // Andere lesen
    try {
      const otherText = await getCsv(OTHER_FILE);
      const other = parseCsv(otherText);
      if (other) {
        document.getElementById("otherPos").textContent =
          `${other.lat.toFixed(5)}, ${other.lon.toFixed(5)}`;
        const dist = haversineKm(lat, lon, other.lat, other.lon);
        document.getElementById("distance").textContent = dist.toFixed(2) + " km";
        document.getElementById("otherTime").textContent =
          new Date(other.updated).toLocaleString();
      }
    } catch(e) {
      // andere.csv evtl. noch nicht vorhanden
      console.warn("Andere Position noch nicht verfügbar:", e.message);
    }
  }, err => {
    console.error(err);
    alert("Standort kann nicht abgerufen werden. Bitte Berechtigungen prüfen.");
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
}

// ========= UI-Events binden =========
document.getElementById("loginBtn").addEventListener("click", loginWithPKCE);
document.getElementById("refreshBtn").addEventListener("click", async () => {
  try {
    const myText = await getCsv(MY_FILE);
    const me = parseCsv(myText);
    const otherText = await getCsv(OTHER_FILE);
    const other = parseCsv(otherText);
    if (me && other) {
      document.getElementById("myPos").textContent =
        `${me.lat.toFixed(5)}, ${me.lon.toFixed(5)}`;
      document.getElementById("otherPos").textContent =
        `${other.lat.toFixed(5)}, ${other.lon.toFixed(5)}`;
      const dist = haversineKm(me.lat, me.lon, other.lat, other.lon);
      document.getElementById("distance").textContent = dist.toFixed(2) + " km";
      document.getElementById("otherTime").textContent =
        new Date(other.updated).toLocaleString();
    }
  } catch(e) { alert("Aktualisierung fehlgeschlagen: " + e.message); }
});

// ========= Bootstrapping =========
if (window.location.pathname === "/auth-callback") {
  // Token holen & zurück zur Startseite
  handleAuthCallback();
} else {
  // Service Worker registrieren (optional)
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
}
