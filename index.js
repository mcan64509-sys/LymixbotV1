const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { Pool } = require("pg");

// ======================================================
// ENV
// ======================================================

const ENV = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  DATABASE_URL: process.env.DATABASE_URL,

  GENERAL_VOICE_CHANNEL_ID: process.env.GENERAL_VOICE_CHANNEL_ID,
  GENERAL_LOG_CHANNEL_ID: process.env.GENERAL_LOG_CHANNEL_ID,

  EJDER_VOICE_CHANNEL_ID: process.env.EJDER_VOICE_CHANNEL_ID,
  EJDER_LOG_CHANNEL_ID: process.env.EJDER_LOG_CHANNEL_ID,

  F9_VOICE_CHANNEL_ID: process.env.F9_VOICE_CHANNEL_ID,
  F9_LOG_CHANNEL_ID: process.env.F9_LOG_CHANNEL_ID,

  WELCOME_LOG_CHANNEL_ID: process.env.WELCOME_LOG_CHANNEL_ID,
  BOSS_BILDIRIM_CHANNEL_ID: process.env.BOSS_BILDIRIM_CHANNEL_ID,
  YETKILI_ROLE_ID: process.env.YETKILI_ROLE_ID || null,
};

const REQUIRED_ENV = [
  "TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "DATABASE_URL",
  "GENERAL_VOICE_CHANNEL_ID",
  "GENERAL_LOG_CHANNEL_ID",
  "EJDER_VOICE_CHANNEL_ID",
  "EJDER_LOG_CHANNEL_ID",
  "F9_VOICE_CHANNEL_ID",
  "F9_LOG_CHANNEL_ID",
  "WELCOME_LOG_CHANNEL_ID",
  "BOSS_BILDIRIM_CHANNEL_ID",
];

const missingEnv = REQUIRED_ENV.filter((key) => !ENV[key]);

if (missingEnv.length) {
  console.error("❌ Eksik Railway Variables:", missingEnv.join(", "));
  process.exit(1);
}

// ======================================================
// SABİTLER
// ======================================================

const BOT_FOOTER = "Nemesis Bot • Created By Lymix";
const DUPLICATE_WARNING_SECONDS = 20;
const CONFIRM_TIMEOUT_MS = 30_000;

const BOSS_TIMEZONE = "Europe/Amsterdam";

const BOSS_SCHEDULES = {
  general: [
    "12:12", "13:42", "15:12", "16:42",
    "18:10", "19:40", "21:10", "22:40",
    "00:10", "01:40", "03:10", "04:40",
    "06:10", "07:40", "09:10", "10:40",
  ],
  f9: [
    "12:40", "14:40", "16:40", "18:40",
    "20:40", "22:40", "00:40", "02:40",
    "04:40", "06:40", "08:40", "10:40",
  ],
};

const TYPES = {
  general: {
    key: "general",
    name: "GENERAL",
    emoji: "🛡️",
    prefix: "G",
    color: 0x3498db,
    voiceChannelId: ENV.GENERAL_VOICE_CHANNEL_ID,
    logChannelId: ENV.GENERAL_LOG_CHANNEL_ID,
    materialName: "Kıvrık",
    materialEmoji: "🌀",
  },
  ejder: {
    key: "ejder",
    name: "EJDER",
    emoji: "🐉",
    prefix: "E",
    color: 0xe74c3c,
    voiceChannelId: ENV.EJDER_VOICE_CHANNEL_ID,
    logChannelId: ENV.EJDER_LOG_CHANNEL_ID,
    materialName: "Sandık",
    materialEmoji: "📦",
  },
  f9: {
    key: "f9",
    name: "F9",
    emoji: "🕷️",
    prefix: "F",
    color: 0x9b59b6,
    voiceChannelId: ENV.F9_VOICE_CHANNEL_ID,
    logChannelId: ENV.F9_LOG_CHANNEL_ID,
    materialName: null,
    materialEmoji: null,
  },
};

const TYPE_CHOICES = [
  { name: "🛡️ General", value: "general" },
  { name: "🐉 Ejder", value: "ejder" },
  { name: "🕷️ F9", value: "f9" },
];

const MATERIAL_CHOICES = [
  { name: "🌀 General - Kıvrık", value: "general" },
  { name: "📦 Ejder - Sandık", value: "ejder" },
];

// ======================================================
// CLIENT + DATABASE
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("❌ PostgreSQL Pool Error:", error);
});

// ======================================================
// YARDIMCI FONKSİYONLAR
// ======================================================

function withFooter(embed) {
  return embed.setFooter({ text: BOT_FOOTER }).setTimestamp();
}

function feedbackEmbed(title, description, color = 0xed4245) {
  return withFooter(
    new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
  );
}

function getType(type) {
  return TYPES[type] || null;
}

function makeLogCode(type, number) {
  return `${TYPES[type].prefix}-${String(number).padStart(4, "0")}`;
}

function discordTime(date = new Date()) {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:f>`;
}

function isAuthorized(interaction) {
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!ENV.YETKILI_ROLE_ID) return false;
  return interaction.member.roles.cache.has(ENV.YETKILI_ROLE_ID);
}

async function requireAuthorized(interaction) {
  if (isAuthorized(interaction)) return true;

  await interaction.reply({
    embeds: [
      withFooter(
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("⛔ YETKİSİZ İŞLEM")
          .setDescription("Bu komutu kullanmak için yetkili olmalısın.")
      ),
    ],
    ephemeral: true,
  });

  return false;
}

async function fetchChannel(guild, channelId) {
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function getVoiceChannel(guild, type) {
  return fetchChannel(guild, TYPES[type].voiceChannelId);
}

async function getLogChannel(guild, type) {
  return fetchChannel(guild, TYPES[type].logChannelId);
}

function chunkLines(lines, maxLength = 950) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function addUserListFields(embed, lines, title = "👥 KULLANICILAR") {
  const chunks = chunkLines(lines);
  chunks.slice(0, 20).forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? title : "👥 Devam",
      value: chunk || "—",
      inline: false,
    });
  });

  if (chunks.length > 20) {
    embed.addFields({
      name: "⚠️ Liste",
      value: "Kullanıcı listesi çok uzun olduğu için kalan bölüm gösterilmedi.",
    });
  }
}

async function getCurrentUserSet(db, guildId, userId, type, lock = false) {
  const result = await db.query(
    `
      SELECT set_count
      FROM user_sets
      WHERE guild_id = $1
        AND user_id = $2
        AND type = $3
      ${lock ? "FOR UPDATE" : ""}
    `,
    [guildId, userId, type]
  );

  return result.rows.length ? Number(result.rows[0].set_count) : 0;
}

async function upsertUserSet(db, guildId, userId, username, type, newValue) {
  const result = await db.query(
    `
      INSERT INTO user_sets (
        guild_id, user_id, username, type, set_count
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (guild_id, user_id, type)
      DO UPDATE SET
        username = EXCLUDED.username,
        set_count = EXCLUDED.set_count
      RETURNING set_count
    `,
    [guildId, userId, username, type, newValue]
  );

  return Number(result.rows[0].set_count);
}

async function getMaterialCount(db, guildId, type, lock = false) {
  const result = await db.query(
    `
      SELECT material_count
      FROM materials
      WHERE guild_id = $1
        AND type = $2
      ${lock ? "FOR UPDATE" : ""}
    `,
    [guildId, type]
  );

  return result.rows.length ? Number(result.rows[0].material_count) : 0;
}

async function setMaterialCount(db, guildId, type, value) {
  const result = await db.query(
    `
      INSERT INTO materials (guild_id, type, material_count)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, type)
      DO UPDATE SET material_count = EXCLUDED.material_count
      RETURNING material_count
    `,
    [guildId, type, value]
  );

  return Number(result.rows[0].material_count);
}

async function nextLogNumber(db, guildId, type) {
  const result = await db.query(
    `
      INSERT INTO log_counters (guild_id, type, current_number)
      VALUES ($1, $2, 1)
      ON CONFLICT (guild_id, type)
      DO UPDATE SET current_number = log_counters.current_number + 1
      RETURNING current_number
    `,
    [guildId, type]
  );

  return Number(result.rows[0].current_number);
}

async function sendTypeLog(guild, type, payload) {
  const channel = await getLogChannel(guild, type);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`${type} log kanalı bulunamadı veya metin kanalı değil.`);
  }
  return channel.send(payload);
}

async function createAdjustment(
  db,
  {
    guildId,
    type,
    action,
    targetUserId = null,
    targetUsername = null,
    amount,
    oldValue,
    newValue,
    createdBy,
    createdByName,
  }
) {
  await db.query(
    `
      INSERT INTO adjustments (
        guild_id, type, action,
        target_user_id, target_username,
        amount, old_value, new_value,
        created_by, created_by_name
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      guildId,
      type,
      action,
      targetUserId,
      targetUsername,
      amount,
      oldValue,
      newValue,
      createdBy,
      createdByName,
    ]
  );
}

async function awaitConfirmation(interaction, embed, confirmLabel = "Onayla") {
  const nonce = `${interaction.id}-${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:${nonce}`)
      .setLabel(confirmLabel)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cancel:${nonce}`)
      .setLabel("İptal")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  const message = await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const button = await message.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: CONFIRM_TIMEOUT_MS,
    });

    if (button.customId === `cancel:${nonce}`) {
      await button.update({
        embeds: [
          withFooter(
            new EmbedBuilder()
              .setColor(0x747f8d)
              .setTitle("❌ İŞLEM İPTAL EDİLDİ")
          ),
        ],
        components: [],
      });
      return false;
    }

    await button.update({
      embeds: [embed],
      components: [],
    });

    return true;
  } catch {
    await interaction
      .editReply({
        embeds: [
          withFooter(
            new EmbedBuilder()
              .setColor(0x747f8d)
              .setTitle("⌛ İŞLEM ZAMAN AŞIMINA UĞRADI")
              .setDescription("İşlem uygulanmadı.")
          ),
        ],
        components: [],
      })
      .catch(() => {});

    return false;
  }
}

// ======================================================\n// BOSS BİLDİRİM SİSTEMİ\n// ======================================================\n\nfunction getAmsterdamParts(date = new Date()) {\n  const formatter = new Intl.DateTimeFormat("en-CA", {\n    timeZone: BOSS_TIMEZONE,\n    year: "numeric",\n    month: "2-digit",\n    day: "2-digit",\n    hour: "2-digit",\n    minute: "2-digit",\n    hour12: false,\n  });\n\n  const parts = Object.fromEntries(\n    formatter.formatToParts(date)\n      .filter((p) => p.type !== "literal")\n      .map((p) => [p.type, p.value])\n  );\n\n  return {\n    date: `${parts.year}-${parts.month}-${parts.day}`,\n    time: `${parts.hour}:${parts.minute}`,\n  };\n}\n\nfunction subtractMinutesFromHHMM(hhmm, minutes) {\n  const [hour, minute] = hhmm.split(":").map(Number);\n  let total = hour * 60 + minute - minutes;\n  total = ((total % 1440) + 1440) % 1440;\n\n  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(\n    total % 60\n  ).padStart(2, "0")}`;\n}\n\nfunction bossDateForReminder(localDate, bossTime, reminderTime) {\n  const [bh, bm] = bossTime.split(":").map(Number);\n  const [rh, rm] = reminderTime.split(":").map(Number);\n  const bossMinutes = bh * 60 + bm;\n  const reminderMinutes = rh * 60 + rm;\n  if (reminderMinutes <= bossMinutes) return localDate;\n\n  const [y, m, d] = localDate.split("-").map(Number);\n  const utc = new Date(Date.UTC(y, m - 1, d));\n  utc.setUTCDate(utc.getUTCDate() + 1);\n  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;\n}\n\nasync function checkBossNotifications() {\n  try {\n    if (!client.isReady()) return;\n\n    const guild = client.guilds.cache.get(ENV.GUILD_ID);\n    if (!guild) return;\n\n    const channel = await fetchChannel(guild, ENV.BOSS_BILDIRIM_CHANNEL_ID);\n    if (!channel || !channel.isTextBased()) return;\n\n    const now = getAmsterdamParts();\n\n    for (const [type, bossTimes] of Object.entries(BOSS_SCHEDULES)) {\n      const config = TYPES[type];\n      if (!config) continue;\n\n      for (const bossTime of bossTimes) {\n        const reminderTime = subtractMinutesFromHHMM(bossTime, 10);\n        if (now.time !== reminderTime) continue;\n\n        const bossDate = bossDateForReminder(now.date, bossTime, reminderTime);\n\n        const inserted = await pool.query(\n          `\n            INSERT INTO boss_notifications (guild_id, boss_type, boss_date, boss_time)\n            VALUES ($1, $2, $3, $4)\n            ON CONFLICT (guild_id, boss_type, boss_date, boss_time)\n            DO NOTHING\n            RETURNING id\n          `,\n          [guild.id, type, bossDate, bossTime]\n        );\n\n        if (!inserted.rows.length) continue;\n\n        const embed = withFooter(\n          new EmbedBuilder()\n            .setColor(config.color)\n            .setTitle(`${config.emoji} ${config.name} BOSS BİLDİRİMİ`)\n            .setDescription(\n              [\n                `⏰ **${config.name} bossuna 10 dakika kaldı!**`,\n                `🕒 **Boss Saati:** ${bossTime}`,\n              ].join("\\n")\n            )\n        );\n\n        try {\n          await channel.send({\n            content: "@everyone **Kalkın La Yatıklar** 😂",\n            embeds: [embed],\n            allowedMentions: { parse: ["everyone"] },\n          });\n\n          console.log(`✅ Boss bildirimi: ${config.name} ${bossDate} ${bossTime}`);\n        } catch (sendError) {\n          await pool.query(\n            `\n              DELETE FROM boss_notifications\n              WHERE guild_id = $1 AND boss_type = $2 AND boss_date = $3 AND boss_time = $4\n            `,\n            [guild.id, type, bossDate, bossTime]\n          );\n          throw sendError;\n        }\n      }\n    }\n  } catch (error) {\n    console.error("❌ Boss bildirim hatası:", error);\n  }\n}\n\n// ======================================================
// DATABASE ŞEMASI
// ======================================================

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sets (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      type TEXT NOT NULL,
      set_count INTEGER NOT NULL DEFAULT 0 CHECK (set_count >= 0),
      PRIMARY KEY (guild_id, user_id, type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS materials (
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      material_count INTEGER NOT NULL DEFAULT 0 CHECK (material_count >= 0),
      PRIMARY KEY (guild_id, type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_counters (
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      current_number INTEGER NOT NULL DEFAULT 0 CHECK (current_number >= 0),
      PRIMARY KEY (guild_id, type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      log_number INTEGER NOT NULL,
      log_code TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      voice_channel_name TEXT NOT NULL,
      material_added INTEGER NOT NULL DEFAULT 0 CHECK (material_added >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reverted_at TIMESTAMPTZ,
      reverted_by TEXT,
      reverted_by_name TEXT,
      UNIQUE (guild_id, log_code)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_members (
      id BIGSERIAL PRIMARY KEY,
      log_id BIGINT NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      old_set_count INTEGER NOT NULL,
      new_set_count INTEGER NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS adjustments (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      target_username TEXT,
      amount INTEGER NOT NULL,
      old_value INTEGER NOT NULL,
      new_value INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS period_archives (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      total_sets INTEGER NOT NULL DEFAULT 0,
      total_material INTEGER NOT NULL DEFAULT 0,
      total_logs INTEGER NOT NULL DEFAULT 0,
      reset_by TEXT NOT NULL,
      reset_by_name TEXT NOT NULL,
      closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id, type, period_number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS period_archive_users (
      id BIGSERIAL PRIMARY KEY,
      archive_id BIGINT NOT NULL REFERENCES period_archives(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      set_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS boss_notifications (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      boss_date TEXT NOT NULL,
      boss_time TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id, boss_type, boss_date, boss_time)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_type_created
      ON logs (guild_id, type, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_adjustments_type_created
      ON adjustments (guild_id, type, created_at DESC);
  `);

  console.log("✅ PostgreSQL tabloları hazır.");
}

// ======================================================
// SLASH COMMANDLAR
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("log")
    .setDescription("Belirlenen ses odasındaki herkese +1 set ekler.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Log türü").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addIntegerOption((o) =>
      o
        .setName("materyal")
        .setDescription("General = Kıvrık, Ejder = Sandık. F9 için boş bırak.")
        .setMinValue(0)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setekle")
    .setDescription("Bir kullanıcıya manuel set ekler.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Set türü").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addUserOption((o) =>
      o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("sayi").setDescription("Eklenecek set").setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setsil")
    .setDescription("Bir kullanıcıdan manuel set siler.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Set türü").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addUserOption((o) =>
      o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("sayi").setDescription("Silinecek set").setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("materyalekle")
    .setDescription("Kıvrık veya Sandık havuzuna manuel ekleme yapar.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Materyal türü").setRequired(true).addChoices(...MATERIAL_CHOICES)
    )
    .addIntegerOption((o) =>
      o.setName("sayi").setDescription("Eklenecek miktar").setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("materyalsil")
    .setDescription("Kıvrık veya Sandık havuzundan manuel siler.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Materyal türü").setRequired(true).addChoices(...MATERIAL_CHOICES)
    )
    .addIntegerOption((o) =>
      o.setName("sayi").setDescription("Silinecek miktar").setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ben")
    .setDescription("Kendi güncel set istatistiğini gösterir."),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Bir kullanıcının güncel set istatistiğini gösterir.")
    .addUserOption((o) =>
      o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("siralama")
    .setDescription("Set sıralamasını gösterir.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Tür").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addStringOption((o) =>
      o
        .setName("donem")
        .setDescription("Sıralama dönemi")
        .setRequired(true)
        .addChoices(
          { name: "🏆 Güncel", value: "guncel" },
          { name: "📅 Son 7 Gün", value: "haftalik" }
        )
    ),

  new SlashCommandBuilder()
    .setName("durum")
    .setDescription("General, Ejder ve F9 güncel durumunu gösterir."),

  new SlashCommandBuilder()
    .setName("sonlog")
    .setDescription("Bir kategorinin son loglarını gösterir.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Tür").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addIntegerOption((o) =>
      o
        .setName("adet")
        .setDescription("Kaç log gösterilsin? (1-10)")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("logdetay")
    .setDescription("Log ID ile log detayını gösterir.")
    .addStringOption((o) =>
      o.setName("id").setDescription("Örn: G-0001").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("loggeri")
    .setDescription("Yanlış bir logu Log ID ile geri alır.")
    .addStringOption((o) =>
      o.setName("id").setDescription("Örn: G-0001").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("logsifirla")
    .setDescription("Pay dağıtımı sonrası yeni dönemi sıfırdan başlatır.")
    .addStringOption((o) =>
      o
        .setName("tur")
        .setDescription("Sıfırlanacak alan")
        .setRequired(true)
        .addChoices(
          ...TYPE_CHOICES,
          { name: "💥 Hepsi", value: "hepsi" }
        )
    ),

  new SlashCommandBuilder()
    .setName("gecmis")
    .setDescription("Eski pay dağıtım dönemlerini gösterir.")
    .addStringOption((o) =>
      o.setName("tur").setDescription("Tür").setRequired(true).addChoices(...TYPE_CHOICES)
    )
    .addIntegerOption((o) =>
      o
        .setName("donem")
        .setDescription("Belirli dönem numarası. Boşsa son dönemler listelenir.")
        .setMinValue(1)
        .setRequired(false)
    ),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(ENV.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(ENV.CLIENT_ID, ENV.GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash komutları Discord'a yüklendi.");
}

// ======================================================
// GELEN / GİDEN
// ======================================================

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = await fetchChannel(member.guild, ENV.WELCOME_LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = withFooter(
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("👋 NEMESİS SUNUCUSUNA KATILDI!")
        .setDescription(`${member}, hoş geldin! 🖤`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("❌ guildMemberAdd:", error);
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    const channel = await fetchChannel(member.guild, ENV.WELCOME_LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = withFooter(
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("👋 NEMESİS SUNUCUSUNDAN AYRILDI!")
        .setDescription(`**${member.user.username}** aramızdan ayrıldı.`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("❌ guildMemberRemove:", error);
  }
});

// ======================================================
// İSTATİSTİK EMBED
// ======================================================

async function buildStatsEmbed(guildId, user) {
  const result = await pool.query(
    `
      SELECT type, set_count
      FROM user_sets
      WHERE guild_id = $1 AND user_id = $2
    `,
    [guildId, user.id]
  );

  const stats = { general: 0, ejder: 0, f9: 0 };
  for (const row of result.rows) {
    if (row.type in stats) stats[row.type] = Number(row.set_count);
  }

  const total = stats.general + stats.ejder + stats.f9;

  return withFooter(
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📊 NEMESİS SET İSTATİSTİĞİ")
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(`👤 ${user}`)
      .addFields(
        { name: "🛡️ GENERAL", value: `**${stats.general} Set**`, inline: true },
        { name: "🐉 EJDER", value: `**${stats.ejder} Set**`, inline: true },
        { name: "🕷️ F9", value: `**${stats.f9} Set**`, inline: true },
        { name: "🏆 TOPLAM", value: `**${total} Set**`, inline: false }
      )
  );
}

// ======================================================
// ARŞİV + SIFIRLAMA
// ======================================================

async function archiveAndResetType(db, interaction, type) {
  const guildId = interaction.guild.id;

  const usersResult = await db.query(
    `
      SELECT user_id, username, set_count
      FROM user_sets
      WHERE guild_id = $1
        AND type = $2
        AND set_count > 0
      ORDER BY set_count DESC
      FOR UPDATE
    `,
    [guildId, type]
  );

  const materialResult = await db.query(
    `
      SELECT material_count
      FROM materials
      WHERE guild_id = $1 AND type = $2
      FOR UPDATE
    `,
    [guildId, type]
  );

  const logsResult = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM logs
      WHERE guild_id = $1 AND type = $2
    `,
    [guildId, type]
  );

  const totalSets = usersResult.rows.reduce(
    (sum, row) => sum + Number(row.set_count),
    0
  );

  const totalMaterial = materialResult.rows.length
    ? Number(materialResult.rows[0].material_count)
    : 0;

  const totalLogs = Number(logsResult.rows[0].total);

  const periodResult = await db.query(
    `
      SELECT COALESCE(MAX(period_number), 0) + 1 AS next_period
      FROM period_archives
      WHERE guild_id = $1 AND type = $2
    `,
    [guildId, type]
  );

  const periodNumber = Number(periodResult.rows[0].next_period);

  const archiveResult = await db.query(
    `
      INSERT INTO period_archives (
        guild_id, type, period_number,
        total_sets, total_material, total_logs,
        reset_by, reset_by_name
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `,
    [
      guildId,
      type,
      periodNumber,
      totalSets,
      totalMaterial,
      totalLogs,
      interaction.user.id,
      interaction.member.displayName,
    ]
  );

  const archiveId = archiveResult.rows[0].id;

  for (const row of usersResult.rows) {
    await db.query(
      `
        INSERT INTO period_archive_users (
          archive_id, user_id, username, set_count
        )
        VALUES ($1,$2,$3,$4)
      `,
      [archiveId, row.user_id, row.username, Number(row.set_count)]
    );
  }

  // Aktif dönemi tamamen sıfırla.
  // Logs silinince log_members ON DELETE CASCADE ile otomatik silinir.
  await db.query(
    `DELETE FROM logs WHERE guild_id = $1 AND type = $2`,
    [guildId, type]
  );

  await db.query(
    `DELETE FROM user_sets WHERE guild_id = $1 AND type = $2`,
    [guildId, type]
  );

  await db.query(
    `DELETE FROM materials WHERE guild_id = $1 AND type = $2`,
    [guildId, type]
  );

  await db.query(
    `DELETE FROM adjustments WHERE guild_id = $1 AND type = $2`,
    [guildId, type]
  );

  await db.query(
    `DELETE FROM log_counters WHERE guild_id = $1 AND type = $2`,
    [guildId, type]
  );

  return {
    type,
    periodNumber,
    totalSets,
    totalMaterial,
    totalLogs,
    users: usersResult.rows,
  };
}

// ======================================================
// INTERACTION HANDLER
// ======================================================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // --------------------------------------------------
    // /LOG
    // --------------------------------------------------
    if (interaction.commandName === "log") {
      if (!(await requireAuthorized(interaction))) return;

      const type = interaction.options.getString("tur");
      const config = getType(type);
      const materialOption = interaction.options.getInteger("materyal");
      const material = materialOption ?? 0;

      if (!config) {
        return interaction.reply({
          embeds: [feedbackEmbed("❌ GEÇERSİZ TÜR", "Geçerli bir log türü seç.")],
          ephemeral: true,
        });
      }

      if (type !== "f9" && materialOption === null) {
        return interaction.reply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("❌ MATERYAL GEREKLİ")
                .setDescription(
                  type === "general"
                    ? "General logu için bu sette gelen **Kıvrık** sayısını gir."
                    : "Ejder logu için bu sette gelen **Sandık** sayısını gir."
                )
            ),
          ],
          ephemeral: true,
        });
      }

      if (type === "f9" && materialOption !== null) {
        return interaction.reply({
          embeds: [feedbackEmbed("❌ F9 MATERYAL KULLANMAZ", "F9 logunda materyal alanını boş bırak.")],
          ephemeral: true,
        });
      }

      const voiceChannel = await getVoiceChannel(interaction.guild, type);

      if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        return interaction.reply({
          embeds: [
            feedbackEmbed(
              "❌ SES KANALI BULUNAMADI",
              `${config.emoji} **${config.name}** ses kanalı bulunamadı. Railway kanal ID'sini kontrol et.`
            ),
          ],
          ephemeral: true,
        });
      }

      const voiceMembers = [...voiceChannel.members.values()].filter(
        (member) => !member.user.bot
      );

      if (!voiceMembers.length) {
        return interaction.reply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle("⚠️ SES ODASI BOŞ")
                .setDescription(`${config.emoji} **${config.name}** ses kanalında kullanıcı yok.`)
            ),
          ],
          ephemeral: true,
        });
      }

      const recentResult = await pool.query(
        `
          SELECT log_code, created_at
          FROM logs
          WHERE guild_id = $1
            AND type = $2
            AND reverted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [interaction.guild.id, type]
      );

      let duplicateWarning = "";
      if (recentResult.rows.length) {
        const recent = recentResult.rows[0];
        const secondsAgo =
          (Date.now() - new Date(recent.created_at).getTime()) / 1000;

        if (secondsAgo <= DUPLICATE_WARNING_SECONDS) {
          duplicateWarning =
            `\n\n⚠️ **ÇİFT LOG UYARISI:** ` +
            `\`${recent.log_code}\` sadece **${Math.max(1, Math.floor(secondsAgo))} saniye** önce alındı.`;
        }
      }

      const preview = withFooter(
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle(`${config.emoji} ${config.name} LOG HAZIR`)
          .setDescription(
            [
              `🔊 **Ses Odası:** ${voiceChannel}`,
              `👥 **Katılımcı:** ${voiceMembers.length} kişi`,
              type !== "f9"
                ? `${config.materialEmoji} **Bu Set ${config.materialName}:** +${material}`
                : null,
              duplicateWarning || null,
              "",
              "Bu log işlensin mi?",
            ]
              .filter(Boolean)
              .join("\n")
          )
      );

      const confirmed = await awaitConfirmation(interaction, preview, "Logu Al");
      if (!confirmed) return;

      const db = await pool.connect();

      try {
        await db.query("BEGIN");

        const logNumber = await nextLogNumber(db, interaction.guild.id, type);
        const logCode = makeLogCode(type, logNumber);

        const logInsert = await db.query(
          `
            INSERT INTO logs (
              guild_id, type, log_number, log_code,
              created_by, created_by_name,
              voice_channel_id, voice_channel_name,
              material_added
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id, created_at
          `,
          [
            interaction.guild.id,
            type,
            logNumber,
            logCode,
            interaction.user.id,
            interaction.member.displayName,
            voiceChannel.id,
            voiceChannel.name,
            type === "f9" ? 0 : material,
          ]
        );

        const dbLogId = logInsert.rows[0].id;
        const createdAt = logInsert.rows[0].created_at;
        const processedUsers = [];

        for (const voiceMember of voiceMembers) {
          const oldCount = await getCurrentUserSet(
            db,
            interaction.guild.id,
            voiceMember.id,
            type,
            true
          );

          const newCount = await upsertUserSet(
            db,
            interaction.guild.id,
            voiceMember.id,
            voiceMember.displayName,
            type,
            oldCount + 1
          );

          await db.query(
            `
              INSERT INTO log_members (
                log_id, user_id, username,
                old_set_count, new_set_count
              )
              VALUES ($1,$2,$3,$4,$5)
            `,
            [
              dbLogId,
              voiceMember.id,
              voiceMember.displayName,
              oldCount,
              newCount,
            ]
          );

          processedUsers.push({
            id: voiceMember.id,
            name: voiceMember.displayName,
            oldCount,
            newCount,
          });
        }

        let totalMaterial = null;

        if (type !== "f9") {
          const oldMaterial = await getMaterialCount(
            db,
            interaction.guild.id,
            type,
            true
          );

          totalMaterial = await setMaterialCount(
            db,
            interaction.guild.id,
            type,
            oldMaterial + material
          );
        }

        await db.query("COMMIT");

        const embed = withFooter(
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle(`${config.emoji} ${config.name} LOG ALINDI`)
            .setDescription(
              [
                `🆔 **Log ID:** \`${logCode}\``,
                `🔊 **Ses Odası:** ${voiceChannel}`,
                `👑 **Loglayan:** ${interaction.user}`,
                `📅 **Tarih:** ${discordTime(createdAt)}`,
              ].join("\n")
            )
        );

        addUserListFields(
          embed,
          processedUsers.map(
            (user) =>
              `👤 <@${user.id}> → **+1 Set** | Toplam: **${user.newCount} Set**`
          )
        );

        if (type !== "f9") {
          embed.addFields({
            name: `${config.materialEmoji} ${config.materialName.toUpperCase()}`,
            value:
              `➕ Bu Set: **+${material} ${config.materialName}**\n` +
              `📊 Toplam ${config.materialName}: **${totalMaterial}**`,
          });
        }

        embed.addFields({
          name: "👥 Katılımcı",
          value: `**${processedUsers.length} kişi**`,
          inline: true,
        });

        await sendTypeLog(interaction.guild, type, { embeds: [embed] });

        await interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("✅ LOG BAŞARIYLA KAYDEDİLDİ")
                .setDescription(
                  `${config.emoji} **${config.name}** • \`${logCode}\`\n` +
                  `👥 **${processedUsers.length}** kullanıcıya +1 set eklendi.` +
                  (type !== "f9"
                    ? `\n${config.materialEmoji} **+${material} ${config.materialName}** eklendi.`
                    : "")
                )
            ),
          ],
          components: [],
        });
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        console.error("❌ /log:", error);

        await interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("❌ LOG HATASI")
                .setDescription("Log kaydedilemedi. Railway loglarını kontrol et.")
            ),
          ],
          components: [],
        });
      } finally {
        db.release();
      }

      return;
    }

    // --------------------------------------------------
    // /SETEKLE + /SETSIL
    // --------------------------------------------------
    if (interaction.commandName === "setekle" || interaction.commandName === "setsil") {
      if (!(await requireAuthorized(interaction))) return;
      await interaction.deferReply({ ephemeral: true });

      const isAdd = interaction.commandName === "setekle";
      const type = interaction.options.getString("tur");
      const config = getType(type);
      const user = interaction.options.getUser("kullanici");
      const requested = interaction.options.getInteger("sayi");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const username = member?.displayName || user.username;

      const db = await pool.connect();

      try {
        await db.query("BEGIN");

        const oldValue = await getCurrentUserSet(
          db,
          interaction.guild.id,
          user.id,
          type,
          true
        );

        const actualAmount = isAdd ? requested : Math.min(oldValue, requested);
        const newValue = isAdd
          ? oldValue + actualAmount
          : Math.max(0, oldValue - actualAmount);

        await upsertUserSet(
          db,
          interaction.guild.id,
          user.id,
          username,
          type,
          newValue
        );

        await createAdjustment(db, {
          guildId: interaction.guild.id,
          type,
          action: isAdd ? "set_add" : "set_remove",
          targetUserId: user.id,
          targetUsername: username,
          amount: actualAmount,
          oldValue,
          newValue,
          createdBy: interaction.user.id,
          createdByName: interaction.member.displayName,
        });

        await db.query("COMMIT");

        const embed = withFooter(
          new EmbedBuilder()
            .setColor(isAdd ? 0x57f287 : 0xfee75c)
            .setTitle(isAdd ? "➕ MANUEL SET EKLENDİ" : "➖ MANUEL SET SİLİNDİ")
            .setDescription(
              [
                `${config.emoji} **Tür:** ${config.name}`,
                `👤 **Kullanıcı:** ${user}`,
                `${isAdd ? "➕" : "➖"} **Miktar:** ${actualAmount} Set`,
                `📊 **Önce:** ${oldValue}`,
                `📈 **Yeni Toplam:** ${newValue}`,
                `👑 **İşlemi Yapan:** ${interaction.user}`,
              ].join("\n")
            )
        );

        await sendTypeLog(interaction.guild, type, { embeds: [embed] }).catch(() => {});
        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        console.error(`❌ /${interaction.commandName}:`, error);
        return interaction.editReply("❌ Set işlemi başarısız.");
      } finally {
        db.release();
      }
    }

    // --------------------------------------------------
    // /MATERYALEKLE + /MATERYALSIL
    // --------------------------------------------------
    if (
      interaction.commandName === "materyalekle" ||
      interaction.commandName === "materyalsil"
    ) {
      if (!(await requireAuthorized(interaction))) return;
      await interaction.deferReply({ ephemeral: true });

      const isAdd = interaction.commandName === "materyalekle";
      const type = interaction.options.getString("tur");
      const config = getType(type);
      const requested = interaction.options.getInteger("sayi");

      const db = await pool.connect();

      try {
        await db.query("BEGIN");

        const oldValue = await getMaterialCount(
          db,
          interaction.guild.id,
          type,
          true
        );

        const actualAmount = isAdd ? requested : Math.min(oldValue, requested);
        const newValue = isAdd
          ? oldValue + actualAmount
          : Math.max(0, oldValue - actualAmount);

        await setMaterialCount(db, interaction.guild.id, type, newValue);

        await createAdjustment(db, {
          guildId: interaction.guild.id,
          type,
          action: isAdd ? "material_add" : "material_remove",
          amount: actualAmount,
          oldValue,
          newValue,
          createdBy: interaction.user.id,
          createdByName: interaction.member.displayName,
        });

        await db.query("COMMIT");

        const embed = withFooter(
          new EmbedBuilder()
            .setColor(isAdd ? 0x57f287 : 0xfee75c)
            .setTitle(
              `${config.materialEmoji} ${
                isAdd ? "MATERYAL EKLENDİ" : "MATERYAL SİLİNDİ"
              }`
            )
            .setDescription(
              [
                `${config.emoji} **Tür:** ${config.name}`,
                `${config.materialEmoji} **Materyal:** ${config.materialName}`,
                `${isAdd ? "➕" : "➖"} **Miktar:** ${actualAmount}`,
                `📊 **Önce:** ${oldValue}`,
                `📦 **Yeni Toplam:** ${newValue}`,
                `👑 **İşlemi Yapan:** ${interaction.user}`,
              ].join("\n")
            )
        );

        await sendTypeLog(interaction.guild, type, { embeds: [embed] }).catch(() => {});
        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        console.error(`❌ /${interaction.commandName}:`, error);
        return interaction.editReply("❌ Materyal işlemi başarısız.");
      } finally {
        db.release();
      }
    }

    // --------------------------------------------------
    // /BEN + /STATS
    // --------------------------------------------------
    if (interaction.commandName === "ben" || interaction.commandName === "stats") {
      await interaction.deferReply();

      const user =
        interaction.commandName === "ben"
          ? interaction.user
          : interaction.options.getUser("kullanici");

      const embed = await buildStatsEmbed(interaction.guild.id, user);
      return interaction.editReply({ embeds: [embed] });
    }

    // --------------------------------------------------
    // /SIRALAMA
    // --------------------------------------------------
    if (interaction.commandName === "siralama") {
      await interaction.deferReply();

      const type = interaction.options.getString("tur");
      const period = interaction.options.getString("donem");
      const config = getType(type);

      let result;

      if (period === "guncel") {
        result = await pool.query(
          `
            SELECT user_id, username, set_count AS score
            FROM user_sets
            WHERE guild_id = $1
              AND type = $2
              AND set_count > 0
            ORDER BY set_count DESC, username ASC
            LIMIT 20
          `,
          [interaction.guild.id, type]
        );
      } else {
        result = await pool.query(
          `
            SELECT
              user_id,
              MAX(username) AS username,
              SUM(delta)::int AS score
            FROM (
              SELECT
                lm.user_id,
                lm.username,
                1 AS delta
              FROM log_members lm
              JOIN logs l ON l.id = lm.log_id
              WHERE l.guild_id = $1
                AND l.type = $2
                AND l.reverted_at IS NULL
                AND l.created_at >= NOW() - INTERVAL '7 days'

              UNION ALL

              SELECT
                target_user_id AS user_id,
                target_username AS username,
                CASE
                  WHEN action = 'set_add' THEN amount
                  WHEN action = 'set_remove' THEN -amount
                  ELSE 0
                END AS delta
              FROM adjustments
              WHERE guild_id = $1
                AND type = $2
                AND target_user_id IS NOT NULL
                AND action IN ('set_add', 'set_remove')
                AND created_at >= NOW() - INTERVAL '7 days'
            ) x
            GROUP BY user_id
            HAVING SUM(delta) > 0
            ORDER BY score DESC
            LIMIT 20
          `,
          [interaction.guild.id, type]
        );
      }

      if (!result.rows.length) {
        return interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(config.color)
                .setTitle(`${config.emoji} ${config.name} SIRALAMASI`)
                .setDescription("📭 Henüz kayıt yok.")
            ),
          ],
        });
      }

      const medals = ["🥇", "🥈", "🥉"];
      const lines = result.rows.map(
        (row, index) =>
          `${medals[index] || `**${index + 1}.**`} <@${row.user_id}> → **${Number(
            row.score
          )} Set**`
      );

      const embed = withFooter(
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle(
            `${config.emoji} ${config.name} • ${
              period === "guncel" ? "GÜNCEL SIRALAMA" : "SON 7 GÜN"
            }`
          )
          .setDescription(lines.join("\n"))
      );

      return interaction.editReply({ embeds: [embed] });
    }

    // --------------------------------------------------
    // /DURUM
    // --------------------------------------------------
    if (interaction.commandName === "durum") {
      await interaction.deferReply();

      const setResult = await pool.query(
        `
          SELECT type, COALESCE(SUM(set_count), 0)::int AS total
          FROM user_sets
          WHERE guild_id = $1
          GROUP BY type
        `,
        [interaction.guild.id]
      );

      const materialResult = await pool.query(
        `
          SELECT type, material_count
          FROM materials
          WHERE guild_id = $1
        `,
        [interaction.guild.id]
      );

      const logResult = await pool.query(
        `
          SELECT type, COUNT(*)::int AS total
          FROM logs
          WHERE guild_id = $1
            AND reverted_at IS NULL
          GROUP BY type
        `,
        [interaction.guild.id]
      );

      const sets = { general: 0, ejder: 0, f9: 0 };
      const materials = { general: 0, ejder: 0 };
      const logs = { general: 0, ejder: 0, f9: 0 };

      setResult.rows.forEach((r) => (sets[r.type] = Number(r.total)));
      materialResult.rows.forEach(
        (r) => (materials[r.type] = Number(r.material_count))
      );
      logResult.rows.forEach((r) => (logs[r.type] = Number(r.total)));

      const embed = withFooter(
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📊 NEMESİS GÜNCEL DURUM")
          .addFields(
            {
              name: "🛡️ GENERAL",
              value:
                `👥 Toplam Set: **${sets.general}**\n` +
                `🌀 Toplam Kıvrık: **${materials.general}**\n` +
                `🧾 Log: **${logs.general}**`,
              inline: true,
            },
            {
              name: "🐉 EJDER",
              value:
                `👥 Toplam Set: **${sets.ejder}**\n` +
                `📦 Toplam Sandık: **${materials.ejder}**\n` +
                `🧾 Log: **${logs.ejder}**`,
              inline: true,
            },
            {
              name: "🕷️ F9",
              value:
                `👥 Toplam Set: **${sets.f9}**\n` +
                `🧾 Log: **${logs.f9}**`,
              inline: true,
            }
          )
      );

      return interaction.editReply({ embeds: [embed] });
    }

    // --------------------------------------------------
    // /SONLOG
    // --------------------------------------------------
    if (interaction.commandName === "sonlog") {
      await interaction.deferReply();

      const type = interaction.options.getString("tur");
      const limit = interaction.options.getInteger("adet") || 5;
      const config = getType(type);

      const result = await pool.query(
        `
          SELECT
            l.log_code,
            l.created_at,
            l.material_added,
            l.created_by,
            l.reverted_at,
            COUNT(lm.id)::int AS member_count
          FROM logs l
          LEFT JOIN log_members lm ON lm.log_id = l.id
          WHERE l.guild_id = $1 AND l.type = $2
          GROUP BY l.id
          ORDER BY l.created_at DESC
          LIMIT $3
        `,
        [interaction.guild.id, type, limit]
      );

      if (!result.rows.length) {
        return interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(config.color)
                .setTitle(`${config.emoji} ${config.name} SON LOGLAR`)
                .setDescription("📭 Henüz log yok.")
            ),
          ],
        });
      }

      const lines = result.rows.map((row) => {
        const state = row.reverted_at ? "❌" : "✅";
        const materialText =
          type !== "f9"
            ? ` • ${config.materialEmoji} +${Number(row.material_added)}`
            : "";

        return (
          `${state} \`${row.log_code}\` • 👥 **${Number(row.member_count)} kişi**` +
          `${materialText} • <@${row.created_by}> • ${discordTime(row.created_at)}`
        );
      });

      return interaction.editReply({
        embeds: [
          withFooter(
            new EmbedBuilder()
              .setColor(config.color)
              .setTitle(`${config.emoji} ${config.name} SON LOGLAR`)
              .setDescription(lines.join("\n"))
          ),
        ],
      });
    }

    // --------------------------------------------------
    // /LOGDETAY
    // --------------------------------------------------
    if (interaction.commandName === "logdetay") {
      await interaction.deferReply();

      const code = interaction.options.getString("id").trim().toUpperCase();

      const logResult = await pool.query(
        `
          SELECT *
          FROM logs
          WHERE guild_id = $1 AND log_code = $2
        `,
        [interaction.guild.id, code]
      );

      if (!logResult.rows.length) {
        return interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("❌ LOG BULUNAMADI")
                .setDescription(`\`${code}\` aktif dönemde bulunamadı.`)
            ),
          ],
        });
      }

      const log = logResult.rows[0];
      const config = getType(log.type);

      const members = await pool.query(
        `
          SELECT *
          FROM log_members
          WHERE log_id = $1
          ORDER BY id ASC
        `,
        [log.id]
      );

      const embed = withFooter(
        new EmbedBuilder()
          .setColor(log.reverted_at ? 0x747f8d : config.color)
          .setTitle(`${config.emoji} LOG DETAY • ${code}`)
          .setDescription(
            [
              `📌 **Durum:** ${log.reverted_at ? "❌ GERİ ALINDI" : "✅ AKTİF"}`,
              `👑 **Loglayan:** <@${log.created_by}>`,
              `🔊 **Ses Odası:** **${log.voice_channel_name}**`,
              `📅 **Tarih:** ${discordTime(log.created_at)}`,
            ]
              .filter(Boolean)
              .join("\n")
          )
      );

      addUserListFields(
        embed,
        members.rows.map(
          (row) =>
            `👤 <@${row.user_id}> → **${row.old_set_count} → ${row.new_set_count} Set**`
        )
      );

      if (log.type !== "f9") {
        embed.addFields({
          name: `${config.materialEmoji} ${config.materialName}`,
          value: `Bu log: **+${Number(log.material_added)}**`,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // --------------------------------------------------
    // /LOGGERI
    // --------------------------------------------------
    if (interaction.commandName === "loggeri") {
      if (!(await requireAuthorized(interaction))) return;

      const code = interaction.options.getString("id").trim().toUpperCase();

      const lookup = await pool.query(
        `
          SELECT *
          FROM logs
          WHERE guild_id = $1 AND log_code = $2
        `,
        [interaction.guild.id, code]
      );

      if (!lookup.rows.length) {
        return interaction.reply({
          embeds: [feedbackEmbed("❌ LOG BULUNAMADI", `\`${code}\` aktif dönemde bulunamadı.`)],
          ephemeral: true,
        });
      }

      const logPreview = lookup.rows[0];
      const previewConfig = getType(logPreview.type);

      if (logPreview.reverted_at) {
        return interaction.reply({
          embeds: [
            feedbackEmbed(
              "⚠️ LOG ZATEN GERİ ALINDI",
              `\`${code}\` daha önce geri alınmış.`,
              0xfee75c
            ),
          ],
          ephemeral: true,
        });
      }

      const previewEmbed = withFooter(
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("↩️ LOG GERİ ALMA ONAYI")
          .setDescription(
            [
              `🆔 **Log:** \`${code}\``,
              `${previewConfig.emoji} **Tür:** ${previewConfig.name}`,
              logPreview.type !== "f9"
                ? `${previewConfig.materialEmoji} **Geri alınacak ${previewConfig.materialName}:** ${Number(
                    logPreview.material_added
                  )}`
                : null,
              "",
              "Bu logdaki bütün +1 setler geri alınacak.",
            ]
              .filter(Boolean)
              .join("\n")
          )
      );

      const confirmed = await awaitConfirmation(interaction, previewEmbed, "Geri Al");
      if (!confirmed) return;

      const db = await pool.connect();

      try {
        await db.query("BEGIN");

        const logResult = await db.query(
          `
            SELECT *
            FROM logs
            WHERE guild_id = $1 AND log_code = $2
            FOR UPDATE
          `,
          [interaction.guild.id, code]
        );

        const log = logResult.rows[0];

        if (!log || log.reverted_at) {
          await db.query("ROLLBACK");
          return interaction.editReply({
            embeds: [
              feedbackEmbed(
                "⚠️ İŞLEM YAPILAMADI",
                "Log bulunamadı veya zaten geri alınmış.",
                0xfee75c
              ),
            ],
            components: [],
          });
        }

        const members = await db.query(
          `SELECT * FROM log_members WHERE log_id = $1`,
          [log.id]
        );

        for (const row of members.rows) {
          const current = await getCurrentUserSet(
            db,
            interaction.guild.id,
            row.user_id,
            log.type,
            true
          );

          await upsertUserSet(
            db,
            interaction.guild.id,
            row.user_id,
            row.username,
            log.type,
            Math.max(0, current - 1)
          );
        }

        if (log.type !== "f9" && Number(log.material_added) > 0) {
          const currentMaterial = await getMaterialCount(
            db,
            interaction.guild.id,
            log.type,
            true
          );

          await setMaterialCount(
            db,
            interaction.guild.id,
            log.type,
            Math.max(0, currentMaterial - Number(log.material_added))
          );
        }

        await db.query(
          `
            UPDATE logs
            SET
              reverted_at = NOW(),
              reverted_by = $3,
              reverted_by_name = $4
            WHERE guild_id = $1 AND log_code = $2
          `,
          [
            interaction.guild.id,
            code,
            interaction.user.id,
            interaction.member.displayName,
          ]
        );

        await db.query("COMMIT");

        const config = getType(log.type);

        const embed = withFooter(
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("↩️ LOG GERİ ALINDI")
            .setDescription(
              [
                `🆔 **Log ID:** \`${code}\``,
                `${config.emoji} **Tür:** ${config.name}`,
                `👥 **Geri alınan:** ${members.rows.length} kullanıcı × 1 set`,
                log.type !== "f9"
                  ? `${config.materialEmoji} **Geri alınan ${config.materialName}:** ${Number(
                      log.material_added
                    )}`
                  : null,
                `👑 **Geri Alan:** ${interaction.user}`,
              ]
                .filter(Boolean)
                .join("\n")
            )
        );

        await sendTypeLog(interaction.guild, log.type, { embeds: [embed] }).catch(
          () => {}
        );

        return interaction.editReply({ embeds: [embed], components: [] });
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        console.error("❌ /loggeri:", error);
        return interaction.editReply({
          embeds: [feedbackEmbed("❌ LOG GERİ ALINAMADI", "İşlem sırasında hata oluştu.")],
          components: [],
        });
      } finally {
        db.release();
      }
    }

    // --------------------------------------------------
    // /LOGSIFIRLA
    // --------------------------------------------------
    if (interaction.commandName === "logsifirla") {
      if (!(await requireAuthorized(interaction))) return;

      const selection = interaction.options.getString("tur");
      const typesToReset =
        selection === "hepsi" ? ["general", "ejder", "f9"] : [selection];

      const names = typesToReset
        .map((type) => `${TYPES[type].emoji} ${TYPES[type].name}`)
        .join("\n");

      const warningEmbed = withFooter(
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(
            selection === "hepsi"
              ? "💥 TÜM AKTİF DÖNEMLER SIFIRLANACAK"
              : `⚠️ ${TYPES[selection].name} SIFIRLANACAK`
          )
          .setDescription(
            [
              names,
              "",
              "📜 Önce dönem arşivi oluşturulacak.",
              "🧹 Aktif kullanıcı setleri sıfırlanacak.",
              "📦 Materyal sıfırlanacak.",
              "🧾 Aktif log geçmişi sıfırlanacak.",
              "🔢 Log ID tekrar **0001**'den başlayacak.",
              "",
              "**Bu işlem geri alınamaz.**",
            ].join("\n")
          )
      );

      const confirmed = await awaitConfirmation(
        interaction,
        warningEmbed,
        selection === "hepsi" ? "HEPSİNİ SIFIRLA" : "Sıfırla"
      );

      if (!confirmed) return;

      const db = await pool.connect();

      try {
        await db.query("BEGIN");

        const summaries = [];
        for (const type of typesToReset) {
          summaries.push(await archiveAndResetType(db, interaction, type));
        }

        await db.query("COMMIT");

        const summaryLines = summaries.map((summary) => {
          const config = getType(summary.type);
          return (
            `${config.emoji} **${config.name} • Dönem ${summary.periodNumber}**\n` +
            `👥 Set: **${summary.totalSets}**` +
            (summary.type !== "f9"
              ? ` • ${config.materialEmoji} ${config.materialName}: **${summary.totalMaterial}**`
              : "") +
            ` • 🧾 Log: **${summary.totalLogs}**`
          );
        });

        const embed = withFooter(
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ YENİ DÖNEM BAŞLADI")
            .setDescription(
              [
                ...summaryLines,
                "",
                "🔄 Aktif sayaçlar **0** oldu.",
                "🔢 Yeni loglar ilgili kategoride tekrar **0001**'den başlayacak.",
                "📜 Eski dönem sonuçları `/gecmis` ile görülebilir.",
              ].join("\n\n")
            )
        );

        for (const type of typesToReset) {
          await sendTypeLog(interaction.guild, type, { embeds: [embed] }).catch(
            () => {}
          );
        }

        return interaction.editReply({ embeds: [embed], components: [] });
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        console.error("❌ /logsifirla:", error);

        return interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("❌ SIFIRLAMA BAŞARISIZ")
                .setDescription("Hiçbir değişiklik uygulanmadı.")
            ),
          ],
          components: [],
        });
      } finally {
        db.release();
      }
    }

    // --------------------------------------------------
    // /GECMIS
    // --------------------------------------------------
    if (interaction.commandName === "gecmis") {
      await interaction.deferReply();

      const type = interaction.options.getString("tur");
      const period = interaction.options.getInteger("donem");
      const config = getType(type);

      if (!period) {
        const result = await pool.query(
          `
            SELECT *
            FROM period_archives
            WHERE guild_id = $1 AND type = $2
            ORDER BY period_number DESC
            LIMIT 5
          `,
          [interaction.guild.id, type]
        );

        if (!result.rows.length) {
          return interaction.editReply({
            embeds: [
              withFooter(
                new EmbedBuilder()
                  .setColor(config.color)
                  .setTitle(`${config.emoji} ${config.name} GEÇMİŞ`)
                  .setDescription("📭 Henüz kapanmış dönem yok.")
              ),
            ],
          });
        }

        const lines = result.rows.map(
          (row) =>
            `📜 **Dönem ${row.period_number}** • 👥 ${Number(
              row.total_sets
            )} Set` +
            (type !== "f9"
              ? ` • ${config.materialEmoji} ${Number(row.total_material)} ${config.materialName}`
              : "") +
            ` • 🧾 ${Number(row.total_logs)} Log • ${discordTime(row.closed_at)}`
        );

        return interaction.editReply({
          embeds: [
            withFooter(
              new EmbedBuilder()
                .setColor(config.color)
                .setTitle(`${config.emoji} ${config.name} • SON DÖNEMLER`)
                .setDescription(lines.join("\n"))
            ),
          ],
        });
      }

      const archiveResult = await pool.query(
        `
          SELECT *
          FROM period_archives
          WHERE guild_id = $1
            AND type = $2
            AND period_number = $3
        `,
        [interaction.guild.id, type, period]
      );

      if (!archiveResult.rows.length) {
        return interaction.editReply({
          embeds: [
            feedbackEmbed(
              "❌ DÖNEM BULUNAMADI",
              `${config.emoji} **${config.name} Dönem ${period}** bulunamadı.`
            ),
          ],
        });
      }

      const archive = archiveResult.rows[0];
      const users = await pool.query(
        `
          SELECT *
          FROM period_archive_users
          WHERE archive_id = $1
          ORDER BY set_count DESC, username ASC
          LIMIT 20
        `,
        [archive.id]
      );

      const medals = ["🥇", "🥈", "🥉"];
      const lines = users.rows.map(
        (row, index) =>
          `${medals[index] || `**${index + 1}.**`} <@${row.user_id}> → **${Number(
            row.set_count
          )} Set**`
      );

      const embed = withFooter(
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle(`${config.emoji} ${config.name} • DÖNEM ${period}`)
          .setDescription(
            [
              `👥 **Toplam Set:** ${Number(archive.total_sets)}`,
              type !== "f9"
                ? `${config.materialEmoji} **Toplam ${config.materialName}:** ${Number(
                    archive.total_material
                  )}`
                : null,
              `🧾 **Toplam Log:** ${Number(archive.total_logs)}`,
              `📅 **Dönem Sonu:** ${discordTime(archive.closed_at)}`,
              "",
              "🏆 **DÖNEM SIRALAMASI**",
              lines.length ? lines.join("\n") : "Kullanıcı kaydı yok.",
            ]
              .filter(Boolean)
              .join("\n")
          )
      );

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error("❌ Interaction Error:", error);

    try {
      const payload = {
        embeds: [
          withFooter(
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("❌ BEKLENMEYEN HATA")
              .setDescription("İşlem tamamlanamadı. Railway loglarını kontrol et.")
          ),
        ],
        components: [],
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
    } catch {}
  }
});

// ======================================================
// READY + START
// ======================================================

client.once("ready", () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🤖 Nemesis Bot aktif: ${client.user.tag}`);
  console.log("🐘 PostgreSQL: ONLINE");
  console.log("🚂 Railway: ONLINE");
  console.log("⏰ Boss bildirim sistemi: ONLINE (Europe/Amsterdam)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  checkBossNotifications();
  setInterval(checkBossNotifications, 30_000);
});

async function start() {
  try {
    console.log("🚀 Nemesis Bot başlatılıyor...");

    await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL bağlantısı başarılı.");

    await createTables();
    await registerCommands();
    await client.login(ENV.TOKEN);
  } catch (error) {
    console.error("❌ BOT BAŞLATILAMADI:", error);
    process.exit(1);
  }
}

start();
