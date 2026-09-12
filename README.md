# Prahari — Your Standalone Study Agent (Groq-powered)

A study agent web app for UPSC, SSC CHSL, BA English, and anything else —
chat, a current-affairs digest, an SSC CHSL-style mock test with
auto-scoring, and a saved-notes tab. Runs on Groq's free, fast inference API.

## How it's built
- `public/` — the website (HTML, CSS, JS) that runs in the browser
- `api/chat.js` — a small server function that holds your Groq API key and
  talks to Groq on the app's behalf (your key never reaches the browser)

## Deploy it — step by step (no coding needed, no cost)

### 1. Get a free Groq API key
1. Go to **console.groq.com** → sign up (no card required)
2. Go to **API Keys** → **Create API Key**
3. Copy the key

### 1b. Get a free Tavily API key (for live web search)
1. Go to **tavily.com** → sign up (no card required)
2. Copy your API key from the dashboard — free tier gives 1,000 searches/month

### 2. Create a GitHub account and upload this project
1. Go to **github.com** → sign up (free)
2. New repository → name it `prahari-agent` → Public → Create
3. Upload the contents of this project (`public/`, `api/`, `README.md`,
   `package.json`) → Commit

### 3. Deploy on Vercel (free)
1. Go to **vercel.com** → sign up with GitHub
2. Add New → Project → import `prahari-agent`
3. Add environment variable:
   - Name: `GROQ_API_KEY`
   - Value: (the key from Step 1)
   - Name: `TAVILY_API_KEY`
   - Value: (the key from Step 1b)
4. Deploy

### 4. Use it
Open your live link. Add it to your phone's home screen for one-tap access.

## Cost
₹0. Groq's free tier is generous — far higher daily limits than most free AI
APIs, no card required.

## What's different from the Gemini version
- Live web search is back — powered by Tavily instead of Google. Toggle
  "🔎 Search the web" in Chat before sending a question, and the Current
  Affairs digest always uses it automatically.
- Fast/Deep toggle now switches between two different model sizes
  (Llama 3.1 8B for Fast, Llama 3.3 70B for Deep) instead of a thinking-depth
  setting.

## Changing the agent's behaviour
Open `public/script.js` and edit the `SYSTEM_PROMPT` text at the top.
