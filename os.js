// ===== OS CORE =====
let zIndexCounter = 10;
let minimizedWindows = [];
let loggedInUser = null;

// ===== SETTINGS: persistFS flag stored in localStorage (extended) =====
const SETTINGS_KEY = 'webosSettings';
let settings = { persistFS: false, emptyTrashOnExit: false, theme: 'dark', customBackground: null };
try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) settings = JSON.parse(raw);
} catch (e) { settings = { persistFS: false, emptyTrashOnExit: false, theme: 'dark', customBackground: null }; }
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

// ===== sessionStorage-backed USERS (persist across refresh, cleared on tab close) =====
let userDB = {};
if (sessionStorage.getItem('webosUsers')) {
  try { userDB = JSON.parse(sessionStorage.getItem('webosUsers')); } catch (e) { userDB = {}; }
}
function saveUsers() { sessionStorage.setItem('webosUsers', JSON.stringify(userDB)); }

// ===== FILESYSTEM LOADING & SAVING =====
// Keys
const SESSION_FS_KEY = 'webosFS';
const LOCAL_FS_KEY = 'webosFS_local'; // used when persistFS flag is ON

// load FS: priority
function loadFS() {
  if (settings.persistFS && localStorage.getItem(LOCAL_FS_KEY)) {
    try { return JSON.parse(localStorage.getItem(LOCAL_FS_KEY)); } catch (e) { }
  }
  if (sessionStorage.getItem(SESSION_FS_KEY)) {
    try { return JSON.parse(sessionStorage.getItem(SESSION_FS_KEY)); } catch (e) { }
  }
  // fallback default
  return {
    '/': { type: 'folder', children: {
      home: { type: 'folder', children: {
        'user.txt': { type: 'file', content: 'Welcome to NovaShell OS!\nThis is your home directory.' },
        'notes.txt': { type: 'file', content: 'These are your notes.\nYou can edit them with the Text Editor.' }
      }},
      bin: { type: 'folder', children: {
        'calculator': { type: 'file', content: 'Executable calculator app' },
        'texteditor': { type: 'file', content: 'Executable text editor app' },
        'terminal': { type: 'file', content: 'Executable terminal app' },
        'fileexplorer': { type: 'file', content: 'Executable file explorer app' },
        'browser': { type: 'file', content: 'Executable browser app' }
      }},
      etc: { type: 'folder', children: {
        'config.cfg': { type: 'file', content: '# NovaShell configuration file\ntheme=dark\nversion=1.0' }
      }}
    }}
  };
}
let fs = loadFS();
function saveFS() {
  try { sessionStorage.setItem(SESSION_FS_KEY, JSON.stringify(fs)); } catch (e) { }
  if (settings.persistFS) {
    try { localStorage.setItem(LOCAL_FS_KEY, JSON.stringify(fs)); } catch (e) { }
  }
}

// ===== TRASH (persistent: stored in localStorage so it survives browser restarts) =====
const TRASH_KEY = 'webosTrash';
let trash = { items: [] }; // array of { id, name, type, content, originalPath, deletedAt }
try {
  const r = localStorage.getItem(TRASH_KEY);
  if (r) trash = JSON.parse(r);
} catch (e) { trash = { items: [] }; }
function saveTrash() { localStorage.setItem(TRASH_KEY, JSON.stringify(trash)); }

// helper to create unique id
function makeId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

// keep last deletion for undo
let lastDeleted = null;
let undoTimer = null;

// currentDir fallback
let currentDir = '/home';

// Grab desktop element ref
const desktop = document.getElementById('desktop');

// ===== LOGIN / SIGNUP =====
document.getElementById('login-btn').onclick = login;
document.getElementById('signup-btn').onclick = signup;

function login() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  if (userDB[u] && userDB[u] === p) {
    loggedInUser = u;
    enterDesktop();
  } else {
    document.getElementById('login-error').textContent = 'Invalid username or password';
  }
}

function signup() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  if (!u || !p) { document.getElementById('login-error').textContent = 'Enter username and password'; return; }
  if (userDB[u]) { document.getElementById('login-error').textContent = 'Username exists'; return; }
  userDB[u] = p;
  saveUsers();
  document.getElementById('login-error').textContent = 'Account created! You can login now.';
}

// ===== ENTER DESKTOP =====
function enterDesktop() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('desktop').style.display = 'flex';
  document.getElementById('taskbar').style.display = 'flex';
  createDesktopApps();
  applyTheme(); // apply theme/background when entering desktop
}

// ===== THEME / BACKGROUND APPLY =====
function applyTheme() {
  const body = document.body;
  // Basic theme (you can expand CSS instead if you prefer)
  if (settings.theme === 'light') {
    body.style.backgroundColor = '#eee';
    body.style.color = '#000';
  } else {
    body.style.backgroundColor = '#111';
    body.style.color = '#fff';
  }
  // Apply desktop background if present
  if (settings.customBackground) {
    desktop.style.backgroundImage = `url(${settings.customBackground})`;
    desktop.style.backgroundSize = 'cover';
    desktop.style.backgroundPosition = 'center';
  } else {
    desktop.style.backgroundImage = '';
  }
}

// ===== DESKTOP APPS =====
function createDesktopApps() {
  const desktopEl = document.getElementById('desktop');
  desktopEl.innerHTML = '';
  const apps = ['calculator', 'texteditor', 'terminal', 'fileexplorer', 'browser', 'trash', 'settings'];
  const displayNames = {
    calculator: 'Calculator',
    texteditor: 'Text Editor',
    terminal: 'Terminal',
    fileexplorer: 'File Explorer',
    browser: 'Browser',
    trash: 'Trash',
    settings: 'Settings'
  };
  apps.forEach(app => {
    let btn = document.createElement('div');
    btn.className = 'desktop-app';
    btn.textContent = displayNames[app] || app;
    btn.onclick = () => openApp(app);
    desktopEl.appendChild(btn);
  });
}

// ===== START MENU =====
document.getElementById('start-menu').onclick = () => {
  const panel = document.getElementById('start-menu-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

// ===== OPEN APP =====
function openApp(name, content = "", path = null) {
  let win = document.createElement("div");
  win.className = "window"; win.style.top = "120px"; win.style.left = "120px";
  win.style.width = "640px"; win.style.height = "420px"; win.style.zIndex = ++zIndexCounter;
  win.dataset.name = name;

  let header = document.createElement("div"); header.className = "window-header";
  const titleSpan = document.createElement('span');
  titleSpan.textContent = name;
  header.appendChild(titleSpan);

  let headerButtons = document.createElement('div');
  let minBtn = document.createElement("button"); minBtn.textContent = "_"; minBtn.className = "minimize"; minBtn.onclick = () => minimizeWindow(win);
  let fsBtn = document.createElement("button"); fsBtn.textContent = "⛶"; fsBtn.onclick = () => toggleFullscreen(win);
  let closeBtn = document.createElement("button"); closeBtn.textContent = "X"; closeBtn.onclick = () => { win.remove(); refreshFileExplorer(); };
  headerButtons.appendChild(minBtn); headerButtons.appendChild(fsBtn); headerButtons.appendChild(closeBtn);
  header.appendChild(headerButtons);

  win.appendChild(header);

  let winContent = document.createElement("div"); winContent.className = "window-content";
  win.appendChild(winContent);

  // ===== APPS =====
  if (name === 'texteditor') { createTextEditor(winContent, content, path); titleSpan.textContent = path ? `Text Editor — ${path}` : 'Text Editor'; }
  if (name === 'calculator') { createCalculator(winContent); titleSpan.textContent = 'Calculator'; }
  if (name === 'terminal') { createTerminal(winContent); titleSpan.textContent = 'Terminal'; }
  if (name === 'fileexplorer') { createFileExplorer(winContent, path || currentDir); titleSpan.textContent = 'File Explorer'; }
  if (name === 'browser') { createBrowser(winContent); titleSpan.textContent = 'Browser'; }
  if (name === 'trash') { createTrashApp(winContent); titleSpan.textContent = 'Trash'; }
  if (name === 'settings') { createSettingsApp(winContent); titleSpan.textContent = 'Settings'; }

  // Drag & Resize
  let resizeHandle = document.createElement("div"); resizeHandle.style.width = "15px"; resizeHandle.style.height = "15px";
  resizeHandle.style.background = "#888"; resizeHandle.style.position = "absolute";
  resizeHandle.style.right = "0"; resizeHandle.style.bottom = "0"; resizeHandle.style.cursor = "se-resize";
  win.appendChild(resizeHandle);
  resizeHandle.onmousedown = function (e) {
    e.preventDefault();
    let startX = e.clientX; let startY = e.clientY; let startWidth = win.offsetWidth; let startHeight = win.offsetHeight;
    function doDrag(e) { win.style.width = startWidth + (e.clientX - startX) + "px"; win.style.height = startHeight + (e.clientY - startY) + "px"; }
    function stopDrag() { document.removeEventListener('mousemove', doDrag); document.removeEventListener('mouseup', stopDrag); }
    document.addEventListener('mousemove', doDrag); document.addEventListener('mouseup', stopDrag);
  };

  document.getElementById("desktop").appendChild(win);
  dragElement(win, header);
}

// ===== DRAG WINDOWS =====
function dragElement(el, header) {
  let startX = 0, startY = 0;
  header.onmousedown = function (e) {
    if (e.target.tagName === 'BUTTON') return;
    startX = e.clientX; startY = e.clientY;
    document.onmousemove = drag; document.onmouseup = () => document.onmousemove = null;
    el.style.zIndex = ++zIndexCounter;
  };
  function drag(e) {
    let offsetX = e.clientX - startX; let offsetY = e.clientY - startY;
    el.style.top = (el.offsetTop + offsetY) + 'px'; el.style.left = (el.offsetLeft + offsetX) + 'px';
    startX = e.clientX; startY = e.clientY;
  }
}

// ===== MINIMIZE / FULLSCREEN =====
function minimizeWindow(win) { win.style.display = 'none'; minimizedWindows.push(win); refreshMinimizedBar(); }
function refreshMinimizedBar() {
  const bar = document.getElementById('minimized-windows'); bar.innerHTML = '';
  minimizedWindows.forEach((win, i) => {
    let btn = document.createElement('button'); btn.textContent = win.dataset.name;
    btn.onclick = () => { win.style.display = 'flex'; minimizedWindows.splice(i, 1); refreshMinimizedBar(); };
    bar.appendChild(btn);
  });
}
function toggleFullscreen(win) {
  if (win.dataset.fullscreen === "true") {
    win.style.top = win.dataset.top; win.style.left = win.dataset.left;
    win.style.width = win.dataset.width; win.style.height = win.dataset.height;
    win.dataset.fullscreen = "false";
  } else {
    win.dataset.top = win.style.top; win.dataset.left = win.style.left;
    win.dataset.width = win.style.width; win.dataset.height = win.style.height;
    win.style.top = "0"; win.style.left = "0";
    win.style.width = "100vw"; win.style.height = "100vh";
    win.dataset.fullscreen = "true";
  }
}

// ===== APPS (text editor, calculator, terminal, file explorer) =====
function createTextEditor(container, content = "", filePath = null) {
  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex'; toolbar.style.gap = '8px'; toolbar.style.marginBottom = '8px';

  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save';
  const saveAsBtn = document.createElement('button'); saveAsBtn.textContent = 'Save As';
  toolbar.appendChild(saveBtn); toolbar.appendChild(saveAsBtn);
  container.appendChild(toolbar);

  const ta = document.createElement('textarea');
  ta.style.width = '100%'; ta.style.height = 'calc(100% - 40px)'; ta.value = content;
  container.appendChild(ta);

  saveBtn.onclick = () => {
    if (!filePath) {
      const name = prompt('Enter filename to save as (no slashes):');
      if (!name) return;
      const dirObj = getDir(currentExplorerPath());
      if (!dirObj) return alert('Save failed: current directory not found');
      if (dirObj.children[name]) { if (!confirm('File exists — overwrite?')) return; }
      dirObj.children[name] = { type: 'file', content: ta.value };
      saveFS(); saveTrash();
      refreshFileExplorer();
      alert('Saved as ' + name);
    } else {
      const parts = filePath.split('/').filter(Boolean);
      const filename = parts.pop();
      const parentPath = parts.length ? '/' + parts.join('/') : '/';
      const parent = getDir(parentPath);
      if (!parent || !parent.children[filename]) return alert('Save failed (file not found)');
      parent.children[filename].content = ta.value;
      saveFS(); saveTrash();
      refreshFileExplorer();
      alert('Saved ' + filePath);
    }
  };

  saveAsBtn.onclick = () => {
    const name = prompt('Enter filename to save as (no slashes):');
    if (!name) return;
    const dirObj = getDir(currentExplorerPath());
    if (!dirObj) return alert('Save failed: current directory not found');
    if (dirObj.children[name]) { if (!confirm('File exists — overwrite?')) return; }
    dirObj.children[name] = { type: 'file', content: ta.value };
    saveFS(); saveTrash();
    refreshFileExplorer();
    alert('Saved as ' + name);
  };
}

/* ------------------ Calculator (powerful) ------------------ */
function createCalculator(container) {
  container.innerHTML = `
      <div style="display:flex; gap:6px; margin-bottom:6px;">
        <input class="calc-input" placeholder="e.g. 2^3 + sin(PI/2)" />
        <button class="calc-eval">=</button>
        <button class="calc-clear">C</button>
      </div>
      <div class="calc-history"></div>
      <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;" class="calc-palette">
        <button class="tok">+</button><button class="tok">-</button><button class="tok">*</button><button class="tok">/</button>
        <button class="tok">^</button><button class="tok">(</button><button class="tok">)</button><button class="tok">.</button>
        <button class="tok">%</button><button class="tok">PI</button><button class="tok">E</button><button class="tok">!</button>
        <button class="tok">sin(</button><button class="tok">cos(</button><button class="tok">tan(</button>
        <button class="tok">ln(</button><button class="tok">log(</button><button class="tok">sqrt(</button>
      </div>
    `;
  const input = container.querySelector('.calc-input');
  const history = container.querySelector('.calc-history');
  const evalBtn = container.querySelector('.calc-eval');
  const clearBtn = container.querySelector('.calc-clear');
  const palette = container.querySelectorAll('.tok');

  palette.forEach(b => {
    b.onclick = () => {
      const val = b.textContent;
      const pos = input.selectionStart || input.value.length;
      const newVal = input.value.slice(0, pos) + val + input.value.slice(pos);
      input.value = newVal;
      input.focus();
      input.selectionStart = input.selectionEnd = pos + val.length;
    };
  });

  clearBtn.onclick = () => { input.value = ''; input.focus(); };
  evalBtn.onclick = () => {
    const expr = input.value.trim();
    if (!expr) return;
    try {
      const result = evalMath(expr);
      const node = document.createElement('div');
      node.innerHTML = `<div><b>${escapeHtml(expr)}</b> =&nbsp; <span style="color:#9ad">${String(result)}</span></div>`;
      history.prepend(node);
    } catch (err) {
      const node = document.createElement('div');
      node.innerHTML = `<div style="color:salmon;"><b>Error:</b> ${escapeHtml(err.message)}</div>`;
      history.prepend(node);
    }
    input.focus();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); evalBtn.click(); }
  });
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function factorial(n) { n = Number(n); if (!Number.isFinite(n)) return NaN; if (n < 0) return NaN; n = Math.floor(n); let res = 1; for (let i = 2; i <= n; i++) res *= i; return res; }
function evalMath(rawExpr) {
  if (!rawExpr || typeof rawExpr !== 'string') return NaN;
  let expr = rawExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/gi, 'PI');
  expr = expr.replace(/\s+/g, '');
  expr = expr.replace(/\^/g, '**');
  expr = expr.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
  expr = expr.replace(/(\d+(\.\d+)?)!/g, 'factorial($1)');
  function replaceParenFactorials(s) {
    while (true) {
      const idx = s.indexOf(')!');
      if (idx === -1) break;
      let pos = idx - 1;
      let depth = 0;
      while (pos >= 0) {
        if (s[pos] === ')') depth++;
        else if (s[pos] === '(') {
          if (depth === 0) break;
          depth--;
        }
        pos--;
      }
      if (pos < 0) break;
      const inside = s.slice(pos, idx + 1);
      const before = s.slice(0, pos);
      const after = s.slice(idx + 2);
      s = before + 'factorial' + inside + after;
    }
    return s;
  }
  expr = replaceParenFactorials(expr);
  const allowed = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    min: Math.min, max: Math.max,
    log: (x) => Math.log10 ? Math.log10(x) : Math.log(x) / Math.LN10,
    ln: Math.log, log10: Math.log10 ? Math.log10 : (x) => Math.log(x) / Math.LN10,
    PI: Math.PI, E: Math.E, factorial: factorial
  };
  const ids = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  for (const id of ids) { if (!(id in allowed)) throw new Error(`Forbidden identifier: ${id}`); }
  const names = Object.keys(allowed);
  const values = Object.values(allowed);
  const fn = new Function(...names, `return (${expr});`);
  return fn(...values);
}

/* ------------------ Terminal ------------------ */
function createTerminal(container) {
  container.style.background = "#000"; container.style.color = "#0f0"; container.style.fontFamily = "monospace";
  container.innerHTML = '<div id="terminal-output"></div><input id="terminal-input" style="width:100%; background:#111; color:#0f0; border:none; padding:5px;">';
  const output = container.querySelector('#terminal-output');
  const input = container.querySelector('#terminal-input');
  input.focus();
  input.onkeydown = function (e) {
    if (e.key === 'Enter') {
      const cmd = input.value; input.value = '';
      output.innerHTML += `<div>> ${escapeHtml(cmd)}</div>`;
      if (cmd === 'help') { output.innerHTML += '<div>Commands: help, date, echo [text], clear, trashlist, undo-delete</div>'; }
      else if (cmd === 'date') { output.innerHTML += `<div>${new Date()}</div>`; }
      else if (cmd.startsWith('echo ')) { output.innerHTML += `<div>${escapeHtml(cmd.slice(5))}</div>`; }
      else if (cmd === 'clear') { output.innerHTML = ''; }
      else if (cmd === 'trashlist') { output.innerHTML += `<div>Trash items: ${trash.items.length}</div>`; }
      else if (cmd === 'undo-delete') { if (undoLastDeletion()) output.innerHTML += `<div>Restored last deleted item.</div>`; else output.innerHTML += `<div>No recent deletion to undo.</div>`; }
      else { output.innerHTML += `<div>Unknown command</div>`; }
      container.scrollTop = container.scrollHeight;
    }
  };
}

/* ===== FILE EXPLORER (Back / Forward / Up / Root) ===== */
function createFileExplorer(container, startDir = '/home') {
  const win = container.closest('.window');
  if (win) {
    if (!win.dataset.path) win.dataset.path = startDir;
    if (!win._history) { win._history = [win.dataset.path]; win._histIndex = 0; }
  }

  function pushHistory(newPath) {
    if (!win) return;
    if (win._history[win._histIndex] === newPath) return;
    win._history = win._history.slice(0, win._histIndex + 1);
    win._history.push(newPath);
    win._histIndex = win._history.length - 1;
    win.dataset.path = newPath;
  }

  function render(path) {
    if (win) win.dataset.path = path;
    container.innerHTML = '';

    // toolbar
    const toolbar = document.createElement('div'); toolbar.className = 'explorer-toolbar';
    const backBtn = document.createElement('button'); backBtn.textContent = '←';
    const fwdBtn = document.createElement('button'); fwdBtn.textContent = '→';
    const upBtn = document.createElement('button'); upBtn.textContent = '↑';
    const rootBtn = document.createElement('button'); rootBtn.textContent = '/';
    const pathDisplay = document.createElement('div'); pathDisplay.className = 'explorer-path'; pathDisplay.textContent = path;

    backBtn.onclick = () => { if (!win) return; if (win._histIndex > 0) { win._histIndex--; render(win._history[win._histIndex]); } };
    fwdBtn.onclick = () => { if (!win) return; if (win._histIndex < win._history.length - 1) { win._histIndex++; render(win._history[win._histIndex]); } };
    upBtn.onclick = () => {
      if (path === '/') return;
      const parts = path.split('/').filter(Boolean); parts.pop();
      const parent = parts.length ? '/' + parts.join('/') : '/';
      pushHistory(parent); render(parent);
    };
    rootBtn.onclick = () => { pushHistory('/'); render('/'); };

    const updateButtons = () => {
      backBtn.disabled = !(win && win._histIndex > 0);
      fwdBtn.disabled = !(win && win._histIndex < win._history.length - 1);
    };

    toolbar.appendChild(backBtn);
    toolbar.appendChild(fwdBtn);
    toolbar.appendChild(upBtn);
    toolbar.appendChild(rootBtn);
    toolbar.appendChild(pathDisplay);
    container.appendChild(toolbar);

    updateButtons();

    // list contents
    const obj = getDir(path);
    if (!obj || obj.type !== 'folder') {
      const msg = document.createElement('div'); msg.textContent = 'Folder not found';
      container.appendChild(msg);
      return;
    }

    for (const childName in obj.children) {
      const child = obj.children[childName];
      let item = document.createElement('div'); item.className = 'file-row';
      const left = document.createElement('div'); left.className = 'left';
      const nameSpan = document.createElement('div'); nameSpan.className = 'name'; nameSpan.textContent = childName + (child.type === 'folder' ? '/' : '');
      left.appendChild(nameSpan);
      const sizeSpan = document.createElement('div'); sizeSpan.className = 'size';
      sizeSpan.textContent = humanSize(getSize(child));
      item.appendChild(left);
      item.appendChild(sizeSpan);

      item.onmouseenter = () => item.style.background = '#333';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = () => {
        if (child.type === 'folder') {
          const newPath = (path === '/' ? '/' + childName : path + '/' + childName);
          pushHistory(newPath); render(newPath); updateButtons();
        } else {
          const filePath = (path === '/' ? '/' + childName : path + '/' + childName);
          openApp('texteditor', child.content, filePath);
        }
      };
      item.oncontextmenu = (e) => {
        e.preventDefault();
        showExplorerContextMenu(e.clientX, e.clientY, path, childName);
      };
      container.appendChild(item);
    }
  }

  const startPath = win && win.dataset.path ? win.dataset.path : startDir;
  if (win && (!win._history || win._history.length === 0)) { win._history = [startPath]; win._histIndex = 0; win.dataset.path = startPath; }
  render(startPath);
}

// helper: compute size for file/folder (bytes), using UTF-8 bytes for strings
function getSize(item) {
  if (!item) return 0;
  if (item.type === 'file') {
    const s = item.content || '';
    try {
      // Blob gives proper UTF-8 byte size in browsers
      return new Blob([s]).size;
    } catch (e) {
      return new TextEncoder ? new TextEncoder().encode(s).length : s.length;
    }
  } else if (item.type === 'folder') {
    let total = 0;
    for (const k in item.children) {
      total += getSize(item.children[k]);
    }
    return total;
  }
  return 0;
}
function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = (bytes / Math.pow(1024, i));
  return (v % 1 === 0 ? v : v.toFixed(2)) + ' ' + sizes[i];
}

// helper to get directory object by path
function getDir(path) {
  if (!path || path === '/') return fs['/'];
  let parts = path.split('/').filter(Boolean);
  let ptr = fs['/'];
  for (const p of parts) {
    if (ptr.children && ptr.children[p]) ptr = ptr.children[p];
    else return null;
  }
  return ptr;
}

// ===== Explorer internal context menu for rename/delete (delete -> move to trash) =====
function showExplorerContextMenu(x, y, path, name) {
  const existing = document.getElementById('desktop-context-menu');
  if (existing) existing.remove();
  let menu = document.createElement('div');
  menu.id = 'desktop-context-menu';
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.innerHTML = '<div id="rename-item">Rename</div><div id="delete-item">Delete (move to Trash)</div>';
  document.body.appendChild(menu);
  menu.addEventListener('click', e => e.stopPropagation());

  menu.querySelector('#rename-item').onclick = () => {
    const newName = prompt('Rename to:', name);
    if (newName && newName.trim()) {
      const dir = getDir(path);
      if (dir.children[newName]) return alert('Name already exists');
      dir.children[newName] = dir.children[name];
      delete dir.children[name];
      saveFS();
      refreshFileExplorer();
    }
    menu.remove();
  };
  menu.querySelector('#delete-item').onclick = () => {
    if (!confirm('Move "' + name + '" to Trash?')) { menu.remove(); return; }
    const dir = getDir(path);
    if (!dir || !dir.children[name]) { menu.remove(); return; }
    const item = dir.children[name];
    delete dir.children[name];
    const entry = {
      id: makeId(),
      name: name,
      type: item.type,
      content: JSON.parse(JSON.stringify(item)),
      originalPath: (path === '/' ? '/' + name : path + '/' + name),
      deletedAt: new Date().toISOString()
    };
    trash.items.unshift(entry);
    // capture lastDeleted for undo
    lastDeleted = { entry: JSON.parse(JSON.stringify(entry)), parentPath: path };
    startUndoToast();
    saveFS(); saveTrash();
    refreshFileExplorer();
    menu.remove();
  };
  document.addEventListener('click', () => { const el = document.getElementById('desktop-context-menu'); if (el) el.remove(); }, { once: true });
}

// ===== movePathToTrash helper (used by other code if needed) =====
function movePathToTrash(path) {
  if (!path) return false;
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  const parentPath = parts.length ? '/' + parts.join('/') : '/';
  const parent = getDir(parentPath);
  if (!parent || !parent.children[name]) return false;
  const item = parent.children[name];
  delete parent.children[name];
  const entry = {
    id: makeId(),
    name: name,
    type: item.type,
    content: JSON.parse(JSON.stringify(item)),
    originalPath: path,
    deletedAt: new Date().toISOString()
  };
  trash.items.unshift(entry);
  lastDeleted = { entry: JSON.parse(JSON.stringify(entry)), parentPath };
  startUndoToast();
  saveFS(); saveTrash();
  refreshFileExplorer();
  return true;
}

// ===== UNDO: show toast with Undo button and countdown (10s) =====
function startUndoToast() {
  // clear existing timer/toast if present
  clearUndoToast();

  const container = document.getElementById('undo-toast-container');
  const toast = document.createElement('div'); toast.className = 'undo-toast';
  const txt = document.createElement('div'); txt.textContent = `Moved "${lastDeleted.entry.name}" to Trash.`;
  const controls = document.createElement('div');
  const undoBtn = document.createElement('button'); undoBtn.textContent = 'Undo';
  const countdown = document.createElement('div'); countdown.className = 'countdown'; countdown.textContent = '10s';
  controls.appendChild(undoBtn); controls.appendChild(countdown);
  toast.appendChild(txt); toast.appendChild(controls);
  container.appendChild(toast);

  let count = 10;
  undoBtn.onclick = () => {
    if (undoLastDeletion()) {
      clearUndoToast();
    } else {
      alert('Nothing to undo.');
      clearUndoToast();
    }
  };

  undoTimer = setInterval(() => {
    count--;
    countdown.textContent = count + 's';
    if (count <= 0) {
      clearUndoToast();
    }
  }, 1000);
}

function clearUndoToast() {
  if (undoTimer) { clearInterval(undoTimer); undoTimer = null; }
  const container = document.getElementById('undo-toast-container');
  container.innerHTML = '';
  lastDeleted = null;
}

function undoLastDeletion() {
  if (!lastDeleted || !lastDeleted.entry) return false;
  const it = lastDeleted.entry;
  // attempt to restore to original parent
  const parts = (it.originalPath || ('/' + it.name)).split('/').filter(Boolean);
  const filename = parts.pop();
  const parentPath = parts.length ? '/' + parts.join('/') : '/';
  const parent = getDir(parentPath);
  if (parent) {
    // if exists, automatically get unique name (auto-rename)
    const unique = getUniqueName(parent, filename);
    parent.children[unique] = it.content;
  } else {
    // fallback to /home
    const home = getDir('/home');
    const unique = getUniqueName(home, it.name);
    home.children[unique] = it.content;
  }
  // remove item from trash (by id)
  const idx = trash.items.findIndex(x => x.id === it.id);
  if (idx >= 0) trash.items.splice(idx, 1);
  saveFS(); saveTrash();
  refreshFileExplorer();
  lastDeleted = null;
  clearUndoToast();
  return true;
}

// helper for auto-rename when name exists: returns a unique name
function getUniqueName(parent, name) {
  if (!parent || !parent.children) return name;
  if (!parent.children[name]) return name;
  // split extension
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  // try name (restored), name (restored 2), ...
  let n = 1;
  let tryName = `${base} (restored)${ext}`;
  while (parent.children[tryName]) {
    n++;
    tryName = `${base} (restored ${n})${ext}`;
  }
  return tryName;
}

// ===== TRASH APP (view, restore (auto-rename), permanent delete, empty) =====
function createTrashApp(container) {
  container.innerHTML = '';
  const header = document.createElement('div');
  header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center'; header.style.marginBottom = '8px';
  const title = document.createElement('div'); title.textContent = `Trash — ${trash.items.length} item(s)`;
  const controls = document.createElement('div');
  const emptyBtn = document.createElement('button'); emptyBtn.textContent = 'Empty Trash';
  controls.appendChild(emptyBtn);
  header.appendChild(title); header.appendChild(controls);
  container.appendChild(header);

  const list = document.createElement('div');
  container.appendChild(list);

  function renderList() {
    list.innerHTML = '';
    title.textContent = `Trash — ${trash.items.length} item(s)`;
    if (trash.items.length === 0) {
      list.innerHTML = '<div style="color:#bbb;">Trash is empty.</div>'; return;
    }
    trash.items.forEach((it, idx) => {
      const row = document.createElement('div'); row.className = 'trash-item';
      const left = document.createElement('div');
      left.style.flex = '1';
      left.innerHTML = `<div><b>${escapeHtml(it.name)}</b> ${it.type === 'folder' ? '/' : ''}</div><div class="meta">Deleted: ${new Date(it.deletedAt).toLocaleString()} — from ${escapeHtml(it.originalPath)}</div>`;
      const sizeDiv = document.createElement('div'); sizeDiv.className = 'meta';
      sizeDiv.textContent = humanSize(getSize(it.content));
      const actions = document.createElement('div'); actions.className = 'trash-actions';
      const restoreBtn = document.createElement('button'); restoreBtn.textContent = 'Restore';
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete Permanently';
      actions.appendChild(restoreBtn); actions.appendChild(delBtn);
      row.appendChild(left); row.appendChild(sizeDiv); row.appendChild(actions);
      list.appendChild(row);

      restoreBtn.onclick = () => {
        // try to restore to original location with auto-rename conflict handling
        const orig = it.originalPath || ('/' + it.name);
        const parts = orig.split('/').filter(Boolean);
        const filename = parts.pop();
        const parentPath = parts.length ? '/' + parts.join('/') : '/';
        const parent = getDir(parentPath);
        if (parent) {
          const unique = getUniqueName(parent, filename);
          parent.children[unique] = it.content;
        } else {
          const home = getDir('/home');
          const unique = getUniqueName(home, it.name);
          home.children[unique] = it.content;
        }
        // remove from trash
        trash.items.splice(idx, 1);
        saveFS(); saveTrash();
        renderList();
        alert('Restored.');
      };

      delBtn.onclick = () => {
        if (!confirm('Permanently delete "' + it.name + '"?')) return;
        trash.items.splice(idx, 1);
        saveTrash();
        renderList();
      };
    });
  }

  emptyBtn.onclick = () => {
    if (!confirm('Empty the trash? This will permanently delete all items.')) return;
    trash.items = [];
    saveTrash();
    renderList();
  };

  renderList();
}

// ===== SETTINGS APP (toggle persistFS and emptyTrashOnExit) with theme & custom background =====
function createSettingsApp(container) {
  container.innerHTML = '';
  const title = document.createElement('div'); title.innerHTML = '<b>Settings</b>'; title.style.marginBottom = '8px';
  container.appendChild(title);

  const persistLabel = document.createElement('label'); persistLabel.style.display = 'flex'; persistLabel.style.alignItems = 'center'; persistLabel.style.gap = '8px';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!settings.persistFS;
  const span = document.createElement('span'); span.textContent = 'Save filesystem permanently (use localStorage)';
  persistLabel.appendChild(checkbox); persistLabel.appendChild(span);
  container.appendChild(persistLabel);

  const exitLabel = document.createElement('label'); exitLabel.style.display = 'flex'; exitLabel.style.alignItems = 'center'; exitLabel.style.gap = '8px'; exitLabel.style.marginTop = '8px';
  const exitCheckbox = document.createElement('input'); exitCheckbox.type = 'checkbox'; exitCheckbox.checked = !!settings.emptyTrashOnExit;
  const exitSpan = document.createElement('span'); exitSpan.textContent = 'Empty Trash on browser/tab exit';
  exitLabel.appendChild(exitCheckbox); exitLabel.appendChild(exitSpan);
  container.appendChild(exitLabel);

  // Theme selector
  const themeLabel = document.createElement('label'); themeLabel.style.display = 'block'; themeLabel.style.marginTop = '12px'; themeLabel.textContent = 'Theme: ';
  const themeSelect = document.createElement('select');
  ['dark', 'light', 'custom'].forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    if (settings.theme === t) opt.selected = true; themeSelect.appendChild(opt);
  });
  themeLabel.appendChild(themeSelect); container.appendChild(themeLabel);

  // Custom background upload
  const bgLabel = document.createElement('label'); bgLabel.style.display = 'block'; bgLabel.style.marginTop = '8px'; bgLabel.textContent = 'Custom Desktop Background: ';
  const bgInput = document.createElement('input'); bgInput.type = 'file'; bgInput.accept = 'image/*'; bgLabel.appendChild(bgInput); container.appendChild(bgLabel);

  const hint = document.createElement('div'); hint.style.color = '#bbb'; hint.style.marginTop = '8px';
  hint.textContent = 'When persist is enabled, your filesystem is saved to localStorage and survives browser restarts. When disabled, filesystem is session-only (cleared when tab/browser closes). Trash is always stored persistently unless emptied.';
  container.appendChild(hint);

  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Apply';
  saveBtn.style.marginTop = '12px';
  container.appendChild(saveBtn);

  const clearLocalBtn = document.createElement('button'); clearLocalBtn.textContent = 'Clear saved local filesystem'; clearLocalBtn.style.marginLeft = '12px';
  container.appendChild(clearLocalBtn);

  saveBtn.onclick = () => {
    const newPersist = checkbox.checked;
    const newEmptyOnExit = exitCheckbox.checked;
    settings.persistFS = newPersist;
    settings.emptyTrashOnExit = newEmptyOnExit;
    settings.theme = themeSelect.value;

    if (bgInput.files[0]) {
      const reader = new FileReader();
      reader.onload = function (e) {
        settings.customBackground = e.target.result;
        saveSettings();
        if (settings.persistFS) {
          try { localStorage.setItem(LOCAL_FS_KEY, JSON.stringify(fs)); /* saved */ } catch (e) { /* ignore */ }
        }
        applyTheme();
        alert('Settings applied with new background.');
      };
      reader.readAsDataURL(bgInput.files[0]);
    } else {
      // If theme changed to dark/light and custom background exists, keep it unless user clears it
      saveSettings();
      if (settings.persistFS) {
        try { localStorage.setItem(LOCAL_FS_KEY, JSON.stringify(fs)); } catch (e) { /* ignore */ }
      }
      applyTheme();
      alert('Settings applied.');
    }
  };

  clearLocalBtn.onclick = () => {
    if (!confirm('Delete the filesystem copy stored in localStorage? This will not affect your current session unless you reload and have persist disabled.')) return;
    localStorage.removeItem(LOCAL_FS_KEY);
    alert('Local filesystem copy removed.');
  };
}

// ===== BROWSER =====
function createBrowser(container) {
  container.innerHTML = `<input id="browser-input" style="width:100%; margin-bottom:5px;" placeholder="Enter full URL (https://)">
    <button id="browser-go">Go</button>`;
  const input = container.querySelector('#browser-input');
  const btn = container.querySelector('#browser-go');
  btn.onclick = () => {
    try {
      let url = input.value.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      window.open(url, '_blank');
    } catch (e) { alert('Invalid URL'); }
  }
}

// ===== CLOCK =====
function updateTime() { document.getElementById('time').textContent = new Date().toLocaleTimeString(); }
setInterval(updateTime, 1000); updateTime();

/* ===== CONTEXT MENU & NEW FILE/FOLDER (desktop) ===== */
function showContextMenu(x, y) {
  const existing = document.getElementById('desktop-context-menu');
  if (existing) existing.remove();

  let menu = document.createElement('div');
  menu.id = 'desktop-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.innerHTML = '<div id="new-file-btn">New File</div><div id="new-folder-btn">New Folder</div>';
  document.body.appendChild(menu);

  menu.addEventListener('click', e => e.stopPropagation());

  const fileNamePrompt = (type) => {
    let name = prompt(`Enter ${type} name (no slashes):`);
    if (!name) return null;
    name = name.trim();
    if (!name) return null;
    if (name.includes('/')) { alert('Name cannot contain /'); return null; }
    return name;
  };

  menu.querySelector('#new-file-btn').onclick = () => {
    const name = fileNamePrompt('file');
    if (!name) { menu.remove(); return; }
    const dirObj = getDir(currentExplorerPath());
    if (!dirObj) { alert('Current directory not found'); menu.remove(); return; }
    if (dirObj.children[name]) { alert('File or folder already exists!'); }
    else { dirObj.children[name] = { type: 'file', content: '' }; saveFS(); saveTrash(); refreshFileExplorer(); }
    menu.remove();
  };

  menu.querySelector('#new-folder-btn').onclick = () => {
    const name = fileNamePrompt('folder');
    if (!name) { menu.remove(); return; }
    const dirObj = getDir(currentExplorerPath());
    if (!dirObj) { alert('Current directory not found'); menu.remove(); return; }
    if (dirObj.children[name]) { alert('File or folder already exists!'); }
    else { dirObj.children[name] = { type: 'folder', children: {} }; saveFS(); saveTrash(); refreshFileExplorer(); }
    menu.remove();
  };

  document.addEventListener('click', () => {
    const el = document.getElementById('desktop-context-menu');
    if (el) el.remove();
  }, { once: true });
}

function currentExplorerPath() {
  const explorers = Array.from(document.querySelectorAll('.window')).filter(w => w.dataset.name === 'fileexplorer');
  if (explorers.length) {
    const last = explorers[explorers.length - 1];
    if (last.dataset.path) return last.dataset.path;
  }
  return currentDir || '/home';
}

function refreshFileExplorer() {
  const explorerWindows = Array.from(document.querySelectorAll('.window')).filter(w => w.dataset.name === 'fileexplorer');
  explorerWindows.forEach(win => {
    const winContent = win.querySelector('.window-content');
    if (winContent) {
      createFileExplorer(winContent, win.dataset.path || currentDir);
    }
  });
}

// Disable default context menu on desktop
desktop.addEventListener('contextmenu', e => e.preventDefault());

// Show context menu on middle-click or right-click (mouseup for reliability)
desktop.addEventListener('mouseup', e => {
  if (document.getElementById('desktop').style.display === 'none') return;
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    let x = e.clientX, y = e.clientY;
    const margin = 8;
    const menuWidth = 220, menuHeight = 120;
    if (x + menuWidth + margin > window.innerWidth) x = window.innerWidth - menuWidth - margin;
    if (y + menuHeight + margin > window.innerHeight) y = window.innerHeight - menuHeight - margin;
    showContextMenu(x, y);
  }
});

/* ===== Utility: permanently delete trash item by id ===== */
function permanentlyDeleteTrashItemById(id) {
  const idx = trash.items.findIndex(x => x.id === id);
  if (idx >= 0) { trash.items.splice(idx, 1); saveTrash(); return true; }
  return false;
}

// ===== initial save to ensure session/local storage keys exist appropriately =====
saveFS();
saveTrash();
saveSettings();

// ===== Empty trash on exit if configured =====
window.addEventListener('beforeunload', (e) => {
  if (settings.emptyTrashOnExit) {
    trash.items = [];
    saveTrash();
  }
});

// Expose a small API in case user uses terminal commands
window.WebOS = {
  movePathToTrash,
  undoLastDeletion,
  permanentlyDeleteTrashItemById,
  getFS: () => JSON.parse(JSON.stringify(fs)),
  getTrash: () => JSON.parse(JSON.stringify(trash)),
  saveFS, saveTrash, saveSettings
};
