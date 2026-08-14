require("dotenv").config(); // Toujours en premier
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const Checkin = require("./models/Checkin");
const cron = require("node-cron");
const session = require("express-session");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);
const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PWD = process.env.ADMIN_PWD;

const authGuard = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect("/login");
  }
};

app.get("/login", (req, res) => {
  const error = req.query.error;

  res.send(`
    <html>
      <head>
        <title>Login RH</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f1f5f9; margin:0; }
          .login-card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 350px; }
          h2 { margin-bottom: 8px; text-align: center; color: #1e293b; }
          p.subtitle { text-align: center; color: #64748b; font-size: 0.9rem; margin-bottom: 24px; }
          input { width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 8px; box-sizing: border-box; outline: none; transition: border 0.2s; }
          input:focus { border-color: #2563eb; }
          button { width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 1rem; }
          button:hover { background: #1d4ed8; }
          .error-msg { 
            background: #fef2f2; 
            color: #dc2626; 
            padding: 10px; 
            border-radius: 6px; 
            font-size: 0.85rem; 
            margin-bottom: 16px; 
            text-align: center;
            border: 1px solid #fecaca;
            display: ${error ? "block" : "none"}; /* N'affiche que s'il y a une erreur */
          }
        </style>
      </head>
      <body style="background-image: url('./assets/images/_.jpeg'); background-size: cover; background-position: center; background-attachment: fixed; background-repeat: no-repeat;">
        <div class="login-card">
          <h2>Connexion Admin</h2>
          <p class="subtitle">Accès réservé au personnel RH</p>
          
          <div class="error-msg">Identifiants incorrects. Veuillez réessayer.</div>

          <form action="/login" method="POST">
            <input type="text" name="id" placeholder="Identifiant" required>
            <input type="password" name="password" placeholder="Mot de passe" required>
            <button type="submit">Se connecter</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post("/login", (req, res) => {
  const { id, password } = req.body;

  if (id === ADMIN_ID && password === ADMIN_PWD) {
    req.session.isAdmin = true;
    res.redirect("/admin");
  } else {
    res.redirect("/login?error=1");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.log(err);
    res.redirect("/login");
  });
});

// Appliquer la protection à la route admin
function sendHtmlPage(res, fileName) {
  const fs = require("fs");
  let html = fs.readFileSync(path.join(__dirname, fileName), "utf8");
  html = html.replaceAll("__SERVER_URL__", process.env.SERVER_URL);
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}

app.get("/admin", authGuard, (req, res) => {
  sendHtmlPage(res, "admin.html");
});

app.get("/gestion", authGuard, (req, res) => {
  sendHtmlPage(res, "gestion.html");
});

// Création du serveur HTTP pour Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Connexion MongoDB
mongoose
  .connect(process.env.URL_BD)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch((err) => console.error("❌ Erreur DB:", err));

// Une ligne par employé/jour : les heures s'empilent dans sessions[]
async function emitTodayList() {
  const today = new Date().toLocaleDateString("fr-CA");
  const updatedData = await Checkin.find({ date: today }).sort({
    _id: -1,
  });
  io.emit("update-list", updatedData);
}

// --- API : Réception des pointages depuis Electron ---
app.post("/checkin", async (req, res) => {
  const { nom, pcName, ip, action, sessionId } = req.body;
  const nowTime = new Date().toLocaleTimeString("fr-FR");
  const today = new Date().toLocaleDateString("fr-CA");
  const crypto = require("crypto");

  try {
    let record = await Checkin.findOne({ nom, date: today });

    if (action === "start") {
      const newSessionId = sessionId || crypto.randomUUID();

      if (!record) {
        record = new Checkin({
          nom,
          pcName,
          ip,
          date: today,
          sessions: [{ sessionId: newSessionId, debut: nowTime, fin: "--" }],
          statut: "En ligne 🟢",
          lastHeartbeat: new Date(),
          activeSessionId: newSessionId,
        });
      } else {
        if (!record.sessions || record.sessions.length === 0) {
          if (record.debut) {
            record.sessions = [
              {
                sessionId: crypto.randomUUID(),
                debut: record.debut,
                fin: record.fin || "--",
              },
            ];
          } else {
            record.sessions = [];
          }
        }

        // Ferme les sessions encore ouvertes avant d'en ouvrir une nouvelle
        for (const s of record.sessions) {
          if (s.fin === "--" || !s.fin) {
            s.fin = nowTime;
          }
        }

        record.pcName = pcName;
        record.ip = ip;
        record.sessions.push({
          sessionId: newSessionId,
          debut: nowTime,
          fin: "--",
        });
        record.statut = "En ligne 🟢";
        record.lastHeartbeat = new Date();
        record.activeSessionId = newSessionId;
      }
      await record.save();
    } else if (action === "heartbeat") {
      if (!record || record.statut !== "En ligne 🟢") {
        return res.status(200).send({ message: "Ignoré" });
      }
      // Ignore un heartbeat d'une ancienne session
      if (
        sessionId &&
        record.activeSessionId &&
        sessionId !== record.activeSessionId
      ) {
        return res.status(200).send({ message: "Ignoré (ancienne session)" });
      }
      record.lastHeartbeat = new Date();
      await record.save();
      return res.status(200).send({ message: "Ok" });
    } else if (action === "stop" && record) {
      // Un stop en retard (après un "Reprendre") ne doit PAS couper la nouvelle session
      if (
        sessionId &&
        record.activeSessionId &&
        sessionId !== record.activeSessionId
      ) {
        return res.status(200).send({ message: "Stop ignoré (session obsolète)" });
      }

      if (!record.sessions || record.sessions.length === 0) {
        if (record.debut) {
          record.sessions = [
            {
              sessionId: record.activeSessionId || crypto.randomUUID(),
              debut: record.debut,
              fin: record.fin || "--",
            },
          ];
        } else {
          record.sessions = [];
        }
      }

      let closed = false;
      for (let i = record.sessions.length - 1; i >= 0; i--) {
        const s = record.sessions[i];
        if (s.fin !== "--" && s.fin) continue;
        if (sessionId && s.sessionId && s.sessionId !== sessionId) continue;
        s.fin = nowTime;
        closed = true;
        break;
      }

      if (closed || !sessionId) {
        record.statut = "Déconnecté 🔴";
        record.lastHeartbeat = null;
        record.activeSessionId = null;
        await record.save();
      } else {
        return res.status(200).send({ message: "Stop sans session ouverte" });
      }
    }

    await emitTodayList();
    res.status(200).send({ message: "Ok" });
  } catch (err) {
    console.error("Erreur checkin:", err);
    res.status(500).send(err);
  }
});

// --- API : Récupération des données (Filtre par date) ---
app.get("/api/status", async (req, res) => {
  const filterDate = req.query.date || new Date().toLocaleDateString("fr-CA");
  try {
    const results = await Checkin.find({ date: filterDate }).sort({
      _id: -1,
    });
    res.json(results);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Connexion Socket.io (optionnel, pour debug)
io.on("connection", (socket) => {
  console.log("📡 Un administrateur est connecté au dashboard");
});

// --- API : Supprimer un pointage ---
app.delete("/api/checkin/:id", async (req, res) => {
  try {
    await Checkin.findByIdAndDelete(req.params.id);
    await emitTodayList();
    res.status(200).json({ message: "Supprimé avec succès" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API : Liste des employés (uniques) ---
app.get("/api/employees", async (req, res) => {
  try {
    const employees = await Checkin.aggregate([
      { $sort: { _id: -1 } },
      {
        $group: {
          _id: "$nom",
          nom: { $first: "$nom" },
          pcName: { $first: "$pcName" },
        },
      },
      { $sort: { nom: 1 } },
    ]);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API : Supprimer tous les pointages d'un employé ---
app.delete("/api/employees/:nom", async (req, res) => {
  try {
    const nom = decodeURIComponent(req.params.nom);
    await Checkin.deleteMany({ nom });
    await emitTodayList();
    res.status(200).json({ message: "Employé supprimé" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat : si plus de ping depuis 15s → clôture auto
const HEARTBEAT_TIMEOUT_MS = 15 * 1000;

function closeOpenSessions(record, finTime, statut) {
  if (!record.sessions || record.sessions.length === 0) {
    if (record.debut) {
      record.sessions = [
        {
          sessionId: record.activeSessionId || null,
          debut: record.debut,
          fin: record.fin || finTime,
        },
      ];
    } else {
      record.sessions = [];
    }
  }
  for (let i = record.sessions.length - 1; i >= 0; i--) {
    if (record.sessions[i].fin === "--" || !record.sessions[i].fin) {
      record.sessions[i].fin = finTime;
    }
  }
  record.statut = statut;
  record.lastHeartbeat = null;
  record.activeSessionId = null;
}

setInterval(async () => {
  try {
    const today = new Date().toLocaleDateString("fr-CA");
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

    const staleRecords = await Checkin.find({
      date: today,
      statut: "En ligne 🟢",
      $or: [
        { lastHeartbeat: { $lt: cutoff } },
        { lastHeartbeat: null },
        { lastHeartbeat: { $exists: false } },
      ],
    });

    if (staleRecords.length === 0) return;

    let closed = 0;
    for (const record of staleRecords) {
      // Session encore active (heartbeat récent)
      if (record.lastHeartbeat && record.lastHeartbeat >= cutoff) continue;

      const finTime = record.lastHeartbeat
        ? new Date(record.lastHeartbeat).toLocaleTimeString("fr-FR")
        : new Date().toLocaleTimeString("fr-FR");

      closeOpenSessions(record, finTime, "Déconnecté (Auto) 🔴");
      await record.save();
      closed++;
    }

    if (closed > 0) {
      console.log(`⏱️ ${closed} session(s) fermée(s) (plus de heartbeat)`);
      await emitTodayList();
    }
  } catch (err) {
    console.error("Erreur contrôle heartbeat:", err);
  }
}, 5000);


// TACHE AUTOMATIQUE : Tous les jours à 00h00 — déconnecte tous les users encore en ligne
cron.schedule(
  "0 0 * * *",
  async () => {
    console.log("🕛 Minuit : clôture automatique de toutes les sessions ouvertes...");

    try {
      const openRecords = await Checkin.find({
        statut: "En ligne 🟢",
      });

      let closedCount = 0;
      for (const record of openRecords) {
        closeOpenSessions(record, "23:59:59", "Déconnecté (Auto) 🔴");
        await record.save();
        closedCount++;
      }

      if (closedCount > 0) {
        console.log(
          `✅ ${closedCount} employé(s) déconnecté(s) automatiquement à minuit.`,
        );
      }

      // Refresh admin (liste du nouveau jour = souvent vide)
      await emitTodayList();
    } catch (err) {
      console.error("❌ Erreur lors de la clôture de minuit:", err);
    }
  },
  {
    timezone: "Indian/Antananarivo",
  },
);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur RH lancé sur http://localhost:${PORT}`);
});
