
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const FRONTEND_DIR = __dirname;

// ------------------------------------------
// 1. CHECK API KEY
// ------------------------------------------

if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not found!');
    process.exit(1);
}

console.log('✅ GROQ_API_KEY loaded successfully');

// ------------------------------------------
// 2. CREATE DATA DIRECTORY
// ------------------------------------------

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ------------------------------------------
// 3. GROQ AI CLIENT
// ------------------------------------------

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

const MODEL = 'openai/gpt-oss-120b';

// ------------------------------------------
// 4. EXPRESS SERVER
// ------------------------------------------

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve frontend files
app.use(express.static(FRONTEND_DIR));

// ------------------------------------------
// 5. HEALTH CHECK
// ------------------------------------------

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'FitNova backend is running',
        ai: 'Groq API configured',
        model: MODEL
    });
});

// ------------------------------------------
// 6. GENERATE AI FITNESS PLAN
// POST /api/plan
// ------------------------------------------

app.post('/api/plan', async (req, res) => {

    try {

        const { profile, vitals } = req.body || {};

        // Validate request
        if (!profile || !vitals) {
            return res.status(400).json({
                error: 'Missing profile or vitals in request body.'
            });
        }

        if (
            !Number.isFinite(Number(profile.age)) ||
            !Number.isFinite(Number(profile.height)) ||
            !Number.isFinite(Number(profile.weight))
        ) {
            return res.status(400).json({
                error: 'Invalid profile information.'
            });
        }

        // ----------------------------------
        // 7. AI PROMPT
        // ----------------------------------

        const prompt = `
You are a helpful fitness and general wellness assistant.

Create a personalized 7-day beginner-friendly fitness
schedule and a balanced daily meal suggestion.

PROFILE:

Name: ${profile.name || 'User'}
Age: ${profile.age}
Gender: ${profile.gender || 'Not specified'}
Height: ${profile.height} cm
Weight: ${profile.weight} kg
Goal: ${profile.goal || 'General fitness'}
Activity: ${profile.activity || 'Moderate'}
Equipment: ${profile.equipment || 'Bodyweight'}
Diet preference: ${profile.diet || 'No preference'}

IMPORTANT SAFETY RULES:

1. Recommend safe, age-appropriate physical activity.
2. Include adequate rest and recovery.
3. Avoid extreme exercise routines.
4. Do not recommend restrictive diets or skipping meals.
5. Suggest balanced, varied meals.
6. Do not prescribe calorie restriction or weight-loss targets.
7. Do not recommend supplements or performance-enhancing substances.
8. For users under 18, keep recommendations general and encourage
   involving a parent, guardian or qualified professional for
   individualized fitness and nutrition guidance.
9. Keep all recommendations realistic and beginner-friendly.

OUTPUT REQUIREMENTS:

Return ONLY valid JSON.

Use exactly this structure:

{
  "workout": [
    {
      "day": "Monday",
      "focus": "Upper body",
      "isRest": false,
      "exercises": [
        {
          "name": "Push-ups",
          "sets": "2",
          "reps": "8-10"
        }
      ]
    }
  ],
  "meals": [
    {
      "meal": "Breakfast",
      "items": "Oats, milk and fruit",
      "calories": null
    },
    {
      "meal": "Lunch",
      "items": "Rice, dal and vegetables",
      "calories": null
    },
    {
      "meal": "Dinner",
      "items": "Roti, vegetables and protein source",
      "calories": null
    },
    {
      "meal": "Snacks",
      "items": "Fruit and yogurt",
      "calories": null
    }
  ]
}

Generate all seven days from Monday to Sunday.
Include at least one rest day.
Keep exercise lists to 4-6 items on active days.
Keep meal descriptions concise.
Do not include markdown or text outside the JSON.
`;

        // ----------------------------------
        // 8. GROQ API REQUEST
        // ----------------------------------

        console.log('🤖 Generating FitNova AI plan...');
        console.log('Using model:', MODEL);

        const response = await client.chat.completions.create({

            model: MODEL,

            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful fitness and wellness assistant. Follow the requested JSON format and safety instructions.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],

            max_completion_tokens: 4000,

            response_format: {
                type: 'json_object'
            },

            include_reasoning: false

        });

        // ----------------------------------
        // 9. READ AI RESPONSE
        // ----------------------------------

        const text = response.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('AI returned an empty response.');
        }

        console.log('✅ AI response received');

        // ----------------------------------
        // 10. PARSE JSON
        // ----------------------------------

        let plan;

        try {

            plan = JSON.parse(text);

        } catch (parseErr) {

            console.error('JSON parsing failed:', parseErr.message);

            return res.status(502).json({
                error: 'AI returned invalid JSON. Please try again.'
            });

        }

        // ----------------------------------
        // 11. VALIDATE AI PLAN
        // ----------------------------------

        if (
            !Array.isArray(plan.workout) ||
            !Array.isArray(plan.meals) ||
            plan.workout.length !== 7
        ) {
            return res.status(502).json({
                error: 'AI generated an incomplete fitness plan. Please try again.'
            });
        }

        // ----------------------------------
        // 12. SEND PLAN TO FRONTEND
        // ----------------------------------

        console.log('✅ FitNova AI plan generated successfully');

        return res.json({
            success: true,
            plan: plan
        });

    } catch (err) {

        // ----------------------------------
        // 13. ERROR HANDLING
        // ----------------------------------

        console.error('❌ Plan generation failed:', {
            message: err.message,
            code: err.code,
            status: err.status
        });

        if (err.status === 401) {
            return res.status(401).json({
                error: 'Invalid Groq API key. Check your Render environment variables.'
            });
        }

        if (err.status === 429) {
            return res.status(429).json({
                error: 'AI request limit reached. Please try again later.'
            });
        }

        if (err.code === 'model_not_found') {
            return res.status(502).json({
                error: 'AI model unavailable. Check the configured Groq model.'
            });
        }

        return res.status(500).json({
            error: 'Failed to generate plan. Check backend logs.'
        });

    }

});

// ------------------------------------------
// 14. SAFE USER FILE
// ------------------------------------------

function safeUserFile(userId) {

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId || '')) {
        return null;
    }

    return path.join(DATA_DIR, `${userId}.json`);
}

// ------------------------------------------
// 15. GET USER DATA
// GET /api/data/:userId
// ------------------------------------------

app.get('/api/data/:userId', (req, res) => {

    const file = safeUserFile(req.params.userId);

    if (!file) {
        return res.status(400).json({
            error: 'Invalid user id.'
        });
    }

    if (!fs.existsSync(file)) {
        return res.json(null);
    }

    try {

        const content = JSON.parse(
            fs.readFileSync(file, 'utf-8')
        );

        return res.json(content);

    } catch (err) {

        console.error('Data read error:', err.message);

        return res.status(500).json({
            error: 'Could not read saved data.'
        });

    }

});

// ------------------------------------------
// 16. SAVE USER DATA
// POST /api/data/:userId
// ------------------------------------------

app.post('/api/data/:userId', (req, res) => {

    const file = safeUserFile(req.params.userId);

    if (!file) {
        return res.status(400).json({
            error: 'Invalid user id.'
        });
    }

    try {

        fs.writeFileSync(
            file,
            JSON.stringify(req.body || {}, null, 2)
        );

        return res.json({
            success: true,
            message: 'User data saved successfully.'
        });

    } catch (err) {

        console.error('Data save error:', err.message);

        return res.status(500).json({
            error: 'Could not save data.'
        });

    }

});

// ------------------------------------------
// 17. FRONTEND ROUTE
// ------------------------------------------

app.get('/', (req, res) => {

    res.sendFile(
        path.join(FRONTEND_DIR, 'index.html')
    );

});

// ------------------------------------------
// 18. START SERVER
// ------------------------------------------

app.listen(PORT, () => {

    console.log('--------------------------------');
    console.log('🚀 FitNova Server Started');
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🤖 AI Model: ${MODEL}`);
    console.log('✅ Backend Ready');
    console.log('--------------------------------');

});
