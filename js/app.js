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
  document.getElementById('top-title').textContent = {dashboard:'今日提醒',settings:'提醒设置',diet:'饮食记录'}[name]||'健康提醒';

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
function renderSett() {
  // Settings now only contains reference guides (static HTML)
  // All edit/delete/new operations are on the dashboard
}

function renderSettGroup(elId, items) {
  const el = document.getElementById(elId);
  if (!items.length) { el.innerHTML = '<div class="card" style="color:var(--s);text-align:center;padding:20px">暂无</div>'; return; }
  el.innerHTML = items.map(r => `
    <div class="srow">
      <span class="em">${emoji(r.type)}</span>
      <div class="inf">
        <div class="nm">${r.title}</div>
        <div class="tm">${r.time.slice(0,5)}${r.interval_minutes?' · 每'+r.interval_minutes+'分钟':''}</div>
      </div>
      <button class="ebtn" onclick="openEdit('${r.id}')">编辑</button>
      <button class="ebtn" onclick="deleteReminder('${r.id}')" style="color:var(--r);border-color:var(--r);margin-left:4px">删除</button>
      <label class="tgl">
        <input type="checkbox" ${r.is_enabled?'checked':''} onchange="toggleEn('${r.id}',this.checked)">
        <span class="sl"></span>
      </label>
    </div>
  `).join('');
}

async function toggleEn(id, on) {
  await supabase.from('reminders').update({is_enabled:on}).eq('id',id);
  const r = reminders.find(x => x.id===id);
  if (r) r.is_enabled = on;
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
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/health-reminder/sw.js').catch(() => {});
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
