const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// --- 🔧 Variables จาก Railway ---
const TOKEN = process.env.DISCORD_TOKEN;     
const CLIENT_ID = process.env.CLIENT_ID;     
const OWNER_ID = process.env.OWNER_ID; 
const GUILD_ID = process.env.GUILD_ID; 
const MONGO_URL = process.env.MONGO_URL; 
const PORT = process.env.PORT || 3000;

// ==========================================
// 💾 DATABASE SETUP (MongoDB)
// ==========================================
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

// ==========================================
// 🌐 WEB SERVER (API)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;
    if (!key || !hwid) return res.json({ status: "error", msg: "Data missing" });

    const keyData = await KeyModel.findOne({ key: key });
    if (!keyData) return res.json({ status: "invalid", msg: "Key not found" });

    const now = new Date();
    if (keyData.expiresAt && now > keyData.expiresAt) {
        return res.json({ status: "expired", msg: "Key expired!" });
    }

    if (keyData.hwid === null) {
        keyData.hwid = hwid;
        keyData.isUsed = true;
        const durationHours = parseInt(keyData.duration); 
        keyData.expiresAt = new Date(now.getTime() + (durationHours * 60 * 60 * 1000));
        await keyData.save();
        return res.json({ status: "success", msg: `Activated! (${durationHours}h)`, expire: keyData.expiresAt });
    } else if (keyData.hwid === hwid) {
        return res.json({ status: "success", msg: "Welcome Back" });
    } else {
        return res.json({ status: "hwid_mismatch", msg: "HWID Mismatch!" });
    }
});

app.listen(PORT, () => console.log(`🌍 API running on port ${PORT}`));

// ==========================================
// 🤖 DISCORD BOT
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('✨ Generate Keys (Owner Only)')
        .addStringOption(opt => opt.setName('prefix').setDescription('Prefix (e.g. SWIFT)').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Time').setRequired(true)
            .addChoices(
                { name: '⏳ 6 Hours', value: '6' },
                { name: '⏳ 12 Hours', value: '12' },
                { name: '⏳ 24 Hours', value: '24' },
                { name: '🎲 Random', value: 'random' }
            ))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(false))
        .addStringOption(opt => opt.setName('note').setDescription('Note').setRequired(false)),
    new SlashCommandBuilder()
        .setName('checkkey').setDescription('🔍 Check Key Status').addStringOption(opt => opt.setName('key').setRequired(true)),
    new SlashCommandBuilder()
        .setName('resetkey').setDescription('🔄 Reset HWID').addStringOption(opt => opt.setName('key').setRequired(true)),
    new SlashCommandBuilder()
        .setName('listkeys').setDescription('📂 Get all keys (.txt)').addStringOption(opt => opt.setName('filter')
            .addChoices({ name: 'All', value: 'all' }, { name: 'Unused', value: 'unused' }, { name: 'Used', value: 'used' })),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Cleaning & Registering commands...');
        if (GUILD_ID) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('✅ Commands updated for Guild!');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
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
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 Owner only!', ephemeral: true });

    if (interaction.commandName === 'genkey') {
        const prefix = interaction.options.getString('prefix').toUpperCase();
        const durInput = interaction.options.getString('duration');
        const note = interaction.options.getString('note') || 'Free Key';
        let amount = interaction.options.getInteger('amount') || 1;
        if (amount > 50) amount = 50;

        await interaction.deferReply({ ephemeral: true });
        let keys = [];
        for (let i = 0; i < amount; i++) {
            let dur = durInput === 'random' ? ['6', '12', '24'][Math.floor(Math.random() * 3)] : durInput;
            let key = `${prefix}-${generateChaos(16)}`;
            await new KeyModel({ key, duration: dur, note }).save();
            keys.push(key);
        }
        await interaction.editReply({ content: `🎉 **Generated ${amount} Keys!**\n📝 Note: ${note}\n\n\`${keys.join('\n')}\`` });
    } 
    else if (interaction.commandName === 'checkkey') {
        const k = interaction.options.getString('key');
        const d = await KeyModel.findOne({ key: k });
        if (!d) return interaction.reply({ content: '❌ Key not found', ephemeral: true });
        await interaction.reply({ content: `📊 Key: \`${k}\`\nStatus: ${d.isUsed ? '🔴 Used' : '🟢 Free'}\nNote: ${d.note}`, ephemeral: true });
    }
    else if (interaction.commandName === 'resetkey') {
        const k = interaction.options.getString('key');
        const r = await KeyModel.findOneAndUpdate({ key: k }, { hwid: null, expiresAt: null, isUsed: false });
        if (!r) return interaction.reply({ content: '❌ Not found', ephemeral: true });
        await interaction.reply({ content: '✅ Reset Success!', ephemeral: true });
    }
    else if (interaction.commandName === 'listkeys') {
        const f = interaction.options.getString('filter') || 'all';
        let q = f === 'all' ? {} : { isUsed: f === 'used' };
        const ks = await KeyModel.find(q);
        if (!ks.length) return interaction.reply({ content: '📂 No keys found', ephemeral: true });
        let text = ks.map(k => `${k.key} | ${k.duration}h | ${k.isUsed ? '[USED]' : '[FREE]'} | ${k.note}`).join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(text), { name: 'keys.txt' });
        await interaction.reply({ content: `📂 Found ${ks.length} keys`, files: [attachment], ephemeral: true });
    }
});

client.login(TOKEN);
