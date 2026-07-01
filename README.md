# ⛏️ Bandhilki SMP Dashboard & Discord Bot

A complete, feature-rich Minecraft Server Status Dashboard, Whitelist Portal, Support Ticket System, and active Discord status/logging bot built for the **Bandhilki Family** and powered by **Team Insane**.

---

## 🚀 Features

### 🖥️ Public Dashboard & Portal
*   **Live Status**: Real-time monitoring of server status, online player count, and ping.
*   **Whitelist Portal**: Public application flow including a dynamic rules and conduct quiz in both English and Hinglish, with auto-verification against Discord roles.
*   **Support Ticket System**: Visitors and players can login via Discord OAuth to create, track, and reply to support tickets.
*   **Events Countdown**: Interactive listing of ongoing, pinned, and upcoming events with automatic time countdowns.
*   **Media Gallery**: Grid layout showing screenshots of community achievements, styled with an interactive lightbox viewer.
*   **Minicraft Minesweeper**: A retro-style, in-browser Minesweeper minigame with Easy/Hard/Insane modes and a global leader board.
*   **Secure Contact Form**: A visitor inquiry form that forwards messages directly to Discord staff channels through a secure backend proxy to prevent CORS issues and protect secret webhook URLs.

### 👮 Staff & Admin Dashboard
*   **Interactive Ticket Center**: View all open, in-progress, pending, or closed tickets. Staff can claim, assign, reply, or resolve tickets with instant Discord notification updates.
*   **Dynamic Team Manager**: Add, update, or remove developers, admins, and moderators directly from the dashboard. Fetches user details (global name, avatars) from Discord's API.
*   **Todo & Task List**: Manage administrative tasks with departments, priorities, and deadlines.
*   **Staff Logs & Activity tracker**: Real-time auditing of actions taken by administrators.
*   **Work Updates Feed**: Post technical work updates (plugins, builds, configurations) to log development progress.
*   **Gallery Image Manager**: Upload, description-update, or delete items shown in the public media section.

---

## 🛠️ Technology Stack
*   **Backend**: Node.js, Express, Discord.js (v14)
*   **Frontend**: Vanilla HTML5, CSS3, Modern JavaScript (responsive design, glassmorphic panels, key animations)
*   **Database**: JSON-based file persistence (`data/tickets.json`) with automated rotational backups (max 12 files) and scheduled intervals.

---

## ⚙️ Environment Variables
Create a `.env` file at the root level and configure the following parameters:

```env
# Discord Bot Credentials
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_REDIRECT_URI=http://localhost:3333/api/auth/discord/callback

# Discord Guild & Role IDs
DISCORD_GUILD_ID=your_server_guild_id
DISCORD_WHITELIST_ROLE_ID=role_id_granted_on_whitelist_approval
DISCORD_STAFF_ROLE_ID=role_id_required_to_access_staff_dashboard

# Logging & Monitoring Discord Channel IDs
MINECRAFT_STATUS_CHANNEL_ID=channel_id_for_live_status_embeds
WHITELIST_LOG_CHANNEL_ID=channel_id_for_approval_notifications
TICKET_LOG_CHANNEL_ID=channel_id_for_support_ticket_notifications
EVENT_CHANNEL_ID=channel_id_for_events_announcements
STAFF_LOG_CHANNEL_ID=channel_id_for_admin_actions_logging
WORK_UPDATE_CHANNEL_ID=channel_id_for_development_updates

# Secure Contact Form Webhook
CONTACT_WEBHOOK_URL=discord_webhook_url_for_contact_messages

# Web Server Options
PORT=3333
```

---

## 📦 Installation & Setup

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd bandhilkismp-main
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Deploy Slash Commands**:
    Ensure `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are configured in `.env`, then run:
    ```bash
    npm run deploy
    ```

4.  **Start the Application**:
    ```bash
    npm start
    ```
    The web server will run on port `3333` (accessible at `http://localhost:3333`).

---

## 📁 Project Directory Structure
```
├── data/                      # Persisted JSON states, databases, and rotational backups
├── public/                    # Frontend HTML, CSS, JavaScript, assets, and styling
│   ├── contact.html           # Secure contact form
│   ├── developers.html        # Team list loader
│   ├── events.html            # Event listing
│   ├── index.html             # Main landing portal
│   └── style.css              # Core global styles & custom theme variables
├── .env                       # Environment configuration
├── config.json                # Status bot channel & monitoring configuration
├── index.js                   # Main application server, Discord bot logic, and Express API routes
└── package.json               # Node packages and start scripts
```

---

## ☁️ Deploying to Render
To deploy this project to [Render](https://render.com) as a Web Service:

1.  **Build Command**:
    ```bash
    npm install
    ```
    *(Optional: If you want to register/update Discord slash commands automatically on every deploy, use `npm install && npm run deploy`)*

2.  **Start Command**:
    ```bash
    npm start
    ```

3.  **Environment Variables**:
    Add all the variables from the **Environment Variables** section in your Render Dashboard under the **Environment** settings. Render automatically supplies the `PORT` variable, and the app will bind to it.

---

## 🛡️ License
This project is licensed under the [MIT License](LICENSE). Built with ❤️ by **Team Insane** for the **Bandhilki Family**.