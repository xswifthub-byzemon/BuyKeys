const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const TOKEN = process.env.DISCORD_TOKEN;     
const CLIENT_ID = process.env.CLIENT_ID;     
const OWNER_ID = process.env.OWNER_ID; 
const GUILD_ID = process.env.GUILD_ID; 
const MONGO_URL = process.env.MONGO_URL; 
const PORT = process.env.PORT || 3000;

// เชื่อมต่อ Database
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB!'))
    .catch(err => console.error('❌ DB Error:', err));

const keySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },
    duration: String,
    expiresAt: Date,
    note: String,
    isUsed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const KeyModel = mongoose.model('Key', keySchema);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;
    if (!key || !hwid) return res.json({ status: "error", msg: "Data missing" });
    const keyData = await KeyModel.findOne({ key: key });
    if (!keyData) return res.json({ status: "invalid", msg: "Key not found" });
    const now = new Date();
    if (keyData.expiresAt && now > keyData.expiresAt) return res.json({ status: "expired", msg: "Key expired!" });
    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        keyData.isUsed = true;
        const hours = parseInt(keyData.duration); 
        keyData.expiresAt = new Date(now.getTime() + (hours * 60 * 60 * 1000));
        await keyData.save();
        return res.json({ status: "success", msg: `Activated! (${hours}h)`, expire: keyData.expiresAt });
    } else if (keyData.hwid === hwid) {
        return res.json({ status: "success", msg: "Welcome Back" });
    } else {
        return res.json({ status: "hwid_mismatch", msg: "HWID Mismatch!" });
    }
});

app.listen(PORT, () => console.log(`🌍 API running on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
    new SlashCommandBuilder()
        .setName('genkey').setDescription('✨ สร้างคีย์ (Owner Only)')
        .addStringOption(opt => opt.setName('prefix').setDescription('ชื่อนำหน้า').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('เวลา').setRequired(true)
            .addChoices(
                { name: '⏳ 6 ชม.', value: '6' }, { name: '⏳ 12 ชม.', value: '12' },
                { name: '⏳ 24 ชม.', value: '24' }, { name: '🎲 สุ่ม', value: 'random' }
            ))
        .addIntegerOption(opt => opt.setName('amount').setDescription('จำนวน'))
        .addStringOption(opt => opt.setName('note').setDescription('โน้ต')),
    new SlashCommandBuilder()
        .setName('checkkey').setDescription('🔍 เช็คสถานะคีย์').addStringOption(opt => opt.setName('key').setRequired(true)),
    new SlashCommandBuilder()
        .setName('resetkey').setDescription('🔄 รีเซ็ต HWID').addStringOption(opt => opt.setName('key').setRequired(true)),
    new SlashCommandBuilder()
        .setName('listkeys').setDescription('📂 โหลดไฟล์คีย์ทั้งหมด').addStringOption(opt => opt.setName('filter')
            .addChoices({ name: 'ทั้งหมด', value: 'all' }, { name: 'ว่าง', value: 'unused' }, { name: 'ใช้แล้ว', value: 'used' })),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        if (GUILD_ID) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] }); // ล้าง Global
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); // ลง Guild
        }
    } catch (e) { console.error(e); }
})();

function generateChaos(len) {
    const char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    for (let i = 0; i < len; i++) res += char.charAt(Math.floor(Math.random() * char.length));
    return res;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 เฉพาะซีม่อนเท่านั้น!', ephemeral: true });

    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const note = interaction.options.getString('note') || 'Free Key';
        const amount = interaction.options.getInteger('amount') || 1;
        await interaction.deferReply({ ephemeral: true });
        let keys = [];
        for (let i = 0; i < amount; i++) {
            let dur = interaction.options.getString('duration');
            if (dur === 'random') dur = ['6', '12', '24'][Math.floor(Math.random() * 3)];
            let key = `${prefix}-${generateChaos(16)}`;
            await new KeyModel({ key, duration: dur, note }).save();
            keys.push(key);
        }
        await interaction.editReply({ content: `🎉 **สร้างสำเร็จ!**\n\n\`${keys.join('\n')}\`` });
    } 
    else if (interaction.commandName === 'checkkey') {
        const k = interaction.options.getString('key');
        const d = await KeyModel.findOne({ key: k });
        if (!d) return interaction.reply({ content: '❌ ไม่พบ', ephemeral: true });
        await interaction.reply({ content: `📊 คีย์: \`${k}\` | สถานะ: ${d.isUsed ? '🔴 ใช้แล้ว' : '🟢 ว่าง'}`, ephemeral: true });
    }
    else if (interaction.commandName === 'resetkey') {
        const k = interaction.options.getString('key');
        await KeyModel.findOneAndUpdate({ key: k }, { hwid: null, expiresAt: null, isUsed: false });
        await interaction.reply({ content: '✅ รีเซ็ตสำเร็จ!', ephemeral: true });
    }
    else if (interaction.commandName === 'listkeys') {
        const f = interaction.options.getString('filter') || 'all';
        let q = f === 'all' ? {} : { isUsed: f === 'used' };
        const ks = await KeyModel.find(q);
        let text = ks.map(k => `${k.key} | ${k.duration}h | ${k.isUsed ? '[USED]' : '[FREE]'}`).join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(text), { name: 'keys.txt' });
        await interaction.reply({ content: `📂 เจอ ${ks.length} คีย์`, files: [attachment], ephemeral: true });
    }
});

client.login(TOKEN);
