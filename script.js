/* ═══════════════════════════════════════════════════════
   DriveWise — script.js
   EmailJS integration for real OTP emails
═══════════════════════════════════════════════════════ */

// ╔══════════════════════════════════════════════════════╗
// ║  EMAILJS CONFIG — replace these 3 values            ║
// ║  See EMAILJS_SETUP.md for step-by-step instructions ║
// ╚══════════════════════════════════════════════════════╝
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';   // from Account → General
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';   // from Email Services tab
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';  // from Email Templates tab

// ── Map / emoji state ─────────────────────────────────
let selectedEmoji = null;
const placedEmojis = [];
const undoneEmojis = [];

// ── Auth state ────────────────────────────────────────
let currentOTP   = null;
let otpExpiry    = null;      // timestamp — OTP expires after 10 min
let pendingEmail = null;
let pendingName  = null;
let pendingPwd   = null;
let resetEmail   = null;
let otpPurpose   = null;      // 'signup' | 'reset'

// ── LocalStorage helpers ──────────────────────────────
const ls = {
  get:    k => { try { return JSON.parse(localStorage.getItem(k)); } catch(_){ return null; } },
  set:    (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){} },
  remove: k => { try { localStorage.removeItem(k); } catch(_){} }
};

function getUsers()    { return ls.get('dw_users')   || {}; }
function saveUsers(u)  { ls.set('dw_users', u); }
function getSession()  { return ls.get('dw_session') || null; }
function saveSession(s){ ls.set('dw_session', s); }
function clearSession(){ ls.remove('dw_session'); }

// ── History ───────────────────────────────────────────
let historyItems = ls.get('drivewiseHistory') || [];

function saveHistory(){ ls.set('drivewiseHistory', historyItems); }

function addHistoryItem(emoji, imageData){
  historyItems.unshift({
    id: Date.now(), emoji,
    time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    date: new Date().toLocaleDateString(),
    image: imageData || null
  });
  saveHistory(); renderHistory(); updateHistoryCount();
}

function renderHistory(){
  const c = document.getElementById('historyContainer');
  if(!c) return;
  c.innerHTML = '';
  if(!historyItems.length){
    c.innerHTML = `<div class="p-8 text-center text-gray-500"><i class="fas fa-history text-4xl mb-4 block"></i><p>No history yet</p></div>`;
    return;
  }
  const labelMap = {'🚧':'Roadwork','🚗💥':'Accident','🐌':'Slow Traffic','🌧️':'Weather','🚓':'Police'};
  const bgMap    = {'🚧':'bg-blue-50','🚗💥':'bg-red-50','🐌':'bg-yellow-50','🌧️':'bg-gray-50','🚓':'bg-blue-100'};
  historyItems.forEach(item => {
    const d = document.createElement('div');
    d.className = 'history-item border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150';
    d.innerHTML = `<div class="flex items-center p-4">
      <div class="flex-shrink-0 w-16 h-16 ${bgMap[item.emoji]||'bg-gray-50'} rounded-lg flex items-center justify-center text-3xl">${item.emoji}</div>
      <div class="ml-4 flex-grow">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-gray-800">${labelMap[item.emoji]||'Incident'}</h3>
          <span class="text-xs text-gray-500">${item.time} · ${item.date}</span>
        </div>
        <div class="mt-1 flex items-center">
          <div class="w-8 h-8 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
            ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover">` : `<i class="fas fa-image text-gray-300"></i>`}
          </div>
          <span class="ml-2 text-sm text-gray-600">${item.image ? 'Image attached' : 'No image'}</span>
        </div>
      </div>
    </div>`;
    c.appendChild(d);
  });
}

function clearHistory(){
  if(confirm('Clear all history?')){ historyItems=[]; saveHistory(); renderHistory(); updateHistoryCount(); }
}
function updateHistoryCount(){
  const el = document.getElementById('historyCount');
  if(el) el.textContent = `${historyItems.length} ${historyItems.length===1?'entry':'entries'}`;
}

// ── Emoji selection ───────────────────────────────────
function selectEmoji(emoji, button){
  document.querySelectorAll('.emoji-toolbar button').forEach(b =>
    b.classList.remove('selected','bg-blue-100','ring-2','ring-blue-500')
  );
  selectedEmoji = (selectedEmoji === emoji) ? null : emoji;
  if(selectedEmoji) button.classList.add('selected','bg-blue-100','ring-2','ring-blue-500');
  // Update map cursor so user knows an emoji is active
  var mc = document.getElementById('trafficMap');
  if(mc) mc.style.cursor = selectedEmoji ? 'crosshair' : '';
}

// ═══════════════════════════════════════════════════════
//  EMAILJS — send OTP email
// ═══════════════════════════════════════════════════════
function isEmailJsConfigured(){
  return EMAILJS_PUBLIC_KEY  !== 'YOUR_PUBLIC_KEY'
      && EMAILJS_SERVICE_ID  !== 'YOUR_SERVICE_ID'
      && EMAILJS_TEMPLATE_ID !== 'YOUR_TEMPLATE_ID';
}

async function sendOTPEmail(toEmail, otp, recipientName){
  // If EmailJS hasn't been configured yet, fall back to demo mode
  if(!isEmailJsConfigured()){
    console.warn('EmailJS not configured — using demo mode. See EMAILJS_SETUP.md');
    setOtpBanner('demo', `⚠️ Demo mode: your OTP is <strong>${otp}</strong> (EmailJS not set up yet)`);
    return;
  }

  setOtpBanner('sending', 'Sending email…');

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email:    toEmail,
        to_name:     recipientName || toEmail,
        otp_code:    otp,
        expiry_mins: 10
      },
      EMAILJS_PUBLIC_KEY
    );
    setOtpBanner('sent', `✅ OTP sent to ${toEmail} — check your inbox (and spam folder)`);
  } catch(err){
    console.error('EmailJS error:', err);
    // Show the OTP in demo mode so the user isn't completely stuck
    setOtpBanner('error', `❌ Email failed to send. Demo OTP: <strong>${otp}</strong>`);
  }
}

// ── OTP status banner helper ──────────────────────────
function setOtpBanner(state, html){
  const banner = document.getElementById('otp-status-banner');
  const text   = document.getElementById('otp-status-text');
  if(!banner || !text) return;

  banner.className = 'otp-status-banner';
  if(state === 'sending'){
    banner.classList.add('otp-sending');
    text.innerHTML = `<span class="btn-spinner"></span>&nbsp; ${html}`;
  } else if(state === 'sent'){
    banner.classList.add('otp-sent');
    text.innerHTML = html;
  } else if(state === 'error' || state === 'demo'){
    banner.classList.add('otp-error');
    text.innerHTML = html;
  }
  banner.classList.remove('hidden');
}

// ── Generate OTP ──────────────────────────────────────
function generateOTP(){
  currentOTP  = String(Math.floor(100000 + Math.random() * 900000));
  otpExpiry   = Date.now() + 10 * 60 * 1000; // 10 minutes
  return currentOTP;
}

function isOtpExpired(){ return Date.now() > otpExpiry; }

// ── Auth modal helpers ────────────────────────────────
function showAuthStep(id){
  document.querySelectorAll('.auth-step').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('step-animate');
  setTimeout(() => el.classList.remove('step-animate'), 400);
}

function openAuthModal(stepId){
  document.getElementById('loginOverlay')?.classList.remove('hidden');
  clearAuthErrors();
  showAuthStep(stepId || 'step-email');
}

function closeAuthModal(){
  document.getElementById('loginOverlay')?.classList.add('hidden');
  resetAuthState();
}

function clearAuthErrors(){
  document.querySelectorAll('.auth-error').forEach(e => { e.textContent=''; e.classList.add('hidden'); });
}

function showError(id, msg){
  const el = document.getElementById(id);
  if(el){ el.textContent = msg; el.classList.remove('hidden'); }
}

function resetAuthState(){
  currentOTP=null; otpExpiry=null; pendingEmail=null; pendingName=null;
  pendingPwd=null; resetEmail=null; otpPurpose=null;
  document.querySelectorAll('.auth-input').forEach(i => { if(i) i.value=''; });
  clearAuthErrors();
}

// ── Button loading state helpers ──────────────────────
function setLoading(btnTextId, btnSpinnerId, loading){
  document.getElementById(btnTextId)?.classList.toggle('hidden', loading);
  document.getElementById(btnSpinnerId)?.classList.toggle('hidden', !loading);
}

// ── Post-login header ─────────────────────────────────
function updateHeaderForUser(name){
  const btn  = document.getElementById('profileButton');
  const drop = document.getElementById('profileDropdown');
  btn.innerHTML = `<i class="fas fa-user-check mr-2"></i><span id="welcomeText"></span>`;
  btn.classList.add('logged-in-btn');

  // Typewriter
  const span   = document.getElementById('welcomeText');
  const display = `Hi, ${name}!`;
  span.textContent = '';
  let i = 0;
  (function type(){ if(i < display.length){ span.textContent += display[i++]; setTimeout(type, 55); } })();

  // Dropdown → logout
  drop.innerHTML = `
    <div class="px-4 py-2 text-sm font-semibold text-gray-800 border-b border-gray-100">${name}</div>
    <a href="#" id="logoutBtn" class="block px-4 py-2 text-sm text-red-500 hover:bg-red-50">
      <i class="fas fa-sign-out-alt mr-2"></i>Sign Out
    </a>`;
  document.getElementById('logoutBtn')?.addEventListener('click', e => { e.preventDefault(); handleLogout(); });
}

function handleLogout(){
  clearSession();
  const btn  = document.getElementById('profileButton');
  const drop = document.getElementById('profileDropdown');
  btn.innerHTML = `<i class="fas fa-user mr-2"></i>Profile`;
  btn.classList.remove('logged-in-btn');
  drop.innerHTML = `
    <a href="#" id="signInBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50">Sign In</a>
    <a href="#" id="signUpBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50">Sign Up</a>`;
  drop.classList.add('hidden');
  reattachDropdownListeners();
}

function reattachDropdownListeners(){
  document.getElementById('signInBtn')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('profileDropdown').classList.add('hidden');
    openAuthModal('step-email');
  });
  document.getElementById('signUpBtn')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('profileDropdown').classList.add('hidden');
    openAuthModal('step-signup');
  });
}

// ═══════════════════════════════════════════════════════
//  DOM READY
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function(){

  // Initialise EmailJS
  if(isEmailJsConfigured()){
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  // ── Leaflet Map ──────────────────────────────────────
  // Markers are real lat/lng anchors — they stay pinned when you pan or zoom
  const dwMap = L.map('trafficMap').setView([17.385, 78.4867], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(dwMap);

  dwMap.on('click', function(e) {
    if(!selectedEmoji) return;

    const cur = selectedEmoji;
    const { lat, lng } = e.latlng;
    const labelMap = {'🚧':'Roadwork','🚗💥':'Accident','🐌':'Slow Traffic','🌧️':'Weather','🚓':'Police'};

    // Create emoji as a real map marker anchored to lat/lng
    const icon = L.divIcon({
      html: '<span style="font-size:1.8rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">' + cur + '</span>',
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    const marker = L.marker([lat, lng], { icon: icon }).addTo(dwMap);
    placedEmojis.push(marker);
    undoneEmojis.length = 0;

    // Log to history immediately
    addHistoryItem(cur, null);

    // Clicking the marker shows a popup with label + optional photo button
    var btnId = 'ph-' + Date.now();
    marker._btnId = btnId;

    function makePopup(imgData) {
      var imgHtml = imgData
        ? '<img src="' + imgData + '" style="width:140px;height:100px;object-fit:cover;border-radius:6px;margin-top:6px;display:block;">'
        : '<button id="' + btnId + '" style="margin-top:8px;padding:4px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-family:Poppins,sans-serif;">📷 Add Photo</button>';
      return '<div style="text-align:center;font-family:Poppins,sans-serif;padding:2px 4px">'
           + '<div style="font-size:1.8rem;line-height:1">' + cur + '</div>'
           + '<div style="font-weight:600;font-size:13px;margin-top:3px">' + (labelMap[cur]||'Incident') + '</div>'
           + imgHtml + '</div>';
    }

    marker.bindPopup(makePopup(null), { maxWidth: 180 });

    marker.on('popupopen', function() {
      var btn = document.getElementById(marker._btnId);
      if(!btn) return;
      btn.onclick = function() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = function() {
          var file = inp.files[0];
          if(!file){ document.body.removeChild(inp); return; }
          var reader = new FileReader();
          reader.onload = function(ev) {
            var data = ev.target.result;
            marker.setPopupContent(makePopup(data));
            // Update history entry
            if(historyItems.length && historyItems[0].emoji === cur && !historyItems[0].image){
              historyItems[0].image = data;
              saveHistory(); renderHistory();
            }
            document.body.removeChild(inp);
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      };
    });
  });

  window.undoEmoji  = function(){ var m = placedEmojis.pop(); if(m){ dwMap.removeLayer(m); undoneEmojis.push(m); } };
  window.redoEmoji  = function(){ var m = undoneEmojis.pop(); if(m){ m.addTo(dwMap); placedEmojis.push(m); } };
  window.refreshMap = function(){ placedEmojis.forEach(function(m){ dwMap.removeLayer(m); }); placedEmojis.length=0; undoneEmojis.length=0; };

  // ── Menu ─────────────────────────────────────────────
  const menuBtn  = document.getElementById('menuButton');
  const menuDrop = document.getElementById('menuDropdown');
  menuBtn?.addEventListener('click', e => { e.stopPropagation(); menuDrop?.classList.toggle('hidden'); });
  document.addEventListener('click', () => menuDrop?.classList.add('hidden'));

  // ── Profile dropdown ──────────────────────────────────
  const profileBtn  = document.getElementById('profileButton');
  const profileDrop = document.getElementById('profileDropdown');
  profileBtn?.addEventListener('click', e => { e.stopPropagation(); profileDrop?.classList.toggle('hidden'); });
  document.addEventListener('click', e => { if(!profileBtn?.contains(e.target)) profileDrop?.classList.add('hidden'); });
  reattachDropdownListeners();

  // Restore session
  const session = getSession();
  if(session?.name && session.name !== "null" && session.name !== "undefined") {
    updateHeaderForUser(session.name);
  } else if(session?.email) {
    const recoveredName = getUsers()[session.email]?.name;
    if(recoveredName) {
      saveSession({ ...session, name: recoveredName });
      updateHeaderForUser(recoveredName);
    }
  }

  // ── Close modal ───────────────────────────────────────
  document.getElementById('closeLogin')?.addEventListener('click', closeAuthModal);
  document.getElementById('loginOverlay')?.addEventListener('click', e => {
    if(e.target === document.getElementById('loginOverlay')) closeAuthModal();
  });

  // ───────────────────────────────────────────────────────
  // STEP 1 — Email
  // ───────────────────────────────────────────────────────
  document.getElementById('btn-next-email')?.addEventListener('click', () => {
    clearAuthErrors();
    const email = document.getElementById('auth-email').value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showError('err-email','Please enter a valid email address.'); return; }
    const users = getUsers();
    if(!users[email]){ showError('err-email','No account found. Please sign up below.'); return; }
    pendingEmail = email;
    document.getElementById('signin-email-display').textContent = email;
    showAuthStep('step-password');
  });

  document.getElementById('auth-email')?.addEventListener('keydown', e => {
    if(e.key === 'Enter') document.getElementById('btn-next-email').click();
  });

  document.getElementById('link-goto-signup-from-email')?.addEventListener('click', e => {
    e.preventDefault(); clearAuthErrors(); showAuthStep('step-signup');
  });

  // ───────────────────────────────────────────────────────
  // STEP 2 — Password
  // ───────────────────────────────────────────────────────
  document.getElementById('btn-change-email')?.addEventListener('click', () => {
    clearAuthErrors(); showAuthStep('step-email');
  });

  document.getElementById('btn-signin')?.addEventListener('click', () => {
    clearAuthErrors();
    const pwd   = document.getElementById('auth-password').value;
    const users = getUsers();
    if(!pwd){ showError('err-password','Please enter your password.'); return; }
    if(!pendingEmail || !users[pendingEmail]){ showError('err-password','Session expired. Please start over.'); showAuthStep('step-email'); return; }
    if(users[pendingEmail].password !== btoa(unescape(encodeURIComponent(pwd)))){ showError('err-password','Incorrect password. Please try again.'); return; }
    const signedInName = users[pendingEmail].name || pendingName || 'User';
    saveSession({ email: pendingEmail, name: signedInName });
    closeAuthModal();
    updateHeaderForUser(signedInName);
  });

  document.getElementById('auth-password')?.addEventListener('keydown', e => {
    if(e.key === 'Enter') document.getElementById('btn-signin').click();
  });

  document.getElementById('toggle-signin-pwd')?.addEventListener('click', () => togglePwd('auth-password','toggle-signin-pwd'));

  document.getElementById('link-forgot-pwd')?.addEventListener('click', e => {
    e.preventDefault(); clearAuthErrors(); showAuthStep('step-forgot');
  });

  document.getElementById('link-goto-signup-from-pwd')?.addEventListener('click', e => {
    e.preventDefault(); clearAuthErrors(); showAuthStep('step-signup');
  });

  // ───────────────────────────────────────────────────────
  // STEP 3 — Forgot password
  // ───────────────────────────────────────────────────────
  document.getElementById('btn-back-to-password')?.addEventListener('click', () => {
    clearAuthErrors(); showAuthStep('step-password');
  });

  document.getElementById('btn-send-reset')?.addEventListener('click', async () => {
    clearAuthErrors();
    const email = document.getElementById('forgot-email').value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showError('err-forgot','Please enter a valid email.'); return; }
    const users = getUsers();
    if(!users[email]){ showError('err-forgot','No account found with this email.'); return; }

    resetEmail  = email;
    otpPurpose  = 'reset';
    const otp   = generateOTP();

    setLoading('btn-send-reset-text','btn-send-reset-spinner', true);
    document.getElementById('otp-target-email').textContent = email;
    document.querySelectorAll('.otp-box').forEach(b => b.value = '');
    showAuthStep('step-otp');

    await sendOTPEmail(email, otp, users[email]?.name);
    setLoading('btn-send-reset-text','btn-send-reset-spinner', false);

    setTimeout(() => document.querySelectorAll('.otp-box')[0]?.focus(), 200);
  });

  // ───────────────────────────────────────────────────────
  // STEP 4 — OTP
  // ───────────────────────────────────────────────────────
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, i, all) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g,'').slice(-1);
      if(box.value && i < all.length - 1) all[i+1].focus();
    });
    box.addEventListener('keydown', e => {
      if(e.key === 'Backspace' && !box.value && i > 0) all[i-1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const paste = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);
      [...paste].forEach((ch, j) => { if(all[j]) all[j].value = ch; });
      all[Math.min(paste.length, 5)]?.focus();
    });
  });

  document.getElementById('btn-verify-otp')?.addEventListener('click', () => {
    clearAuthErrors();
    const entered = [...otpBoxes].map(b => b.value).join('');
    if(entered.length < 6){ showError('err-otp','Please enter all 6 digits.'); return; }
    if(isOtpExpired()){ showError('err-otp','OTP has expired. Please request a new one.'); return; }
    if(entered !== currentOTP){ showError('err-otp','Incorrect OTP. Please try again.'); otpBoxes.forEach(b => b.value=''); otpBoxes[0].focus(); return; }

    if(otpPurpose === 'signup'){
      const users = getUsers();
      const safeName = (pendingName || '').trim() || 'User';
      users[pendingEmail] = { name: safeName, password: btoa(unescape(encodeURIComponent(pendingPwd))) };
      saveUsers(users);
      saveSession({ email: pendingEmail, name: safeName });
      closeAuthModal();
      updateHeaderForUser(safeName);
    } else {
      showAuthStep('step-new-password');
    }
  });

  document.getElementById('btn-resend-otp')?.addEventListener('click', async () => {
    clearAuthErrors();
    const email = otpPurpose === 'reset' ? resetEmail : pendingEmail;
    const name  = otpPurpose === 'reset' ? getUsers()[resetEmail]?.name : pendingName;
    const otp   = generateOTP();
    otpBoxes.forEach(b => b.value=''); otpBoxes[0].focus();
    await sendOTPEmail(email, otp, name);
  });

  // ───────────────────────────────────────────────────────
  // STEP 5 — New password
  // ───────────────────────────────────────────────────────
  document.getElementById('btn-set-new-pwd')?.addEventListener('click', () => {
    clearAuthErrors();
    const p1 = document.getElementById('new-pwd').value;
    const p2 = document.getElementById('new-pwd-confirm').value;
    if(p1.length < 6){ showError('err-new-pwd','Password must be at least 6 characters.'); return; }
    if(p1 !== p2){ showError('err-new-pwd','Passwords do not match.'); return; }
    const users = getUsers();
    if(resetEmail && users[resetEmail]){
      users[resetEmail].password = btoa(unescape(encodeURIComponent(p1)));
      saveUsers(users);
    }
    pendingEmail = resetEmail;
    document.getElementById('signin-email-display').textContent = resetEmail;
    document.getElementById('auth-password').value = '';
    showAuthStep('step-password');
  });

  document.getElementById('toggle-new-pwd')?.addEventListener('click',         () => togglePwd('new-pwd','toggle-new-pwd'));
  document.getElementById('toggle-new-pwd-confirm')?.addEventListener('click', () => togglePwd('new-pwd-confirm','toggle-new-pwd-confirm'));

  // ───────────────────────────────────────────────────────
  // STEP 6 — Sign Up
  // ───────────────────────────────────────────────────────
  document.getElementById('link-goto-signin-from-signup')?.addEventListener('click', e => {
    e.preventDefault(); clearAuthErrors(); showAuthStep('step-email');
  });

  document.getElementById('btn-do-signup')?.addEventListener('click', async () => {
    clearAuthErrors();
    const name  = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const p1    = document.getElementById('signup-pwd').value;
    const p2    = document.getElementById('signup-pwd-confirm').value;

    if(!name)  { showError('err-signup','Please enter your full name.'); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showError('err-signup','Please enter a valid email.'); return; }
    if(p1.length < 6){ showError('err-signup','Password must be at least 6 characters.'); return; }
    if(p1 !== p2){ showError('err-signup','Passwords do not match.'); return; }
    if(getUsers()[email]){ showError('err-signup','An account already exists with this email. Please sign in.'); return; }

    pendingEmail = email; pendingName = name; pendingPwd = p1; otpPurpose = 'signup';
    const otp = generateOTP();

    setLoading('btn-signup-text','btn-signup-spinner', true);
    document.getElementById('otp-target-email').textContent = email;
    document.querySelectorAll('.otp-box').forEach(b => b.value='');
    showAuthStep('step-otp');

    await sendOTPEmail(email, otp, name);
    setLoading('btn-signup-text','btn-signup-spinner', false);

    setTimeout(() => document.querySelectorAll('.otp-box')[0]?.focus(), 200);
  });

  document.getElementById('toggle-signup-pwd')?.addEventListener('click',         () => togglePwd('signup-pwd','toggle-signup-pwd'));
  document.getElementById('toggle-signup-pwd-confirm')?.addEventListener('click', () => togglePwd('signup-pwd-confirm','toggle-signup-pwd-confirm'));

  // ── Password show/hide utility ────────────────────────
  function togglePwd(fieldId, btnId){
    const inp = document.getElementById(fieldId);
    const ic  = document.querySelector(`#${btnId} i`);
    if(!inp || !ic) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    ic.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  }

  // ── History overlay ────────────────────────────────────
  document.getElementById('openHistory')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('whiteOverlay')?.classList.remove('hidden');
    renderHistory(); updateHistoryCount();
  });
  document.getElementById('closeHistory')?.addEventListener('click', () =>
    document.getElementById('whiteOverlay')?.classList.add('hidden')
  );

  // ── Dark mode ──────────────────────────────────────────
  const darkToggle = document.getElementById('darkToggle');
  const root       = document.documentElement;

  function applyTheme(dark){
    root.classList.toggle('dark', dark);
    if(darkToggle) darkToggle.innerHTML = dark
      ? `<span class="toggle-icon">☀️</span><span>Light</span>`
      : `<span class="toggle-icon">🌙</span><span>Dark</span>`;
    ls.set('drivewiseTheme', dark ? 'dark' : 'light');
  }

  darkToggle?.addEventListener('click', () => applyTheme(!root.classList.contains('dark')));
  applyTheme(ls.get('drivewiseTheme') === 'dark');

  // ── Emoji preview dismiss ──────────────────────────────
  document.addEventListener('click', e => {
    if(!e.target.closest('.emoji')) document.getElementById('emojiPreview')?.remove();
  });

  renderHistory();
  updateHistoryCount();
});
