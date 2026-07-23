const state = {
  profile: null,
  vitals: null,
  plan: null,
  history: [],
  reminders: []
};

/* ---------- User identity (for saving/loading data server-side) ---------- */
function getUserId(){
  let id = localStorage.getItem('fitnova-user-id');
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID() : 'user-' + Date.now() + '-' + Math.random().toString(16).slice(2));
    localStorage.setItem('fitnova-user-id', id);
  }
  return id;
}
const USER_ID = getUserId();

/* ---------- Tabs ---------- */
function switchTab(name){
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === name));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}
document.getElementById('navTabs').addEventListener('click', e=>{
  if(e.target.tagName === 'BUTTON') switchTab(e.target.dataset.tab);
});

document.querySelectorAll('#activityRow .choice').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('#activityRow .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
  });
});
document.querySelectorAll('#goalRow .choice').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('#goalRow .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
  });
});

function ring(pct, color, size=88){
  const r = 36, c = 2*Math.PI*r;
  const offset = c - (Math.min(Math.max(pct,0),100)/100)*c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 88 88">
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="${color}" stroke-width="7"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg>`;
}

function bmiCategory(bmi){
  if(bmi < 18.5) return {label:'Underweight', color:'var(--blue)'};
  if(bmi < 25) return {label:'Healthy', color:'var(--teal)'};
  if(bmi < 30) return {label:'Overweight', color:'var(--amber)'};
  return {label:'Obese', color:'var(--coral)'};
}

/* ---------- Onboarding / vitals ---------- */
document.getElementById('calcBtn').addEventListener('click', ()=>{
  const name = document.getElementById('userName').value.trim();
  const age = parseFloat(document.getElementById('age').value);
  const height = parseFloat(document.getElementById('height').value);
  const weight = parseFloat(document.getElementById('weight').value);
  const gender = document.getElementById('gender').value;
  const activityEl = document.querySelector('#activityRow .choice.selected');
  const goalEl = document.querySelector('#goalRow .choice.selected');
  const equipment = document.getElementById('equipment').value.trim();
  const diet = document.getElementById('diet').value.trim();

  if(!name || !age || !height || !weight || !activityEl || !goalEl){
    alert('Please fill in your name, age, height, weight, activity level, and goal.');
    return;
  }

  const activity = parseFloat(activityEl.dataset.val);
  const goal = goalEl.dataset.val;

  const heightM = height/100;
  const bmi = weight/(heightM*heightM);
  let bmr = gender === 'male'
    ? 10*weight + 6.25*height - 5*age + 5
    : 10*weight + 6.25*height - 5*age - 161;
  const tdee = bmr * activity;
  let calorieTarget = tdee;
  if(goal === 'lose') calorieTarget = tdee - 500;
  if(goal === 'gain') calorieTarget = tdee + 300;
  const water = (weight * 0.035).toFixed(1);

  state.profile = {name, age, height, weight, gender, activity, goal, equipment, diet};
  state.vitals = {bmi, bmr, tdee, calorieTarget, water};

  renderDashboard();
  saveAll();
  switchTab('dashboard');
});

function renderDashboard(){
  const v = state.vitals;
  const cat = bmiCategory(v.bmi);
  document.getElementById('dashSub').textContent =
    `Hey ${state.profile.name} — Age ${state.profile.age} · ${state.profile.height}cm · ${state.profile.weight}kg · Goal: ${
      {lose:'Lose weight', maintain:'Maintain', gain:'Build muscle'}[state.profile.goal]}`;

  const dials = [
    {label:'BMI', val:v.bmi.toFixed(1), sub:cat.label, pct:(v.bmi/40)*100, color:cat.color},
    {label:'BMR', val:Math.round(v.bmr), sub:'kcal/day', pct:(v.bmr/2500)*100, color:'var(--blue)'},
    {label:'Calorie target', val:Math.round(v.calorieTarget), sub:'kcal/day', pct:(v.calorieTarget/3000)*100, color:'var(--coral)'},
    {label:'Water intake', val:v.water, sub:'liters/day', pct:(v.water/5)*100, color:'var(--blue)'}
  ];
  document.getElementById('dialRow').innerHTML = dials.map(d=>`
    <div class="dial-card">
      <div class="ring">${ring(d.pct, d.color)}<div class="val">${d.val}</div></div>
      <div class="label">${d.label}</div>
      <div class="sub">${d.sub}</div>
    </div>
  `).join('');
}

/* ---------- AI plan generation (via backend) ---------- */
document.getElementById('genBtn').addEventListener('click', async ()=>{
  const statusEl = document.getElementById('genStatus');
  const btn = document.getElementById('genBtn');
  if(!state.profile || !state.vitals){
    alert('Calculate your vitals first.');
    return;
  }
  btn.disabled = true;
  statusEl.innerHTML = `<div class="loading-box"><div class="spinner"></div>Building your personalized plan…</div>`;

  try{
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ profile: state.profile, vitals: state.vitals })
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({error:'Unknown error'}));
      throw new Error(err.error || 'Request failed');
    }
    const data = await res.json();
    state.plan = data.plan;
    renderPlan();
    saveAll();
    statusEl.innerHTML = `<div style="color:var(--teal); font-size:13.5px; padding-top:10px;">Plan generated. Check the Workout and Meals tabs.</div>`;
  }catch(err){
    console.error(err);
    statusEl.innerHTML = `<div style="color:var(--coral); font-size:13.5px; padding-top:10px;">Couldn't generate a plan (${err.message}). Check the backend is running and your API key is set.</div>`;
  }
  btn.disabled = false;
});

function renderPlan(){
  if(!state.plan) return;
  const w = state.plan.workout || [];
  document.getElementById('workoutContent').innerHTML = w.map(d=>`
    <div class="day-card">
      <div class="day-head">
        <div class="name">${d.day}</div>
        <div class="tag ${d.isRest ? 'rest' : ''}">${d.isRest ? 'Rest' : d.focus}</div>
      </div>
      ${(d.exercises||[]).map(ex=>`
        <div class="exercise-row">
          <span class="ex-name">${ex.name}</span>
          <span class="ex-meta">${ex.sets} × ${ex.reps}</span>
        </div>
      `).join('') || '<div style="color:var(--text-dim); font-size:13.5px;">Recovery day — light stretching or a walk.</div>'}
    </div>
  `).join('');

  const m = state.plan.meals || [];
  const total = m.reduce((s,x)=>s+(x.calories||0),0);
  document.getElementById('mealsContent').innerHTML = `
    <div class="card">
      ${m.map(meal=>`
        <div class="meal-row">
          <div>
            <div class="m-title">${meal.meal}</div>
            <div class="m-items">${meal.items}</div>
          </div>
          <div class="m-cals">${meal.calories} kcal</div>
        </div>
      `).join('')}
      <div class="meal-row" style="border-top:1px solid var(--border); font-weight:600;">
        <div>Total</div><div class="m-cals" style="color:var(--text);">${total} kcal</div>
      </div>
    </div>
  `;
}

/* ---------- Progress ---------- */
let chartInstance = null;
function renderChart(){
  const ctx = document.getElementById('progressChart');
  const labels = state.history.map(h=>h.date);
  const data = state.history.map(h=>h.weight);
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type:'line',
    data:{labels, datasets:[{label:'Weight (kg)', data, borderColor:'#2FBF9F', backgroundColor:'rgba(47,191,159,0.1)', fill:true, tension:0.3, pointRadius:4, pointBackgroundColor:'#2FBF9F'}]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        y:{ticks:{color:'#8C99A0'}, grid:{color:'#2A343C'}},
        x:{ticks:{color:'#8C99A0'}, grid:{display:false}}
      }
    }
  });
}
function renderHistory(){
  const list = document.getElementById('historyList');
  if(state.history.length === 0){
    list.innerHTML = '<div class="empty-state" style="padding:30px 0;">No entries logged yet.</div>';
    return;
  }
  list.innerHTML = state.history.slice().reverse().map(h=>`
    <div class="history-item"><span>${h.date}</span><span class="w">${h.weight} kg</span></div>
  `).join('');
  renderChart();
}
document.getElementById('logBtn').addEventListener('click', ()=>{
  const w = parseFloat(document.getElementById('logWeight').value);
  if(!w){ alert('Enter a weight to log.'); return; }
  const today = new Date().toISOString().slice(0,10);
  state.history.push({date:today, weight:w});
  document.getElementById('logWeight').value = '';
  renderHistory();
  saveAll();
});

/* ---------- Reminders ---------- */
function renderReminders(){
  const list = document.getElementById('reminderList');
  if(state.reminders.length === 0){
    list.innerHTML = '<div class="empty-state">No reminders yet.</div>';
    return;
  }
  list.innerHTML = state.reminders.map((r,i)=>`
    <div class="reminder-item">
      <div class="r-icon">⏰</div>
      <div class="r-text">
        <div class="r-title">${r.text}</div>
        <div class="r-time">${r.time}</div>
      </div>
      <button data-i="${i}" class="delRem">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('.delRem').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.reminders.splice(parseInt(btn.dataset.i),1);
      renderReminders();
      saveAll();
    });
  });
}
document.getElementById('remBtn').addEventListener('click', ()=>{
  const text = document.getElementById('remText').value.trim();
  const time = document.getElementById('remTime').value;
  if(!text || !time){ alert('Add both a reminder and a time.'); return; }
  state.reminders.push({text, time});
  document.getElementById('remText').value = '';
  document.getElementById('remTime').value = '';
  renderReminders();
  saveAll();
});

setInterval(()=>{
  const now = new Date();
  const hhmm = now.toTimeString().slice(0,5);
  state.reminders.forEach(r=>{
    if(r.time === hhmm && r.lastFired !== now.toISOString().slice(0,10)){
      r.lastFired = now.toISOString().slice(0,10);
      if(window.Notification && Notification.permission === 'granted'){
        new Notification('FitNova reminder', {body:r.text});
      }
    }
  });
}, 30000);
if(window.Notification && Notification.permission === 'default'){
  Notification.requestPermission();
}

/* ---------- Report ---------- */
function buildReportText(){
  const p = state.profile, v = state.vitals;
  let report = `FITNOVA — PERSONAL FITNESS REPORT\nGenerated: ${new Date().toLocaleString()}\n\n`;
  report += `PROFILE\n-------\nName: ${p.name}\nAge: ${p.age}\nGender: ${p.gender}\nHeight: ${p.height} cm\nWeight: ${p.weight} kg\nGoal: ${p.goal}\n\n`;
  report += `VITALS\n------\nBMI: ${v.bmi.toFixed(1)} (${bmiCategory(v.bmi).label})\nBMR: ${Math.round(v.bmr)} kcal/day\nDaily calorie target: ${Math.round(v.calorieTarget)} kcal\nWater intake: ${v.water} L/day\n\n`;

  if(state.plan){
    report += `WORKOUT PLAN\n------------\n`;
    (state.plan.workout||[]).forEach(d=>{
      report += `${d.day} — ${d.isRest ? 'Rest' : d.focus}\n`;
      (d.exercises||[]).forEach(ex=> report += `  - ${ex.name}: ${ex.sets} sets x ${ex.reps}\n`);
    });
    report += `\nMEAL PLAN\n---------\n`;
    (state.plan.meals||[]).forEach(m=> report += `${m.meal}: ${m.items} (${m.calories} kcal)\n`);
    report += '\n';
  }

  if(state.history.length){
    report += `WEIGHT HISTORY\n--------------\n`;
    state.history.forEach(h=> report += `${h.date}: ${h.weight} kg\n`);
  }
  return report;
}

function renderReportDoc(){
  const p = state.profile, v = state.vitals;
  const goalLabel = ({lose:'Lose weight', maintain:'Maintain', gain:'Build muscle'})[p.goal];

  let html = `
    <div class="rd-head">
      <div class="rd-brand">FitNova</div>
      <div class="rd-date">${new Date().toLocaleDateString()}</div>
    </div>
    <div class="rd-section">
      <div class="rd-title">Profile</div>
      <div class="rd-row"><span class="rd-key">Name</span><span>${p.name}</span></div>
      <div class="rd-row"><span class="rd-key">Age</span><span>${p.age}</span></div>
      <div class="rd-row"><span class="rd-key">Gender</span><span>${p.gender}</span></div>
      <div class="rd-row"><span class="rd-key">Height</span><span>${p.height} cm</span></div>
      <div class="rd-row"><span class="rd-key">Weight</span><span>${p.weight} kg</span></div>
      <div class="rd-row"><span class="rd-key">Goal</span><span>${goalLabel}</span></div>
    </div>
    <div class="rd-section">
      <div class="rd-title">Vitals</div>
      <div class="rd-stat-grid">
        <div class="rd-stat"><div class="rd-stat-label">BMI</div><div class="rd-stat-value">${v.bmi.toFixed(1)} · ${bmiCategory(v.bmi).label}</div></div>
        <div class="rd-stat"><div class="rd-stat-label">BMR</div><div class="rd-stat-value">${Math.round(v.bmr)} kcal/day</div></div>
        <div class="rd-stat"><div class="rd-stat-label">Calorie target</div><div class="rd-stat-value">${Math.round(v.calorieTarget)} kcal/day</div></div>
        <div class="rd-stat"><div class="rd-stat-label">Water intake</div><div class="rd-stat-value">${v.water} L/day</div></div>
      </div>
    </div>`;

  if(state.plan){
    html += `<div class="rd-section"><div class="rd-title">Workout plan</div>`;
    (state.plan.workout||[]).forEach(d=>{
      const exList = (d.exercises||[]).map(ex=>`${ex.name} — ${ex.sets}×${ex.reps}`).join(' · ');
      html += `<div class="rd-day"><div class="rd-day-name">${d.day} — ${d.isRest ? 'Rest' : d.focus}</div><div class="rd-day-ex">${exList || 'Recovery day'}</div></div>`;
    });
    html += `</div>`;

    html += `<div class="rd-section"><div class="rd-title">Meal plan</div>`;
    (state.plan.meals||[]).forEach(m=>{
      html += `<div class="rd-row"><span class="rd-key">${m.meal} — ${m.items}</span><span>${m.calories} kcal</span></div>`;
    });
    html += `</div>`;
  }else{
    html += `<div class="rd-section"><div class="rd-title">Workout &amp; meal plan</div><div class="rd-empty">No AI plan generated yet — visit the Vitals tab to create one.</div></div>`;
  }

  if(state.history.length){
    html += `<div class="rd-section"><div class="rd-title">Weight history</div>`;
    state.history.forEach(h=> html += `<div class="rd-row"><span class="rd-key">${h.date}</span><span>${h.weight} kg</span></div>`);
    html += `</div>`;
  }

  document.getElementById('reportDoc').innerHTML = html;
}

document.getElementById('genReportBtn').addEventListener('click', ()=>{
  if(!state.profile || !state.vitals){
    alert('Calculate your vitals first.');
    return;
  }
  renderReportDoc();
  document.getElementById('reportOutput').style.display = 'block';
  document.getElementById('reportIntro').style.display = 'none';
});

document.getElementById('copyBtn').addEventListener('click', async ()=>{
  const text = buildReportText();
  const btn = document.getElementById('copyBtn');
  const original = btn.textContent;
  const fallback = document.getElementById('copyFallback');
  const hint = document.getElementById('copyFallbackHint');
  let copied = false;

  try{
    await navigator.clipboard.writeText(text);
    copied = true;
  }catch(e){ copied = false; }

  if(!copied){
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    }catch(e){ copied = false; }
  }

  if(copied){
    btn.textContent = 'Copied';
    fallback.style.display = 'none';
    hint.style.display = 'none';
    setTimeout(()=>{ btn.textContent = original; }, 1500);
  }else{
    fallback.value = text;
    fallback.style.display = 'block';
    hint.style.display = 'block';
    fallback.focus();
    fallback.select();
  }
});

function buildPdfBlob(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;
  const teal = [47,191,159];
  const dim = [110,120,126];
  const dark = [20,26,30];

  function ensureSpace(lines){
    if(y + lines*14 > 780){ doc.addPage(); y = 56; }
  }
  function heading(text){
    ensureSpace(3);
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...dark);
    doc.text(text, marginX, y);
    y += 6;
    doc.setDrawColor(...teal); doc.setLineWidth(1);
    doc.line(marginX, y, pageW - marginX, y);
    y += 18;
  }
  function line(label, value){
    ensureSpace(1);
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(...dim);
    doc.text(label, marginX, y);
    doc.setTextColor(...dark); doc.setFont('helvetica','bold');
    doc.text(String(value), marginX + 160, y);
    y += 18;
  }
  function wrapText(text, x, width){
    const split = doc.splitTextToSize(text, width);
    split.forEach(l=>{ ensureSpace(1); doc.text(l, x, y); y += 14; });
  }

  doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(...teal);
  doc.text('FitNova', marginX, y); y += 6;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...dim);
  doc.text('Personal fitness report for ' + state.profile.name + ' — generated ' + new Date().toLocaleString(), marginX, y + 14);
  y += 40;

  const p = state.profile, v = state.vitals;
  heading('Profile');
  line('Name', p.name);
  line('Age', p.age);
  line('Gender', p.gender);
  line('Height', p.height + ' cm');
  line('Weight', p.weight + ' kg');
  line('Goal', ({lose:'Lose weight', maintain:'Maintain', gain:'Build muscle'})[p.goal]);
  y += 6;

  heading('Vitals');
  line('BMI', v.bmi.toFixed(1) + ' (' + bmiCategory(v.bmi).label + ')');
  line('BMR', Math.round(v.bmr) + ' kcal/day');
  line('Calorie target', Math.round(v.calorieTarget) + ' kcal/day');
  line('Water intake', v.water + ' L/day');
  y += 6;

  if(state.plan){
    heading('Workout plan');
    (state.plan.workout||[]).forEach(d=>{
      ensureSpace(2);
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...dark);
      doc.text(d.day + ' — ' + (d.isRest ? 'Rest' : d.focus), marginX, y);
      y += 16;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...dim);
      (d.exercises||[]).forEach(ex=>{
        wrapText('• ' + ex.name + ': ' + ex.sets + ' sets x ' + ex.reps, marginX + 10, pageW - marginX*2 - 10);
      });
      y += 6;
    });

    heading('Meal plan');
    (state.plan.meals||[]).forEach(m=>{
      ensureSpace(2);
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...dark);
      doc.text(m.meal + ' (' + m.calories + ' kcal)', marginX, y);
      y += 14;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...dim);
      wrapText(m.items, marginX + 10, pageW - marginX*2 - 10);
      y += 6;
    });
  }

  if(state.history.length){
    heading('Weight history');
    state.history.forEach(h=> line(h.date, h.weight + ' kg'));
  }

  return doc.output('blob');
}

document.getElementById('pdfBtn').addEventListener('click', ()=>{
  try{
    const blob = buildPdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitnova-report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 4000);
  }catch(e){
    console.error(e);
    alert('PDF generation failed — try "Copy summary" instead.');
  }
});

/* ---------- Persistence (via backend) ---------- */
let saveTimer = null;
function saveAll(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      await fetch(`/api/data/${USER_ID}`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(state)
      });
    }catch(e){ console.error('save failed', e); }
  }, 300);
}

async function loadAll(){
  try{
    const res = await fetch(`/api/data/${USER_ID}`);
    const loaded = await res.json();
    if(!loaded) return;
    Object.assign(state, loaded);

    if(state.profile && state.vitals){
      document.getElementById('userName').value = state.profile.name || '';
      document.getElementById('age').value = state.profile.age;
      document.getElementById('height').value = state.profile.height;
      document.getElementById('weight').value = state.profile.weight;
      document.getElementById('gender').value = state.profile.gender;
      document.getElementById('equipment').value = state.profile.equipment || '';
      document.getElementById('diet').value = state.profile.diet || '';
      document.querySelectorAll('#activityRow .choice').forEach(c=>{
        if(parseFloat(c.dataset.val) === state.profile.activity) c.classList.add('selected');
      });
      document.querySelectorAll('#goalRow .choice').forEach(c=>{
        if(c.dataset.val === state.profile.goal) c.classList.add('selected');
      });
      renderDashboard();
    }
    if(state.plan) renderPlan();
    renderHistory();
    renderReminders();
  }catch(e){
    console.error('Could not load saved data', e);
  }
}
loadAll();
