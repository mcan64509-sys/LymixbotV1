const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");

const { Pool } = require("pg");

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !DATABASE_URL) {
  console.error("❌ Eksik environment variable!");
  process.exit(1);
}

// ======================================================
// DATABASE
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL,
});

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// ======================================================
// KATEGORİ AYARLARI
// ======================================================

const TYPES = {
  general: {
    name: "GENERAL",
    emoji: "🛡️",
    materialName: "Kıvrık",
    materialEmoji: "🌀",
    logPrefix: "G",
    color: 0x3498db,
  },

  ejder: {
    name: "EJDER",
    emoji: "🐉",
    materialName: "Sandık",
    materialEmoji: "📦",
    logPrefix: "E",
    color: 0xe74c3c,
  },

  f9: {
    name: "F9",
    emoji: "🕷️",
    materialName: null,
    materialEmoji: null,
    logPrefix: "F",
    color: 0x9b59b6,
  },
};

// ======================================================
// DATABASE TABLOLARI
// ======================================================

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sets (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      type TEXT NOT NULL,
      set_count INTEGER NOT NULL DEFAULT 0,

      PRIMARY KEY (guild_id, user_id, type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS materials (
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      material_count INTEGER NOT NULL DEFAULT 0,

      PRIMARY KEY (guild_id, type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL,
      log_number INTEGER NOT NULL,
      log_code TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      material_added INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),

      UNIQUE (guild_id, type, log_number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_members (
      id SERIAL PRIMARY KEY,
      log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      old_set_count INTEGER NOT NULL,
      new_set_count INTEGER NOT NULL
    );
  `);

  console.log("✅ PostgreSQL tabloları hazır.");
}

// ======================================================
// LOG ID
// ======================================================

async function getNextLogNumber(guildId, type) {
  const result = await pool.query(
    `
    SELECT COALESCE(MAX(log_number), 0) + 1 AS next_number
    FROM logs
    WHERE guild_id = $1
      AND type = $2
    `,
    [guildId, type]
  );

  return Number(result.rows[0].next_number);
}

function makeLogCode(type, number) {
  const prefix = TYPES[type].logPrefix;

  return `${prefix}-${String(number).padStart(4, "0")}`;
}

// ======================================================
// USER SET EKLE
// ======================================================

async function addUserSet(guildId, member, type) {
  const result = await pool.query(
    `
    INSERT INTO user_sets (
      guild_id,
      user_id,
      username,
      type,
      set_count
    )

    VALUES ($1, $2, $3, $4, 1)

    ON CONFLICT (guild_id, user_id, type)

    DO UPDATE SET
      username = EXCLUDED.username,
      set_count = user_sets.set_count + 1

    RETURNING set_count;
    `,
    [
      guildId,
      member.id,
      member.displayName,
      type,
    ]
  );

  return Number(result.rows[0].set_count);
}

// ======================================================
// MATERYAL EKLE
// ======================================================

async function addMaterial(guildId, type, amount) {
  const result = await pool.query(
    `
    INSERT INTO materials (
      guild_id,
      type,
      material_count
    )

    VALUES ($1, $2, $3)

    ON CONFLICT (guild_id, type)

    DO UPDATE SET
      material_count =
        materials.material_count + EXCLUDED.material_count

    RETURNING material_count;
    `,
    [
      guildId,
      type,
      amount,
    ]
  );

  return Number(result.rows[0].material_count);
}

// ======================================================
// SLASH COMMAND
// ======================================================

const commands = [
  new SlashCommandBuilder()

    .setName("log")

    .setDescription("Ses kanalındaki kişilere +1 set ekler.")

    .addStringOption(option =>
      option
        .setName("tur")
        .setDescription("Log türünü seç.")
        .setRequired(true)

        .addChoices(
          {
            name: "🛡️ General",
            value: "general",
          },
          {
            name: "🐉 Ejder",
            value: "ejder",
          },
          {
            name: "🕷️ F9",
            value: "f9",
          }
        )
    )

    .addIntegerOption(option =>
      option
        .setName("materyal")
        .setDescription("General için Kıvrık, Ejder için Sandık miktarı.")
        .setMinValue(0)
        .setRequired(false)
    ),

].map(command => command.toJSON());

// ======================================================
// KOMUTLARI DISCORD'A KAYDET
// ======================================================

async function registerCommands() {
  const rest = new REST({
    version: "10",
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands,
    }
  );

  console.log("✅ Slash komutları Discord'a yüklendi.");
}

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🤖 Bot aktif: ${client.user.tag}`);
  console.log("🚂 Railway bağlantısı aktif.");
  console.log("🐘 PostgreSQL bağlantısı aktif.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
});

// ======================================================
// INTERACTION
// ======================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  try {

    // ==================================================
    // /LOG
    // ==================================================

    if (interaction.commandName === "log") {

      await interaction.deferReply();

      const type =
        interaction.options.getString("tur");

      const material =
        interaction.options.getInteger("materyal") || 0;

      const config = TYPES[type];

      // ----------------------------------------------
      // Ses kanalı kontrolü
      // ----------------------------------------------

      const member = interaction.member;

      const voiceChannel =
        member.voice?.channel;

      if (!voiceChannel) {

        return interaction.editReply({
          content:
            "❌ Bu komutu kullanabilmek için bir ses kanalında olmalısın.",
        });

      }

      // ----------------------------------------------
      // Botları çıkar
      // ----------------------------------------------

      const members =
        [...voiceChannel.members.values()]
          .filter(m => !m.user.bot);

      if (members.length === 0) {

        return interaction.editReply({
          content:
            "⚠️ Ses kanalında loglanacak kullanıcı yok.",
        });

      }

      // ----------------------------------------------
      // Materyal kontrolü
      // ----------------------------------------------

      if (
        (type === "general" ||
         type === "ejder") &&
        material < 0
      ) {

        return interaction.editReply({
          content:
            "❌ Materyal miktarı 0 veya daha büyük olmalı.",
        });

      }

      // ----------------------------------------------
      // PostgreSQL transaction
      // ----------------------------------------------

      const db =
        await pool.connect();

      try {

        await db.query("BEGIN");

        // --------------------------------------------
        // Log ID
        // --------------------------------------------

        const numberResult =
          await db.query(
            `
            SELECT
              COALESCE(MAX(log_number), 0) + 1
              AS next_number

            FROM logs

            WHERE guild_id = $1
              AND type = $2
            `,
            [
              interaction.guild.id,
              type,
            ]
          );

        const logNumber =
          Number(numberResult.rows[0].next_number);

        const logCode =
          makeLogCode(
            type,
            logNumber
          );

        // --------------------------------------------
        // Log kaydı
        // --------------------------------------------

        const logResult =
          await db.query(
            `
            INSERT INTO logs (
              guild_id,
              type,
              log_number,
              log_code,
              created_by,
              created_by_name,
              voice_channel_id,
              material_added
            )

            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8
            )

            RETURNING id;
            `,
            [
              interaction.guild.id,
              type,
              logNumber,
              logCode,
              interaction.user.id,
              interaction.member.displayName,
              voiceChannel.id,
              type === "f9"
                ? 0
                : material,
            ]
          );

        const databaseLogId =
          logResult.rows[0].id;

        // --------------------------------------------
        // Kullanıcı setleri
        // --------------------------------------------

        const processedUsers = [];

        for (const voiceMember of members) {

          const oldResult =
            await db.query(
              `
              SELECT set_count

              FROM user_sets

              WHERE guild_id = $1
                AND user_id = $2
                AND type = $3
              `,
              [
                interaction.guild.id,
                voiceMember.id,
                type,
              ]
            );

          const oldCount =
            oldResult.rows.length
              ? Number(oldResult.rows[0].set_count)
              : 0;

          const newResult =
            await db.query(
              `
              INSERT INTO user_sets (
                guild_id,
                user_id,
                username,
                type,
                set_count
              )

              VALUES (
                $1,$2,$3,$4,1
              )

              ON CONFLICT (
                guild_id,
                user_id,
                type
              )

              DO UPDATE SET
                username = EXCLUDED.username,
                set_count =
                  user_sets.set_count + 1

              RETURNING set_count;
              `,
              [
                interaction.guild.id,
                voiceMember.id,
                voiceMember.displayName,
                type,
              ]
            );

          const newCount =
            Number(
              newResult.rows[0].set_count
            );

          processedUsers.push({
            id: voiceMember.id,
            name: voiceMember.displayName,
            oldCount,
            newCount,
          });

          await db.query(
            `
            INSERT INTO log_members (
              log_id,
              user_id,
              username,
              old_set_count,
              new_set_count
            )

            VALUES (
              $1,$2,$3,$4,$5
            );
            `,
            [
              databaseLogId,
              voiceMember.id,
              voiceMember.displayName,
              oldCount,
              newCount,
            ]
          );

        }

        // --------------------------------------------
        // Materyal
        // --------------------------------------------

        let totalMaterial = null;

        if (type !== "f9") {

          const materialResult =
            await db.query(
              `
              INSERT INTO materials (
                guild_id,
                type,
                material_count
              )

              VALUES (
                $1,$2,$3
              )

              ON CONFLICT (
                guild_id,
                type
              )

              DO UPDATE SET
                material_count =
                  materials.material_count
                  + EXCLUDED.material_count

              RETURNING material_count;
              `,
              [
                interaction.guild.id,
                type,
                material,
              ]
            );

          totalMaterial =
            Number(
              materialResult.rows[0].material_count
            );

        }

        await db.query("COMMIT");

        // --------------------------------------------
        // Kullanıcı listesi
        // --------------------------------------------

        const userLines =
          processedUsers
            .map(user =>
              `👤 **${user.name}** → ` +
              `\`+1 Set\` | ` +
              `Toplam: **${user.newCount} Set**`
            )
            .join("\n");

        // --------------------------------------------
        // Embed
        // --------------------------------------------

        const embed =
          new EmbedBuilder()

            .setColor(config.color)

            .setTitle(
              `${config.emoji} ${config.name} LOG EKLENDİ`
            )

            .setDescription(
              [
                `🔊 **Ses Odası:** ${voiceChannel}`,
                `👑 **Loglayan:** ${interaction.user}`,
                `🆔 **Log ID:** \`${logCode}\``,
                "",
                "━━━━━━━━━━━━━━━━━━━━",
                "",
                "👥 **KULLANICILAR**",
                "",
                userLines,
              ].join("\n")
            );

        // --------------------------------------------
        // Materyal alanı
        // --------------------------------------------

        if (type !== "f9") {

          embed.addFields({
            name:
              `${config.materialEmoji} ${config.materialName.toUpperCase()}`,

            value:
              `➕ Eklenen: **+${material} ${config.materialName}**\n` +
              `📊 Toplam ${config.materialName}: **${totalMaterial}**`,
          });

        }

        embed.addFields(
          {
            name: "👥 Katılımcı",
            value: `**${processedUsers.length} kişi**`,
            inline: true,
          },
          {
            name: "📅 Tarih",
            value:
              `<t:${Math.floor(Date.now() / 1000)}:f>`,
            inline: true,
          }
        );

        embed.setFooter({
          text:
            `LymixV1 • ${logCode}`,
        });

        embed.setTimestamp();

        // --------------------------------------------
        // Gönder
        // --------------------------------------------

        await interaction.editReply({
          embeds: [embed],
        });

      } catch (error) {

        await db.query("ROLLBACK");

        console.error(
          "❌ LOG TRANSACTION ERROR:",
          error
        );

        return interaction.editReply({
          content:
            "❌ Log kaydedilirken veritabanı hatası oluştu.",
        });

      } finally {

        db.release();

      }

    }

  } catch (error) {

    console.error(
      "❌ Interaction error:",
      error
    );

    try {

      if (
        interaction.deferred ||
        interaction.replied
      ) {

        await interaction.editReply({
          content:
            "❌ Beklenmeyen bir hata oluştu.",
        });

      } else {

        await interaction.reply({
          content:
            "❌ Beklenmeyen bir hata oluştu.",
          ephemeral: true,
        });

      }

    } catch {}

  }

});

// ======================================================
// DATABASE ERRORS
// ======================================================

pool.on(
  "error",
  error => {
    console.error(
      "❌ PostgreSQL Pool Error:",
      error
    );
  }
);

// ======================================================
// START
// ======================================================

async function start() {

  try {

    console.log("🚀 LymixV1 başlatılıyor...");

    await pool.query("SELECT NOW()");

    console.log(
      "✅ PostgreSQL bağlantısı başarılı."
    );

    await createTables();

    await registerCommands();

    await client.login(TOKEN);

  } catch (error) {

    console.error(
      "❌ BOT BAŞLATILAMADI:",
      error
    );

    process.exit(1);

  }

}

start();
