/**
 * Minecraft Server Status Bot + Dashboard
 * JAVA ONLY
 */



require("dotenv").config();
const db = require("./db.js");
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const util = require("minecraft-server-util");
const express = require("express");
const chalk = require("chalk");
const { createCanvas } = require("canvas");
const { Chart } = require("chart.js/auto");
const path = require("path");

const config = require("./config.json");

const app = express();
app.use(express.json());
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

const serverData = new Map();
const playerHistory = new Map();
const sessions = new Map();
const userStatuses = new Map();
const tickets = new Map();
const staffTodos = [];
const staffLogs = [];
const activityLogs = [];
const staffWorkUpdates = [];
const gallery = [];
const team = [];
const hallEntries = [];
const contracts = [];
const staffRoleCache = new Map(); // discordUserId → { isStaff, ts }
let ticketCounter = 1000;
let todoCounter = 1;
let workUpdateCounter = 1;
let galleryCounter = 1;
let contractCounter = 1000;

// ---- Persistence (simple JSON file) ----
const fs = require('fs');

function seedFileIfMissing(customPath, repoFileName) {
  if (customPath && !fs.existsSync(customPath)) {
    const repoPath = path.join(__dirname, 'data', repoFileName);
    if (fs.existsSync(repoPath)) {
      try {
        const dir = path.dirname(customPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(repoPath, customPath);
        console.log(`[Persistence Seeding] Seeded ${customPath} from ${repoPath}`);
      } catch (err) {
        console.error(`[Persistence Seeding] Failed to seed ${customPath}: ${err.message}`);
      }
    }
  }
}

const PERSIST_PATH = process.env.PERSIST_PATH || path.join(__dirname, 'data', 'tickets.json');
if (process.env.PERSIST_PATH) {
  seedFileIfMissing(PERSIST_PATH, 'tickets.json');
}
const TICKETS_BACKUP_DIR = process.env.TICKETS_BACKUP_DIR || path.join(__dirname, 'data', 'tickets-backups');
// Backup every 50 minutes (cap to avoid too-frequent IO)
const TICKETS_BACKUP_INTERVAL_MS = parseInt(process.env.TICKETS_BACKUP_INTERVAL_MS || String(50 * 60 * 1000), 10);
const TICKETS_BACKUP_MAX_FILES = parseInt(process.env.TICKETS_BACKUP_MAX_FILES || '12', 10); // ~10h at 50m interval


function ensurePersistDir() {
  const dir = path.dirname(PERSIST_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function getCounterVal(name, defaultVal) {
  try {
    const c = await db.Counter.findOne({ name });
    return c ? c.value : defaultVal;
  } catch (err) {
    console.error(`Failed to get counter ${name}:`, err.message);
    return defaultVal;
  }
}

async function setCounterVal(name, value) {
  try {
    await db.Counter.updateOne({ name }, { value }, { upsert: true });
  } catch (err) {
    console.error(`Failed to set counter ${name}:`, err.message);
  }
}

async function syncGalleryToDB() {
  try {
    await db.GalleryItem.deleteMany({});
    if (gallery.length > 0) {
      await db.GalleryItem.insertMany(gallery);
    }
  } catch (err) {
    console.error("Failed to sync default gallery to MongoDB", err.message);
  }
}

async function syncTeamToDB() {
  try {
    await db.TeamMember.deleteMany({});
    if (team.length > 0) {
      await db.TeamMember.insertMany(team);
    }
  } catch (err) {
    console.error("Failed to sync default team to MongoDB", err.message);
  }
}

async function loadPersistedState() {
  try {
    if (db.isConnected()) {
      const dbTickets = await db.Ticket.find({});
      tickets.clear();
      for (const t of dbTickets) {
        const ticketObj = t.toObject();
        // Ensure all required fields exist to prevent frontend rendering crash
        if (!ticketObj.replies) ticketObj.replies = [];
        if (!ticketObj.description) ticketObj.description = t.description || '';
        if (!ticketObj.createdBy) {
          ticketObj.createdBy = {
            id: t.discordUserId || '',
            username: t.creatorName || 'Unknown Player',
            avatar: null
          };
        }
        tickets.set(String(t.id), ticketObj);
      }

      const dbUserStatuses = await db.UserStatus.find({});
      userStatuses.clear();
      for (const s of dbUserStatuses) {
        userStatuses.set(s.discordUserId, s.toObject());
      }

      const dbTodos = await db.StaffTodo.find({});
      staffTodos.length = 0;
      staffTodos.push(...dbTodos.map(x => x.toObject()));

      const dbStaffLogs = await db.StaffLog.find({});
      staffLogs.length = 0;
      staffLogs.push(...dbStaffLogs.map(x => x.toObject()));

      const dbActivityLogs = await db.ActivityLog.find({});
      activityLogs.length = 0;
      activityLogs.push(...dbActivityLogs.map(x => x.toObject()));

      const dbWorkUpdates = await db.StaffWorkUpdate.find({});
      staffWorkUpdates.length = 0;
      staffWorkUpdates.push(...dbWorkUpdates.map(x => x.toObject()));

      const dbGallery = await db.GalleryItem.find({});
      gallery.length = 0;
      if (dbGallery.length > 0) {
        gallery.push(...dbGallery.map(x => x.toObject()));
      } else {
        gallery.push(
          { id: 1, url: '/g1.png', description: 'Gallery Image 1', ts: Date.now() },
          { id: 2, url: '/g2.png', description: 'Gallery Image 2', ts: Date.now() },
          { id: 3, url: '/g3.png', description: 'Gallery Image 3', ts: Date.now() },
          { id: 4, url: '/g4.png', description: 'Gallery Image 4', ts: Date.now() }
        );
        galleryCounter = 5;
        await syncGalleryToDB();
      }

      const dbTeam = await db.TeamMember.find({}).sort({ position: 1 });
      team.length = 0;
      if (dbTeam.length > 0) {
        team.push(...dbTeam.map(x => x.toObject()));
      }

      const dbHallEntries = await db.HallEntry.find({});
      hallEntries.length = 0;
      hallEntries.push(...dbHallEntries.map(x => x.toObject()));

      const dbContracts = await db.Contract.find({});
      contracts.length = 0;
      contracts.push(...dbContracts.map(x => x.toObject()));

      ticketCounter = await getCounterVal("ticketCounter", 1000);
      todoCounter = await getCounterVal("todoCounter", 1);
      workUpdateCounter = await getCounterVal("workUpdateCounter", 1);
      galleryCounter = await getCounterVal("galleryCounter", 5);
      contractCounter = await getCounterVal("contractCounter", 1000);

      log.info(`Loaded persisted ticket state from MongoDB`);
      return;
    }

    if (!fs.existsSync(PERSIST_PATH)) {
      // First boot: populate defaults and save immediately
      gallery.length = 0;
      gallery.push(
        { id: 1, url: '/g1.png', description: 'Gallery Image 1', ts: Date.now() },
        { id: 2, url: '/g2.png', description: 'Gallery Image 2', ts: Date.now() },
        { id: 3, url: '/g3.png', description: 'Gallery Image 3', ts: Date.now() },
        { id: 4, url: '/g4.png', description: 'Gallery Image 4', ts: Date.now() }
      );
      galleryCounter = 5;
      savePersistedState();
      return;
    }
    const raw = fs.readFileSync(PERSIST_PATH, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);

    // tickets: Map stored as array of [id, ticket]
    if (Array.isArray(parsed.tickets)) {
      tickets.clear();
      for (const [id, t] of parsed.tickets) tickets.set(id, t);
    }
    if (Array.isArray(parsed.userStatuses)) {
      userStatuses.clear();
      for (const [id, s] of parsed.userStatuses) userStatuses.set(id, s);
    }
    if (Array.isArray(parsed.hallEntries)) {
      hallEntries.length = 0;
      hallEntries.push(...parsed.hallEntries);
    }
    if (Array.isArray(parsed.contracts)) {
      contracts.length = 0;
      contracts.push(...parsed.contracts);
    }
    if (Array.isArray(parsed.staffTodos)) {
      staffTodos.length = 0;
      staffTodos.push(...parsed.staffTodos);
    }
    if (Array.isArray(parsed.staffLogs)) {
      staffLogs.length = 0;
      staffLogs.push(...parsed.staffLogs);
    }
    if (Array.isArray(parsed.activityLogs)) {
      activityLogs.length = 0;
      activityLogs.push(...parsed.activityLogs);
    }
    if (Array.isArray(parsed.staffWorkUpdates)) {
      staffWorkUpdates.length = 0;
      staffWorkUpdates.push(...parsed.staffWorkUpdates);
    }
    if (Array.isArray(parsed.gallery)) {
      gallery.length = 0;
      gallery.push(...parsed.gallery);
    } else {
      gallery.length = 0;
      gallery.push(
        { id: 1, url: '/g1.png', description: 'Gallery Image 1', ts: Date.now() },
        { id: 2, url: '/g2.png', description: 'Gallery Image 2', ts: Date.now() },
        { id: 3, url: '/g3.png', description: 'Gallery Image 3', ts: Date.now() },
        { id: 4, url: '/g4.png', description: 'Gallery Image 4', ts: Date.now() }
      );
      galleryCounter = 5;
    }
    if (Array.isArray(parsed.team)) {
      team.length = 0;
      team.push(...parsed.team);
      let modified = false;
      const removeIds = ['team_shreeman_community', 'team_insane_community', '155149108183695360'];
      for (const id of removeIds) {
        const idx = team.findIndex(m => m.discordId === id);
        if (idx !== -1) {
          team.splice(idx, 1);
          modified = true;
        }
      }
      if (modified) {
        savePersistedState();
      }
    } else {
      team.length = 0;
    }

    if (typeof parsed.ticketCounter === 'number') ticketCounter = parsed.ticketCounter;
    if (typeof parsed.todoCounter === 'number') todoCounter = parsed.todoCounter;
    if (typeof parsed.workUpdateCounter === 'number') workUpdateCounter = parsed.workUpdateCounter;
    if (typeof parsed.galleryCounter === 'number') {
      galleryCounter = parsed.galleryCounter;
    } else if (!parsed.gallery) {
      galleryCounter = 5;
    }
    if (typeof parsed.contractCounter === 'number') contractCounter = parsed.contractCounter;

    log.info(`Loaded persisted ticket state from ${PERSIST_PATH}`);
  } catch (e) {
    log.error(`Failed to load persisted ticket state: ${e.message}`);
  }
}

function createTicketsBackup() {
  try {
    if (db.isConnected()) return;
    ensurePersistDir();
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(TICKETS_BACKUP_DIR)) fs.mkdirSync(TICKETS_BACKUP_DIR, { recursive: true });

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-'); // sortable
    const backupPath = path.join(TICKETS_BACKUP_DIR, `tickets-${stamp}.json`);

    if (fs.existsSync(PERSIST_PATH)) {
      fs.copyFileSync(PERSIST_PATH, backupPath);

      // rotation: keep newest N backups
      const files = fs.readdirSync(TICKETS_BACKUP_DIR)
        .filter(f => /^tickets-.*\.json$/.test(f))
        .map(f => ({ f, t: fs.statSync(path.join(TICKETS_BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);

      const keep = TICKETS_BACKUP_MAX_FILES;
      for (let i = keep; i < files.length; i++) {
        fs.unlinkSync(path.join(TICKETS_BACKUP_DIR, files[i].f));
      }

      log.success(`Tickets backup created: ${backupPath}`);
    }
  } catch (e) {
    log.error(`Failed to create tickets backup: ${e.message}`);
  }
}

async function savePersistedState() {
  try {
    if (db.isConnected()) {
      // 1. Sync tickets
      const ticketOps = [];
      for (const [id, t] of tickets.entries()) {
        ticketOps.push({
          updateOne: {
            filter: { id: String(id) },
            update: { $set: t },
            upsert: true
          }
        });
      }
      if (ticketOps.length > 0) {
        await db.Ticket.bulkWrite(ticketOps);
      }
      const currentTicketIds = [...tickets.keys()].map(String);
      await db.Ticket.deleteMany({ id: { $nin: currentTicketIds } });

      // 2. Sync userStatuses
      const userStatusOps = [];
      for (const [discordUserId, s] of userStatuses.entries()) {
        userStatusOps.push({
          updateOne: {
            filter: { discordUserId },
            update: { $set: s },
            upsert: true
          }
        });
      }
      if (userStatusOps.length > 0) {
        await db.UserStatus.bulkWrite(userStatusOps);
      }
      const currentUserStatusIds = [...userStatuses.keys()];
      await db.UserStatus.deleteMany({ discordUserId: { $nin: currentUserStatusIds } });

      // 3. Sync staffTodos
      const todoOps = staffTodos.map(todo => ({
        updateOne: {
          filter: { id: Number(todo.id) },
          update: { $set: todo },
          upsert: true
        }
      }));
      if (todoOps.length > 0) {
        await db.StaffTodo.bulkWrite(todoOps);
      }
      const currentTodoIds = staffTodos.map(x => Number(x.id));
      await db.StaffTodo.deleteMany({ id: { $nin: currentTodoIds } });

      // 4. Sync staffLogs
      await db.StaffLog.deleteMany({});
      if (staffLogs.length > 0) {
        await db.StaffLog.insertMany(staffLogs);
      }

      // 5. Sync activityLogs
      await db.ActivityLog.deleteMany({});
      if (activityLogs.length > 0) {
        await db.ActivityLog.insertMany(activityLogs);
      }

      // 6. Sync staffWorkUpdates
      const workOps = staffWorkUpdates.map(w => ({
        updateOne: {
          filter: { id: Number(w.id) },
          update: { $set: w },
          upsert: true
        }
      }));
      if (workOps.length > 0) {
        await db.StaffWorkUpdate.bulkWrite(workOps);
      }
      const currentWorkIds = staffWorkUpdates.map(x => Number(x.id));
      await db.StaffWorkUpdate.deleteMany({ id: { $nin: currentWorkIds } });

      // 7. Sync gallery
      const galleryOps = gallery.map(g => ({
        updateOne: {
          filter: { id: Number(g.id) },
          update: { $set: g },
          upsert: true
        }
      }));
      if (galleryOps.length > 0) {
        await db.GalleryItem.bulkWrite(galleryOps);
      }
      const currentGalleryIds = gallery.map(x => Number(x.id));
      await db.GalleryItem.deleteMany({ id: { $nin: currentGalleryIds } });

      // 8. Sync team
      const teamOps = team.map((m, idx) => {
        m.position = idx;
        return {
          updateOne: {
            filter: { discordId: m.discordId },
            update: { $set: m },
            upsert: true
          }
        };
      });
      if (teamOps.length > 0) {
        await db.TeamMember.bulkWrite(teamOps);
      }
      const currentTeamIds = team.map(x => x.discordId);
      await db.TeamMember.deleteMany({ discordId: { $nin: currentTeamIds } });

      const hallOps = hallEntries.map(entry => ({
        updateOne: {
          filter: { id: entry.id },
          update: { $set: entry },
          upsert: true
        }
      }));
      if (hallOps.length > 0) {
        await db.HallEntry.bulkWrite(hallOps);
      }
      const currentHallIds = hallEntries.map(x => x.id);
      await db.HallEntry.deleteMany({ id: { $nin: currentHallIds } });

      const contractOps = contracts.map(c => ({
        updateOne: {
          filter: { id: String(c.id) },
          update: { $set: c },
          upsert: true
        }
      }));
      if (contractOps.length > 0) {
        await db.Contract.bulkWrite(contractOps);
      }
      const currentContractIds = contracts.map(x => String(x.id));
      await db.Contract.deleteMany({ id: { $nin: currentContractIds } });

      // 9. Sync counters
      await setCounterVal("ticketCounter", ticketCounter);
      await setCounterVal("todoCounter", todoCounter);
      await setCounterVal("workUpdateCounter", workUpdateCounter);
      await setCounterVal("galleryCounter", galleryCounter);
      await setCounterVal("contractCounter", contractCounter);

      return;
    }

    ensurePersistDir();
    const state = {
      updatedAt: Date.now(),
      tickets: [...tickets.entries()],
      userStatuses: [...userStatuses.entries()],
      staffTodos,
      staffLogs,
      activityLogs,
      staffWorkUpdates,
      gallery,
      team,
      hallEntries,
      contracts,
      ticketCounter,
      todoCounter,
      workUpdateCounter,
      galleryCounter,
      contractCounter
    };
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(state, null, 2), 'utf8');

    // Back up on every write as well (still throttled by interval)
    // to reduce risk of losing the last changes.
    if (!savePersistedState._lastBackupTs || (Date.now() - savePersistedState._lastBackupTs) >= TICKETS_BACKUP_INTERVAL_MS) {
      savePersistedState._lastBackupTs = Date.now();
      createTicketsBackup();
    }
  } catch (e) {
    log.error(`Failed to save persisted ticket state: ${e.message}`);
  }
}



// Start ticket backup timer (ensures backups are created within 50 minutes even if no writes happen)
if (!process.env.MONGODB_URI) {
  ensurePersistDir();
}
if (!global.__ticketsBackupTimerStarted) {
  global.__ticketsBackupTimerStarted = true;
  setInterval(() => createTicketsBackup(), TICKETS_BACKUP_INTERVAL_MS);
}

// Back-compat: if old file exists (tickets-persist.json), migrate once to tickets.json
if (!process.env.MONGODB_URI) {
  if (fs.existsSync(path.join(__dirname, 'data', 'tickets-persist.json')) && !fs.existsSync(path.join(__dirname, 'data', 'tickets.json'))) {
    try {
      const oldRaw = fs.readFileSync(path.join(__dirname, 'data', 'tickets-persist.json'), 'utf8');
      fs.writeFileSync(path.join(__dirname, 'data', 'tickets.json'), oldRaw, 'utf8');
    } catch (e) {
      // ignore migration errors
    }
  }
}

// loadPersistedState() moved to run after `log` is defined.


const WHITELIST_ROLE_ID = process.env.DISCORD_WHITELIST_ROLE_ID || "1510067921899094247";

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || null;
const DISCORD_STAFF_ROLE_ID = process.env.DISCORD_STAFF_ROLE_ID || null; // staff role snowflake

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return null;
}

const MINECRAFT_STATUS_CHANNEL_ID = firstEnv('MINECRAFT_STATUS_CHANNEL_ID', 'SERVER_STATUS_CHANNEL_ID', 'STATUS_CHANNEL_ID');
const WHITELIST_LOG_CHANNEL_ID = firstEnv('WHITELIST_LOG_CHANNEL_ID', 'DISCORD_WHITELIST_CHANNEL_ID', 'WHITELIST_CHANNEL_ID');
const WHITELIST_WEBHOOK_URL = process.env.WHITELIST_WEBHOOK_URL || null;
const TICKET_LOG_CHANNEL_ID = firstEnv('TICKET_LOG_CHANNEL_ID', 'DISCORD_TICKET_LOG_CHANNEL_ID');
const STAFF_LOG_CHANNEL_ID = firstEnv('STAFF_LOG_CHANNEL_ID', 'DISCORD_STAFF_LOG_CHANNEL_ID') || TICKET_LOG_CHANNEL_ID;
const EVENT_CHANNEL_ID = firstEnv('EVENT_CHANNEL_ID', 'EVENTS_CHANNEL_ID', 'DISCORD_EVENTS_CHANNEL_ID');
const WORK_UPDATE_CHANNEL_ID = firstEnv('WORK_UPDATE_CHANNEL_ID') || '1511773337691623704';
const CONTRACT_LOG_CHANNEL_ID = firstEnv('CONTRACT_LOG_CHANNEL_ID') || '1515250320777678888';

// Rules quiz questions - English Pool (30 Questions)
const QUESTIONS_EN = [
  { id: 1, question: "Is using client modifications like X-Ray, Fly-hacks, or Speed-hacks allowed?", options: ["Yes, on weekends", "No, it is strictly banned", "Only for finding diamonds", "Yes, if no admins are online"], correct: 1 },
  { id: 2, question: "What happens if you grief another player's base or steal items from their chests?", options: ["Nothing, it's survival", "You will get a warning", "Permanent ban and server roll-back", "You get to keep the items"], correct: 2 },
  { id: 3, question: "What should you do if you find a duplication glitch or game exploit?", options: ["Report it to the staff immediately", "Use it to get rich", "Tell your friends so they can use it", "Ignore it"], correct: 0 },
  { id: 4, question: "What is the server policy on toxicity, slurs, or harassment in chat?", options: ["Allowed if you are joking", "Zero tolerance (immediate mute or ban)", "Allowed during PvP arguments", "Allowed in private messages"], correct: 1 },
  { id: 5, question: "Are you allowed to kill another player without their consent (agreement)?", options: ["Yes, anywhere", "No, PvP requires mutual agreement", "Only in the Nether", "Only during the night"], correct: 1 },
  { id: 6, question: "Is spamming or sending repetitive messages in global chat allowed?", options: ["Yes, to get attention", "Only allowed for advertisements", "No, spamming is prohibited and leads to a mute", "Yes, in capital letters only"], correct: 2 },
  { id: 7, question: "Can you advertise other Minecraft servers or Discord links in chat?", options: ["Yes, anytime", "Only in private messages", "No, advertising is strictly prohibited", "Yes, if the server is offline"], correct: 2 },
  { id: 8, question: "What happens if you pretend to be a staff member or helper?", options: ["You will get a free rank", "It is allowed as a prank", "It leads to a ban for staff impersonation", "Nothing"], correct: 2 },
  { id: 9, question: "Are players allowed to beg staff for free items, creative mode, or ranks?", options: ["Yes, if you ask nicely", "No, begging staff is annoying and not allowed", "Only on your birthday", "Yes, admins love giving free items"], correct: 1 },
  { id: 10, question: "Is building lag machines or redstone loops without an off switch allowed?", options: ["Yes, lag is funny", "Only in the Nether", "No, constructing lag machines is strictly banned", "Yes, if it is underground"], correct: 2 },
  { id: 11, question: "If a base has no claims, does it mean you can take it over?", options: ["Yes, finders keepers", "No, taking over someone else's build is theft", "Only if it is made of dirt", "Yes, if the owner is offline for 1 day"], correct: 1 },
  { id: 12, question: "What is the proper way to disagree with a moderator's decision?", options: ["Argue and spam in public chat", "Accept it and appeal civilly on Discord if needed", "Grief spawn in revenge", "Create alt accounts to spam the server"], correct: 1 },
  { id: 13, question: "Is sharing another player's real-life details (doxxing) allowed?", options: ["Yes, if they are your rival", "No, doxxing is illegal and leads to an immediate permanent ban", "Only with friends", "Only in private Discord calls"], correct: 1 },
  { id: 14, question: "How should you treat new players who join the server?", options: ["Spawn kill them repeatedly", "Ignore them completely", "Be helpful and welcoming", "Steal their starting items"], correct: 2 },
  { id: 15, question: "Are NSFW (Not Safe For Work) builds or offensive signs allowed?", options: ["Yes, in your own base", "Only if hidden underground", "No, all builds and signs must remain family-friendly", "Yes, if you use signs in Hindi"], correct: 2 },
  { id: 16, question: "Is trapping Nether portals or spawn locations to kill players allowed?", options: ["Yes, easy kills", "No, portal/spawn trapping is strictly prohibited", "Only allowed in the End dimension", "Yes, on weekends only"], correct: 1 },
  { id: 17, question: "What happens if you use an alt account to bypass a ban?", options: ["You get a second chance", "Both accounts will be permanently banned", "The alt account gets the admin rank", "Nothing"], correct: 1 },
  { id: 18, question: "Is trading in-game items for real money (RMT) allowed?", options: ["Yes, if you need money", "Only with staff supervision", "No, real money trading is strictly prohibited", "Yes, using UPI only"], correct: 2 },
  { id: 19, question: "Which minimap modification is allowed on the server?", options: ["Minimaps with player/entity radars active", "Only pure minimaps without player/entity tracking", "Any map mod including cave maps", "No maps are allowed"], correct: 1 },
  { id: 20, question: "Is using auto-clickers or macros to automatically attack/AFK farm allowed?", options: ["Yes, AFK farming is allowed", "No, auto-clickers and macros are strictly banned", "Only for cobble generators", "Yes, if you are tabbed out"], correct: 1 },
  { id: 21, question: "What happens if you team up with a hacker or cover up their rule-breaking?", options: ["You get a reward for team play", "You will face the same punishment as the hacker", "Nothing, only the hacker is banned", "You get a warning only"], correct: 1 },
  { id: 22, question: "What should you do if you witness someone breaking server rules?", options: ["Join them in breaking the rules", "Record evidence and report to staff on Discord", "Call them names in public chat", "Do nothing"], correct: 1 },
  { id: 23, question: "Can you use alt accounts to claim extra land or bypass limits?", options: ["Yes, as many as you want", "No, using alt accounts to bypass limits is a ban offence", "Only if you pay the admins", "Yes, if the accounts have different skins"], correct: 1 },
  { id: 24, question: "Are you allowed to take aesthetic blocks from spawn builds?", options: ["Yes, spawn belongs to everyone", "No, spawn griefing or theft is strictly banned", "Only at night", "Yes, if you replace them with dirt"], correct: 1 },
  { id: 25, question: "Is provoking or baiting staff members to get a reaction allowed?", options: ["Yes, for content", "No, staff disrespect and baiting is warnable", "Only if you are a Twitch streamer", "Yes, if you say 'just joking'"], correct: 1 },
  { id: 26, question: "What are the rules regarding Minecraft IGNs (In-Game Names)?", options: ["Any name is fine", "Must not be offensive, racist, or inappropriate", "Must contain the word 'Legend'", "Must match your Discord name exactly"], correct: 1 },
  { id: 27, question: "Is using Litematica's 'printer' mode allowed?", options: ["Yes, it is standard build mod", "No, printer/auto-placer is considered a hack and banned", "Only for building storage systems", "Yes, on creative server only"], correct: 1 },
  { id: 28, question: "Can you use speed-bridging macros?", options: ["Yes, it is just bridging faster", "No, macros giving gameplay advantage are strictly banned", "Only in the End dimension", "Yes, if you are bad at bridging"], correct: 1 },
  { id: 29, question: "If you get griefed, how are items recovered?", options: ["Items are gone forever", "Admins will roll back the grief and restore stolen chests", "You have to steal back from the thief", "Staff will give you creative mode"], correct: 1 },
  { id: 30, question: "What is the ultimate rule of thumb on Bandhilki SMP?", options: ["Be toxic and dominate", "Respect everyone and play fair", "Steal as much as you can", "Spam links to get views"], correct: 1 }
];

// Rules quiz questions - Hinglish Pool (30 Questions)
const QUESTIONS_HI = [
  { id: 1, question: "Kya X-Ray, Fly-hacks ya Speed-hacks jaise mods use karna allowed hai?", options: ["Haan, weekends par", "Nahi, ye strictly banned hai aur permanent ban milega", "Sirf diamond dhoondhne ke liye", "Haan, agar koi admin online na ho"], correct: 1 },
  { id: 2, question: "Agar aap kisi doosre player ka base grief karte hain ya chest se saman churate hain toh kya hoga?", options: ["Kuch nahi, ye survival hai", "Aapko warning milegi", "Permanent ban aur server roll-back kiya jayega", "Aap items rakh sakte hain"], correct: 2 },
  { id: 3, question: "Agar aapko koi dupe glitch ya server exploit mile toh kya karna chahiye?", options: ["Staff ko turant report karein aur use na karein", "Ameer banne ke liye use karein", "Dosto ko batayein taaki wo bhi use karein", "Ignore karein"], correct: 0 },
  { id: 4, question: "Server par toxicity, gaali-galoch ya harassment ke liye kya policy hai?", options: ["Allowed hai agar aap mazak kar rahe ho", "Zero tolerance policy (turant mute ya ban)", "PvP ki ladayi me allowed hai", "Private messages me allowed hai"], correct: 1 },
  { id: 5, question: "Kya aap kisi player ko uski marzi (consent) ke bina kill kar sakte hain?", options: ["Haan, kahin bhi", "Nahi, PvP ke liye dono ki marzi honi chahiye", "Sirf Nether dimension me", "Sirf raat ke samay"], correct: 1 },
  { id: 6, question: "Kya global chat me bar-bar message spam karna allowed hai?", options: ["Haan, attention paane ke liye", "Sirf server promotion ke liye", "Nahi, spamming prohibited hai aur mute milega", "Haan, sirf capital letters me"], correct: 2 },
  { id: 7, question: "Kya aap chat me doosre Minecraft servers ya Discord links advertise kar sakte hain?", options: ["Haan, kabhi bhi", "Sirf private messages me", "Nahi, advertising strictly banned hai", "Haan, agar hamara server offline ho"], correct: 2 },
  { id: 8, question: "Agar aap fake staff member ya helper bante hain toh kya action hoga?", options: ["Aapko free rank milegi", "Ye prank ki tarah allowed hai", "Staff impersonation ke liye ban ho sakte hain", "Kuch nahi hoga"], correct: 2 },
  { id: 9, question: "Kya players staff se free items, creative mode ya ranks maang sakte hain?", options: ["Haan, agar tameez se maangein", "Nahi, staff se bheekh maangna allowed nahi hai", "Sirf apne birthday par", "Haan, admins free items dena pasand karte hain"], correct: 1 },
  { id: 10, question: "Kya bina off-switch ke lag machine ya redstone loops banana allowed hai?", options: ["Haan, lag me maza aata hai", "Sirf Nether dimension me", "Nahi, lag machines banana strictly banned hai", "Haan, agar underground banayein"], correct: 2 },
  { id: 11, question: "Agar kisi base par land claim nahi hai, toh kya aap use apna bana sakte hain?", options: ["Haan, jo pehle paaye wo rakhe", "Nahi, kisi aur ka build hadapna chori mana jata hai", "Sirf agar wo dirt se bana ho", "Haan, agar owner 1 din offline rahe"], correct: 1 },
  { id: 12, question: "Moderator ke decision se asahmati (disagree) jatane ka sahi tareeka kya hai?", options: ["Global chat me behes aur spam karein", "Shanti se decision manein aur Discord par appeal karein", "Badle me spawn ko grief karein", "Alt accounts banakar spam karein"], correct: 1 },
  { id: 13, question: "Kya kisi doosre player ki real-life details leak karna (doxxing) allowed hai?", options: ["Haan, agar wo aapka dushman hai", "Nahi, doxxing illegal hai aur permanent ban milega", "Sirf dosto ke sath share kar sakte hain", "Sirf private Discord calls me allowed hai"], correct: 1 },
  { id: 14, question: "Server me aane wale new players ke sath aapko kaisa behave karna chahiye?", options: ["Unhe spawn par bar-bar kill karein", "Unhe bilkul ignore karein", "Helpful aur welcoming behave karein", "Unka starting items chura lein"], correct: 2 },
  { id: 15, question: "Kya NSFW (Not Safe For Work) builds ya offensive boards lagana allowed hai?", options: ["Haan, apne base par", "Sirf underground me chupa kar", "Nahi, sabhi builds aur signs family-friendly hone chahiye", "Haan, agar board Hindi me ho"], correct: 2 },
  { id: 16, question: "Kya Nether portal ya spawn area ko block karke trap lagana allowed hai?", options: ["Haan, aasaan kills ke liye", "Nahi, portal/spawn trap lagana strictly prohibited hai", "Sirf End dimension me allowed hai", "Haan, sirf weekends par"], correct: 1 },
  { id: 17, question: "Agar aap ban bypass karne ke liye doosra (alt) account use karte hain toh kya hoga?", options: ["Aapko doosra mauka milega", "Dono accounts permanent ban kar diye jayenge", "Alt account ko admin rank mil jayegi", "Kuch nahi hoga"], correct: 1 },
  { id: 18, question: "Kya in-game items ko real paiso (RMT) ke badle bechna allowed hai?", options: ["Haan, agar paiso ki zaroorat ho", "Sirf staff ki dekh-rekh me", "Nahi, real money trading strictly banned hai", "Haan, sirf UPI payment ke sath"], correct: 2 },
  { id: 19, question: "Kaunsa minimap mod server par allowed hai?", options: ["Jisme player aur entity radar active ho", "Sirf bina player/entity radar wala simple minimap", "Koi bhi map mod including cave maps", "Koi bhi map allowed nahi hai"], correct: 1 },
  { id: 20, question: "Kya AFK farming ke liye auto-clicker ya macros use karna allowed hai?", options: ["Haan, AFK farming sab allowed hai", "Nahi, auto-clickers aur macros strictly banned hain", "Sirf cobble generator ke liye", "Haan, agar aap monitor ke samne na ho"], correct: 1 },
  { id: 21, question: "Agar aap kisi hacker ke sath team banate hain ya uski chori chupati hain toh kya hoga?", options: ["Aapko team play ke liye reward milega", "Aapko bhi hacker jaisi hi saza (ban) milegi", "Kuch nahi, sirf hacker ban hoga", "Aapko sirf ek halki warning milegi"], correct: 1 },
  { id: 22, question: "Agar aap kisi ko rules todte hue dekhein toh kya karna chahiye?", options: ["Unke sath milkar rules todein", "Evidence (video/screenshot) lekar Discord par report karein", "Global chat me unhe gaali dein", "Kuch na karein, ignore karein"], correct: 1 },
  { id: 23, question: "Kya aap land limits badhane ke liye alt accounts use kar sakte hain?", options: ["Haan, jitne chahein", "Nahi, limits bypass karne ke liye alt accounts use karna ban offence hai", "Sirf agar aap admins ko pay karein", "Haan, agar accounts ka skin different ho"], correct: 1 },
  { id: 24, question: "Kya aap spawn area ke sundar blocks nikal kar le ja sakte hain?", options: ["Haan, spawn sabka hai", "Nahi, spawn griefing ya chori strictly banned hai", "Sirf raat ke samay", "Haan, agar aap wahan dirt laga dein"], correct: 1 },
  { id: 25, question: "Kya staff members ko jaanbujhkar provoke ya bait karna allowed hai?", options: ["Haan, entertainment ke liye", "Nahi, staff disrespect aur baiting warnable hai", "Sirf agar aap Twitch streamer ho", "Haan, agar aap baad me 'just kidding' bol dein"], correct: 1 },
  { id: 26, question: "Minecraft IGN (In-Game Name) ke baare me kya rules hain?", options: ["Koi bhi name chalega", "Name offensive, racist ya ganda nahi hona chahiye", "Name me 'Legend' hona zaroori hai", "Aapke Discord name se exact match hona chahiye"], correct: 1 },
  { id: 27, question: "Kya Litematica mod ka 'printer' mode use karna allowed hai?", options: ["Haan, ye standard build mod hai", "Nahi, printer/auto-placer hack mana jata hai aur banned hai", "Sirf storage systems banane ke liye", "Sirf creative server par allowed hai"], correct: 1 },
  { id: 28, question: "Kya aap speed-bridging macros use kar sakte hain?", options: ["Haan, isse sirf bridge jaldi banta hai", "Nahi, macro use karna strictly prohibited hai", "Sirf End dimension me", "Haan, agar aapko bridging na aati ho"], correct: 1 },
  { id: 29, question: "Agar aapke base par chori ya griefing hoti hai toh items kaise wapas milte hain?", options: ["Saman hamesha ke liye chala gaya", "Admins grief check karke roll-back karenge aur items wapas dilwayenge", "Aapko chor se wapas chori karni padegi", "Staff aapko creative mode de dega"], correct: 1 },
  { id: 30, question: "Bandhilki SMP ka sabse bada aur zaroori rule kya hai?", options: ["Toxic bano aur sabko maro", "Sabki respect karo aur fair game khelo", "Jitna ho sake chori karo", "Chat me spamming karke views badhao"], correct: 1 }
];

function getRandomQuestions(questionsPool, count = 10) {
  const shuffled = [...questionsPool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/* ---------- LOGGER ---------- */
const log = {
  info: m => console.log(chalk.blue("ℹ"), m),
  success: m => console.log(chalk.green("✔"), m),
  error: m => console.log(chalk.red("✖"), m)
};

// loadPersistedState() will be run in bootstrap.

/* ---------- EVENTS: persistence (JSON) ---------- */
const EVENTS_PERSIST_PATH = process.env.EVENTS_PERSIST_PATH || path.join(__dirname, 'data', 'events.json');
if (process.env.EVENTS_PERSIST_PATH) {
  seedFileIfMissing(EVENTS_PERSIST_PATH, 'events.json');
}
const EVENTS_BACKUP_DIR = process.env.EVENTS_BACKUP_DIR || path.join(__dirname, 'data', 'events-backups');
const EVENTS_BACKUP_INTERVAL_MS = parseInt(process.env.EVENTS_BACKUP_INTERVAL_MS || String(50 * 60 * 1000), 10);
const EVENTS_BACKUP_MAX_FILES = parseInt(process.env.EVENTS_BACKUP_MAX_FILES || '12', 10);

const events = [];
let eventCounter = 1;

function ensureEventsPersistDir() {
  const dir = path.dirname(EVENTS_PERSIST_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(EVENTS_BACKUP_DIR)) fs.mkdirSync(EVENTS_BACKUP_DIR, { recursive: true });
}

async function loadEventsPersistedState() {
  try {
    if (db.isConnected()) {
      const dbEvents = await db.Event.find({});
      events.length = 0;
      events.push(...dbEvents.map(x => x.toObject()));
      eventCounter = await getCounterVal("eventCounter", 1);
      log.info(`Loaded persisted events from MongoDB`);
      return;
    }

    if (!fs.existsSync(EVENTS_PERSIST_PATH)) return;
    const raw = fs.readFileSync(EVENTS_PERSIST_PATH, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);

    events.length = 0;
    if (Array.isArray(parsed.events)) events.push(...parsed.events);

    if (typeof parsed.eventCounter === 'number') eventCounter = parsed.eventCounter;
    log.info(`Loaded persisted events from ${EVENTS_PERSIST_PATH}`);
  } catch (e) {
    log.error(`Failed to load events persisted state: ${e.message}`);
  }
}

function backupEventsIfNeeded() {
  try {
    if (db.isConnected()) return;
    ensureEventsPersistDir();
    if (!fs.existsSync(EVENTS_PERSIST_PATH)) return;
    const lastTs = backupEventsIfNeeded._lastBackupTs;
    if (lastTs && (Date.now() - lastTs) < EVENTS_BACKUP_INTERVAL_MS) return;

    backupEventsIfNeeded._lastBackupTs = Date.now();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(EVENTS_BACKUP_DIR, `events-${stamp}.json`);

    fs.copyFileSync(EVENTS_PERSIST_PATH, backupPath);

    const files = fs.readdirSync(EVENTS_BACKUP_DIR)
      .filter(f => /^events-.*\.json$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(EVENTS_BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    const keep = EVENTS_BACKUP_MAX_FILES;
    for (let i = keep; i < files.length; i++) {
      fs.unlinkSync(path.join(EVENTS_BACKUP_DIR, files[i].f));
    }
  } catch (e) {
    log.error(`Failed to backup events: ${e.message}`);
  }
}

async function saveEventsPersistedState() {
  try {
    if (db.isConnected()) {
      const eventOps = events.map(ev => ({
        updateOne: {
          filter: { id: String(ev.id) },
          update: { $set: ev },
          upsert: true
        }
      }));
      if (eventOps.length > 0) {
        await db.Event.bulkWrite(eventOps);
      }
      const currentIds = events.map(ev => String(ev.id));
      await db.Event.deleteMany({ id: { $nin: currentIds } });

      await setCounterVal("eventCounter", eventCounter);
      return;
    }

    ensureEventsPersistDir();
    const state = {
      updatedAt: Date.now(),
      events,
      eventCounter
    };
    fs.writeFileSync(EVENTS_PERSIST_PATH, JSON.stringify(state, null, 2), 'utf8');
    backupEventsIfNeeded();
  } catch (e) {
    log.error(`Failed to save events persisted state: ${e.message}`);
  }
}

if (!process.env.MONGODB_URI) {
  ensureEventsPersistDir();
}
setInterval(() => backupEventsIfNeeded(), EVENTS_BACKUP_INTERVAL_MS);

/* ---------- MINIGAMES: leaderboard persistence ---------- */
const MINIGAME_LEADERBOARD_PATH = process.env.MINIGAME_LEADERBOARD_PATH || path.join(__dirname, 'data', 'minigame-leaderboard.json');
if (process.env.MINIGAME_LEADERBOARD_PATH) {
  seedFileIfMissing(MINIGAME_LEADERBOARD_PATH, 'minigame-leaderboard.json');
}
const minigameScores = [];

async function loadMinigameLeaderboard() {
  try {
    if (db.isConnected()) {
      const dbScores = await db.MinigameScore.find({});
      minigameScores.length = 0;
      minigameScores.push(...dbScores.map(x => x.toObject()));
      log.info(`Loaded minigame leaderboard from MongoDB`);
      return;
    }

    if (!fs.existsSync(MINIGAME_LEADERBOARD_PATH)) return;
    const raw = fs.readFileSync(MINIGAME_LEADERBOARD_PATH, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.scores)) {
      minigameScores.length = 0;
      minigameScores.push(...parsed.scores);
    }
    log.info(`Loaded minigame leaderboard from ${MINIGAME_LEADERBOARD_PATH}`);
  } catch (e) {
    log.error(`Failed to load minigame leaderboard: ${e.message}`);
  }
}

async function saveMinigameLeaderboard() {
  try {
    if (db.isConnected()) {
      const scoreOps = minigameScores.map(s => ({
        updateOne: {
          filter: { id: String(s.id) },
          update: { $set: s },
          upsert: true
        }
      }));
      if (scoreOps.length > 0) {
        await db.MinigameScore.bulkWrite(scoreOps);
      }
      const currentIds = minigameScores.map(s => String(s.id));
      await db.MinigameScore.deleteMany({ id: { $nin: currentIds } });
      return;
    }

    const dir = path.dirname(MINIGAME_LEADERBOARD_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MINIGAME_LEADERBOARD_PATH, JSON.stringify({
      updatedAt: Date.now(),
      scores: minigameScores
    }, null, 2), 'utf8');
  } catch (e) {
    log.error(`Failed to save minigame leaderboard: ${e.message}`);
  }
}

function cleanLeaderboardName(name) {
  return String(name || 'Guest')
    .replace(/[^\w .-]/g, '')
    .trim()
    .slice(0, 24) || 'Guest';
}

function leaderboardFor(gameId) {
  return minigameScores
    .filter(s => s.gameId === gameId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.timeMs || 0) !== (b.timeMs || 0)) return (a.timeMs || 0) - (b.timeMs || 0);
      return a.ts - b.ts;
    })
    .slice(0, 10);
}

function normalizeEventId(id) {
  if (id === undefined || id === null) return null;
  return String(id);
}

function createEventPayload(input, staffId, staffName) {
  const now = Date.now();
  const title = (input.title || '').trim();
  const description = (input.description || '').trim();
  const type = (input.type || 'event').trim();
  const startsAt = input.startsAt ? new Date(input.startsAt).getTime() : null;
  const endsAt = input.endsAt ? new Date(input.endsAt).getTime() : null;

  if (!title || title.length < 2) throw new Error('title is required');
  if (!description || description.length < 2) throw new Error('description is required');
  if (!startsAt || Number.isNaN(startsAt)) throw new Error('startsAt is required');

  const id = `EVT-${eventCounter++}`;

  const ev = {
    id,
    title,
    description,
    type,
    startsAt,
    endsAt,
    completed: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    createdBy: { id: staffId, name: staffName }
  };

  // Optional: store staff-provided fields
  if (input.discordAnnouncementText) ev.discordAnnouncementText = String(input.discordAnnouncementText);

  return ev;
}

function eventToDiscordEmbed(ev) {
  const embed = new EmbedBuilder()
    .setTitle(ev.title)
    .setColor(ev.completed ? 0x9ca3af : 0xf84762)
    .setDescription(ev.description.length > 4000 ? ev.description.slice(0, 3997) + '…' : ev.description)
    .setTimestamp(new Date(ev.startsAt));

  const parts = [];
  if (ev.type) parts.push(`Type: **${ev.type}**`);
  if (ev.startsAt) parts.push(`Starts: **<t:${Math.floor(ev.startsAt / 1000)}:F>**`);
  if (ev.endsAt) parts.push(`Ends: **<t:${Math.floor(ev.endsAt / 1000)}:R>**`);
  parts.push(`ID: ${ev.id}`);

  embed.addFields({ name: '📌 Details', value: parts.join('\n'), inline: false });
  if (ev.pinned) embed.setFooter({ text: 'Pinned' });
  return embed;
}

function getEventsSorted() {
  // Pinned first, then upcoming/ongoing by startsAt, then completed last
  return [...events].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
    const as = a.startsAt || 0;
    const bs = b.startsAt || 0;
    return as - bs;
  });
}

function timeLeftParts(nowMs, startsAtMs) {
  const diff = startsAtMs - nowMs;
  if (diff <= 0) return 'Live / started';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);

  const arr = [];
  if (d) arr.push(`${d}d`);
  if (h) arr.push(`${h}h`);
  arr.push(`${m}m`);
  return arr.join(' ') || `${sec}s`;
}

async function maybeSendEventAnnouncement(ev, staff) {
  const channelId = EVENT_CHANNEL_ID;
  if (!channelId) return; // no-op if not configured
  if (!client.isReady()) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const embed = eventToDiscordEmbed(ev);
    const content = ev.discordAnnouncementText
      ? ev.discordAnnouncementText
      : `📢 **New event:** ${ev.title}`;

    await channel.send({ content, embeds: [embed] });

    // Also pin announcement optionally when ev.pinned
    if (ev.pinned && channel.isTextBased && typeof channel.pin === 'function') {
      // Discord.js doesn't expose message.pin universally across versions; best-effort below.
    }
  } catch (e) {
    log.error(`Failed to send event announcement: ${e.message}`);
  }
}

app.post('/api/contact', async (req, res) => {
  try {
    const { name, discord, message } = req.body || {};
    if (!name || !discord || !message) {
      return res.status(400).json({ error: 'All fields (name, discord, message) are required' });
    }

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
    if (!webhookUrl) {
      log.error('Contact Webhook URL not configured in environment');
      return res.status(500).json({ error: 'Contact system configuration error' });
    }

    const payload = {
      username: 'Contact Form Bot',
      embeds: [{
        title: '📨 New Contact Message',
        color: 0x3498db,
        fields: [
          { name: '👤 Name', value: String(name) },
          { name: '💬 Discord', value: String(discord) },
          { name: '📩 Message', value: String(message) }
        ],
        footer: { text: 'BANDHILKI SMP Contact System' },
        timestamp: new Date().toISOString()
      }]
    };

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (discordRes.ok) {
      res.json({ success: true });
    } else {
      const errText = await discordRes.text();
      log.error(`Discord webhook returned error: ${discordRes.status} - ${errText}`);
      res.status(502).json({ error: 'Failed to send message to Discord' });
    }
  } catch (e) {
    log.error(`Contact form submission failed: ${e.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Events API — public read-only endpoint (no auth required)
app.get('/api/events/public', (req, res) => {
  res.json({ events: getEventsSorted() });
});

// Events API — staff-only full access
app.get('/api/events', staffMiddleware, (req, res) => {
  res.json({ events: getEventsSorted() });
});

app.post('/api/events', staffMiddleware, async (req, res) => {
  try {
    const ev = createEventPayload(req.body || {}, req.user.id, req.user.username);
    events.unshift(ev);
    saveEventsPersistedState();
    // Fire-and-forget — don't block the response waiting for Discord
    maybeSendEventAnnouncement(ev, req.user).catch(e =>
      log.error(`Event announcement failed: ${e.message}`)
    );
    res.json({ success: true, event: ev });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to create event' });
  }
});

app.patch('/api/events/:id', staffMiddleware, async (req, res) => {
  try {
    const id = normalizeEventId(req.params.id);
    const ev = events.find(x => String(x.id) === id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const now = Date.now();
    const input = req.body || {};
    if (input.title !== undefined) ev.title = String(input.title).trim();
    if (input.description !== undefined) ev.description = String(input.description).trim();
    if (input.type !== undefined) ev.type = String(input.type).trim();
    if (input.startsAt !== undefined) ev.startsAt = input.startsAt ? new Date(input.startsAt).getTime() : ev.startsAt;
    if (input.endsAt !== undefined) ev.endsAt = input.endsAt ? new Date(input.endsAt).getTime() : ev.endsAt;
    if (input.discordAnnouncementText !== undefined) ev.discordAnnouncementText = String(input.discordAnnouncementText);

    ev.updatedAt = now;

    saveEventsPersistedState();
    res.json({ success: true, event: ev });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to edit event' });
  }
});

app.delete('/api/events/:id', staffMiddleware, (req, res) => {
  const id = normalizeEventId(req.params.id);
  const idx = events.findIndex(x => String(x.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const removed = events.splice(idx, 1)[0];
  saveEventsPersistedState();
  res.json({ success: true, removed });
});

app.post('/api/events/:id/complete', staffMiddleware, (req, res) => {
  const id = normalizeEventId(req.params.id);
  const ev = events.find(x => String(x.id) === id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.completed = true;
  ev.updatedAt = Date.now();
  saveEventsPersistedState();
  res.json({ success: true, event: ev });
});

app.post('/api/events/:id/uncomplete', staffMiddleware, (req, res) => {
  const id = normalizeEventId(req.params.id);
  const ev = events.find(x => String(x.id) === id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.completed = false;
  ev.updatedAt = Date.now();
  saveEventsPersistedState();
  res.json({ success: true, event: ev });
});

app.post('/api/events/:id/pin', staffMiddleware, (req, res) => {
  const id = normalizeEventId(req.params.id);
  const ev = events.find(x => String(x.id) === id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.pinned = true;
  ev.updatedAt = Date.now();
  saveEventsPersistedState();
  res.json({ success: true, event: ev });
});

app.post('/api/events/:id/unpin', staffMiddleware, (req, res) => {
  const id = normalizeEventId(req.params.id);
  const ev = events.find(x => String(x.id) === id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.pinned = false;
  ev.updatedAt = Date.now();
  saveEventsPersistedState();
  res.json({ success: true, event: ev });
});

// NOTE: the incomplete duplicate /api/events/:id/pin handler was removed.

/* ---------- MINIGAMES API ---------- */
app.get('/api/minigames/:gameId/leaderboard', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) return res.status(400).json({ error: 'Game id required' });
  res.json({ scores: leaderboardFor(gameId) });
});

app.post('/api/minigames/:gameId/leaderboard', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) return res.status(400).json({ error: 'Game id required' });

  const score = Number.parseInt(req.body?.score, 10);
  const timeMs = Number.parseInt(req.body?.timeMs, 10) || 0;
  const level = Number.parseInt(req.body?.level, 10) || 1;

  if (!Number.isFinite(score) || score < 0 || score > 999999) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  // Basic anti-cheat validation for minicraft-minesweeper
  if (gameId === 'minicraft-minesweeper') {
    let maxScore = 375;
    if (level === 4) maxScore = 300;
    else if (level === 6) maxScore = 330;
    else if (level === 9) maxScore = 375;

    if (score > maxScore) {
      return res.status(400).json({ error: 'Score is invalid or impossible for this level' });
    }
    if (timeMs < 1000 && score > 0) {
      return res.status(400).json({ error: 'Time is suspiciously fast' });
    }
  }

  const token = getCookie(req, 'session_token');
  const session = token ? sessions.get(token) : null;
  const playerName = session ? session.username : cleanLeaderboardName(req.body?.playerName);

  const entry = {
    id: `${gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gameId,
    playerId: session ? session.id : null,
    playerName,
    score,
    level,
    timeMs,
    ts: Date.now()
  };

  minigameScores.push(entry);

  const gameScores = leaderboardFor(gameId);
  const keepIds = new Set(gameScores.map(s => s.id));
  for (let i = minigameScores.length - 1; i >= 0; i--) {
    if (minigameScores[i].gameId === gameId && !keepIds.has(minigameScores[i].id)) {
      minigameScores.splice(i, 1);
    }
  }

  saveMinigameLeaderboard();
  res.json({ success: true, entry, scores: leaderboardFor(gameId) });
});

async function sendDiscordLog(channelId, embed) {

  if (!client.isReady() || !channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (e) {
    log.error(`Failed to send Discord log: ${e.message}`);
  }
}

function sendContractLog(title, description, fields = [], color = 0xd97706) {
  if (!client.isReady()) return;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
  if (fields && fields.length > 0) {
    embed.addFields(fields);
  }
  sendDiscordLog(CONTRACT_LOG_CHANNEL_ID, embed);
}

/* ---------- DISCORD READY ---------- */
client.once("ready", () => {
  log.success(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: config.bot.presence.status,
    activities: config.bot.presence.activities.map(a => ({
      name: a.name,
      type: ActivityType[a.type]
    }))
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    const parts = interaction.customId.split("_");
    if (parts[0] !== "whitelist") return;

    const action = parts[1]; // "approve" or "reject"
    const ign = parts[2];
    const discordId = parts[3];

    // Check if member is Administrator
    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ Only administrators can review whitelist applications.", ephemeral: true }).catch(() => { });
    }

    let statusObj = userStatuses.get(discordId);
    if (!statusObj) {
      statusObj = {
        discordUserId: discordId,
        discordId,
        ign: ign,
        score: 5,
        age: 18,
        status: "pending",
        submittedAt: Date.now()
      };
      userStatuses.set(discordId, statusObj);
    } else if (statusObj.status !== "pending") {
      return interaction.reply({ content: "⚠️ This application has already been processed.", ephemeral: true }).catch(() => { });
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);

    if (action === "approve") {
      embed.setColor(0x2ecc71);
      embed.setTitle("📥 Whitelist Application – APPROVED");
      embed.setImage("https://cdn.discordapp.com/attachments/1510066691025928423/1510066776413831249/ChatGPT_Image_May_30_2026_05_13_16_AM.png?ex=6a1b76c7&is=6a1a2547&hm=1dec293e40f8f8b0fcc07589bba6c1f4b918208261fdd8f6d9b16aa47acdf4de&");
      embed.addFields({ name: "Reviewed By", value: `${interaction.user.tag}`, inline: true });

      try {
        await interaction.update({ embeds: [embed], components: [] });
      } catch (e) {
        log.error(`Failed to update interaction message: ${e.message}`);
      }

      statusObj.status = "approved";
      statusObj.reviewedBy = interaction.user.username;
      statusObj.reviewedAt = Date.now();
      userStatuses.set(discordId, statusObj);
      savePersistedState();

      logActivity(interaction.user.id, interaction.user.username, `Approved whitelist application for ${statusObj.ign || ign}`);

      // Grant Discord whitelist role.
      try {
        const member = await interaction.guild.members.fetch(discordId);
        if (member) {
          await member.roles.add(WHITELIST_ROLE_ID);
          log.info(`Added role ${WHITELIST_ROLE_ID} to approved user ${discordId}`);
        }
      } catch (e) {
        log.error(`Failed to add role to approved user ${discordId}: ${e.message}`);
      }

      try {
        const user = await client.users.fetch(discordId);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setTitle("🎉 Whitelist Approved!")
            .setDescription(`Your whitelist application for Minecraft IGN **${statusObj.ign || ign}** on Bandhilki SMP has been **APPROVED**! You can now join the server.`)
            .setColor(0x2ecc71)
            .setImage("https://cdn.discordapp.com/attachments/1510066691025928423/1510066776413831249/ChatGPT_Image_May_30_2026_05_13_16_AM.png?ex=6a1b76c7&is=6a1a2547&hm=1dec293e40f8f8b0fcc07589bba6c1f4b918208261fdd8f6d9b16aa47acdf4de&")
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        }
      } catch (e) {
        log.error(`Could not DM user ${discordId}: ${e.message}`);
      }
    } else if (action === "reject") {
      embed.setColor(0xe74c3c);
      embed.setTitle("📥 Whitelist Application – REJECTED");
      embed.setImage("https://cdn.discordapp.com/attachments/1510066691025928423/1510066776833265814/ChatGPT_Image_May_30_2026_05_15_28_AM.png?ex=6a1b76c7&is=6a1a2547&hm=b1aaddefe1a4de4895fd8873cc00c17a058baded4722f2986&");
      embed.addFields({ name: "Reviewed By", value: `${interaction.user.tag}`, inline: true });

      try {
        await interaction.update({ embeds: [embed], components: [] });
      } catch (e) {
        log.error(`Failed to update interaction message: ${e.message}`);
      }

      statusObj.status = "rejected";
      statusObj.reviewedBy = interaction.user.username;
      statusObj.reviewedAt = Date.now();
      userStatuses.set(discordId, statusObj);
      savePersistedState();

      logActivity(interaction.user.id, interaction.user.username, `Rejected whitelist application for ${statusObj.ign || ign}`);

      // Remove Discord whitelist role.
      try {
        const member = await interaction.guild.members.fetch(discordId);
        if (member) {
          await member.roles.remove(WHITELIST_ROLE_ID);
          log.info(`Removed role ${WHITELIST_ROLE_ID} from rejected user ${discordId}`);
        }
      } catch (e) {
        log.error(`Failed to remove role from rejected user ${discordId}: ${e.message}`);
      }

      try {
        const user = await client.users.fetch(discordId);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setTitle("❌ Whitelist Rejected")
            .setDescription(`Your whitelist application for Minecraft IGN **${statusObj.ign || ign}** on Bandhilki SMP has been **REJECTED**..`)
            .setColor(0xe74c3c)
            .setImage("https://cdn.discordapp.com/attachments/1510066691025928423/1510066776833265814/ChatGPT_Image_May_30_2026_05_15_28_AM.png?ex=6a1b76c7&is=6a1a2547&hm=b1aaddefe1a4de4895fd8873cc00c17a058baded4722f2986&")
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        }
      } catch (e) {
        log.error(`Could not DM user ${discordId}: ${e.message}`);
      }
    }
  } catch (err) {
    log.error(`Error handling button interaction: ${err.message}`);
  }
});

/* ---------- HELPERS ---------- */
function safeId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

async function checkServer(ip, port) {
  try {
    const res = await util.status(ip, port);
    return {
      online: true,
      players: res.players.online,
      max: res.players.max,
      ping: res.roundTripLatency,
      playerList: (res.players.sample || []).map(p => p.name).filter(Boolean),
      version: res.version?.name || null,
      motd: res.motd?.clean || null,
      motdHtml: res.motd?.html || null,
      favicon: res.favicon || null
    };
  } catch {
    return { online: false, playerList: [] };
  }
}

/* ---------- HISTORY ---------- */
function pushHistory(id, count) {
  if (!playerHistory.has(id)) playerHistory.set(id, []);
  const h = playerHistory.get(id);
  h.push({ t: Date.now(), c: count });
  if (h.length > 24) h.shift();
}

/* ---------- CHART ---------- */
async function makeChart(id, color) {
  const h = playerHistory.get(id);
  if (!h || h.length < 2) return null;

  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: h.map(x => new Date(x.t).toLocaleTimeString()),
      datasets: [{
        data: h.map(x => x.c),
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive: false }
  });

  return canvas.toBuffer();
}

/* ---------- UPDATE SERVER ---------- */
async function updateServer(server) {
  const status = await checkServer(server.ip, server.port);
  const id = safeId(server.name);

  if (status.online) pushHistory(id, status.players);

  // Always update the in-memory store (feeds the web dashboard API)
  serverData.set(id, {
    id,
    name: server.name,
    ip: server.ip,
    port: server.port,
    online: status.online,
    players: status.online ? status.players : 0,
    max: status.max || 0,
    ping: status.ping || null,
    playerList: status.playerList || [],
    version: status.version || null,
    motd: status.motd || null,
    motdHtml: status.motdHtml || null,
    favicon: status.favicon || null,
    history: playerHistory.get(id) || [],
    color: server.display.chart.color,
    lastUpdated: Date.now()
  });

  log.info(`[${server.name}] ${status.online ? `Online – ${status.players}/${status.max} players (${status.ping}ms)` : "Offline"}`);

  // Only push Discord embed when the bot is connected
  if (!client.isReady()) return;

  // Update bot status/presence to WATCHING BANDHILKI WEBSITE
  try {
    client.user.setActivity("BANDHILKI WEBSITE", { type: ActivityType.Watching });
  } catch (e) {
    log.error(`Failed to update bot activity: ${e.message}`);
  }

  try {
    const channelId = MINECRAFT_STATUS_CHANNEL_ID || server.channelId;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    const embed = new EmbedBuilder()
      .setTitle(config.embed.title)
      .setColor(status.online ? config.embed.colors.online : config.embed.colors.offline)
      .setFooter(config.embed.footer)
      .setTimestamp();

    if (status.online) {
      embed.addFields(
        { name: "Players", value: `${status.players}/${status.max}`, inline: true },
        { name: "Ping", value: `${status.ping}ms`, inline: true }
      );
    }

    const files = [];
    const chart = await makeChart(id, server.display.chart.color);
    if (chart) {
      files.push(new AttachmentBuilder(chart, { name: "chart.png" }));
      embed.setImage("attachment://chart.png");
    }

    const msgs = await channel.messages.fetch({ limit: 1 });
    const msg = msgs.first();
    if (msg && msg.author.id === client.user.id) {
      await msg.edit({ embeds: [embed], files });
    } else {
      await channel.send({ embeds: [embed], files });
    }
  } catch (err) {
    log.error(`Discord channel update failed: ${err.message}`);
  }
}

/* ---------- START MONITORING ---------- */
function startMonitoring() {
  if (!config.minecraft || !Array.isArray(config.minecraft.servers)) {
    log.error("No minecraft servers configured in config.json");
    return;
  }
  log.info(`Initializing status monitoring for ${config.minecraft.servers.length} servers...`);
  for (const server of config.minecraft.servers) {
    // Initial update
    updateServer(server).catch(err => log.error(`Failed initial status update for ${server.name}: ${err.message}`));
    // Interval update
    setInterval(() => {
      updateServer(server).catch(err => log.error(`Failed periodic status update for ${server.name}: ${err.message}`));
    }, server.updateInterval || 30000);
  }
}


/* ---------- DASHBOARD ---------- */
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/style.css") {
    res.set("Cache-Control", "no-store");
  } else if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Debug: log every API request (helps verify routing issues)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[api] ${req.method} ${req.path}`);
  }
  next();
});


app.get("/api/servers", async (req, res) => {
  let isWhitelisted = false;
  try {
    const token = getCookie(req, 'session_token');
    if (token) {
      const session = sessions.get(token);
      if (session && session.id) {
        isWhitelisted = await hasWhitelistRole(session.id);
      }
    }
  } catch (err) {
    console.error('[api/servers] Error checking whitelist:', err.message);
  }

  const servers = [...serverData.values()].map(server => {
    const s = { ...server };
    if (!isWhitelisted) {
      s.ip = "Hidden until whitelisted";
      s.port = "Hidden";
    }
    return s;
  });

  res.json(servers);
});


// Helper to extract a cookie value by name
function getCookie(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return match[2];
  return null;
}

// Authentication Middleware
function authMiddleware(req, res, next) {
  const token = getCookie(req, 'session_token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  req.user = session;
  req.token = token;
  next();
}

const https = require("https");

async function findWhitelistMember(discordUserId) {
  if (!client.isReady()) return null;

  // First try the configured guild ID
  if (DISCORD_GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
      const member = await guild.members.fetch(discordUserId);
      if (member) {
        try { await member.fetch(); } catch { }
      }
      log.info(`[findWhitelistMember] Found member in configured guild ${DISCORD_GUILD_ID}`);
      return member;
    } catch (e) {
      log.error(`[findWhitelistMember] Failed to find in configured guild: ${e.message}`);
    }
  }

  // If that fails, try all cached guilds
  for (const guild of client.guilds.cache.values()) {
    try {
      const member = await guild.members.fetch(discordUserId);
      if (member) {
        try { await member.fetch(); } catch { }
      }
      log.info(`[findWhitelistMember] Found member in guild ${guild.id} (${guild.name})`);
      return member;
    } catch (e) {
      // just skip this guild
    }
  }

  return null;
}

async function hasWhitelistRole(discordUserId) {
  const member = await findWhitelistMember(discordUserId);
  return member ? member.roles.cache.has(WHITELIST_ROLE_ID) : false;
}

async function hasStaffRole(discordUserId) {
  if (!DISCORD_STAFF_ROLE_ID) return false;

  // Global cache keyed by Discord user ID — persists across requests, 10-min TTL
  const CACHE_TTL = 10 * 60 * 1000;
  const cached = staffRoleCache.get(discordUserId);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.isStaff;
  }

  const member = await findWhitelistMember(discordUserId);
  if (!member) {
    staffRoleCache.set(discordUserId, { isStaff: false, ts: Date.now() });
    return false;
  }

  try {
    await member.fetch();
  } catch { }

  const isStaff = member.roles?.cache?.has(DISCORD_STAFF_ROLE_ID) || false;
  staffRoleCache.set(discordUserId, { isStaff, ts: Date.now() });
  return isStaff;
}

function addStaffLog(staffId, staffName, action, ticketId = null) {
  staffLogs.unshift({
    ts: Date.now(),
    staffId,
    staffName,
    action,
    ticketId
  });
  if (staffLogs.length > 500) staffLogs.pop();
}

const STAFF_ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function staffMiddleware(req, res, next) {
  const token = getCookie(req, 'session_token');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (session.username === 'TestUser') {
    req.user = session;
    req.user._isStaff = true;
    return next();
  }

  // If no staff role configured, let everyone through
  if (!DISCORD_STAFF_ROLE_ID) {
    req.user = session;
    return next();
  }

  // Use cached result if still fresh (avoids Discord API call on every request)
  const now = Date.now();
  if (
    typeof session._isStaff === 'boolean' &&
    session._staffCheckedAt &&
    (now - session._staffCheckedAt) < STAFF_ROLE_CACHE_TTL_MS
  ) {
    if (!session._isStaff) return res.status(403).json({ error: 'Access denied - staff only' });
    req.user = session;
    return next();
  }

  // Fresh check against Discord
  hasStaffRole(session.id)
    .then(isStaff => {
      session._isStaff = isStaff;
      session._staffCheckedAt = Date.now();
      if (!isStaff) return res.status(403).json({ error: 'Access denied - staff only' });
      req.user = session;
      next();
    })
    .catch(err => {
      log.error(`staffMiddleware Discord check failed: ${err.message}`);
      // If cache exists (even stale), trust it during outage
      if (typeof session._isStaff === 'boolean') {
        if (!session._isStaff) return res.status(403).json({ error: 'Access denied - staff only' });
        req.user = session;
        return next();
      }
      res.status(500).json({ error: 'Failed to verify staff status. Try again.' });
    });
}



function exchangeDiscordCode(code) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.append('client_id', process.env.DISCORD_CLIENT_ID || '');
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET || '');
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', process.env.DISCORD_REDIRECT_URI || '');

    const data = params.toString();

    const req = https.request({
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function fetchDiscordProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'discord.com',
      path: '/api/users/@me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/* ---------- AUTHENTICATION APIS ---------- */
app.post("/api/logout", (req, res) => {
  const token = getCookie(req, 'session_token');
  if (token) {
    sessions.delete(token);
  }
  res.setHeader("Set-Cookie", "session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax");
  res.json({ success: true });
});

app.get("/api/me", async (req, res) => {
  const token = getCookie(req, 'session_token');
  if (!token) {
    return res.json({ loggedIn: false });
  }
  const session = sessions.get(token);
  if (!session) {
    return res.json({ loggedIn: false });
  }

  let hasWhitelist = false;
  let isStaff = false;
  try {
    hasWhitelist = await hasWhitelistRole(session.id);
    isStaff = await hasStaffRole(session.id);
  } catch (e) {
    log.error(`Error checking roles for user ${session.id}: ${e.message}`);
  }

  let whitelistStatus = hasWhitelist ? "allowlisted" : "not_allowlisted";
  const statusObj = userStatuses.get(session.id);
  if (!hasWhitelist && statusObj && statusObj.status) {
    whitelistStatus = statusObj.status;
  }

  res.json({
    loggedIn: true,
    user: {
      id: session.id,
      username: session.username,
      discriminator: session.discriminator,
      avatar: session.avatar
    },
    whitelistRoleId: WHITELIST_ROLE_ID,
    hasWhitelistRole: hasWhitelist,
    whitelistStatus,
    whitelistDetails: { status: whitelistStatus },
    isStaff: isStaff
  });
});

/* ---------- DISCORD OAUTH APIS ---------- */
app.get("/api/auth/discord/config", (req, res) => {
  const active = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI);
  res.json({ active });
});

app.get("/api/auth/discord/login", (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_REDIRECT_URI) {
    return res.status(400).send("Discord OAuth is not configured on this server.");
  }
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(authorizeUrl);
});

app.get("/api/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect("/login.html?error=No+code+provided");
  }
  try {
    const tokenResponse = await exchangeDiscordCode(code);
    if (tokenResponse.error) {
      return res.redirect(`/login.html?error=${encodeURIComponent(tokenResponse.error_description || tokenResponse.error)}`);
    }

    const profile = await fetchDiscordProfile(tokenResponse.access_token);
    if (!profile.id) {
      return res.redirect("/login.html?error=Failed+to+fetch+Discord+profile");
    }

    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.id) % 5}.png`;

    sessions.set(sessionToken, {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator || '0',
      avatar: avatarUrl
    });

    res.setHeader("Set-Cookie", `session_token=${sessionToken}; Path=/; HttpOnly; Max-Age=${24 * 60 * 60}; SameSite=Lax`);
    return res.redirect('/whitelist.html');
  } catch (err) {
    res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
  }
});

// Test/Mock session endpoint for local verification/testing
app.get("/api/test-session", (req, res) => {
  if (req.hostname !== "localhost" && req.hostname !== "127.0.0.1") {
    return res.status(403).send("Forbidden. Only available locally.");
  }
  const sessionToken = "test_token_123";
  sessions.set(sessionToken, {
    id: "780345293237125152",
    username: "TestUser",
    discriminator: "0",
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
  });
  res.setHeader("Set-Cookie", `session_token=${sessionToken}; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax`);
  res.redirect('/whitelist.html');
});

/* ---------- CONTACT API ---------- */
app.post("/api/contact", async (req, res) => {
  const { name, discord, message } = req.body;
  if (!name || !discord || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields.' });
  }

  const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
  if (!webhookUrl) {
    log.error("CONTACT_WEBHOOK_URL is not set.");
    return res.status(500).json({ success: false, error: 'Contact system is not configured on the server.' });
  }

  const payload = {
    embeds: [{
      title: "📨 New Contact Message",
      color: 0x3498db,
      fields: [
        { name: "Name", value: String(name).substring(0, 1024), inline: true },
        { name: "Discord", value: String(discord).substring(0, 1024), inline: true },
        { name: "Message", value: String(message).substring(0, 1024) }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      res.json({ success: true });
    } else {
      log.error(`Contact Webhook Error: ${response.status} ${response.statusText}`);
      res.status(500).json({ success: false, error: 'Failed to send message.' });
    }
  } catch (err) {
    log.error(`Contact webhook failed: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

/* ---------- QUIZ & WHITELIST APIS ---------- */
app.get("/api/quiz-questions", authMiddleware, (req, res) => {
  const lang = req.query.lang || "hi";
  const pool = lang === "en" ? QUESTIONS_EN : QUESTIONS_HI;

  const selected = getRandomQuestions(pool, 10);

  // Store selected questions in session for grading verification
  req.user.quizQuestions = selected.map(q => ({ id: q.id, correct: q.correct }));

  // Safe questions to send to client (no correct index)
  const safeQuestions = selected.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options
  }));

  res.json(safeQuestions);
});

app.post("/api/submit-whitelist", authMiddleware, async (req, res) => {
  const { ign, discordUsername, age, country, experience, playerType, plans, banHistory, weeklyHours, whyWhitelist, answers } = req.body;

  // Basic validation
  if (!ign || !age || !answers) {
    return res.status(400).json({ error: "Missing required fields (ign, age, or answers)." });
  }
  if (ign.trim().length < 3) {
    return res.status(400).json({ error: "Minecraft IGN must be at least 3 characters." });
  }
  const ageNum = parseInt(age);
  if (isNaN(ageNum) || ageNum <= 0) {
    return res.status(400).json({ error: "Invalid age." });
  }

  const selectedQuestions = req.user.quizQuestions;
  if (!selectedQuestions || selectedQuestions.length === 0) {
    return res.status(400).json({ error: "No active quiz session. Please load the quiz questions first." });
  }

  // Evaluate quiz score
  let score = 0;
  selectedQuestions.forEach(sq => {
    if (Number(answers[sq.id]) === Number(sq.correct)) {
      score++;
    }
  });

  const passed = score >= 7;

  // Profile data for embedding
  const profile = {
    ign: ign.trim(),
    discordUsername: (discordUsername || req.user.username).trim(),
    age: ageNum,
    country: (country || 'Not specified').trim(),
    experience: (experience || 'Not specified').trim(),
    playerType: (playerType || 'Not specified').trim(),
    plans: (plans || 'Not specified').trim(),
    banHistory: (banHistory || 'Not specified').trim(),
    weeklyHours: (weeklyHours || 'Not specified').trim(),
    whyWhitelist: (whyWhitelist || 'Not specified').trim()
  };

  if (passed) {
    // Mark as pending staff review (not auto-approved)
    userStatuses.set(req.user.id, {
      status: "pending",
      discordId: req.user.id,
      discordUsername: req.user.username,
      discordAvatar: req.user.avatar || null,
      ign: profile.ign,
      age: ageNum,
      country: profile.country,
      experience: profile.experience,
      playerType: profile.playerType,
      plans: profile.plans,
      banHistory: profile.banHistory,
      weeklyHours: profile.weeklyHours,
      whyWhitelist: profile.whyWhitelist,
      score,
      submittedAt: Date.now()
    });
    savePersistedState();

    // Send application directly to the Discord review channel using the bot with Approve/Reject buttons
    if (client.isReady()) {
      try {
        const channelId = WHITELIST_LOG_CHANNEL_ID || config.minecraft.servers[0].channelId;
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`whitelist_approve_${profile.ign}_${req.user.id}`)
              .setLabel("✅ Approve")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`whitelist_reject_${profile.ign}_${req.user.id}`)
              .setLabel("❌ Reject")
              .setStyle(ButtonStyle.Danger)
          );

          const pendingEmbed = new EmbedBuilder()
            .setTitle("📋 New Whitelist Application – Pending Review")
            .setColor(0xf59e0b)
            .addFields(
              { name: "👤 Discord User", value: `<@${req.user.id}> (${req.user.username})`, inline: true },
              { name: "⚔️ Minecraft IGN", value: profile.ign, inline: true },
              { name: "🎂 Age", value: String(profile.age), inline: true },
              { name: "🌍 Country & Timezone", value: profile.country, inline: true },
              { name: "📊 Quiz Score", value: `${score}/10 ✅ PASSED`, inline: true },
              { name: "🕐 Submitted", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
              { name: "⏳ Minecraft Experience", value: profile.experience, inline: false },
              { name: "🎮 Player Type", value: profile.playerType, inline: false },
              { name: "🏗️ Plans on Server", value: profile.plans, inline: false },
              { name: "🚫 Ban History", value: profile.banHistory, inline: false },
              { name: "🕹️ Weekly Playtime", value: profile.weeklyHours, inline: true },
              { name: "💬 Why Whitelist?", value: profile.whyWhitelist, inline: false }
            )
            .setFooter({ text: `User ID: ${req.user.id} | Click Approve or Reject below` })
            .setTimestamp();

          const msg = await channel.send({
            content: `📋 New whitelist application from <@${req.user.id}> is pending review.`,
            embeds: [pendingEmbed],
            components: [row]
          });
          const currentStatus = userStatuses.get(req.user.id);
          if (currentStatus) {
            currentStatus.reviewMessageId = msg.id;
            userStatuses.set(req.user.id, currentStatus);
            savePersistedState();
          }
          log.success(`Whitelist application sent via bot to review channel for ${req.user.username} (${req.user.id})`);
        }
      } catch (err) {
        log.error(`Failed to send whitelist application via bot: ${err.message}`);
      }
    }

    // Notify applicant that their application is under review
    if (client.isReady()) {
      try {
        const discordUser = await client.users.fetch(req.user.id);
        if (discordUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle("⏳ Application Under Review")
            .setDescription(`Your whitelist application for **${profile.ign}** on Bandhilki SMP has been submitted and is pending staff review. You scored **${score}/10** on the rules quiz. We will DM you once a decision is made!`)
            .setColor(0xf59e0b)
            .setTimestamp();
          await discordUser.send({ embeds: [dmEmbed] });
        }
      } catch (dmErr) {
        log.error(`Could not DM user ${req.user.id}: ${dmErr.message}`);
      }
    }

    res.json({ success: true, passed: true, score, status: 'pending' });

  } else {
    // Quiz failed — notify immediately, no staff review needed
    userStatuses.set(req.user.id, {
      status: "rejected",
      ign: profile.ign,
      age: ageNum,
      score,
      submittedAt: Date.now()
    });
    savePersistedState();

    const rejectedImage = "https://cdn.discordapp.com/attachments/1510066691025928423/1510066776833265814/ChatGPT_Image_May_30_2026_05_15_28_AM.png?ex=6a1b76c7&is=6a1a2547&hm=b1aaddefe1a4de4895fd8873cc00c17a058baded4722f2986&";

    if (client.isReady()) {
      try {
        const channelId = WHITELIST_LOG_CHANNEL_ID || config.minecraft.servers[0].channelId;
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const failEmbed = new EmbedBuilder()
            .setTitle("❌ Whitelist Quiz – FAILED")
            .setColor(0xe74c3c)
            .addFields(
              { name: "Discord User", value: `<@${req.user.id}> (${req.user.username})`, inline: true },
              { name: "Minecraft IGN", value: profile.ign, inline: true },
              { name: "Quiz Score", value: `${score}/10 – FAILED (need 7+)`, inline: true }
            )
            .setTimestamp();
          await channel.send({ content: `❌ Whitelist quiz failed by <@${req.user.id}>`, embeds: [failEmbed] });
        }

        const discordUser = await client.users.fetch(req.user.id);
        if (discordUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle("❌ Whitelist Quiz Failed")
            .setDescription(`Your rules quiz score was **${score}/10** — you need at least **7/10** to pass. Please review the server rules and try again.`)
            .setColor(0xe74c3c)
            .setTimestamp();
          await discordUser.send({ embeds: [dmEmbed] });
        }
      } catch (err) {
        log.error(`Failed to handle failed quiz outcome: ${err.message}`);
      }
    }

    res.json({ success: true, passed: false, score });
  }
});

/* ---------- TICKET APIS (player + staff) ----------
   NOTE: This file previously had multiple duplicated ticket route blocks with
   different ticket object shapes. Those duplicates caused runtime errors in
   staff.html / tickets.html.

   The canonical implementation is the one further below starting with:
   app.post('/api/tickets/create', ...)
   All earlier duplicates are removed to ensure one stable API contract.
*/






















/* ---------- STAFF: WHO AM I ---------- */
app.get('/api/staff/me', authMiddleware, async (req, res) => {
  if (req.user.username === 'TestUser') {
    req.user._isStaff = true;
    req.user._staffCheckedAt = Date.now();
    return res.json({ isStaff: true, user: req.user });
  }
  if (!DISCORD_STAFF_ROLE_ID) {
    // Cache as staff in session so middleware is fast on first request
    req.user._isStaff = true;
    req.user._staffCheckedAt = Date.now();
    return res.json({ isStaff: true, user: req.user });
  }
  try {
    const member = await findWhitelistMember(req.user.id);
    const isStaff = member ? member.roles.cache.has(DISCORD_STAFF_ROLE_ID) : false;
    // Cache in session so subsequent API calls don't re-hit Discord
    req.user._isStaff = isStaff;
    req.user._staffCheckedAt = Date.now();
    res.json({ isStaff, user: req.user });
  } catch {
    res.json({ isStaff: false, user: req.user });
  }
});

/* ---------- STAFF: LIST (for assigning) ---------- */
app.get('/api/staff/list', staffMiddleware, async (req, res) => {
  if (!DISCORD_STAFF_ROLE_ID) {
    return res.json({ staff: [] });
  }

  try {
    const staff = [];

    // Helper: collect staff members from a given guild.
    const collectFromGuild = async (guild) => {
      // Best-effort: try to resolve the role first (helps avoid cache/permission issues)
      try {
        const role = await guild.roles.fetch(DISCORD_STAFF_ROLE_ID);
        if (!role) return;
      } catch {
        return;
      }

      // Fetch all guild members and then ensure each member is fully fetched before checking roles.
      // This avoids relying on partially populated role caches.
      const members = await guild.members.fetch();
      for (const m of members.values()) {
        try {
          await m.fetch();
        } catch { }

        const hasRole = m.roles?.cache?.has(DISCORD_STAFF_ROLE_ID) || false;
        if (!hasRole) continue;

        staff.push({
          id: m.id,
          username: m.user.username,
          // Discord.js often returns displayName as null; use a robust fallback.
          displayName: m.displayName || m.nickname || m.user.username,
          avatar: m.user.displayAvatarURL?.({ size: 64 }) || m.user.avatarURL?.({ size: 64 }) || null
        });
      }
    };


    if (DISCORD_GUILD_ID) {
      const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
      await collectFromGuild(guild);
    } else {
      // Fallback: search all cached guilds.
      for (const guild of client.guilds.cache.values()) {
        await collectFromGuild(guild);
      }
    }

    // Dedupe by id
    const byId = new Map();
    for (const s of staff) byId.set(s.id, s);

    res.json({ staff: [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)) });
  } catch (e) {
    log.error(`Failed to list staff: ${e.message}`);
    res.status(500).json({ error: 'Failed to load staff list.' });
  }
});


/* ---------- TICKET HELPERS ---------- */
function logActivity(staffId, staffName, action, ticketId) {
  activityLogs.unshift({ ts: Date.now(), staffId, staffName, action, ticketId });
  if (activityLogs.length > 200) activityLogs.pop();

  // Also push to Discord ticket-log channel (best-effort)
  if (client.isReady()) {
    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket Log")
      .setColor(0xf84762)
      .setDescription(`${action}${ticketId ? `\n**Ticket:** ${ticketId}` : ""}`)
      .addFields(
        { name: "Staff", value: `<@${staffId}> (${staffName})`, inline: true }
      )
      .setTimestamp();

    sendDiscordLog(TICKET_LOG_CHANNEL_ID, embed);
  }
}


/* ---------- TICKET APIS (player) ---------- */
// Create ticket
app.post('/api/tickets/create', authMiddleware, (req, res) => {
  console.log('[route] POST /api/tickets/create hit');
  const { category, description, screenshotUrl } = req.body;
  if (!category || !description) return res.status(400).json({ error: 'Category and description are required.' });

  const CATEGORIES = ['Support', 'Report Player', 'Bug Report', 'Ban Appeal', 'Staff Complaint'];
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
  if (description.trim().length < 10) return res.status(400).json({ error: 'Description must be at least 10 characters.' });

  const id = `TICK-${++ticketCounter}`;
  const ticket = {
    id,
    category,
    description: description.trim(),
    screenshotUrl: screenshotUrl || null,
    status: 'open',           // open | inprogress | waiting | closed
    createdBy: { id: req.user.id, username: req.user.username, avatar: req.user.avatar },
    claimedBy: null,
    assignedTo: null,
    replies: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tickets.set(id, ticket);
  savePersistedState();
  res.json({ success: true, ticket });

  // Discord notification

  if (client.isReady() && TICKET_LOG_CHANNEL_ID) {
    const categoryEmojis = { 'Support': '🛠️', 'Report Player': '🚨', 'Bug Report': '🐛', 'Ban Appeal': '⚖️', 'Staff Complaint': '📢' };
    client.channels.fetch(TICKET_LOG_CHANNEL_ID).then(ch => {
      const embed = new EmbedBuilder()
        .setTitle(`${categoryEmojis[category] || '🎫'} New Ticket — ${id}`)
        .setColor(0xf84762)
        .addFields(
          { name: 'Category', value: category, inline: true },
          { name: 'Player', value: `<@${req.user.id}> (${req.user.username})`, inline: true },
          { name: 'Description', value: description.trim().slice(0, 1000) }
        )
        .setTimestamp();
      if (screenshotUrl) embed.setImage(screenshotUrl);
      ch.send({ embeds: [embed] });
    }).catch(() => { });
  }
});

// My tickets (player sees own tickets)
app.get('/api/tickets/my', authMiddleware, (req, res) => {
  const myTickets = [...tickets.values()]
    .filter(t => t.createdBy.id === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(myTickets);
});

// Player replies to their own ticket
app.post('/api/tickets/:id/reply-player', authMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (ticket.createdBy.id !== req.user.id) return res.status(403).json({ error: 'Not your ticket.' });
  const { message } = req.body;
  if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required.' });
  ticket.replies.push({ from: 'player', authorId: req.user.id, author: req.user.username, message: message.trim(), ts: Date.now() });
  ticket.status = 'inprogress';
  ticket.updatedAt = Date.now();
  savePersistedState();
  res.json({ success: true });
});

/* ---------- TICKET APIS (staff) ---------- */
// All tickets
app.get('/api/tickets/all', staffMiddleware, (req, res) => {
  const all = [...tickets.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json(all);
});

function persistAndLog(action) {
  savePersistedState();
  if (client.isReady()) {
    // no-op best-effort hook; persistence already logged to file errors only
  }
}


// Claim ticket
app.post('/api/tickets/:id/claim', staffMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  ticket.claimedBy = { id: req.user.id, username: req.user.username };
  ticket.status = 'inprogress';
  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Claimed ticket ${req.params.id}`, req.params.id);
  savePersistedState();
  res.json({ success: true });

});

// Assign to another staff
app.post('/api/tickets/:id/assign', staffMiddleware, async (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const { assignToId, assignToName } = req.body;

  if (!assignToId) {
    return res.status(400).json({ error: 'No staff selected' });
  }

  // If DISCORD_STAFF_ROLE_ID is set, enforce assignee is staff.
  if (DISCORD_STAFF_ROLE_ID) {
    const member = await findWhitelistMember(assignToId);
    if (!member) return res.status(403).json({ error: 'Assignee not found in Discord.' });

    // Ensure roles are up to date
    try { await member.fetch(); } catch { }

    const isStaff = member.roles?.cache?.has(DISCORD_STAFF_ROLE_ID) || false;
    if (!isStaff) return res.status(403).json({ error: 'Assignee does not have staff role.' });

    ticket.assignedTo = {
      id: assignToId,
      username: member.displayName || member.nickname || member.user.username
    };
  } else {
    ticket.assignedTo = {
      id: assignToId,
      username: (assignToName || '').trim() || 'Unknown Staff'
    };
  }

  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Assigned ${req.params.id} to ${ticket.assignedTo.username}`, req.params.id);
  savePersistedState();

  // Best-effort: Discord notification is handled in the second assign route below (if present)
  // but keep response contract stable.
  res.json({ success: true, assignedTo: ticket.assignedTo });
});



// Staff reply
app.post('/api/tickets/:id/reply', staffMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const { message } = req.body;
  if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required.' });
  ticket.replies.push({ from: 'staff', authorId: req.user.id, author: req.user.username, message: message.trim(), ts: Date.now() });
  ticket.status = 'waiting';   // waiting for player response
  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Replied to ${req.params.id}`, req.params.id);
  savePersistedState();
  res.json({ success: true });

});

// Change status
app.post('/api/tickets/:id/status', staffMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const { status } = req.body;
  const VALID = ['open', 'inprogress', 'waiting', 'closed'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  ticket.status = status;
  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Changed ${req.params.id} status → ${status}`, req.params.id);
  savePersistedState();
  res.json({ success: true });

});

// Close ticket
app.post('/api/tickets/:id/close', staffMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  ticket.status = 'closed';
  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Closed ticket ${req.params.id}`, req.params.id);
  savePersistedState();
  res.json({ success: true });

});

// Reopen ticket
app.post('/api/tickets/:id/reopen', staffMiddleware, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  ticket.status = 'open';
  ticket.updatedAt = Date.now();
  logActivity(req.user.id, req.user.username, `Reopened ticket ${req.params.id}`, req.params.id);
  savePersistedState();
  res.json({ success: true });
});

// Delete ticket
app.delete('/api/tickets/:id', staffMiddleware, (req, res) => {
  const id = req.params.id;
  if (!tickets.has(id)) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }
  const removed = tickets.get(id);
  tickets.delete(id);
  logActivity(req.user.id, req.user.username, `Deleted ticket ${id}`, id);
  savePersistedState();
  res.json({ success: true, removed });
});

/* ---------- STAFF TODO APIS ---------- */
app.get('/api/staff/todos', staffMiddleware, (req, res) => res.json(staffTodos));

app.post('/api/staff/todos', staffMiddleware, (req, res) => {
  const { text, priority } = req.body;
  if (!text || text.trim().length < 1) return res.status(400).json({ error: 'Text required.' });
  const todo = { id: todoCounter++, text: text.trim(), done: false, priority: priority || 'normal', createdAt: Date.now(), createdBy: req.user.username };
  staffTodos.unshift(todo);
  savePersistedState();
  res.json({ success: true, todo });

});

app.patch('/api/staff/todos/:id', staffMiddleware, (req, res) => {
  const todo = staffTodos.find(t => t.id === parseInt(req.params.id));
  if (!todo) return res.status(404).json({ error: 'Todo not found.' });
  if (typeof req.body.done === 'boolean') todo.done = req.body.done;
  if (req.body.text) todo.text = req.body.text.trim();
  savePersistedState();
  res.json({ success: true, todo });

});

app.delete('/api/staff/todos/:id', staffMiddleware, (req, res) => {
  const idx = staffTodos.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Todo not found.' });
  staffTodos.splice(idx, 1);
  savePersistedState();
  res.json({ success: true });

});

/* ---------- STAFF ACTIVITY LOGS ---------- */
app.get('/api/staff/activity', staffMiddleware, (req, res) => res.json(activityLogs));

/* ---------- STAFF WORK UPDATES ---------- */
app.get('/api/staff/work-updates', staffMiddleware, (req, res) => {
  res.json(staffWorkUpdates);
});

app.post('/api/staff/work-updates', staffMiddleware, async (req, res) => {
  const { summary, category } = req.body;
  if (!summary || summary.trim().length < 3) {
    return res.status(400).json({ error: 'Summary must be at least 3 characters.' });
  }
  const VALID_CATS = ['General', 'Tickets', 'Events', 'Moderation', 'Development', 'Other'];
  const cat = VALID_CATS.includes(category) ? category : 'General';
  const CAT_COLORS = {
    'General': 0x9ca3af, 'Tickets': 0x60a5fa, 'Events': 0xf8c42c,
    'Moderation': 0xf84762, 'Development': 0x4ade80, 'Other': 0xa78bfa
  };
  const CAT_EMOJIS_WU = {
    'General': '📋', 'Tickets': '🎫', 'Events': '🎉',
    'Moderation': '⚔️', 'Development': '💻', 'Other': '🔧'
  };

  const update = {
    id: workUpdateCounter++,
    staffId: req.user.id,
    staffName: req.user.username,
    staffAvatar: req.user.avatar || null,
    summary: summary.trim(),
    category: cat,
    ts: Date.now()
  };
  staffWorkUpdates.unshift(update);
  if (staffWorkUpdates.length > 200) staffWorkUpdates.pop();
  logActivity(req.user.id, req.user.username, `Posted work update: "${summary.trim().slice(0, 60)}"`);
  savePersistedState();

  // ── Send to Discord work-update channel ──────────────────
  if (WORK_UPDATE_CHANNEL_ID && client.isReady()) {
    try {
      const channel = await client.channels.fetch(WORK_UPDATE_CHANNEL_ID);
      if (channel) {
        const embed = new EmbedBuilder()
          .setAuthor({
            name: req.user.username,
            iconURL: req.user.avatar || undefined
          })
          .setTitle(`${CAT_EMOJIS_WU[cat]} Work Update — ${cat}`)
          .setDescription(summary.trim().length > 4000 ? summary.trim().slice(0, 3997) + '…' : summary.trim())
          .setColor(CAT_COLORS[cat] || 0x9ca3af)
          .setFooter({ text: `Staff: ${req.user.username}` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    } catch (e) {
      log.error(`Failed to send work update to Discord: ${e.message}`);
    }
  }

  res.json({ success: true, update });
});

app.delete('/api/staff/work-updates/:id', staffMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = staffWorkUpdates.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Update not found.' });
  // Only allow the author or any staff to delete
  staffWorkUpdates.splice(idx, 1);
  savePersistedState();
  res.json({ success: true });
});

/* ---------- GALLERY APIS ---------- */
// Get all gallery images (public)
app.get('/api/gallery', (req, res) => {
  res.json(gallery);
});

// Add new gallery image (staff only)
app.post('/api/gallery', staffMiddleware, (req, res) => {
  const { url, description } = req.body;
  if (!url || typeof url !== 'string' || url.trim().length < 10) {
    return res.status(400).json({ error: 'Valid Image URL is required (min 10 chars).' });
  }

  // Basic image url validation check: starts with http:// or https:// or /
  const lowerUrl = url.trim().toLowerCase();
  if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://') && !lowerUrl.startsWith('/')) {
    return res.status(400).json({ error: 'Image URL must start with http://, https://, or a local path.' });
  }

  const newItem = {
    id: galleryCounter++,
    url: url.trim(),
    description: (description || '').trim(),
    ts: Date.now(),
    addedBy: req.user.username
  };

  gallery.unshift(newItem);
  logActivity(req.user.id, req.user.username, `Added gallery image: "${url.trim().slice(0, 60)}"`);
  savePersistedState();

  res.json({ success: true, image: newItem });
});

// Delete gallery image (staff only)
app.delete('/api/gallery/:id', staffMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = gallery.findIndex(item => item.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Gallery image not found.' });
  }

  const removed = gallery[idx];
  gallery.splice(idx, 1);
  logActivity(req.user.id, req.user.username, `Deleted gallery image: "${removed.url.slice(0, 60)}"`);
  savePersistedState();
  res.json({ success: true, removed });
});

/* ---------- TEAM APIS ---------- */
// Get all team members (public)
app.get('/api/team', (req, res) => {
  res.json(team);
});

// Add or update team member (staff only)
app.post('/api/team', staffMiddleware, async (req, res) => {
  const { discordId, role, title, skills } = req.body;
  if (!discordId || typeof discordId !== 'string' || discordId.trim().length < 15) {
    return res.status(400).json({ error: 'Valid Discord User ID is required.' });
  }
  if (!role || typeof role !== 'string' || role.trim().length < 1) {
    return res.status(400).json({ error: 'Role badge name (e.g. Owner, Admin) is required.' });
  }

  try {
    let name = 'Unknown User';
    let avatar = null;
    let initials = 'US';

    // Fetch user details from Discord if bot is ready
    if (client.isReady()) {
      try {
        const user = await client.users.fetch(discordId.trim());
        name = user.globalName || user.username;
        avatar = user.displayAvatarURL({ size: 128 });
        initials = name.slice(0, 2).toUpperCase();
      } catch (err) {
        log.warn(`Failed to fetch Discord user ${discordId}: ${err.message}. Using default placeholders.`);
      }
    }

    const memberData = {
      discordId: discordId.trim(),
      name,
      avatar,
      initials,
      role: role.trim(),
      title: (title || '').trim(),
      skills: (skills || '').trim(),
      ts: Date.now()
    };

    // Check if member already exists in team array
    const idx = team.findIndex(m => m.discordId === discordId.trim());
    if (idx !== -1) {
      // Update
      memberData.position = team[idx].position ?? idx;
      team[idx] = memberData;
      logActivity(req.user.id, req.user.username, `Updated team member: ${name} (${discordId.trim()})`);
    } else {
      // Add
      memberData.position = team.length;
      team.push(memberData);
      logActivity(req.user.id, req.user.username, `Added team member: ${name} (${discordId.trim()})`);
    }

    savePersistedState();
    res.json({ success: true, member: memberData });
  } catch (err) {
    log.error(`Failed to add/update team member: ${err.message}`);
    res.status(500).json({ error: 'Failed to process team member request.' });
  }
});

// Delete team member (staff only)
app.delete('/api/team/:discordId', staffMiddleware, (req, res) => {
  const discordId = req.params.discordId;
  const idx = team.findIndex(m => m.discordId === discordId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Team member not found.' });
  }

  const removed = team[idx];
  team.splice(idx, 1);
  logActivity(req.user.id, req.user.username, `Deleted team member: ${removed.name} (${discordId})`);

  // Update positions for remaining members
  team.forEach((member, idx) => {
    member.position = idx;
  });

  savePersistedState();

  res.json({ success: true });
});

// Reorder team members (staff only)
app.post('/api/team/reorder', staffMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'Invalid list of IDs.' });
  }

  const newTeam = [];
  for (const id of ids) {
    const member = team.find(m => m.discordId === id);
    if (member) {
      newTeam.push(member);
    }
  }

  // Fallback: append any existing members who weren't in the ids list (to prevent accidental data loss)
  for (const member of team) {
    if (!newTeam.some(m => m.discordId === member.discordId)) {
      newTeam.push(member);
    }
  }

  // Update positions based on the new array order
  newTeam.forEach((member, idx) => {
    member.position = idx;
  });

  team.length = 0;
  team.push(...newTeam);

  logActivity(req.user.id, req.user.username, `Reordered team members`);
  savePersistedState();
  res.json({ success: true, team });
});

/* ---------- WHITELIST APPLICATION REVIEW APIS (staff) ---------- */

// List all whitelist applications
app.get('/api/staff/whitelist-applications', staffMiddleware, (req, res) => {
  const apps = [];
  for (const [discordId, s] of userStatuses.entries()) {
    if (!s.status || s.status === 'not_applied') continue;
    apps.push({
      discordId,
      discordUsername: s.discordUsername || 'Unknown',
      discordAvatar: s.discordAvatar || null,
      ign: s.ign || 'Unknown',
      age: s.age || null,
      country: s.country || null,
      experience: s.experience || null,
      playerType: s.playerType || null,
      plans: s.plans || null,
      banHistory: s.banHistory || null,
      weeklyHours: s.weeklyHours || null,
      whyWhitelist: s.whyWhitelist || null,
      score: s.score ?? null,
      status: s.status,
      submittedAt: s.submittedAt || null
    });
  }
  // Sort: pending first, then by submittedAt desc
  apps.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return (b.submittedAt || 0) - (a.submittedAt || 0);
  });
  res.json({ applications: apps });
});

async function updateWhitelistDiscordMessage(userId, action, staffUsername, reason = '') {
  const statusObj = userStatuses.get(userId);
  if (!statusObj || !statusObj.reviewMessageId) return;

  if (client.isReady()) {
    try {
      const channelId = WHITELIST_LOG_CHANNEL_ID || config.minecraft.servers[0].channelId;
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        const msg = await channel.messages.fetch(statusObj.reviewMessageId);
        if (msg && msg.embeds && msg.embeds.length > 0) {
          const oldEmbed = msg.embeds[0];
          const newEmbed = EmbedBuilder.from(oldEmbed);
          if (action === 'approved') {
            newEmbed.setTitle("✅ Whitelist Application – APPROVED");
            newEmbed.setColor(0x2ecc71);
            newEmbed.addFields({ name: "✅ Decision", value: `Approved by ${staffUsername}` });
          } else {
            newEmbed.setTitle("❌ Whitelist Application – REJECTED");
            newEmbed.setColor(0xe74c3c);
            newEmbed.addFields({ name: "❌ Decision", value: `Rejected by ${staffUsername}${reason ? ` (Reason: ${reason})` : ''}` });
          }
          await msg.edit({
            embeds: [newEmbed],
            components: []
          });
        }
      }
    } catch (e) {
      log.error(`Failed to update Discord whitelist message for ${userId}: ${e.message}`);
    }
  }
}

// Approve a whitelist application
app.post('/api/staff/whitelist/:userId/approve', staffMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const statusObj = userStatuses.get(userId);
  if (!statusObj) return res.status(404).json({ error: 'Application not found.' });

  statusObj.status = 'approved';
  statusObj.reviewedBy = req.user.username;
  statusObj.reviewedAt = Date.now();
  userStatuses.set(userId, statusObj);
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Approved whitelist application for ${statusObj.ign || userId}`);

  // Update Discord message
  await updateWhitelistDiscordMessage(userId, 'approved', req.user.username);

  // Grant Discord whitelist role
  try {
    const member = await findWhitelistMember(userId);
    if (member) {
      await member.roles.add(WHITELIST_ROLE_ID);
      log.info(`Granted whitelist role to ${userId}`);
    }
  } catch (e) {
    log.error(`Failed to grant whitelist role to ${userId}: ${e.message}`);
  }

  // DM the user
  if (client.isReady()) {
    try {
      const user = await client.users.fetch(userId);
      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎉 Whitelist Approved!')
          .setDescription(`Your whitelist application for **${statusObj.ign}** on Bandhilki SMP has been **APPROVED**! You can now join the server at \`mc.iucnetwork.in:1999\`.`)
          .setColor(0x2ecc71)
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      }
    } catch (e) {
      log.error(`Could not DM approved user ${userId}: ${e.message}`);
    }
  }

  res.json({ success: true });
});

// Reject a whitelist application
app.post('/api/staff/whitelist/:userId/reject', staffMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const statusObj = userStatuses.get(userId);
  if (!statusObj) return res.status(404).json({ error: 'Application not found.' });

  const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
  statusObj.status = 'rejected';
  statusObj.reviewedBy = req.user.username;
  statusObj.reviewedAt = Date.now();
  if (reason) statusObj.rejectReason = reason;
  userStatuses.set(userId, statusObj);
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Rejected whitelist application for ${statusObj.ign || userId}`);

  // Update Discord message
  await updateWhitelistDiscordMessage(userId, 'rejected', req.user.username, reason);

  // Remove Discord whitelist role (in case they had it)
  try {
    const member = await findWhitelistMember(userId);
    if (member) {
      await member.roles.remove(WHITELIST_ROLE_ID);
    }
  } catch (e) {
    log.error(`Failed to remove whitelist role from ${userId}: ${e.message}`);
  }

  // DM the user
  if (client.isReady()) {
    try {
      const user = await client.users.fetch(userId);
      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('❌ Whitelist Rejected')
          .setDescription(`Your whitelist application for **${statusObj.ign}** on Bandhilki SMP has been **REJECTED**.${reason ? `\n\n**Reason:** ${reason}` : ''}`)
          .setColor(0xe74c3c)
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      }
    } catch (e) {
      log.error(`Could not DM rejected user ${userId}: ${e.message}`);
    }
  }

  res.json({ success: true });
});

/* ---------- COMMUNITY HALL OF SHAME/APPRECIATION APIS ---------- */
app.get('/api/hall-entries', (req, res) => {
  res.json({ success: true, entries: hallEntries });
});

app.post('/api/staff/hall-entries', staffMiddleware, async (req, res) => {
  try {
    const { type, discordId, reason } = req.body;
    if (!type || !discordId || !reason) {
      return res.status(400).json({ error: 'Missing required fields (type, discordId, or reason).' });
    }
    if (type !== 'shame' && type !== 'appreciation') {
      return res.status(400).json({ error: 'Invalid type. Must be "shame" or "appreciation".' });
    }

    const cleanDiscordId = discordId.trim();
    let discordUsername = 'Unknown User';
    let discordAvatar = '';
    let minecraftIGN = '';

    // 1. Try to fetch user from Discord via bot client
    try {
      if (client.isReady()) {
        const user = await client.users.fetch(cleanDiscordId);
        if (user) {
          discordUsername = user.username;
          discordAvatar = user.displayAvatarURL({ extension: 'png', size: 128 });
        }
      }
    } catch (err) {
      console.warn(`Could not fetch user ${cleanDiscordId} from Discord API: ${err.message}`);
    }

    // 2. Check local userStatuses database for cached details and Minecraft IGN
    const cachedStatus = userStatuses.get(cleanDiscordId);
    if (cachedStatus) {
      if (discordUsername === 'Unknown User' && cachedStatus.discordUsername) {
        discordUsername = cachedStatus.discordUsername;
      }
      minecraftIGN = cachedStatus.minecraftIGN || cachedStatus.ign || '';
      if (!discordAvatar && cachedStatus.discordAvatar) {
        discordAvatar = cachedStatus.discordAvatar;
      }
    }

    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      type,
      playerName: discordUsername, // Store Discord username
      discordId: cleanDiscordId,
      minecraftIGN: minecraftIGN, // Store MC IGN if whitelisted
      discordAvatar: discordAvatar, // Store Discord Avatar URL
      reason: reason.trim(),
      addedBy: req.user.username,
      addedAt: Date.now()
    };

    hallEntries.push(newEntry);
    await savePersistedState();

    logActivity(req.user.id, req.user.username, `Added ${type === 'shame' ? 'shame' : 'appreciation'} entry for Discord user ${discordUsername}`);
    res.json({ success: true, entry: newEntry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add entry.' });
  }
});

app.delete('/api/staff/hall-entries/:id', staffMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const idx = hallEntries.findIndex(e => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Entry not found.' });
    }
    const entry = hallEntries[idx];
    hallEntries.splice(idx, 1);
    await savePersistedState();

    logActivity(req.user.id, req.user.username, `Deleted ${entry.type} entry for player ${entry.playerName}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete entry.' });
  }
});

/* ---------- CONTRACTS APIS ---------- */
// Get all contracts (public/player/staff)
app.get('/api/contracts', (req, res) => {
  res.json(contracts);
});

// Create a new contract (staff only)
app.post('/api/contracts', staffMiddleware, (req, res) => {
  try {
    const { title, description, budget, category, imageUrl } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required.' });
    }
    const id = `CON-${++contractCounter}`;
    const contract = {
      id,
      title: title.trim(),
      description: description.trim(),
      budget: budget ? budget.trim() : '',
      category: category ? category.trim() : 'General',
      imageUrl: imageUrl ? imageUrl.trim() : '',
      status: 'open', // open | active | completed | cancelled
      createdBy: { id: req.user.id, username: req.user.username, avatar: req.user.avatar },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedPlayer: null,
      quotations: [],
      bill: null
    };
    contracts.unshift(contract);
    savePersistedState();
    logActivity(req.user.id, req.user.username, `Created contract ${id}: ${contract.title}`);
    sendContractLog(
      `🏛️ New Contract Published: ${contract.id}`,
      `A new server contract has been published to the jobs board.`,
      [
        { name: "Title", value: contract.title, inline: true },
        { name: "Category", value: contract.category, inline: true },
        { name: "Reward Budget", value: contract.budget || "N/A", inline: true },
        { name: "Author", value: contract.createdBy.username, inline: true }
      ],
      0x38bdf8 // Cyan
    );
    res.json({ success: true, contract });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit an existing contract (staff only)
app.patch('/api/contracts/:id', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  const { title, description, budget, category, imageUrl } = req.body;
  if (title !== undefined) contract.title = title.trim();
  if (description !== undefined) contract.description = description.trim();
  if (budget !== undefined) contract.budget = budget.trim();
  if (category !== undefined) contract.category = category.trim();
  if (imageUrl !== undefined) contract.imageUrl = imageUrl.trim();

  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Updated contract ${contract.id}`);
  res.json({ success: true, contract });
});

// Delete a contract (staff only)
app.delete('/api/contracts/:id', staffMiddleware, (req, res) => {
  const idx = contracts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contract not found.' });

  const removed = contracts.splice(idx, 1)[0];
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Deleted contract ${req.params.id}`);
  res.json({ success: true, removed });
});

// Update contract status (staff only)
app.post('/api/contracts/:id/status', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  const { status } = req.body;
  const VALID = ['open', 'active', 'completed', 'cancelled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  contract.status = status;
  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Changed contract ${contract.id} status to ${status}`);
  sendContractLog(
    `🏛️ Contract Status Updated: ${contract.id}`,
    `The status of this contract record has been manually changed by staff.`,
    [
      { name: "Contract Title", value: contract.title, inline: true },
      { name: "New Status", value: contract.status.toUpperCase(), inline: true },
      { name: "Updated By", value: req.user.username, inline: true }
    ],
    0x34495e // Slate
  );
  res.json({ success: true, contract });
});

// Submit/Update player quotation (auth only)
app.post('/api/contracts/:id/quotations', authMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  if (contract.status !== 'open') {
    return res.status(400).json({ error: 'Contract is no longer open for bidding.' });
  }

  const { price, message } = req.body;
  if (!price || !message) {
    return res.status(400).json({ error: 'Requested price and message/plan are required.' });
  }

  const statusObj = userStatuses.get(req.user.id);
  const playerIGN = statusObj ? (statusObj.minecraftIGN || statusObj.ign || '') : '';

  const existingIdx = contract.quotations.findIndex(q => q.playerId === req.user.id);
  const quotationId = existingIdx !== -1
    ? contract.quotations[existingIdx].id
    : `Q-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

  const quotation = {
    id: quotationId,
    playerId: req.user.id,
    playerName: req.user.username,
    playerIGN,
    playerAvatar: req.user.avatar,
    price: price.trim(),
    message: message.trim(),
    status: 'pending', // pending | accepted | rejected
    submittedAt: Date.now()
  };

  if (existingIdx !== -1) {
    contract.quotations[existingIdx] = quotation;
  } else {
    contract.quotations.push(quotation);
  }

  contract.updatedAt = Date.now();
  savePersistedState();
  sendContractLog(
    `✍️ New Contractor Bid Registered: ${contract.id}`,
    `A contractor has submitted a bid proposal for this contract.`,
    [
      { name: "Contract Title", value: contract.title, inline: true },
      { name: "Contractor", value: `${quotation.playerName} (${quotation.playerIGN || 'No IGN'})`, inline: true },
      { name: "Requested Price", value: quotation.price, inline: true },
      { name: "Proposal Message", value: quotation.message }
    ],
    0xf59e0b // Amber/Gold
  );
  res.json({ success: true, contract });
});

// Cancel own quotation (auth only)
app.delete('/api/contracts/:id/quotations/:qid', authMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  const idx = contract.quotations.findIndex(q => q.id === req.params.qid);
  if (idx === -1) return res.status(404).json({ error: 'Quotation not found.' });

  const q = contract.quotations[idx];
  if (q.playerId !== req.user.id) {
    return res.status(403).json({ error: 'You are not authorized to withdraw this bid.' });
  }

  contract.quotations.splice(idx, 1);
  contract.updatedAt = Date.now();
  savePersistedState();
  res.json({ success: true });
});

// Accept/Reject quotation (staff only)
app.post('/api/contracts/:id/quotations/:qid/status', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  const quotation = contract.quotations.find(q => q.id === req.params.qid);
  if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });

  const { status } = req.body;
  if (status !== 'accepted' && status !== 'rejected') {
    return res.status(400).json({ error: 'Invalid quotation status.' });
  }

  quotation.status = status;

  if (status === 'accepted') {
    contract.status = 'active';
    contract.assignedPlayer = {
      id: quotation.playerId,
      username: quotation.playerName,
      ign: quotation.playerIGN
    };
    // Reject other quotations automatically
    contract.quotations.forEach(q => {
      if (q.id !== quotation.id && q.status === 'pending') {
        q.status = 'rejected';
      }
    });
    logActivity(req.user.id, req.user.username, `Accepted bid from ${quotation.playerName} for contract ${contract.id}`, contract.id);
    sendContractLog(
      `🤝 Contract Awarded: ${contract.id}`,
      `A bid proposal has been accepted, and a work order is now active.`,
      [
        { name: "Contract Title", value: contract.title, inline: true },
        { name: "Contractor Awarded", value: `${quotation.playerName} (${quotation.playerIGN || 'No IGN'})`, inline: true },
        { name: "Accepted Reward Value", value: quotation.price, inline: true },
        { name: "Awarded By", value: req.user.username, inline: true }
      ],
      0x2ecc71 // Green
    );
  } else {
    logActivity(req.user.id, req.user.username, `Rejected bid from ${quotation.playerName} for contract ${contract.id}`, contract.id);
    if (contract.assignedPlayer && contract.assignedPlayer.id === quotation.playerId) {
      contract.assignedPlayer = null;
      contract.status = 'open';
    }
    sendContractLog(
      `❌ Bid Rejected: ${contract.id}`,
      `A bid proposal has been rejected by staff.`,
      [
        { name: "Contract Title", value: contract.title, inline: true },
        { name: "Bidder", value: `${quotation.playerName} (${quotation.playerIGN || 'No IGN'})`, inline: true },
        { name: "Requested Price", value: quotation.price, inline: true },
        { name: "Reviewed By", value: req.user.username, inline: true }
      ],
      0xe74c3c // Red
    );
  }

  contract.updatedAt = Date.now();
  savePersistedState();
  res.json({ success: true, contract });
});

// Submit bill (assigned contractor player only)
app.post('/api/contracts/:id/bill', authMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  if (contract.status !== 'active') {
    return res.status(400).json({ error: 'Contract must be active to submit a bill.' });
  }

  if (!contract.assignedPlayer || contract.assignedPlayer.id !== req.user.id) {
    return res.status(403).json({ error: 'Only the assigned contractor can submit a bill.' });
  }

  const { message, imageUrl } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message/Proof is required to submit a bill.' });
  }

  const newBill = {
    id: `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    message: message.trim(),
    imageUrl: imageUrl ? imageUrl.trim() : '',
    status: 'pending', // pending | paid | rejected
    rejectedReason: '',
    submittedAt: Date.now()
  };

  contract.bill = newBill; // for backward compatibility

  if (!contract.bills) contract.bills = [];
  contract.bills.push(newBill);

  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Submitted bill for contract ${contract.id}`);
  sendContractLog(
    `👷 Work Claim Invoice Submitted: ${contract.id}`,
    `The contractor has submitted a completion or milestone claim invoice for verification.`,
    [
      { name: "Contract Title", value: contract.title, inline: true },
      { name: "Contractor", value: `${contract.assignedPlayer.username} (${contract.assignedPlayer.ign || 'No IGN'})`, inline: true },
      { name: "Claim ID", value: newBill.id, inline: true },
      { name: "Proof / Coordinates", value: newBill.message }
    ],
    0xf39c12 // Orange
  );
  res.json({ success: true, contract });
});

// Approve & Pay specific bill (staff only)
app.post('/api/contracts/:id/bills/:billId/pay', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  if (!contract.bills) contract.bills = [];
  const bill = contract.bills.find(b => b.id === req.params.billId);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  bill.status = 'paid';

  // Update legacy bill if it's this one
  if (contract.bill && contract.bill.id === bill.id) {
    contract.bill.status = 'paid';
  }

  const { completeContract } = req.body;
  if (completeContract === true) {
    contract.status = 'completed';
  }

  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Approved payment for bill ${bill.id} on contract ${contract.id}`);
  sendContractLog(
    `✅ Claim Invoice Paid: ${contract.id}`,
    `A milestone or completion claim has been approved and paid out from the treasury.`,
    [
      { name: "Contract Title", value: contract.title, inline: true },
      { name: "Contractor", value: `${contract.assignedPlayer.username} (${contract.assignedPlayer.ign || 'No IGN'})`, inline: true },
      { name: "Paid Claim ID", value: bill.id, inline: true },
      { name: "Status of Work", value: contract.status === 'completed' ? 'Completed & Closed' : 'Ongoing', inline: true },
      { name: "Approved By", value: req.user.username, inline: true }
    ],
    0x2ecc71 // Green
  );
  res.json({ success: true, contract });
});

// Reject specific bill (staff only)
app.post('/api/contracts/:id/bills/:billId/reject', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for rejection is required.' });
  }

  if (!contract.bills) contract.bills = [];
  const bill = contract.bills.find(b => b.id === req.params.billId);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  bill.status = 'rejected';
  bill.rejectedReason = reason.trim();

  // Update legacy bill if it's this one
  if (contract.bill && contract.bill.id === bill.id) {
    contract.bill.status = 'rejected';
    contract.bill.rejectedReason = reason.trim();
  }

  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Rejected bill ${bill.id} for contract ${contract.id}: ${reason.trim()}`);
  sendContractLog(
    `❌ Claim Invoice Rejected: ${contract.id}`,
    `A milestone/completion claim has been rejected.`,
    [
      { name: "Contract Title", value: contract.title, inline: true },
      { name: "Contractor", value: `${contract.assignedPlayer.username} (${contract.assignedPlayer.ign || 'No IGN'})`, inline: true },
      { name: "Rejected Claim ID", value: bill.id, inline: true },
      { name: "Reason for Rejection", value: reason.trim() },
      { name: "Reviewed By", value: req.user.username, inline: true }
    ],
    0xe74c3c // Red
  );
  res.json({ success: true, contract });
});

// Approve & Pay bill (staff only - legacy wrapper for staff.html compatibility)
app.post('/api/contracts/:id/bill/pay', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  if (!contract.bill) {
    return res.status(400).json({ error: 'No bill has been submitted for this contract.' });
  }

  contract.bill.status = 'paid';
  if (contract.bills && contract.bills.length > 0) {
    const matching = contract.bills.find(b => b.id === contract.bill.id || b.status === 'pending');
    if (matching) matching.status = 'paid';
  }

  contract.status = 'completed';
  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Approved payment and completed contract ${contract.id}`);
  res.json({ success: true, contract });
});

// Reject bill (staff only - legacy wrapper for staff.html compatibility)
app.post('/api/contracts/:id/bill/reject', staffMiddleware, (req, res) => {
  const contract = contracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });

  if (!contract.bill) {
    return res.status(400).json({ error: 'No bill has been submitted for this contract.' });
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for rejection is required.' });
  }

  contract.bill.status = 'rejected';
  contract.bill.rejectedReason = reason.trim();

  if (contract.bills && contract.bills.length > 0) {
    const matching = contract.bills.find(b => b.id === contract.bill.id || b.status === 'pending');
    if (matching) {
      matching.status = 'rejected';
      matching.rejectedReason = reason.trim();
    }
  }

  contract.updatedAt = Date.now();
  savePersistedState();
  logActivity(req.user.id, req.user.username, `Rejected bill for contract ${contract.id}: ${reason.trim()}`);
  res.json({ success: true, contract });
});

/* ---------- EMBED BUILDER APIS (staff) ---------- */
app.post('/api/staff/embed/send', staffMiddleware, async (req, res) => {
  if (!client.isReady()) {
    return res.status(500).json({ error: 'Discord bot is not connected.' });
  }

  const { channelId, content, embed } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Invalid or non-text channel ID.' });
    }

    const payload = {};
    if (content && content.trim().length > 0) {
      payload.content = content.trim();
    }

    if (embed) {
      const dEmbed = new EmbedBuilder();

      if (embed.title) dEmbed.setTitle(embed.title);
      if (embed.url) dEmbed.setURL(embed.url);
      if (embed.description) dEmbed.setDescription(embed.description);
      if (embed.color) dEmbed.setColor(embed.color);

      if (embed.author && (embed.author.name || embed.author.icon_url)) {
        dEmbed.setAuthor({
          name: embed.author.name || '\u200B',
          iconURL: embed.author.icon_url || undefined
        });
      }

      if (embed.image && embed.image.url) dEmbed.setImage(embed.image.url);
      if (embed.thumbnail && embed.thumbnail.url) dEmbed.setThumbnail(embed.thumbnail.url);

      if (embed.footer && (embed.footer.text || embed.footer.icon_url)) {
        dEmbed.setFooter({
          text: embed.footer.text || '\u200B',
          iconURL: embed.footer.icon_url || undefined
        });
      }

      if (embed.timestamp) dEmbed.setTimestamp();

      if (embed.fields && Array.isArray(embed.fields)) {
        for (const f of embed.fields) {
          if (f.name || f.value) {
            dEmbed.addFields({
              name: f.name || '\u200B',
              value: f.value || '\u200B',
              inline: !!f.inline
            });
          }
        }
      }

      payload.embeds = [dEmbed];
    }

    if (!payload.content && !payload.embeds) {
      return res.status(400).json({ error: 'Cannot send an empty message.' });
    }

    await channel.send(payload);
    logActivity(req.user.id, req.user.username, `Sent custom embed to channel ${channelId}`);

    res.json({ success: true });
  } catch (err) {
    log.error(`Failed to send custom embed: ${err.message}`);
    res.status(500).json({ error: `Discord Error: ${err.message}` });
  }
});

/* ---------- TICKET STATS ---------- */
app.get('/api/tickets/stats', staffMiddleware, (req, res) => {
  const all = [...tickets.values()];
  res.json({
    total: all.length,
    open: all.filter(t => t.status === 'open').length,
    inprogress: all.filter(t => t.status === 'inprogress').length,
    waiting: all.filter(t => t.status === 'waiting').length,
    closed: all.filter(t => t.status === 'closed').length
  });
});

// app.listen() will be run in bootstrap.

/* ---------- ticket assignment ---------- */
app.post("/api/tickets/:id/assign_duplicate_disabled", staffMiddleware, async (req, res) => {
  try {
    const ticket = tickets.get(req.params.id);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const { assignToId, assignToName } = req.body;


    if (!assignToId) {
      return res.status(400).json({ error: "No staff selected" });
    }

    ticket.assignedTo = {
      id: assignToId,
      username: assignToName || "Unknown Staff"
    };


    addStaffLog(
      req.user.id,
      req.user.username,
      `Assigned ticket ${ticket.id} to ${assignToName}`,

      ticket.id
    );

    savePersistedState();

    // ===== DISCORD NOTIFICATION =====
    try {
      const assignedUser = await client.users.fetch(assignToId);


      const embed = new EmbedBuilder()
        .setColor(0xf84762)
        .setTitle("🎫 Ticket Assigned")
        .setDescription(
          `You have been assigned to ticket **#${ticket.id}**\n\n` +
          `**Category:** ${ticket.category}\n` +
          `**Created By:** ${ticket.createdBy.username}\n` +
          `**Assigned By:** ${req.user.username}\n\n` +
          `Please review the ticket in the Staff Dashboard.`
        )
        .setTimestamp();

      // DM Assigned Staff
      await assignedUser.send({ embeds: [embed] });

      // Staff Log Channel Ping
      if (STAFF_LOG_CHANNEL_ID) {
        const channel = await client.channels.fetch(
          STAFF_LOG_CHANNEL_ID
        );

        if (channel) {
          await channel.send({
            content: `<@${assignToId}>`,

            embeds: [
              new EmbedBuilder()
                .setColor(0xf84762)
                .setTitle("🎫 Ticket Assigned")
                .setDescription(
                  `Ticket **#${ticket.id}** has been assigned to <@${assignToId}>`

                )
                .addFields(
                  {
                    name: "Assigned By",
                    value: req.user.username,
                    inline: true
                  },
                  {
                    name: "Category",
                    value: ticket.category,
                    inline: true
                  }
                )
                .setTimestamp()
            ]
          });
        }
      }
    } catch (err) {
      console.error("Failed to send assignment notification:", err);
    }

    res.json({
      success: true,
      assignedTo: ticket.assignedTo
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});



async function bootstrap() {
  // 1. Connect database
  await db.connectDB();

  // 2. Load persisted states
  await loadPersistedState();
  await loadEventsPersistedState();
  await loadMinigameLeaderboard();

  /* Start Discord bot only if a token is provided */
  if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => {
      log.error(`Discord login failed: ${err.message}`);
    });
  } else {
    log.info("No DISCORD_TOKEN found – running in web-only mode (dashboard still available).");
  }

  const PORT = process.env.PORT || 3333;
  app.listen(PORT, '0.0.0.0', () => {
    log.success(`Dashboard running on port ${PORT}`);
    log.info(`🌐 Local:   http://localhost:${PORT}`);

    try {
      const os = require('os');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            log.info(`🌐 Network: http://${net.address}:${PORT}`);
          }
        }
      }
    } catch (e) { }

    try {
      const redirectUri = process.env.DISCORD_REDIRECT_URI;
      if (redirectUri) {
        const url = new URL(redirectUri);
        log.info(`🌐 Public:  ${url.protocol}//${url.host}`);
      }
    } catch (e) { }

    // Server status monitoring disabled (removed per request)
    startMonitoring();
  });
}

bootstrap().catch(err => {
  console.error("Critical boot failure:", err);
});

/* Global exception and rejection handlers */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
});
