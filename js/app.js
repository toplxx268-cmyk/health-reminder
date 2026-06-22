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
  document.getElementById('top-title').textContent = {dashboard:'今日提醒',settings:'中医养生',diet:'饮食记录'}[name]||'健康提醒';

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
let tcmTab = 'recommend';        // 'recommend' | 'log'

function renderSett() {
  renderTCM();
}

function renderTCM() {
  loadTCMLogs();

  // sub-tabs
  let html = '<div style="display:flex;gap:8px;margin-bottom:12px"><button onclick="switchTCMTab(\'recommend\')" style="flex:1;padding:10px;border-radius:10px;border:none;font-size:14px;cursor:pointer;font-weight:600;background:'+(tcmTab==='recommend'?'var(--g)':'#E5E5EA')+';color:'+(tcmTab==='recommend'?'#fff':'var(--t)')+'">🩺 症状推荐</button><button onclick="switchTCMTab(\'log\')" style="flex:1;padding:10px;border-radius:10px;border:none;font-size:14px;cursor:pointer;font-weight:600;background:'+(tcmTab==='log'?'var(--g)':'#E5E5EA')+';color:'+(tcmTab==='log'?'#fff':'var(--t)')+'">📝 养生记录</button></div>';

  if (tcmTab === 'log') {
    html += renderTCMLogTab();
    document.getElementById('tcm-recommendations').innerHTML = html;
    return;
  }

  // === RECOMMEND TAB ===
  let tagHtml = '';
  const allEntries = [
    ...TCM_SYMPTOMS.map(s => ({id:s.id, nm:s.nm, em:s.catEm, isCustom:false})),
    ...Object.entries(tcmCustomMap).map(([id, nm]) => ({id, nm, em:'✏️', isCustom:true}))
  ];
  allEntries.forEach(s => {
    const sel = tcmSelected.has(s.id);
    const st = s.isCustom
      ? 'border:1.5px solid '+(sel?'var(--b)':'var(--sep)')+';background:'+(sel?'rgba(0,122,255,.1)':'#fff')+';color:'+(sel?'var(--b)':'var(--t)')
      : 'border:1.5px solid '+(sel?'var(--g)':'var(--sep)')+';background:'+(sel?'rgba(52,199,89,.12)':'#fff');
    const delBtn = (sel || s.isCustom) ? '<button onclick="event.stopPropagation();removeSymptom(\''+s.id+'\')" style="padding:4px 7px;border-radius:0 20px 20px 0;border:1.5px solid var(--r);border-left:none;background:#fff;color:var(--r);font-size:11px;cursor:pointer;font-weight:700" title="移除">✕</button>' : '';
    const radius = delBtn ? 'border-radius:20px 0 0 20px;' : 'border-radius:20px;';
    tagHtml += '<span style="display:inline-flex;align-items:center">'+'<button onclick="toggleSymptom(\''+s.id+'\')" style="padding:6px 10px;'+radius+st+';font-size:13px;cursor:pointer;white-space:nowrap">'+s.em+' '+s.nm+(sel?' ✓':'')+'</button>'+delBtn+'</span>';
  });
  tagHtml += '<input type="text" id="custom-symptom-input" placeholder="输入症状..." style="width:100px;padding:6px 10px;border-radius:20px;border:1.5px dashed var(--sep);font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\')addCustomSymptom()"><button onclick="addCustomSymptom()" style="padding:6px 10px;border-radius:20px;border:none;background:var(--b);color:#fff;font-size:12px;cursor:pointer">＋</button>';
  document.getElementById('tcm-symptom-tags').innerHTML = tagHtml;

  const recEl = document.getElementById('tcm-recommendations');
  if (tcmSelected.size === 0) {
    recEl.innerHTML = html + '<div class="card" style="text-align:center;color:var(--s);padding:24px">👆 点击上方症状标签<br>获取食疗·茶饮·穴位推荐</div>';
    return;
  }

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

    const kws = isCustom ? [symName] : (allKW[sid] || [symName]);

    TEAS.forEach(t => {
      const txt = t.suitableFor + t.description + t.effects.join('');
      if (kws.some(kw => txt.includes(kw)) && !teas[t.key]) teas[t.key] = { ...t, matchSymptom: symName };
    });
    TEA_BLENDS.forEach(b => {
      const txt = b.for + b.effects.join('') + b.name;
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
  });

  html += '<div class="st">🥗 中医食疗推荐</div>';
  const foodList = Object.values(foods).slice(0, 8);
  if (foodList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配的食疗方案</div>';
  else foodList.forEach(f => {
    html += '<div class="tcm-item"><div class="tcm-food">🌿 '+f.food+' <span style="font-size:11px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:10px;margin-left:6px">性'+f.nature+'</span></div><div style="font-size:13px;color:var(--g);font-weight:500;margin-bottom:2px">'+f.action+'</div><div style="font-size:12px;color:var(--s)">'+f.note+'</div></div>';
  });

  html += '<div class="st">🍵 茶饮推荐</div>';
  const blendList = Object.values(blends).slice(0, 4);
  const teaList = Object.values(teas).slice(0, 4);
  if (blendList.length === 0 && teaList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配茶饮</div>';
  else {
    blendList.forEach(b => {
      html += '<div class="tcm-item"><div class="tcm-food">🍵 '+b.name+' <span style="font-size:10px;background:rgba(175,82,222,.1);color:var(--p);padding:1px 6px;border-radius:10px;margin-left:4px">搭配</span><span style="font-size:11px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:10px;margin-left:4px">性'+b.nature+'</span></div><div style="font-size:12px;color:var(--s);margin-bottom:2px">配方：'+b.ingredients.join('+')+' · '+b.recipe+'</div><div style="font-size:12px;color:var(--g)">✅ '+b.for+'</div><div style="font-size:12px;color:var(--o);margin-top:2px">⚠️ '+b.caution+'</div></div>';
    });
    teaList.forEach(t => {
      html += '<div class="tcm-item"><div class="tcm-food">🍵 '+t.name+' <span style="font-size:11px;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:10px;margin-left:6px">性'+t.nature+'</span></div><div style="font-size:12px;color:var(--s)">'+t.effects.slice(0,4).join('·')+'</div><div style="font-size:12px;color:var(--o);margin-top:2px">⚠️ '+t.caution+'</div></div>';
    });
  }

  html += '<div class="st">💆 穴位按摩 · 经络推拿</div>';
  const pointList = Object.values(points).slice(0, 6);
  if (pointList.length === 0) html += '<div class="card" style="color:var(--s);text-align:center">暂无匹配穴位</div>';
  else pointList.forEach(p => {
    html += '<div class="tcm-item"><div class="tcm-food">📍 '+p.point+' <span style="font-size:10px;color:var(--s);margin-left:4px">'+p.meridian+'</span></div><div style="font-size:12px;color:var(--s);margin-bottom:4px">位置：'+p.loc+'</div><div style="font-size:12px;color:var(--g)">手法：'+p.tech+'</div></div>';
  });

  recEl.innerHTML = html;
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
  const todayLogs = tcmLogs.filter(l => l.date === ts());
  let h = '<div class="card" style="text-align:center;padding:12px;margin-bottom:12px"><span style="font-weight:600">'+new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})+'</span></div>';

  if (todayLogs.length === 0) {
    h += '<div class="card" style="text-align:center;color:var(--s);padding:24px">今天还没有记录<br>点击下方按钮快速记录</div>';
  } else {
    todayLogs.forEach(l => {
      h += '<div class="tcm-item" style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600;font-size:14px">'+(l.emoji||'✅')+' '+l.text+'</div><div style="font-size:11px;color:var(--s)">'+l.time+'</div></div><button onclick="deleteTCMLog(\''+l.id+'\')" style="background:none;border:none;color:var(--r);cursor:pointer;font-size:16px">✕</button></div>';
    });
  }

  h += '<div class="st" style="margin-top:16px">快捷记录</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
  [{emoji:'🍵',text:'喝茶养生'},{emoji:'💆',text:'穴位按摩'},{emoji:'🧘',text:'太极/八段锦'},{emoji:'🦶',text:'泡脚'},{emoji:'☀️',text:'晒太阳'},{emoji:'🧎',text:'冥想静坐'},{emoji:'🍲',text:'食疗调理'},{emoji:'📿',text:'经络推拿'},{emoji:'🌿',text:'艾灸'},{emoji:'💪',text:'五禽戏'},{emoji:'🧑‍🤝‍🧑',text:'站桩'},{emoji:'😴',text:'子午觉'}].forEach(q => {
    h += '<button onclick="addTCMLog(\''+q.emoji+'\',\''+q.text+'\')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--sep);background:#fff;font-size:12px;cursor:pointer">'+q.emoji+' '+q.text+'</button>';
  });
  h += '</div>';

  h += '<div style="display:flex;gap:6px;margin-top:12px"><input type="text" id="tcm-log-input" placeholder="自定义记录..." style="flex:1;padding:8px 12px;border-radius:20px;border:1.5px dashed var(--sep);font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\')addCustomTCMLog()"><button onclick="addCustomTCMLog()" style="padding:8px 14px;border-radius:20px;border:none;background:var(--g);color:#fff;font-size:13px;cursor:pointer">记录</button></div>';

  const pastLogs = tcmLogs.filter(l => l.date !== ts()).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (pastLogs.length > 0) {
    h += '<div class="st" style="margin-top:20px">历史记录</div>';
    let lastDate = '';
    pastLogs.forEach(l => {
      if (l.date !== lastDate) {
        h += '<div style="font-size:12px;font-weight:600;color:var(--s);margin:8px 0 4px">'+l.date+'</div>';
        lastDate = l.date;
      }
      h += '<div style="font-size:13px;padding:4px 8px;color:var(--s)">'+(l.emoji||'✅')+' '+l.text+' <span style="font-size:10px">'+l.time+'</span></div>';
    });
  }

  return h;
}

// TCM Log functions (localStorage)
function loadTCMLogs() {
  try { tcmLogs = JSON.parse(localStorage.getItem('tcm_logs')||'[]'); } catch(e) { tcmLogs = []; }
}
function saveTCMLogs() {
  localStorage.setItem('tcm_logs', JSON.stringify(tcmLogs));
}
function addTCMLog(emoji, text) {
  tcmLogs.push({id: Date.now().toString(), emoji, text, date: ts(), time: new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
  saveTCMLogs();
  renderTCM();
}
function addCustomTCMLog() {
  const inp = document.getElementById('tcm-log-input');
  if (!inp || !inp.value.trim()) return;
  tcmLogs.push({id: Date.now().toString(), emoji: '✅', text: inp.value.trim(), date: ts(), time: new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
  saveTCMLogs();
  renderTCM();
}
function deleteTCMLog(id) {
  tcmLogs = tcmLogs.filter(l => l.id !== id);
  saveTCMLogs();
  renderTCM();
}


// ─── Data: Teas ───
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
