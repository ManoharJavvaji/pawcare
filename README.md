# PawCare — Be Their Hope. Be Their Home.

A full-stack web development course project for reporting street animals, finding local help, pet adoption enquiries, volunteer applications, donation pledges, rescue stories, and a protected admin dashboard.

## Tech stack
- HTML5, CSS3, vanilla JavaScript
- Node.js + Express
- SQLite via `better-sqlite3`
- Multer for image uploads
- bcryptjs + express-session for admin login
- Helmet and rate limiting for baseline security

## Requirements
Install Node.js 20 or newer. Check with `node -v` and `npm -v`.

## Run locally
1. Extract this folder.
2. Open a terminal in this folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env`.
5. Set a long random `SESSION_SECRET`.
6. Set your admin password hash:
   ```bash
   npm run set-admin
   ```
   The script asks you to enter a password and writes its bcrypt hash into `.env`.
7. Start the site:
   ```bash
   npm run dev
   ```
8. Open `http://localhost:3000`.

The SQLite database is created automatically in `data/pawcare.db`. Uploaded report photos are saved in `uploads/`.

## Features
- Responsive orange, beige, and cream design
- Seven animal-loving quotes, including a featured hero quote
- Street-animal report form with optional photo upload
- Map searches for nearby animal hospitals and shelters
- Pet adoption listings and adoption enquiries
- Volunteer applications and donation pledges
- Rescue story cards
- Admin login and dashboard to review submissions, change report status, and add pet listings
- Input validation, upload limits, password hashing, session cookies, and basic rate limiting

## Important notes
- The donation form records a pledge only. It does not take money or store card/UPI details.
- Map search links open Google Maps; the site does not claim live partner availability.
- Demo pet profiles and rescue stories are sample content. Replace them with accurate, consented information before public launch.
- For deployment, use HTTPS, a strong `SESSION_SECRET`, secure cookie settings, backups, and a persistent disk for SQLite/uploads. For a high-traffic production site, use a managed database and object storage.
- This is a course-project starter, not a substitute for a professional security review.
