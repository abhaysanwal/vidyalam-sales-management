const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = 8080;
const HOST = '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* ==========================================
   DATABASE INITIALIZATION (node:sqlite)
========================================== */
const DB_PATH = path.join(DATA_DIR, 'vidyalam.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    employee_id TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    mobile TEXT,
    territory TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    joining_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    attendance_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    check_in_time TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(employee_id, date)
  );

  CREATE TABLE IF NOT EXISTS visits (
    visit_id TEXT PRIMARY KEY,
    executive_id TEXT NOT NULL,
    executive_name TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    company_name TEXT,
    contact_person TEXT,
    mobile TEXT,
    email TEXT,
    address TEXT,
    visit_date TEXT NOT NULL,
    visit_time TEXT NOT NULL,
    purpose TEXT NOT NULL,
    location TEXT,
    discussion TEXT,
    requirement TEXT,
    product_interest TEXT,
    follow_up_date TEXT,
    lead_status TEXT NOT NULL,
    remarks TEXT,
    photo TEXT,
    admin_remark TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_role TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_type TEXT,
    related_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
`);

/* ==========================================
   CRYPTOGRAPHY & AUTH HELPERS
========================================== */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  try {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch (e) {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    name: row.name,
    email: row.email,
    mobile: row.mobile || '',
    territory: row.territory || '',
    role: row.role,
    status: row.status,
    joiningDate: row.joining_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVisitRow(row) {
  if (!row) return null;
  return {
    id: row.visit_id,
    visitId: row.visit_id,
    executiveId: row.executive_id,
    executiveName: row.executive_name,
    customerName: row.customer_name,
    dealerName: row.customer_name,
    companyName: row.company_name || '',
    contactPerson: row.contact_person || '',
    mobile: row.mobile || '',
    email: row.email || '',
    address: row.address || '',
    visitDate: row.visit_date,
    visitTime: row.visit_time,
    purpose: row.purpose,
    location: row.location || '',
    discussion: row.discussion || '',
    requirement: row.requirement || '',
    productInterest: row.product_interest || '',
    followUpDate: row.follow_up_date || '',
    leadStatus: row.lead_status,
    status: row.lead_status,
    remarks: row.remarks || '',
    photo: row.photo || '',
    adminRemark: row.admin_remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceRow(row) {
  if (!row) return null;
  return {
    id: row.attendance_id,
    attendanceId: row.attendance_id,
    employeeId: row.employee_id,
    employee_id: row.employee_id,
    employeeName: row.employee_name,
    name: row.employee_name,
    date: row.date,
    status: row.status,
    checkInTime: row.check_in_time || '',
    reason: row.reason || '',
    createdAt: row.created_at,
  };
}

function mapNotificationRow(row) {
  if (!row) return null;
  let meta = {};
  try {
    meta = row.metadata ? JSON.parse(row.metadata) : {};
  } catch (e) {}
  return {
    id: row.id,
    recipientRole: row.recipient_role,
    recipientId: row.recipient_id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedType: row.related_type,
    relatedId: row.related_id,
    read: Boolean(row.is_read),
    metadata: meta,
    createdAt: row.created_at,
  };
}

/* ==========================================
   SEED DEFAULT ACCOUNTS IF MISSING
========================================== */
function seedInitialData() {
  const checkAdmin = db.prepare('SELECT id FROM users WHERE email = ?;').get('hr@vidyalam.in');
  if (!checkAdmin) {
    const { hash, salt } = hashPassword('demo-admin-2026');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, employee_id, name, email, mobile, territory, password_hash, password_salt, role, status, joining_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run('admin-vidyalam', 'HR-ADMIN', 'Super Admin', 'hr@vidyalam.in', '+91 98765 00000', 'Corporate', hash, salt, 'SUPER_ADMIN', 'Active', '2024-01-01', now, now);
  }

  const checkAbhay = db.prepare('SELECT id FROM users WHERE employee_id = ? OR email = ?;').get('01', 'demo@vidyalam.in');
  if (!checkAbhay) {
    const { hash, salt } = hashPassword('demo-exec-2026');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, employee_id, name, email, mobile, territory, password_hash, password_salt, role, status, joining_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run('exec-01', '01', 'Abhay', 'demo@vidyalam.in', '9319963315', 'INDIA', hash, salt, 'SALES_EXECUTIVE', 'Active', '2024-01-15', now, now);
  }

  // Pre-seed Sumit if not already created
  const checkSumit = db.prepare('SELECT id FROM users WHERE employee_id = ? OR email = ?;').get('02', 'sumit@gmail.com');
  if (!checkSumit) {
    const { hash, salt } = hashPassword('Test@12345');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, employee_id, name, email, mobile, territory, password_hash, password_salt, role, status, joining_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run('exec-02', '02', 'Sumit', 'sumit@gmail.com', '9759602121', 'INDIA', hash, salt, 'SALES_EXECUTIVE', 'Active', '2026-01-01', now, now);
  }
}
seedInitialData();

/* ==========================================
   SESSION AUTHENTICATION MIDDLEWARE
========================================== */
function getAuthenticatedUser(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'] || '';
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const sessionRow = db.prepare(`
    SELECT s.token, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?;
  `).get(token);

  if (!sessionRow) return null;
  if (sessionRow.status === 'Deleted') {
    db.prepare('DELETE FROM sessions WHERE token = ?;').run(token);
    return null;
  }
  if (new Date(sessionRow.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?;').run(token);
    return null;
  }

  return mapUserRow(sessionRow);
}

/* ==========================================
   STATIC MIME TYPES
========================================== */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ==========================================
   HTTP REQUEST ROUTER
========================================== */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) { // 20MB max
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURI(parsedUrl.pathname);

  /* ------------------------------------------
     REST API ROUTES (/api/*)
  ------------------------------------------ */
  if (pathname.startsWith('/api/')) {
    try {
      // 1. POST /api/auth/login
      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const body = await parseBody(req);
        const identifier = String(body.identifier || body.loginId || body.email || body.employeeId || '').trim().toLowerCase();
        const cleanIdNoZero = identifier.replace(/^0+/, '');
        const password = String(body.password || '').trim();

        if (!identifier || !password) {
          return sendJson(res, 400, { success: false, message: 'Email / Employee ID and password are required.', error: 'Email / Employee ID and password are required.' });
        }

        const userRow = db.prepare(`
          SELECT * FROM users
          WHERE LOWER(email) = ?
             OR LOWER(employee_id) = ?
             OR (LENGTH(?) > 0 AND LTRIM(LOWER(employee_id), '0') = ?);
        `).get(identifier, identifier, cleanIdNoZero, cleanIdNoZero);

        if (!userRow || userRow.status === 'Deleted') {
          return sendJson(res, 404, { success: false, message: 'Account not found. Please check your email or employee ID.', error: 'Account not found. Please check your email or employee ID.' });
        }

        if (userRow.status !== 'Active') {
          return sendJson(res, 403, { success: false, message: 'Your account is inactive. Please contact the administrator.', error: 'Your account is inactive. Please contact the administrator.' });
        }

        const passwordOk = verifyPassword(password, userRow.password_hash, userRow.password_salt);
        if (!passwordOk) {
          return sendJson(res, 401, { success: false, message: 'Incorrect password.', error: 'Incorrect password.' });
        }

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO sessions (token, user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?);
        `).run(token, userRow.id, now, expiresAt);

        const safeUser = mapUserRow(userRow);
        return sendJson(res, 200, { success: true, token, user: safeUser });
      }

      // 2. GET /api/auth/me
      if (req.method === 'GET' && pathname === '/api/auth/me') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        return sendJson(res, 200, { success: true, user });
      }

      // 3. POST /api/auth/logout
      if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (token) {
          db.prepare('DELETE FROM sessions WHERE token = ?;').run(token);
        }
        return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
      }

      // 4. GET /api/users
      if (req.method === 'GET' && pathname === '/api/users') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        if (user.role === 'SUPER_ADMIN') {
          const rows = db.prepare("SELECT * FROM users WHERE status != 'Deleted' ORDER BY created_at ASC;").all();
          return sendJson(res, 200, { success: true, users: rows.map(mapUserRow) });
        } else {
          // Executive only sees self
          const row = db.prepare("SELECT * FROM users WHERE id = ? AND status != 'Deleted';").get(user.id);
          return sendJson(res, 200, { success: true, users: row ? [mapUserRow(row)] : [] });
        }
      }

      // 5. POST /api/users (Add Executive)
      if (req.method === 'POST' && pathname === '/api/users') {
        const currentUser = getAuthenticatedUser(req);
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const body = await parseBody(req);
        const name = String(body.name || '').trim();
        const employeeId = String(body.employeeId || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const mobile = String(body.mobile || '').trim();
        const territory = String(body.territory || '').trim();
        const password = String(body.password || '').trim();
        const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
        const joiningDate = String(body.joiningDate || '').trim();

        if (!name || !employeeId || !email || !mobile) {
          return sendJson(res, 400, { success: false, message: 'Name, employee ID, email, and mobile are required.' });
        }

        if (!password || password.length < 6) {
          return sendJson(res, 400, { success: false, message: 'Password must be at least 6 characters.' });
        }

        // Check for duplicates
        const existing = db.prepare('SELECT id, email, employee_id FROM users WHERE LOWER(email) = ? OR LOWER(employee_id) = ?;').get(email, employeeId.toLowerCase());
        if (existing) {
          return sendJson(res, 409, { success: false, message: 'An executive with this email or employee ID already exists.' });
        }

        const id = `exec-${Date.now()}`;
        const { hash, salt } = hashPassword(password);
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO users (id, employee_id, name, email, mobile, territory, password_hash, password_salt, role, status, joining_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).run(id, employeeId, name, email, mobile, territory, hash, salt, 'SALES_EXECUTIVE', status, joiningDate, now, now);

        const created = mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?;').get(id));
        return sendJson(res, 201, { success: true, user: created });
      }

      // 6. PUT /api/users/:id (Edit executive or toggle status)
      if (req.method === 'PUT' && pathname.startsWith('/api/users/') && !pathname.endsWith('/reset-password')) {
        const currentUser = getAuthenticatedUser(req);
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const targetId = pathname.replace('/api/users/', '').trim();
        const existing = db.prepare('SELECT * FROM users WHERE id = ?;').get(targetId);
        if (!existing) return sendJson(res, 404, { success: false, message: 'User not found.' });

        const body = await parseBody(req);
        const name = body.name !== undefined ? String(body.name).trim() : existing.name;
        const employeeId = body.employeeId !== undefined ? String(body.employeeId).trim() : existing.employee_id;
        const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : existing.email;
        const mobile = body.mobile !== undefined ? String(body.mobile).trim() : existing.mobile;
        const territory = body.territory !== undefined ? String(body.territory).trim() : existing.territory;
        const status = body.status !== undefined ? (body.status === 'Inactive' ? 'Inactive' : 'Active') : existing.status;
        const joiningDate = body.joiningDate !== undefined ? String(body.joiningDate).trim() : existing.joining_date;
        const now = new Date().toISOString();

        let passwordHash = existing.password_hash;
        let passwordSalt = existing.password_salt;
        if (body.password && String(body.password).trim().length >= 6) {
          const resHash = hashPassword(String(body.password).trim());
          passwordHash = resHash.hash;
          passwordSalt = resHash.salt;
        }

        db.prepare(`
          UPDATE users
          SET name = ?, employee_id = ?, email = ?, mobile = ?, territory = ?, status = ?, joining_date = ?, password_hash = ?, password_salt = ?, updated_at = ?
          WHERE id = ?;
        `).run(name, employeeId, email, mobile, territory, status, joiningDate, passwordHash, passwordSalt, now, targetId);

        const updated = mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?;').get(targetId));
        return sendJson(res, 200, { success: true, user: updated });
      }

      // 7. POST /api/users/:id/reset-password
      if (req.method === 'POST' && pathname.includes('/reset-password')) {
        const currentUser = getAuthenticatedUser(req);
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const targetId = pathname.replace('/api/users/', '').replace('/reset-password', '').trim();
        const body = await parseBody(req);
        const newPassword = String(body.password || body.newPassword || '').trim();

        if (!newPassword || newPassword.length < 6) {
          return sendJson(res, 400, { success: false, message: 'Password must be at least 6 characters.', error: 'Password must be at least 6 characters.' });
        }

        const { hash, salt } = hashPassword(newPassword);
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE users
          SET password_hash = ?, password_salt = ?, updated_at = ?
          WHERE id = ?;
        `).run(hash, salt, now, targetId);

        return sendJson(res, 200, { success: true, message: 'Password reset successfully.' });
      }

      // 7b. DELETE /api/users/:id (Remove Executive)
      if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
        const currentUser = getAuthenticatedUser(req);
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const targetId = pathname.replace('/api/users/', '').trim();
        const existing = db.prepare('SELECT * FROM users WHERE id = ?;').get(targetId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Executive not found.' });
        }

        if (existing.role === 'SUPER_ADMIN' || targetId === currentUser.id) {
          return sendJson(res, 400, { success: false, message: 'Cannot delete Super Admin account.' });
        }

        const now = new Date().toISOString();
        db.prepare(`
          UPDATE users
          SET status = 'Deleted', updated_at = ?
          WHERE id = ?;
        `).run(now, targetId);

        // Terminate any active sessions for this user
        db.prepare('DELETE FROM sessions WHERE user_id = ?;').run(targetId);

        return sendJson(res, 200, { success: true, message: 'Executive removed successfully.' });
      }

      // 8. GET /api/attendance
      if (req.method === 'GET' && pathname === '/api/attendance') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        const date = parsedUrl.searchParams.get('date');
        const employeeId = parsedUrl.searchParams.get('employeeId');

        let query = 'SELECT * FROM attendance WHERE 1=1';
        const params = [];

        if (user.role === 'SALES_EXECUTIVE') {
          query += ' AND (LOWER(employee_id) = ? OR LOWER(employee_id) = ?)';
          params.push(user.employeeId.toLowerCase(), user.id.toLowerCase());
        } else if (employeeId) {
          query += ' AND (LOWER(employee_id) = ? OR LOWER(employee_id) = ?)';
          params.push(employeeId.toLowerCase(), employeeId.toLowerCase());
        }

        if (date) {
          query += ' AND date = ?';
          params.push(date);
        }

        query += ' ORDER BY date DESC, created_at DESC;';
        const rows = db.prepare(query).all(...params);
        return sendJson(res, 200, { success: true, attendance: rows.map(mapAttendanceRow) });
      }

      // 9. POST /api/attendance
      if (req.method === 'POST' && pathname === '/api/attendance') {
        const user = getAuthenticatedUser(req);
        if (!user || user.role !== 'SALES_EXECUTIVE') {
          return sendJson(res, 403, { success: false, message: 'Executive access required.' });
        }

        const body = await parseBody(req);
        const date = String(body.date || '').trim();
        const status = (body.status || '').toLowerCase() === 'absent' ? 'Absent' : 'Present';
        const checkInTime = String(body.checkInTime || '').trim();
        const reason = String(body.reason || '').trim();

        if (!date) return sendJson(res, 400, { success: false, message: 'Date is required.', error: 'Date is required.' });
        if (status === 'Absent' && !reason) {
          return sendJson(res, 400, { success: false, message: 'Leave reason is required for absence.', error: 'Leave reason is required for absence.' });
        }

        const now = new Date().toISOString();
        const attendanceId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        // Check if record exists for this employee and date
        const existing = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?;').get(user.employeeId, date);

        if (existing) {
          return sendJson(res, 409, {
            success: false,
            message: 'Attendance has already been recorded for this date.',
            error: 'Attendance has already been recorded for this date.',
            attendance: mapAttendanceRow(existing)
          });
        } else {
          db.prepare(`
            INSERT INTO attendance (attendance_id, employee_id, employee_name, date, status, check_in_time, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
          `).run(attendanceId, user.employeeId, user.name, date, status, checkInTime, reason, now);
        }

        // Dispatch real-time notification to Super Admin
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const notifType = status === 'Present' ? 'PRESENT_MARKED' : 'ABSENT_MARKED';
        const notifTitle = `${user.name} marked ${status}`;
        const notifMsg = status === 'Present'
          ? `Employee: ${user.name}\nDate: ${date}\nTime: ${checkInTime}`
          : `Employee: ${user.name}\nDate: ${date}\nReason: ${reason}`;

        const meta = JSON.stringify({
          employeeName: user.name,
          employeeId: user.employeeId,
          date,
          status,
          time: checkInTime,
          reason,
        });

        db.prepare(`
          INSERT INTO notifications (id, recipient_role, recipient_id, type, title, message, related_type, related_id, is_read, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
        `).run(notifId, 'SUPER_ADMIN', 'SUPER_ADMIN', notifType, notifTitle, notifMsg, 'ATTENDANCE', date, meta, now);

        const rec = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?;').get(user.employeeId, date);
        return sendJson(res, 200, { success: true, record: mapAttendanceRow(rec) });
      }

      // 10. GET /api/visits
      if (req.method === 'GET' && pathname === '/api/visits') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        let query = 'SELECT * FROM visits';
        const params = [];

        if (user.role === 'SALES_EXECUTIVE') {
          query += ' WHERE executive_id = ? OR executive_id = ? OR LOWER(executive_name) = ?';
          params.push(user.id, user.employeeId, user.name.toLowerCase());
        }

        query += ' ORDER BY visit_date DESC, created_at DESC;';
        const rows = db.prepare(query).all(...params);
        return sendJson(res, 200, { success: true, visits: rows.map(mapVisitRow) });
      }

      // 11. POST /api/visits (Executive submits dealer visit report)
      if (req.method === 'POST' && pathname === '/api/visits') {
        const user = getAuthenticatedUser(req);
        if (!user || user.role !== 'SALES_EXECUTIVE') {
          return sendJson(res, 403, { success: false, message: 'Executive access required.' });
        }

        const body = await parseBody(req);
        const customerName = String(body.customerName || body.dealerName || '').trim();
        const visitDate = String(body.visitDate || '').trim();
        const visitTime = String(body.visitTime || '').trim();
        const purpose = String(body.purpose || '').trim();
        const leadStatus = String(body.leadStatus || body.status || 'New').trim();
        const discussion = String(body.discussion || body.summary || '').trim();
        const productInterest = String(body.productInterest || body.productsDiscussed || '').trim();
        const followUpDate = String(body.followUpDate || body.nextFollowUpDate || '').trim();

        if (!customerName || !visitDate || !visitTime || !purpose) {
          return sendJson(res, 400, { success: false, message: 'Dealer name, date, time, and purpose are required.', error: 'Dealer name, date, time, and purpose are required.' });
        }

        const visitId = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO visits (
            visit_id, executive_id, executive_name, customer_name, company_name, contact_person, mobile, email, address,
            visit_date, visit_time, purpose, location, discussion, requirement, product_interest, follow_up_date, lead_status,
            remarks, photo, admin_remark, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).run(
          visitId,
          user.id,
          user.name,
          customerName,
          String(body.companyName || '').trim(),
          String(body.contactPerson || '').trim(),
          String(body.mobile || '').trim(),
          String(body.email || '').trim(),
          String(body.address || '').trim(),
          visitDate,
          visitTime,
          purpose,
          String(body.location || '').trim(),
          discussion,
          String(body.requirement || '').trim(),
          productInterest,
          followUpDate,
          leadStatus,
          String(body.remarks || '').trim(),
          String(body.photo || '').trim(),
          '',
          now,
          now
        );

        // Notify Super Admin
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const notifTitle = `${user.name} submitted a Dealer Visit Report`;
        const notifMsg = `Dealer: ${customerName}\nCompany: ${body.companyName || '—'}\nDate: ${visitDate} ${visitTime}`;
        const meta = JSON.stringify({
          employeeName: user.name,
          employeeId: user.employeeId,
          dealerName: customerName,
          companyName: body.companyName || '',
          visitId,
        });

        db.prepare(`
          INSERT INTO notifications (id, recipient_role, recipient_id, type, title, message, related_type, related_id, is_read, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
        `).run(notifId, 'SUPER_ADMIN', 'SUPER_ADMIN', 'VISIT_SUBMITTED', notifTitle, notifMsg, 'VISIT', visitId, meta, now);

        const created = mapVisitRow(db.prepare('SELECT * FROM visits WHERE visit_id = ?;').get(visitId));
        return sendJson(res, 201, { success: true, visit: created });
      }

      // 12. PUT /api/visits/:id/remark (Admin adds remark / updates lead status)
      if (req.method === 'PUT' && pathname.includes('/remark')) {
        const currentUser = getAuthenticatedUser(req);
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const visitId = pathname.replace('/api/visits/', '').replace('/remark', '').trim();
        const visit = db.prepare('SELECT * FROM visits WHERE visit_id = ?;').get(visitId);
        if (!visit) return sendJson(res, 404, { success: false, message: 'Visit not found.' });

        const body = await parseBody(req);
        const adminRemark = String(body.adminRemark !== undefined ? body.adminRemark : visit.admin_remark).trim();
        const leadStatus = String(body.leadStatus !== undefined ? body.leadStatus : visit.lead_status).trim();
        const followUpDate = String(body.followUpDate !== undefined ? body.followUpDate : visit.follow_up_date).trim();
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE visits
          SET admin_remark = ?, lead_status = ?, follow_up_date = ?, updated_at = ?
          WHERE visit_id = ?;
        `).run(adminRemark, leadStatus, followUpDate, now, visitId);

        // Notify the specific Executive
        if (adminRemark && adminRemark !== visit.admin_remark) {
          const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          db.prepare(`
            INSERT INTO notifications (id, recipient_role, recipient_id, type, title, message, related_type, related_id, is_read, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
          `).run(
            notifId,
            'SALES_EXECUTIVE',
            visit.executive_id,
            'ADMIN_REMARK',
            'NEW ADMIN REMARK',
            `Dealer: ${visit.customer_name}\nAdmin Remark: "${adminRemark}"`,
            'VISIT',
            visitId,
            JSON.stringify({ dealerName: visit.customer_name, adminRemark, employeeName: visit.executive_name }),
            now
          );
        }

        if (leadStatus && leadStatus !== visit.lead_status) {
          const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          db.prepare(`
            INSERT INTO notifications (id, recipient_role, recipient_id, type, title, message, related_type, related_id, is_read, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
          `).run(
            notifId,
            'SALES_EXECUTIVE',
            visit.executive_id,
            'LEAD_STATUS_UPDATED',
            'Lead status updated',
            `Dealer: ${visit.customer_name}\nNew Status: ${leadStatus}`,
            'VISIT',
            visitId,
            JSON.stringify({ dealerName: visit.customer_name, oldStatus: visit.lead_status, leadStatus }),
            now
          );
        }

        const updated = mapVisitRow(db.prepare('SELECT * FROM visits WHERE visit_id = ?;').get(visitId));
        return sendJson(res, 200, { success: true, visit: updated });
      }

      // 13. GET /api/notifications
      if (req.method === 'GET' && pathname === '/api/notifications') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        let query = '';
        const params = [];

        if (user.role === 'SUPER_ADMIN') {
          query = "SELECT * FROM notifications WHERE recipient_role = 'SUPER_ADMIN' ORDER BY created_at DESC LIMIT 100;";
        } else {
          query = `
            SELECT * FROM notifications
            WHERE recipient_role = 'SALES_EXECUTIVE'
              AND (recipient_id = ? OR recipient_id = ? OR LOWER(metadata) LIKE ?)
            ORDER BY created_at DESC LIMIT 100;
          `;
          params.push(user.id, user.employeeId, `%${user.name.toLowerCase()}%`);
        }

        const rows = db.prepare(query).all(...params);
        return sendJson(res, 200, { success: true, notifications: rows.map(mapNotificationRow) });
      }

      // 14. PUT /api/notifications/:id/read
      if (req.method === 'PUT' && pathname.endsWith('/read') && !pathname.endsWith('/read-all')) {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        const notifId = pathname.replace('/api/notifications/', '').replace('/read', '').trim();
        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?;').run(notifId);
        return sendJson(res, 200, { success: true, message: 'Marked as read.' });
      }

      // 15. PUT /api/notifications/read-all
      if (req.method === 'PUT' && pathname === '/api/notifications/read-all') {
        const user = getAuthenticatedUser(req);
        if (!user) return sendJson(res, 401, { success: false, message: 'Unauthorized' });

        if (user.role === 'SUPER_ADMIN') {
          db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_role = 'SUPER_ADMIN';").run();
        } else {
          db.prepare(`
            UPDATE notifications
            SET is_read = 1
            WHERE recipient_role = 'SALES_EXECUTIVE'
              AND (recipient_id = ? OR recipient_id = ?);
          `).run(user.id, user.employeeId);
        }
        return sendJson(res, 200, { success: true, message: 'All notifications marked as read.' });
      }

      // 16. GET /api/search?q=...
      if (req.method === 'GET' && pathname === '/api/search') {
        const user = getAuthenticatedUser(req);
        if (!user || user.role !== 'SUPER_ADMIN') {
          return sendJson(res, 403, { success: false, message: 'Admin access required.' });
        }

        const q = String(parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        if (!q) {
          return sendJson(res, 200, { success: true, executives: [], visits: [] });
        }

        const pattern = `%${q}%`;
        const execRows = db.prepare(`
          SELECT * FROM users
          WHERE role = 'SALES_EXECUTIVE'
            AND (LOWER(name) LIKE ? OR LOWER(employee_id) LIKE ? OR LOWER(email) LIKE ? OR LOWER(mobile) LIKE ? OR LOWER(territory) LIKE ?);
        `).all(pattern, pattern, pattern, pattern, pattern);

        const visitRows = db.prepare(`
          SELECT * FROM visits
          WHERE LOWER(customer_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(contact_person) LIKE ? OR LOWER(purpose) LIKE ? OR LOWER(lead_status) LIKE ?;
        `).all(pattern, pattern, pattern, pattern, pattern);

        return sendJson(res, 200, {
          success: true,
          executives: execRows.map(mapUserRow),
          visits: visitRows.map(mapVisitRow),
        });
      }

      // 17. POST /api/migrate (Migrate legacy client localStorage into shared SQLite database)
      if (req.method === 'POST' && pathname === '/api/migrate') {
        const body = await parseBody(req);
        const { users = [], visits = [], attendance = [], notifications = [] } = body;
        let importedUsers = 0;
        let importedVisits = 0;
        let importedAttendance = 0;
        let importedNotifs = 0;

        // Migrate Users
        if (Array.isArray(users)) {
          users.forEach((u) => {
            if (!u || !u.email) return;
            const email = String(u.email).trim().toLowerCase();
            const exists = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(employee_id) = ?;').get(email, String(u.employeeId || '').toLowerCase());
            if (!exists) {
              const id = u.id || `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const { hash, salt } = hashPassword(u.password || 'demo-exec-2026');
              const now = u.createdAt || new Date().toISOString();
              db.prepare(`
                INSERT INTO users (id, employee_id, name, email, mobile, territory, password_hash, password_salt, role, status, joining_date, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
              `).run(id, u.employeeId || '', u.name || 'Sales Executive', email, u.mobile || '', u.territory || '', hash, salt, u.role || 'SALES_EXECUTIVE', u.status || 'Active', u.joiningDate || '', now, now);
              importedUsers++;
            }
          });
        }

        // Migrate Attendance
        if (Array.isArray(attendance)) {
          attendance.forEach((att) => {
            if (!att || !att.employeeId || !att.date) return;
            const exists = db.prepare('SELECT attendance_id FROM attendance WHERE employee_id = ? AND date = ?;').get(att.employeeId, att.date);
            if (!exists) {
              db.prepare(`
                INSERT INTO attendance (attendance_id, employee_id, employee_name, date, status, check_in_time, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
              `).run(att.attendanceId || `att-${Date.now()}`, att.employeeId, att.employeeName || 'Executive', att.date, att.status || 'Present', att.checkInTime || '', att.reason || '', att.createdAt || new Date().toISOString());
              importedAttendance++;
            }
          });
        }

        // Migrate Visits
        if (Array.isArray(visits)) {
          visits.forEach((v) => {
            if (!v || !v.customerName) return;
            const vId = v.visitId || `visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const exists = db.prepare('SELECT visit_id FROM visits WHERE visit_id = ?;').get(vId);
            if (!exists) {
              db.prepare(`
                INSERT INTO visits (
                  visit_id, executive_id, executive_name, customer_name, company_name, contact_person, mobile, email, address,
                  visit_date, visit_time, purpose, location, discussion, requirement, product_interest, follow_up_date, lead_status,
                  remarks, photo, admin_remark, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
              `).run(
                vId,
                v.executiveId || '',
                v.executiveName || '',
                v.customerName,
                v.companyName || '',
                v.contactPerson || '',
                v.mobile || '',
                v.email || '',
                v.address || '',
                v.visitDate || new Date().toISOString().split('T')[0],
                v.visitTime || '10:00',
                v.purpose || 'New Business',
                v.location || '',
                v.discussion || '',
                v.requirement || '',
                v.productInterest || '',
                v.followUpDate || '',
                v.leadStatus || 'New',
                v.remarks || '',
                v.photo || '',
                v.adminRemark || '',
                v.createdAt || new Date().toISOString(),
                v.updatedAt || new Date().toISOString()
              );
              importedVisits++;
            }
          });
        }

        return sendJson(res, 200, {
          success: true,
          message: 'Migration completed.',
          imported: { users: importedUsers, visits: importedVisits, attendance: importedAttendance, notifications: importedNotifs },
        });
      }

      return sendJson(res, 404, { success: false, message: `Endpoint not found: ${pathname}` });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, message: 'Internal server error: ' + err.message });
    }
  }

  /* ------------------------------------------
     STATIC FILE SERVING
  ------------------------------------------ */
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(content);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Vidyalam Shared Database Server running at http://${HOST}:${PORT}`);
  console.log(`Local machine URL: http://localhost:${PORT}`);
  console.log(`Network multi-device URL: http://192.168.1.41:${PORT}`);
});
