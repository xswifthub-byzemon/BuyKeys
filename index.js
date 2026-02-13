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

    const now = new Date();

    // 1. เช็คว่าคีย์หมดอายุหรือยัง (ถ้าเคยเริ่มใช้ไปแล้ว)
    if (keyData.expiresAt) {
        const expireDate = new Date(keyData.expiresAt);
        if (now > expireDate) {
            return res.json({ status: "expired", msg: "คีย์หมดอายุแล้วครับ!" });
        }
    }

    // 2. ถ้าเป็นคีย์ใหม่ (ยังไม่เคยผูก HWID)
    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        
        // 🔥 เริ่มนับเวลาถอยหลัง ณ วินาทีที่กดใช้งาน
        const durationHours = parseInt(keyData.duration); 
        const expireTime = new Date(now.getTime() + (durationHours * 60 * 60 * 1000));
        keyData.expiresAt = expireTime.toISOString();

        return res.json({ 
            status: "success", 
            msg: `Activated! (${durationHours} Hours)`,
            expire: keyData.expiresAt 
        });
    } 
    // 3. ถ้าคีย์เคยใช้แล้ว (เช็ค HWID)
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
            .setDescription('ชื่อนำหน้า (เช่น FREE, SWIFT)')
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
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียนคำสั่งใหม่เรียบร้อย!');
    } catch (error) {
        console.error(error);
    }
})();

// 🔥 ฟังก์ชันสุ่ม Chaos String
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

    // --- คำสั่ง /genkey ปรับปรุงใหม่ ---
    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const durationInput = interaction.options.getString('duration');
        const note = interaction.options.getString('note') || 'Free Key';
        let amount = interaction.options.getInteger('amount') || 1;

        if (amount > 50) amount = 50; 
        if (amount < 1) amount = 1;

        let generatedKeysList = [];
        const timeOptions = ['6', '12', '24']; // ตัวเลือกสำหรับการสุ่ม

        // ลูปสร้างคีย์
        for (let i = 0; i < amount; i++) {
            // 🎲 คำนวณเวลา: ถ้าเลือก random ให้สุ่มเลย
            let finalDuration = durationInput;
            if (durationInput === 'random') {
                finalDuration = timeOptions[Math.floor(Math.random() * timeOptions.length)];
            }

            const chaosSuffix = generateChaosString(16); 
            const newKey = `${prefix}-${chaosSuffix}`;

            keyDatabase[newKey] = {
                hwid: null,
                duration: finalDuration, // เก็บเวลาที่ตั้งไว้ (6, 12, 24)
                expiresAt: null, // ยังไม่เริ่มนับ จนกว่าจะใช้
                note: note,
                createdAt: new Date().toISOString()
            };
            
            // เพิ่มข้อมูลเวลาลงไปใน list (ซีม่อนจะได้รู้ว่าคีย์ไหนได้กี่ชม. กรณีสุ่ม)
            if (durationInput === 'random') {
                // ถ้าสุ่ม ไม่ต้องโชว์เวลาใน List ที่ก๊อป เดี๋ยวลูกค้าเลือกแต่ 24 ชม. 555
                // หรือถ้าอยากโชว์บอกปายได้นะ แต่ตอนนี้ปายทำแบบเนียนๆ ไปก่อน
                generatedKeysList.push(newKey);
            } else {
                generatedKeysList.push(newKey);
            }
        }

        const keyString = generatedKeysList.join('\n');
        const durationText = durationInput === 'random' ? "🎲 สุ่ม (6/12/24 ชม.)" : `⏳ ${durationInput} ชั่วโมง`;

        await interaction.reply({ 
            content: `🎉 **สร้างคีย์สำเร็จ!** (${amount} คีย์)\n⏰ เวลา: ${durationText}\n📝 Note: ${note}\n\n\`${keyString}\``, 
            ephemeral: true 
        });
    }

    // --- คำสั่ง /checkkey ---
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
                expireInfo = `หมดอายุ: <t:${Math.floor(expireDate.getTime() / 1000)}:R>`; // แสดงเวลานับถอยหลังใน Discord
            }
        }

        await interaction.reply({ 
            content: `📊 **ข้อมูลคีย์:** \`${key}\`\n⏳ ระยะเวลา: ${data.duration} ชม.\nสถานะ: ${status}\n⏰ ${expireInfo}\n🖥️ HWID: \`${data.hwid || "-"}\`\n📝 Note: ${data.note}`, 
            ephemeral: true 
        });
    }

    // --- คำสั่ง /resetkey ---
    else if (interaction.commandName === 'resetkey') {
        const key = interaction.options.getString('key');
        if (!keyDatabase[key]) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ค่ะ', ephemeral: true });

        // รีเซ็ตทุกอย่างให้เหมือนใหม่
        keyDatabase[key].hwid = null;
        keyDatabase[key].expiresAt = null; 

        await interaction.reply({ content: `✅ **รีเซ็ตคีย์เรียบร้อย!**\nคีย์ \`${key}\` กลับมาใหม่เอี่ยม เริ่มนับเวลาใหม่เมื่อใช้งานค่ะ`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
