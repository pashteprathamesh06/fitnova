require('dotenv').config();
console.log("Loaded GROQ_API_KEY:", process.env.GROQ_API_KEY);

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const OpenAI = require("openai");

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const FRONTEND_DIR = __dirname;

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY is not found!");
  process.exit(1);
}

console.log("✅ GROQ_API_KEY loaded:", process.env.GROQ_API_KEY.substring(0, 12) + "...");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve the static frontend
app.use(express.static(FRONTEND_DIR));

/* ---------------------------------------------------------
   POST /api/plan
   Body: { profile: {...}, vitals: {...} }
   Calls Claude server-side (API key never reaches the browser)
   and returns a structured workout + meal plan as JSON.
--------------------------------------------------------- */
app.post('/api/plan', async (req, res) => {
  try {
    const { profile, vitals } = req.body || {};
    if (!profile || !vitals) {
      return res.status(400).json({ error: 'Missing profile or vitals in request body.' });
    }

    const prompt = `You are a certified fitness coach and nutritionist. Based on this person's profile, generate a personalized 7-day workout plan and a daily meal plan.

Profile: name ${profile.name}, age ${profile.age}, gender ${profile.gender}, height ${profile.height}cm, weight ${profile.weight}kg, goal: ${profile.goal}, activity level multiplier: ${profile.activity}, equipment available: ${profile.equipment || 'none specified, assume bodyweight'}, dietary preference: ${profile.diet || 'none specified'}.
Calculated targets: BMI ${Number(vitals.bmi).toFixed(1)}, BMR ${Math.round(vitals.bmr)} kcal, daily calorie target ${Math.round(vitals.calorieTarget)} kcal, water intake ${vitals.water} L.

Respond with ONLY valid JSON (no markdown, no commentary) matching exactly this shape:
{
  "workout": [
    {"day":"Monday","focus":"Upper body","isRest":false,"exercises":[{"name":"Push-ups","sets":"3","reps":"12-15"}]},
    ... one object per day, Monday through Sunday, include at least one rest day
  ],
  "meals": [
    {"meal":"Breakfast","items":"short description of what to eat","calories":450},
    {"meal":"Lunch","items":"...","calories":600},
    {"meal":"Dinner","items":"...","calories":550},
    {"meal":"Snacks","items":"...","calories":200}
  ]
}
Keep exercise lists to 4-6 items per day. Make meal calories sum close to the daily calorie target. Keep all text concise.`;

    const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
        {
            role: "user",
            content: prompt
        }
    ],
    max_tokens: 4000
});

const text = response.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();

    let plan;
    try {
      plan = JSON.parse(clean);
    } catch (parseErr) {
      console.error('Failed to parse model output as JSON:', text);
      return res.status(502).json({ error: 'The model returned an unexpected format. Try again.' });
    }

    res.json({ plan });
  } catch (err) {
    console.error('Plan generation failed:', err);
    res.status(500).json({ error: 'Failed to generate plan. Check your API key and server logs.' });
  }
});

/* ---------------------------------------------------------
   GET/POST /api/data/:userId
   Simple per-user JSON file persistence (profile, vitals,
   plan, weight history, reminders). Good enough for local
   / single-instance use; swap for a real DB before scaling.
--------------------------------------------------------- */
function safeUserFile(userId) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId || '')) return null;
  return path.join(DATA_DIR, `${userId}.json`);
}

app.get('/api/data/:userId', (req, res) => {
  const file = safeUserFile(req.params.userId);
  if (!file) return res.status(400).json({ error: 'Invalid user id.' });
  if (!fs.existsSync(file)) return res.json(null);
  try {
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: 'Could not read saved data.' });
  }
});

app.post('/api/data/:userId', (req, res) => {
  const file = safeUserFile(req.params.userId);
  if (!file) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    fs.writeFileSync(file, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save data.' });
  }
});

// Fallback: send index.html for any other route (simple SPA support)
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FitNova running at http://localhost:${PORT}`);
});
