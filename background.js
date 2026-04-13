let verifyInterval = null;
let isVerifying = false; 
let verifyTabOpened = false;

const SERVER_INVITE_LINK = "https://discord.com/invite/pWY2y99VeK"; 

const createTempEmailDevtai = () => {
  const d = ['epmtyfl.me', 'sptech.io.vn'][~~(Math.random() * 2)];
  const s = Array(8).fill().map(() => 'abcdefghijklmnopqrstuvwxyz0123456789'[~~(Math.random() * 36)]).join('');
  const p = ~~(Math.random() * (s.length + 1));
  const email = `${s.slice(0, p)}ntuu${s.slice(p)}@${d}`;
  return email;
};

const createTempEmail = async () => {
  const allowedDomainsPhim = ['anti-ddos.io.vn', 'khocodevn.com'];
  const maxAttempts = 50;
  
  try {
    const devtaiEmail = createTempEmailDevtai();
    await chrome.storage.local.set({ currentEmail: devtaiEmail, emailProvider: 'devtai' });
    return { success: true, email: devtaiEmail, provider: 'devtai' };
  } catch (err) {
  }
  
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch('https://temp-mail.phim.click/randomize', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!res.ok) {
          if (attempt === maxAttempts) {
            throw new Error(`HTTP ${res.status}`);
          }
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        
        const data = await res.json();
        if (data && data.email) {
          const emailDomain = data.email.split('@')[1];
          
          if (allowedDomainsPhim.includes(emailDomain)) {
            await chrome.storage.local.set({ currentEmail: data.email, emailProvider: 'phim' });
            return { success: true, email: data.email, provider: 'phim' };
          } else {
            if (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 300));
              continue;
            }
          }
        } else {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
        }
      } catch (err) {
        if (attempt === maxAttempts) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    throw new Error(`Không thể tạo email với domain hợp lệ sau ${maxAttempts} lần thử`);
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const getMessagesDevtai = async (email) => {
  try {
    const res = await fetch(`https://orifymail.com/api/email/${email}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return { success: true, data: data, provider: 'devtai' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const getMessageContentDevtai = async (messageId) => {
  try {
    const res = await fetch(`https://orifymail.com/api/inbox/${messageId}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return { success: true, data: data, provider: 'devtai' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const getMessages = async () => {
  try {
    const stored = await chrome.storage.local.get(['currentEmail', 'emailProvider']);
    const email = stored.currentEmail;
    const provider = stored.emailProvider;
    
    if (provider === 'devtai' || (email && (email.includes('epmtyfl.me') || email.includes('sptech.io.vn')))) {
      return await getMessagesDevtai(email);
    }
    
    const res = await fetch('https://temp-mail.phim.click/messages', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return { success: true, data: data, provider: 'phim' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const getMessageContent = async (uid) => {
  try {
    const stored = await chrome.storage.local.get(['currentEmail', 'emailProvider']);
    const email = stored.currentEmail;
    const provider = stored.emailProvider;
    
    if (provider === 'devtai' || (email && (email.includes('epmtyfl.me') || email.includes('sptech.io.vn')))) {
      return await getMessageContentDevtai(uid);
    }
    
    const res = await fetch(`https://temp-mail.phim.click/messages/${uid}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return { success: true, data: data, provider: 'phim' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const checkMailAndOpenVerify = async (email) => {
  if (isVerifying) {
    return false;
  }
  
  if (verifyTabOpened) {
    return true;
  }
  
  try {
    const messagesResult = await getMessages();
    if (!messagesResult || !messagesResult.success) {
      return false;
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
        isVerifying = true;
        
        const messageId = provider === 'devtai' ? discordMail.id : discordMail.uid;
        const contentResult = await getMessageContent(messageId);
        
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
          
          const textUrlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
          textUrlMatches.forEach(url => {
            if (url.includes('discord.com') || url.includes('click.discord.com')) {
              const cleanUrl = url.trim().replace(/&amp;/g, '&');
              if (!allLinks.includes(cleanUrl)) {
                allLinks.push(cleanUrl);
              }
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
          
          if (allLinks.length >= 2) {
            const secondLink = allLinks[1];
            
            if (verifyInterval) {
              clearInterval(verifyInterval);
              verifyInterval = null;
            }

            verifyTabOpened = true;
            chrome.tabs.create({ url: secondLink });
            
            isVerifying = false;
            return true;
          } else if (allLinks.length > 0) {
            if (verifyInterval) {
              clearInterval(verifyInterval);
              verifyInterval = null;
            }
            
            verifyTabOpened = true;
            chrome.tabs.create({ url: allLinks[0] });
            
            isVerifying = false;
            return true;
          }
        } else {
          if (provider === 'phim') {
            const preview = discordMail.bodyPreview || '';
            const previewMatches = preview.match(/https?:\/\/[^\s]+/g) || [];
            
            if (previewMatches.length > 0) {
              const verifyLink = previewMatches.find(l => 
                l.includes('click.discord.com') || 
                (l.includes('discord.com') && l.includes('verify'))
              );
              
              if (verifyLink) {
                if (verifyInterval) {
                  clearInterval(verifyInterval);
                  verifyInterval = null;
                }
                
                verifyTabOpened = true;
                chrome.tabs.create({ url: verifyLink });
                
                isVerifying = false;
                return true;
              }
            }
          }
        }
        
        isVerifying = false;
      }
    }
    
    return false;
  } catch (err) {
    isVerifying = false;
    return false;
  }
};

const startAutoVerify = async (email) => {
  verifyTabOpened = false;
  isVerifying = false;

  const found = await checkMailAndOpenVerify(email);
  if (found) {
    return;
  }
  
  let attempts = 0;
  const maxAttempts = 60;
  
  verifyInterval = setInterval(async () => {
    attempts++;
    
    const found = await checkMailAndOpenVerify(email);
    if (found || attempts >= maxAttempts) {
      if (verifyInterval) {
        clearInterval(verifyInterval);
        verifyInterval = null;
      }
    }
  }, 3000);
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('discord.com/verify')) {
      chrome.storage.local.get(['verifyInProgress'], (result) => {
        if (result.verifyInProgress === true) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const clickContinue = () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const continueBtn = buttons.find(btn => {
                  const text = btn.textContent.trim().toLowerCase();
                  return text.includes('continue') || text.includes('tiếp tục');
                });
                if (continueBtn && !continueBtn.disabled) {
                  continueBtn.click();
                  return true;
                }
                return false;
              };
              
              setTimeout(() => {
                if (!clickContinue()) {
                  const checkInterval = setInterval(() => {
                    if (clickContinue()) {
                      clearInterval(checkInterval);
                    }
                  }, 500);
                  
                  setTimeout(() => clearInterval(checkInterval), 10000);
                }
              }, 1000);
            }
          });
        }
      });
    }
    
    if (tab.url.includes('discord.com/invite/') || tab.url.includes('discord.gg/')) {
      chrome.storage.local.get(['verifyInProgress'], (result) => {
        if (result.verifyInProgress === true) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const clickAcceptInvite = () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const acceptBtn = buttons.find(btn => {
                  const text = btn.textContent.trim().toLowerCase();
                  const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                  return text.includes('accept') || text.includes('Chấp nhận lời mời') || 
                         text.includes('join') || text.includes('tham gia') ||
                         ariaLabel.includes('accept') || ariaLabel.includes('join');
                });
                if (acceptBtn && !acceptBtn.disabled) {
                  acceptBtn.click();
                  return true;
                }
                return false;
              };
              
              setTimeout(() => {
                if (!clickAcceptInvite()) {
                  const checkInterval = setInterval(() => {
                    if (clickAcceptInvite()) {
                      clearInterval(checkInterval);
                    }
                  }, 500);
                  
                  setTimeout(() => clearInterval(checkInterval), 10000);
                }
              }, 1500);
            }
          });
        }
      });
    }
    
    if (tab.url.includes('discord.com/channels/@me')) {
      chrome.storage.local.get(['verifyInProgress'], (result) => {
        if (result.verifyInProgress === true) {
          chrome.storage.local.set({ verifyInProgress: false });
        }
      });
    }
  }
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'createTempEmail') {
    createTempEmail().then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (req.action === 'getMessages') {
    getMessages().then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (req.action === 'getMessageContent' && req.uid) {
    getMessageContent(req.uid).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (req.action === 'startAutoVerify' && req.email) {
    chrome.storage.local.set({ verifyInProgress: true });
    startAutoVerify(req.email);
    sendResponse({ success: true });
    return true;
  }
  
  if (req.action === 'stopAutoVerify') {
    if (verifyInterval) {
      clearInterval(verifyInterval);
      verifyInterval = null;
    }
    verifyTabOpened = false;
    isVerifying = false;
    chrome.storage.local.set({ verifyInProgress: false });
    sendResponse({ success: true });
    return true;
  }
  
  if (req.action === 'tokenReceived' && req.token) {
    chrome.runtime.sendMessage({ 
      action: 'tokenReceived', 
      token: req.token 
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }
  
  if (req.action === 'tokenError') {
    chrome.runtime.sendMessage({ 
      action: 'tokenError' 
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }
  
  if (req.action === 'verifyCompleted') {
    chrome.storage.local.set({ verifyInProgress: true });
    setTimeout(() => {
      chrome.tabs.create({ url: SERVER_INVITE_LINK, active: true });
    }, 500);
    sendResponse({ success: true });
    return true;
  }
  
  return true;
});