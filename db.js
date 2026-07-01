const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

const TicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  discordUserId: String,
  channelId: String,
  status: String,
  category: String,
  description: String,
  screenshotUrl: String,
  createdBy: mongoose.Schema.Types.Mixed,
  claimedBy: mongoose.Schema.Types.Mixed,
  assignedTo: mongoose.Schema.Types.Mixed,
  replies: { type: Array, default: [] },
  messages: { type: Array, default: [] },
  createdAt: Number,
  updatedAt: Number,
  closedAt: Number,
  closedBy: mongoose.Schema.Types.Mixed,
  assignedName: String,
  rating: Number,
  ratingComment: String,
  subject: String,
  creatorName: String
}, { minimize: false, strict: false });

const UserStatusSchema = new mongoose.Schema({
  discordUserId: { type: String, required: true, unique: true },
  status: String,
  whitelistQuestions: { type: Array, default: [] },
  quizScore: Number,
  ts: Number,
  minecraftIGN: String,
  discordId: String,
  discordUsername: String,
  discordAvatar: String,
  ign: String,
  age: Number,
  country: String,
  experience: String,
  playerType: String,
  plans: String,
  banHistory: String,
  weeklyHours: String,
  whyWhitelist: String,
  score: Number,
  submittedAt: Number,
  reviewMessageId: String,
  reviewedBy: String,
  reviewedAt: Number,
  rejectReason: String
}, { minimize: false, strict: false });

const StaffTodoSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  task: String,
  status: String,
  assignedTo: String,
  assignedName: String,
  createdAt: Number,
  completedAt: Number
});

const StaffLogSchema = new mongoose.Schema({
  action: String,
  staffId: String,
  staffName: String,
  details: String,
  ts: Number
});

const ActivityLogSchema = new mongoose.Schema({
  type: String,
  message: String,
  ts: Number
});

const StaffWorkUpdateSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  staffId: String,
  staffName: String,
  staffAvatar: String,
  category: String,
  summary: String,
  ts: Number
});

const GalleryItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  url: String,
  description: String,
  ts: Number
});

const TeamMemberSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  name: String,
  initials: String,
  role: String,
  title: String,
  skills: String,
  avatar: String,
  position: { type: Number, default: 0 }
});

const EventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  description: String,
  type: String,
  startsAt: Number,
  endsAt: Number,
  completed: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  createdAt: Number,
  updatedAt: Number,
  createdBy: mongoose.Schema.Types.Mixed,
  discordAnnouncementText: String
}, { minimize: false });

const MinigameScoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  gameId: String,
  playerId: String,
  playerName: String,
  score: Number,
  level: Number,
  timeMs: Number,
  ts: Number
});

const CounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, required: true }
});

const HallEntrySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['shame', 'appreciation'], required: true },
  playerName: { type: String, required: true },
  discordId: String,
  minecraftIGN: String,
  discordAvatar: String,
  reason: { type: String, required: true },
  addedBy: String,
  addedAt: { type: Number, default: Date.now }
}, { minimize: false });

const Ticket = mongoose.model("Ticket", TicketSchema);
const UserStatus = mongoose.model("UserStatus", UserStatusSchema);
const StaffTodo = mongoose.model("StaffTodo", StaffTodoSchema);
const StaffLog = mongoose.model("StaffLog", StaffLogSchema);
const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema);
const StaffWorkUpdate = mongoose.model("StaffWorkUpdate", StaffWorkUpdateSchema);
const GalleryItem = mongoose.model("GalleryItem", GalleryItemSchema);
const TeamMember = mongoose.model("TeamMember", TeamMemberSchema);
const EventModel = mongoose.model("Event", EventSchema);
const MinigameScore = mongoose.model("MinigameScore", MinigameScoreSchema);
const Counter = mongoose.model("Counter", CounterSchema);
const HallEntry = mongoose.model("HallEntry", HallEntrySchema);

let isConnected = false;

async function connectDB() {
  if (!MONGODB_URI) {
    console.log("[MongoDB] MONGODB_URI environment variable not configured. Using local JSON fallback.");
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("[MongoDB] Connected successfully to Database.");
    return true;
  } catch (error) {
    console.error("[MongoDB] Connection error:", error.message);
    return false;
  }
}

const ContractSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  budget: String,
  category: String,
  status: { type: String, default: "open" },
  createdBy: mongoose.Schema.Types.Mixed,
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  assignedPlayer: mongoose.Schema.Types.Mixed,
  quotations: { type: Array, default: [] },
  bill: mongoose.Schema.Types.Mixed
}, { minimize: false, strict: false });

const Contract = mongoose.model("Contract", ContractSchema);

module.exports = {
  connectDB,
  isConnected: () => isConnected,
  Ticket,
  UserStatus,
  StaffTodo,
  StaffLog,
  ActivityLog,
  StaffWorkUpdate,
  GalleryItem,
  TeamMember,
  Event: EventModel,
  MinigameScore,
  Counter,
  HallEntry,
  Contract
};
