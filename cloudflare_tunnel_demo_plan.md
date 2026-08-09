# 🚀 ExamGuardAI — Live Demo via Cloudflare Tunnel (Free)

> **Is it a good idea?** YES — 100%. This is the **industry-standard free approach** for college project demos. Your guide, friends, or anyone can open your app on their phone or laptop just by visiting a link. Camera & microphone permissions work perfectly because it's HTTPS.

---

## What will happen when done?

| What | URL Example |
| :--- | :--- |
| Frontend (React) | `https://abc-xyz.trycloudflare.com` |
| Backend API | `https://def-ghi.trycloudflare.com` |

Your guide can access the app from **any device anywhere** — no port forwarding, no WiFi sharing, no "connect to my laptop's hotspot" awkwardness.

---

## ✅ Pre-Checks (Before Starting)

Make sure your project is already working locally:
- [ ] Backend runs: `uvicorn app.main:app --reload --port 8000`
- [ ] Frontend runs: `npm run dev` (runs on port **3000**)
- [ ] You can login at `http://localhost:3000`
- [ ] Database (MySQL or SQLite) is running

---

## 📦 STEP 1 — Install Cloudflared (One-Time)

Open **PowerShell as Administrator** and run:

```powershell
winget install Cloudflare.cloudflared
```

Or download manually from:  
👉 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

After install, verify it works:
```powershell
cloudflared --version
```
You should see: `cloudflared version 202x.x.x`

> **No account needed!** Cloudflare's quick tunnel (used here) is completely free and needs no login.

---

## 🖥️ STEP 2 — Start Your Backend

Open **Terminal 1** (in the backend folder):

```powershell
cd "c:\Users\jayve\Desktop\projects\minor project\facedetection\EXAMGUARDAI\backend"

# Activate your virtual environment first (whatever you named it)
# Example:
.\.venv\Scripts\activate

# Start backend with multiple workers for 35 students
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## ⚡ STEP 3 — Expose Backend via Cloudflare Tunnel

Open **Terminal 2** (new terminal window):

```powershell
cloudflared tunnel --url http://localhost:8000
```

After ~5 seconds you'll see something like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://proud-moon-abc123.trycloudflare.com                                              |
+--------------------------------------------------------------------------------------------+
```

📋 **Copy this URL** — this is your **Backend API URL**.  
Example: `https://proud-moon-abc123.trycloudflare.com`

---

## 🔧 STEP 4 — Update Frontend to use the Backend Tunnel URL

> ⚠️ This is the **most important step**. Without this, your frontend will try to call `http://localhost:8000` which doesn't work for external users.

Open [vite.config.js](file:///c:/Users/jayve/Desktop/projects/minor%20project/facedetection/EXAMGUARDAI/frontend/vite.config.js) and change the proxy target to your new backend tunnel URL:

```js
// vite.config.js — BEFORE
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  }
}

// vite.config.js — AFTER (paste YOUR backend tunnel URL)
proxy: {
  '/api': {
    target: 'https://proud-moon-abc123.trycloudflare.com',  // ← YOUR URL here
    changeOrigin: true,
  }
}
```

> **Note**: Cloudflare generates a new random URL each time you run the tunnel command. You must update this file each demo session unless you use a named tunnel (free with account).

---

## 🌐 STEP 5 — Start Frontend

Open **Terminal 3**:

```powershell
cd "c:\Users\jayve\Desktop\projects\minor project\facedetection\EXAMGUARDAI\frontend"
npm run dev
```

Frontend starts on `http://localhost:3000`

---

## 📡 STEP 6 — Expose Frontend via Cloudflare Tunnel

Open **Terminal 4** (new terminal):

```powershell
cloudflared tunnel --url http://localhost:3000
```

You'll get another URL like:
```
https://fast-cloud-xyz789.trycloudflare.com
```

📋 **This is the URL you share with your guide / students!**

---

## 📲 STEP 7 — Share & Demo

Share `https://fast-cloud-xyz789.trycloudflare.com` with your guide.

They open it on their phone/laptop — **camera and microphone permissions will work perfectly** because it's HTTPS ✅

---

## 🛑 STEP 8 — When Demo is Over

Press `Ctrl + C` in all 4 terminal windows.  
The tunnels automatically close. The public URLs stop working.

---

## ⚠️ Important Known Issues & Fixes

### Issue 1: Cloudflare blocks WebSocket or large uploads
The free quick tunnel can sometimes timeout on large face image uploads (base64 JPEGs ~50–100KB).

**Fix**: In [ExamRoom.jsx](file:///c:/Users/jayve/Desktop/projects/minor%20project/facedetection/EXAMGUARDAI/frontend/src/pages/student/ExamRoom.jsx), reduce snapshot quality before sending:
```js
// When capturing from canvas — reduce quality
canvas.toDataURL('image/jpeg', 0.5)  // 0.5 = 50% quality (was likely 0.9)
```

### Issue 2: Cloudflare "Anti-Bot" interstitial page
Sometimes Cloudflare shows a "Checking your browser..." page to first-time visitors.

**Fix**: Each user needs to open the frontend URL once in their browser and pass the one-time check. After that, it works normally.

### Issue 3: Free tunnel URL changes every session
Each time you run `cloudflared tunnel --url`, the URL changes.

**Fix (Optional)**: Create a free Cloudflare account and use a **Named Tunnel** with a fixed subdomain. Or just update `vite.config.js` at the start of each demo.

---

## 📋 Quick Reference — Terminal Layout

Run **4 terminals** side by side:

```
Terminal 1               Terminal 2                   Terminal 3              Terminal 4
──────────────           ─────────────────────        ──────────────          ──────────────────────
uvicorn backend          cloudflared                  npm run dev             cloudflared
--port 8000              → backend tunnel             frontend:3000           → frontend tunnel
                         → copy URL to               
                           vite.config.js             
```

---

## ✅ Final Checklist Before Demo

- [ ] Backend running on port 8000 ✅
- [ ] Backend Cloudflare tunnel running ✅
- [ ] vite.config.js updated with backend tunnel URL ✅
- [ ] Frontend running on port 3000 ✅
- [ ] Frontend Cloudflare tunnel running ✅
- [ ] You tested the public frontend URL on your phone first ✅
- [ ] Admin login credentials ready ✅
- [ ] At least one exam and student account pre-created ✅
- [ ] Face enrollment done for demo student ✅

---

## 🎓 What to Show Your Guide (Demo Script)

1. **Open the public URL** on a second device (phone or tablet)
2. **Show student login** → Dashboard with available exams
3. **Show face enrollment** → Camera opens, face is captured
4. **Enter exam room** → Show proctoring: tab switch detection, face check, audio VAD
5. **Show admin panel** → Real-time violations list, student status, evidence photos
6. **Submit exam** → Show auto-grading and results
