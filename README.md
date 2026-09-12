# Prahari — Your Standalone Study Agent (Free Version)

A study agent web app for UPSC, SSC CHSL, and BA English prep — chat, a
current-affairs digest, an SSC CHSL-style mock test with auto-scoring, and a
saved-notes tab. Runs on Google Gemini's free API tier — no payment, no card.

## How it's built
- `public/` — the website (HTML, CSS, JS) that runs in the browser
- `api/chat.js` — a small server function that holds your Gemini API key and
  talks to Gemini on the app's behalf (your key never reaches the browser)

## Deploy it — step by step (no coding needed, no cost)

### 1. Get a free Gemini API key
1. Go to **aistudio.google.com** → sign in with a Google account
2. Click **Get API key** (left sidebar) → **Create API key**
3. Copy the key — no billing setup required for the free tier

### 2. Create a GitHub account and upload this project
1. Go to **github.com** → **Sign up** (free)
2. Click the **+** icon → **New repository** → name it `prahari-agent` →
   keep it **Public** → **Create repository**
3. Click **uploading an existing file**
4. Unzip this project on your device, then drag in the *contents* of the
   `prahari-app` folder (`public/`, `api/`, `README.md`, `package.json`,
   `vercel.json`) — not the zip, not a wrapping outer folder
5. Click **Commit changes**

### 3. Deploy on Vercel (free)
1. Go to **vercel.com** → **Sign up** → **Continue with GitHub**
2. **Add New → Project** → select `prahari-agent` → **Import**
3. Before deploying, open **Environment Variables** and add:
   - Name: `GEMINI_API_KEY`
   - Value: (the key from Step 1)
4. Click **Deploy** — about a minute
5. You get a live link like `prahari-agent.vercel.app` — that's your site

### 4. Use it
Open the link on your phone or laptop. On mobile, use "Add to Home Screen"
so it behaves like an app.

## Cost
₹0. Gemini's free tier has daily usage limits, but they're generous enough
for personal study use. If you ever hit a limit, just wait for it to reset
(resets daily) rather than needing to pay.

## Changing the agent's behaviour
Open `public/script.js` and edit the `SYSTEM_PROMPT` text at the top — this
is where the agent's instructions, your context, and its rules live.
