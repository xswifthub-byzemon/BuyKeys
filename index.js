const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');

// --- 🔧 ดึงค่าจาก Variables ---
const TOKEN = process.env.DISCORD_TOKEN;     
const CLIENT_ID = process.env.CLIENT_ID;     
const OWNER_ID = process.env.OWNER_ID; 
const GUILD_ID = process.env.GUILD_ID; // 🔥 ตัวแปรใหม่ สำหรับบังคับอัปเดตทันที
const PORT = process.env.PORT || 3000;

// --- 💾 ฐานข้อมูลจำลอง ---
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

    const now = new Date();

    // 1. เช็ควันหมดอายุ
    if (keyData.expiresAt) {
        const expireDate = new Date(keyData.expiresAt);
        if (now > expireDate) {
            return res.json({ status: "expired", msg: "คีย์หมดอายุแล้วครับ!" });
        }
    }

    // 2. คีย์ใหม่ -> เริ่มนับเวลา
    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        
        const durationHours = parseInt(keyData.duration); 
        const expireTime = new Date(now.getTime() + (durationHours * 60 * 60 * 1000));
        keyData.expiresAt = expireTime.toISOString();

        return res.json({ 
            status: "success", 
            msg: `Activated! (${durationHours} Hours)`,
            expire: keyData.expiresAt 
        });
    } 
    // 3. คีย์เก่า -> เช็คเจ้าของเดิม
    else if (keyData.hwid === hwid) {
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
        .setDescription('✨ สร้างคีย์ฟรี แบบจำกัดเวลา (เฉพาะ Owner)')
        .addStringOption(option => 
            option.setName('prefix')
            .setDescription('ชื่อนำหน้า (เช่น SWIFT)')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
            .setDescription('ระยะเวลาใช้งาน')
            .setRequired(true)
            .addChoices(
                { name: '⏳ 6 ชั่วโมง', value: '6' },
                { name: '⏳ 12 ชั่วโมง', value: '12' },
                { name: '⏳ 24 ชั่วโมง', value: '24' },
                { name: '🎲 สุ่ม (6, 12, 24)', value: 'random' }
            ))
        .addIntegerOption(option =>
            option.setName('amount')
            .setDescription('จำนวนคีย์ (สูงสุด 50)')
            .setRequired(false)) 
        .addStringOption(option => 
            option.setName('note')
            .setDescription('โน้ตกันลืม')
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
        .setDescription('🔄 รีเซ็ต HWID และเวลา')
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
        
        // 🔥 แก้ไขระบบอัปเดต: ถ้ามี GUILD_ID ให้ลงทะเบียนเฉพาะเซิฟนั้น (เร็วทันใจ)
        if (GUILD_ID) {
            console.log(`⚡ ตรวจพบ GUILD_ID: กำลังอัปเดตคำสั่งเข้าสู่เซิร์ฟเวอร์โดยตรง...`);
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('✅ ลงทะเบียนคำสั่งแบบ Instant เสร็จสิ้น! (ลองพิมพ์ /genkey ดูได้เลย)');
        } else {
            console.log(`⚠️ ไม่พบ GUILD_ID: กำลังอัปเดตแบบ Global (อาจใช้เวลา 1 ชม.)`);
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        }
        
    } catch (error) {
        console.error(error);
    }
})();

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

    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const durationInput = interaction.options.getString('duration'); // รับค่า duration
        const note = interaction.options.getString('note') || 'Free Key';
        let amount = interaction.options.getInteger('amount') || 1;

        if (amount > 50) amount = 50; 
        if (amount < 1) amount = 1;

        let generatedKeysList = [];
        const timeOptions = ['6', '12', '24']; 

        for (let i = 0; i < amount; i++) {
            let finalDuration = durationInput;
            if (durationInput === 'random') {
                finalDuration = timeOptions[Math.floor(Math.random() * timeOptions.length)];
            }

            const chaosSuffix = generateChaosString(16); 
            const newKey = `${prefix}-${chaosSuffix}`;

            keyDatabase[newKey] = {
                hwid: null,
                duration: finalDuration,
                expiresAt: null,
                note: note,
                createdAt: new Date().toISOString()
            };
            
            generatedKeysList.push(newKey);
        }

        const keyString = generatedKeysList.join('\n');
        const durationText = durationInput === 'random' ? "🎲 สุ่ม (6/12/24 ชม.)" : `⏳ ${durationInput} ชั่วโมง`;

        await interaction.reply({ 
            content: `🎉 **สร้างคีย์สำเร็จ!** (${amount} คีย์)\n⏰ เวลา: ${durationText}\n📝 Note: ${note}\n\n\`\`\`text\n${keyString}\n\`\`\``, 
            ephemeral: true 
        });
    }

    else if (interaction.commandName === 'checkkey') {
        const key = interaction.options.getString('key');
        const data = keyDatabase[key];

        if (!data) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ในระบบค่ะ', ephemeral: true });

        const status = data.hwid ? "🔴 ใช้งานแล้ว" : "🟢 ยังไม่ถูกใช้";
        let expireInfo = "รอการใช้งาน";
        
        if (data.expiresAt) {
            const expireDate = new Date(data.expiresAt);
            const now = new Date();
            if (now > expireDate) {
                expireInfo = "❌ หมดอายุแล้ว";
            } else {
                expireInfo = `หมดอายุ: <t:${Math.floor(expireDate.getTime() / 1000)}:R>`;
            }
        }

        await interaction.reply({ 
            content: `📊 **ข้อมูลคีย์:** \`${key}\`\n⏳ ระยะเวลา: ${data.duration} ชม.\nสถานะ: ${status}\n⏰ ${expireInfo}\n🖥️ HWID: \`${data.hwid || "-"}\`\n📝 Note: ${data.note}`, 
            ephemeral: true 
        });
    }

    else if (interaction.commandName === 'resetkey') {
        const key = interaction.options.getString('key');
        if (!keyDatabase[key]) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ค่ะ', ephemeral: true });

        keyDatabase[key].hwid = null;
        keyDatabase[key].expiresAt = null; 

        await interaction.reply({ content: `✅ **รีเซ็ตคีย์เรียบร้อย!**\nคีย์ \`${key}\` กลับมาใหม่เอี่ยม เริ่มนับเวลาใหม่เมื่อใช้งานค่ะ`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
