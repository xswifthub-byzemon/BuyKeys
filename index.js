const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');

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
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('✨ สร้างคีย์ VIP (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('prefix')
            .setDescription('ชื่อนำหน้าคีย์ (เช่น SWIFT)')
            .setRequired(true)) 
        .addIntegerOption(option =>
            option.setName('amount')
            .setDescription('จำนวนคีย์ที่ต้องการสร้าง')
            .setRequired(false)) 
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

// 🔥 ฟังก์ชันสุ่มแบบ Chaos (ตัวเล็ก+ใหญ่+ตัวเลข) *ตัดอักษรพิเศษออกกันบั๊ก URL*
function generateChaosString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '🚫 เฉพาะซีม่อน (Owner) เท่านั้นที่ใช้ได้ค่ะ!', ephemeral: true });
    }

    // --- คำสั่ง /genkey ---
    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const note = interaction.options.getString('note') || 'ไม่ระบุ';
        let amount = interaction.options.getInteger('amount') || 1;

        if (amount > 50) amount = 50; 
        if (amount < 1) amount = 1;

        let generatedKeysList = [];

        // ลูปสร้างคีย์
        for (let i = 0; i < amount; i++) {
            // สุ่ม 16 ตัวอักษร
            const chaosSuffix = generateChaosString(16); 
            const newKey = `${prefix}-${chaosSuffix}`;

            keyDatabase[newKey] = {
                hwid: null,
                used: false,
                note: note,
                createdAt: new Date().toISOString()
            };
            
            generatedKeysList.push(newKey);
        }

        const keyString = generatedKeysList.join('\n');
        
        // ✨ แก้ไขตรงนี้: ใช้ ` (Backtick เดียว) ครอบหัวท้าย
        // เพื่อให้กด Copy ง่ายๆ ในมือถือ
        await interaction.reply({ 
            content: `🎉 **สร้างเสร็จแล้วค่าซีม่อน!** (${amount} คีย์)\n📝 Note: ${note}\n\n\`${keyString}\``, 
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
        keyDatabase[key].used = false; 

        await interaction.reply({ content: `✅ **รีเซ็ตเรียบร้อย!**\nคีย์ \`${key}\` พร้อมใช้งานใหม่แล้วค่ะ`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
