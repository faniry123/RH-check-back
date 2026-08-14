const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    sessionId: String,
    debut: String,
    fin: { type: String, default: "--" },
  },
  { _id: false },
);

const CheckinSchema = new mongoose.Schema({
  nom: String,
  pcName: String,
  ip: String,
  date: { type: String, default: () => new Date().toLocaleDateString("fr-CA") },
  sessions: { type: [SessionSchema], default: [] },
  // Conservés pour compatibilité avec d'anciens documents
  debut: String,
  fin: { type: String, default: "--" },
  statut: String,
  lastHeartbeat: { type: Date, default: null },
  activeSessionId: { type: String, default: null },
});

module.exports = mongoose.model("Checkin", CheckinSchema);
