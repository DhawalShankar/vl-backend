# VartaLang Backend 🌉

The backend API and real-time server powering **VartaLang** — India's language exchange and vernacular jobs platform. This service handles authentication, language-exchange matching, real-time chat, the jobs board, notifications, and admin moderation for the [VartaLang frontend](https://vartalang.in).

> **Status:** In production, running live for several months.
> **Confidential:** This is a private repository. All code, architecture, and business logic described here are proprietary to Cosmo India Prakashan and are not open source.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM / `import` syntax) |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Real-time | Socket.IO |
| Auth | JWT (`jsonwebtoken`) + bcrypt (local auth), Google OAuth (access token verification) |
| Scheduled Jobs | `node-cron` |
| Hosting (assumed) | Node server (Render/Railway/VPS) + MongoDB Atlas |

---

## 🗂️ Project Structure

```
src/
├── controllers/
│   ├── admin.controller.js         # Reports, job moderation, platform stats
│   ├── auth.controller.js          # Signup/login (local + Google), profile
│   ├── chat.controller.js          # Messaging, block/unblock, delete, report
│   ├── job.controller.js           # Jobs board CRUD, salary, views, expiry
│   ├── match.controller.js         # Swipe-based matching, mutual match → chat
│   └── notification.controller.js  # In-app notifications
├── middlewares/
│   ├── auth.middleware.js          # JWT verification (protect)
│   └── admin.middleware.js         # Admin-only route guard
├── models/
│   ├── User.js
│   ├── Chat.js
│   ├── Match.js
│   ├── Notification.js
│   ├── Report.js
│   └── Job.js
├── routes/
│   ├── auth.routes.js
│   ├── match.routes.js
│   ├── chat.routes.js
│   ├── job.routes.js
│   ├── notification.routes.js
│   └── admin.routes.js
├── utils/
│   └── jobScheduler.js             # Cron jobs for job expiry & cleanup
├── server.js                       # App entry point
└── socket.js                       # Socket.IO setup & auth
```

*(Routes documentation below is provisional and will be finalized once route files are reviewed.)*

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (Atlas or local instance)
- Google OAuth Client ID (for Google sign-in verification)

### Installation
```bash
git clone <repo-url>
cd vl-backend
npm install
```

### Environment Variables
Create a `.env` file in the project root:

```env
PORT=4000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_random_secret_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

### Run the server
```bash
node server.js
# or with nodemon for development
npx nodemon server.js
```

The API will be available at `http://localhost:4000`, and Socket.IO will be attached to the same HTTP server.

---

## 🔐 Authentication

- **Local auth:** email + password, hashed with `bcrypt`. JWT issued on signup/login, valid for 7 days.
- **Google auth:** frontend sends a Google access token; backend verifies it against Google's `userinfo` endpoint and matches the email before issuing a JWT (valid 30 days).
- **Route protection:** `auth.middleware.js` (`protect`) reads the `Authorization: Bearer <token>` header, verifies the JWT, and attaches `req.user.userId` to the request.
- **Admin protection:** `admin.middleware.js` (`adminOnly`) additionally checks that the authenticated user's email matches the hardcoded admin account (`cosmoindiaprakashan@gmail.com`).

---

## 🌐 API Overview

Base routes mounted in `server.js`:

| Prefix | Controller | Purpose |
|---|---|---|
| `/auth` | `auth.controller.js` | Signup, login, Google auth, profile management |
| `/matches` | `match.controller.js` | Swipe/match system for language exchange partners |
| `/chats` | `chat.controller.js` | Messaging, blocking, reporting, deleting chats |
| `/jobs` | `job.controller.js` | Jobs board — post, browse, filter, manage listings |
| `/notifications` | `notification.controller.js` | In-app notification feed |
| `/admin` | `admin.controller.js` | Admin dashboard (reports, stats, job/user moderation) |

### Full Endpoint Reference

**Auth — `/auth`**
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | Public | Email/password signup |
| POST | `/login` | Public | Email/password login |
| GET | `/me` | Protected | Get current user profile |
| PUT | `/update-profile` | Protected | Update current user's profile |
| POST | `/google-signup` | Public | Signup via Google access token |
| POST | `/google-login` | Public | Login via Google access token |
| GET | `/user/:userId` | Protected | Get any user's public profile by ID |

**Matches — `/matches`**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/potential` | Protected | Get up to 20 potential language-exchange matches |
| POST | `/swipe` | Protected | Like or skip a potential match |
| GET | `/my-matches` | Protected | List all matches (pending/accepted/rejected) |
| POST | `/:matchId/accept` | Protected | Accept a pending match request |
| POST | `/:matchId/reject` | Protected | Reject a pending match request |

**Chats — `/chats`**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Protected | List current user's chats |
| GET | `/:chatId` | Protected | Get messages for a chat (marks as read) |
| POST | `/:chatId/message` | Protected | Send a message |
| POST | `/:chatId/block` | Protected | Block the other participant |
| POST | `/:chatId/unblock` | Protected | Unblock the other participant |
| DELETE | `/:chatId` | Protected | Delete chat (soft delete until both delete) |
| POST | `/:chatId/report` | Protected | Report the other participant |

**Jobs — `/jobs`**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Public | Job board stats (total/active) |
| GET | `/listings` | Public | Browse/filter active job listings |
| GET | `/languages` | Public | Distinct languages with active jobs |
| GET | `/:id` | Public | Get single job by ID |
| POST | `/:id/view` | Public | Increment job view counter |
| POST | `/listings` | Protected | Create a new job listing |
| DELETE | `/:id` | Protected | Delete own job listing |
| GET | `/my/jobs` | Protected | Get current user's posted jobs |
| POST | `/mark-expired` | Public / Cron | Manually trigger expiry marking |

> Note: `/my/jobs` is defined after `/:id` in code but registered before it's reachable as a conflicting param — route order intentionally places specific paths correctly to avoid `:id` swallowing `/my/jobs`.

**Notifications — `/notifications`**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Protected | Get current user's notifications |
| GET | `/unread-count` | Protected | Get unread notification count |
| DELETE | `/messages/all` | Protected | Clear all notifications (auto-rejects pending matches) |
| DELETE | `/:notificationId` | Protected | Delete a single notification |

**Admin — `/admin`** *(all routes except `/check` require `adminOnly`)*
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check` | Protected | Check if current user is admin |
| GET | `/stats` | Admin | Platform-wide stats |
| GET | `/jobs` | Admin | List all jobs (incl. expired) |
| GET | `/users` | Admin | List all users (max 100) |
| GET | `/reports` | Admin | List all abuse reports |
| GET | `/reports/:reportId` | Admin | Get single report with full chat context |
| DELETE | `/reports/:reportId` | Admin | Delete/resolve a report |
| DELETE | `/reports/bulk/all` | Admin | ⚠️ Bulk-delete all reports |
| PUT | `/jobs/:jobId/extend` | Admin | Extend a job's expiry by N days |
| DELETE | `/jobs/:jobId` | Admin | Delete any job |

### Core Features by Module

**Matching (`/matches`)**
- Finds potential language-exchange partners based on mutual language fit (what you know vs. what they want to learn, and vice versa).
- Swipe actions (`like` / `skip`) create a `Match` document.
- A mutual `like` (or accepting a pending request) automatically creates a `Chat` and fires notifications to both users.
- Pending match requests auto-expire after 7 days (MongoDB TTL index).

**Chat (`/chats`)**
- Real-time 1-on-1 messaging via Socket.IO, persisted in MongoDB.
- Read receipts, typing/online status (via socket events), block/unblock, and per-user soft delete — a chat is only permanently deleted once **both** participants delete it.
- Reporting a user creates a `Report` document tied to the chat for admin review.

**Jobs Board (`/jobs`)**
- Employers can post one active job at a time (enforced server-side), free for 7 days.
- Supports salary range, currency, employment type, remote flag, and rich filtering (language, job type, search).
- Views counter, automatic expiry, and a distinct-languages endpoint for filter UIs.
- A daily cron job (`jobScheduler.js`) marks expired jobs, and a weekly cron job purges jobs expired for 30+ days.

**Notifications (`/notifications`)**
- Types: `match_request`, `match_accepted`, `match_rejected`, `new_message`.
- Delivered both via REST (fetch/count/delete) and pushed live over Socket.IO to the recipient's personal room (`user_<id>`).
- "Clear all" also auto-rejects any still-pending match requests to avoid orphaned notifications.

**Admin (`/admin`)**
- Single hardcoded admin account (`cosmoindiaprakashan@gmail.com`).
- View/delete abuse reports, view full report context (chat + participants), moderate any job listing (extend/delete), platform-wide stats (users, jobs, matches, chats), and list all users.

---

## 🔌 Real-Time (Socket.IO)

- Socket connections are authenticated via JWT passed in `socket.handshake.auth.token`.
- On connect, each user automatically joins a personal room `user_<userId>` (used for notification pushes).
- Chat-specific events use rooms named `chat_<chatId>`, joined/left via `join_chat` / `leave_chat` events.
- Key emitted events: `receive_message`, `messages_read`, `user_blocked`, `user_unblocked`, `new_message_notification`.

---

## ⏰ Scheduled Jobs (Cron)

Defined in `utils/jobScheduler.js`, initialized on server start:

| Job | Schedule | Purpose |
|---|---|---|
| Job expiry check | Daily at midnight | Marks jobs past their `expiryDate` as `expired` |
| Job cleanup | Weekly, Sunday 2 AM | Permanently deletes jobs expired for 30+ days |

---

## 🗄️ Data Models (Summary)

- **User** — profile, languages known/to-learn, role (`learner`/`teacher`), auth provider, stats (connections, courses completed, hours learned).
- **Chat** — participants, embedded messages array, `blockedBy`/`deletedBy` arrays for soft-delete/block logic.
- **Match** — `user1`/`user2`, status (`pending`/`accepted`/`rejected`), TTL auto-expiry for pending requests.
- **Notification** — recipient/sender, type, optional `matchId`/`chatId` reference, read flag.
- **Report** — reporter, reported user, associated chat, reason.
- **Job** — full job listing schema with salary fields, expiry/status tracking, view counter, text search index.

---

## 🛡️ Security Notes

- Passwords hashed with `bcrypt` before storage; never returned in API responses (`.select("-password")`).
- CORS restricted to an explicit allow-list of frontend origins (both for Express and Socket.IO).
- JWT-based stateless auth on both REST and WebSocket connections.
- Admin access gated by a single hardcoded email check — consider migrating to a role field on `User` as the platform grows.

---

## 📌 Roadmap / Known Gaps

- Rate limiting and CSRF protection not yet implemented.
- Payment integration (Razorpay) for premium courses — not yet in this repo.
- Consider moving the admin check from a hardcoded email to a proper `role` field for multi-admin support.

---

## 📄 License & Ownership

© Cosmo India Prakashan. All rights reserved.

This is proprietary, closed-source software owned and operated by **Cosmo India Prakashan** (cosmoindiaprakashan.in). No part of this codebase may be copied, distributed, modified, or reused without explicit written permission from the owner. This repository is private and not licensed for external use.

---

**VartaLang Backend** — powering real economic opportunity through language, one match and one job at a time.
