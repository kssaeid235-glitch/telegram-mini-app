'use strict';

/* ============ CONSTANTS ============ */
const ADMIN_NUMERIC_ID = 9260106248;
const BOT_1_USERNAME = 'Viral_Video_app_bot';
const BOT_2_USERNAME = 'FileStoragebdbot';
const STORAGE_CHANNEL_ID = -1005626980298;
const MINI_APP_URL = 'https://telegram-mini-app.kssaeid235.workers.dev';
const MINI_APP_DIRECT_LINK = 'https://t.me/Viral_Video_app_bot/myapp';
const DEFAULT_FAKE_USERS = '10,000+';
const DEFAULT_COINS_PER_AD = 10;
const DEFAULT_UNLOCK_COINS = 500;
const DEFAULT_AUTO_DELETE_MINUTES = 30;

const STORAGE_KEY = 'vva_state_v1';
const COIN_STORE_KEY = 'vva_coins_v1';
const TOKEN_TTL_MS = 5 * 60 * 1000;

/* ============ FIREBASE CONFIG (paste your keys here) ============ */
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

let fbApp = null, fbDb = null, fbReady = false, fbAuth = null;

/* ============ DEFAULT STATE ============ */
const DEFAULT_STATE = {
  videos: [
    { id: 'v_demo_1', title: 'অসাধারণ ট্রিকস ভিডিও — অবাক হয়ে যাবেন!', category: 'মজার', views: 12450, thumbnail: '', messageLink: 'https://t.me/private_channel/12', messageId: 12 },
    { id: 'v_demo_2', title: 'মোবাইল দিয়ে এই ৫টি কাজ শিখুন — জীবন বদলে যাবে', category: 'শিক্ষা', views: 8720, thumbnail: '', messageLink: 'https://t.me/private_channel/15', messageId: 15 },
    { id: 'v_demo_3', title: 'TOP 10 গেমিং হাইলাইটস — মিস করবেন না!', category: 'গেমিং', views: 32100, thumbnail: '', messageLink: 'https://t.me/private_channel/21', messageId: 21 },
    { id: 'v_demo_4', title: 'প্রিমিয়াম মোটিভেশন ভিডিও — আজই দেখুন', category: 'বিনোদন', views: 5890, thumbnail: '', messageLink: 'https://t.me/private_channel/27', messageId: 27 }
  ],
  categories: ['সব', 'মজার', 'শিক্ষা', 'বিনোদন', 'টেক', 'গেমিং'],
  settings: {
    fakeUsers: DEFAULT_FAKE_USERS,
    coinsPerAd: DEFAULT_COINS_PER_AD,
    unlockCoins: DEFAULT_UNLOCK_COINS,
    autoDeleteMinutes: DEFAULT_AUTO_DELETE_MINUTES,
    adSteps: 3, adsPerStep: 1,
    channelLink: 'https://t.me/Viral_Video_app_bot',
    channelTitle: 'Viral Video Official',
    channelDesc: 'প্রতিদিন নতুন এক্সক্লুসিভ ভিডিও পেতে আমাদের চ্যানেলে জয়েন করুন।',
    buttonLabels: {
      home: 'হোম', reward: 'রিওয়ার্ড', channel: 'চ্যানেল', settings: 'সেটিংস',
      watchAd: 'অ্যাড দেখুন', unlock: 'ভিডিও আনলক / ভিডিওটি দেখুন',
      unlockWithCoins: 'কয়েন দিয়ে আনলক', earnCoins: 'অ্যাড দেখে কয়েন আয় করুন',
      share: 'শেয়ার', copyLink: 'কপি লিংক',
      joinChannel: 'চ্যানেল জয়েন করুন',
      unlockReward: 'আনলক করুন', joinReward: 'জয়েন করুন'
    }
  },
  rewards: [
    { id: 'r_demo_1', title: 'প্রিমিয়াম চ্যানেল অ্যাক্সেস', description: 'এক্সক্লুসিভ প্রাইভেট চ্যানেলে যোগ দিন', type: 'channel', coinCost: 300, link: 'https://t.me/private_premium_channel', videoId: '' },
    { id: 'r_demo_2', title: 'সিক্রেট ভিডিও আনলক', description: 'শুধুমাত্র রিওয়ার্ড ইউজারদের জন্য', type: 'video', coinCost: 500, link: '', videoId: 'v_demo_1' }
  ],
  bannedUsers: [],
  analytics: { totalAdsWatched: 0, totalUnlocks: 0, totalVideosViewed: 0 }
};

/* ============ GLOBAL ============ */
let state = null;
let coinsMap = {};
let currentUser = null;
let currentTab = 'home';
let activeCategory = 'সব';
let localAdminPreview = false;

const tg = window.Telegram ? window.Telegram.WebApp : null;

/* ============ FIREBASE INIT ============ */
async function initFirebase() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return false;
  try {
    fbApp = firebase.initializeApp(firebaseConfig);
    fbDb = firebase.firestore();
    fbAuth = firebase.auth();
    try { await fbAuth.signInAnonymously(); } catch (e) { console.warn('Anon auth failed', e); }
    await fbDb.collection('state').doc('global').get({ source: 'server' });
    fbReady = true;
    console.log('[Firebase] Ready');
    return true;
  } catch (e) {
    console.warn('[Firebase] init failed, using localStorage fallback', e);
    return false;
  }
}

/* ============ STATE LOAD/SAVE ============ */
function mergeState(remote) {
  if (!remote || typeof remote !== 'object') return structuredClone(DEFAULT_STATE);
  const merged = { ...DEFAULT_STATE, ...remote };
  merged.settings = { ...DEFAULT_STATE.settings, ...(remote.settings || {}) };
  merged.settings.buttonLabels = { ...DEFAULT_STATE.settings.buttonLabels, ...((remote.settings && remote.settings.buttonLabels) || {}) };
  merged.analytics = { ...DEFAULT_STATE.analytics, ...(remote.analytics || {}) };
  if (!Array.isArray(merged.videos)) merged.videos = [];
  if (!Array.isArray(merged.categories)) merged.categories = structuredClone(DEFAULT_STATE.categories);
  if (!Array.isArray(merged.rewards)) merged.rewards = [];
  if (!Array.isArray(merged.bannedUsers)) merged.bannedUsers = [];
  return merged;
}

function loadStateLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? mergeState(JSON.parse(raw)) : structuredClone(DEFAULT_STATE);
  } catch (e) { return structuredClone(DEFAULT_STATE); }
}

function loadCoinsLocal() {
  try { const raw = localStorage.getItem(COIN_STORE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}

async function loadStateRemote() {
  if (!fbReady) return null;
  try {
    const doc = await fbDb.collection('state').doc('global').get();
    return doc.exists ? doc.data() : null;
  } catch (e) { console.warn('remote load failed', e); return null; }
}

async function loadCoinsRemote(userId) {
  if (!fbReady) return null;
  try {
    const doc = await fbDb.collection('users').doc(String(userId)).get();
    return doc.exists ? Number(doc.data().coins || 0) : 0;
  } catch (e) { return null; }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  if (fbReady) {
    fbDb.collection('state').doc('global').set(state).catch(e => console.warn('FB state save', e));
  }
}

function saveCoins() {
  try { localStorage.setItem(COIN_STORE_KEY, JSON.stringify(coinsMap)); } catch (e) {}
  if (fbReady && currentUser) {
    fbDb.collection('users').doc(String(currentUser.id)).set({ coins: getUserCoins() }, { merge: true }).catch(e => console.warn('FB coin save', e));
  }
}

/* ============ TELEGRAM ============ */
function initTelegram() {
  if (tg) {
    try { tg.ready(); tg.expand(); if (tg.setHeaderColor) tg.setHeaderColor('#07070d'); if (tg.setBackgroundColor) tg.setBackgroundColor('#07070d'); }
    catch (e) {}
  }
  const unsafe = tg && tg.initDataUnsafe ? tg.initDataUnsafe : null;
  if (unsafe && unsafe.user && unsafe.user.id) {
    currentUser = {
      id: unsafe.user.id,
      first_name: unsafe.user.first_name || '',
      last_name: unsafe.user.last_name || '',
      username: unsafe.user.username || '',
      photo_url: unsafe.user.photo_url || '',
      inTelegram: true
    };
  } else {
    currentUser = { id: 100000001, first_name: 'Preview', last_name: 'User', username: 'preview_user', photo_url: '', inTelegram: false };
  }
}

function isInTelegram() { return !!(currentUser && currentUser.inTelegram); }
function isAdmin() { return currentUser && currentUser.id === ADMIN_NUMERIC_ID; }
function canSeeAdmin() { if (isAdmin()) return true; if (!isInTelegram() && localAdminPreview) return true; return false; }
function isBanned() { return state && state.bannedUsers.includes(currentUser.id); }
function getUserCoins() { return Number(coinsMap[currentUser.id] || 0); }
function setUserCoins(v) { coinsMap[currentUser.id] = Math.max(0, Math.floor(v)); saveCoins(); }

/* ============ UTILITIES ============ */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatViews(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function generateSecureToken() {
  if (window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(24);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}

function toast(msg, type) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease, transform .3s ease';
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, 2400);
}

function attachRipple() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.ripple, .btn-primary, .btn-ghost, .btn-unlock, .cat-pill, .video-card, .nav-btn, .admin-hub-btn, .admin-mini-btn, .utility-item, .overlay-back, .modal-close-x');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    const span = document.createElement('span');
    span.className = 'ripple-span';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    const cs = getComputedStyle(target);
    if (cs.position === 'static') target.style.position = 'relative';
    target.appendChild(span);
    setTimeout(() => span.remove(), 640);
  }, true);
}

/* ============ TOKEN CREATION ============ */
async function createUnlockToken(userId, videoId) {
  const token = generateSecureToken();
  if (fbReady) {
    try {
      await fbDb.collection('unlock_tokens').doc(token).set({
        user_id: userId,
        video_id: videoId,
        used: false,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        expires_at: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + TOKEN_TTL_MS))
      });
    } catch (e) { console.warn('Token create failed', e); }
  }
  return token;
}

function parseMessageId(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  const m = s.match(/\/(\d+)\/?$/);
  if (m) return parseInt(m[1], 10);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return 0;
}

/* ============ NAVIGATION ============ */
function switchTab(name) {
  if (!['home', 'reward', 'channel', 'settings'].includes(name)) return;
  currentTab = name;
  document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.tab === name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  if (name === 'home') renderHome();
  if (name === 'reward') renderReward();
  if (name === 'channel') renderChannel();
  if (name === 'settings') renderSettings();
}

/* ============ HEADER ============ */
function renderHeader() {
  const name = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || 'Guest';
  document.getElementById('headerName').textContent = name;
  document.getElementById('headerId').textContent = '#' + currentUser.id;
  const avatar = document.getElementById('headerAvatar');
  if (currentUser.photo_url) { avatar.src = currentUser.photo_url; avatar.style.display = ''; }
  else { avatar.style.display = 'none'; }
  const L = state.settings.buttonLabels;
  document.getElementById('navLabelHome').textContent = L.home;
  document.getElementById('navLabelReward').textContent = L.reward;
  document.getElementById('navLabelChannel').textContent = L.channel;
  document.getElementById('navLabelSettings').textContent = L.settings;
}

/* ============ HOME ============ */
function renderHome() {
  const page = document.getElementById('page-home');
  const cats = state.categories;
  const catsHTML = cats.map(c => `<button class="cat-pill ripple ${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('');
  const list = state.videos.filter(v => activeCategory === 'সব' || v.category === activeCategory);
  const L = state.settings.buttonLabels;
  const videosHTML = list.length === 0
    ? `<div class="empty-state"><div class="empty-ico">🎬</div><div>এই ক্যাটাগরিতে এখনো কোন ভিডিও নেই</div></div>`
    : list.map(v => {
      const thumb = v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
      return `<div class="video-card neon-card ripple" data-video-id="${esc(v.id)}">
        <div class="video-thumb">
          <div class="thumb-fallback">🎬</div>${thumb}
          <div class="video-badge">${esc(v.category)}</div>
          <div class="thumb-play"><div class="thumb-play-btn">▶</div></div>
        </div>
        <div class="video-info">
          <h3 class="video-title">${esc(v.title)}</h3>
          <div class="video-meta">
            <span class="video-cat">${esc(v.category)}</span>
            <span class="video-views">${formatViews(v.views)} views</span>
          </div>
          <button class="btn-unlock" type="button">${esc(L.watchAd)}</button>
        </div>
      </div>`;
    }).join('');
  page.innerHTML = `
    <div class="page-title-bar"><h2 class="page-title">হোম ফিড</h2><p class="page-sub">প্রতিদিন নতুন এক্সক্লুসিভ ভিডিও</p></div>
    <div class="category-strip" id="categoryStrip">${catsHTML}</div>
    <div class="video-feed">${videosHTML}</div>`;
  page.querySelectorAll('.cat-pill').forEach(btn => btn.addEventListener('click', () => { activeCategory = btn.dataset.cat; renderHome(); }));
  page.querySelectorAll('.video-card').forEach(card => card.addEventListener('click', () => openVideoModal(card.dataset.videoId)));
}

/* ============ REWARD ============ */
function renderReward() {
  const page = document.getElementById('page-reward');
  const L = state.settings.buttonLabels;
  const coins = getUserCoins();
  const goal = state.settings.unlockCoins;
  const pct = Math.min(100, Math.round((coins / goal) * 100));
  const rewardsHTML = state.rewards.length === 0
    ? `<div class="empty-state"><div class="empty-ico">🎁</div><div>এখনো কোন রিওয়ার্ড নেই</div></div>`
    : state.rewards.map(r => {
      const canAfford = coins >= r.coinCost;
      return `<div class="reward-card" data-reward-id="${esc(r.id)}">
        <div class="reward-card-head">
          <div><h4 class="reward-card-title">${esc(r.title)}</h4>
          <p class="reward-card-desc">${esc(r.description || (r.type === 'channel' ? 'চ্যানেল রিওয়ার্ড' : 'ভিডিও রিওয়ার্ড'))}</p></div>
          <div class="reward-card-cost">🪙 ${r.coinCost}</div>
        </div>
        <div class="reward-card-actions">
          <button class="btn-primary ripple" type="button" data-reward-action="unlock" data-reward-id="${esc(r.id)}" ${canAfford ? '' : 'disabled'}>
            ${esc(L.unlockReward)} ${canAfford ? '' : '(কয়েন কম)'}
          </button>
        </div>
      </div>`;
    }).join('');
  page.innerHTML = `
    <div class="page-title-bar"><h2 class="page-title">রিওয়ার্ড</h2><p class="page-sub">অ্যাড দেখে কয়েন আয় করুন</p></div>
    <div class="reward-hero neon-card">
      <div class="reward-hero-top"><span class="reward-hero-label">YOUR BALANCE</span><span class="reward-hero-label">UNLOCK GOAL ${goal}</span></div>
      <div class="reward-coin-balance"><span class="coin-ico">🪙</span> ${coins}</div>
      <div class="reward-progress-wrap">
        <div class="reward-progress-label"><span>আনলক প্রোগ্রেস</span><span>${coins} / ${goal}</span></div>
        <div class="reward-progress-bar"><div class="reward-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <button class="btn-primary ripple" type="button" id="btnEarnCoins">${esc(L.earnCoins)}</button>
    </div>
    <div class="reward-section-title">রিওয়ার্ড আইটেম</div>
    <div class="reward-list">${rewardsHTML}</div>`;
  document.getElementById('btnEarnCoins').addEventListener('click', openEarnCoinsModal);
  page.querySelectorAll('[data-reward-action="unlock"]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); handleRewardUnlock(btn.dataset.rewardId); }));
}

async function handleRewardUnlock(rewardId) {
  const r = state.rewards.find(x => x.id === rewardId);
  if (!r) return toast('রিওয়ার্ড পাওয়া যায়নি', 'error');
  const coins = getUserCoins();
  if (coins < r.coinCost) return toast('পর্যাপ্ত কয়েন নেই', 'error');
  setUserCoins(coins - r.coinCost);
  state.analytics.totalUnlocks++;
  saveState();
  if (r.type === 'channel') openRewardChannelModal(r);
  else if (r.type === 'video') {
    const video = state.videos.find(v => v.id === r.videoId);
    if (video) await deliverVideoToBot2(video);
    else toast('ভিডিও পাওয়া যায়নি', 'error');
  }
  renderReward();
  renderHeader();
}

function openRewardChannelModal(reward) {
  const L = state.settings.buttonLabels;
  pushModal({
    title: esc(reward.title),
    bodyHTML: `<p class="modal-sub">আপনি সফলভাবে এই রিওয়ার্ডটি আনলক করেছেন। নিচের বাটনে ক্লিক করে চ্যানেলে জয়েন করুন।</p>
      <div class="reward-unlocked-box"><span class="unlock-check">✅</span> রিওয়ার্ড আনলকড</div>
      <div class="modal-actions mt-3"><button class="btn-primary ripple" type="button" id="btnRewardJoin">${esc(L.joinReward)}</button></div>`,
    onMount: (box) => {
      box.querySelector('#btnRewardJoin').addEventListener('click', () => openTelegramLink(reward.link));
    }
  });
}

/* ============ CHANNEL ============ */
function renderChannel() {
  const page = document.getElementById('page-channel');
  const L = state.settings.buttonLabels;
  const s = state.settings;
  page.innerHTML = `
    <div class="page-title-bar"><h2 class="page-title">আমাদের চ্যানেল</h2><p class="page-sub">এক্সক্লুসিভ কনটেন্ট ও আপডেট</p></div>
    <div class="channel-hero neon-card">
      <div class="channel-ico-wrap">📢</div>
      <h3 class="channel-title">${esc(s.channelTitle)}</h3>
      <p class="channel-desc">${esc(s.channelDesc)}</p>
      <button class="btn-primary ripple" type="button" id="btnJoinChannel">${esc(L.joinChannel)}</button>
    </div>`;
  document.getElementById('btnJoinChannel').addEventListener('click', () => openTelegramLink(s.channelLink));
}

/* ============ SETTINGS ============ */
function renderSettings() {
  const page = document.getElementById('page-settings');
  const L = state.settings.buttonLabels;
  const coins = getUserCoins();
  const fakeUsers = state.settings.fakeUsers;
  const adminHTML = canSeeAdmin() ? `
    <div class="utility-list mt-4">
      <button class="utility-item ripple" type="button" id="btnOpenAdmin" style="background:linear-gradient(135deg, rgba(255,0,128,0.18), rgba(138,43,226,0.18)); border-color: rgba(255,0,128,0.4);">
        <span class="util-left"><span class="util-ico">🛡️</span><span>Admin Panel</span></span><span class="util-chev">›</span>
      </button>
    </div>` : '';
  const previewToggleHTML = !isInTelegram() ? `
    <div class="utility-list mt-4">
      <button class="utility-item ripple" type="button" id="btnTogglePreviewAdmin">
        <span class="util-left"><span class="util-ico">🧪</span><span>Enable Admin (Preview Only)</span></span>
        <span class="util-chev">${localAdminPreview ? '✅' : '⬜'}</span>
      </button>
    </div>` : '';
  const avatarHTML = currentUser.photo_url
    ? `<img class="profile-avatar" src="${esc(currentUser.photo_url)}" alt="">`
    : `<div class="profile-avatar" style="display:grid;place-items:center;font-size:24px;font-weight:800;color:#fff;">${esc((currentUser.first_name || 'U')[0].toUpperCase())}</div>`;
  page.innerHTML = `
    <div class="page-title-bar"><h2 class="page-title">সেটিংস</h2><p class="page-sub">আপনার প্রোফাইল ও অপশন</p></div>
    <div class="profile-card neon-card">
      <div class="profile-top">
        <div class="profile-avatar-wrap">${avatarHTML}</div>
        <div class="profile-info">
          <div class="profile-name">${esc([currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || 'Guest')}</div>
          <div class="profile-username">${currentUser.username ? '@' + esc(currentUser.username) : '—'}</div>
          <span class="profile-id-badge">ID: ${currentUser.id}</span>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-box"><span class="stat-label">কয়েন</span><span class="stat-value">🪙 ${coins}</span></div>
        <div class="stat-box"><span class="stat-label">ব্যবহারকারী</span><span class="stat-value">${esc(fakeUsers)}</span></div>
      </div>
      <button class="btn-primary ripple" type="button" id="btnShare">${esc(L.share)}</button>
    </div>
    <div class="utility-list">
      <button class="utility-item ripple" type="button" id="btnGoChannel"><span class="util-left"><span class="util-ico">📢</span><span>আমাদের চ্যানেল</span></span><span class="util-chev">›</span></button>
      <button class="utility-item ripple" type="button" id="btnGoReward"><span class="util-left"><span class="util-ico">🎁</span><span>রিওয়ার্ড সেন্টার</span></span><span class="util-chev">›</span></button>
      <button class="utility-item ripple" type="button" id="btnAbout"><span class="util-left"><span class="util-ico">ℹ️</span><span>অ্যাপ সম্পর্কে</span></span><span class="util-chev">›</span></button>
    </div>
    ${adminHTML}${previewToggleHTML}`;
  document.getElementById('btnShare').addEventListener('click', openShareModal);
  document.getElementById('btnGoChannel').addEventListener('click', () => switchTab('channel'));
  document.getElementById('btnGoReward').addEventListener('click', () => switchTab('reward'));
  document.getElementById('btnAbout').addEventListener('click', () => toast('Viral Video · Premium v1.0', 'success'));
  const adminBtn = document.getElementById('btnOpenAdmin');
  if (adminBtn) adminBtn.addEventListener('click', openAdminHub);
  const previewBtn = document.getElementById('btnTogglePreviewAdmin');
  if (previewBtn) previewBtn.addEventListener('click', () => { localAdminPreview = !localAdminPreview; renderSettings(); toast(`Admin preview ${localAdminPreview ? 'enabled' : 'disabled'}`, 'success'); });
}

/* ============ SHARE ============ */
function openShareModal() {
  const L = state.settings.buttonLabels;
  const shareUrl = 'https://t.me/' + BOT_1_USERNAME;
  pushModal({
    title: 'শেয়ার করুন',
    bodyHTML: `<p class="modal-sub">আপনার বন্ধুদের সাথে শেয়ার করুন এবং একসাথে ভিডিও উপভোগ করুন।</p>
      <div class="modal-actions">
        <button class="btn-primary ripple" type="button" id="btnShareNative">${esc(L.share)} (Telegram)</button>
        <button class="btn-ghost ripple" type="button" id="btnCopyLink">${esc(L.copyLink)}</button>
      </div>`,
    onMount: (box) => {
      box.querySelector('#btnShareNative').addEventListener('click', () => {
        const text = 'Viral Video · Premium Mini App — এখনই দেখুন!';
        openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(text));
      });
      box.querySelector('#btnCopyLink').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(shareUrl); toast('লিংক কপি হয়েছে', 'success'); }
        catch (e) { toast('কপি ব্যর্থ', 'error'); }
      });
    }
  });
}

/* ============ TELEGRAM LINK ============ */
function openTelegramLink(url) {
  if (!url) return toast('লিংক সেট করা নেই', 'error');
  if (tg && typeof tg.openTelegramLink === 'function') {
    try { tg.openTelegramLink(url); return; } catch (e) {}
  }
  window.open(url, '_blank');
}

/* ============ OVERLAY / MODAL ============ */
const overlayStack = [];
const modalStack = [];

function pushOverlay(renderHTML, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'overlay-screen';
  el.innerHTML = renderHTML;
  document.getElementById('overlayRoot').appendChild(el);
  overlayStack.push(el);
  if (opts.onMount) opts.onMount(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const back = el.querySelector('[data-overlay-back]');
  if (back) back.addEventListener('click', popOverlay);
  return el;
}
function popOverlay() {
  const el = overlayStack.pop();
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 360);
}
function overlayHeaderHTML(title) {
  return `<div class="overlay-header">
    <button class="overlay-back ripple" type="button" data-overlay-back>‹</button>
    <h3 class="overlay-title">${esc(title)}</h3></div>`;
}
function pushModal(opts) {
  const el = document.createElement('div');
  el.className = 'modal-screen';
  el.innerHTML = `<div class="modal-box">
    <button class="modal-close-x ripple" type="button" data-modal-close aria-label="close">✕</button>
    <h3 class="modal-title">${opts.title || ''}</h3>${opts.bodyHTML || ''}</div>`;
  document.getElementById('overlayRoot').appendChild(el);
  modalStack.push(el);
  if (opts.onMount) opts.onMount(el.querySelector('.modal-box'), el);
  requestAnimationFrame(() => el.classList.add('open'));
  const closeFn = () => popModal(el);
  el.querySelector('[data-modal-close]').addEventListener('click', closeFn);
  el.addEventListener('click', (e) => { if (e.target === el) closeFn(); });
  return el;
}
function popModal(el) {
  const idx = modalStack.indexOf(el);
  if (idx === -1) return;
  modalStack.splice(idx, 1);
  el.classList.remove('open');
  setTimeout(() => el.remove(), 300);
}

/* ============ VIDEO MODAL / AD FLOW ============ */
let adFlowToken = 0;

function openVideoModal(videoId) {
  const v = state.videos.find(x => x.id === videoId);
  if (!v) return toast('ভিডিও পাওয়া যায়নি', 'error');
  if (isBanned()) return toast('আপনি ব্যান হয়েছেন', 'error');
  const L = state.settings.buttonLabels;
  const coins = getUserCoins();
  const canUseCoins = coins >= state.settings.unlockCoins;
  pushModal({
    title: esc(v.title),
    bodyHTML: `<p class="modal-sub"><span class="video-cat">${esc(v.category)}</span> &nbsp;·&nbsp; 👁 ${formatViews(v.views)} views</p>
      <div id="videoAdArea"></div>
      <div class="modal-actions">
        <button class="btn-primary ripple" type="button" id="btnStartAd">${esc(L.watchAd)}</button>
        <button class="btn-ghost ripple" type="button" id="btnCoinUnlock" ${canUseCoins ? '' : 'disabled'}>${esc(L.unlockWithCoins)} (🪙 ${state.settings.unlockCoins})</button>
      </div>`,
    onMount: (box, root) => {
      const adArea = box.querySelector('#videoAdArea');
      const btnStart = box.querySelector('#btnStartAd');
      const btnCoin = box.querySelector('#btnCoinUnlock');
      btnStart.addEventListener('click', () => runAdFlow(v, adArea, btnStart, btnCoin, root));
      btnCoin.addEventListener('click', async () => {
        const coinsNow = getUserCoins();
        if (coinsNow < state.settings.unlockCoins) return toast('পর্যাপ্ত কয়েন নেই', 'error');
        setUserCoins(coinsNow - state.settings.unlockCoins);
        incrementAnalytics('unlock'); renderHeader();
        toast('কয়েন দিয়ে আনলক সফল', 'success');
        popModal(root);
        await deliverVideoToBot2(v);
      });
    }
  });
}

async function runAdFlow(v, adArea, btnStart, btnCoin, modalRoot) {
  const token = ++adFlowToken;
  const totalSteps = Math.max(1, Number(state.settings.adSteps) || 1);
  const adsPerStep = Math.max(1, Number(state.settings.adsPerStep) || 1);
  const totalAds = totalSteps * adsPerStep;
  btnStart.disabled = true; btnCoin.disabled = true;
  adArea.innerHTML = `<div class="ad-flow-wrap">
    <div class="ad-flow-head"><span id="adStepLabel">Step 1/${totalSteps}</span><span class="ad-flow-badge" id="adBadgeLabel">Ad 1/${adsPerStep}</span></div>
    <div class="ad-flow-bar"><div class="ad-flow-fill" id="adFill"></div></div>
    <div class="ad-flow-status" id="adStatus">অ্যাড লোড হচ্ছে…</div></div>`;
  const stepLabel = adArea.querySelector('#adStepLabel');
  const badgeLabel = adArea.querySelector('#adBadgeLabel');
  const fill = adArea.querySelector('#adFill');
  const status = adArea.querySelector('#adStatus');
  let overall = 0, completed = 0;
  for (let s = 1; s <= totalSteps; s++) {
    if (token !== adFlowToken) return;
    for (let a = 1; a <= adsPerStep; a++) {
      if (token !== adFlowToken) return;
      stepLabel.textContent = `Step ${s}/${totalSteps}`;
      badgeLabel.textContent = `Ad ${a}/${adsPerStep}`;
      status.textContent = 'অ্যাড চলছে…';
      const duration = 1600 + Math.random() * 400;
      const startTime = performance.now();
      const base = overall;
      await new Promise((resolve) => {
        const tick = () => {
          if (token !== adFlowToken) return resolve();
          const t = Math.min(1, (performance.now() - startTime) / duration);
          fill.style.width = ((base + (1 / totalAds) * t) * 100).toFixed(2) + '%';
          if (t >= 1) return resolve();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      if (token !== adFlowToken) return;
      completed++; overall = completed / totalAds;
      fill.style.width = (overall * 100).toFixed(2) + '%';
      if (document.hidden && Math.random() < 0.25) {
        status.textContent = 'সন্দেহজনক আচরণ — আবার চেষ্টা করুন';
        toast('সন্দেহজনক আচরণ শনাক্ত', 'error');
        adFlowToken++; return;
      }
    }
  }
  state.analytics.totalAdsWatched += totalAds;
  incrementAnalytics('unlock');
  adArea.innerHTML = `<div class="reward-unlocked-box mt-2"><span class="unlock-check">✅</span> ভিডিও আনলক হয়েছে</div>
    <div class="modal-actions"><button class="btn-primary ripple" type="button" id="btnDeliverVideo">${esc(state.settings.buttonLabels.unlock)}</button></div>`;
  const btnDeliver = adArea.querySelector('#btnDeliverVideo');
  btnDeliver.addEventListener('click', async () => {
    popModal(modalRoot);
    await deliverVideoToBot2(v);
  });
}

function incrementAnalytics(kind) {
  if (kind === 'unlock') state.analytics.totalUnlocks++;
  if (kind === 'view') state.analytics.totalVideosViewed++;
  saveState();
}

/* ============ DELIVER VIDEO ============ */
async function deliverVideoToBot2(video) {
  const token = await createUnlockToken(currentUser.id, video.id);
  const link = `https://t.me/${BOT_2_USERNAME}?start=${token}`;
  openTelegramLink(link);
  video.views = (Number(video.views) || 0) + 1;
  incrementAnalytics('view');
  toast('বট ২-এ পাঠানো হচ্ছে…', 'success');
}

/* ============ EARN COINS ============ */
function openEarnCoinsModal() {
  pushModal({
    title: 'কয়েন আয় করুন',
    bodyHTML: `<p class="modal-sub">একটি অ্যাড দেখে <b>${state.settings.coinsPerAd}</b> কয়েন আয় করুন।</p>
      <div id="earnAdArea"></div>
      <div class="modal-actions"><button class="btn-primary ripple" type="button" id="btnEarnStart">অ্যাড দেখুন</button></div>`,
    onMount: (box) => {
      const area = box.querySelector('#earnAdArea');
      const btn = box.querySelector('#btnEarnStart');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const token = ++adFlowToken;
        area.innerHTML = `<div class="ad-flow-wrap">
          <div class="ad-flow-head"><span>Ad</span><span class="ad-flow-badge">Rewarded</span></div>
          <div class="ad-flow-bar"><div class="ad-flow-fill" id="earnFill"></div></div>
          <div class="ad-flow-status">অ্যাড চলছে…</div></div>`;
        const fill = area.querySelector('#earnFill');
        const start = performance.now();
        const dur = 1500;
        await new Promise(resolve => {
          const tick = () => {
            if (token !== adFlowToken) return resolve();
            const t = Math.min(1, (performance.now() - start) / dur);
            fill.style.width = (t * 100) + '%';
            if (t >= 1) return resolve();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        if (token !== adFlowToken) return;
        const reward = Number(state.settings.coinsPerAd) || 0;
        setUserCoins(getUserCoins() + reward);
        state.analytics.totalAdsWatched++;
        saveState();
        renderHeader();
        if (currentTab === 'reward') renderReward();
        if (currentTab === 'settings') renderSettings();
        toast(`+${reward} কয়েন যোগ হয়েছে`, 'success');
        btn.disabled = false;
        area.innerHTML = `<div class="reward-unlocked-box"><span class="unlock-check">✅</span> +${reward} কয়েন যোগ হয়েছে</div>`;
      });
    }
  });
}

/* ============ ADMIN HUB ============ */
function openAdminHub() {
  if (!canSeeAdmin()) return;
  const opts = [
    { key: 'dashboard', ico: '📊', label: 'ড্যাশবোর্ড' },
    { key: 'upload', ico: '⬆️', label: 'ভিডিও আপলোড করুন' },
    { key: 'manage', ico: '🗑️', label: 'ভিডিও ডিলিট / ম্যানেজ' },
    { key: 'categories', ico: '🏷️', label: 'ক্যাটাগরি কন্ট্রোল' },
    { key: 'fake', ico: '👥', label: 'ফেক ইউজার ও ভিউ' },
    { key: 'ads', ico: '⚙️', label: 'অ্যাড ও কয়েন সেটিংস' },
    { key: 'channel', ico: '📢', label: 'চ্যানেল ও রিওয়ার্ড' },
    { key: 'labels', ico: '🔤', label: 'বাটন নাম পরিবর্তন' },
    { key: 'ban', ico: '🛡️', label: 'অ্যান্টি-চিট / ব্যান' }
  ];
  const gridHTML = opts.map(o => `<button class="admin-hub-btn ripple" type="button" data-admin-page="${o.key}">
    <span class="admin-hub-ico">${o.ico}</span><span class="admin-hub-label">${o.label}</span></button>`).join('');
  const el = pushOverlay(`${overlayHeaderHTML('Admin Hub')}<div class="admin-hub-grid">${gridHTML}</div>`);
  el.querySelectorAll('[data-admin-page]').forEach(btn => btn.addEventListener('click', () => openAdminPage(btn.dataset.adminPage)));
}

function openAdminPage(key) {
  if (!canSeeAdmin()) return;
  switch (key) {
    case 'dashboard': return adminDashboard();
    case 'upload': return adminUpload();
    case 'manage': return adminManage();
    case 'categories': return adminCategories();
    case 'fake': return adminFake();
    case 'ads': return adminAdsSettings();
    case 'channel': return adminChannelReward();
    case 'labels': return adminLabels();
    case 'ban': return adminBan();
  }
}

function adminDashboard() {
  const a = state.analytics;
  const revenue = a.totalAdsWatched * 0.02;
  pushOverlay(`${overlayHeaderHTML('ড্যাশবোর্ড')}
    <div class="admin-stats-grid">
      <div class="admin-stat"><span class="as-label">ব্যবহারকারী</span><span class="as-value">${esc(state.settings.fakeUsers)}</span></div>
      <div class="admin-stat"><span class="as-label">মোট ভিডিও</span><span class="as-value">${state.videos.length}</span></div>
      <div class="admin-stat"><span class="as-label">মোট আনলক</span><span class="as-value">${a.totalUnlocks}</span></div>
      <div class="admin-stat"><span class="as-label">অ্যাড দেখা</span><span class="as-value">${a.totalAdsWatched}</span></div>
      <div class="admin-stat"><span class="as-label">ভিডিও ভিউ</span><span class="as-value">${a.totalVideosViewed}</span></div>
      <div class="admin-stat"><span class="as-label">আনুমানিক আয়</span><span class="as-value">$${revenue.toFixed(2)}</span></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">দ্রুত পরিসংখ্যান</h4>
      <p class="modal-sub" style="margin:0">ক্যাটাগরি: <b>${state.categories.length}</b> · রিওয়ার্ড: <b>${state.rewards.length}</b> · ব্যান: <b>${state.bannedUsers.length}</b></p>
    </div>`);
}

function adminUpload() {
  const catOpts = state.categories.filter(c => c !== 'সব').map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  pushOverlay(`${overlayHeaderHTML('ভিডিও আপলোড করুন')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>শিরোনাম</label><input type="text" id="upTitle" placeholder="ভিডিওর শিরোনাম"></div>
      <div class="admin-field"><label>থাম্বনেইল URL</label><input type="url" id="upThumb" placeholder="https://..."></div>
      <div class="admin-field"><label>প্রাইভেট চ্যানেল মেসেজ লিংক / ID</label><input type="text" id="upMsg" placeholder="https://t.me/private_channel/123 অথবা 123"></div>
      <div class="admin-field"><label>ক্যাটাগরি</label><select id="upCat">${catOpts}</select></div>
      <div class="admin-field"><label>ম্যানুয়াল ভিউ</label><input type="number" id="upViews" min="0" value="0"></div>
      <button class="btn-primary ripple" type="button" id="btnUpload">ভিডিও আপলোড করুন</button>
      <div class="admin-status-msg" id="upStatus"></div>
    </div>`, {
    onMount: (root) => {
      root.querySelector('#btnUpload').addEventListener('click', () => {
        const status = root.querySelector('#upStatus');
        status.className = 'admin-status-msg';
        const title = root.querySelector('#upTitle').value.trim();
        const thumb = root.querySelector('#upThumb').value.trim();
        const msg = root.querySelector('#upMsg').value.trim();
        const cat = root.querySelector('#upCat').value;
        const views = parseInt(root.querySelector('#upViews').value, 10) || 0;
        if (!title) { status.textContent = 'শিরোনাম প্রয়োজন'; status.classList.add('err'); return; }
        if (!msg) { status.textContent = 'মেসেজ লিংক / ID প্রয়োজন'; status.classList.add('err'); return; }
        const messageId = parseMessageId(msg);
        if (!messageId) { status.textContent = 'সঠিক মেসেজ লিংক বা ID দিন'; status.classList.add('err'); return; }
        const newV = { id: uid('v'), title, thumbnail: thumb, messageLink: msg, messageId, category: cat, views };
        state.videos.unshift(newV);
        saveState();
        status.textContent = 'সফলভাবে আপলোড হয়েছে!'; status.classList.add('ok');
        root.querySelector('#upTitle').value = ''; root.querySelector('#upThumb').value = '';
        root.querySelector('#upMsg').value = ''; root.querySelector('#upViews').value = '0';
        if (currentTab === 'home') renderHome();
      });
    }
  });
}

function adminManage() {
  const render = () => state.videos.map(v => `<div class="admin-list-row">
    <div class="row-main"><span class="row-title">${esc(v.title)}</span><span class="row-sub">${esc(v.category)} · 👁 ${formatViews(v.views)} · msgId ${v.messageId || '—'}</span></div>
    <div class="admin-row-actions"><button class="admin-mini-btn danger ripple" type="button" data-del="${esc(v.id)}">ডিলিট</button></div>
  </div>`).join('') || `<div class="empty-state"><div class="empty-ico">🎬</div><div>কোন ভিডিও নেই</div></div>`;
  pushOverlay(`${overlayHeaderHTML('ভিডিও ম্যানেজ / ডিলিট')}
    <div class="admin-panel-card neon-card"><div id="manageList">${render()}</div></div>`, {
    onMount: (root) => {
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del]');
        if (!btn) return;
        if (!confirm('এই ভিডিওটি ডিলিট করবেন?')) return;
        state.videos = state.videos.filter(v => v.id !== btn.dataset.del);
        saveState();
        root.querySelector('#manageList').innerHTML = render();
        toast('ভিডিও ডিলিট হয়েছে', 'success');
        if (currentTab === 'home') renderHome();
      });
    }
  });
}

function adminCategories() {
  const renderList = () => state.categories.map(c => {
    const locked = c === 'সব';
    return `<div class="admin-list-row">
      <div class="row-main"><span class="row-title">${esc(c)}</span></div>
      <div class="admin-row-actions">
        ${locked ? '<span class="row-sub">default</span>' : `<button class="admin-mini-btn ripple" type="button" data-rename="${esc(c)}">রিনেম</button><button class="admin-mini-btn danger ripple" type="button" data-remove="${esc(c)}">ডিলিট</button>`}
      </div></div>`;
  }).join('');
  pushOverlay(`${overlayHeaderHTML('ক্যাটাগরি কন্ট্রোল')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>নতুন ক্যাটাগরি</label><input type="text" id="catNew" placeholder="যেমন: টেকনোলজি"></div>
      <button class="btn-primary ripple" type="button" id="btnAddCat">ক্যাটাগরি যোগ করুন</button>
      <div class="admin-status-msg" id="catStatus"></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">ক্যাটাগরি লিস্ট</h4>
      <div id="catList">${renderList()}</div>
    </div>`, {
    onMount: (root) => {
      const status = root.querySelector('#catStatus');
      const list = root.querySelector('#catList');
      root.querySelector('#btnAddCat').addEventListener('click', () => {
        const v = root.querySelector('#catNew').value.trim();
        if (!v) { status.textContent = 'নাম দিন'; status.className = 'admin-status-msg err'; return; }
        if (state.categories.includes(v)) { status.textContent = 'এই নাম আগে থেকেই আছে'; status.className = 'admin-status-msg err'; return; }
        state.categories.push(v); saveState();
        root.querySelector('#catNew').value = '';
        status.textContent = 'যোগ হয়েছে'; status.className = 'admin-status-msg ok';
        list.innerHTML = renderList();
        if (currentTab === 'home') renderHome();
      });
      list.addEventListener('click', (e) => {
        const rn = e.target.closest('[data-rename]');
        const rm = e.target.closest('[data-remove]');
        if (rn) {
          const old = rn.dataset.rename;
          const nv = prompt('নতুন নাম', old);
          if (!nv || nv.trim() === old) return;
          const newName = nv.trim();
          state.categories = state.categories.map(c => c === old ? newName : c);
          state.videos.forEach(v => { if (v.category === old) v.category = newName; });
          saveState(); list.innerHTML = renderList();
          if (currentTab === 'home') renderHome();
          toast('রিনেম হয়েছে', 'success');
        }
        if (rm) {
          const c = rm.dataset.remove;
          if (!confirm(`"${c}" ডিলিট করবেন?`)) return;
          state.categories = state.categories.filter(x => x !== c);
          state.videos = state.videos.map(v => v.category === c ? { ...v, category: state.categories[1] || 'অন্যান্য' } : v);
          saveState(); list.innerHTML = renderList();
          if (currentTab === 'home') renderHome();
          toast('ডিলিট হয়েছে', 'success');
        }
      });
    }
  });
}

function adminFake() {
  pushOverlay(`${overlayHeaderHTML('ফেক ইউজার ও ভিউ সেটিংস')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>ফেক ইউজার কাউন্ট</label><input type="text" id="fkUsers" value="${esc(state.settings.fakeUsers)}" placeholder="10,000+"></div>
      <button class="btn-primary ripple" type="button" id="btnSaveFk">সেভ করুন</button>
      <div class="admin-status-msg" id="fkStatus"></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">ভিডিও ভিউ অ্যাডজাস্ট</h4>
      <div id="fkViewsList">
        ${state.videos.map(v => `<div class="admin-list-row">
          <div class="row-main"><span class="row-title">${esc(v.title)}</span><span class="row-sub">বর্তমান: ${formatViews(v.views)}</span></div>
          <div class="admin-row-actions">
            <button class="admin-mini-btn ripple" type="button" data-add-views="${esc(v.id)}">+ ভিউ</button>
            <button class="admin-mini-btn ripple" type="button" data-set-views="${esc(v.id)}">সেট</button>
          </div></div>`).join('') || '<div class="empty-state">কোন ভিডিও নেই</div>'}
      </div>
    </div>`, {
    onMount: (root) => {
      const status = root.querySelector('#fkStatus');
      root.querySelector('#btnSaveFk').addEventListener('click', () => {
        const val = root.querySelector('#fkUsers').value.trim() || DEFAULT_FAKE_USERS;
        state.settings.fakeUsers = val; saveState();
        status.textContent = 'সেভ হয়েছে'; status.className = 'admin-status-msg ok';
        if (currentTab === 'settings') renderSettings();
      });
      root.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add-views]');
        const set = e.target.closest('[data-set-views]');
        if (add) {
          const v = state.videos.find(x => x.id === add.dataset.addViews);
          if (!v) return;
          const delta = parseInt(prompt('কত ভিউ যোগ করবেন?', '100'), 10);
          if (!Number.isFinite(delta) || delta === 0) return;
          v.views = Math.max(0, (Number(v.views) || 0) + delta);
          saveState(); toast('ভিউ আপডেট হয়েছে', 'success');
          popOverlay(); adminFake();
        }
        if (set) {
          const v = state.videos.find(x => x.id === set.dataset.setViews);
          if (!v) return;
          const target = parseInt(prompt('নতুন ভিউ', String(v.views)), 10);
          if (!Number.isFinite(target) || target < 0) return;
          v.views = target; saveState();
          toast('ভিউ সেট হয়েছে', 'success');
          popOverlay(); adminFake();
        }
      });
    }
  });
}

function adminAdsSettings() {
  const s = state.settings;
  pushOverlay(`${overlayHeaderHTML('অ্যাড, কয়েন ও টাইমার সেটিংস')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>কয়েন প্রতি অ্যাড</label><input type="number" id="setCoins" min="1" value="${s.coinsPerAd}"></div>
      <div class="admin-field"><label>আনলক করতে কয়েন লাগবে</label><input type="number" id="setUnlock" min="1" value="${s.unlockCoins}"></div>
      <div class="admin-field"><label>অ্যাড স্টেপ সংখ্যা</label><input type="number" id="setSteps" min="1" value="${s.adSteps}"></div>
      <div class="admin-field"><label>প্রতি স্টেপে অ্যাড</label><input type="number" id="setAdsPer" min="1" value="${s.adsPerStep}"></div>
      <div class="admin-field"><label>অটো-ডিলিট টাইমার (মিনিট)</label><input type="number" id="setTimer" min="1" value="${s.autoDeleteMinutes}"></div>
      <button class="btn-primary ripple" type="button" id="btnSaveAds">সেভ করুন</button>
      <div class="admin-status-msg" id="adsStatus"></div>
    </div>`, {
    onMount: (root) => {
      const status = root.querySelector('#adsStatus');
      root.querySelector('#btnSaveAds').addEventListener('click', () => {
        const coins = parseInt(root.querySelector('#setCoins').value, 10);
        const unlock = parseInt(root.querySelector('#setUnlock').value, 10);
        const steps = parseInt(root.querySelector('#setSteps').value, 10);
        const adsPer = parseInt(root.querySelector('#setAdsPer').value, 10);
        const timer = parseInt(root.querySelector('#setTimer').value, 10);
        if (![coins, unlock, steps, adsPer, timer].every(n => Number.isFinite(n) && n > 0)) {
          status.textContent = 'সব ফিল্ডে ১ বা তার বেশি দিন'; status.className = 'admin-status-msg err'; return;
        }
        state.settings.coinsPerAd = coins;
        state.settings.unlockCoins = unlock;
        state.settings.adSteps = steps;
        state.settings.adsPerStep = adsPer;
        state.settings.autoDeleteMinutes = timer;
        saveState();
        status.textContent = 'সেভ হয়েছে'; status.className = 'admin-status-msg ok';
        if (currentTab === 'reward') renderReward();
        toast('সেটিংস সেভ হয়েছে', 'success');
      });
    }
  });
}

function adminChannelReward() {
  const s = state.settings;
  const rewardsListHTML = () => state.rewards.map(r => `<div class="admin-list-row">
    <div class="row-main"><span class="row-title">${esc(r.title)}</span><span class="row-sub">${r.type} · 🪙 ${r.coinCost}</span></div>
    <div class="admin-row-actions"><button class="admin-mini-btn danger ripple" type="button" data-del-reward="${esc(r.id)}">ডিলিট</button></div>
  </div>`).join('') || `<div class="empty-state">কোন রিওয়ার্ড নেই</div>`;
  pushOverlay(`${overlayHeaderHTML('চ্যানেল ও রিওয়ার্ড সেটিংস')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>চ্যানেল টাইটেল</label><input type="text" id="chTitle" value="${esc(s.channelTitle)}"></div>
      <div class="admin-field"><label>চ্যানেল লিংক</label><input type="url" id="chLink" value="${esc(s.channelLink)}"></div>
      <div class="admin-field"><label>চ্যানেল বর্ণনা</label><input type="text" id="chDesc" value="${esc(s.channelDesc)}"></div>
      <button class="btn-primary ripple" type="button" id="btnSaveCh">সেভ করুন</button>
      <div class="admin-status-msg" id="chStatus"></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">নতুন রিওয়ার্ড</h4>
      <div class="admin-field"><label>টাইটেল</label><input type="text" id="rwTitle" placeholder="রিওয়ার্ড নাম"></div>
      <div class="admin-field"><label>বর্ণনা</label><input type="text" id="rwDesc" placeholder="সংক্ষিপ্ত বর্ণনা"></div>
      <div class="admin-field"><label>টাইপ</label><select id="rwType"><option value="channel">চ্যানেল / লিংক</option><option value="video">ভিডিও</option></select></div>
      <div class="admin-field"><label>কয়েন কস্ট</label><input type="number" id="rwCost" min="1" value="300"></div>
      <div class="admin-field"><label>লিংক (চ্যানেলের জন্য)</label><input type="url" id="rwLink" placeholder="https://t.me/..."></div>
      <div class="admin-field"><label>ভিডিও (ভিডিও টাইপ হলে)</label><select id="rwVideo"><option value="">— কোনটি —</option>${state.videos.map(v => `<option value="${esc(v.id)}">${esc(v.title)}</option>`).join('')}</select></div>
      <button class="btn-primary ripple" type="button" id="btnAddReward">রিওয়ার্ড যোগ করুন</button>
      <div class="admin-status-msg" id="rwStatus"></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">রিওয়ার্ড লিস্ট</h4>
      <div id="rewardList">${rewardsListHTML()}</div>
    </div>`, {
    onMount: (root) => {
      const chStatus = root.querySelector('#chStatus');
      const rwStatus = root.querySelector('#rwStatus');
      root.querySelector('#btnSaveCh').addEventListener('click', () => {
        s.channelTitle = root.querySelector('#chTitle').value.trim() || s.channelTitle;
        s.channelLink = root.querySelector('#chLink').value.trim() || s.channelLink;
        s.channelDesc = root.querySelector('#chDesc').value.trim() || s.channelDesc;
        saveState();
        chStatus.textContent = 'সেভ হয়েছে'; chStatus.className = 'admin-status-msg ok';
        if (currentTab === 'channel') renderChannel();
      });
      root.querySelector('#btnAddReward').addEventListener('click', () => {
        const title = root.querySelector('#rwTitle').value.trim();
        const desc = root.querySelector('#rwDesc').value.trim();
        const type = root.querySelector('#rwType').value;
        const cost = parseInt(root.querySelector('#rwCost').value, 10);
        const link = root.querySelector('#rwLink').value.trim();
        const videoId = root.querySelector('#rwVideo').value;
        if (!title) { rwStatus.textContent = 'টাইটেল প্রয়োজন'; rwStatus.className = 'admin-status-msg err'; return; }
        if (!Number.isFinite(cost) || cost < 1) { rwStatus.textContent = 'সঠিক কয়েন কস্ট'; rwStatus.className = 'admin-status-msg err'; return; }
        if (type === 'channel' && !link) { rwStatus.textContent = 'লিংক দিন'; rwStatus.className = 'admin-status-msg err'; return; }
        if (type === 'video' && !videoId) { rwStatus.textContent = 'ভিডিও সিলেক্ট করুন'; rwStatus.className = 'admin-status-msg err'; return; }
        state.rewards.push({ id: uid('r'), title, description: desc, type, coinCost: cost, link, videoId });
        saveState();
        root.querySelector('#rwTitle').value = ''; root.querySelector('#rwDesc').value = '';
        root.querySelector('#rwLink').value = '';
        root.querySelector('#rewardList').innerHTML = rewardsListHTML();
        rwStatus.textContent = 'রিওয়ার্ড যোগ হয়েছে'; rwStatus.className = 'admin-status-msg ok';
        if (currentTab === 'reward') renderReward();
      });
      root.querySelector('#rewardList').addEventListener('click', (e) => {
        const del = e.target.closest('[data-del-reward]');
        if (!del) return;
        if (!confirm('রিওয়ার্ডটি ডিলিট করবেন?')) return;
        state.rewards = state.rewards.filter(r => r.id !== del.dataset.delReward);
        saveState();
        root.querySelector('#rewardList').innerHTML = rewardsListHTML();
        if (currentTab === 'reward') renderReward();
        toast('রিওয়ার্ড ডিলিট হয়েছে', 'success');
      });
    }
  });
}

function adminLabels() {
  const L = state.settings.buttonLabels;
  const fields = [
    ['home', 'হোম ট্যাব'], ['reward', 'রিওয়ার্ড ট্যাব'], ['channel', 'চ্যানেল ট্যাব'], ['settings', 'সেটিংস ট্যাব'],
    ['watchAd', 'অ্যাড দেখুন বাটন'], ['unlock', 'ভিডিও আনলক বাটন'], ['unlockWithCoins', 'কয়েন আনলক বাটন'],
    ['earnCoins', 'কয়েন আয় বাটন'], ['share', 'শেয়ার বাটন'], ['copyLink', 'কপি লিংক বাটন'],
    ['joinChannel', 'চ্যানেল জয়েন বাটন'], ['unlockReward', 'রিওয়ার্ড আনলক বাটন'], ['joinReward', 'রিওয়ার্ড জয়েন বাটন']
  ];
  const fieldHTML = fields.map(([k, l]) => `<div class="admin-field"><label>${esc(l)}</label><input type="text" data-label-key="${k}" value="${esc(L[k] || '')}"></div>`).join('');
  pushOverlay(`${overlayHeaderHTML('বাটন নাম পরিবর্তন')}
    <div class="admin-panel-card neon-card">${fieldHTML}
      <button class="btn-primary ripple" type="button" id="btnSaveLabels">সেভ করুন</button>
      <div class="admin-status-msg" id="lbStatus"></div>
    </div>`, {
    onMount: (root) => {
      const status = root.querySelector('#lbStatus');
      root.querySelector('#btnSaveLabels').addEventListener('click', () => {
        root.querySelectorAll('[data-label-key]').forEach(inp => {
          const k = inp.dataset.labelKey;
          const v = inp.value.trim();
          if (v) L[k] = v;
        });
        saveState();
        status.textContent = 'সেভ হয়েছে'; status.className = 'admin-status-msg ok';
        renderHeader();
        toast('বাটন লেবেল আপডেট হয়েছে', 'success');
      });
    }
  });
}

function adminBan() {
  const renderList = () => state.bannedUsers.length === 0 ? `<div class="empty-state">কোন ব্যানকৃত ইউজার নেই</div>`
    : state.bannedUsers.map(id => `<div class="admin-list-row">
      <div class="row-main"><span class="row-title">#${id}</span></div>
      <div class="admin-row-actions"><button class="admin-mini-btn ripple" type="button" data-unban="${id}">আনব্যান</button></div>
    </div>`).join('');
  pushOverlay(`${overlayHeaderHTML('অ্যান্টি-চিট / ইউজার ব্যান')}
    <div class="admin-panel-card neon-card">
      <div class="admin-field"><label>Telegram Numeric ID</label><input type="number" id="banId" placeholder="123456789"></div>
      <button class="btn-primary ripple btn-danger" type="button" id="btnBan">ব্যান করুন</button>
      <div class="admin-status-msg" id="bnStatus"></div>
    </div>
    <div class="admin-panel-card neon-card mt-3">
      <h4 class="admin-section-title">ব্যানকৃত ইউজার</h4>
      <div id="banList">${renderList()}</div>
    </div>`, {
    onMount: (root) => {
      const status = root.querySelector('#bnStatus');
      const list = root.querySelector('#banList');
      root.querySelector('#btnBan').addEventListener('click', () => {
        const id = parseInt(root.querySelector('#banId').value, 10);
        if (!Number.isFinite(id) || id <= 0) { status.textContent = 'সঠিক ID'; status.className = 'admin-status-msg err'; return; }
        if (state.bannedUsers.includes(id)) { status.textContent = 'ইতিমধ্যে ব্যান'; status.className = 'admin-status-msg err'; return; }
        state.bannedUsers.push(id); saveState();
        root.querySelector('#banId').value = '';
        list.innerHTML = renderList();
        status.textContent = 'ব্যান সফল'; status.className = 'admin-status-msg ok';
      });
      list.addEventListener('click', (e) => {
        const u = e.target.closest('[data-unban]');
        if (!u) return;
        const id = parseInt(u.dataset.unban, 10);
        state.bannedUsers = state.bannedUsers.filter(x => x !== id);
        saveState();
        list.innerHTML = renderList();
        toast('আনব্যান হয়েছে', 'success');
      });
    }
  });
}

/* ============ START PARAM ============ */
function handleStartParam() {
  if (!tg || !tg.initDataUnsafe) return;
  const sp = tg.initDataUnsafe.start_param;
  if (!sp) return;
  if (sp.startsWith('vid_')) {
    const videoId = sp.slice(4);
    const video = state.videos.find(v => v.id === videoId);
    if (video) {
      switchTab('home');
      setTimeout(() => openVideoModal(videoId), 600);
    }
  }
}

/* ============ BOOT ============ */
async function boot() {
  state = loadStateLocal();
  coinsMap = loadCoinsLocal();
  initTelegram();
  renderHeader();
  renderHome();
  attachRipple();

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.nav)));
  document.getElementById('headerUser').addEventListener('click', () => switchTab('settings'));

  window.addEventListener('popstate', () => {
    if (modalStack.length) { popModal(modalStack[modalStack.length - 1]); return; }
    if (overlayStack.length) { popOverlay(); }
  });

  if (isBanned()) toast('আপনি ব্যান হয়েছেন', 'error');

  handleStartParam();

  // Async Firebase sync
  const ok = await initFirebase();
  if (ok) {
    const remote = await loadStateRemote();
    if (remote) {
      state = mergeState(remote);
      renderHeader();
      renderHome();
      if (currentTab === 'reward') renderReward();
      if (currentTab === 'channel') renderChannel();
      if (currentTab === 'settings') renderSettings();
    }
    const remoteCoins = await loadCoinsRemote(currentUser.id);
    if (remoteCoins !== null) {
      coinsMap[currentUser.id] = remoteCoins;
      if (currentTab === 'reward') renderReward();
      if (currentTab === 'settings') renderSettings();
    }
  }
}

document.addEventListener('DOMContentLoaded', boot);
