# ⛏️ Bandhilki SMP Dashboard & Discord Bot

<div align="center">

<img src="https://raw.githubusercontent.com/KAJUKATLIii/bandhilkismp/main/public/lg.png" alt="Bandhilki SMP" width="180">

### A complete Minecraft server management dashboard and Discord bot for the **Bandhilki Family**

**Powered by Team Insane**

</div>

---

## 🚀 Features

### 🖥️ Public Dashboard & Portal

* **Live Server Status** — Real-time monitoring of server status, online player count, and ping.
* **Whitelist Portal** — Public application system with dynamic rules and conduct quizzes in both English and Hinglish.
* **Discord Role Verification** — Automatically verifies Discord roles during the whitelist process.
* **Support Ticket System** — Players can log in with Discord OAuth to create, track, and reply to support tickets.
* **Events Countdown** — Displays ongoing, pinned, and upcoming events with automatic countdown timers.
* **Media Gallery** — Community screenshots displayed in a responsive grid with an interactive lightbox.
* **Minecraft Minesweeper** — Retro-style browser minigame with Easy, Hard, and Insane difficulty levels.
* **Global Leaderboard** — Tracks Minesweeper scores and displays top players.
* **Secure Contact Form** — Sends visitor inquiries directly to Discord staff channels through a secure backend proxy.

---

### 👮 Staff & Admin Dashboard

* **Interactive Ticket Center**

  * View open, in-progress, pending, and closed tickets.
  * Claim and assign tickets.
  * Reply to users.
  * Resolve tickets.
  * Send instant Discord notifications.

* **Dynamic Team Manager**

  * Add developers, administrators, and moderators.
  * Update existing team members.
  * Remove team members.
  * Fetch Discord usernames, global names, and avatars automatically.

* **Todo & Task Management**

  * Create administrative tasks.
  * Organize tasks by department.
  * Set priorities.
  * Add deadlines.

* **Staff Activity Logs**

  * Track administrative actions.
  * Maintain an audit trail of staff activity.
  * Monitor dashboard changes in real time.

* **Work Updates Feed**

  * Post development updates.
  * Document plugin changes.
  * Track builds and configuration work.

* **Gallery Manager**

  * Upload gallery images.
  * Update descriptions.
  * Delete existing gallery items.

---

## 🛠️ Technology Stack

| Component           | Technology                        |
| ------------------- | --------------------------------- |
| Backend             | Node.js, Express                  |
| Discord Integration | Discord.js v14                    |
| Frontend            | HTML5, CSS3, JavaScript           |
| UI                  | Responsive, Glassmorphic Design   |
| Database            | JSON File Persistence             |
| Authentication      | Discord OAuth2                    |
| Server Monitoring   | Minecraft Server Status API       |
| Backups             | Automated Rotational JSON Backups |

### Data Persistence

The project currently uses JSON-based file persistence:

```text
data/
└── tickets.json
```

Automated rotational backups are maintained with a maximum of **12 backup files**.

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
# ==============================
# Discord Bot Credentials
# ==============================

DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_REDIRECT_URI=http://localhost:3333/api/auth/discord/callback


# ==============================
# Discord Guild & Roles
# ==============================

DISCORD_GUILD_ID=your_server_guild_id
DISCORD_WHITELIST_ROLE_ID=role_id_granted_on_whitelist_approval
DISCORD_STAFF_ROLE_ID=role_id_required_to_access_staff_dashboard


# ==============================
# Discord Logging Channels
# ==============================

MINECRAFT_STATUS_CHANNEL_ID=channel_id_for_live_status_embeds
WHITELIST_LOG_CHANNEL_ID=channel_id_for_approval_notifications
TICKET_LOG_CHANNEL_ID=channel_id_for_support_ticket_notifications
EVENT_CHANNEL_ID=channel_id_for_events_announcements
STAFF_LOG_CHANNEL_ID=channel_id_for_admin_actions_logging
WORK_UPDATE_CHANNEL_ID=channel_id_for_development_updates


# ==============================
# Secure Contact Form
# ==============================

CONTACT_WEBHOOK_URL=discord_webhook_url_for_contact_messages


# ==============================
# Web Server
# ==============================

PORT=3333
```

> **Security:** Never commit your `.env` file or Discord bot token to GitHub.

---

## 📦 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bandhilkismp-main
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create your `.env` file and add the required Discord credentials, channel IDs, role IDs, and other configuration values.

### 4. Deploy Discord Slash Commands

After configuring `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`:

```bash
npm run deploy
```

### 5. Start the Application

```bash
npm start
```

The application will run on:

```text
http://localhost:3333
```

---

## 📁 Project Structure

```text
bandhilkismp/
│
├── data/
│   ├── tickets.json
│   └── backups/
│
├── public/
│   ├── contact.html
│   ├── developers.html
│   ├── events.html
│   ├── index.html
│   ├── style.css
│   └── ...
│
├── .env
├── config.json
├── index.js
├── package.json
└── README.md
```

### Important Files

| File                     | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `index.js`               | Main Express server, Discord bot, APIs, and backend logic |
| `config.json`            | Server monitoring and bot configuration                   |
| `package.json`           | Dependencies and npm scripts                              |
| `.env`                   | Private environment variables                             |
| `public/index.html`      | Main website dashboard                                    |
| `public/contact.html`    | Contact form                                              |
| `public/developers.html` | Team/developers page                                      |
| `public/events.html`     | Events page                                               |
| `public/style.css`       | Global website styling                                    |
| `data/tickets.json`      | Persistent ticket data                                    |

---

## ☁️ Deploying to Render

The project can be deployed as a **Web Service** on [Render](https://render.com).

### Build Command

```bash
npm install
```

Alternatively, if you want to deploy/update Discord slash commands automatically:

```bash
npm install && npm run deploy
```

### Start Command

```bash
npm start
```

### Environment Variables

Add all required variables from the `.env` section to the **Environment Variables** section in your Render service.

Render automatically provides the `PORT` environment variable, so your application should use the provided port when deployed.

---

## 🔐 Security Recommendations

For production deployments:

* Never commit `.env` to Git.
* Never expose `DISCORD_TOKEN`.
* Never expose `DISCORD_CLIENT_SECRET`.
* Keep Discord webhook URLs private.
* Validate Discord OAuth callbacks server-side.
* Verify staff roles before allowing access to admin APIs.
* Validate and sanitize ticket/contact form input.
* Restrict administrative API endpoints to authorized users.
* Keep automated backups outside publicly accessible directories.

Add this to `.gitignore`:

```gitignore
.env
node_modules/
data/backups/
*.log
```

---

## 📊 Discord Integration

The dashboard communicates with Discord for:

* 🔐 Discord OAuth authentication
* 👮 Staff role verification
* ✅ Whitelist approval
* 🎫 Ticket notifications
* 📢 Event notifications
* 📡 Minecraft server status updates
* 📝 Staff activity logging
* 🛠️ Development/work updates
* 📩 Contact form notifications

---

## 🎮 Bandhilki SMP

**Bandhilki SMP** is a Minecraft community operated by the **Bandhilki Family** and powered by **Team Insane**.

The dashboard provides a centralized platform for:

> **Minecraft Server Status • Whitelist Applications • Support • Events • Community Media • Staff Management**

---

## 📄 License

This project is licensed under the **MIT License**.

See the [`LICENSE`](LICENSE) file for more information.

---

<div align="center">

### ❤️ Built with ❤️ by Team Insane

**Bandhilki Family**

⛏️ **Bandhilki SMP**

</div>
