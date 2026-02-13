const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// --- 🔧 ดึงค่าจาก Variables ใน Railway ---
const TOKEN = process.env.DISCORD_TOKEN;     
const CLIENT_ID = process.env.CLIENT_ID;     
const OWNER_ID = process.env.OWNER_ID;       
const PORT = process.env.PORT || 3000;

// --- 💾 ฐานข้อมูลจำลอง (เก็บในแรม) ---
let keyDatabase = {}; 

// ==========================================
// 🌐 ส่วนที่ 1: WEB SERVER (API)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) return res.json({ status: "error", msg: "ข้อมูลไม่ครบ" });

    const keyData = keyDatabase[key];
    if (!keyData) return res.json({ status: "invalid", msg: "ไม่พบคีย์นี้ในระบบ" });

    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        keyData.used = true;
        keyData.usedDate = new Date().toISOString();
        return res.json({ status: "success", msg: "Activated Success" });
    } else if (keyData.hwid === hwid) {
        return res.json({ status: "success", msg: "Welcome Back" });
    } else {
        return res.json({ status: "hwid_mismatch", msg: "Hardware ID ไม่ตรง!" });
    }
});

app.listen(PORT, () => {
    console.log(`🌍 API Server น้องปาย รันที่พอร์ต ${PORT}`);
});

// ==========================================
// 🤖 ส่วนที่ 2: DISCORD BOT
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    // --- แก้ไขคำสั่ง /genkey ให้เทพขึ้น ---
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('✨ สร้างคีย์ VIP (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('prefix')
            .setDescription('ชื่อนำหน้าคีย์ (เช่น SWIFT, XYPHER)')
            .setRequired(true)) // บังคับใส่ชื่อหน้า
        .addIntegerOption(option =>
            option.setName('amount')
            .setDescription('จำนวนคีย์ที่ต้องการสร้าง (สูงสุด 20)')
            .setRequired(false)) // ไม่ใส่ = 1 คีย์
        .addStringOption(option => 
            option.setName('note')
            .setDescription('โน้ตกันลืม (เช่น ชื่อลูกค้า)')
            .setRequired(false)),
            
    new SlashCommandBuilder()
        .setName('checkkey')
        .setDescription('🔍 เช็คสถานะคีย์')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการเช็ค')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('resetkey')
        .setDescription('🔄 รีเซ็ต HWID')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการรีเซ็ต')
            .setRequired(true)),
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('กำลังอัปเดตคำสั่ง Slash Commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียนคำสั่งใหม่เรียบร้อย!');
    } catch (error) {
        console.error(error);
    }
})();

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '🚫 เฉพาะซีม่อน (Owner) เท่านั้นที่ใช้ได้ค่ะ!', ephemeral: true });
    }

    // --- คำสั่ง /genkey ปรับปรุงใหม่ ---
    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase(); // บังคับตัวพิมพ์ใหญ่
        const note = interaction.options.getString('note') || 'ไม่ระบุ';
        let amount = interaction.options.getInteger('amount') || 1;

        // กันสร้างเยอะเกินจนค้าง
        if (amount > 20) amount = 20;
        if (amount < 1) amount = 1;

        let generatedKeysList = [];

        // ลูปสร้างคีย์ตามจำนวนที่ขอ
        for (let i = 0; i < amount; i++) {
            // สูตรสร้างคีย์: PREFIX + ส่วนสุ่มจาก UUID (ตัดมาแค่ส่วนหลังให้ดูสั้นกระชับแต่เดายาก)
            // ตัวอย่าง: SWIFT-A1B2-C3D4
            const randomPart = uuidv4().split('-')[1].toUpperCase() + uuidv4().split('-')[2].toUpperCase(); 
            const newKey = `${prefix}-${randomPart}`;

            keyDatabase[newKey] = {
                hwid: null,
                used: false,
                note: note,
                createdAt: new Date().toISOString()
            };
            
            generatedKeysList.push(newKey);
        }

        // จัดหน้าตาข้อความให้ก๊อปง่ายๆ
        const keyString = generatedKeysList.join('\n'); // ขึ้นบรรทัดใหม่
        
        await interaction.reply({ 
            content: `🎉 **สร้างเสร็จแล้วค่าซีม่อน!** (${amount} คีย์)\n📝 Note: ${note}\n\n\`\`\`\n${keyString}\n\`\`\``, 
            ephemeral: true 
        });
    }

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

    else if (interaction.commandName === 'resetkey') {
        const key = interaction.options.getString('key');
        if (!keyDatabase[key]) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ค่ะ', ephemeral: true });

        keyDatabase[key].hwid = null;
        keyDatabase[key].used = false; // เผื่ออยากให้กลับมาสถานะว่าง

        await interaction.reply({ content: `✅ **รีเซ็ตเรียบร้อย!**\nคีย์ \`${key}\` พร้อมใช้งานใหม่แล้วค่ะ`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
