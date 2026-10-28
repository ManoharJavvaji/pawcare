require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const db = new Database(path.join(DATA_DIR, 'pawcare.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  location TEXT NOT NULL,
  animal TEXT NOT NULL,
  issue TEXT NOT NULL,
  details TEXT NOT NULL,
  photo TEXT,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  species TEXT NOT NULL CHECK(species IN ('Dog','Cat')),
  age TEXT NOT NULL,
  sex TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS adoption_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  housing TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  availability TEXT NOT NULL,
  skills TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS donation_pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pledge only',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const petCount = db.prepare('SELECT COUNT(*) AS n FROM pets').get().n;
if (petCount === 0) {
  const addPet = db.prepare(`INSERT INTO pets
    (name,species,age,sex,city,description,image_url) VALUES (?,?,?,?,?,?,?)`);
  const samplePets = [
    ['Buddy','Dog','2 years','Male','Delhi','Friendly, playful and ready to meet a caring family.','https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80'],
    ['Misty','Cat','8 months','Female','Mumbai','A curious, gentle cat who loves sunny windows.','https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=900&q=80'],
    ['Rocky','Dog','1 year','Male','Bengaluru','A cheerful companion who enjoys walks and playtime.','https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=900&q=80'],
    ['Luna','Cat','6 months','Female','Chennai','A sweet kitten looking for a safe, patient home.','https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80']
  ];
  const insertSamples = db.transaction(() => samplePets.forEach(p => addPet.run(...p)));
  insertSamples();
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(session({
  name: 'pawcare.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 3
  }
}));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny', maxAge: '1h' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = ({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'})[file.mimetype];
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || ''}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Upload a JPG, PNG, or WebP image.'), allowed.includes(file.mimetype));
  }
});

function clean(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}
function required(body, fields) {
  return fields.filter(field => !clean(body[field]));
}
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
function fail(res, message, code = 400) {
  return res.status(code).json({ error: message });
}
function adminOnly(req, res, next) {
  if (!req.session.admin) return fail(res, 'Please log in as an administrator.', 401);
  next();
}
function removeUploaded(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'PawCare API' }));

app.get('/api/pets', (_req, res) => {
  const pets = db.prepare('SELECT id,name,species,age,sex,city,description,image_url FROM pets WHERE available=1 ORDER BY id DESC').all();
  res.json(pets);
});

app.post('/api/reports', upload.single('photo'), (req, res) => {
  const b = req.body;
  const missing = required(b, ['name','email','location','animal','issue','details']);
  if (missing.length) { removeUploaded(req.file); return fail(res, 'Please complete all required report fields.'); }
  if (!validEmail(clean(b.email, 254))) { removeUploaded(req.file); return fail(res, 'Enter a valid email address.'); }
  if (!['Dog','Cat','Other'].includes(b.animal)) { removeUploaded(req.file); return fail(res, 'Choose a valid animal type.'); }
  if (!['Injured or sick','Abandoned','Needs food or water','Other'].includes(b.issue)) { removeUploaded(req.file); return fail(res, 'Choose a valid issue type.'); }
  const photo = req.file ? `/uploads/${path.basename(req.file.filename)}` : null;
  const result = db.prepare(`INSERT INTO reports (name,email,location,animal,issue,details,photo)
    VALUES (?,?,?,?,?,?,?)`).run(clean(b.name,100), clean(b.email,254), clean(b.location,300), b.animal, b.issue, clean(b.details,1500), photo);
  res.status(201).json({ message: 'Thank you. Your report has been received.', id: result.lastInsertRowid });
});

app.post('/api/adoption-requests', (req, res) => {
  const b = req.body;
  if (required(b, ['petId','name','email','phone','housing','message']).length) return fail(res, 'Please complete all required fields.');
  if (!validEmail(clean(b.email,254))) return fail(res, 'Enter a valid email address.');
  const pet = db.prepare('SELECT id FROM pets WHERE id=? AND available=1').get(Number(b.petId));
  if (!pet) return fail(res, 'That pet is no longer listed.', 404);
  const result = db.prepare(`INSERT INTO adoption_requests (pet_id,name,email,phone,housing,message)
    VALUES (?,?,?,?,?,?)`).run(Number(b.petId),clean(b.name,100),clean(b.email,254),clean(b.phone,30),clean(b.housing,100),clean(b.message,1200));
  res.status(201).json({ message: 'Your adoption enquiry has been sent.', id: result.lastInsertRowid });
});

app.post('/api/volunteers', (req, res) => {
  const b = req.body;
  if (required(b, ['name','email','phone','city','availability','skills']).length) return fail(res, 'Please complete all required fields.');
  if (!validEmail(clean(b.email,254))) return fail(res, 'Enter a valid email address.');
  const result = db.prepare(`INSERT INTO volunteers (name,email,phone,city,availability,skills)
    VALUES (?,?,?,?,?,?)`).run(clean(b.name,100),clean(b.email,254),clean(b.phone,30),clean(b.city,120),clean(b.availability,100),clean(b.skills,1000));
  res.status(201).json({ message: 'Thank you for offering to volunteer. We have received your application.', id: result.lastInsertRowid });
});

app.post('/api/donations', (req, res) => {
  const b = req.body;
  if (required(b, ['name','email','amount','purpose']).length) return fail(res, 'Please complete all required fields.');
  if (!validEmail(clean(b.email,254))) return fail(res, 'Enter a valid email address.');
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount < 50 || amount > 100000) return fail(res, 'Enter a pledge between ₹50 and ₹1,00,000.');
  if (!['Food','Medical care','Shelter','Where needed most'].includes(b.purpose)) return fail(res, 'Choose a valid donation purpose.');
  const result = db.prepare(`INSERT INTO donation_pledges (name,email,amount,purpose) VALUES (?,?,?,?)`)
    .run(clean(b.name,100),clean(b.email,254),amount,b.purpose);
  res.status(201).json({ message: `Your ₹${amount} pledge has been recorded. This demo does not collect payment.`, id: result.lastInsertRowid });
});

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res) => {
  const username = clean(req.body.username, 100);
  const password = String(req.body.password || '');
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (!hash || username !== expectedUser || !(await bcrypt.compare(password, hash))) {
    return fail(res, 'Login failed. Check credentials and ensure an admin password hash is configured.', 401);
  }
  req.session.regenerate(err => {
    if (err) return fail(res, 'Could not start a secure session.', 500);
    req.session.admin = true;
    res.json({ message: 'Logged in successfully.' });
  });
});
app.post('/api/admin/logout', adminOnly, (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});
app.get('/api/admin/me', (req, res) => res.json({ authenticated: Boolean(req.session.admin) }));

app.get('/api/admin/dashboard', adminOnly, (_req, res) => {
  res.json({
    reports: db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 100').all(),
    adoptionRequests: db.prepare(`SELECT a.*, p.name AS pet_name FROM adoption_requests a JOIN pets p ON p.id=a.pet_id ORDER BY a.id DESC LIMIT 100`).all(),
    volunteers: db.prepare('SELECT * FROM volunteers ORDER BY id DESC LIMIT 100').all(),
    donations: db.prepare('SELECT * FROM donation_pledges ORDER BY id DESC LIMIT 100').all(),
    pets: db.prepare('SELECT * FROM pets ORDER BY id DESC').all()
  });
});
app.patch('/api/admin/reports/:id', adminOnly, (req, res) => {
  const allowed = ['New','In progress','Resolved','Closed'];
  if (!allowed.includes(req.body.status)) return fail(res, 'Invalid report status.');
  const result = db.prepare('UPDATE reports SET status=? WHERE id=?').run(req.body.status, Number(req.params.id));
  if (!result.changes) return fail(res, 'Report not found.', 404);
  res.json({ message: 'Report status updated.' });
});
app.patch('/api/admin/adoption-requests/:id', adminOnly, (req, res) => {
  const allowed = ['New','Contacted','Approved','Declined'];
  if (!allowed.includes(req.body.status)) return fail(res, 'Invalid adoption status.');
  const result = db.prepare('UPDATE adoption_requests SET status=? WHERE id=?').run(req.body.status, Number(req.params.id));
  if (!result.changes) return fail(res, 'Request not found.', 404);
  res.json({ message: 'Adoption request updated.' });
});
app.post('/api/admin/pets', adminOnly, (req, res) => {
  const b = req.body;
  if (required(b, ['name','species','age','sex','city','description','imageUrl']).length) return fail(res, 'Complete all pet fields.');
  if (!['Dog','Cat'].includes(b.species)) return fail(res, 'Species must be Dog or Cat.');
  if (!/^https:\/\/.+/i.test(b.imageUrl)) return fail(res, 'Image URL must start with https://');
  const result = db.prepare(`INSERT INTO pets (name,species,age,sex,city,description,image_url)
    VALUES (?,?,?,?,?,?,?)`).run(clean(b.name,80),b.species,clean(b.age,60),clean(b.sex,30),clean(b.city,120),clean(b.description,500),clean(b.imageUrl,1000));
  res.status(201).json({ message: 'Pet listing added.', id: result.lastInsertRowid });
});
app.patch('/api/admin/pets/:id', adminOnly, (req, res) => {
  const result = db.prepare('UPDATE pets SET available=? WHERE id=?').run(req.body.available ? 1 : 0, Number(req.params.id));
  if (!result.changes) return fail(res, 'Pet not found.', 404);
  res.json({ message: 'Pet listing updated.' });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return fail(res, err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Photo upload failed.');
  if (err) return fail(res, err.message || 'Unexpected server error.');
  res.status(500).json({ error: 'Unexpected server error.' });
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`PawCare running at http://localhost:${PORT}`));
