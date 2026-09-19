/* ==========================================================================
   VIDYALAM LAMINATES SALES MANAGEMENT PORTAL
   Shared Backend Database & Real-Time Multi-Device Client Architecture
   ========================================================================== */

const APP_CONFIG = {
  superAdminEmail: 'hr@vidyalam.in',
  superAdminPassword: 'demo-admin-2026',
  executivePassword: 'demo-exec-2026',
};

const STORAGE_KEYS = {
  CURRENT_USER: 'currentUser',
  LEGACY_CURRENT_USER: 'vidyalam_current_user',
};

const PAGE = (function () {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || 'index.html';
  if (last.includes('admin')) return 'admin.html';
  if (last.includes('executive')) return 'executive.html';
  return 'index.html';
})();

const state = {
  activeView: 'dashboard',
  searchQuery: '',
  adminAttendanceFilterDate: '',
  adminAttendanceFilterEmployee: '',
  adminAttendanceFilterStatus: 'All',
  adminAttendanceSearchQuery: '',
  users: [],
  visits: [],
  attendance: [],
  notifications: [],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLoginId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function isExecutiveUser(u) {
  if (!u || typeof u !== 'object' || u.status === 'Deleted') return false;
  const role = String(u.role || '').trim().toUpperCase();
  const email = String(u.email || '').trim().toLowerCase();
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || email === APP_CONFIG.superAdminEmail.toLowerCase()) {
    return false;
  }
  return true;
}

/* ==========================================
   CLIENT SESSION STORAGE (AUTH TOKEN ONLY)
========================================== */
function getCurrentUser() {
  const currentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (currentUser) {
    try {
      return JSON.parse(currentUser);
    } catch (error) {
      return null;
    }
  }
  const legacyUser = localStorage.getItem(STORAGE_KEYS.LEGACY_CURRENT_USER);
  if (!legacyUser) return null;
  try {
    return JSON.parse(legacyUser);
  } catch (error) {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEYS.LEGACY_CURRENT_USER, JSON.stringify(user));
}

function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_CURRENT_USER);
}

/* ==========================================
   BACKEND REST API CLIENT
========================================== */
const api = {
  getToken() {
    const user = getCurrentUser();
    return user?.token || '';
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch('/api' + endpoint, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        if (PAGE !== 'index.html') {
          clearCurrentUser();
          window.location.href = 'index.html';
        }
      }
      return data;
    } catch (err) {
      console.error('API Network Error:', err);
      return { success: false, message: 'Unable to connect to shared server. Please verify your connection.' };
    }
  },

  async login(identifier, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.success && res.user && res.token) {
      setCurrentUser({ ...res.user, token: res.token });
    }
    return res;
  },

  async fetchMe() {
    return await this.request('/auth/me');
  },

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    clearCurrentUser();
    window.location.href = 'index.html';
  },

  async fetchUsers() {
    const res = await this.request('/users');
    if (res.success && Array.isArray(res.users)) {
      state.users = res.users;
    }
    return state.users;
  },

  async createExecutive(payload) {
    const res = await this.request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success && res.user) {
      state.users.push(res.user);
    }
    return res;
  },

  async updateExecutive(id, payload) {
    const res = await this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (res.success && res.user) {
      const idx = state.users.findIndex((u) => u.id === id);
      if (idx >= 0) state.users[idx] = res.user;
    }
    return res;
  },

  async resetPassword(id, password) {
    return await this.request(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async deleteExecutive(id) {
    const res = await this.request(`/users/${id}`, {
      method: 'DELETE',
    });
    if (res.success) {
      state.users = state.users.filter((u) => u.id !== id);
    }
    return res;
  },

  async fetchAttendance(date = '', employeeId = '') {
    let url = '/attendance';
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (employeeId) params.set('employeeId', employeeId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await this.request(url);
    if (res.success && Array.isArray(res.attendance)) {
      state.attendance = res.attendance;
    }
    return state.attendance;
  },

  async markAttendance(payload) {
    const res = await this.request('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success && res.record) {
      const idx = state.attendance.findIndex((a) => a.employeeId === res.record.employeeId && a.date === res.record.date);
      if (idx >= 0) state.attendance[idx] = res.record;
      else state.attendance.unshift(res.record);
    }
    return res;
  },

  async fetchVisits() {
    const res = await this.request('/visits');
    if (res.success && Array.isArray(res.visits)) {
      state.visits = res.visits;
    }
    return state.visits;
  },

  async createVisit(payload) {
    const res = await this.request('/visits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success && res.visit) {
      state.visits.unshift(res.visit);
    }
    return res;
  },

  async saveVisitRemark(visitId, payload) {
    const res = await this.request(`/visits/${visitId}/remark`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (res.success && res.visit) {
      const idx = state.visits.findIndex((v) => v.visitId === visitId);
      if (idx >= 0) state.visits[idx] = res.visit;
    }
    return res;
  },

  async fetchNotifications() {
    const res = await this.request('/notifications');
    if (res.success && Array.isArray(res.notifications)) {
      state.notifications = res.notifications;
    }
    return state.notifications;
  },

  async markNotificationRead(id) {
    const res = await this.request(`/notifications/${id}/read`, { method: 'PUT' });
    const notif = state.notifications.find((n) => n.id === id);
    if (notif) notif.read = true;
    return res;
  },

  async markAllNotificationsRead() {
    const res = await this.request('/notifications/read-all', { method: 'PUT' });
    state.notifications.forEach((n) => (n.read = true));
    return res;
  },

  async search(query) {
    return await this.request(`/search?q=${encodeURIComponent(query)}`);
  },

  async migrateLegacyData() {
    try {
      const legacyUsers = JSON.parse(localStorage.getItem('vidyalam_users') || '[]');
      const legacyVisits = JSON.parse(localStorage.getItem('vidyalam_visits') || '[]');
      const legacyAtt = JSON.parse(localStorage.getItem('vidyalam_attendance') || '[]');
      const legacyNotifs = JSON.parse(localStorage.getItem('vidyalam_notifications') || '[]');

      if (legacyUsers.length || legacyVisits.length || legacyAtt.length) {
        await this.request('/migrate', {
          method: 'POST',
          body: JSON.stringify({
            users: legacyUsers,
            visits: legacyVisits,
            attendance: legacyAtt,
            notifications: legacyNotifs,
          }),
        });

        localStorage.removeItem('vidyalam_users');
        localStorage.removeItem('vidyalam_visits');
        localStorage.removeItem('vidyalam_attendance');
        localStorage.removeItem('vidyalam_notifications');
        localStorage.removeItem('salesExecutives');
        localStorage.removeItem('executives');
        localStorage.removeItem('users');
      }
    } catch (e) {
      console.warn('Migration check error:', e);
    }
  },
};

/* Synchronous Accessors for UI rendering */
function getUsers() {
  return (state.users || []).filter((u) => u && u.status !== 'Deleted');
}
function getVisits() {
  return state.visits || [];
}
function getAttendance() {
  return state.attendance || [];
}
function getNotifications() {
  return state.notifications || [];
}
function getNotificationsForUser(user) {
  return state.notifications || [];
}

/* ==========================================
   DATE & TIME FORMATTING HELPERS
========================================== */
function getLocalDateString(d = new Date()) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return dateInput;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDisplayTime(dateInput = new Date()) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  return `${hoursStr}:${minutes} ${ampm}`;
}

function formatDisplayDateTime(dateInput) {
  if (!dateInput) return '';
  const d = formatDisplayDate(dateInput);
  const t = formatDisplayTime(dateInput);
  return t ? `${d} • ${t}` : d;
}

function isSameDay(dateString1, dateString2 = new Date()) {
  if (!dateString1) return false;
  const d1 = new Date(dateString1);
  const d2 = new Date(dateString2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const now = new Date();
  const past = new Date(isoString);
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return formatDisplayDate(isoString);
}

/* ==========================================
   TOAST & MODAL NOTIFICATIONS
========================================== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 260);
  }, 2800);
}

function openModal(html) {
  const container = document.getElementById('adminModalContainer');
  if (!container) return;
  container.innerHTML = html;
  const backdrop = container.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeModal();
      }
    });
  }
}

function closeModal() {
  const container = document.getElementById('adminModalContainer');
  if (container) container.innerHTML = '';
}

/* ==========================================
   USER & EXECUTIVE HELPERS
========================================== */
function getExecutiveNameById(executiveId) {
  const user = getUsers().find((item) => item.id === executiveId || item.employeeId === executiveId);
  return user ? user.name : 'Unknown';
}

function getExecutiveVisitsCount(executive) {
  const visits = getVisits();
  return visits.filter(
    (visit) =>
      visit.executiveId === executive.id ||
      visit.executiveId === executive.employeeId ||
      (visit.executiveName &&
        executive.name &&
        visit.executiveName.trim().toLowerCase() === executive.name.trim().toLowerCase())
  ).length;
}

function isExecutiveVisit(visit, currentUser) {
  if (!visit || !currentUser) return false;
  return (
    visit.executiveId === currentUser.id ||
    visit.executiveId === currentUser.employeeId ||
    (visit.executiveName &&
      currentUser.name &&
      visit.executiveName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );
}

function getEmployeeAttendanceRecord(employee, targetDateStr = getLocalDateString()) {
  if (!employee) return null;
  const records = getAttendance();
  const empId = String(employee.employeeId || employee.id || '').trim().toLowerCase();
  const empIdClean = empId.replace(/^0+/, '');
  const empName = String(employee.name || '').trim().toLowerCase();

  return (
    records.find((rec) => {
      if (rec.date !== targetDateStr) return false;
      const recEmpId = String(rec.employeeId || '').trim().toLowerCase();
      const recEmpIdClean = recEmpId.replace(/^0+/, '');
      const recEmpName = String(rec.employeeName || '').trim().toLowerCase();

      return (
        recEmpId === empId ||
        (recEmpIdClean && recEmpIdClean === empIdClean) ||
        (recEmpName && recEmpName === empName)
      );
    }) || null
  );
}

/* ==========================================
   NOTIFICATION SYSTEM (REAL-TIME SYNC)
========================================== */
function updateNotificationBadges() {
  const notifBadge = document.getElementById('notifBadge');
  if (!notifBadge) return;

  const notifs = getNotifications();
  const unreadCount = notifs.filter((n) => !n.read).length;

  if (unreadCount === 0) {
    notifBadge.style.display = 'none';
    notifBadge.textContent = '0';
  } else {
    notifBadge.style.display = 'inline-flex';
    notifBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  }

}

/* Dedicated Notifications View Rendering */
function renderNotificationsListView(role, notifs) {
  const containerId = role === 'admin' ? 'adminContent' : 'execContent';
  const container = document.getElementById(containerId);
  if (!container) return;

  const unreadCount = notifs.filter((n) => !n.read).length;

  const cardsHtml = notifs.length
    ? notifs
        .map((notif) => {
          let icon = '🔔';
          if (notif.type === 'PRESENT_MARKED') icon = '✓';
          else if (notif.type === 'ABSENT_MARKED') icon = '✕';
          else if (notif.type === 'VISIT_SUBMITTED') icon = '▣';
          else if (notif.type === 'ADMIN_REMARK') icon = '💬';
          else if (notif.type === 'LEAD_STATUS_UPDATED') icon = '⚡';
          else if (notif.type === 'FOLLOWUP_SCHEDULED') icon = '⏰';

          const messageLines = String(notif.message || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

          return `
            <div class="notif-page-card ${notif.read ? 'read' : 'unread'}" data-page-notif-id="${notif.id}" data-related-type="${escapeHtml(notif.relatedType || '')}" data-related-id="${escapeHtml(notif.relatedId || '')}">
              <div class="notif-page-card-icon">${icon}</div>
              <div class="notif-page-card-main">
                <div class="notif-page-card-header">
                  <h4 class="notif-page-card-title">${escapeHtml(notif.title)}</h4>
                  <div class="notif-page-card-meta">
                    <span class="notif-page-card-timeago">${escapeHtml(formatTimeAgo(notif.createdAt))}</span>
                    ${!notif.read ? '<span class="notif-unread-badge">● Unread</span>' : ''}
                  </div>
                </div>
                <div class="notif-page-card-body">
                  ${messageLines.map((line) => `<p class="notif-msg-line">${escapeHtml(line)}</p>`).join('')}
                </div>
                <div class="notif-page-card-footer">
                  <span class="notif-timestamp">${escapeHtml(formatDisplayDateTime(notif.createdAt))}</span>
                </div>
              </div>
            </div>
          `;
        })
        .join('')
    : `
      <div class="empty-state">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 12px; color: var(--gold-accent, #deb566);">🔔</span>
        <h3>No Notifications</h3>
        <p>You have no notifications at this time.</p>
      </div>
    `;

  container.innerHTML = `
    <div class="notif-page-container">
      <div class="notif-page-topbar">
        <button type="button" class="back-to-dash-btn" data-action="back-to-dashboard">
          <span>←</span> Back to Dashboard
        </button>
      </div>

      <div class="notif-page-title-row">
        <div>
          <h2>Notifications</h2>
          <p class="eyebrow" style="margin-top: 4px;">${unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}</p>
        </div>
        ${
          unreadCount > 0
            ? `<button type="button" class="secondary-btn" id="btnMarkAllPageNotifsRead">Mark all as read</button>`
            : ''
        }
      </div>

      <div class="notif-page-list">
        ${cardsHtml}
      </div>
    </div>
  `;

  // Attach Back to Dashboard listener
  const backBtn = container.querySelector('[data-action="back-to-dashboard"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (role === 'admin') {
        renderAdminSection('dashboard');
      } else {
        renderExecutiveSection('dashboard');
      }
    });
  }

  // Attach Mark All as Read listener
  const markAllBtn = document.getElementById('btnMarkAllPageNotifsRead');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      markAllBtn.disabled = true;
      markAllBtn.textContent = 'Marking...';
      await api.markAllNotificationsRead();
      updateNotificationBadges();
      showToast('All notifications marked as read.');
      if (role === 'admin') {
        renderAdminNotifications();
      } else {
        renderExecutiveNotifications();
      }
    });
  }

  // Attach individual card click listeners
  container.querySelectorAll('[data-page-notif-id]').forEach((card) => {
    card.addEventListener('click', async () => {
      const notifId = card.dataset.pageNotifId;
      const relatedType = card.dataset.relatedType;
      const relatedId = card.dataset.relatedId;

      await api.markNotificationRead(notifId);
      updateNotificationBadges();

      handleNotificationAction(relatedType, relatedId);
    });
  });
}

function renderAdminNotifications() {
  document.getElementById('adminPageTitle').textContent = 'Notifications';
  document.querySelectorAll('.admin-page .nav-item').forEach((btn) => btn.classList.remove('active'));
  const notifs = getNotifications();
  renderNotificationsListView('admin', notifs);
}

function renderExecutiveNotifications() {
  const pageTitle = document.getElementById('execPageTitle') || document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = 'Notifications';
  document.querySelectorAll('.executive-page .nav-item').forEach((btn) => btn.classList.remove('active'));
  const notifs = getNotifications();
  renderNotificationsListView('executive', notifs);
}

function handleNotificationAction(relatedType, relatedId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  if (relatedType === 'VISIT' || relatedType === 'FOLLOWUP' || relatedType === 'ADMIN_REMARK') {
    if (relatedId) {
      openVisitDetailModal(relatedId);
    }
  } else if (relatedType === 'ATTENDANCE') {
    if (currentUser.role === 'SUPER_ADMIN') {
      renderAdminSection('attendance');
      if (relatedId) {
        state.adminAttendanceFilterDate = relatedId;
        const dateInput = document.getElementById('adminAttendanceDate');
        if (dateInput) {
          dateInput.value = relatedId;
          dateInput.dispatchEvent(new Event('change'));
        }
      }
    } else {
      renderExecutiveSection('attendance');
    }
  }
}

function initNotificationSystem() {
  const notifBellBtn = document.getElementById('notifBellBtn');
  if (notifBellBtn) {
    notifBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (PAGE === 'admin.html') {
        renderAdminSection('notifications');
      } else if (PAGE === 'executive.html') {
        renderExecutiveSection('notifications');
      }
    });
  }
}

/* ==========================================
   MULTI-DEVICE BACKGROUND POLLING
========================================== */
let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const prevCount = state.notifications.filter((n) => !n.read).length;
    await api.fetchNotifications();
    updateNotificationBadges();
    const newCount = state.notifications.filter((n) => !n.read).length;

    if (newCount > prevCount) {
      if (PAGE === 'admin.html') {
        await Promise.all([api.fetchVisits(), api.fetchAttendance()]);
        if (state.activeView === 'dashboard' || state.activeView === 'attendance' || state.activeView === 'visits') {
          renderAdminSection(state.activeView);
        }
      } else if (PAGE === 'executive.html') {
        await Promise.all([api.fetchVisits(), api.fetchAttendance()]);
        if (state.activeView === 'dashboard' || state.activeView === 'attendance' || state.activeView === 'visits') {
          renderExecutiveSection(state.activeView);
        }
      }
    }
  }, 5000);
}

/* ==========================================
   ATTENDANCE MODULE
========================================== */

/* Executive Attendance View */
function renderExecutiveAttendance() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const todayStr = getLocalDateString();
  const todayFormatted = formatDisplayDate(todayStr);
  const todayRecord = getEmployeeAttendanceRecord(currentUser, todayStr);

  const status = todayRecord ? todayRecord.status : 'Not Marked';
  const isPresent = status === 'Present';
  const isAbsent = status === 'Absent';
  const isMarked = isPresent || isAbsent;

  let badgeClass = 'badge-not-marked';
  if (isPresent) badgeClass = 'badge-present';
  if (isAbsent) badgeClass = 'badge-absent';

  const allAttendance = getAttendance();
  const empId = String(currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
  const empIdClean = empId.replace(/^0+/, '');
  const empName = String(currentUser.name || '').trim().toLowerCase();

  const myHistory = allAttendance
    .filter((rec) => {
      const recEmpId = String(rec.employeeId || '').trim().toLowerCase();
      const recEmpIdClean = recEmpId.replace(/^0+/, '');
      const recEmpName = String(rec.employeeName || '').trim().toLowerCase();
      return (
        recEmpId === empId ||
        (recEmpIdClean && recEmpIdClean === empIdClean) ||
        (recEmpName && recEmpName === empName)
      );
    })
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  const historyRows = myHistory.length
    ? myHistory
        .map((rec) => {
          const recStatusClass = rec.status === 'Present' ? 'badge-present' : 'badge-absent';
          return `
        <tr>
          <td><strong>${escapeHtml(rec.displayDate || formatDisplayDate(rec.date))}</strong></td>
          <td><span class="badge ${recStatusClass}">${escapeHtml(rec.status)}</span></td>
          <td>${escapeHtml(rec.checkInTime || '—')}</td>
          <td>${escapeHtml(rec.reason || '—')}</td>
        </tr>
      `;
        })
        .join('')
    : `<tr><td colspan="4"><div class="empty-state compact"><p>No attendance history found.</p></div></td></tr>`;

  document.getElementById('execPageTitle').textContent = 'Attendance';
  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <p class="eyebrow">Attendance Management</p>
        <h2>Daily Attendance</h2>
        <p>Record your check-in or leave for today.</p>
      </div>
    </section>

    <section class="panel-card attendance-hero-card">
      <div class="attendance-hero-inner">
        <div class="attendance-status-display">
          <span class="attendance-date-kicker">Today • ${escapeHtml(todayFormatted)}</span>
          <div class="attendance-status-headline">
            <h2>Today's Status:</h2>
            <span class="badge ${badgeClass}" style="font-size: 1rem; padding: 6px 16px;">${escapeHtml(status)}</span>
          </div>
          ${
            isPresent
              ? `<p class="attendance-meta-detail">Checked in at: <strong>${escapeHtml(todayRecord.checkInTime || '—')}</strong></p>`
              : ''
          }
          ${
            isAbsent
              ? `<p class="attendance-meta-detail">Leave Reason: <strong>${escapeHtml(todayRecord.reason || '—')}</strong></p>`
              : ''
          }
          ${
            !isMarked
              ? `<p class="attendance-meta-detail">Please mark your attendance for today.</p>`
              : ''
          }
        </div>

        <div class="attendance-actions-wrap">
          <button type="button" class="btn-mark-present" id="btnMarkPresent" ${isPresent ? 'disabled' : ''}>
            <span>✓</span> Mark Present
          </button>
          <button type="button" class="btn-mark-absent" id="btnMarkAbsent" ${isAbsent ? 'disabled' : ''}>
            <span>✕</span> Mark Absent
          </button>
        </div>
      </div>
    </section>

    <section class="panel-card table-panel">
      <div class="panel-header table-header">
        <h3>Attendance History</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Check-in Time</th>
              <th>Leave Reason</th>
            </tr>
          </thead>
          <tbody>
            ${historyRows}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Attach Mark Present button listener
  const btnPresent = document.getElementById('btnMarkPresent');
  if (btnPresent) {
    btnPresent.addEventListener('click', async () => {
      btnPresent.disabled = true;
      const checkInTime = formatDisplayTime(new Date());

      const res = await api.markAttendance({
        date: todayStr,
        status: 'Present',
        checkInTime: checkInTime,
        reason: '',
      });

      if (!res.success) {
        showToast(res.message || 'Failed to mark attendance.', 'error');
        btnPresent.disabled = false;
        return;
      }

      showToast('Attendance marked Present.');
      await api.fetchAttendance();
      await api.fetchNotifications();
      renderExecutiveAttendance();
    });
  }

  // Attach Mark Absent button listener
  const btnAbsent = document.getElementById('btnMarkAbsent');
  if (btnAbsent) {
    btnAbsent.addEventListener('click', () => {
      openAbsentModal(currentUser, todayStr, todayFormatted);
    });
  }
}

/* Modal for submitting Absent with required reason */
function openAbsentModal(currentUser, todayStr, todayFormatted) {
  openModal(`
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Leave Application</p>
            <h3>Mark Attendance as Absent</h3>
          </div>
          <button type="button" class="close-btn" data-close-modal="true">×</button>
        </div>
        <form id="absentForm" class="modal-form">
          <div class="field-block">
            <span>Employee</span>
            <input type="text" value="${escapeHtml(currentUser.name)} (${escapeHtml(currentUser.employeeId)})" disabled />
          </div>
          <div class="field-block">
            <span>Date</span>
            <input type="text" value="${escapeHtml(todayFormatted)}" disabled />
          </div>
          <div class="field-block">
            <span>Reason for Absence *</span>
            <textarea id="absentReasonInput" name="reason" rows="3" placeholder="Please specify the reason for taking leave..." required></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-btn" data-close-modal="true">Cancel</button>
            <button type="submit" class="primary-btn">Submit Absence</button>
          </div>
        </form>
      </div>
    </div>
  `);

  const absentForm = document.getElementById('absentForm');
  if (absentForm) {
    absentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = (document.getElementById('absentReasonInput')?.value || '').trim();
      if (!reason) {
        showToast('Please provide a reason for absence.', 'error');
        return;
      }

      const res = await api.markAttendance({
        date: todayStr,
        status: 'Absent',
        checkInTime: '',
        reason: reason,
      });

      if (!res.success) {
        showToast(res.message || 'Failed to submit absence.', 'error');
        return;
      }

      closeModal();
      showToast('Absence marked successfully.');
      await api.fetchAttendance();
      await api.fetchNotifications();
      renderExecutiveAttendance();
    });
  }
}

/* Super Admin Attendance View */
function renderAdminAttendance() {
  document.getElementById('adminPageTitle').textContent = 'Attendance Management';

  const users = getUsers();
  const executives = users.filter(isExecutiveUser);

  const filterDate = state.adminAttendanceFilterDate || getLocalDateString();
  const filterEmployee = state.adminAttendanceFilterEmployee || '';
  const filterStatus = state.adminAttendanceFilterStatus || 'All';
  const searchQuery = (state.adminAttendanceSearchQuery || '').trim().toLowerCase();

  let presentTodayCount = 0;
  let absentTodayCount = 0;
  let notMarkedCount = 0;

  executives.forEach((exec) => {
    const rec = getEmployeeAttendanceRecord(exec, filterDate);
    if (rec && rec.status === 'Present') {
      presentTodayCount++;
    } else if (rec && rec.status === 'Absent') {
      absentTodayCount++;
    } else {
      notMarkedCount++;
    }
  });

  const totalEmployeesCount = executives.length;

  const filteredExecutives = executives.filter((exec) => {
    if (filterEmployee && exec.id !== filterEmployee && exec.employeeId !== filterEmployee) {
      return false;
    }

    if (searchQuery) {
      const matchName = (exec.name || '').toLowerCase().includes(searchQuery);
      const matchId = (exec.employeeId || '').toLowerCase().includes(searchQuery);
      if (!matchName && !matchId) return false;
    }

    const rec = getEmployeeAttendanceRecord(exec, filterDate);
    const recStatus = rec ? rec.status : 'Not Marked';

    if (filterStatus !== 'All' && recStatus !== filterStatus) {
      return false;
    }

    return true;
  });

  const employeeOptions = executives
    .map(
      (exec) =>
        `<option value="${escapeHtml(exec.id)}" ${filterEmployee === exec.id ? 'selected' : ''}>${escapeHtml(exec.name)} (${escapeHtml(exec.employeeId)})</option>`
    )
    .join('');

  const tableRows = filteredExecutives.length
    ? filteredExecutives
        .map((exec) => {
          const rec = getEmployeeAttendanceRecord(exec, filterDate);
          const status = rec ? rec.status : 'Not Marked';
          let badgeClass = 'badge-not-marked';
          if (status === 'Present') badgeClass = 'badge-present';
          if (status === 'Absent') badgeClass = 'badge-absent';

          const checkIn = rec?.checkInTime || '—';
          const reason = rec?.reason || '—';

          return `
        <tr>
          <td><strong>${escapeHtml(exec.employeeId)}</strong></td>
          <td>${escapeHtml(exec.name)}</td>
          <td>${escapeHtml(rec?.displayDate || formatDisplayDate(filterDate))}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(checkIn)}</td>
          <td>${escapeHtml(reason)}</td>
          <td>
            <button type="button" class="text-link" data-action="view-employee-attendance" data-employee-id="${escapeHtml(exec.id)}">View History</button>
          </td>
        </tr>
      `;
        })
        .join('')
    : `<tr><td colspan="7"><div class="empty-state compact"><p>No attendance records match the selected filters.</p></div></td></tr>`;

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <p class="eyebrow">Workforce Management</p>
        <h2>Attendance Management</h2>
        <p>Monitor daily attendance, view leaves, and audit check-in history across your sales team.</p>
      </div>
    </section>

    <section class="stats-grid attendance-stats">
      <article class="stat-card">
        <div class="stat-icon">👥</div>
        <div>
          <p class="stat-label">Total Employees</p>
          <h3>${totalEmployeesCount}</h3>
          <span class="stat-meta">Active team</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon" style="color: #4ade80;">✓</div>
        <div>
          <p class="stat-label">Present</p>
          <h3>${presentTodayCount}</h3>
          <span class="stat-meta">Checked in</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon" style="color: #f87171;">✕</div>
        <div>
          <p class="stat-label">Absent</p>
          <h3>${absentTodayCount}</h3>
          <span class="stat-meta">Approved leave</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon" style="color: var(--text-soft);">⏳</div>
        <div>
          <p class="stat-label">Not Marked</p>
          <h3>${notMarkedCount}</h3>
          <span class="stat-meta">Pending check-in</span>
        </div>
      </article>
    </section>

    <section class="panel-card" style="margin-top: 20px;">
      <div class="filter-grid attendance-filter-grid">
        <label class="field-block">
          <span>Date</span>
          <input type="date" id="adminAttendanceDate" value="${escapeHtml(filterDate)}" />
        </label>

        <label class="field-block">
          <span>Sales Executive</span>
          <select id="adminAttendanceEmployee">
            <option value="">All Executives</option>
            ${employeeOptions}
          </select>
        </label>

        <label class="field-block">
          <span>Status</span>
          <select id="adminAttendanceStatus">
            <option value="All" ${filterStatus === 'All' ? 'selected' : ''}>All Statuses</option>
            <option value="Present" ${filterStatus === 'Present' ? 'selected' : ''}>Present</option>
            <option value="Absent" ${filterStatus === 'Absent' ? 'selected' : ''}>Absent</option>
            <option value="Not Marked" ${filterStatus === 'Not Marked' ? 'selected' : ''}>Not Marked</option>
          </select>
        </label>

        <label class="field-block">
          <span>Search</span>
          <input type="text" id="adminAttendanceSearch" placeholder="Search by name or ID..." value="${escapeHtml(state.adminAttendanceSearchQuery)}" />
        </label>
      </div>
    </section>

    <section class="panel-card table-panel" style="margin-top: 20px;">
      <div class="panel-header table-header">
        <h3>Team Attendance Records</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Date</th>
              <th>Status</th>
              <th>Check-in Time</th>
              <th>Leave Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Attach filter event listeners
  const dateEl = document.getElementById('adminAttendanceDate');
  if (dateEl) {
    dateEl.addEventListener('change', (e) => {
      state.adminAttendanceFilterDate = e.target.value;
      renderAdminAttendance();
    });
  }

  const empEl = document.getElementById('adminAttendanceEmployee');
  if (empEl) {
    empEl.addEventListener('change', (e) => {
      state.adminAttendanceFilterEmployee = e.target.value;
      renderAdminAttendance();
    });
  }

  const statEl = document.getElementById('adminAttendanceStatus');
  if (statEl) {
    statEl.addEventListener('change', (e) => {
      state.adminAttendanceFilterStatus = e.target.value;
      renderAdminAttendance();
    });
  }

  const searchEl = document.getElementById('adminAttendanceSearch');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      state.adminAttendanceSearchQuery = e.target.value;
      renderAdminAttendance();
    });
  }

  // Attach History View modal listeners
  document.querySelectorAll('[data-action="view-employee-attendance"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const execId = btn.dataset.employeeId;
      openEmployeeAttendanceHistoryModal(execId);
    });
  });
}

function openEmployeeAttendanceHistoryModal(employeeId) {
  const users = getUsers();
  const employee = users.find((u) => u.id === employeeId || u.employeeId === employeeId);
  if (!employee) return;

  const allAttendance = getAttendance();
  const empId = String(employee.employeeId || employee.id || '').trim().toLowerCase();
  const empIdClean = empId.replace(/^0+/, '');
  const empName = String(employee.name || '').trim().toLowerCase();

  const history = allAttendance
    .filter((rec) => {
      const recEmpId = String(rec.employeeId || '').trim().toLowerCase();
      const recEmpIdClean = recEmpId.replace(/^0+/, '');
      const recEmpName = String(rec.employeeName || '').trim().toLowerCase();
      return (
        recEmpId === empId ||
        (recEmpIdClean && recEmpIdClean === empIdClean) ||
        (recEmpName && recEmpName === empName)
      );
    })
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  const rows = history.length
    ? history
        .map((rec) => {
          const badgeClass = rec.status === 'Present' ? 'badge-present' : 'badge-absent';
          return `
        <tr>
          <td>${escapeHtml(rec.displayDate || formatDisplayDate(rec.date))}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(rec.status)}</span></td>
          <td>${escapeHtml(rec.checkInTime || '—')}</td>
          <td>${escapeHtml(rec.reason || '—')}</td>
        </tr>
      `;
        })
        .join('')
    : `<tr><td colspan="4"><div class="empty-state compact"><p>No attendance history for this employee.</p></div></td></tr>`;

  openModal(`
    <div class="modal-backdrop">
      <div class="modal-card wide">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Attendance History</p>
            <h3>${escapeHtml(employee.name)} (${escapeHtml(employee.employeeId)})</h3>
          </div>
          <button type="button" class="close-btn" data-close-modal="true">×</button>
        </div>
        <div class="table-wrap" style="max-height: 400px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Check-in Time</th>
                <th>Leave Reason</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" class="secondary-btn" data-close-modal="true">Close</button>
        </div>
      </div>
    </div>
  `);
}

/* ==========================================
   SUPER ADMIN PAGES & VIEWS
========================================== */

function renderDashboard() {
  const users = getUsers();
  const visits = getVisits();
  const today = new Date();
  const todayStr = getLocalDateString(today);
  const executives = users.filter(isExecutiveUser);

  const todaysVisits = visits.filter((visit) => isSameDay(visit.visitDate, today)).length;
  const monthlyVisits = visits.filter((visit) => {
    const visitDate = new Date(visit.visitDate);
    return visitDate.getMonth() === today.getMonth() && visitDate.getFullYear() === today.getFullYear();
  }).length;
  const pendingFollowUps = visits.filter((visit) => {
    if (!visit.followUpDate) return false;
    const followUpDate = new Date(visit.followUpDate);
    return followUpDate >= new Date(today.toDateString()) && visit.leadStatus !== 'Converted';
  }).length;

  const recentVisits = visits.slice().sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate)).slice(0, 5);

  let presentTodayCount = 0;
  let absentTodayCount = 0;
  const todayAttendanceList = [];

  executives.forEach((exec) => {
    const rec = getEmployeeAttendanceRecord(exec, todayStr);
    if (rec && rec.status === 'Present') {
      presentTodayCount++;
      todayAttendanceList.push({ name: exec.name, status: 'Present', time: rec.checkInTime || '—' });
    } else if (rec && rec.status === 'Absent') {
      absentTodayCount++;
      todayAttendanceList.push({ name: exec.name, status: 'Absent', time: 'Leave' });
    } else {
      todayAttendanceList.push({ name: exec.name, status: 'Not Marked', time: 'Pending' });
    }
  });

  const totalEmployeesCount = executives.length;

  document.getElementById('adminPageTitle').textContent = 'Dashboard';
  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Executive Performance Overview</h2>
        <p>Welcome to Vidyalam Laminates Management Console. Review live sales, attendance, and client follow-ups.</p>
      </div>
      <button type="button" class="primary-btn" data-action="add-executive">+ Add Executive</button>
    </section>

    <section class="stats-grid">
      <article class="stat-card">
        <div class="stat-icon">▣</div>
        <div>
          <p class="stat-label">Total Visits Today</p>
          <h3>${todaysVisits}</h3>
          <span class="stat-meta">Real-time submitted</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">▤</div>
        <div>
          <p class="stat-label">This Month's Visits</p>
          <h3>${monthlyVisits}</h3>
          <span class="stat-meta">Monthly pipeline</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">◎</div>
        <div>
          <p class="stat-label">Sales Executives</p>
          <h3>${totalEmployeesCount}</h3>
          <span class="stat-meta">Active team accounts</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">◔</div>
        <div>
          <p class="stat-label">Pending Follow-ups</p>
          <h3>${pendingFollowUps}</h3>
          <span class="stat-meta">Due client actions</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon" style="color: #4ade80;">📅</div>
        <div>
          <p class="stat-label">Today's Attendance</p>
          <h3>${presentTodayCount} / ${totalEmployeesCount}</h3>
          <span class="stat-meta">${absentTodayCount} Absent • <button type="button" class="text-link" data-view="attendance" style="font-size: 0.8rem;">View All</button></span>
        </div>
      </article>
    </section>

    <section class="panel-card table-panel" style="margin-top: 20px;">
      <div class="panel-header table-header">
        <h3>Recent Dealer Visits</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Executive</th>
              <th>Dealer Name</th>
              <th>Company</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              recentVisits.length
                ? recentVisits
                    .map(
                      (visit) => `
              <tr>
                <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
                <td><strong>${escapeHtml(visit.executiveName || getExecutiveNameById(visit.executiveId))}</strong></td>
                <td><strong>${escapeHtml(visit.customerName)}</strong></td>
                <td>${escapeHtml(visit.companyName || '—')}</td>
                <td>${escapeHtml(visit.purpose || '—')}</td>
                <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : visit.leadStatus === 'Interested' ? 'badge-info' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
                <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View Details</button></td>
              </tr>
            `
                    )
                    .join('')
                : '<tr><td colspan="7"><div class="empty-state compact"><p>No visits recorded yet.</p></div></td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  attachVisitDetailListeners();
}

function renderExecutivesPage() {
  const users = getUsers().filter(isExecutiveUser);
  document.getElementById('adminPageTitle').textContent = 'Sales Executives';

  const rows = users
    .map((user) => {
      const visitsCount = getExecutiveVisitsCount(user);
      return `
    <tr>
      <td>${escapeHtml(user.employeeId)}</td>
      <td><strong>${escapeHtml(user.name)}</strong></td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.mobile || '—')}</td>
      <td>${escapeHtml(user.territory || '—')}</td>
      <td><strong>${visitsCount}</strong></td>
      <td><span class="badge ${user.status === 'Active' ? 'badge-success' : 'badge-warning'}">${escapeHtml(user.status || 'Active')}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" class="text-link" data-action="view-executive" data-id="${user.id}">View</button>
          <button type="button" class="text-link" data-action="edit-executive" data-id="${user.id}">Edit</button>
          <button type="button" class="text-link" data-action="toggle-executive" data-id="${user.id}">${user.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="text-link" data-action="reset-password" data-id="${user.id}">Reset</button>
          <button type="button" class="text-link text-danger" data-action="delete-executive" data-id="${user.id}" data-name="${escapeHtml(user.name)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
    })
    .join('');

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Sales Executives</h2>
        <p>Manage your sales team, active accounts, and credentials across devices.</p>
      </div>
      <button type="button" class="primary-btn" data-action="add-executive">+ Add Executive</button>
    </section>

    <section class="panel-card table-panel">
      <div class="panel-header table-header">
        <h3>Team Records</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Territory</th>
              <th>Total Visits</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="8"><div class="empty-state compact"><p>No executives found.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderVisitsPage() {
  const visits = getVisits();
  const users = getUsers();
  document.getElementById('adminPageTitle').textContent = 'Daily Visits';

  const options = users
    .filter(isExecutiveUser)
    .map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`)
    .join('');

  const renderTableRows = (list) => {
    if (!list.length) {
      return `<tr><td colspan="12"><div class="empty-state compact"><p>No dealer visits found.</p></div></td></tr>`;
    }
    return list
      .slice()
      .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
      .map(
        (visit) => `
      <tr>
        <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
        <td>${escapeHtml(visit.visitTime || '—')}</td>
        <td><strong>${escapeHtml(visit.executiveName || getExecutiveNameById(visit.executiveId))}</strong></td>
        <td><strong>${escapeHtml(visit.customerName)}</strong></td>
        <td>${escapeHtml(visit.companyName || '—')}</td>
        <td>${escapeHtml(visit.contactPerson || '—')}</td>
        <td>${escapeHtml(visit.mobile || '—')}</td>
        <td>${escapeHtml(visit.purpose || '—')}</td>
        <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : visit.leadStatus === 'Interested' ? 'badge-info' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
        <td>${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</td>
        <td><span style="font-size: 0.85rem; color: var(--text-soft);">${escapeHtml(visit.remarks || '—')}</span></td>
        <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View Details</button></td>
      </tr>
    `
      )
      .join('');
  };

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Daily Visit Reports</h2>
        <p>Review all dealer visit activity submitted across your sales team in real-time.</p>
      </div>
    </section>

    <section class="panel-card">
      <div class="filter-grid">
        <label class="field-block">
          <span>Date</span>
          <input type="date" id="filterVisitsDate" />
        </label>
        <label class="field-block">
          <span>Sales Executive</span>
          <select id="filterVisitsExecutive">
            <option value="">All Executives</option>
            ${options}
          </select>
        </label>
        <label class="field-block">
          <span>Lead Status</span>
          <select id="filterVisitsStatus">
            <option value="">All Statuses</option>
            <option>New</option>
            <option>Interested</option>
            <option>Follow-up</option>
            <option>Converted</option>
            <option>Not Interested</option>
          </select>
        </label>
        <label class="field-block">
          <span>Dealer Search</span>
          <input type="text" id="filterVisitsCustomer" placeholder="Search dealer, company or contact" />
        </label>
      </div>
    </section>

    <section class="panel-card table-panel" style="margin-top: 18px;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Executive</th>
              <th>Dealer Name</th>
              <th>Company</th>
              <th>Contact Person</th>
              <th>Mobile</th>
              <th>Purpose</th>
              <th>Lead Status</th>
              <th>Follow-up</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="adminVisitsTbody">
            ${renderTableRows(visits)}
          </tbody>
        </table>
      </div>
    </section>
  `;

  attachVisitDetailListeners();

  const filterDate = document.getElementById('filterVisitsDate');
  const filterExecutive = document.getElementById('filterVisitsExecutive');
  const filterStatus = document.getElementById('filterVisitsStatus');
  const filterCustomer = document.getElementById('filterVisitsCustomer');
  const tbody = document.getElementById('adminVisitsTbody');

  const applyFilters = () => {
    let result = visits.slice();
    const dateVal = filterDate?.value;
    const execVal = filterExecutive?.value;
    const statusVal = filterStatus?.value;
    const custVal = (filterCustomer?.value || '').trim().toLowerCase();

    if (dateVal) {
      result = result.filter((item) => isSameDay(item.visitDate, dateVal));
    }
    if (execVal) {
      result = result.filter((item) => item.executiveId === execVal);
    }
    if (statusVal) {
      result = result.filter((item) => (item.leadStatus || 'New') === statusVal);
    }
    if (custVal) {
      result = result.filter((item) =>
        [item.customerName, item.companyName, item.contactPerson, item.mobile].some((field) =>
          (field || '').toLowerCase().includes(custVal)
        )
      );
    }
    tbody.innerHTML = renderTableRows(result);
    attachVisitDetailListeners();
  };

  [filterDate, filterExecutive, filterStatus, filterCustomer].forEach((el) => {
    if (el) el.addEventListener('input', applyFilters);
  });
}

function renderCustomersPage() {
  const visits = getVisits();
  document.getElementById('adminPageTitle').textContent = 'Customers';

  const customerMap = new Map();
  visits.forEach((visit) => {
    const key = `${(visit.customerName || '').trim().toLowerCase()}-${(visit.companyName || '').trim().toLowerCase()}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, visit);
    } else {
      const existing = customerMap.get(key);
      if (new Date(visit.visitDate) > new Date(existing.visitDate)) {
        customerMap.set(key, visit);
      }
    }
  });

  const customers = Array.from(customerMap.values());

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Dealer & Client Directory</h2>
        <p>Aggregated customer database built dynamically from all sales executive visit logs.</p>
      </div>
    </section>

    <section class="panel-card table-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dealer / Customer</th>
              <th>Company</th>
              <th>Contact Person</th>
              <th>Phone</th>
              <th>Last Visit Date</th>
              <th>Executive</th>
              <th>Lead Status</th>
              <th>Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            ${
              customers.length
                ? customers
                    .map(
                      (item) => `
              <tr>
                <td><strong>${escapeHtml(item.customerName)}</strong></td>
                <td>${escapeHtml(item.companyName || '—')}</td>
                <td>${escapeHtml(item.contactPerson || '—')}</td>
                <td>${escapeHtml(item.mobile || '—')}</td>
                <td>${escapeHtml(item.visitDate ? formatDisplayDate(item.visitDate) : '—')}</td>
                <td>${escapeHtml(item.executiveName || getExecutiveNameById(item.executiveId))}</td>
                <td><span class="badge ${item.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(item.leadStatus || 'New')}</span></td>
                <td>${escapeHtml(item.followUpDate ? formatDisplayDate(item.followUpDate) : '—')}</td>
              </tr>
            `
                    )
                    .join('')
                : '<tr><td colspan="8"><div class="empty-state compact"><p>No customers recorded.</p></div></td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFollowUpsPage() {
  const visits = getVisits().filter((v) => v.followUpDate);
  document.getElementById('adminPageTitle').textContent = 'Follow-ups';
  const todayStr = getLocalDateString();

  const categories = {
    Today: visits.filter((v) => v.followUpDate === todayStr),
    Upcoming: visits.filter((v) => v.followUpDate > todayStr && v.leadStatus !== 'Converted'),
    Overdue: visits.filter((v) => v.followUpDate < todayStr && v.leadStatus !== 'Converted'),
    Completed: visits.filter((v) => v.leadStatus === 'Converted'),
  };

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Follow-up Pipeline</h2>
        <p>Monitor overdue, today's, and scheduled client interactions across all executives.</p>
      </div>
    </section>

    <section class="followup-grid">
      ${Object.entries(categories)
        .map(
          ([category, list]) => `
        <div class="followup-category">
          <h4>${escapeHtml(category)} (${list.length})</h4>
          ${
            list.length
              ? list
                  .map(
                    (item) => `
            <div class="followup-item">
              <div class="followup-head">
                <strong>${escapeHtml(item.customerName)}</strong>
                <span class="badge ${item.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(item.leadStatus || 'Follow-up')}</span>
              </div>
              <p>${escapeHtml(item.companyName || '—')} • ${escapeHtml(item.mobile || '—')}</p>
              <small>Executive: ${escapeHtml(item.executiveName || getExecutiveNameById(item.executiveId))}</small>
              <small>Due Date: ${escapeHtml(item.followUpDate ? formatDisplayDate(item.followUpDate) : '—')}</small>
              <p>${escapeHtml(item.remarks || 'No notes provided.')}</p>
              <button type="button" class="text-link" data-view-visit="${item.visitId}">View Full Report</button>
            </div>
          `
                  )
                  .join('')
              : '<div class="empty-state compact"><p>No items.</p></div>'
          }
        </div>
      `
        )
        .join('')}
    </section>
  `;

  attachVisitDetailListeners();
}

function renderReportsPage() {
  const visits = getVisits();
  const users = getUsers();
  const executives = users.filter(isExecutiveUser);
  document.getElementById('adminPageTitle').textContent = 'Reports';

  const totalVisits = visits.length;
  const convertedCount = visits.filter((v) => v.leadStatus === 'Converted').length;
  const interestedCount = visits.filter((v) => v.leadStatus === 'Interested').length;
  const followUpCount = visits.filter((v) => v.leadStatus === 'Follow-up').length;
  const newCount = visits.filter((v) => v.leadStatus === 'New' || !v.leadStatus).length;
  const conversionRate = totalVisits ? Math.round((convertedCount / totalVisits) * 100) : 0;

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Sales Intelligence & Analytics</h2>
        <p>Comprehensive activity metrics, status breakdowns, and team conversion rates.</p>
      </div>
    </section>

    <section class="stats-grid">
      <article class="stat-card">
        <div class="stat-icon">📈</div>
        <div>
          <p class="stat-label">Conversion Rate</p>
          <h3>${conversionRate}%</h3>
          <span class="stat-meta">Converted leads</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">▣</div>
        <div>
          <p class="stat-label">Total Visits Logged</p>
          <h3>${totalVisits}</h3>
          <span class="stat-meta">Across all territories</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">✓</div>
        <div>
          <p class="stat-label">Converted Accounts</p>
          <h3>${convertedCount}</h3>
          <span class="stat-meta">Won accounts</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">⚡</div>
        <div>
          <p class="stat-label">Interested Pipeline</p>
          <h3>${interestedCount}</h3>
          <span class="stat-meta">High probability</span>
        </div>
      </article>
    </section>

    <div class="two-col-grid" style="margin-top: 24px;">
      <section class="panel-card">
        <h3>Lead Status Breakdown</h3>
        <div class="breakdown-list" style="margin-top: 14px;">
          <div class="breakdown-item"><span>Converted</span><strong>${convertedCount}</strong></div>
          <div class="breakdown-item"><span>Interested</span><strong>${interestedCount}</strong></div>
          <div class="breakdown-item"><span>Follow-up Scheduled</span><strong>${followUpCount}</strong></div>
          <div class="breakdown-item"><span>New Inquiries</span><strong>${newCount}</strong></div>
        </div>
      </section>

      <section class="panel-card">
        <h3>Top Performing Executives</h3>
        <div class="breakdown-list" style="margin-top: 14px;">
          ${
            executives.length
              ? executives
                  .map((exec) => {
                    const count = getExecutiveVisitsCount(exec);
                    return `<div class="breakdown-item"><span>${escapeHtml(exec.name)} (${escapeHtml(exec.territory || 'India')})</span><strong>${count} Visits</strong></div>`;
                  })
                  .join('')
              : '<div class="empty-state compact"><p>No executives found.</p></div>'
          }
        </div>
      </section>
    </div>
  `;
}

function renderSettingsPage() {
  document.getElementById('adminPageTitle').textContent = 'Settings';
  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>System Settings & Preferences</h2>
        <p>Portal preferences, roles, and administrative security.</p>
      </div>
    </section>

    <section class="panel-card form-panel">
      <h3>Company Profile</h3>
      <div class="form-grid two-col" style="margin-top: 14px;">
        <label class="field-block">
          <span>Company Name</span>
          <input type="text" value="Vidyalam Laminates" disabled />
        </label>
        <label class="field-block">
          <span>Super Admin Email</span>
          <input type="text" value="${escapeHtml(APP_CONFIG.superAdminEmail)}" disabled />
        </label>
      </div>
      <p style="margin-top: 16px; color: var(--text-soft); font-size: 0.85rem;">
        Multi-device shared database connected at <code>/api/*</code>. Changes made on any device immediately sync to all team accounts.
      </p>
    </section>
  `;
}

async function renderSearchResults(query) {
  const lowerQuery = (query || '').trim().toLowerCase();
  document.getElementById('adminPageTitle').textContent = `Search: "${escapeHtml(query)}"`;

  if (!lowerQuery) {
    renderAdminSection(state.activeView || 'dashboard');
    return;
  }

  const res = await api.search(query);
  const executiveMatches = res.executives || [];
  const visitMatches = res.visits || [];
  const totalMatches = executiveMatches.length + visitMatches.length;

  document.getElementById('adminContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Search Results</h2>
        <p>Found ${totalMatches} matching record(s) in shared database for "<strong>${escapeHtml(query)}</strong>".</p>
      </div>
      <button type="button" class="secondary-btn" id="btnExitSearch">← Back to ${escapeHtml(state.activeView || 'Dashboard')}</button>
    </section>

    ${
      executiveMatches.length
        ? `
      <section class="panel-card table-panel" style="margin-bottom: 24px;">
        <div class="panel-header table-header">
          <h3>Matching Executives (${executiveMatches.length})</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Territory</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${executiveMatches
                .map(
                  (user) => `
                <tr>
                  <td>${escapeHtml(user.employeeId)}</td>
                  <td><strong>${escapeHtml(user.name)}</strong></td>
                  <td>${escapeHtml(user.email)}</td>
                  <td>${escapeHtml(user.mobile || '—')}</td>
                  <td>${escapeHtml(user.territory || '—')}</td>
                  <td><span class="badge ${user.status === 'Active' ? 'badge-success' : 'badge-warning'}">${escapeHtml(user.status || 'Active')}</span></td>
                  <td><button type="button" class="text-link" data-action="view-executive" data-id="${user.id}">View Profile</button></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `
        : ''
    }

    ${
      visitMatches.length
        ? `
      <section class="panel-card table-panel">
        <div class="panel-header table-header">
          <h3>Matching Visits & Dealers (${visitMatches.length})</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Sales Executive</th>
                <th>Dealer Name</th>
                <th>Company / Shop Name</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${visitMatches
                .map(
                  (visit) => `
                <tr>
                  <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
                  <td><strong>${escapeHtml(visit.executiveName || getExecutiveNameById(visit.executiveId))}</strong></td>
                  <td><strong>${escapeHtml(visit.customerName)}</strong></td>
                  <td>${escapeHtml(visit.companyName || '—')}</td>
                  <td>${escapeHtml(visit.purpose || '—')}</td>
                  <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
                  <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View Details</button></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `
        : ''
    }

    ${
      totalMatches === 0
        ? `
      <section class="panel-card">
        <div class="empty-state">
          <h3>No records found</h3>
          <p>No executives, dealer names, companies, or visits match "<strong>${escapeHtml(query)}</strong>".</p>
        </div>
      </section>
    `
        : ''
    }
  `;

  attachVisitDetailListeners();

  const exitBtn = document.getElementById('btnExitSearch');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      const searchInput = document.getElementById('globalSearchInput');
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      renderAdminSection(state.activeView || 'dashboard');
    });
  }
}

async function renderAdminSection(view) {
  state.activeView = view;
  await Promise.all([
    api.fetchUsers(),
    api.fetchVisits(),
    api.fetchAttendance(),
    api.fetchNotifications(),
  ]);

  updateNotificationBadges();
  const navItems = document.querySelectorAll('.admin-page .nav-item');
  navItems.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  switch (view) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'executives':
      renderExecutivesPage();
      break;
    case 'attendance':
      renderAdminAttendance();
      break;
    case 'visits':
      renderVisitsPage();
      break;
    case 'customers':
      renderCustomersPage();
      break;
    case 'followups':
      renderFollowUpsPage();
      break;
    case 'reports':
      renderReportsPage();
      break;
    case 'settings':
      renderSettingsPage();
      break;
    case 'notifications':
      renderAdminNotifications();
      break;
    case 'logout':
      logout();
      break;
    default:
      renderDashboard();
      break;
  }
}

/* ==========================================
   ADMIN EXECUTIVE MODAL (ADD / EDIT)
========================================= */
function openExecutiveModal(existingExecutive = null) {
  const isEdit = Boolean(existingExecutive);
  const values = existingExecutive || {
    name: '',
    employeeId: '',
    email: '',
    mobile: '',
    territory: '',
    password: '',
    confirmPassword: '',
    joiningDate: '',
    status: 'Active',
  };

  openModal(`
    <div class="modal-backdrop">
      <div class="modal-card wide">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Sales Team</p>
            <h3>${isEdit ? 'Edit Executive' : 'Add Executive'}</h3>
          </div>
          <button type="button" class="close-btn" data-close-modal="true">×</button>
        </div>
        <form id="executiveForm" class="modal-form">
          <div class="form-grid two-col">
            <label class="field-block">
              <span>Full Name *</span>
              <input name="name" value="${escapeHtml(values.name)}" required />
            </label>
            <label class="field-block">
              <span>Employee ID *</span>
              <input name="employeeId" value="${escapeHtml(values.employeeId)}" required />
            </label>
            <label class="field-block">
              <span>Email *</span>
              <input type="email" name="email" value="${escapeHtml(values.email)}" required />
            </label>
            <label class="field-block">
              <span>Mobile Number *</span>
              <input name="mobile" value="${escapeHtml(values.mobile)}" required />
            </label>
            <label class="field-block">
              <span>Territory</span>
              <input name="territory" value="${escapeHtml(values.territory)}" />
            </label>
            <label class="field-block">
              <span>Joining Date</span>
              <input type="date" name="joiningDate" value="${escapeHtml(values.joiningDate)}" />
            </label>
            <label class="field-block">
              <span>Password ${isEdit ? '' : '*'} </span>
              <input type="password" name="password" value="" ${isEdit ? '' : 'required'} />
            </label>
            <label class="field-block">
              <span>Confirm Password ${isEdit ? '' : '*'} </span>
              <input type="password" name="confirmPassword" value="" ${isEdit ? '' : 'required'} />
            </label>
            <label class="field-block full-span">
              <span>Status</span>
              <select name="status">
                <option value="Active" ${values.status === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Inactive" ${values.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
              </select>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-btn" data-close-modal="true">Cancel</button>
            <button type="submit" class="primary-btn">${isEdit ? 'Update Executive' : 'Create Executive'}</button>
          </div>
        </form>
      </div>
    </div>
  `);

  const form = document.getElementById('executiveForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: (formData.get('name') || '').toString().trim(),
      employeeId: (formData.get('employeeId') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      mobile: (formData.get('mobile') || '').toString().trim(),
      territory: (formData.get('territory') || '').toString().trim(),
      password: (formData.get('password') || '').toString().trim(),
      confirmPassword: (formData.get('confirmPassword') || '').toString().trim(),
      joiningDate: (formData.get('joiningDate') || '').toString().trim(),
      status: (formData.get('status') || 'Active').toString(),
    };

    if (!payload.name || !payload.employeeId || !payload.email || !payload.mobile) {
      showToast('Name, employee ID, email, and mobile are required.', 'error');
      return;
    }

    if (payload.password && payload.password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    if (payload.password && payload.confirmPassword && payload.password !== payload.confirmPassword) {
      showToast('Password and Confirm Password must match.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    if (isEdit) {
      const res = await api.updateExecutive(existingExecutive.id, payload);
      if (!res.success) {
        showToast(res.message || 'Failed to update executive.', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      showToast('Executive updated successfully.');
    } else {
      const res = await api.createExecutive(payload);
      if (!res.success) {
        showToast(res.message || 'Failed to create executive.', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      showToast('Sales Executive created successfully.');
    }

    closeModal();
    await api.fetchUsers();
    renderExecutivesPage();
  });
}

function openDeleteExecutiveModal(userId, userName) {
  openModal(`
    <div class="modal-backdrop">
      <div class="modal-card" style="max-width: 440px;">
        <div class="modal-header">
          <div>
            <p class="eyebrow" style="color: #ef4444;">Remove Executive</p>
            <h3>Remove Executive?</h3>
          </div>
          <button type="button" class="close-btn" data-close-modal="true">×</button>
        </div>
        <div style="padding: 16px 0; color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">
          Are you sure you want to remove <strong>${escapeHtml(userName)}</strong> from the sales team?
          <p style="margin-top: 10px; font-size: 0.8rem; color: #94a3b8;">
            Historical dealer visits, attendance records, and activity will remain safely preserved for reporting, but account access will be revoked.
          </p>
        </div>
        <div class="modal-actions" style="margin-top: 12px;">
          <button type="button" class="secondary-btn" data-close-modal="true">Cancel</button>
          <button type="button" class="primary-btn btn-danger" id="btnConfirmDeleteExec">Remove Executive</button>
        </div>
      </div>
    </div>
  `);

  const confirmBtn = document.getElementById('btnConfirmDeleteExec');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Removing...';

      const res = await api.deleteExecutive(userId);

      // Clean up legacy localStorage if present
      try {
        ['vidyalam_users', 'salesExecutives', 'executives', 'users'].forEach((k) => {
          const raw = localStorage.getItem(k);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              localStorage.setItem(k, JSON.stringify(arr.filter((u) => u && u.id !== userId)));
            }
          }
        });
      } catch (e) {}

      closeModal();

      if (!res.success) {
        showToast(res.message || 'Failed to remove executive.', 'error');
        return;
      }

      showToast('Executive removed successfully.');
      await api.fetchUsers();
      renderExecutivesPage();
    });
  }
}

/* ==========================================
   EXECUTIVE DASHBOARD & VIEWS
========================================== */

function renderExecutiveDashboard() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser));
  const today = new Date();
  const todaysVisits = visits.filter((visit) => isSameDay(visit.visitDate, today)).length;
  const completedVisits = visits.filter((visit) => visit.leadStatus === 'Converted').length;
  const pendingFollowUps = visits.filter((visit) => {
    if (!visit.followUpDate) return false;
    const followDate = new Date(visit.followUpDate);
    return followDate >= new Date(today.toDateString()) && visit.leadStatus !== 'Converted';
  }).length;

  const thisMonthVisits = visits.filter((visit) => {
    const visitDate = new Date(visit.visitDate);
    return visitDate.getMonth() === today.getMonth() && visitDate.getFullYear() === today.getFullYear();
  }).length;

  const todayStr = getLocalDateString(today);
  const todayRecord = getEmployeeAttendanceRecord(currentUser, todayStr);
  const attendanceStatus = todayRecord ? todayRecord.status : 'Not Marked';

  const displayName = currentUser.name ? currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1) : 'Executive';

  document.getElementById('execPageTitle').textContent = 'Dashboard';
  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro executive-intro">
      <div>
        <h2>Good Morning, ${escapeHtml(displayName)}</h2>
        <p>Your sales activity, today's schedule, and performance overview.</p>
      </div>
      <button type="button" class="primary-btn" data-view="addVisit">+ Add New Visit</button>
    </section>

    <section class="stats-grid executive-stats">
      <article class="stat-card">
        <div class="stat-icon">▣</div>
        <div>
          <p class="stat-label">Today's Visits</p>
          <h3>${todaysVisits}</h3>
          <span class="stat-meta">Scheduled visits</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">▤</div>
        <div>
          <p class="stat-label">This Month's Visits</p>
          <h3>${thisMonthVisits}</h3>
          <span class="stat-meta">Updated live</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">◍</div>
        <div>
          <p class="stat-label">Pending Follow-ups</p>
          <h3>${pendingFollowUps}</h3>
          <span class="stat-meta">Due client actions</span>
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-icon">✓</div>
        <div>
          <p class="stat-label">Today's Attendance</p>
          <h3 style="font-size: 1.4rem;">${escapeHtml(attendanceStatus)}</h3>
          <span class="stat-meta"><button type="button" class="text-link" data-view="attendance">Manage</button></span>
        </div>
      </article>
    </section>

    <section class="panel-card table-panel">
      <div class="panel-header table-header">
        <h3>Today's Visits</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dealer Name</th>
              <th>Company / Shop Name</th>
              <th>Visit Time</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Follow-up</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              visits.filter((visit) => isSameDay(visit.visitDate, today)).length
                ? visits
                    .filter((visit) => isSameDay(visit.visitDate, today))
                    .map(
                      (visit) => `
                <tr>
                  <td><strong>${escapeHtml(visit.customerName)}</strong></td>
                  <td>${escapeHtml(visit.companyName || '—')}</td>
                  <td>${escapeHtml(visit.visitTime || '—')}</td>
                  <td>${escapeHtml(visit.purpose || '—')}</td>
                  <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : visit.leadStatus === 'Interested' ? 'badge-info' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
                  <td>${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</td>
                  <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View</button></td>
                </tr>
              `
                    )
                    .join('')
                : '<tr><td colspan="7"><div class="empty-state compact"><p>No visits scheduled for today yet.</p></div></td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    </section>
  `;

  attachVisitDetailListeners();
}

/* Add Visit View */
function renderExecutiveAddVisit() {
  document.getElementById('execPageTitle').textContent = 'Add Visit';
  const todayStr = getLocalDateString();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  document.getElementById('executiveContent').innerHTML = `
    <section class="panel-card form-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Dealer Reporting</p>
          <h3>Add Dealer Visit Report</h3>
        </div>
      </div>
      <form id="visitForm" class="visit-form">
        <div class="form-grid two-col-form">
          <label class="field-block">
            <span>Dealer Name *</span>
            <input name="customerName" required placeholder="Enter dealer full name" />
          </label>
          <label class="field-block">
            <span>Company / Shop Name</span>
            <input name="companyName" placeholder="Enter company or shop name" />
          </label>
          <label class="field-block">
            <span>Contact Person</span>
            <input name="contactPerson" placeholder="Primary contact person" />
          </label>
          <label class="field-block">
            <span>Mobile</span>
            <input name="mobile" placeholder="Dealer contact number" type="tel" />
          </label>
          <label class="field-block">
            <span>Email</span>
            <input type="email" name="email" placeholder="dealer@example.com" />
          </label>
          <label class="field-block">
            <span>Address</span>
            <input name="address" placeholder="Dealer shop or warehouse address" />
          </label>
          <label class="field-block">
            <span>Visit Date *</span>
            <input type="date" name="visitDate" value="${escapeHtml(todayStr)}" required />
          </label>
          <label class="field-block">
            <span>Visit Time *</span>
            <input type="time" name="visitTime" value="${escapeHtml(currentTime)}" required />
          </label>
        </div>

        <div class="form-grid two-col-form">
          <label class="field-block">
            <span>Purpose *</span>
            <select name="purpose" required>
              <option value="">Select purpose</option>
              <option>New Business</option>
              <option>Follow-up</option>
              <option>Product Discussion</option>
              <option>Price Discussion</option>
              <option>Existing Dealer</option>
              <option>Other</option>
            </select>
          </label>
          <label class="field-block">
            <span>Lead Status *</span>
            <select name="leadStatus" required>
              <option value="">Select status</option>
              <option>New</option>
              <option>Interested</option>
              <option>Follow-up</option>
              <option>Converted</option>
              <option>Not Interested</option>
            </select>
          </label>
          <label class="field-block">
            <span>Next Follow-up Date</span>
            <input type="date" name="followUpDate" />
          </label>
          <label class="field-block">
            <span>Optional Location</span>
            <div class="input-with-action">
              <input name="location" id="visitLocationInput" placeholder="Store location or city" />
              <button type="button" class="btn-inline-action" id="btnDetectGPS">📍 Get GPS</button>
            </div>
          </label>
        </div>

        <label class="field-block">
          <span>Discussion / Meeting Details</span>
          <textarea name="discussion" rows="3" placeholder="Key topics and discussion points..."></textarea>
        </label>
        <label class="field-block">
          <span>Dealer Requirement</span>
          <textarea name="requirement" rows="3" placeholder="Laminate specs, thickness, textures needed..."></textarea>
        </label>
        <label class="field-block">
          <span>Product Interested In</span>
          <input name="productInterest" placeholder="e.g. 1mm Premium High Gloss, Matte Woodgrain..." />
        </label>
        <label class="field-block">
          <span>Remarks</span>
          <textarea name="remarks" rows="3" placeholder="Any special notes or commercial commitments..."></textarea>
        </label>

        <label class="field-block">
          <span>Optional Visit Photo</span>
          <input type="file" id="visitPhotoInput" accept="image/*" />
          <div id="photoPreviewContainer" class="photo-preview-box" style="display: none;">
            <img id="photoPreviewImg" src="" alt="Visit preview" />
            <span style="font-size: 0.85rem; color: var(--gold-soft);">Photo attached</span>
          </div>
        </label>

        <div class="form-actions-row">
          <button type="button" class="secondary-btn" data-view="dashboard">Cancel</button>
          <button type="submit" class="primary-btn">Submit Dealer Visit Report</button>
        </div>
      </form>
    </section>
  `;

  // Attach GPS location helper
  const btnGPS = document.getElementById('btnDetectGPS');
  if (btnGPS) {
    btnGPS.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', 'error');
        return;
      }
      btnGPS.textContent = 'Locating...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const locInput = document.getElementById('visitLocationInput');
          if (locInput) {
            locInput.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          }
          btnGPS.textContent = '📍 GPS Set';
          showToast('Location coordinates captured.');
        },
        () => {
          btnGPS.textContent = '📍 Get GPS';
          showToast('Unable to retrieve your location.', 'error');
        },
        { timeout: 8000 }
      );
    });
  }

  // Handle Photo Preview & Base64 storage
  let attachedPhotoBase64 = '';
  const photoInput = document.getElementById('visitPhotoInput');
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        attachedPhotoBase64 = '';
        document.getElementById('photoPreviewContainer').style.display = 'none';
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        attachedPhotoBase64 = loadEvt.target.result;
        const previewImg = document.getElementById('photoPreviewImg');
        const previewWrap = document.getElementById('photoPreviewContainer');
        if (previewImg && previewWrap) {
          previewImg.src = attachedPhotoBase64;
          previewWrap.style.display = 'flex';
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Form Submission
  const form = document.getElementById('visitForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    const customerName = (formData.get('customerName') || '').toString().trim();
    const visitDate = (formData.get('visitDate') || '').toString().trim();
    const visitTime = (formData.get('visitTime') || '').toString().trim();
    const purpose = (formData.get('purpose') || '').toString().trim();
    const leadStatus = (formData.get('leadStatus') || '').toString().trim();

    if (!customerName || !visitDate || !visitTime || !purpose || !leadStatus) {
      showToast('Dealer name, visit date, visit time, purpose, and lead status are required.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    const payload = {
      customerName,
      companyName: (formData.get('companyName') || '').toString().trim(),
      contactPerson: (formData.get('contactPerson') || '').toString().trim(),
      mobile: (formData.get('mobile') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      address: (formData.get('address') || '').toString().trim(),
      visitDate,
      visitTime,
      purpose,
      location: (formData.get('location') || '').toString().trim(),
      discussion: (formData.get('discussion') || '').toString().trim(),
      requirement: (formData.get('requirement') || '').toString().trim(),
      productInterest: (formData.get('productInterest') || '').toString().trim(),
      leadStatus,
      followUpDate: (formData.get('followUpDate') || '').toString().trim(),
      remarks: (formData.get('remarks') || '').toString().trim(),
      photo: attachedPhotoBase64,
    };

    const res = await api.createVisit(payload);
    if (!res.success) {
      showToast(res.message || 'Failed to submit dealer visit report.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Dealer Visit Report';
      }
      return;
    }

    showToast('Dealer visit report submitted successfully.');
    await api.fetchVisits();
    renderExecutiveSection('visits');
  });
}

/* My Visits View */
function renderExecutiveVisits() {
  const currentUser = getCurrentUser();
  const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser));
  document.getElementById('execPageTitle').textContent = 'My Visits';

  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>My Dealer Visit Reports</h2>
        <p>Review all your submitted dealer meetings, follow-up dates, and manager feedback.</p>
      </div>
      <button type="button" class="primary-btn" data-view="addVisit">+ Add New Visit</button>
    </section>

    <section class="panel-card table-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dealer Name</th>
              <th>Company</th>
              <th>Visit Date</th>
              <th>Time</th>
              <th>Purpose</th>
              <th>Lead Status</th>
              <th>Next Follow-up</th>
              <th>Manager Remark</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              visits.length
                ? visits
                    .slice()
                    .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
                    .map(
                      (visit) => `
                <tr>
                  <td><strong>${escapeHtml(visit.customerName)}</strong></td>
                  <td>${escapeHtml(visit.companyName || '—')}</td>
                  <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
                  <td>${escapeHtml(visit.visitTime || '—')}</td>
                  <td>${escapeHtml(visit.purpose || '—')}</td>
                  <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : visit.leadStatus === 'Interested' ? 'badge-info' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
                  <td>${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</td>
                  <td><span style="font-size: 0.85rem; color: var(--gold);">${escapeHtml(visit.adminRemark ? '✓ Remark added' : '—')}</span></td>
                  <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View Details</button></td>
                </tr>
              `
                    )
                    .join('')
                : '<tr><td colspan="9"><div class="empty-state compact"><p>No visits recorded yet. Start by creating a new visit report.</p></div></td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  attachVisitDetailListeners();
}

/* Customers View */
function renderExecutiveCustomers() {
  const currentUser = getCurrentUser();
  const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser));
  const customerMap = new Map();

  visits.forEach((visit) => {
    const key = `${(visit.customerName || '').trim().toLowerCase()}-${(visit.companyName || '').trim().toLowerCase()}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, visit);
    } else {
      const existing = customerMap.get(key);
      if (new Date(visit.visitDate) > new Date(existing.visitDate)) {
        customerMap.set(key, visit);
      }
    }
  });

  const customers = Array.from(customerMap.values());

  document.getElementById('execPageTitle').textContent = 'Customers';
  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>My Customers</h2>
        <p>Customers and accounts visited by you.</p>
      </div>
    </section>

    <section class="panel-card table-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Company</th>
              <th>Phone</th>
              <th>Last Visit</th>
              <th>Lead Status</th>
              <th>Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            ${
              customers.length
                ? customers
                    .map(
                      (visit) => `
                <tr>
                  <td><strong>${escapeHtml(visit.customerName)}</strong></td>
                  <td>${escapeHtml(visit.companyName || '—')}</td>
                  <td>${escapeHtml(visit.mobile || '—')}</td>
                  <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
                  <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
                  <td>${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</td>
                </tr>
              `
                    )
                    .join('')
                : `<tr><td colspan="6"><div class="empty-state compact"><p>No customer records yet.</p></div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* Follow-ups View */
function renderExecutiveFollowUps() {
  const currentUser = getCurrentUser();
  const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser) && visit.followUpDate);
  const todayStr = getLocalDateString();

  const categories = {
    Today: visits.filter((visit) => visit.followUpDate === todayStr),
    Upcoming: visits.filter((visit) => visit.followUpDate > todayStr && visit.leadStatus !== 'Converted'),
    Overdue: visits.filter((visit) => visit.followUpDate < todayStr && visit.leadStatus !== 'Converted'),
    Completed: visits.filter((visit) => visit.leadStatus === 'Converted'),
  };

  document.getElementById('execPageTitle').textContent = 'Follow-ups';
  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>Follow-ups</h2>
        <p>Upcoming follow-up actions and reminders for your client base.</p>
      </div>
    </section>
    <section class="followup-grid">
      ${Object.entries(categories)
        .map(
          ([label, items]) => `
        <div class="followup-category">
          <h4>${escapeHtml(label)} (${items.length})</h4>
          ${
            items.length
              ? items
                  .map(
                    (visit) => `
            <div class="followup-item">
              <div class="followup-head">
                <strong>${escapeHtml(visit.customerName)}</strong>
                <span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'Follow-up')}</span>
              </div>
              <p>${escapeHtml(visit.companyName || '—')} • ${escapeHtml(visit.mobile || '—')}</p>
              <small>Follow-up Date: ${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</small>
              <p>${escapeHtml(visit.remarks || 'No remarks available.')}</p>
              ${
                visit.mobile
                  ? `<a href="tel:${escapeHtml(visit.mobile)}" class="secondary-btn mobile-call" style="display:inline-block; text-align:center; margin-top:8px;">📞 Call Customer</a>`
                  : ''
              }
            </div>
          `
                  )
                  .join('')
              : '<div class="empty-state compact"><p>No items.</p></div>'
          }
        </div>
      `
        )
        .join('')}
    </section>
  `;
}

/* Reports View */
function renderExecutiveReports() {
  const currentUser = getCurrentUser();
  const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser));
  const total = visits.length;
  const converted = visits.filter((v) => v.leadStatus === 'Converted').length;
  const interested = visits.filter((v) => v.leadStatus === 'Interested').length;
  const rate = total ? Math.round((converted / total) * 100) : 0;

  document.getElementById('execPageTitle').textContent = 'My Reports';
  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>My Performance Summary</h2>
        <p>Analysis of your personal deal closures and visit numbers.</p>
      </div>
    </section>
    <section class="stats-grid">
      <article class="stat-card">
        <div class="stat-icon">📈</div>
        <div>
          <p class="stat-label">Conversion Rate</p>
          <h3>${rate}%</h3>
          <span class="stat-meta">${converted} converted deals</span>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon">▣</div>
        <div>
          <p class="stat-label">Total Visits</p>
          <h3>${total}</h3>
          <span class="stat-meta">Lifetime submissions</span>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon">⚡</div>
        <div>
          <p class="stat-label">Interested Leads</p>
          <h3>${interested}</h3>
          <span class="stat-meta">High probability</span>
        </div>
      </article>
    </section>
  `;
}

/* Profile View */
function renderExecutiveProfile() {
  const currentUser = getCurrentUser();
  document.getElementById('execPageTitle').textContent = 'Profile';

  document.getElementById('executiveContent').innerHTML = `
    <section class="page-intro">
      <div>
        <h2>My Profile</h2>
        <p>Your official credentials and sales account details.</p>
      </div>
    </section>
    <section class="panel-card form-panel">
      <div class="detail-box">
        <p><strong>Full Name:</strong> ${escapeHtml(currentUser.name)}</p>
        <p><strong>Employee ID:</strong> ${escapeHtml(currentUser.employeeId)}</p>
        <p><strong>Email Address:</strong> ${escapeHtml(currentUser.email)}</p>
        <p><strong>Mobile Number:</strong> ${escapeHtml(currentUser.mobile || '—')}</p>
        <p><strong>Assigned Territory:</strong> ${escapeHtml(currentUser.territory || 'India')}</p>
        <p><strong>Account Status:</strong> <span class="badge badge-success">${escapeHtml(currentUser.status || 'Active')}</span></p>
      </div>
    </section>
  `;
}

async function renderExecutiveSection(view) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'SALES_EXECUTIVE') {
    window.location.href = 'index.html';
    return;
  }

  state.activeView = view;
  await Promise.all([
    api.fetchVisits(),
    api.fetchAttendance(),
    api.fetchNotifications(),
  ]);

  updateNotificationBadges();
  const navButtons = document.querySelectorAll('.executive-page .nav-item');
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === view));

  switch (view) {
    case 'dashboard':
      renderExecutiveDashboard();
      break;
    case 'attendance':
      renderExecutiveAttendance();
      break;
    case 'addVisit':
      renderExecutiveAddVisit();
      break;
    case 'visits':
      renderExecutiveVisits();
      break;
    case 'customers':
      renderExecutiveCustomers();
      break;
    case 'followups':
      renderExecutiveFollowUps();
      break;
    case 'reports':
      renderExecutiveReports();
      break;
    case 'profile':
      renderExecutiveProfile();
      break;
    case 'notifications':
      renderExecutiveNotifications();
      break;
    case 'logout':
      logout();
      break;
    default:
      renderExecutiveDashboard();
      break;
  }

  // Update header and sidebar executive names
  const execHeaderName = document.getElementById('execHeaderName');
  const execHeaderMeta = document.getElementById('execHeaderMeta');
  const execSidebarName = document.getElementById('execSidebarName');
  if (execHeaderName) execHeaderName.textContent = currentUser.name;
  if (execHeaderMeta) execHeaderMeta.textContent = currentUser.territory || 'Sales Executive';
  if (execSidebarName) execSidebarName.textContent = currentUser.name;

  const initials = (currentUser.name || 'SE')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  document.querySelectorAll('.executive-page .avatar').forEach((el) => (el.textContent = initials));
}

/* ==========================================
   SHARED VISIT DETAIL MODAL & SECURITY
========================================== */
function openVisitDetailModal(visitId) {
  const visit = getVisits().find((item) => item.visitId === visitId);
  if (!visit) {
    showToast('Visit record not found.', 'error');
    return;
  }

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'SALES_EXECUTIVE' && !isExecutiveVisit(visit, currentUser)) {
    showToast('Unauthorized to view this visit record.', 'error');
    return;
  }

  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';

  openModal(`
    <div class="modal-backdrop">
      <div class="modal-card wide">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Dealer Visit Report</p>
            <h3>${escapeHtml(visit.customerName)}</h3>
          </div>
          <button type="button" class="close-btn" data-close-modal="true">×</button>
        </div>
        <div class="detail-grid">
          <div class="detail-box">
            <h4>Dealer Details</h4>
            <p><strong>Dealer Name:</strong> ${escapeHtml(visit.customerName)}</p>
            <p><strong>Company / Shop Name:</strong> ${escapeHtml(visit.companyName || '—')}</p>
            <p><strong>Contact Person:</strong> ${escapeHtml(visit.contactPerson || '—')}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(visit.mobile || '—')}</p>
            <p><strong>Email:</strong> ${escapeHtml(visit.email || '—')}</p>
            <p><strong>Address:</strong> ${escapeHtml(visit.address || '—')}</p>
          </div>
          <div class="detail-box">
            <h4>Visit Information</h4>
            <p><strong>Sales Executive:</strong> ${escapeHtml(visit.executiveName || getExecutiveNameById(visit.executiveId))}</p>
            <p><strong>Visit Date:</strong> ${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</p>
            <p><strong>Visit Time:</strong> ${escapeHtml(visit.visitTime || '—')}</p>
            <p><strong>Purpose:</strong> ${escapeHtml(visit.purpose || '—')}</p>
            <p><strong>Location:</strong> ${escapeHtml(visit.location || '—')}</p>
            <p><strong>Lead Status:</strong> <span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}" id="modalDisplayLeadStatus">${escapeHtml(visit.leadStatus || 'New')}</span></p>
          </div>
          <div class="detail-box full-span">
            <h4>Meeting Details</h4>
            <p><strong>Discussion:</strong> ${escapeHtml(visit.discussion || '—')}</p>
            <p><strong>Dealer Requirement:</strong> ${escapeHtml(visit.requirement || '—')}</p>
            <p><strong>Product Interest:</strong> ${escapeHtml(visit.productInterest || '—')}</p>
            <p><strong>Next Follow-up Date:</strong> <span id="modalDisplayFollowUp">${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</span></p>
            <p><strong>Executive Remarks:</strong> ${escapeHtml(visit.remarks || '—')}</p>
            ${
              visit.photo
                ? `
              <div style="margin-top: 14px;">
                <strong>Attached Visit Photo:</strong><br />
                <img src="${visit.photo}" alt="Visit Photo" class="visit-detail-photo" />
              </div>
            `
                : ''
            }
          </div>

          ${
            isSuperAdmin
              ? `
            <div class="detail-box full-span admin-remark-section">
              <div class="admin-remark-header">
                <h4>Admin Remark & Management Actions</h4>
                <span class="admin-remark-badge">Super Admin Action</span>
              </div>
              <label class="field-block" style="margin-bottom: 12px;">
                <span>Admin Remark / Instructions for Executive</span>
                <textarea id="modalAdminRemark" class="admin-remark-textarea" rows="3" placeholder="Write your remark or instruction...">${escapeHtml(visit.adminRemark || '')}</textarea>
              </label>
              <div class="form-grid two-col" style="margin-bottom: 12px;">
                <label class="field-block">
                  <span>Update Lead Status</span>
                  <select id="modalAdminLeadStatus">
                    <option ${visit.leadStatus === 'New' ? 'selected' : ''}>New</option>
                    <option ${visit.leadStatus === 'Interested' ? 'selected' : ''}>Interested</option>
                    <option ${visit.leadStatus === 'Follow-up' ? 'selected' : ''}>Follow-up</option>
                    <option ${visit.leadStatus === 'Converted' ? 'selected' : ''}>Converted</option>
                    <option ${visit.leadStatus === 'Not Interested' ? 'selected' : ''}>Not Interested</option>
                  </select>
                </label>
                <label class="field-block">
                  <span>Schedule Follow-up Date</span>
                  <input type="date" id="modalAdminFollowUpDate" value="${escapeHtml(visit.followUpDate || '')}" />
                </label>
              </div>
              <button type="button" class="primary-btn" id="btnSaveAdminRemark">Save Remark & Updates</button>
            </div>
          `
              : visit.adminRemark
              ? `
            <div class="detail-box full-span exec-view-admin-remark">
              <h4>Instructions from Super Admin</h4>
              <p class="admin-remark-quote">${escapeHtml(visit.adminRemark)}</p>
            </div>
          `
              : ''
          }
        </div>
        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="secondary-btn" data-close-modal="true">Close</button>
        </div>
      </div>
    </div>
  `);

  if (isSuperAdmin) {
    const btnSave = document.getElementById('btnSaveAdminRemark');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        const remarkInput = document.getElementById('modalAdminRemark');
        const leadStatusInput = document.getElementById('modalAdminLeadStatus');
        const followUpInput = document.getElementById('modalAdminFollowUpDate');

        const newRemark = (remarkInput?.value || '').trim();
        const newLeadStatus = leadStatusInput?.value || visit.leadStatus;
        const newFollowUpDate = followUpInput?.value || '';

        const res = await api.saveVisitRemark(visit.visitId, {
          adminRemark: newRemark,
          leadStatus: newLeadStatus,
          followUpDate: newFollowUpDate,
        });

        if (!res.success) {
          showToast(res.message || 'Failed to save remark.', 'error');
          btnSave.disabled = false;
          btnSave.textContent = 'Save Remark & Updates';
          return;
        }

        showToast('Remark and updates saved successfully.');
        await api.fetchVisits();
        openVisitDetailModal(visit.visitId);

        if (PAGE === 'admin.html') {
          renderAdminSection(state.activeView || 'dashboard');
        }
      });
    }
  }
}

function attachVisitDetailListeners() {
  document.querySelectorAll('[data-view-visit]').forEach((button) => {
    button.addEventListener('click', () => {
      const visitId = button.dataset.viewVisit;
      openVisitDetailModal(visitId);
    });
  });
}

function logout() {
  api.logout();
}

/* ==========================================
   PAGE INITIALIZATION & GLOBAL DELEGATION
========================================== */

async function initPage() {
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  // Mobile Drawer Toggle
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.toggle('active', sidebar.classList.contains('open'));
    });
  }

  // Close Mobile Drawer on backdrop tap
  if (sidebarBackdrop && sidebar) {
    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('active');
    });
  }

  // GLOBAL EVENT DELEGATION for Navigation & Buttons
  document.addEventListener('click', async (event) => {
    // Modal close
    if (event.target.closest('[data-close-modal]')) {
      closeModal();
      return;
    }

    // Nav-item or any data-view button
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      const targetView = viewButton.dataset.view;
      if (!targetView) return;

      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      }

      if (targetView === 'logout') {
        logout();
        return;
      }

      if (PAGE === 'admin.html') {
        renderAdminSection(targetView);
      } else if (PAGE === 'executive.html') {
        renderExecutiveSection(targetView);
      }
      return;
    }

    // Admin Add Executive button
    if (event.target.closest('[data-action="add-executive"]')) {
      openExecutiveModal();
      return;
    }

    // Admin Edit Executive button
    const editBtn = event.target.closest('[data-action="edit-executive"]');
    if (editBtn) {
      const user = getUsers().find((u) => u.id === editBtn.dataset.id);
      if (user) openExecutiveModal(user);
      return;
    }

    // Admin View Executive button
    const viewExecBtn = event.target.closest('[data-action="view-executive"]');
    if (viewExecBtn) {
      const user = getUsers().find((u) => u.id === viewExecBtn.dataset.id);
      if (user) {
        openModal(`
          <div class="modal-backdrop">
            <div class="modal-card">
              <div class="modal-header">
                <div>
                  <p class="eyebrow">Executive Profile</p>
                  <h3>${escapeHtml(user.name)}</h3>
                </div>
                <button type="button" class="close-btn" data-close-modal="true">×</button>
              </div>
              <div class="detail-box">
                <p><strong>Employee ID:</strong> ${escapeHtml(user.employeeId)}</p>
                <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
                <p><strong>Mobile:</strong> ${escapeHtml(user.mobile || '—')}</p>
                <p><strong>Territory:</strong> ${escapeHtml(user.territory || '—')}</p>
                <p><strong>Status:</strong> ${escapeHtml(user.status || 'Active')}</p>
                <p><strong>Total Visits:</strong> ${getExecutiveVisitsCount(user)}</p>
              </div>
            </div>
          </div>
        `);
      }
      return;
    }

    // Admin Toggle Executive Status button
    const toggleBtn = event.target.closest('[data-action="toggle-executive"]');
    if (toggleBtn) {
      const users = getUsers();
      const user = users.find((u) => u.id === toggleBtn.dataset.id);
      if (!user) return;
      const nextStatus = user.status === 'Active' ? 'Inactive' : 'Active';
      const res = await api.updateExecutive(user.id, { status: nextStatus });
      if (!res.success) {
        showToast(res.message || 'Failed to update status.', 'error');
        return;
      }
      showToast(nextStatus === 'Active' ? 'Executive account activated.' : 'Executive account deactivated.');
      await api.fetchUsers();
      renderExecutivesPage();
      return;
    }

    // Admin Reset Password button
    const resetBtn = event.target.closest('[data-action="reset-password"]');
    if (resetBtn) {
      const users = getUsers();
      const user = users.find((u) => u.id === resetBtn.dataset.id);
      if (!user) return;
      const newPassword = prompt(`Enter a new password for ${user.name}:`, '');
      if (newPassword === null) return;
      if (newPassword.trim().length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
      }
      const res = await api.resetPassword(user.id, newPassword.trim());
      if (!res.success) {
        showToast(res.message || 'Failed to reset password.', 'error');
        return;
      }
      showToast('Password reset successfully.');
      return;
    }

    // Admin Delete Executive button
    const deleteBtn = event.target.closest('[data-action="delete-executive"]');
    if (deleteBtn) {
      const userId = deleteBtn.dataset.id;
      const userName = deleteBtn.dataset.name || 'this executive';
      openDeleteExecutiveModal(userId, userName);
      return;
    }
  });

  // Login Form Submission on index.html
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const loginInput = document.getElementById('loginId');
      const passwordInput = document.getElementById('password');
      const identifier = (loginInput?.value || '').trim();
      const password = (passwordInput?.value || '').trim();

      if (!identifier || !password) {
        if (loginError) {
          loginError.textContent = 'Email / Employee ID and password are required.';
          loginError.style.display = 'block';
        }
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
      }

      const res = await api.login(identifier, password);

      if (!res.success) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
        if (loginError) {
          loginError.textContent = res.message || 'Account not found. Please check your email or employee ID.';
          loginError.style.display = 'block';
        }
        return;
      }

      // Check role redirection
      if (res.user.role === 'SUPER_ADMIN') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'executive.html';
      }
    });
  }

  // Admin Search Input
  const globalSearchInput = document.getElementById('globalSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (event) => {
      state.searchQuery = event.target.value.trim();
      if (state.searchQuery) {
        renderSearchResults(state.searchQuery);
      } else {
        renderAdminSection(state.activeView || 'dashboard');
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (globalSearchInput) globalSearchInput.value = '';
      state.searchQuery = '';
      renderAdminSection(state.activeView || 'dashboard');
    });
  }

  // Executive Search Input
  const execSearchInput = document.getElementById('execSearchInput');
  if (execSearchInput) {
    execSearchInput.addEventListener('input', (event) => {
      const query = (event.target.value || '').trim().toLowerCase();
      const currentUser = getCurrentUser();
      const visits = getVisits().filter((visit) => isExecutiveVisit(visit, currentUser));
      const filtered = visits.filter((visit) =>
        [visit.customerName, visit.companyName, visit.purpose, visit.leadStatus].some((f) =>
          (f || '').toLowerCase().includes(query)
        )
      );

      const tableBody = document.querySelector('#executiveContent tbody');
      if (tableBody) {
        tableBody.innerHTML = filtered.length
          ? filtered
              .map(
                (visit) => `
            <tr>
              <td><strong>${escapeHtml(visit.customerName)}</strong></td>
              <td>${escapeHtml(visit.companyName || '—')}</td>
              <td>${escapeHtml(visit.visitDate ? formatDisplayDate(visit.visitDate) : '—')}</td>
              <td>${escapeHtml(visit.purpose || '—')}</td>
              <td><span class="badge ${visit.leadStatus === 'Converted' ? 'badge-success' : 'badge-warning'}">${escapeHtml(visit.leadStatus || 'New')}</span></td>
              <td>${escapeHtml(visit.followUpDate ? formatDisplayDate(visit.followUpDate) : '—')}</td>
              <td><button type="button" class="text-link" data-view-visit="${visit.visitId}">View</button></td>
            </tr>
          `
              )
              .join('')
          : '<tr><td colspan="7"><div class="empty-state compact"><p>No results found.</p></div></td></tr>';
        attachVisitDetailListeners();
      }
    });
  }

  // Route protection and initialization
  if (PAGE === 'admin.html') {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN' || !currentUser.token) {
      window.location.href = 'index.html';
      return;
    }

    const check = await api.fetchMe();
    if (!check.success || check.user.role !== 'SUPER_ADMIN') {
      clearCurrentUser();
      window.location.href = 'index.html';
      return;
    }

    await api.migrateLegacyData();
    await renderAdminSection('dashboard');
    initNotificationSystem();
    startPolling();
  }

  if (PAGE === 'executive.html') {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'SALES_EXECUTIVE' || !currentUser.token) {
      window.location.href = 'index.html';
      return;
    }

    const check = await api.fetchMe();
    if (!check.success || check.user.role !== 'SALES_EXECUTIVE') {
      clearCurrentUser();
      window.location.href = 'index.html';
      return;
    }

    await renderExecutiveSection('dashboard');
    initNotificationSystem();
    startPolling();
  }
}

document.addEventListener('DOMContentLoaded', initPage);
