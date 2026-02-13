const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// --- 🔧 ดึงค่าจาก Variables ใน Railway ---
const TOKEN = process.env.DISCORD_TOKEN;     
const CLIENT_ID = process.env.CLIENT_ID;     
const OWNER_ID = process.env.OWNER_ID; 
const GUILD_ID = process.env.GUILD_ID; // ⚠️ ต้องใส่ GUILD_ID ใน Railway เพื่อแก้คำสั่งซ้ำ
const MONGO_URL = process.env.MONGO_URL; 
const PORT = process.env.PORT || 3000;

// ==========================================
// 💾 DATABASE SETUP (MongoDB)
// ==========================================
mongoose.connect(MONGO_URL || 'mongodb://localhost:27017/zemon_keys')
    .then(() => console.log('✅ เชื่อมต่อ MongoDB (ความจำถาวร) สำเร็จ!'))
    .catch(err => console.error('❌ เชื่อมต่อ Database ไม่ได้:', err));

// สร้างโครงสร้างข้อมูล
const keySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },
    duration: String,    // 6, 12, 24, random
    expiresAt: Date,     // วันหมดอายุ (ใส่ค่าเมื่อเริ่มใช้)
    note: String,
    isUsed: { type: Boolean, default: false }, 
    createdAt: { type: Date, default: Date.now }
});

const KeyModel = mongoose.model('Key', keySchema);

// ==========================================
// 🌐 WEB SERVER (API สำหรับ Roblox)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) return res.json({ status: "error", msg: "ข้อมูลไม่ครบ" });

    // ค้นหาคีย์ใน Database
    const keyData = await KeyModel.findOne({ key: key });

    if (!keyData) return res.json({ status: "invalid", msg: "ไม่พบคีย์นี้ในระบบ" });

    const now = new Date();

    // 1. เช็ควันหมดอายุ (ถ้าเริ่มใช้ไปแล้ว)
    if (keyData.expiresAt) {
        if (now > keyData.expiresAt) {
            return res.json({ status: "expired", msg: "คีย์หมดอายุแล้วครับ!" });
        }
    }

    // 2. คีย์ใหม่ (ยังไม่ผูก HWID) -> เริ่มนับเวลา
    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        keyData.isUsed = true;
        
        const durationHours = parseInt(keyData.duration); 
        // คำนวณเวลาหมดอายุ
        const expireTime = new Date(now.getTime() + (durationHours * 60 * 60 * 1000));
        keyData.expiresAt = expireTime;

        await keyData.save(); // บันทึก

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
// 🤖 DISCORD BOT
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    // 1. คำสั่งสร้างคีย์
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('✨ สร้างคีย์แบบถาวร (เฉพาะ Owner)')
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
            
    // 2. คำสั่งเช็คคีย์
    new SlashCommandBuilder()
        .setName('checkkey')
        .setDescription('🔍 เช็คสถานะคีย์จาก Database')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการเช็ค')
            .setRequired(true)),

    // 3. คำสั่งรีเซ็ตคีย์
    new SlashCommandBuilder()
        .setName('resetkey')
        .setDescription('🔄 รีเซ็ต HWID และเวลา')
        .addStringOption(option => 
            option.setName('key')
            .setDescription('คีย์ที่ต้องการรีเซ็ต')
            .setRequired(true)),

    // 4. คำสั่งดูรายการคีย์ทั้งหมด (โหลดไฟล์)
    new SlashCommandBuilder()
        .setName('listkeys')
        .setDescription('📂 ดาวน์โหลดไฟล์รายการคีย์ทั้งหมด (เฉพาะ Owner)')
        .addStringOption(option =>
            option.setName('filter')
            .setDescription('เลือกดูเฉพาะสถานะ')
            .addChoices(
                { name: 'ทั้งหมด (All)', value: 'all' },
                { name: '✅ ว่าง (Unused)', value: 'unused' },
                { name: '🔴 ใช้แล้ว (Used)', value: 'used' }
            )),
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 🔥 ระบบลงทะเบียนคำสั่ง (แก้ปัญหาคำสั่งซ้ำ)
(async () => {
    try {
        console.log('🔄 กำลังจัดการระบบคำสั่ง...');

        if (GUILD_ID) {
            // 1. ล้างคำสั่ง Global ทิ้ง (ตัวการที่ทำให้ซ้ำ)
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            console.log('🗑️ ล้างคำสั่ง Global เก่าเรียบร้อย');

            // 2. ลงทะเบียนคำสั่งใหม่เข้าเซิร์ฟเวอร์ (เพื่อให้ /listkeys มาทันที)
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(`✅ ลงทะเบียน ${commands.length} คำสั่ง เข้าสู่เซิร์ฟเวอร์เรียบร้อย!`);
        } else {
            console.log('⚠️ ไม่พบ GUILD_ID: ลงทะเบียนแบบ Global (อาจช้าและซ้ำได้)');
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียนคำสั่ง:', error);
    }
})();

// ฟังก์ชันสุ่ม Chaos String
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

    // --- /genkey ---
    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const durationInput = interaction.options.getString('duration');
        const note = interaction.options.getString('note') || 'Free Key';
        let amount = interaction.options.getInteger('amount') || 1;

        if (amount > 50) amount = 50; 
        if (amount < 1) amount = 1;

        await interaction.deferReply({ ephemeral: true });

        let generatedKeysList = [];
        const timeOptions = ['6', '12', '24']; 

        for (let i = 0; i < amount; i++) {
            let finalDuration = durationInput;
            if (durationInput === 'random') {
                finalDuration = timeOptions[Math.floor(Math.random() * timeOptions.length)];
            }

            const chaosSuffix = generateChaosString(16); 
            const newKey = `${prefix}-${chaosSuffix}`;

            const newKeyData = new KeyModel({
                key: newKey,
                duration: finalDuration,
                note: note
            });

            await newKeyData.save();
            generatedKeysList.push(newKey);
        }

        const keyString = generatedKeysList.join('\n');
        const durationText = durationInput === 'random' ? "🎲 สุ่ม (6/12/24 ชม.)" : `⏳ ${durationInput} ชั่วโมง`;

        // ✨ Output แบบ Tap to Copy (ขีดเดียว)
        await interaction.editReply({ 
            content: `🎉 **บันทึกคีย์ลง Database สำเร็จ!** (${amount} คีย์)\n⏰ เวลา: ${durationText}\n📝 Note: ${note}\n\n\`${keyString}\``
        });
    }

    // --- /checkkey ---
    else if (interaction.commandName === 'checkkey') {
        const key = interaction.options.getString('key');
        const data = await KeyModel.findOne({ key: key });

        if (!data) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ใน Database ค่ะ', ephemeral: true });

        const status = data.isUsed ? "🔴 ใช้งานแล้ว" : "🟢 ยังไม่ถูกใช้";
        let expireInfo = "รอการใช้งาน";
        
        if (data.expiresAt) {
            const now = new Date();
            if (now > data.expiresAt) {
                expireInfo = "❌ หมดอายุแล้ว";
            } else {
                expireInfo = `หมดอายุ: <t:${Math.floor(data.expiresAt.getTime() / 1000)}:R>`;
            }
        }

        await interaction.reply({ 
            content: `📊 **ข้อมูลคีย์:** \`${key}\`\n⏳ ระยะเวลา: ${data.duration} ชม.\nสถานะ: ${status}\n⏰ ${expireInfo}\n🖥️ HWID: \`${data.hwid || "-"}\`\n📝 Note: ${data.note}`, 
            ephemeral: true 
        });
    }

    // --- /resetkey ---
    else if (interaction.commandName === 'resetkey') {
        const key = interaction.options.getString('key');
        
        const result = await KeyModel.findOneAndUpdate(
            { key: key }, 
            { hwid: null, expiresAt: null, isUsed: false },
            { new: true }
        );

        if (!result) return interaction.reply({ content: '❌ ไม่พบคีย์นี้ใน Database ค่ะ', ephemeral: true });

        await interaction.reply({ content: `✅ **รีเซ็ตคีย์เรียบร้อย!**\nคีย์ \`${key}\` กลับมาใหม่เอี่ยม เริ่มนับเวลาใหม่เมื่อใช้งานค่ะ`, ephemeral: true });
    }

    // --- /listkeys (ดาวน์โหลดไฟล์) ---
    else if (interaction.commandName === 'listkeys') {
        const filter = interaction.options.getString('filter') || 'all';
        let query = {};
        
        if (filter === 'unused') query = { isUsed: false };
        if (filter === 'used') query = { isUsed: true };

        const keys = await KeyModel.find(query).sort({ createdAt: -1 });

        if (keys.length === 0) {
            return interaction.reply({ content: '📂 ไม่พบคีย์ในรายการเลยค่ะ', ephemeral: true });
        }

        let fileContent = `=== รายการคีย์ทั้งหมด (Total: ${keys.length}) ===\n`;
        fileContent += `Filter: ${filter} | Date: ${new Date().toLocaleString()}\n\n`;
        fileContent += `KEY | DURATION | STATUS | NOTE\n`;
        fileContent += `--------------------------------------------------------\n`;

        keys.forEach(k => {
            const status = k.isUsed ? "[USED]" : "[FREE]";
            const note = k.note ? `(${k.note})` : "";
            fileContent += `${k.key} | ${k.duration}h | ${status} | ${note}\n`;
        });

        const buffer = Buffer.from(fileContent, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'zemon-keys.txt' });

        await interaction.reply({ 
            content: `📂 **ดึงข้อมูลสำเร็จ!** เจอทั้งหมด **${keys.length}** คีย์ค่า`, 
            files: [attachment],
            ephemeral: true 
        });
    }
});

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
