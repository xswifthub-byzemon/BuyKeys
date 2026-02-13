const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// --- 🔧 ดึงค่าจาก Variables ใน Railway ---
const TOKEN = process.env.DISCORD_TOKEN;     // โทเค่นบอท
const CLIENT_ID = process.env.CLIENT_ID;     // ไอดีบอท (Application ID)
const OWNER_ID = process.env.OWNER_ID;       // ไอดีซีม่อน (Owner ID)
const PORT = process.env.PORT || 3000;

// --- 💾 ฐานข้อมูลจำลอง (เก็บในแรม) ---
// *หมายเหตุ: ถ้ารีสตาร์ทเซิฟ ข้อมูลจะหาย ถ้าจะเอาถาวรต้องเชื่อม MongoDB ภายหลังนะค้า*
let keyDatabase = {}; 

// ==========================================
// 🌐 ส่วนที่ 1: WEB SERVER (API สำหรับ Roblox)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// API เช็คคีย์ (สำหรับสคริปต์ Roblox)
app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) return res.json({ status: "error", msg: "ข้อมูลไม่ครบ" });

    const keyData = keyDatabase[key];
    if (!keyData) return res.json({ status: "invalid", msg: "ไม่พบคีย์นี้ในระบบ" });

    if (keyData.hwid === null) {
        // คีย์ใหม่ -> ผูก HWID ทันที
        keyData.hwid = hwid;
        keyData.used = true;
        keyData.usedDate = new Date().toISOString();
        return res.json({ status: "success", msg: "Activated Success" });
    } else if (keyData.hwid === hwid) {
        // คีย์เก่า แต่เครื่องเดิม -> ผ่าน
        return res.json({ status: "success", msg: "Welcome Back" });
    } else {
        // คีย์เก่า เครื่องใหม่ -> ไม่ผ่าน
        return res.json({ status: "hwid_mismatch", msg: "Hardware ID ไม่ตรง!" });
    }
});

app.listen(PORT, () => {
    console.log(`🌍 API Server น้องปาย รันที่พอร์ต ${PORT}`);
});

// ==========================================
// 🤖 ส่วนที่ 2: DISCORD BOT (Slash Commands)
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// สร้างรายการคำสั่ง
const commands = [
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('✨ สร้างคีย์ VIP ใหม่ (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('note')
            .setDescription('โน้ตกันลืม (เช่น ชื่อลูกค้า)')
            .setRequired(false)),
            
    new SlashCommandBuilder()
        .setName('checkkey')
        .setDescription('🔍 เช็คสถานะคีย์ (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการเช็ค')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('resetkey')
        .setDescription('🔄 รีเซ็ต HWID ของคีย์ (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการรีเซ็ต')
            .setRequired(true)),
]
.map(command => command.toJSON());

// ลงทะเบียนคำสั่ง Slash Command (ทำทุกครั้งที่บอทเริ่มทำงาน)
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('กำลังลงทะเบียน Slash Commands...');
        // ลงทะเบียนคำสั่งแบบ Global (อาจใช้เวลาอัปเดต 1 ชม.)
        // หรือถ้าอยากให้ขึ้นทันที ให้ใช้ Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) แทน
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียนคำสั่งเรียบร้อยแล้วค่า!');
    } catch (error) {
        console.error(error);
    }
})();

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // 🔒 ระบบความปลอดภัย: เช็คว่าเป็นซีม่อนรึเปล่า?
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '🚫 ขอโทษนะคะ! คำสั่งนี้ใช้ได้เฉพาะเจ้าของร้าน (Zemon) เท่านั้นค่ะ', ephemeral: true });
    }

    // --- คำสั่ง /genkey ---
    if (interaction.commandName === 'genkey') {
        const note = interaction.options.getString('note') || 'ไม่มีโน้ต';
        const newKey = "ZEMON-" + uuidv4().split('-')[0].toUpperCase() + "-" + uuidv4().split('-')[1].toUpperCase();
        
        // บันทึกลง Database
        keyDatabase[newKey] = {
            hwid: null,
            used: false,
            note: note,
            createdAt: new Date().toISOString()
        };

        await interaction.reply({ 
            content: `🎉 **สร้างคีย์สำเร็จค่าซีม่อน!**\n🔑 Key: \`${newKey}\`\n📝 Note: ${note}`, 
            ephemeral: true // เห็นแค่เราคนเดียว
        });
    }

    // --- คำสั่ง /checkkey ---
    else if (interaction.commandName === 'checkkey') {
        const key = interaction.options.getString('key');
        const data = keyDatabase[key];

        if (!data) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ในระบบค่ะ', ephemeral: true });

        const status = data.used ? "🔴 ใช้งานแล้ว" : "🟢 ว่าง";
        const hwidInfo = data.hwid ? `\n🖥️ HWID: \`${data.hwid}\`` : "";
        
        await interaction.reply({ 
            content: `📊 **ข้อมูลคีย์:** \`${key}\`\nสถานะ: ${status}\n📝 Note: ${data.note}${hwidInfo}`, 
            ephemeral: true 
        });
    }

    // --- คำสั่ง /resetkey ---
    else if (interaction.commandName === 'resetkey') {
        const key = interaction.options.getString('key');
        if (!keyDatabase[key]) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ค่ะ', ephemeral: true });

        keyDatabase[key].hwid = null;
        keyDatabase[key].used = false;

        await interaction.reply({ content: `✅ **รีเซ็ต HWID เรียบร้อยแล้วค่ะ!**\nลูกค้าสามารถเอาคีย์ \`${key}\` ไปใส่เครื่องใหม่ได้เลย`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
