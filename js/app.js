// ========== 健康提醒 App — All-in-one ==========

const SUPABASE_URL = 'https://tebpxiajblghskfhzkou.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6SnPiEDzUJxYwEgmDh7exA_R6ivXOFs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── State ───
let user = null;
let reminders = [];
let completions = [];
let meals = [];
let dietDate = new Date();
let editing = null;
let newReminder = null;
let logMealType = 'lunch';
let logGroups = new Set();
let logNotes = '';
let statMode = 'week';
let allCompletions = [];
let allMeals = [];

// ─── Helpers ───
function ts(d) { const dt = d || new Date(); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }

function baseType(t) {
  // strip trailing _<digits> suffix for type lookup
  return (t||'').replace(/_\d+$/, '');
}
function emoji(t) {
  const b = baseType(t);
  const m = { wakeUp:'☀️', medication:'💊', exercise:'🏃', tea:'🍵', diet:'🥗', eyeCare:'👀', sedentary:'🚶', writing:'📝', bedtime:'😴' };
  return m[b] || (b && b.length <= 4 ? b : '⏰');
}

function teaName(k) {
  const t = TEAS.find(x => x.key === k);
  return t ? t.name : (k || '—');
}

// ─── Auth ───
async function doAuth() {
  const email = document.getElementById('email').value.trim();
  const pw = document.getElementById('password').value;
  const btn = document.getElementById('auth-btn');
  const msg = document.getElementById('auth-msg');
  if (!email || pw.length < 6) { msg.textContent = '请输入邮箱和6位以上密码'; return; }
  btn.textContent = '请稍候...'; btn.disabled = true; msg.textContent = '';

  let { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) {
    // Not registered? Try sign up
    const r2 = await supabase.auth.signUp({ email, password: pw });
    if (r2.error) {
      if (r2.error.message.includes('already been registered') || r2.error.message.includes('already registered')) {
        msg.textContent = '邮箱或密码错误';
      } else {
        msg.textContent = r2.error.message;
      }
      btn.textContent = '登录 / 注册'; btn.disabled = false;
      return;
    }
    // Sign up success → sign in
    const r3 = await supabase.auth.signInWithPassword({ email, password: pw });
    if (r3.error) { msg.textContent = r3.error.message; btn.textContent = '登录 / 注册'; btn.disabled = false; return; }
    data = r3.data;
  }

  if (data?.user) {
    user = data.user;
    document.getElementById('drawer-email').textContent = user.email || '';
    document.getElementById('drawer-name').textContent = user.email?.split('@')[0] || '用户';
    document.getElementById('auth-box').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    await loadAll();
    goTab('dashboard');
    startNotificationLoop();
  }
  btn.textContent = '登录 / 注册'; btn.disabled = false;
}

async function doSignOut() {
  await supabase.auth.signOut();
  user = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-box').style.display = 'flex';
}

// ─── Data ───
async function loadAll() {
  // reminders
  let { data } = await supabase.from('reminders').select('*').order('time');
  if (data && data.length > 0) {
    reminders = data.sort((a,b) => a.time.localeCompare(b.time));
  } else {
    await insertDefaults();
  }

  // completions
  let { data: c } = await supabase.from('daily_completions').select('reminder_id').eq('date', ts());
  completions = c || [];

  // meals
  let { data: m } = await supabase.from('meal_entries').select('*').eq('date', ts(dietDate)).order('time');
  meals = m || [];
}

async function insertDefaults() {
  if (!user) return;
  const defs = [
    { user_id:user.id, type:'wakeUp', title:'起床', is_enabled:true, time:'07:30', message:'早上好！新的一天开始了 ☀️' },
    { user_id:user.id, type:'medication', title:'吃药', is_enabled:true, time:'08:00', message:'别忘了吃药 💊' },
    { user_id:user.id, type:'exercise', title:'运动', is_enabled:true, time:'08:30', message:'该运动了！🏃' },
    { user_id:user.id, type:'diet', title:'记录饮食', is_enabled:true, time:'12:30', message:'该记录饮食了！今天吃了什么？🥗' },
    { user_id:user.id, type:'tea', title:'泡茶', is_enabled:true, time:'10:00', message:'泡杯茶休息一下 🍵', selected_tea_key:'chrysanthemum' },
    { user_id:user.id, type:'eyeCare', title:'20-20-20 护眼', is_enabled:true, time:'09:00', message:'看远处20秒，保护眼睛 👀',
      interval_minutes:20, active_hours_start:'09:00', active_hours_end:'18:00' },
    { user_id:user.id, type:'sedentary', title:'久坐提醒', is_enabled:true, time:'09:00', message:'起来走动一下！🚶',
      interval_minutes:60, active_hours_start:'09:00', active_hours_end:'18:00' },
    { user_id:user.id, type:'writing', title:'写论文', is_enabled:true, time:'09:00', message:'专注写作时间 📝',
      active_hours_start:'09:00', active_hours_end:'12:00' },
    { user_id:user.id, type:'bedtime', title:'上床睡觉', is_enabled:true, time:'23:00', message:'该上床睡觉了 😴' },
  ];
  const { data } = await supabase.from('reminders').insert(defs).select();
  if (data && data.length > 0) {
    reminders = data.sort((a,b) => a.time.localeCompare(b.time));
  }
}

// ─── Tabs ───
function goTab(name) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  document.getElementById('pane-'+name).classList.add('on');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
  event?.target?.closest('button')?.classList.add('on');
  document.getElementById('top-title').textContent = {dashboard:'今日提醒',settings:'中医养生',diet:'饮食记录',stats:'健康统计'}[name]||'健康提醒';

  if (name === 'dashboard') renderDash();
  if (name === 'settings')   renderSett();
  if (name === 'diet')       renderDiet();
  if (name === 'stats')      renderStats();
}

// ─── Dashboard ───
async function toggleComplete(rid, isDone) {
  if (isDone) {
    await supabase.from('daily_completions').delete().eq('reminder_id',rid).eq('date',ts());
    completions = completions.filter(c => c.reminder_id !== rid);
  } else {
    const { data } = await supabase.from('daily_completions').insert({reminder_id:rid, date:ts()}).select();
    if (data) completions.push(data[0]);
  }
  renderDash();
}

async function resetToday() {
  await supabase.from('daily_completions').delete().eq('date',ts());
  completions = [];
  renderDash();
}

function renderDash() {
  const now = new Date();
  const h = now.getHours();
  const greet = h<6?'夜深了 🌙':h<12?'早上好 ☀️':h<14?'中午好 🌤️':h<18?'下午好 🌅':'晚上好 🌆';
  const dstr = now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});

  const enabled = reminders.filter(r => r.is_enabled);
  const doneIds = new Set(completions.map(c => c.reminder_id));
  const done = enabled.filter(r => doneIds.has(r.id)).length;
  const total = enabled.length;
  const pct = total>0 ? done/total : 0;

  const blocks = reminders.filter(r => _isBlock(r) && r.is_enabled);
  const points = enabled.filter(r => !_isBlock(r)).sort((a,b)=>a.time.localeCompare(b.time));

  let html = '';

  // greeting
  html += `<div class="card greet"><div><div class="t">${greet}</div><div class="d">${dstr}</div></div><div style="font-size:28px">❤️</div></div>`;

  // progress
  const ringPerim = 2*Math.PI*15.5;
  html += `<div class="card prog"><div class="ring"><svg viewBox="0 0 36 36" width="72" height="72">`
    +`<circle class="ring-bg" cx="18" cy="18" r="15.5"/>`
    +`<circle class="ring-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${ringPerim}" stroke-dashoffset="${ringPerim*(1-pct)}"/>`
    +`</svg><div class="ring-t">${Math.round(pct*100)}%</div></div>`
    +`<div style="flex:1"><div style="font-size:15px;font-weight:600">今日进度</div>`
    +`<div style="font-size:13px;color:var(--s)">已完成 ${done}/${total} 项</div>`
    +`<div class="bar"><div class="bar-f" style="width:${pct*100}%"></div></div></div></div>`;

  // task blocks
  if (blocks.length > 0) {
    html += `<div class="st">📅 任务</div>`;
    blocks.forEach(r => {
      const s = (r.time||'09:00').slice(0,5);
      const e = (r.active_hours_end||'12:00').slice(0,5);
      const isDone = doneIds.has(r.id);
      html += `<div class="tblock" onclick="openEdit('${r.id}')" style="cursor:pointer"><div class="ind"></div><div style="flex:1"><div${isDone?' style="text-decoration:line-through;color:var(--s)"':''}>📝 ${r.title}</div><div style="font-size:12px;color:var(--s)">${s} – ${e}</div></div>`
        +`<div style="flex-shrink:0">`
        +(isDone
          ?`<button style="font-size:20px;color:var(--g);background:none;border:none;cursor:pointer;padding:4px" onclick="event.stopPropagation();toggleComplete('${r.id}',true)">✓</button>`
          :`<button class="dbtn" onclick="event.stopPropagation();toggleComplete('${r.id}',false)">完成</button>`)
        +`</div></div>`;
    });
  }

  // point reminders
  html += `<div class="st">⏰ 今日提醒</div>`;
  if (points.length===0) {
    html += '<p style="text-align:center;color:var(--s);margin:32px 0">✅ 所有提醒已完成！</p>';
  }
  points.forEach((r,i) => {
    const isDone = doneIds.has(r.id);
    const isPast = r.time < now.toTimeString().slice(0,5);
    const dotCls = isDone?'done':(isPast?'past':'up');
    let tags = '';
    if (r.interval_minutes) tags += `<span>每${r.interval_minutes}分钟</span>`;
    if (r.active_hours_start) tags += `<span>${r.active_hours_start.slice(0,5)}–${r.active_hours_end?.slice(0,5)}</span>`;
    if (baseType(r.type)==='tea') tags += `<span>🍵 ${teaName(r.selected_tea_key)}</span>`;

    html += `<div class="row" onclick="openEdit('${r.id}')" style="cursor:pointer"><div class="tc" style="color:${isPast?'var(--s)':'var(--t)'}">${r.time.slice(0,5)}</div>`
      +`<div class="lc"><div class="dot ${dotCls}"></div>${i<points.length-1?'<div class="line"></div>':''}</div>`
      +`<div class="rc"><div class="info">`
      +`<div class="tt ${isDone?'done':''}">${emoji(r.type)} ${r.title}</div>`
      +(baseType(r.type)==='exercise' && r.video_link ? `<a class="vlink" href="${r.video_link}" target="_blank" onclick="event.stopPropagation()">▶ 观看跟练视频</a>`:'')
      +`<div class="msg">${r.message||''}</div>`
      +(tags?`<div class="tags">${tags}</div>`:'')
      +`</div><div style="flex-shrink:0">`
      +(isDone
        ?`<button style="font-size:20px;color:var(--g);background:none;border:none;cursor:pointer;padding:4px" onclick="event.stopPropagation();toggleComplete('${r.id}',true)">✓</button>`
        :`<button class="dbtn" onclick="event.stopPropagation();toggleComplete('${r.id}',false)">完成</button>`)
      +`</div></div></div>`;
  });

  html += `<button style="display:block;margin:16px auto 0;font-size:13px;color:var(--s);background:none;border:none;cursor:pointer" onclick="resetToday()">重置今日状态</button>`;
  html += `<button style="display:block;margin:8px auto 0;font-size:13px;color:var(--b);background:none;border:none;cursor:pointer" onclick="exportCalendar()">📅 导出到苹果日历</button>`;

  document.getElementById('dash-content').innerHTML = html;
}

// ─── Calendar Export ───
function exportCalendar() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const enabled = reminders.filter(r => r.is_enabled);

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HealthReminder//CN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';

  enabled.forEach(r => {
    const [h,m] = r.time.split(':').map(Number);
    const dtStart = new Date(todayStart);
    dtStart.setHours(h, m, 0);
    const dtEnd = new Date(dtStart);
    dtEnd.setMinutes(dtStart.getMinutes() + (r.active_hours_end ? 60 : 30));

    const fmt = (d) => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');

    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:${r.id}@health-reminder\r\n`;
    ics += `DTSTART:${fmt(dtStart)}\r\n`;
    ics += `DTEND:${fmt(dtEnd)}\r\n`;
    ics += `SUMMARY:${emoji(r.type)} ${r.title}\r\n`;
    ics += `DESCRIPTION:${r.message||''}\r\n`;
    if (r.interval_minutes) {
      ics += `RRULE:FREQ=MINUTELY;INTERVAL=${r.interval_minutes}\r\n`;
    }
    ics += 'END:VEVENT\r\n';
  });

  ics += 'END:VCALENDAR\r\n';

  const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '健康提醒日历_' + ts() + '.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('.ics 文件已下载！\\n\\n打开文件 → 自动导入 Apple 日历\\n\\n💡 提示：网页版无法直接同步日历，\\n每次修改提醒后需要重新导出。\\n建议添加到主屏幕后每天导出一次。');
}

function _isBlock(r) { return baseType(r.type)==='writing' || (r.active_hours_end && !r.interval_minutes); }
function _isInterval(r) { return r.interval_minutes && r.interval_minutes > 0; }

// ─── Settings ───
// ─── TCM Wellness ───
let tcmSelected = new Set();     // set of symptom IDs (preset ids + 'cust_N' keys)
let tcmCustomMap = {};           // 'cust_N' → display name
let tcmLogs = [];
let tcmLogDate = new Date();     // date for wellness log view
let tcmTab = 'recommend';        // 'recommend' | 'log'
let tcmScores = {};              // { 'YYYY-MM-DD': { energy, sleep, mood, discomfort } }
let tcmAI = {};                  // cached AI results: { symptomKey: {foods:[], teas:[], points:[]} }
let tcmAIKey = '';               // user's API key (stored in localStorage)
let tcmAILoading = false;        // AI request in progress

function renderSett() {
  tcmLogDate = new Date(); // always start on today
  renderTCM();
}

function renderTCM() {
  loadTCMLogs();

  // === sub-tabs at very top ===
  const tabBar = '<div style="display:flex;gap:8px;margin-bottom:10px">'+
    '<button onclick="switchTCMTab(\'recommend\')" style="flex:1;padding:10px;border-radius:10px;border:none;font-size:14px;cursor:pointer;font-weight:600;background:'+(tcmTab==='recommend'?'var(--g)':'#E5E5EA')+';color:'+(tcmTab==='recommend'?'#fff':'var(--t)')+'">🩺 症状推荐</button>'+
    '<button onclick="switchTCMTab(\'log\')" style="flex:1;padding:10px;border-radius:10px;border:none;font-size:14px;cursor:pointer;font-weight:600;background:'+(tcmTab==='log'?'var(--g)':'#E5E5EA')+';color:'+(tcmTab==='log'?'#fff':'var(--t)')+'">📝 养生记录</button>'+
    '</div>';

  // hide symptom tags and guide buttons in log mode
  document.getElementById('tcm-symptom-tags').style.display = tcmTab==='log' ? 'none' : '';
  const gb = document.getElementById('tcm-guide-btns');
  if (gb) gb.style.display = tcmTab==='log' ? 'none' : '';

  if (tcmTab === 'log') {
    document.getElementById('tcm-recommendations').innerHTML = tabBar + renderTCMLogTab();
    return;
  }

  // === RECOMMEND TAB ===
  // build symptom tags inline
  let tagHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">';
  const allEntries = [
    ...TCM_SYMPTOMS.map(s => ({id:s.id, nm:s.nm, em:s.catEm, isCustom:false})),
    ...Object.entries(tcmCustomMap).map(([id, nm]) => ({id, nm, em:'✏️', isCustom:true}))
  ];
  allEntries.forEach(s => {
    const sel = tcmSelected.has(s.id);
    const st = s.isCustom
      ? 'border:1.5px solid '+(sel?'var(--b)':'var(--sep)')+';background:'+(sel?'rgba(0,122,255,.1)':'#fff')+';color:'+(sel?'var(--b)':'var(--t)')
      : 'border:1.5px solid '+(sel?'var(--g)':'var(--sep)')+';background:'+(sel?'rgba(52,199,89,.12)':'#fff');
    const delBtn = (sel || s.isCustom)
      ? '<span onclick="event.stopPropagation();removeSymptom(\''+s.id+'\')" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:2px;margin-right:-2px;border-radius:50%;background:rgba(0,0,0,.08);color:var(--s);font-size:10px;line-height:1;cursor:pointer;transition:all .15s" onmouseover="this.style.background=\'rgba(255,59,48,.15)\';this.style.color=\'var(--r)\'" onmouseout="this.style.background=\'rgba(0,0,0,.08)\';this.style.color=\'var(--s)\'">✕</span>'
      : '';
    tagHtml += '<button onclick="toggleSymptom(\''+s.id+'\')" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:20px;'+st+';font-size:13px;cursor:pointer;white-space:nowrap">'+s.em+' '+s.nm+(sel?' ✓':'')+delBtn+'</button>';
  });
  tagHtml += '</div>';
  tagHtml += '<div style="display:flex;gap:6px;margin-bottom:12px"><input type="text" id="custom-symptom-input" placeholder="输入症状..." style="flex:1;padding:8px 12px;border-radius:20px;border:1.5px dashed var(--sep);font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\')addCustomSymptom()"><button onclick="addCustomSymptom()" style="padding:8px 16px;border-radius:20px;border:none;background:var(--b);color:#fff;font-size:13px;cursor:pointer;white-space:nowrap">＋</button></div>';

  const recEl = document.getElementById('tcm-recommendations');
  if (tcmSelected.size === 0) {
    recEl.innerHTML = tabBar + tagHtml + '<div class="card" style="text-align:center;color:var(--s);padding:24px">👆 点击上方症状标签<br>获取食疗·茶饮·穴位推荐</div>';
    return;
  }

  let html = tabBar + tagHtml;
  const foods = {}; const teas = {}; const points = {}; const blends = {};
  const allKW = buildKeywordMap();

  tcmSelected.forEach(sid => {
    const isCustom = sid.startsWith('cust_');
    const symName = isCustom ? tcmCustomMap[sid] : (TCM_SYMPTOMS.find(s=>s.id===sid)||{}).nm;
    if (!symName) return;

    if (!isCustom && TCM_FOODS[sid]) {
      TCM_FOODS[sid].forEach(f => {
        if (!foods[f.food]) foods[f.food] = { ...f, symptoms: [symName] };
        else if (!foods[f.food].symptoms.includes(symName)) foods[f.food].symptoms.push(symName);
      });
    }
    if (!isCustom && TCM_POINTS[sid]) {
      TCM_POINTS[sid].forEach(p => {
        if (!points[p.point]) points[p.point] = { ...p, symptoms: [symName] };
        else if (!points[p.point].symptoms.includes(symName)) points[p.point].symptoms.push(symName);
      });
    }

    // enhanced matching: preset keywords + character-level matching for custom symptoms
    const kws = isCustom ? smartTokenize(symName) : (allKW[sid] || smartTokenize(symName));

    TEAS.forEach(t => {
      const txt = t.suitableFor + t.description + t.effects.join('');
      if (kws.some(kw => txt.includes(kw)) && !teas[t.key]) teas[t.key] = { ...t, matchSymptom: symName };
    });
    TEA_BLENDS.forEach(b => {
      const txt = b.for + b.effects.join('') + b.name + b.ingredients.join('');
      if (kws.some(kw => txt.includes(kw)) && !blends[b.name]) blends[b.name] = b;
    });
    Object.entries(TCM_FOODS).forEach(([fk, flist]) => {
      flist.forEach(f => {
        const ftxt = f.food + f.action + f.note;
        if (kws.some(kw => ftxt.includes(kw)) && !foods[f.food]) foods[f.food] = { ...f, symptoms: [symName] };
      });
    });
    Object.entries(TCM_POINTS).forEach(([pk, plist]) => {
      plist.forEach(p => {
        const ptxt = p.point + p.loc + p.tech + p.meridian;
        if (kws.some(kw => ptxt.includes(kw)) && !points[p.point]) points[p.point] = { ...p, symptoms: [symName] };
      });
    });

    // merge cached AI results for this symptom
    const aiResult = tcmAI[symName];
    if (aiResult) {
      (aiResult.foods||[]).forEach(f => { if (!foods[f.food]) foods[f.food] = { ...f, symptoms: [symName+'🤖'] }; });
      (aiResult.teas||[]).forEach(t => { if (!teas[t.key]) teas[t.key] = { ...t, matchSymptom: symName+'🤖' }; });
      (aiResult.points||[]).forEach(p => { if (!points[p.point]) points[p.point] = { ...p, symptoms: [symName+'🤖'] }; });
    }
  });

  // === Food recommendations — 3-col cards ===
  html += '<div class="st">🥗 中医食疗推荐</div>';
  const foodList = Object.values(foods).slice(0, 9);
  if (foodList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配的食疗方案</div>';
  else {
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px">';
    foodList.forEach(f => {
      html += '<div style="background:var(--card);border-radius:12px;padding:10px 8px;text-align:center;border-left:3px solid var(--g)">'
        +'<div style="font-size:20px;margin-bottom:2px">🌿</div>'
        +'<div style="font-size:13px;font-weight:600;margin-bottom:3px">'+f.food+'</div>'
        +'<span style="font-size:10px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:8px">性'+f.nature+'</span>'
        +'<div style="font-size:11px;color:var(--g);font-weight:500;margin-top:4px">'+f.action+'</div>'
        +'<div style="font-size:10px;color:var(--s);margin-top:2px;line-height:1.4">'+f.note+'</div>'
        +'</div>';
    });
    html += '</div>';
  }

  // === Tea recommendations — 3-col cards ===
  html += '<div class="st">🍵 茶饮推荐</div>';
  const blendList = Object.values(blends).slice(0, 6);
  const teaList = Object.values(teas).slice(0, 6);
  if (blendList.length === 0 && teaList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配茶饮</div>';
  else {
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px">';
    // blends first
    blendList.forEach(b => {
      html += '<div style="background:var(--card);border-radius:12px;padding:10px 8px;text-align:center;border-left:3px solid var(--p)">'
        +'<div style="font-size:20px;margin-bottom:2px">🍵</div>'
        +'<div style="font-size:12px;font-weight:600;margin-bottom:2px">'+b.name+'</div>'
        +'<div style="font-size:10px;color:var(--s);margin-bottom:3px">'+b.ingredients.join('+')+'</div>'
        +'<span style="font-size:10px;background:rgba(175,82,222,.08);color:var(--p);padding:1px 6px;border-radius:8px">搭配</span>'
        +'<div style="font-size:10px;color:var(--g);margin-top:4px;line-height:1.3">✅ '+b.for+'</div>'
        +'<div style="font-size:10px;color:var(--o);margin-top:2px;line-height:1.3">⚠️ '+b.caution+'</div>'
        +'</div>';
    });
    // single teas
    teaList.forEach(t => {
      html += '<div style="background:var(--card);border-radius:12px;padding:10px 8px;text-align:center;border-left:3px solid var(--b)">'
        +'<div style="font-size:20px;margin-bottom:2px">🍵</div>'
        +'<div style="font-size:12px;font-weight:600;margin-bottom:3px">'+t.name+'</div>'
        +'<span style="font-size:10px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:8px">性'+t.nature+'</span>'
        +'<div style="font-size:10px;color:var(--s);margin-top:4px;line-height:1.4">'+t.effects.slice(0,4).join('·')+'</div>'
        +'<div style="font-size:10px;color:var(--o);margin-top:2px;line-height:1.3">⚠️ '+t.caution+'</div>'
        +'</div>';
    });
    html += '</div>';
  }

  // === Acupressure — 3-col cards ===
  html += '<div class="st">💆 穴位按摩 · 经络推拿</div>';
  const pointList = Object.values(points).slice(0, 9);
  if (pointList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配穴位</div>';
  else {
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px">';
    pointList.forEach(p => {
      html += '<div style="background:var(--card);border-radius:12px;padding:10px 8px;text-align:center;border-left:3px solid var(--o)">'
        +'<div style="font-size:20px;margin-bottom:2px">📍</div>'
        +'<div style="font-size:12px;font-weight:600;margin-bottom:2px">'+p.point+'</div>'
        +'<span style="font-size:10px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:8px">'+p.meridian+'</span>'
        +'<div style="font-size:10px;color:var(--s);margin-top:4px;line-height:1.3">'+p.loc+'</div>'
        +'<div style="font-size:10px;color:var(--g);margin-top:2px;line-height:1.3">'+p.tech+'</div>'
        +'</div>';
    });
    html += '</div>';
  }

  // AI recommendation button for custom symptoms
  const hasCustom = Array.from(tcmSelected).some(id => id.startsWith('cust_'));
  if (hasCustom) {
    const customNames = Array.from(tcmSelected).filter(id => id.startsWith('cust_')).map(id => tcmCustomMap[id]).filter(Boolean);
    const allCached = customNames.every(n => tcmAI[n]);
    if (!allCached && tcmAIKey) {
      html += '<button onclick="callTCMAI()" id="tcm-ai-btn" style="display:block;width:100%;padding:12px;margin-top:12px;border-radius:12px;border:1.5px dashed var(--p);background:rgba(175,82,222,.04);color:var(--p);font-size:14px;font-weight:600;cursor:pointer"'+(tcmAILoading?' disabled':'')+'>'+(tcmAILoading?'⏳ AI分析中...':'🤖 AI 智能推荐')+'</button>';
    } else if (!tcmAIKey) {
      html += '<button onclick="showAIKeyPrompt()" style="display:block;width:100%;padding:12px;margin-top:12px;border-radius:12px;border:1.5px dashed var(--sep);background:#F9F9F9;color:var(--s);font-size:14px;cursor:pointer">🤖 AI 智能推荐 <span style="font-size:11px;opacity:.7">（需配置API Key）</span></button>';
    }
  }

  recEl.innerHTML = html;
}

// ─── AI Recommendation Engine ───
function showAIKeyPrompt() {
  const key = prompt('请输入 AI API Key（支持 OpenAI / Groq 等兼容接口）：\n\n🔑 API Key:', tcmAIKey || '');
  if (key !== null) {
    tcmAIKey = key.trim();
    localStorage.setItem('tcm_aikey', tcmAIKey);
    if (tcmAIKey) {
      const ep = prompt('API 地址（默认 Groq 免费接口）：\n留空使用默认 Groq API', 'https://api.groq.com/openai/v1/chat/completions');
      if (ep !== null && ep.trim()) localStorage.setItem('tcm_aiendpoint', ep.trim());
      showToast('✅ AI 已配置，点击「🤖 AI 智能推荐」试试吧');
      renderTCM();
    }
  }
}

async function callTCMAI() {
  if (tcmAILoading) return;
  const customNames = Array.from(tcmSelected).filter(id => id.startsWith('cust_')).map(id => tcmCustomMap[id]).filter(Boolean);
  const uncached = customNames.filter(n => !tcmAI[n]);
  if (uncached.length === 0) { renderTCM(); return; }

  tcmAILoading = true;
  const btn = document.getElementById('tcm-ai-btn');
  if (btn) { btn.textContent = '⏳ AI分析中...'; btn.disabled = true; }

  const endpoint = localStorage.getItem('tcm_aiendpoint') || 'https://api.groq.com/openai/v1/chat/completions';
  const model = endpoint.includes('groq') ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

  const prompt = `你是中医养生专家。请针对以下症状，推荐中医食疗、茶饮和穴位按摩方案。严格按JSON格式输出，不要markdown代码块：
{
  "foods": [{"food":"食物名","nature":"性味（如温/寒/平）","action":"功效","note":"用法"}],
  "teas": [{"key":"茶名拼音","name":"茶名","nature":"性味","effects":["功效1","功效2"],"caution":"注意事项"}],
  "points": [{"point":"穴位名","meridian":"经络","loc":"位置","tech":"手法"}]
}
症状：${uncached.join('、')}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tcmAIKey },
      body: JSON.stringify({ model, messages: [{role:'user',content:prompt}], max_tokens: 2048, temperature: 0.7 })
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || '';
    // strip markdown fences
    text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(text);
    // cache results for all queried symptoms
    uncached.forEach(name => {
      tcmAI[name] = {
        foods: (parsed.foods||[]).slice(0, 6),
        teas: (parsed.teas||[]).slice(0, 4),
        points: (parsed.points||[]).slice(0, 4),
      };
    });
    try { localStorage.setItem('tcm_ai', JSON.stringify(tcmAI)); } catch(e) {}
    showToast('✅ AI 推荐已生成');
    renderTCM();
  } catch(e) {
    showToast('❌ AI 请求失败: ' + (e.message||'未知错误'));
    console.error('TCM AI error:', e);
  } finally {
    tcmAILoading = false;
  }
}

// Enhanced tokenizer for custom symptoms: breaks into characters + 2-char substrings
function smartTokenize(text) {
  const tokens = [text]; // full text
  const chars = text.replace(/[^一-鿿]/g, ''); // Chinese chars only
  for (let i = 0; i < chars.length; i++) {
    tokens.push(chars[i]);
    if (i + 1 < chars.length) tokens.push(chars.slice(i, i+2));
  }
  return [...new Set(tokens)]; // dedupe
}

function buildKeywordMap() {
  return {
    fatigue: ['疲劳','乏力','气虚','体虚','没劲','没精神','累','困倦'],
    insomnia: ['失眠','多梦','入睡','睡眠','睡不好','睡不着','易醒'],
    poorDigestion: ['消化','胃','积食','不消化','没胃口','食欲'],
    constipation: ['便秘','拉不出','大便','排便'],
    bloating: ['腹胀','胀气','胀','嗳气','打嗝'],
    coldHands: ['手脚冰凉','怕冷','畏寒','手脚冷','冰冷'],
    acne: ['长痘','痤疮','痘痘','粉刺','皮肤出油'],
    dryMouth: ['口干','口渴','舌燥','咽干','喉咙干'],
    headache: ['头痛','头疼','偏头痛','头胀'],
    eyeStrain: ['眼干','眼涩','眼疲劳','视物模糊','用眼'],
    neckPain: ['肩颈','颈椎','脖子','颈肩','落枕'],
    backPain: ['腰痛','腰酸','腰背','背痛','腰疼'],
    anxiety: ['焦虑','烦躁','心烦','抑郁','郁闷','情绪','压力'],
    weightGain: ['减肥','胖','体重','发胖','肥胖'],
    cold: ['感冒','鼻塞','流涕','受寒','着凉'],
    menstrual: ['痛经','月经','经期','例假','大姨妈'],
    hairLoss: ['脱发','掉发','头发','发质'],
    skinDry: ['皮肤干','干燥','干裂','皮肤'],
  };
}

function switchTCMTab(tab) {
  tcmTab = tab;
  renderTCM();
}

function toggleSymptom(id) {
  if (tcmSelected.has(id)) tcmSelected.delete(id);
  else tcmSelected.add(id);
  renderTCM();
}

function removeSymptom(id) {
  tcmSelected.delete(id);
  if (id.startsWith('cust_')) delete tcmCustomMap[id];
  // also remove orphaned custom entries not in tcmSelected
  Object.keys(tcmCustomMap).forEach(k => {
    if (!tcmSelected.has(k)) delete tcmCustomMap[k];
  });
  renderTCM();
}

function addCustomSymptom() {
  const inp = document.getElementById('custom-symptom-input');
  if (!inp || !inp.value.trim()) return;
  const name = inp.value.trim();
  const id = 'cust_' + Date.now();
  tcmCustomMap[id] = name;
  tcmSelected.add(id);
  inp.value = '';
  renderTCM();
}

// TCM Log Tab
function renderTCMLogTab() {
  const logDateStr = ts(tcmLogDate);
  const todayStr = ts();
  const isToday = logDateStr === todayStr;
  const todayLogs = tcmLogs.filter(l => l.date === logDateStr);

  const dateLabel = isToday ? '今天' : fmtDateCN(tcmLogDate);

  let h = '';
  // date navigator
  h += '<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:10px">';
  h += '<button onclick="shiftTCMLogDate(-1)" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;color:var(--g)">‹</button>';
  h += '<div style="text-align:center"><div style="font-weight:600;font-size:15px">'+dateLabel+'</div><div style="font-size:11px;color:var(--s)">'+logDateStr+'</div></div>';
  h += '<button onclick="shiftTCMLogDate(1)" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;color:var(--g)"'+(isToday?' disabled style="opacity:.3"':'')+'>›</button>';
  h += '</div>';
  if (!isToday) {
    h += '<button onclick="tcmLogDate=new Date();renderTCM()" style="display:block;margin:0 auto 10px;font-size:12px;color:var(--b);background:none;border:none;cursor:pointer">回到今天</button>';
  }

  // ── Daily scoring + log entries in one unified card ──
  const score = tcmScores[logDateStr] || {};
  const dims = [
    {key:'energy', emoji:'⚡', label:'精力状态'},
    {key:'sleep', emoji:'🌙', label:'睡眠质量'},
    {key:'mood', emoji:'💛', label:'心情情绪'},
  ];
  h += '<div class="card" style="padding:14px;margin-bottom:0;border-radius:14px 14px 0 0">';
  h += '<div style="font-weight:600;font-size:14px;margin-bottom:10px">📊 今日评估</div>';
  dims.forEach(d => {
    const cur = score[d.key] || 0;
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="font-size:14px;width:22px;text-align:center">'+d.emoji+'</span><span style="font-size:12px;width:52px;color:var(--s);flex-shrink:0">'+d.label+'</span><div style="display:flex;gap:4px;flex:1">';
    for (let i = 1; i <= 5; i++) {
      h += '<button onclick="setTCMScore(\''+d.key+'\','+i+')" style="flex:1;padding:6px 0;border-radius:8px;border:1.5px solid '+(cur===i?'var(--g)':'var(--sep)')+';background:'+(cur===i?'rgba(52,199,89,.12)':'#fff')+';font-size:12px;cursor:pointer;font-weight:'+(cur===i?'600':'400')+';color:'+(cur===i?'var(--g)':'var(--s)')+'">'+i+'</button>';
    }
    h += '</div></div>';
  });
  // discomfort + save button row
  h += '<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span style="font-size:14px;width:22px;text-align:center">🤒</span><span style="font-size:12px;width:52px;color:var(--s);flex-shrink:0">今日不适</span><input type="text" id="tcm-discomfort-input" value="'+(score.discomfort||'')+'" placeholder="如：头疼、胃胀..." style="flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--sep);font-size:12px;outline:none"></div>';
  h += '<button onclick="saveTCMAssessment()" style="display:block;width:100%;margin-top:10px;padding:10px;border-radius:10px;border:none;background:var(--g);color:#fff;font-size:14px;font-weight:600;cursor:pointer">💾 保存评估</button>';
  h += '</div>';

  // log entries — attached to assessment card
  h += '<div style="background:var(--card);border-radius:0 0 14px 14px;padding:0 14px 14px;border-top:1px solid #F2F2F7">';
  if (todayLogs.length === 0) {
    h += '<div style="text-align:center;color:var(--s);padding:16px 0 8px;font-size:13px">'+(isToday?'今天还没有记录':'当天没有记录')+'</div>';
  } else {
    todayLogs.forEach(l => {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F2F2F7"><div><span style="font-weight:500;font-size:13px">'+(l.emoji||'✅')+' '+l.text+'</span><span style="font-size:11px;color:var(--s);margin-left:8px">'+l.time+'</span></div><button onclick="deleteTCMLog(\''+l.id+'\')" style="background:none;border:none;color:var(--r);cursor:pointer;font-size:14px;opacity:.4">✕</button></div>';
    });
  }
  h += '</div>';

  h += '<div class="st" style="margin-top:16px">快捷记录</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
  [{emoji:'🍵',text:'喝茶养生'},{emoji:'💆',text:'穴位按摩'},{emoji:'🧘',text:'太极/八段锦'},{emoji:'🦶',text:'泡脚'},{emoji:'☀️',text:'晒太阳'},{emoji:'🧎',text:'冥想静坐'},{emoji:'🍲',text:'食疗调理'},{emoji:'📿',text:'经络推拿'},{emoji:'🌿',text:'艾灸'},{emoji:'💪',text:'五禽戏'},{emoji:'🧑‍🤝‍🧑',text:'站桩'},{emoji:'😴',text:'子午觉'}].forEach(q => {
    h += '<button onclick="addTCMLog(\''+q.emoji+'\',\''+q.text+'\')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--sep);background:#fff;font-size:12px;cursor:pointer">'+q.emoji+' '+q.text+'</button>';
  });
  h += '</div>';

  h += '<div style="display:flex;gap:6px;margin-top:12px"><input type="text" id="tcm-log-input" placeholder="自定义记录..." style="flex:1;padding:8px 12px;border-radius:20px;border:1.5px dashed var(--sep);font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\')addCustomTCMLog()"><button onclick="addCustomTCMLog()" style="padding:8px 14px;border-radius:20px;border:none;background:var(--g);color:#fff;font-size:13px;cursor:pointer">记录</button></div>';

  const pastLogs = tcmLogs.filter(l => l.date !== logDateStr).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (pastLogs.length > 0) {
    h += '<div class="st" style="margin-top:20px">历史记录</div>';
    let lastDate = '';
    pastLogs.forEach(l => {
      if (l.date !== lastDate) {
        h += '<div style="font-size:12px;font-weight:600;color:var(--s);margin:8px 0 4px;cursor:pointer" onclick="tcmLogDate=new Date(\''+l.date+'\');renderTCM()">'+l.date+'</div>';
        lastDate = l.date;
      }
      h += '<div style="font-size:13px;padding:4px 8px;color:var(--s)">'+(l.emoji||'✅')+' '+l.text+' <span style="font-size:10px">'+l.time+'</span></div>';
    });
  }

  return h;
}

function shiftTCMLogDate(n) {
  tcmLogDate.setDate(tcmLogDate.getDate() + n);
  // don't go past today
  const today = new Date();
  if (tcmLogDate > today) { tcmLogDate = new Date(today); return; }
  renderTCM();
}

function fmtDateCN(d) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return '昨天';
  const t = new Date(now); t.setDate(t.getDate()+1);
  if (d.toDateString() === t.toDateString()) return '明天';
  return (d.getMonth()+1)+'月'+d.getDate()+'日';
}

// TCM Log functions (localStorage)
function loadTCMLogs() {
  try { tcmLogs = JSON.parse(localStorage.getItem('tcm_logs')||'[]'); } catch(e) { tcmLogs = []; }
  try { tcmScores = JSON.parse(localStorage.getItem('tcm_scores')||'{}'); } catch(e) { tcmScores = {}; }
  try { tcmAI = JSON.parse(localStorage.getItem('tcm_ai')||'{}'); } catch(e) { tcmAI = {}; }
  tcmAIKey = localStorage.getItem('tcm_aikey') || '';
}
function saveTCMLogs() {
  localStorage.setItem('tcm_logs', JSON.stringify(tcmLogs));
}
function saveTCMScores() {
  localStorage.setItem('tcm_scores', JSON.stringify(tcmScores));
}
function setTCMScore(key, val) {
  const ds = ts(tcmLogDate);
  if (!tcmScores[ds]) tcmScores[ds] = {};
  tcmScores[ds][key] = val;
  saveTCMScores();
  renderTCM();
}
function saveTCMAssessment() {
  const ds = ts(tcmLogDate);
  if (!tcmScores[ds]) tcmScores[ds] = {};
  const inp = document.getElementById('tcm-discomfort-input');
  tcmScores[ds].discomfort = (inp?.value || '').trim();
  saveTCMScores();

  // remove previous assessment entries for this date
  tcmLogs = tcmLogs.filter(l => !(l.date === ds && l.type === 'assessment'));

  // create log entries for each scored dimension
  const now = new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
  const score = tcmScores[ds];
  const dims = [
    {key:'energy', emoji:'⚡', label:'精力状态'},
    {key:'sleep', emoji:'🌙', label:'睡眠质量'},
    {key:'mood', emoji:'💛', label:'心情情绪'},
  ];
  dims.forEach(d => {
    const v = score[d.key];
    if (v) {
      tcmLogs.push({id: Date.now().toString()+'_'+d.key, emoji:d.emoji, text:d.label+' · '+v+'分', date:ds, time:now, type:'assessment'});
    }
  });
  // discomfort entry
  if (score.discomfort) {
    tcmLogs.push({id: Date.now().toString()+'_discomfort', emoji:'🤒', text:'不适：'+score.discomfort, date:ds, time:now, type:'assessment'});
  }

  saveTCMLogs();
  showToast('✅ 评估已保存');
  renderTCM();
}
function saveTCMLogs() {
  localStorage.setItem('tcm_logs', JSON.stringify(tcmLogs));
}
function addTCMLog(emoji, text) {
  tcmLogs.push({id: Date.now().toString(), emoji, text, date: ts(tcmLogDate), time: new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
  saveTCMLogs();
  renderTCM();
}
function addCustomTCMLog() {
  const inp = document.getElementById('tcm-log-input');
  if (!inp || !inp.value.trim()) return;
  tcmLogs.push({id: Date.now().toString(), emoji: '✅', text: inp.value.trim(), date: ts(tcmLogDate), time: new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
  saveTCMLogs();
  renderTCM();
}
function deleteTCMLog(id) {
  tcmLogs = tcmLogs.filter(l => l.id !== id);
  saveTCMLogs();
  renderTCM();
}

async function deleteReminder(id) {
  if (!confirm('确定删除这个提醒吗？此操作不可恢复。')) return;
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) { alert('删除失败: ' + error.message); return; }
  reminders = reminders.filter(r => r.id !== id);
  renderSett();
  const cp = document.querySelector('.pane.on');
  if (cp && cp.id === 'pane-dashboard') renderDash();
}

// ─── Edit Reminder ───
function openEdit(id) {
  const r = reminders.find(x => x.id===id);
  if (!r) return;
  editing = Object.assign({}, r);
  renderEditForm();
  document.getElementById('mod-edit').style.display = 'flex';
}

function renderEditForm() {
  const r = editing;
  if (!r) return;
  let h = `<div class="frm"><label>启用</label>`
    +`<label class="tgl" style="display:inline-block"><input type="checkbox" ${r.is_enabled?'checked':''} onchange="editing.is_enabled=this.checked"><span class="sl"></span></label></div>`
    +`<div class="frm"><label>图标</label><input type="text" value="${emoji(r.type)}" maxlength="4" onchange="var em=this.value||'⏰';editing._newEmoji=em" style="font-size:24px;width:60px;text-align:center"></div>`
    +`<div class="frm"><label>提醒名称</label><input type="text" value="${r.title}" onchange="editing.title=this.value"></div>`
    +`<div class="frm"><label>开始时间</label><input type="time" value="${r.time.slice(0,5)}" onchange="editing.time=this.value+':00'"></div>`
    +`<div class="frm"><label>结束时间（可选）</label><input type="time" value="${(r.active_hours_end||'').slice(0,5)}" onchange="var v=this.value;editing.active_hours_end=v?v+':00':null"><div class="hint">设置后会在结束时也发提醒</div></div>`
    +`<div class="frm"><label>重复间隔</label><select onchange="editing.interval_minutes=this.value?parseInt(this.value):null">
      <option value="" ${!r.interval_minutes?'selected':''}>不重复</option>
      <option value="5" ${r.interval_minutes===5?'selected':''}>5 分钟</option>
      <option value="10" ${r.interval_minutes===10?'selected':''}>10 分钟</option>
      <option value="20" ${r.interval_minutes===20?'selected':''}>20 分钟</option>
      <option value="30" ${r.interval_minutes===30?'selected':''}>30 分钟</option>
      <option value="45" ${r.interval_minutes===45?'selected':''}>45 分钟</option>
      <option value="60" ${r.interval_minutes===60?'selected':''}>60 分钟</option>
      <option value="90" ${r.interval_minutes===90?'selected':''}>90 分钟</option>
      <option value="120" ${r.interval_minutes===120?'selected':''}>120 分钟</option>
    </select><div class="hint">设置后在活跃时段内每隔所选时间重复提醒</div></div>`
    +`<div class="frm"><label>提醒内容</label><textarea onchange="editing.message=this.value" rows="2">${r.message||''}</textarea></div>`;

  if (baseType(r.type)==='exercise') {
    h += `<div class="frm"><label>🏃 跟练视频链接</label><input type="url" placeholder="YouTube / Bilibili 链接" value="${r.video_link||''}" onchange="editing.video_link=this.value"><div class="hint">保存后仪表盘可一键打开视频</div></div>`;
  }
  if (baseType(r.type)==='tea') {
    h += `<div class="frm"><label>🍵 茶种</label><select onchange="editing.selected_tea_key=this.value">${TEAS.map(t=>`<option value="${t.key}" ${r.selected_tea_key===t.key?'selected':''}>${t.name}（${t.nature}）</option>`).join('')}</select></div>`;
    if (r.selected_tea_key) {
      const t = TEAS.find(x => x.key===r.selected_tea_key);
      if (t) h += `<div class="card" style="margin-top:8px"><div style="font-size:13px;font-weight:600">${t.name} · ${t.englishName}</div><div style="font-size:12px;color:var(--s)">性${t.nature} · 味${t.taste} · 归经${t.meridians}</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${t.effects.map(e=>`<span style="font-size:11px;background:rgba(52,199,89,.1);padding:2px 6px;border-radius:4px">${e}</span>`).join('')}</div><div style="font-size:12px;color:var(--s)">${t.description}</div><div style="font-size:12px;color:var(--g)">✅ ${t.suitableFor}</div><div style="font-size:12px;color:var(--o)">⚠️ ${t.caution}</div></div>`;
    }
  }

  // delete button at the bottom of edit form
  h += `<button onclick="event.stopPropagation();closeMod('mod-edit');deleteReminder('${r.id}')" style="display:block;width:100%;padding:14px;margin-top:12px;background:none;border:1.5px solid var(--r);border-radius:10px;color:var(--r);font-size:16px;cursor:pointer">🗑️ 删除此提醒</button>`;

  document.getElementById('edit-body').innerHTML = h;
}

async function saveEdit() {
  if (!editing) return;
  const r = editing;
  // handle emoji change: update type prefix
  let newType = r.type;
  if (r._newEmoji && r._newEmoji !== emoji(r.type)) {
    const m = r.type.match(/^(.+?)(_\d+)?$/);
    if (m && m[2]) {
      newType = r._newEmoji + m[2]; // keep timestamp suffix
    } else {
      newType = r._newEmoji; // preset type, replace entirely
    }
  }
  await supabase.from('reminders').update({
    type: newType,
    is_enabled: r.is_enabled, time: r.time, message: r.message,
    title: r.title,
    interval_minutes: r.interval_minutes||null,
    active_hours_end: r.active_hours_end||null,
    active_hours_start: r.interval_minutes ? r.time : null,
    video_link: r.video_link||null, selected_tea_key: r.selected_tea_key||null,
  }).eq('id', r.id);
  const local = reminders.find(x=>x.id===r.id);
  if (local) {
    Object.assign(local, r);
    local.type = newType;
  }
  closeMod('mod-edit');
  renderSett();
}


// ─── Diet ───
function renderDiet() {
  const covered = new Set(meals.flatMap(e => e.food_groups || []));
  const daily = FG_DAILY;
  const weekly = FG_WEEKLY;
  const limited = FG_LIMIT;
  const cc = daily.filter(t => covered.has(t)).length;
  const vegCount = FG_VEG.filter(k => covered.has(k)).length;
  const pct = cc / daily.length;
  const ringP = 2*Math.PI*15.5;

  let h = '';

  // date header
  h += `<div class="card flex"><button class="btn" onclick="shiftDiet(-1)">‹</button><span style="font-weight:600">${fmtDate(dietDate)}</span><button class="btn" onclick="shiftDiet(1)">›</button><button style="font-size:13px;color:var(--g);background:none;border:none;cursor:pointer;padding:4px 8px" onclick="dietDate=new Date();loadMeals().then(renderDiet)">今天</button></div>`;

  // progress
  h += `<div class="card" style="display:flex;align-items:center;gap:16px"><div class="ring" style="width:64px;height:64px"><svg viewBox="0 0 36 36" width="64" height="64"><circle class="ring-bg" cx="18" cy="18" r="15.5"/><circle class="ring-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${ringP}" stroke-dashoffset="${ringP*(1-pct)}"/></svg><div class="ring-t" style="font-size:14px">${Math.round(pct*100)}%</div></div><div style="flex:1"><div style="font-weight:600">每日核心食物</div><div style="font-size:13px;color:var(--s)">已覆盖 ${cc}/${daily.length} 类 · 蔬菜 ${vegCount}/5 种</div></div></div>`;

  // daily checklist
  h += `<div class="st">🥇 每日核心食物</div><div class="grid2">${daily.map(k=>{
    const info = FG[k];
    const ok = covered.has(k);
    return `<div class="chk"><span style="color:${ok?'var(--g)':'#C7C7CC'}">${ok?'✅':'⭕'}</span><div><div class="nm">${info.em} ${info.nm}</div><div class="fq">${info.fq}</div></div></div>`;
  }).join('')}</div>`;

  // weekly with frequency subtitle
  h += `<div class="st">📆 适量摄入</div><div class="fbar">${weekly.map(k=>{
    const info = FG[k]; const ok = covered.has(k);
    return `<div class="fitem"><div style="font-size:22px;opacity:${ok?1:.4}">${info.em}</div><div class="nm" style="color:${ok?'var(--t)':'var(--s)'}">${info.nm}</div><div style="font-size:10px;color:var(--s);margin-top:1px">${info.fq}</div></div>`;
  }).join('')}</div>`;

  // limited warning
  const lim = limited.filter(k=>covered.has(k));
  if (lim.length) {
    h += `<div class="card" style="border-left:4px solid var(--o)"><div style="color:var(--o);font-weight:600;font-size:13px">⚠️ 限食</div><div style="margin-top:4px">${lim.map(k=>FG[k].em+' '+FG[k].nm).join(' ')}</div></div>`;
  }

  // meal entries
  h += `<div class="st">📋 餐食记录</div>`;
  if (meals.length === 0) {
    h += `<p style="text-align:center;color:var(--s);margin:20px 0">暂无记录</p>`;
  }
  meals.forEach(e => {
    const t = new Date(e.time);
    const ti = t.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    const mi = MT[e.meal_type]||{em:'🍽️',nm:e.meal_type};
    h += `<div class="meal"><div><div class="em">${mi.em}</div><div class="tm">${ti}</div></div><div class="ct"><div class="name">${mi.nm}</div><div class="tags">${(e.food_groups||[]).map(g=>`<span>${(FG[g]||{}).em||''} ${(FG[g]||{}).nm||g}</span>`).join('')}</div>${e.notes?`<div class="notes">${e.notes}</div>`:''}</div><button class="del" onclick="editMeal('${e.id}')" style="font-size:16px;background:none;border:none;cursor:pointer;padding:4px;opacity:.5">✏️</button><button class="del" onclick="delMeal('${e.id}')">🗑️</button></div>`;
  });

  document.getElementById('diet-content').innerHTML = h;
}

function fmtDate(d) {
  const now = new Date();
  if (d.toDateString()===now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(y.getDate()-1);
  if (d.toDateString()===y.toDateString()) return '昨天';
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

async function shiftDiet(n) {
  dietDate.setDate(dietDate.getDate()+n);
  await loadMeals();
  renderDiet();
}

async function loadMeals() {
  const { data } = await supabase.from('meal_entries').select('*').eq('date',ts(dietDate)).order('time');
  meals = data || [];
}

let _editingMealId = null;

function editMeal(id) {
  const e = meals.find(m => m.id === id);
  if (!e) return;
  _editingMealId = id;
  logMealType = e.meal_type;
  logGroups = new Set(e.food_groups || []);
  logNotes = e.notes || '';
  renderLogForm();
  document.getElementById('mod-meal').style.display = 'flex';
}

async function delMeal(id) {
  await supabase.from('meal_entries').delete().eq('id',id);
  meals = meals.filter(e => e.id!==id);
  renderDiet();
}

// ─── Log Meal ───
function showLogMeal() {
  _editingMealId = null;
  logMealType = 'lunch'; logGroups = new Set(); logNotes = '';
  renderLogForm();
  document.getElementById('mod-meal').style.display = 'flex';
}

function renderLogForm() {
  const daily = FG_DAILY;
  const weekly = FG_WEEKLY;
  const limited = FG_LIMIT;

  function fgBtns(grps,label) {
    return `<div style="font-size:13px;font-weight:600;color:var(--s);margin:12px 0 4px">${label}</div><div class="fgrid">${grps.map(k=>{
      const info = FG[k]; const sel = logGroups.has(k);
      return `<button class="fbtn ${sel?'sel':''}" onclick="togFG('${k}')">${info.em} ${info.nm}<br><span style="font-size:10px;opacity:.7">${info.fq}</span></button>`;
    }).join('')}</div>`;
  }

  document.getElementById('meal-body').innerHTML =
    `<div class="frm"><label>🤖 智能输入（输入吃了什么，自动分类）</label><div style="display:flex;gap:8px"><input type="text" id="ai-food-input" placeholder="例如：早餐吃了菠菜鸡蛋和燕麦" style="flex:1;padding:10px;border-radius:10px;border:1.5px solid var(--sep);font-size:15px"><button onclick="aiClassify()" style="padding:10px 16px;background:var(--b);color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;white-space:nowrap">识别</button></div><div id="ai-result" style="margin-top:6px;font-size:12px;color:var(--s)"></div></div>`
    + `<div class="frm"><label>餐次</label><div class="mt-sel">${Object.entries(MT).map(([k,v])=>`<button class="mt-btn ${logMealType===k?'sel':''}" onclick="setMT('${k}')">${v.em} ${v.nm}</button>`).join('')}</div></div>`
    + fgBtns(daily,'🥇 每日核心')
    + fgBtns(weekly,'📆 适量摄入')
    + fgBtns(limited,'⚠️ 注意限量')
    + `<div class="frm"><label>备注</label><textarea oninput="logNotes=this.value" rows="2">${logNotes}</textarea></div>`;
}

function setMT(k) { logMealType = k; renderLogForm(); }
function togFG(k) { if (logGroups.has(k)) logGroups.delete(k); else logGroups.add(k); renderLogForm(); }

function aiClassify() {
  const input = document.getElementById('ai-food-input');
  const result = document.getElementById('ai-result');
  if (!input || !input.value.trim()) { result.textContent = '请输入食物描述'; return; }
  const matched = classifyFood(input.value);
  if (matched.length === 0) {
    result.innerHTML = '<span style="color:var(--o)">未识别到食物，请手动选择下方分类</span>';
    return;
  }
  // auto-select matched groups
  matched.forEach(k => logGroups.add(k));
  renderLogForm();
  // show result summary
  const names = matched.map(k => FG[k].em + FG[k].nm).join('、');
  result.innerHTML = `<span style="color:var(--g)">✅ 识别到：${names}</span>`;
  // restore input value after re-render
  setTimeout(() => {
    const inp = document.getElementById('ai-food-input');
    if (inp) inp.value = input.value;
  }, 50);
}

async function saveMeal() {
  if (logGroups.size===0) return;
  if (_editingMealId) {
    await supabase.from('meal_entries').update({
      meal_type: logMealType,
      food_groups: Array.from(logGroups),
      notes: logNotes,
    }).eq('id', _editingMealId);
  } else {
    await supabase.from('meal_entries').insert({
      meal_type: logMealType, date: ts(dietDate), time: new Date().toISOString(),
      food_groups: Array.from(logGroups), notes: logNotes,
    });
  }
  _editingMealId = null;
  closeMod('mod-meal');
  await loadMeals();
  renderDiet();
}


// ─── Guides ───
function showTeaGuide() {
  document.getElementById('tea-body').innerHTML = TEAS.map(t =>
    `<div class="tea-card"><div class="n">${t.name} <span style="font-size:13px;color:var(--s);font-weight:400">${t.englishName}</span></div>`
    +`<div style="font-size:12px;color:var(--s)">性${t.nature} · 味${t.taste} · 归经${t.meridians}</div>`
    +`<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${t.effects.map(e=>`<span style="font-size:11px;background:#F2F2F7;padding:2px 8px;border-radius:4px">${e}</span>`).join('')}</div>`
    +`<div style="font-size:13px;line-height:1.5;margin:4px 0">${t.description}</div>`
    +`<div style="font-size:12px;color:var(--g)">✅ ${t.suitableFor}</div>`
    +`<div style="font-size:12px;color:var(--o)">⚠️ ${t.caution}</div></div>`
  ).join('');
  document.getElementById('mod-tea').style.display = 'flex';
}

function showMedGuide() {
  const daily = FG_DAILY;
  const weekly = FG_WEEKLY;
  const limited = FG_LIMIT;

  function cards(grps) {
    return grps.map(k => {
      const info = FG[k];
      return `<div class="card"><div style="font-weight:600">${info.em} ${info.nm}</div><div style="font-size:12px;color:var(--s)">${info.fq}</div><div style="font-size:13px;color:var(--t);margin:4px 0">${info.ds}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${info.ex.map(e=>`<span style="font-size:11px;background:#F2F2F7;padding:2px 6px;border-radius:4px">${e}</span>`).join('')}</div></div>`;
    }).join('');
  }

  document.getElementById('med-body').innerHTML =
    `<div style="text-align:center;padding:20px;background:var(--card);border-radius:14px;margin-bottom:16px"><h2>🫒 地中海饮食</h2><p style="font-size:13px;color:var(--s)">US News & World Report 最佳整体饮食模式</p></div>`
    +`<div class="st">🥇 每日核心</div>${cards(daily)}`
    +`<div class="st">📆 每周适量</div>${cards(weekly)}`
    +`<div class="st">⚠️ 限制</div>${cards(limited)}`;
  document.getElementById('mod-med').style.display = 'flex';
}


// ─── Modal Utils ───
function closeMod(id) { document.getElementById(id).style.display = 'none'; }

// ─── Drawer ───
function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  const open = drawer.style.transform === 'translateX(0px)';
  if (open) { closeDrawer(); return; }
  document.getElementById('drawer-email').textContent = user?.email || '';
  document.getElementById('drawer-name').textContent = user?.email?.split('@')[0] || '用户';
  overlay.style.display = 'block';
  drawer.style.transform = 'translateX(0px)';
}

function closeDrawer() {
  document.getElementById('drawer-overlay').style.display = 'none';
  document.getElementById('drawer').style.transform = 'translateX(-100%)';
}

// ─── Refresh ───
async function refreshApp() {
  await loadAll();
  const currentPane = document.querySelector('.pane.on');
  if (currentPane) {
    if (currentPane.id === 'pane-dashboard') renderDash();
    if (currentPane.id === 'pane-settings') renderSett();
    if (currentPane.id === 'pane-diet') renderDiet();
    if (currentPane.id === 'pane-stats') renderStats();
  }
}

// ─── New Reminder ───
function showNewReminder() {
  newReminder = {
    title: '', type: 'custom', is_enabled: true, time: '12:00',
    message: '', interval_minutes: null, active_hours_start: null,
    active_hours_end: null, video_link: null, selected_tea_key: null,
  };
  document.getElementById('new-body').innerHTML = `
    <div class="frm"><label>提醒名称</label><input type="text" placeholder="例如：喝水提醒" onchange="newReminder.title=this.value"></div>
    <div class="frm"><label>图标（可输入任意emoji）</label><input type="text" placeholder="例如：💧" maxlength="4" value="⏰" onchange="newReminder.type=this.value||'custom'" style="font-size:24px;width:60px;text-align:center"></div>
    <div class="frm"><label>时间</label><input type="time" value="12:00" onchange="newReminder.time=this.value+':00'"></div>
    <div class="frm"><label>提醒内容</label><textarea onchange="newReminder.message=this.value" rows="2" placeholder="显示在通知和仪表盘上"></textarea></div>
    <div class="frm"><label>重复间隔（可选）</label><select onchange="newReminder.interval_minutes=this.value?parseInt(this.value):null">
      <option value="">不重复</option><option value="5">5分钟</option><option value="10">10分钟</option>
      <option value="20">20分钟</option><option value="30">30分钟</option><option value="60">60分钟</option>
      <option value="90">90分钟</option><option value="120">120分钟</option>
    </select></div>
  `;
  document.getElementById('mod-new').style.display = 'flex';
}

async function saveNewReminder() {
  if (!newReminder.title.trim()) { alert('请输入提醒名称'); return; }
  const r = newReminder;
  // 所有新增提醒加时间戳后缀，避免唯一索引冲突
  const finalType = r.type + '_' + Date.now();
  const { data, error } = await supabase.from('reminders').insert({
    user_id: user.id, type: finalType, title: r.title.trim(),
    is_enabled: true, time: r.time, message: r.message || r.title,
    interval_minutes: r.interval_minutes, video_link: r.video_link||null,
    selected_tea_key: r.selected_tea_key||null,
    active_hours_start: r.active_hours_start, active_hours_end: r.active_hours_end,
  }).select();
  if (error) { alert('创建失败: '+error.message); return; }
  if (data) {
    data.forEach(d => reminders.push(d));
    reminders.sort((a,b)=>a.time.localeCompare(b.time));
  }
  closeMod('mod-new');
  renderSett();
}

// ─── New Time Block ───
let newBlock = null;

function showNewBlock() {
  newBlock = {
    title: '', type: 'writing', is_enabled: true, time: '09:00',
    message: '', active_hours_start: '09:00', active_hours_end: '12:00',
    interval_minutes: null, video_link: null, selected_tea_key: null,
  };
  document.getElementById('newblock-body').innerHTML = `
    <div class="frm"><label>任务名称</label><input type="text" placeholder="例如：写论文、午休" onchange="newBlock.title=this.value"></div>
    <div class="frm"><label>开始时间</label><input type="time" value="09:00" onchange="newBlock.time=this.value+':00';newBlock.active_hours_start=this.value+':00'"></div>
    <div class="frm"><label>结束时间</label><input type="time" value="12:00" onchange="newBlock.active_hours_end=this.value+':00'"></div>
    <div class="frm"><label>提醒内容</label><textarea onchange="newBlock.message=this.value" rows="2" placeholder="显示在仪表盘上"></textarea></div>
  `;
  document.getElementById('mod-newblock').style.display = 'flex';
}

async function saveNewBlock() {
  if (!newBlock.title.trim()) { alert('请输入任务名称'); return; }
  const r = newBlock;
  const { data, error } = await supabase.from('reminders').insert({
    user_id: user.id, type: 'writing_' + Date.now(), title: r.title.trim(),
    is_enabled: true, time: r.time, message: r.message || r.title,
    active_hours_start: r.active_hours_start, active_hours_end: r.active_hours_end,
  }).select();
  if (error) { alert('创建失败: '+error.message); return; }
  if (data) {
    data.forEach(d => reminders.push(d));
    reminders.sort((a,b)=>a.time.localeCompare(b.time));
  }
  closeMod('mod-newblock');
  renderSett();
}


// ─── Stats ───
async function loadHistoricalData() {
  const now = new Date();
  let start;
  if (statMode === 'week') {
    start = new Date(now);
    start.setDate(start.getDate() - start.getDay() - 7); // last 2 weeks
  } else {
    start = new Date(now.getFullYear(), now.getMonth()-1, 1); // last 2 months
  }
  const startStr = ts(start);
  const endStr = ts(now);

  const [compRes, mealRes] = await Promise.all([
    supabase.from('daily_completions').select('*').gte('date', startStr).lte('date', endStr).order('date'),
    supabase.from('meal_entries').select('*').gte('date', startStr).lte('date', endStr).order('date'),
  ]);
  allCompletions = compRes.data || [];
  allMeals = mealRes.data || [];
  renderStatContent();
}

function switchStat(mode) {
  statMode = mode;
  document.getElementById('stat-week-btn').style.background = mode==='week' ? 'var(--g)':'#F9F9F9';
  document.getElementById('stat-week-btn').style.color = mode==='week' ? '#fff':'var(--t)';
  document.getElementById('stat-month-btn').style.background = mode==='month' ? 'var(--g)':'#F9F9F9';
  document.getElementById('stat-month-btn').style.color = mode==='month' ? '#fff':'var(--t)';
  loadHistoricalData();
}

async function renderStats() {
  await loadHistoricalData();
}

function renderStatContent() {
  const now = new Date();
  let startDate, periodLabel;
  if (statMode === 'week') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - startDate.getDay() - 7);
    periodLabel = '最近2周';
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
    periodLabel = '最近2月';
  }

  // Filter data
  const minDate = ts(startDate);
  const maxDate = ts(now);
  const comps = allCompletions.filter(c => c.date >= minDate && c.date <= maxDate);
  const mealsData = allMeals.filter(m => m.date >= minDate && m.date <= maxDate);

  // Completion rate by day
  const dailyCompCount = {};
  comps.forEach(c => {
    dailyCompCount[c.date] = (dailyCompCount[c.date] || 0) + 1;
  });

  // Diet coverage by day
  const dailyDietCoverage = {};
  mealsData.forEach(m => {
    if (!dailyDietCoverage[m.date]) dailyDietCoverage[m.date] = new Set();
    (m.food_groups || []).forEach(g => {
      if (FG_DAILY.includes(g)) {
        dailyDietCoverage[m.date].add(g);
      }
    });
  });

  // Build day list
  const days = [];
  let d = new Date(startDate);
  while (d <= now) {
    const ds = ts(d);
    days.push({
      date: ds,
      day: d.getDay(),
      dayName: ['日','一','二','三','四','五','六'][d.getDay()],
      label: (d.getMonth()+1)+'/'+d.getDate(),
      month: d.getMonth()+1,
      dom: d.getDate(),
    });
    d.setDate(d.getDate()+1);
  }

  let html = '';

  // ─── Completion Trend ───
  html += '<div class="card"><div style="font-weight:600;margin-bottom:8px">📈 提醒完成趋势</div>';
  html += '<div style="display:flex;gap:1px;align-items:flex-end;overflow-x:auto;padding-bottom:4px">';
  const maxComp = Math.max(1, ...days.map(d => dailyCompCount[d.date]||0));
  days.forEach(d => {
    const c = dailyCompCount[d.date] || 0;
    const h = Math.max(4, (c/maxComp)*60);
    const today = d.date === ts();
    const w = statMode==='month'?'16':'28';
    html += `<div style="flex-shrink:0;text-align:center;width:${w}px" title="${d.date}: ${c}次完成">
      <div style="font-size:9px;color:var(--s)">${c||''}</div>
      <div style="height:${h}px;background:${today?'var(--g)':'var(--g)4d'};border-radius:2px 2px 0 0;margin:1px auto 0;width:${statMode==='month'?'12':'20'}px"></div>
      <div style="font-size:9px;color:${today?'var(--g)':'var(--s)'};margin-top:2px">${d.label}</div>
    </div>`;
  });
  html += '</div></div>';

  // ─── Diet Trend ───
  const dietTotal = FG_DAILY.length;
  html += `<div class="card"><div style="font-weight:600;margin-bottom:8px">🥗 饮食覆盖率趋势（每日核心${dietTotal}类）</div>`;
  html += '<div style="display:flex;gap:1px;align-items:flex-end;overflow-x:auto;padding-bottom:4px">';
  days.forEach(d => {
    const c = (dailyDietCoverage[d.date] || new Set()).size;
    const pct = c / dietTotal;
    const h = Math.max(4, pct*60);
    const today = d.date === ts();
    const w = statMode==='month'?'16':'28';
    html += `<div style="flex-shrink:0;text-align:center;width:${w}px" title="${d.date}: ${c}/7类食物">
      <div style="font-size:9px;color:var(--s)">${c||''}</div>
      <div style="height:${h}px;background:${today?'var(--b)':'#007AFF4d'};border-radius:2px 2px 0 0;margin:1px auto 0;width:${statMode==='month'?'12':'20'}px"></div>
      <div style="font-size:9px;color:${today?'var(--g)':'var(--s)'};margin-top:2px">${d.label}</div>
    </div>`;
  });
  html += '</div></div>';

  // ─── Summary Numbers ───
  const totalDays = days.length;
  const daysWithCompletions = new Set(comps.map(c=>c.date)).size;
  const daysWithMeals = new Set(mealsData.map(m=>m.date)).size;
  const totalCompletions = comps.length;
  const avgDailyComp = totalDays > 0 ? (totalCompletions / totalDays).toFixed(1) : '0.0';
  const dietPcts = days.map(d => (dailyDietCoverage[d.date]||new Set()).size/dietTotal);
  const avgDietPct = dietPcts.length > 0 ? (dietPcts.reduce((a,b)=>a+b,0)/dietPcts.length*100).toFixed(0) : 0;

  html += `<div class="card">
    <div style="font-weight:600;margin-bottom:12px">📋 ${periodLabel}总结</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center">
      <div style="background:#F2F2F7;border-radius:10px;padding:12px">
        <div style="font-size:24px;font-weight:700;color:var(--g)">${daysWithCompletions}/${totalDays}</div>
        <div style="font-size:12px;color:var(--s)">有打卡天数</div>
      </div>
      <div style="background:#F2F2F7;border-radius:10px;padding:12px">
        <div style="font-size:24px;font-weight:700;color:var(--g)">${totalCompletions}</div>
        <div style="font-size:12px;color:var(--s)">总完成次数</div>
      </div>
      <div style="background:#F2F2F7;border-radius:10px;padding:12px">
        <div style="font-size:24px;font-weight:700;color:var(--b)">${avgDailyComp}</div>
        <div style="font-size:12px;color:var(--s)">日均完成</div>
      </div>
      <div style="background:#F2F2F7;border-radius:10px;padding:12px">
        <div style="font-size:24px;font-weight:700;color:var(--b)">${avgDietPct}%</div>
        <div style="font-size:12px;color:var(--s)">饮食覆盖率</div>
      </div>
    </div>
  </div>`;

  // ─── Top Completed Reminders ───
  const reminderCompCounts = {};
  comps.forEach(c => {
    reminderCompCounts[c.reminder_id] = (reminderCompCounts[c.reminder_id]||0)+1;
  });
  const topReminders = reminders
    .filter(r => reminderCompCounts[r.id])
    .sort((a,b) => (reminderCompCounts[b.id]||0)-(reminderCompCounts[a.id]||0))
    .slice(0, 5);

  if (topReminders.length > 0) {
    html += `<div class="card">
      <div style="font-weight:600;margin-bottom:8px">🏆 完成最多的提醒</div>
      ${topReminders.map((r,i) => {
        const cnt = reminderCompCounts[r.id]||0;
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="font-weight:600;color:var(--s);width:20px">${i+1}</span>
          <span>${emoji(r.type)} ${r.title}</span>
          <span style="margin-left:auto;font-weight:600;color:var(--g)">${cnt}次</span>
          <div class="bar" style="width:80px"><div class="bar-f" style="width:${Math.round(cnt/Math.max(1,topReminders[0]?reminderCompCounts[topReminders[0].id]||1:1)*100)}%"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  }

  document.getElementById('stats-content').innerHTML = html;
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('ov')) {
    e.target.style.display = 'none';
  }
});


// ─── Data: Food Groups ───
const FG = {
  // 蔬菜细分（每日必须，每餐占餐盘一半）
  vegLeafy:     {em:'🥬', nm:'叶菜类', cat:'veg', fq:'每日', ds:'深色绿叶菜富含叶酸、铁、钙，每餐必备。', ex:['菠菜','生菜','油菜','茼蒿','小白菜','芝麻菜']},
  vegCruciferous:{em:'🥦', nm:'十字花科', cat:'veg', fq:'每日', ds:'含硫代葡萄糖苷有助抗癌。清蒸或快炒最佳。', ex:['西兰花','花椰菜','卷心菜','羽衣甘蓝','芥蓝','抱子甘蓝']},
  vegFruit:     {em:'🍅', nm:'果菜类', cat:'veg', fq:'每日', ds:'番茄富含番茄红素，烹饪后更易吸收。', ex:['番茄','彩椒','茄子','黄瓜','西葫芦','秋葵']},
  vegRoot:      {em:'🥕', nm:'根茎类', cat:'veg', fq:'每日', ds:'富含β-胡萝卜素和膳食纤维。', ex:['胡萝卜','白萝卜','甜菜','红薯','山药','莲藕']},
  vegAllium:    {em:'🧅', nm:'葱蒜类', cat:'veg', fq:'每日', ds:'含大蒜素有助抗炎、增强免疫。', ex:['洋葱','大蒜','韭菜','葱','蒜苗','红葱头']},
  // 每日必须
  fruits:       {em:'🍎', nm:'水果', cat:'daily', fq:'每日≥2份', ds:'餐后甜点最佳选择。新鲜水果优于果汁。', ex:['苹果','橙子','葡萄','石榴','无花果','莓果','梨']},
  wholeGrains:  {em:'🌾', nm:'全谷物', cat:'daily', fq:'每日3-6份', ds:'提供持久能量和膳食纤维。', ex:['藜麦','燕麦','糙米','全麦面包','意面','荞麦']},
  legumes:      {em:'🫘', nm:'豆类', cat:'daily', fq:'每日≥1份', ds:'优质植物蛋白，经济实惠。', ex:['鹰嘴豆','扁豆','蚕豆','白豆','小扁豆','毛豆']},
  nuts:         {em:'🥜', nm:'坚果种子', cat:'daily', fq:'每日1小把', ds:'富含健康脂肪和微量元素。', ex:['杏仁','核桃','腰果','松子','芝麻','亚麻籽']},
  oliveOil:     {em:'🫒', nm:'橄榄油', cat:'daily', fq:'主要脂肪', ds:'地中海饮食核心，特级初榨最佳。', ex:['特级初榨橄榄油']},
  herbs:        {em:'🌿', nm:'香草香料', cat:'daily', fq:'替代盐', ds:'减少钠摄入，增添风味。', ex:['迷迭香','百里香','牛至','罗勒','大蒜','欧芹']},
  // 每周适量
  fish:         {em:'🐟', nm:'鱼虾海鲜', cat:'weekly', fq:'每周≥2次', ds:'富含Omega-3，深海鱼尤佳。', ex:['三文鱼','沙丁鱼','鳕鱼','虾','贻贝','鲭鱼']},
  poultry:      {em:'🐔', nm:'禽肉', cat:'weekly', fq:'每周2-3次', ds:'白肉优于红肉，去皮烤蒸。', ex:['鸡胸肉','鸭肉','火鸡肉','鹌鹑']},
  eggs:         {em:'🥚', nm:'鸡蛋', cat:'weekly', fq:'每周2-4个', ds:'优质蛋白，煮蛋或水波蛋最佳。', ex:['鸡蛋','鹌鹑蛋','鸭蛋']},
  dairy:        {em:'🧀', nm:'乳制品', cat:'weekly', fq:'每日1-2份', ds:'优选发酵乳制品。', ex:['希腊酸奶','羊奶酪','帕玛森','开菲尔']},
  // 限制
  redMeat:      {em:'🥩', nm:'红肉', cat:'limited', fq:'每周≤1次', ds:'严格限制，每月几次而非每日。', ex:['牛肉','猪肉','羊肉','加工肉']},
  sweets:       {em:'🍰', nm:'甜食', cat:'limited', fq:'尽量不吃', ds:'想吃甜食选新鲜水果替代。', ex:['蛋糕','糖果','含糖饮料','冰淇淋']},
};
const FG_DAILY  = Object.keys(FG).filter(k => FG[k].cat === 'veg' || FG[k].cat === 'daily');  // 11 items
const FG_WEEKLY = Object.keys(FG).filter(k => FG[k].cat === 'weekly'); // 4 items
const FG_LIMIT  = Object.keys(FG).filter(k => FG[k].cat === 'limited'); // 2 items
const FG_VEG    = Object.keys(FG).filter(k => FG[k].cat === 'veg');     // 5 vegetable sub-types

// ─── AI Food Classifier: keyword → FG key ───
const FOOD_KW = {
  // 叶菜类
  '菠菜':'vegLeafy','生菜':'vegLeafy','油菜':'vegLeafy','茼蒿':'vegLeafy','小白菜':'vegLeafy','芝麻菜':'vegLeafy',
  '空心菜':'vegLeafy','苋菜':'vegLeafy','芥菜':'vegLeafy','娃娃菜':'vegLeafy','大白菜':'vegLeafy','卷心菜':'vegCruciferous',
  '青菜':'vegLeafy','菜心':'vegLeafy','油麦菜':'vegLeafy','豌豆苗':'vegLeafy','芽苗菜':'vegLeafy','苦菊':'vegLeafy',
  // 十字花科
  '西兰花':'vegCruciferous','花椰菜':'vegCruciferous','西蓝花':'vegCruciferous','菜花':'vegCruciferous',
  '卷心菜':'vegCruciferous','甘蓝':'vegCruciferous','羽衣甘蓝':'vegCruciferous','芥蓝':'vegCruciferous',
  '抱子甘蓝':'vegCruciferous','白萝卜':'vegRoot','芜菁':'vegRoot','雪里蕻':'vegCruciferous',
  // 果菜类
  '番茄':'vegFruit','西红柿':'vegFruit','彩椒':'vegFruit','柿子椒':'vegFruit','青椒':'vegFruit','甜椒':'vegFruit',
  '茄子':'vegFruit','黄瓜':'vegFruit','西葫芦':'vegFruit','秋葵':'vegFruit','南瓜':'vegFruit',
  '辣椒':'vegFruit','朝天椒':'vegFruit','丝瓜':'vegFruit','苦瓜':'vegFruit','冬瓜':'vegFruit',
  // 根茎类
  '胡萝卜':'vegRoot','萝卜':'vegRoot','胡萝卜':'vegRoot','白萝卜':'vegRoot','甜菜':'vegRoot','红薯':'vegRoot',
  '山药':'vegRoot','莲藕':'vegRoot','土豆':'vegRoot','马铃薯':'vegRoot','芋头':'vegRoot','莴笋':'vegRoot',
  '竹笋':'vegRoot','芦笋':'vegRoot','茭白':'vegRoot','牛蒡':'vegRoot','紫薯':'vegRoot',
  // 葱蒜类
  '洋葱':'vegAllium','大蒜':'vegAllium','蒜':'vegAllium','韭菜':'vegAllium','葱':'vegAllium','蒜苗':'vegAllium',
  '红葱头':'vegAllium','大葱':'vegAllium','小葱':'vegAllium','蒜薹':'vegAllium','韭黄':'vegAllium',
  // 水果
  '苹果':'fruits','橙子':'fruits','橘子':'fruits','葡萄':'fruits','石榴':'fruits','无花果':'fruits',
  '莓果':'fruits','蓝莓':'fruits','草莓':'fruits','香蕉':'fruits','梨':'fruits','西瓜':'fruits',
  '芒果':'fruits','木瓜':'fruits','猕猴桃':'fruits','桃子':'fruits','樱桃':'fruits','柚子':'fruits',
  '柠檬':'fruits','火龙果':'fruits','柿子':'fruits','荔枝':'fruits','龙眼':'fruits','菠萝':'fruits',
  '蜜瓜':'fruits','哈密瓜':'fruits',
  // 全谷物
  '藜麦':'wholeGrains','燕麦':'wholeGrains','糙米':'wholeGrains','全麦面包':'wholeGrains','全麦':'wholeGrains',
  '意面':'wholeGrains','荞麦':'wholeGrains','小米':'wholeGrains','玉米':'wholeGrains','黑米':'wholeGrains',
  '紫米':'wholeGrains','高粱':'wholeGrains','大麦':'wholeGrains','青稞':'wholeGrains','全谷物':'wholeGrains',
  // 豆类
  '鹰嘴豆':'legumes','扁豆':'legumes','蚕豆':'legumes','白豆':'legumes','小扁豆':'legumes','毛豆':'legumes',
  '黄豆':'legumes','绿豆':'legumes','红豆':'legumes','黑豆':'legumes','豌豆':'legumes','芸豆':'legumes',
  '豆腐':'legumes','豆制品':'legumes','豆浆':'legumes','豆皮':'legumes','腐竹':'legumes','豆腐干':'legumes',
  '千张':'legumes','豆豉':'legumes','纳豆':'legumes','天贝':'legumes',
  // 坚果种子
  '杏仁':'nuts','核桃':'nuts','腰果':'nuts','松子':'nuts','芝麻':'nuts','亚麻籽':'nuts',
  '开心果':'nuts','花生':'nuts','瓜子':'nuts','南瓜籽':'nuts','奇亚籽':'nuts','榛子':'nuts',
  '夏威夷果':'nuts','碧根果':'nuts','葵花籽':'nuts',
  // 橄榄油
  '橄榄油':'oliveOil','特级初榨':'oliveOil','初榨橄榄油':'oliveOil',
  // 香草香料
  '迷迭香':'herbs','百里香':'herbs','牛至':'herbs','罗勒':'herbs','欧芹':'herbs',
  '香料':'herbs','香草':'herbs','薄荷':'herbs','紫苏':'herbs','香菜':'herbs','茴香':'herbs',
  '姜黄':'herbs','肉桂':'herbs','孜然':'herbs','丁香':'herbs',
  // 鱼虾海鲜
  '三文鱼':'fish','沙丁鱼':'fish','鳕鱼':'fish','虾':'fish','贻贝':'fish','鲭鱼':'fish',
  '鱼':'fish','海鲜':'fish','贝类':'fish','鲈鱼':'fish','带鱼':'fish','金枪鱼':'fish',
  '海鲈':'fish','青花鱼':'fish','秋刀鱼':'fish','牡蛎':'fish','蛤蜊':'fish','扇贝':'fish',
  '鱿鱼':'fish','章鱼':'fish','螃蟹':'fish','蟹':'fish','龙虾':'fish','鳗鱼':'fish',
  // 禽肉
  '鸡肉':'poultry','鸡胸':'poultry','鸡腿':'poultry','鸭肉':'poultry','火鸡':'poultry','鹌鹑':'poultry',
  '鸽子':'poultry','禽肉':'poultry','鸡':'poultry','鸭':'poultry',
  // 鸡蛋
  '鸡蛋':'eggs','蛋':'eggs','鹌鹑蛋':'eggs','鸭蛋':'eggs','蛋黄':'eggs','蛋白':'eggs',
  // 乳制品
  '酸奶':'dairy','希腊酸奶':'dairy','奶酪':'dairy','芝士':'dairy','羊奶酪':'dairy',
  '牛奶':'dairy','开菲尔':'dairy','乳制品':'dairy','奶':'dairy','黄油':'dairy','奶油':'dairy',
  // 红肉
  '牛肉':'redMeat','猪肉':'redMeat','羊肉':'redMeat','红肉':'redMeat','加工肉':'redMeat',
  '培根':'redMeat','火腿':'redMeat','香肠':'redMeat','腊肉':'redMeat','牛排':'redMeat',
  '排骨':'redMeat',
  // 甜食
  '蛋糕':'sweets','糖果':'sweets','含糖饮料':'sweets','冰淇淋':'sweets','甜食':'sweets',
  '饼干':'sweets','巧克力':'sweets','甜点':'sweets','奶茶':'sweets','汽水':'sweets','可乐':'sweets',
  '果汁饮料':'sweets','果酱':'sweets',
};

function classifyFood(text) {
  // Parse text, match keywords, return array of FG keys
  const found = new Set();
  const t = text.toLowerCase();
  // match longest keywords first
  const sorted = Object.entries(FOOD_KW).sort((a,b) => b[0].length - a[0].length);
  for (const [kw, fg] of sorted) {
    if (t.includes(kw) && !found.has(fg)) {
      found.add(fg);
    }
  }
  return Array.from(found);
}

const MT = {
  breakfast:{em:'🌅',nm:'早餐'}, lunch:{em:'☀️',nm:'午餐'},
  dinner:{em:'🌙',nm:'晚餐'}, snack:{em:'🍪',nm:'加餐'},
};


const TEAS = [
  {key:'green',name:'绿茶',englishName:'Green Tea',nature:'微寒',taste:'甘、苦',meridians:'心、肺、胃',effects:['清热降火','提神醒脑','消食化痰','解毒利尿','抗辐射'],description:'未经发酵，保留鲜叶天然物质。富含茶多酚、儿茶素。性微寒，适合春夏饮用。',suitableFor:'体质偏热、容易上火、长期用电脑者',caution:'脾胃虚寒者不宜多饮；空腹不宜；失眠者睡前避免'},
  {key:'black',name:'红茶',englishName:'Black Tea',nature:'温',taste:'甘',meridians:'心、肾、胃',effects:['暖胃驱寒','助消化','提神','利尿','护心'],description:'全发酵茶，茶性温和。富含茶黄素、茶红素。适合秋冬饮用。',suitableFor:'脾胃虚寒、消化不良、怕冷者',caution:'上火、口臭者不宜过量；失眠者傍晚后避免'},
  {key:'oolong',name:'乌龙茶',englishName:'Oolong Tea',nature:'平',taste:'甘',meridians:'脾、胃、肺',effects:['消食解腻','降脂减肥','提神','美容养颜','抗衰老'],description:'半发酵茶，兼具绿茶清香和红茶醇厚。铁观音、大红袍为著名品种。',suitableFor:'饮食油腻、想控制体重者',caution:'空腹不宜；孕妇及胃溃疡患者慎饮'},
  {key:'puEr',name:'普洱茶',englishName:"Pu'er Tea",nature:'温',taste:'甘、苦',meridians:'脾、胃、肝',effects:['降脂减肥','养胃护胃','消食去腻','降血压','抗氧化'],description:'后发酵茶，熟普茶性温和，有"能喝的古董"之称。',suitableFor:'高血脂、消化不良、饮食油腻者',caution:'新制生普性寒，胃肠敏感者宜选熟普'},
  {key:'white',name:'白茶',englishName:'White Tea',nature:'凉',taste:'甘',meridians:'肺、肝',effects:['清热润肺','解毒','明目','抗氧化','舒缓情绪'],description:'微发酵茶，不炒不揉。白毫银针、白牡丹为主要品种。"一年茶、三年药、七年宝"。',suitableFor:'热性体质、咽喉不适、皮肤干燥者',caution:'脾胃虚寒者不宜多饮；新茶可存放后饮用'},
  {key:'chrysanthemum',name:'菊花茶',englishName:'Chrysanthemum Tea',nature:'微寒',taste:'甘、苦',meridians:'肺、肝',effects:['散风清热','清肝明目','解毒','降血压','缓解眼疲劳'],description:'菊花入肝经，药食同源。杭白菊、贡菊各有侧重。尤其适合长期用眼者。',suitableFor:'用眼过度、高血压、风热感冒初期',caution:'脾胃虚寒者不宜长期大量；孕妇慎用'},
  {key:'rose',name:'玫瑰花茶',englishName:'Rose Tea',nature:'温',taste:'甘、微苦',meridians:'肝、脾',effects:['疏肝解郁','活血调经','美容养颜','舒缓情绪','调理气血'],description:'性温，香气浓郁。有助缓解情绪压力、调节内分泌。可搭配红枣、枸杞。',suitableFor:'情绪压力大、月经不调、面色暗沉者',caution:'便秘者不宜过量；孕妇慎用；月经过多者经期避免'},
  {key:'goji',name:'枸杞茶',englishName:'Goji Berry Tea',nature:'平',taste:'甘',meridians:'肝、肾',effects:['滋补肝肾','益精明目','抗疲劳','增强免疫力','延缓衰老'],description:'常用滋补品，药性平和。富含枸杞多糖、胡萝卜素。',suitableFor:'用眼过度、疲劳乏力、免疫力低下者',caution:'感冒发热期间不宜；脾胃湿热者慎用'},
  {key:'honeysuckle',name:'金银花茶',englishName:'Honeysuckle Tea',nature:'寒',taste:'甘',meridians:'肺、心、胃',effects:['清热解毒','疏散风热','抗病毒','消炎','降火'],description:'清热解毒良药，性寒不伤胃，夏季消暑佳品。',suitableFor:'风热感冒、咽喉肿痛、夏季暑热',caution:'脾胃虚寒者不宜长期服用；不适用风寒感冒'},
  {key:'osmanthus',name:'桂花茶',englishName:'Osmanthus Tea',nature:'温',taste:'甘',meridians:'肺、脾',effects:['暖胃散寒','化痰止咳','舒缓情绪','消除口臭','美容养颜'],description:'桂花香气清雅，性温味甘。常与乌龙茶、红茶搭配。',suitableFor:'胃寒不适、痰多咳嗽、情绪低落者',caution:'体质偏热者不宜过量；孕妇慎用'},
  {key:'tangerinePeel',name:'陈皮茶',englishName:'Tangerine Peel Tea',nature:'温',taste:'辛、苦',meridians:'脾、肺',effects:['理气健脾','燥湿化痰','助消化','解腻','缓解腹胀'],description:'陈皮经陈化而成，年份越久效越好。常与普洱茶搭配。',suitableFor:'脾胃气滞、消化不良、咳嗽痰多者',caution:'阴虚燥咳者不宜；胃火旺盛者慎用'},
  {key:'peppermint',name:'薄荷茶',englishName:'Peppermint Tea',nature:'凉',taste:'辛',meridians:'肺、肝',effects:['疏风散热','清利头目','缓解头痛','助消化','提神醒脑'],description:'有独特清凉感，夏季饮用清爽宜人。',suitableFor:'风热感冒、头痛、消化不良者',caution:'阴虚血燥者不宜；哺乳期女性慎用'},
  {key:'ginger',name:'姜茶',englishName:'Ginger Tea',nature:'温',taste:'辛',meridians:'肺、脾、胃',effects:['驱寒暖身','温中止呕','发汗解表','促进循环','缓解痛经'],description:'药食同源经典食材。受寒后饮用尤佳。加入红糖效果更好。',suitableFor:'体寒怕冷、风寒感冒初期、胃寒、痛经者',caution:'阴虚内热者不宜；晚上不宜大量饮用'},
  {key:'redDate',name:'红枣茶',englishName:'Red Date Tea',nature:'温',taste:'甘',meridians:'脾、胃、心',effects:['补气养血','安神助眠','健脾益胃','美容养颜','增强免疫力'],description:'补气养血首选食材。富含铁、维生素C。',suitableFor:'气血不足、面色萎黄、失眠多梦者',caution:'痰湿偏盛、腹胀者不宜过量'},
  {key:'cassiaSeed',name:'决明子茶',englishName:'Cassia Seed Tea',nature:'微寒',taste:'甘、苦',meridians:'肝、大肠',effects:['清肝明目','润肠通便','降血压','降血脂'],description:'中医明目要药，有"还瞳子"之称。缓解眼干眼涩。',suitableFor:'用眼过度、便秘、高血压、高血脂者',caution:'脾胃虚寒、便溏者不宜；孕妇慎用'},
  {key:'mulberry',name:'桑葚茶',englishName:'Mulberry Tea',nature:'寒',taste:'甘',meridians:'肝、肾',effects:['滋阴补血','生津润燥','乌发明目','抗衰老'],description:'富含花青素、铁、维生素。滋阴补血、生津润燥。',suitableFor:'阴虚血少、须发早白、眼干目涩者',caution:'脾胃虚寒、腹泻者不宜；糖尿病患者注意'},
  {key:'hibiscus',name:'洛神花茶',englishName:'Hibiscus Tea',nature:'凉',taste:'酸',meridians:'肺、胃',effects:['生津止渴','降血压','清热解暑','促进消化','美容养颜'],description:'汤色红宝石，酸甜口感。富含维生素C和花青素。',suitableFor:'高血压、夏季暑热、食欲不振者',caution:'胃酸过多者不宜空腹；孕妇慎用'},
];

// ─── Data: Tea Blends (混合茶搭配) ───
const TEA_BLENDS = [
  {name:'枸杞菊花茶',ingredients:['枸杞','菊花'],nature:'平',effects:['清肝明目','滋补肝肾','缓解眼疲劳'],for:'用眼过度、眼干眼涩、视物模糊',recipe:'枸杞10粒+菊花3-5朵，沸水冲泡5分钟。可反复冲泡至味淡。',caution:'感冒发热期间不宜；脾胃虚寒者菊花减量。'},
  {name:'玫瑰红枣茶',ingredients:['玫瑰花','红枣'],nature:'温',effects:['疏肝解郁','补气养血','美容养颜'],for:'情绪低落、面色萎黄、经前烦躁',recipe:'玫瑰花5朵+去核红枣3颗，沸水冲泡8分钟。可加少量红糖。',caution:'经期量多者玫瑰花减量；便秘者红枣不宜多。'},
  {name:'陈皮普洱茶',ingredients:['陈皮','普洱茶'],nature:'温',effects:['理气健脾','消食去腻','暖胃化痰'],for:'饮食油腻、消化不良、饭后腹胀',recipe:'陈皮2g+普洱茶5g，沸水冲泡。陈皮年份越久越佳。',caution:'胃热便秘者慎用；空腹不宜大量饮用。'},
  {name:'桂圆红枣茶',ingredients:['桂圆','红枣'],nature:'温',effects:['补血安神','养心健脾','改善睡眠'],for:'心血不足、失眠多梦、手脚冰凉',recipe:'桂圆5颗+红枣3颗（去核），煮水10分钟或沸水冲泡。',caution:'体质燥热者不宜；糖尿病患者注意糖分。'},
  {name:'菊花薄荷茶',ingredients:['菊花','薄荷'],nature:'凉',effects:['疏散风热','清利头目','提神醒脑'],for:'风热感冒初期、头痛、咽喉不适',recipe:'菊花5朵+薄荷叶3-5片，沸水冲泡3分钟（不宜久泡）。',caution:'风寒感冒不宜；体虚多汗者慎用。'},
  {name:'山楂荷叶茶',ingredients:['山楂','荷叶'],nature:'平',effects:['消食降脂','活血化瘀','利水减肥'],for:'食积不化、高血脂、体重管理',recipe:'山楂3片+荷叶2g，沸水冲泡5-8分钟。饭后饮用。',caution:'胃酸过多者慎用；孕妇忌用。空腹不宜。'},
  {name:'黄芪枸杞茶',ingredients:['黄芪','枸杞'],nature:'温',effects:['补气固表','养肝明目','增强免疫'],for:'气虚乏力、易感冒、免疫力低下',recipe:'黄芪5g+枸杞10粒，沸水冲泡10分钟或煮水。',caution:'感冒发热期间不宜；高血压者黄芪减量。'},
  {name:'金银花甘草茶',ingredients:['金银花','甘草'],nature:'凉',effects:['清热解毒','利咽消肿','抗病毒'],for:'咽喉肿痛、口腔溃疡、风热感冒',recipe:'金银花3g+甘草2片，沸水冲泡5分钟。',caution:'脾胃虚寒者不宜久服；甘草不宜长期大量。'},
  {name:'姜枣红糖茶',ingredients:['生姜','红枣','红糖'],nature:'温',effects:['温经散寒','补血暖宫','缓解痛经'],for:'宫寒痛经、风寒感冒、手脚冰凉',recipe:'生姜3片+红枣3颗（去核）+红糖适量，煮水10分钟趁热服用。',caution:'阴虚火旺、口干舌燥者不宜；晚上不宜大量饮用。'},
  {name:'桑葚枸杞茶',ingredients:['桑葚','枸杞'],nature:'平',effects:['滋阴补血','养肝明目','乌发润肤'],for:'用眼过度、须发早白、皮肤干燥',recipe:'桑葚干10g+枸杞10粒，沸水冲泡或煮水。',caution:'脾胃虚寒腹泻者不宜；糖尿病患者适量。'},
  {name:'百合莲子茶',ingredients:['百合','莲子'],nature:'平',effects:['清心安神','润肺止咳','健脾止泻'],for:'心烦失眠、干咳无痰、脾胃虚弱',recipe:'百合10g+莲子10g（去心），煮水15分钟。可加少量冰糖。',caution:'风寒咳嗽不宜；莲子心苦寒可去之。'},
  {name:'茯苓薏米茶',ingredients:['茯苓','薏苡仁'],nature:'平',effects:['健脾祛湿','利水消肿','美白肌肤'],for:'脾虚湿盛、水肿、大便黏腻',recipe:'茯苓10g+薏苡仁15g（提前浸泡2小时），煮水20分钟。',caution:'阴虚口干者不宜；薏苡仁孕妇忌用。'},
];

// ─── Data: TCM Symptom-Recommendation Engine ───
const TCM_SYMPTOMS = [
  {id:'fatigue',nm:'疲劳乏力',cat:'虚证',desc:'精神不振、容易疲倦',catEm:'😴'},
  {id:'insomnia',nm:'失眠多梦',cat:'虚证',desc:'入睡困难、多梦易醒',catEm:'😴'},
  {id:'poorDigestion',nm:'消化不良',cat:'脾胃',desc:'饭后腹胀、食欲不振',catEm:'🫄'},
  {id:'constipation',nm:'便秘',cat:'脾胃',desc:'排便困难、大便干燥',catEm:'🫄'},
  {id:'bloating',nm:'腹胀',cat:'脾胃',desc:'腹部胀满、嗳气',catEm:'🫄'},
  {id:'coldHands',nm:'手脚冰凉',cat:'虚证',desc:'四肢不温、怕冷畏寒',catEm:'🥶'},
  {id:'acne',nm:'长痘',cat:'热证',desc:'面部痤疮、皮肤出油',catEm:'🔥'},
  {id:'dryMouth',nm:'口干舌燥',cat:'热证',desc:'口渴多饮、咽喉干燥',catEm:'🔥'},
  {id:'headache',nm:'头痛',cat:'经络',desc:'头部胀痛或刺痛',catEm:'🤕'},
  {id:'eyeStrain',nm:'眼干眼疲劳',cat:'经络',desc:'用眼过度、视物模糊',catEm:'👁️'},
  {id:'neckPain',nm:'肩颈酸痛',cat:'经络',desc:'颈肩僵硬、活动受限',catEm:'💆'},
  {id:'backPain',nm:'腰背酸痛',cat:'经络',desc:'腰膝酸软、久坐不适',catEm:'💆'},
  {id:'anxiety',nm:'焦虑烦躁',cat:'情志',desc:'情绪不稳、心烦易怒',catEm:'😤'},
  {id:'weightGain',nm:'体重增加',cat:'代谢',desc:'代谢缓慢、容易发胖',catEm:'⚖️'},
  {id:'cold',nm:'感冒初期',cat:'外感',desc:'鼻塞流涕、怕风怕冷',catEm:'🤧'},
  {id:'menstrual',nm:'痛经',cat:'妇科',desc:'经期腹痛、经行不畅',catEm:'🌹'},
  {id:'hairLoss',nm:'脱发',cat:'虚证',desc:'发质干枯、脱发增多',catEm:'💇'},
  {id:'skinDry',nm:'皮肤干燥',cat:'虚证',desc:'皮肤粗糙、干裂脱屑',catEm:'🧴'},
];

// TCM Food Therapy: symptom → recommended foods
const TCM_FOODS = {
  fatigue:[
    {food:'黄芪',nature:'温',action:'补气升阳',note:'炖汤或泡水，每天5-10g。常配党参、枸杞。'},
    {food:'山药',nature:'平',action:'补脾益气',note:'蒸食或煮粥。搭配红枣效果更佳。'},
    {food:'红枣',nature:'温',action:'补血安神',note:'每日3-5颗泡水或煮粥。搭配桂圆养心血。'},
    {food:'党参',nature:'平',action:'补中益气',note:'炖鸡汤或排骨汤。常与黄芪同用。'},
    {food:'黑芝麻',nature:'平',action:'滋补肝肾',note:'炒熟磨粉每日1勺。搭配核桃养脑。'},
  ],
  insomnia:[
    {food:'酸枣仁',nature:'平',action:'养心安神',note:'睡前半小时煮水喝。打碎后效果更好。'},
    {food:'桂圆',nature:'温',action:'补益心脾',note:'配红枣泡茶。每日5-8颗，不宜过量。'},
    {food:'莲子',nature:'平',action:'养心安神',note:'去心煮粥或煲汤。配百合安神效果佳。'},
    {food:'百合',nature:'微寒',action:'清心安神',note:'煮粥或炖银耳。适合心烦失眠者。'},
    {food:'牛奶',nature:'平',action:'安神助眠',note:'睡前温热饮用。加蜂蜜效果更好。'},
  ],
  poorDigestion:[
    {food:'山楂',nature:'微温',action:'消食化积',note:'饭后泡水或当零食。胃酸过多者适量。'},
    {food:'陈皮',nature:'温',action:'理气健脾',note:'泡茶或入菜。越陈越佳，理气不伤正。'},
    {food:'麦芽',nature:'平',action:'消食和中',note:'炒麦芽泡水。善消米面积滞。'},
    {food:'鸡内金',nature:'平',action:'健胃消食',note:'研粉冲服每次2-3g。消食力强。'},
    {food:'白萝卜',nature:'凉',action:'下气消食',note:'生吃或煮汤。冬天萝卜赛人参。'},
  ],
  constipation:[
    {food:'决明子',nature:'微寒',action:'润肠通便',note:'炒熟泡茶饮。每次10-15g。'},
    {food:'蜂蜜',nature:'平',action:'润肠通便',note:'晨起温水冲服一勺。水温不宜过烫。'},
    {food:'黑芝麻',nature:'平',action:'润肠通便',note:'炒熟磨粉拌蜂蜜。富含油脂润肠。'},
    {food:'香蕉',nature:'寒',action:'润肠通便',note:'熟透香蕉效果佳。脾胃虚寒者适量。'},
    {food:'火龙果',nature:'凉',action:'清热通便',note:'富含膳食纤维。红心效果更佳。'},
  ],
  bloating:[
    {food:'陈皮',nature:'温',action:'理气消胀',note:'泡茶或入菜。配生姜温中行气。'},
    {food:'白萝卜',nature:'凉',action:'下气消胀',note:'煮水加蜂蜜。通气不伤胃。'},
    {food:'砂仁',nature:'温',action:'行气化湿',note:'研末冲服每次1-3g。孕妇慎用。'},
    {food:'佛手',nature:'温',action:'疏肝理气',note:'切片泡茶饮。香气怡人理气佳。'},
  ],
  coldHands:[
    {food:'生姜',nature:'温',action:'温中散寒',note:'煮水加红糖。早上喝效果最好。'},
    {food:'当归',nature:'温',action:'补血温经',note:'炖羊肉或鸡汤。经期前一周食用。'},
    {food:'羊肉',nature:'温',action:'温阳补虚',note:'冬季炖汤。配当归生姜效果佳。'},
    {food:'肉桂',nature:'大热',action:'温阳散寒',note:'炖肉时加入少许。阴虚火旺者忌。'},
    {food:'核桃',nature:'温',action:'温补肾阳',note:'每日2-3个。配黑芝麻补肾暖身。'},
  ],
  acne:[
    {food:'绿豆',nature:'寒',action:'清热解毒',note:'煮汤或粥。夏天消暑解毒必备。'},
    {food:'薏苡仁',nature:'微寒',action:'清热排脓',note:'煮粥或泡水。配赤小豆祛痘。'},
    {food:'苦瓜',nature:'寒',action:'清热泻火',note:'凉拌或炒食。清心火效果好。'},
    {food:'金银花',nature:'寒',action:'清热解毒',note:'泡茶饮用。善清上焦风热。'},
    {food:'菊花',nature:'微寒',action:'清肝明目',note:'泡茶饮。配枸杞护眼清肝。'},
  ],
  dryMouth:[
    {food:'梨',nature:'凉',action:'生津润燥',note:'生吃或炖冰糖。秋天润燥首选。'},
    {food:'银耳',nature:'平',action:'滋阴润肺',note:'炖羹加冰糖。长期食用皮肤润泽。'},
    {food:'麦冬',nature:'微寒',action:'养阴生津',note:'泡水或煲汤。善清肺胃之热。'},
    {food:'甘蔗',nature:'寒',action:'清热生津',note:'榨汁饮用。解渴生津良品。'},
  ],
  headache:[
    {food:'菊花',nature:'微寒',action:'清利头目',note:'泡茶。配薄荷疏散风热。'},
    {food:'天麻',nature:'平',action:'平肝息风',note:'炖鱼头汤。偏头痛调理佳品。'},
    {food:'川芎',nature:'温',action:'活血行气',note:'炖汤少量（3-5g）。血虚头痛适用。'},
  ],
  eyeStrain:[
    {food:'枸杞',nature:'平',action:'滋补肝肾',note:'每日10-15粒泡水或嚼食。明目首选。'},
    {food:'菊花',nature:'微寒',action:'清肝明目',note:'配枸杞泡茶。一清一补护眼佳。'},
    {food:'决明子',nature:'微寒',action:'清肝明目',note:'炒熟泡茶。眼干眼涩常用。'},
    {food:'蓝莓',nature:'凉',action:'养肝明目',note:'每日一小把。花青素护眼。'},
  ],
  neckPain:[
    {food:'葛根',nature:'凉',action:'解肌舒筋',note:'煮水或炖汤。缓解颈项强痛。'},
    {food:'桑枝',nature:'平',action:'祛风通络',note:'煮水外洗或泡脚。疏通上肢经络。'},
    {food:'黑豆',nature:'平',action:'补肾强筋',note:'煮汤或醋泡。肾主骨生髓。'},
  ],
  backPain:[
    {food:'杜仲',nature:'温',action:'补肾强腰',note:'炖猪腰或排骨。腰痛要药。'},
    {food:'核桃',nature:'温',action:'补肾强筋',note:'每日2-3个。配黑芝麻效果佳。'},
    {food:'牛膝',nature:'平',action:'补肾强筋',note:'少量炖汤。引药下行强腰膝。'},
  ],
  anxiety:[
    {food:'玫瑰花',nature:'温',action:'疏肝解郁',note:'泡茶饮。香气怡人舒缓情绪。'},
    {food:'合欢花',nature:'平',action:'解郁安神',note:'泡茶或煮粥。烦闷不乐时饮用。'},
    {food:'百合',nature:'微寒',action:'清心安神',note:'煮粥。心烦不眠时食用。'},
    {food:'香蕉',nature:'寒',action:'缓解焦虑',note:'含色氨酸有助情绪稳定。'},
  ],
  weightGain:[
    {food:'薏苡仁',nature:'微寒',action:'健脾利湿',note:'煮粥配赤小豆。久服轻身。'},
    {food:'冬瓜',nature:'微寒',action:'利水消肿',note:'煮汤加少量盐。低热量高纤维。'},
    {food:'荷叶',nature:'平',action:'升清降脂',note:'泡茶或煮粥。降脂减肥常用。'},
    {food:'山楂',nature:'微温',action:'消食降脂',note:'泡水饭后饮用。消肉食积滞。'},
  ],
  cold:[
    {food:'生姜',nature:'温',action:'发汗解表',note:'煮红糖水趁热喝。风寒感冒初期最佳。'},
    {food:'葱白',nature:'温',action:'发汗解表',note:'配生姜煮水。通阳散寒。'},
    {food:'紫苏',nature:'温',action:'解表散寒',note:'煮水或入菜。行气宽中和胃。'},
    {food:'大蒜',nature:'温',action:'解毒防感',note:'切碎生食或做菜。增强免疫力。'},
  ],
  menstrual:[
    {food:'当归',nature:'温',action:'活血调经',note:'炖汤经前一周食用。妇科圣药。'},
    {food:'红糖',nature:'温',action:'温经止痛',note:'配生姜热水冲服。经期腹痛即饮。'},
    {food:'益母草',nature:'微寒',action:'活血调经',note:'煮水经前饮用。孕妇忌用。'},
    {food:'艾叶',nature:'温',action:'温经止血',note:'煮水泡脚或煮鸡蛋。暖宫散寒。'},
  ],
  hairLoss:[
    {food:'何首乌',nature:'温',action:'补肝肾乌发',note:'制首乌炖汤。生首乌慎用需炮制。'},
    {food:'黑芝麻',nature:'平',action:'补肝肾润发',note:'每日一勺磨粉。配核桃养发。'},
    {food:'桑葚',nature:'寒',action:'滋阴补血',note:'鲜食或泡茶。补血养发。'},
  ],
  skinDry:[
    {food:'银耳',nature:'平',action:'滋阴润肤',note:'炖羹长期食用。植物胶原蛋白。'},
    {food:'蜂蜜',nature:'平',action:'润燥养肤',note:'温水冲服或敷面。内外兼用。'},
    {food:'杏仁',nature:'温',action:'润肺养肤',note:'甜杏仁每日5-10粒。肺主皮毛。'},
    {food:'猪蹄',nature:'平',action:'滋阴润燥',note:'炖汤。富含胶原蛋白。'},
  ],
};

// TCM Acupressure Points: symptom → recommended points
const TCM_POINTS = {
  fatigue:[
    {point:'足三里',loc:'小腿外侧，膝下3寸，胫骨前嵴外一横指',tech:'拇指按压3-5分钟，有酸胀感为度。每日早晚各一次。',meridian:'足阳明胃经'},
    {point:'关元',loc:'肚脐下3寸（四横指）',tech:'手掌顺时针按揉5分钟。补元气要穴。',meridian:'任脉'},
    {point:'气海',loc:'肚脐下1.5寸（两横指）',tech:'温和按揉或艾灸10分钟。',meridian:'任脉'},
  ],
  insomnia:[
    {point:'神门',loc:'手腕横纹尺侧端，尺侧腕屈肌腱桡侧凹陷处',tech:'拇指按揉3分钟，睡前操作。安神定志。',meridian:'手少阴心经'},
    {point:'安眠',loc:'耳后翳风与风池连线中点',tech:'中指按揉2-3分钟。经外奇穴专治失眠。',meridian:'经外奇穴'},
    {point:'三阴交',loc:'内踝尖上3寸，胫骨内侧缘后方',tech:'拇指按揉5分钟。调补肝脾肾。',meridian:'足太阴脾经'},
  ],
  poorDigestion:[
    {point:'足三里',loc:'小腿外侧，膝下3寸',tech:'拇指按压3-5分钟。调理脾胃第一要穴。',meridian:'足阳明胃经'},
    {point:'中脘',loc:'肚脐上4寸（五横指）',tech:'手掌顺时针按揉5分钟。胃之募穴。',meridian:'任脉'},
    {point:'内关',loc:'手腕横纹上2寸，两筋之间',tech:'拇指按揉3分钟，止呕消胀。',meridian:'手厥阴心包经'},
  ],
  constipation:[
    {point:'天枢',loc:'肚脐旁开2寸（三横指）',tech:'双手拇指同时按压两侧，顺时针揉3分钟。',meridian:'足阳明胃经'},
    {point:'支沟',loc:'手背腕横纹上3寸，尺桡骨之间',tech:'拇指按压有酸胀感。通便要穴。',meridian:'手少阳三焦经'},
  ],
  bloating:[
    {point:'中脘',loc:'肚脐上4寸',tech:'手掌顺时针揉腹5分钟。行气消胀。',meridian:'任脉'},
    {point:'足三里',loc:'膝下3寸',tech:'按压或艾灸10分钟。健脾行气。',meridian:'足阳明胃经'},
    {point:'太冲',loc:'足背第1、2跖骨间凹陷处',tech:'从太冲向行间方向推按。疏肝理气。',meridian:'足厥阴肝经'},
  ],
  coldHands:[
    {point:'涌泉',loc:'足底前1/3凹陷处',tech:'每晚热水泡脚后搓揉100次。温补肾阳。',meridian:'足少阴肾经'},
    {point:'命门',loc:'腰部后正中线上，第2腰椎棘突下',tech:'手掌搓热后敷按或艾灸。温阳要穴。',meridian:'督脉'},
    {point:'关元',loc:'肚脐下3寸',tech:'艾灸或手掌按揉。培补元气暖全身。',meridian:'任脉'},
  ],
  acne:[
    {point:'合谷',loc:'手背第1、2掌骨间，第二掌骨桡侧中点',tech:'拇指按压3分钟。清头面风热。',meridian:'手阳明大肠经'},
    {point:'曲池',loc:'肘横纹外侧端，屈肘时肘弯尽头',tech:'拇指按压3分钟。清热利湿。',meridian:'手阳明大肠经'},
    {point:'大椎',loc:'第7颈椎棘突下凹陷',tech:'刮痧或按压。清热泻火。',meridian:'督脉'},
  ],
  dryMouth:[
    {point:'太溪',loc:'内踝尖与跟腱之间凹陷处',tech:'拇指按揉3分钟。滋阴补肾。',meridian:'足少阴肾经'},
    {point:'照海',loc:'内踝尖下方凹陷处',tech:'按揉2-3分钟。滋阴润燥利咽。',meridian:'足少阴肾经'},
  ],
  headache:[
    {point:'太阳',loc:'眉梢与外眼角之间向后1横指凹陷处',tech:'双手拇指同时按揉3分钟。偏正头痛皆宜。',meridian:'经外奇穴'},
    {point:'风池',loc:'枕骨下，胸锁乳突肌与斜方肌之间凹陷',tech:'拇指按揉有酸胀感向后脑放射。',meridian:'足少阳胆经'},
    {point:'合谷',loc:'手背虎口处',tech:'强刺激按压。头面诸疾皆可用。',meridian:'手阳明大肠经'},
  ],
  eyeStrain:[
    {point:'睛明',loc:'目内眦角稍上方凹陷处',tech:'食指轻按，闭目放松1分钟。',meridian:'足太阳膀胱经'},
    {point:'攒竹',loc:'眉头凹陷处',tech:'大拇指按揉。缓解眼疲劳立效。',meridian:'足太阳膀胱经'},
    {point:'光明',loc:'外踝尖上5寸，腓骨前缘',tech:'按揉3分钟。胆经络穴通于肝目。',meridian:'足少阳胆经'},
  ],
  neckPain:[
    {point:'风池',loc:'枕骨下凹陷处',tech:'拇指按揉或拿捏5分钟。松解颈部肌肉。',meridian:'足少阳胆经'},
    {point:'肩井',loc:'大椎与肩峰连线中点',tech:'拇指按压或拿捏。孕妇禁用。',meridian:'足少阳胆经'},
    {point:'后溪',loc:'握拳时掌横纹尽头处',tech:'滚揉或掐按。通督脉治颈项强痛。',meridian:'手太阳小肠经'},
  ],
  backPain:[
    {point:'肾俞',loc:'腰部第2腰椎棘突下旁开1.5寸',tech:'双手叉腰拇指按压或搓揉。补肾强腰。',meridian:'足太阳膀胱经'},
    {point:'委中',loc:'膝盖后方腘横纹中点',tech:'拇指按压或拍打。腰背委中求。',meridian:'足太阳膀胱经'},
    {point:'命门',loc:'腰部正中第2腰椎棘突下',tech:'手掌搓热敷按。温肾阳强腰脊。',meridian:'督脉'},
  ],
  anxiety:[
    {point:'太冲',loc:'足背第1、2跖骨间',tech:'从太冲向行间推按。疏肝理气解郁。',meridian:'足厥阴肝经'},
    {point:'内关',loc:'腕横纹上2寸',tech:'拇指按揉3分钟。宁心安神。',meridian:'手厥阴心包经'},
    {point:'膻中',loc:'两乳头连线中点（胸骨正中）',tech:'手掌顺时针轻揉。宽胸理气。',meridian:'任脉'},
  ],
  weightGain:[
    {point:'丰隆',loc:'外踝尖上8寸，胫骨前嵴外两横指',tech:'拇指按压有强烈酸胀感。化痰要穴。',meridian:'足阳明胃经'},
    {point:'阴陵泉',loc:'小腿内侧，胫骨内侧髁后下方凹陷',tech:'按揉5分钟。健脾利湿。',meridian:'足太阴脾经'},
    {point:'天枢',loc:'肚脐旁开2寸',tech:'按揉或艾灸。调理肠胃。',meridian:'足阳明胃经'},
  ],
  cold:[
    {point:'风池',loc:'枕骨下凹陷',tech:'拇指按揉至局部发热。祛风解表。',meridian:'足少阳胆经'},
    {point:'大椎',loc:'第7颈椎棘突下',tech:'艾灸或搓热。振奋阳气驱寒。',meridian:'督脉'},
    {point:'合谷',loc:'虎口处',tech:'按压至酸胀。解表退热。',meridian:'手阳明大肠经'},
  ],
  menstrual:[
    {point:'三阴交',loc:'内踝尖上3寸',tech:'按揉或艾灸10分钟。调经要穴。',meridian:'足太阴脾经'},
    {point:'关元',loc:'肚脐下3寸',tech:'艾灸或热敷。暖宫散寒。',meridian:'任脉'},
    {point:'血海',loc:'髌骨内侧上2寸，股内侧肌隆起处',tech:'拇指按揉3分钟。活血调经。',meridian:'足太阴脾经'},
  ],
  hairLoss:[
    {point:'百会',loc:'头顶正中，两耳尖连线中点',tech:'手指轻叩或按揉。升提阳气。',meridian:'督脉'},
    {point:'肾俞',loc:'腰部第2腰椎旁开1.5寸',tech:'搓揉至局部发热。肾其华在发。',meridian:'足太阳膀胱经'},
    {point:'风池',loc:'枕骨下',tech:'按揉至头皮发热。促进头部血液循环。',meridian:'足少阳胆经'},
  ],
  skinDry:[
    {point:'太溪',loc:'内踝尖与跟腱之间',tech:'按揉3分钟。滋阴润燥。',meridian:'足少阴肾经'},
    {point:'三阴交',loc:'内踝尖上3寸',tech:'按揉5分钟。调理三阴经。',meridian:'足太阴脾经'},
    {point:'肺俞',loc:'第3胸椎棘突下旁开1.5寸',tech:'按揉或艾灸。肺主皮毛。',meridian:'足太阳膀胱经'},
  ],
};

// ─── Notifications ───
let notifiedKeys = new Set(); // track already-fired keys for today (date-rid-hh:mm)

async function requestNotifPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result; // 'granted' | 'denied' | 'default'
  } catch(e) { return 'error'; }
}

function showToast(msg) {
  // in-app fallback when system notifications unavailable
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._tid);
  el._tid = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-40px)';
  }, 4000);
}

function pad(n) { return String(n).padStart(2,'0'); }

function fireNotification(title, body, key) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: key, requireInteraction: true, vibrate: [200,100,200] });
    }
  } catch(e) { /* silent */ }
  // always show in-app toast as backup
  showToast(title + '\n' + body);
}

function checkAndFireNotifications() {
  if (reminders.length === 0) return;

  const now = new Date();
  const today = ts(now);
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const curTime = hh + ':' + mm;

  // reset notifiedKeys if date changed
  const trackedDate = notifiedKeys.values().next().value?.split('-').slice(0,3).join('-') || '';
  if (trackedDate && !trackedDate.startsWith(today)) {
    notifiedKeys.clear();
  }

  const enabled = reminders.filter(r => r.is_enabled);

  enabled.forEach(r => {
    const t5 = (r.time||'').slice(0,5);

    // task blocks — alert at start time
    if (_isBlock(r)) {
      const key = `${today}-${r.id}-${t5}`;
      if (!notifiedKeys.has(key) && curTime === t5) {
        notifiedKeys.add(key);
        fireNotification('📅 ' + r.title, r.message, key);
      }
      return;
    }

    // interval reminders
    if (r.interval_minutes) {
      const start = (r.active_hours_start||r.time||'09:00').slice(0,5);
      const end = (r.active_hours_end||'23:59').slice(0,5);
      if (curTime < start || curTime > end) return;

      const [sh, sm] = start.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const diff = nowMin - startMin;
      if (diff >= 0 && diff % r.interval_minutes === 0) {
        const key = `${today}-${r.id}-${curTime}`;
        if (!notifiedKeys.has(key)) {
          notifiedKeys.add(key);
          fireNotification(emoji(r.type) + ' ' + r.title, r.message, key);
        }
      }
      return;
    }

    // point reminders — fire at exact time
    const key = `${today}-${r.id}-${t5}`;
    if (!notifiedKeys.has(key) && curTime === t5) {
      notifiedKeys.add(key);
      fireNotification(emoji(r.type) + ' ' + r.title, r.message, key);
    }
  });
}

let _notifInterval = null;
function startNotificationLoop() {
  if (_notifInterval) clearInterval(_notifInterval);
  _notifInterval = setInterval(checkAndFireNotifications, 30000);
  updateNotifBanner();
}

async function enableNotifications() {
  const result = await requestNotifPermission();
  if (result === 'granted') {
    showToast('✅ 通知已开启！');
  } else if (result === 'denied') {
    alert('通知权限被拒绝。\\n请在浏览器设置中允许通知。');
  } else {
    alert('当前浏览器不支持系统通知。\\n将使用页内提醒代替。');
  }
  updateNotifBanner();
}

function updateNotifBanner() {
  const banner = document.getElementById('notif-banner');
  if (!banner) return;
  if (!('Notification' in window) || Notification.permission === 'granted') {
    banner.style.display = 'none';
  } else {
    banner.style.display = 'block';
  }
}

// ─── On load, check for existing session ───
(async function init() {
  // Unregister all service workers to prevent stale cache
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    user = session.user;
    document.getElementById('drawer-email').textContent = user.email || '';
    document.getElementById('drawer-name').textContent = user.email?.split('@')[0] || '用户';
    document.getElementById('auth-box').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    await loadAll();
    goTab('dashboard');
    startNotificationLoop();
  }
})();
