const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const yts = require('yt-search');
const fs = require('fs');
const { exec } = require('child_process');
const readline = require('readline');
const axios = require('axios');
const cron = require('node-cron');
const SIDER_FILE = './sider_data.json';
const BLACKLIST_FILE = './blacklist_data.json';
const cheerio = require('cheerio');

let blacklistData = {};

if (fs.existsSync(BLACKLIST_FILE)) {
    try { blacklistData = JSON.parse(fs.readFileSync(BLACKLIST_FILE)); } catch (e) { blacklistData = {}; }
}
function saveBlacklist() {
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
}

const POINT_FILE = './point_data.json';
const AFK_FILE = './afk_data.json';

let userActivity = {};
let mutedUsers = {};
let gameSession = {};
let userPoints = {};
let afkData = {};
let playSession = {};
let userPlayState = {};
// === DATABASE USER & FITUR GACHA ===
let dbUsers = {};
const dbPath = './users.json';

if (fs.existsSync(dbPath)) {
    try {
        dbUsers = JSON.parse(fs.readFileSync(dbPath));
    } catch (e) {
        dbUsers = {};
    }
}

function saveUsers() {
    fs.writeFileSync(dbPath, JSON.stringify(dbUsers, null, 2));
}

function getPangkat(level) {
    if (level >= 100) return '👑 Emperor (MAX)';
    if (level >= 90) return '⚜️ Archduke';
    if (level >= 75) return '🦅 Grand Duke';
    if (level >= 60) return '🦁 Duke';
    if (level >= 45) return '🐺 Marquis';
    if (level >= 30) return '🦉 Count';
    if (level >= 15) return '🦇 Viscount';
    if (level >= 5)  return '🕊️ Baron';
    return '🌱 Commoner';
}

const GACHA_TIERS = {
    MYTHIC:    { name: 'Mythic',    bonusXp: 0.25, rate: '0.5%' },
    LEGENDARY: { name: 'Legendary', bonusXp: 0.20, rate: '2%' },
    EPIC:      { name: 'Epic',      bonusXp: 0.15, rate: '10%' },
    RARE:      { name: 'Rare',      bonusXp: 0.10, rate: '30%' },
    COMMON:    { name: 'Common',    bonusXp: 0.05, rate: '57.5%' }
};

// Auto-Generator 200 Item Gacha
const GACHA_ITEMS = [];
function generateItems(prefix, namePrefix, tier, count) {
    for (let i = 1; i <= count; i++) {
        GACHA_ITEMS.push({ 
            id: `${prefix}${i}`, 
            name: `${namePrefix} Item ${i}`, 
            tier: tier, 
            image: `./gacha_media/${prefix}${i}.jpg` 
        });
    }
}

// Komposisi 200 Item
generateItems('m', 'Mythic', 'MYTHIC', 4);        // m1 - m4 (4 Item)
generateItems('l', 'Legendary', 'LEGENDARY', 16); // l1 - l16 (16 Item)
generateItems('e', 'Epic', 'EPIC', 40);           // e1 - e40 (40 Item)
generateItems('r', 'Rare', 'RARE', 60);           // r1 - r60 (60 Item)
generateItems('c', 'Common', 'COMMON', 80);       // c1 - c80 (80 Item)

if (fs.existsSync(SIDER_FILE)) {
    try { userActivity = JSON.parse(fs.readFileSync(SIDER_FILE)); } catch (e) { userActivity = {}; }
}
function saveActivity() {
    fs.writeFileSync(SIDER_FILE, JSON.stringify(userActivity, null, 2));
}

if (fs.existsSync(POINT_FILE)) {
    try { userPoints = JSON.parse(fs.readFileSync(POINT_FILE)); } catch (e) { userPoints = {}; }
}
function savePoints() {
    fs.writeFileSync(POINT_FILE, JSON.stringify(userPoints, null, 2));
}

if (fs.existsSync(AFK_FILE)) {
    try { afkData = JSON.parse(fs.readFileSync(AFK_FILE)); } catch (e) { afkData = {}; }
}
function saveAfk() {
    fs.writeFileSync(AFK_FILE, JSON.stringify(afkData, null, 2));
}

function addPoint(from, sender, amount = 10) {
    userPoints[from] = userPoints[from] || {};
    userPoints[from][sender] = (userPoints[from][sender] || 0) + amount;
    savePoints();
    return userPoints[from][sender];
}

function formatDuration(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    let res = [];
    if (hours > 0) res.push(`${hours}h`);
    if (minutes > 0) res.push(`${minutes}m`);
    res.push(`${seconds}s`);
    return res.join(' ');
}

const ROAST_LIST = [
    "Bapak kau Garena",
    "Bapak kau Prabowo",
    "Hei!! Antek antek aseng!!",
    "Pinter amat sih lu kek pakar, saking pinternya jadi goblog",
    "Udah hidupnya susah, WNI seumur hidup lagi",
    "Berguna dikit lah, jangan kek pemerintah",
    "Gemoy amat sih lu, kek Prabowo",
    "Pengalaman lu banyak yah, kek bawahannya Prabowo",
    "Setolol-tololnya lu, jangan sampe jadi buzzer",
    "Gercep dikit lah, jangan kek internet di Indo",
    "Hidup cuma sekali, tapi status lu WNI seumur hidup",
    "Kikir banget sih lu, kek CapCut",
    "Tolol tolol gini lu tetep temen gw",
    "Bisa ngitung kan lu? Kalo belum bisa, belajar dulu sana sama Presiden",
    "Jadi orang jangan nyulitin lah, kek loker Indo aja lu",
    "Cakep amat sih muka lu, Bunda Teddy sampe naksir tuh",
    "Lu cakep sih, tapi lebih cakepan sempak bolong gw",
    "Wangi banget sih lu, sampe di sukai lalat",
    "Otak lu kecil amat sih, kek J2 Prime",
    "Gue tau lu aslinya gila, cuma gue diem aj"
];

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ', err.message);
});
process.on('unhandledRejection', function (err) {
    console.log('Unhandled rejection: ', err?.message || err);
});
const ALL_QUESTIONS = [
    { answer: 'TEDDY', question: 'Pendamping Presiden Prabowo' },
    { answer: 'FEMBOY', question: 'Laki-laki dengan sifat feminim' },
    { answer: 'TITUT', question: 'Bocah dengan gigi ompong' },
    { answer: 'WIBUKU', question: 'Aplikasi nonton anime terkenal' },
    { answer: 'PRABOWO', question: 'Presiden paling pintar di Indonesia' },
    { answer: 'TIMOTHY', question: 'Akademi crypto' },
    { answer: 'KEYARU', question: 'MC anime tentang healer' },
    { answer: 'MENCOPET', question: 'Kegiatan mengambil dompet orang' },
    { answer: 'MBG', question: 'Kalimat andalan karbit' },
    { answer: 'TENSURA', question: 'Anime tentang slime' },
    { answer: 'TOBI', question: 'Karakter bertopeng di anime Naruto' },
    { answer: 'EMEL', question: 'Game mobile 5vs5' },
    { answer: 'GENSHIN', question: 'Game kikir' },
    { answer: 'EPEP', question: 'Game burik' },
    { answer: 'NEKOPOI', question: 'Aplikasi streaming anime haram' },
    { answer: 'KIRITO', question: 'Karakter anime yang tidak bisa log-out dari game' },
    { answer: 'AMERIKA', question: 'Admin bumi' },
    { answer: 'SPONGEBOB', question: 'Kartun dengan segudang sticker' },
    { answer: 'HIMMEL', question: 'Karakter pahlawan legendaris dengan kata-katanya yang berasal dari anime' },
    { answer: 'EREN', question: 'Rumbling' },
    { answer: 'RENGOKU', question: 'Donatnya anime Kimetsu no Yaiba' },
    { answer: 'TELKOMSEL', question: 'Aplikasi iblis' },
    { answer: 'KAORI', question: 'Cicaknya anime' },
    { answer: 'KOMI', question: 'Kodoknya anime' },
    { answer: 'REM', question: 'Koma dua season' },
    { answer: 'SAWIT', question: 'Tumbuhan kesukaan Prabowo' },
    { answer: 'DENIS', question: 'Karakter animasi Indonesia yang paling dibenci' },
    { answer: 'MINECRAFT', question: 'Game kotak' },
    { answer: 'CHITOGE', question: 'Gorilanya anime' },
    { answer: 'ANOTHER', question: 'Anime dengan adegan tangga dan payung' },
    { answer: 'PINJOL', question: 'Kegiatan memberikan identitas diri dan swafoto kepada aplikasi tertentu' },
    { answer: 'JUDOL', question: 'Penyebab orang sering menghutang dan memiliki emosi tidak stabil' },
    { answer: 'MELONTE', question: 'Kegiatan menjual diri' },
    { answer: 'MAKIMA', question: 'Rendangnya Chainsaw Man' },
    { answer: 'TUNG TUNG TUNG SAHUR', question: 'Karakter bentuk kentongan dan memegang tongkat' },
    { answer: 'HIDEKO', question: 'Sahabat pena Kak Ros' },
    { answer: 'CAPCUT', question: 'Aplikasi editing paling kikir' },
    { answer: 'YOASOBI', question: 'Racing Into the Night' },
    { answer: 'WALI', question: 'Grup musik religi Indonesia' },
    { answer: 'EMPAT MATA', question: 'Lagu FTV SCTV jaman dulu' },
    { answer: 'NOAH', question: 'Peterpan' },
    { answer: 'GEISHA', question: 'Karena Kamu' },
    { answer: 'ARMADA', question: 'Pergi Pagi Pulang Pagi' },
    { answer: 'DEWA 19', question: 'Separuh Nafas' },
    { answer: 'ONE DIRECTION', question: 'What Makes You Beautiful' },
    { answer: 'DESPACITO', question: 'Lagunya Luis Fonsi' },
    { answer: 'JUSTIN BIEBER', question: 'Beauty and a Beat' },
    { answer: 'LADY GAGA', question: 'Paparazi' },
    { answer: 'FIVE MINUTE', question: 'Semakin Ku Kejar Semakin Kau Jauh' },
    { answer: 'HUJAN', question: 'Utopia' },
    { answer: 'MEMBEGAL', question: 'Kegiatan mengambil kendaraan orang lain secara paksa' },
    { answer: 'BALI', question: 'Daerah sarang bule' },
    { answer: 'PLANKTON', question: 'Makhluk laut, kecil dan istrinya komputer' },
    { answer: 'TUAN KRABS', question: 'Kepiting kikir' },
    { answer: 'PATRICK', question: 'Makhluk laut, rumahnya batu, warna pink' },
    { answer: 'ISHOWSPEED', question: 'Ireng, keliling dunia sambil streaming' },
    { answer: 'PENGACARA', question: 'Pengangguran banyak acara' },
    { answer: 'MALAS', question: 'Tidak mau melakukan apa-apa' },
    { answer: 'KARBIT', question: 'Liat-suka-klaim' },
    { answer: 'FRIENDLY', question: 'Ramah ke semua orang' },
    { answer: 'JUST FRIEND', question: 'Hanya teman' },
    { answer: 'HTS', question: 'Hubungan tanpa status' },
    { answer: 'WNI', question: 'Status seumur hidup' },
    { answer: 'POLISI', question: 'Preman berseragam' },
    { answer: 'KIDAL', question: 'Kiri dari lahir' },
    { answer: 'KADAL', question: 'Kanan dari lahir' },
    { answer: 'GAPTEK', question: 'Gagap teknologi' },
    { answer: 'PANTEK', question: 'Pintar teknologi' },
    { answer: 'BACOT', question: 'Banyak cocot' },
    { answer: 'YTTA', question: 'Yang tau tau aja' },
    { answer: 'JOKOWI', question: 'Saya sampaikan, saya akan lawan!!!' },
    { answer: 'GAGAK', question: 'Burung terpintar di dunia' },
    { answer: 'KUNGKANG', question: 'Hewan paling lambat di dunia' },
    { answer: 'KUCING', question: 'Majikan hewan, babu manusia' },
    { answer: 'RASIS', question: 'Punya pandangan dan sikap buruk terhadap suku dan ras lainnya' },
    { answer: 'AI', question: 'Penyebab harga RAM naik' },
    { answer: 'GAY', question: 'Laki-laki yang menyukai sejenisnya' },
    { answer: 'LESBI', question: 'Perempuan yang menyukai sejenisnya' },
    { answer: 'APPLE', question: 'Merk smartphone yang bikin hotel rame tiap rilis produk baru' },
    { answer: 'ZOOFILIA', question: 'Manusia yang menyukai binatang secara seksual' },
    { answer: 'FURRY', question: 'Manusia yang menyukai karakter setengah binatang' },
    { answer: 'DUIT', question: 'Penghilang stress, terutama kertas merah dan biru' },
    { answer: 'NEMO', question: 'Ikan badut' },
    { answer: 'BADUT', question: 'Profesi yang berperan untuk menghibur dan membuat lawakan untuk orang lain' },
    { answer: 'NOBO', question: 'Susu monyet' },
    { answer: 'ICA', question: 'Nama babi' },
    { answer: 'KRISNA', question: 'Tinta pemilu' },
    { answer: 'ALUCARD', question: 'Dingin tetapi tidak kejam' },
    { answer: 'SULAWESI', question: 'Pulau S' },
    { answer: 'PIGAI', question: 'Ireng, menteri HAM' },
    { answer: 'IQ', question: 'Kecerdasan Intelektual' },
    { answer: 'EQ', question: 'Kecerdasan emosional' },
    { answer: 'SIPIT', question: 'China' },
    { answer: 'SKRIPSI', question: 'Karya tulis ilmiah yang berupa hasil penelitian mahasiswa' },
    { answer: 'ALAN WALKER', question: 'The Spectre' },
    { answer: 'EVANESCENCE', question: 'Bring Me To Life' },
    { answer: 'LENKA', question: 'Trouble Is a Friend' },
    { answer: 'WINDAH', question: 'YouTuber dengan julukan Dewa Kematian' },
    { answer: 'MIAWAUG', question: 'YouTuber dengan julukan Dewa Kehidupan' },
    { answer: 'LPG 3 KG', question: 'Hanya untuk masyarakat miskin' },
    { answer: 'AYAM', question: 'Salah satu artis Royco' },
    { answer: 'KAPITIL', question: 'Lawan kata kapital' },
    { answer: 'GALGAH', question: 'Lawan kata haus' },
    { answer: 'INNILO', question: 'Produk tiruan Milo yang dirilis oleh Wings Food' },
    { answer: 'KIKO', question: 'Eitss, bagi dua' },
    { answer: 'KANGKUNG', question: 'Sayuran dari Asia yang dilarang di Amerika' },
    { answer: 'SURFACE WEB', question: 'Lapisan internet yang berada di permukaan dan bisa di akses siapapun' },
    { answer: 'DEEP WEB', question: 'Lapisan internet yang berada dibatas permukaan' },
    { answer: 'DARK WEB', question: 'Lapisan internet yang berada di bagian terdalam' },
    { answer: 'MARIANA WEB', question: 'Lapisan internet yang berada paling jauh di bagian dalam tetapi hanya merupakan mitos' },
    { answer: 'SBY', question: 'Presiden garuk biji' },
    { answer: 'EHSAN', question: 'Intan payung' },
    { answer: 'IWAN', question: 'Karakter yang ngga mau ngomong dianimasi Boboiboy' },
    { answer: 'FOYA FOYA', question: 'Visi foya, misi foya. Visi misi' },
    { answer: 'MAGICOM', question: 'Putih, kecil, pinter masak nasi' },
    { answer: 'EWALLET', question: 'Tempat menyimpan uang secara digital dan tidak menggunakan nomor rekening' },
    { answer: 'NITROGEN', question: 'Gas terbanyak di atmosfer bumi' },
    { answer: 'NUKLIR', question: 'Senjata terkuat milik manusia' },
    { answer: 'AGUS BUNTUNG', question: 'Manusia, ngga punya tangan kanan dan kiri tapi kena kasus karna memperkosa perempuan' },
    { answer: 'AGUS SEDIH', question: 'Pernah booming dan viral, kena siram air keras di mata, dapet donasi 1,5M tapi ngga dipake buat perobatan matanya' },
    { answer: 'VIVO', question: 'Merk smartphone yang pertama kali merilis fitur kamera pop up' },
    { answer: 'LINUX', question: 'Contoh sistem operasi untuk komputer yang memungkinkan penggunanya bebas melakukan apa saja di dalamnya' },
    { answer: 'KIAMAT', question: 'Fenomena yang menimpa bumi di mana semua gunung meletus dan tanah terbelah' },
    { answer: 'IKHFA', question: 'Nama hukum tajwid yang cara bacanya disamarkan dan didengungkan' },
    { answer: 'IQLAB', question: 'Nama hukum tajwid yang hurufnya hanya ada Ba (ب)' },
    { answer: 'IZHAR', question: 'Nama hukum tajwid yang cara bacanya harus jelas' },
    { answer: 'AT TIN', question: 'Surat dalam Al-Qur\'an yang namanya berarti buah' },
    { answer: 'SAPI', question: 'Nama surat Al-Baqarah mempunyai arti kata' },
    { answer: 'GENJER', question: 'Sayuran rawa yang lagunya sempat dilarang pada masa Orde Baru' },
    { answer: 'NATTO', question: 'Makanan dari Jepang yang bersumber dari kedelai yang difermentasi' },
    { answer: 'KUACI', question: 'Makanan yang berasal dari biji bunga matahari' },
    { answer: 'MARKISA', question: 'Buah yang isinya seperti telur katak' },
    { answer: 'X', question: 'Nama panggilan anak dengan nama asli unik X Æ A-Xii' },
    { answer: 'DYRROTH', question: 'Hero Fighter Mobile Legends dengan julukan Prince of Abyss' },
    { answer: 'SUN', question: 'Hero Mobile Legends yang hobi bikin kloningan monkey' },
    { answer: 'ROBLOX', question: 'Platform yang di dalamnya terdapat banyak sekali game dan terkadang meniru game lainnya' },
    { answer: 'SEABANK', question: 'Bank digital berlogo oranye anak perusahaan Sea Group' },
    { answer: 'BYU', question: 'Kartu SIM yang mempunyai masa aktif selamanya' },
    { answer: 'MANHWA', question: 'Sebutan untuk komik buatan Korea' },
    { answer: 'MENDOAN', question: 'Gorengan tempe lebar setengah matang khas Banyumasan' },
    { answer: 'NINJA', question: 'Pasukan rahasia penganut shinobi dari Jepang' },
    { answer: 'SAMURAI', question: 'Prajurit ksatria pedang era feodal Jepang' },
    { answer: 'RAMEN', question: 'Mie kuah khas Jepang berkaldu gurih' },
    { answer: 'SUSHI', question: 'Nasi gulung rumput laut isi ikan segar khas Jepang' },
    { answer: 'KIMONO', question: 'Pakaian tradisional khas warga Jepang' },
    { answer: 'BCA', question: 'Bank swasta terbesar di Indonesia' },
    { answer: 'KOMIK', question: 'Buku cerita bergambar' },
    { answer: 'ANGRY BIRDS', question: 'Animasi dengan karakter berisi burung dan babi' },
    { answer: 'LENTERA', question: 'Lampu penerang kuno berbahan bakar minyak' },
    { answer: 'CANDI', question: 'Bangunan peninggalan bersejarah dari batu' },
    { answer: 'KAMUS', question: 'Buku kumpulan kata dan artinya' },
    { answer: 'MUSEUM', question: 'Tempat menyimpan dan memamerkan barang-barang bersejarah' }
];

global.quizQueue = {};

function getShuffledQuestions() {
    let array = [...ALL_QUESTIONS];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_wa');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' })
    });
// Fungsi untuk scraping lirik dari Genius
async function getGeniusLyrics(songTitle, artistName) {
    try {
        // 1. Cari URL lagu di Genius via API Search Genius/Google
        const query = `${songTitle} ${artistName} Genius lyrics`;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const { data: html } = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const $ = cheerio.load(html);
        let geniusUrl = '';
        $('.result__url').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('genius.com') && href.includes('-lyrics')) {
                geniusUrl = href;
                return false; // Stop loop
            }
        });

        if (!geniusUrl) return null;

        // Clean URL kalau ada redirect DuckDuckGo
        if (geniusUrl.includes('uddg=')) {
            geniusUrl = decodeURIComponent(geniusUrl.split('uddg=')[1].split('&')[0]);
        }

        // 2. Scrape halaman Genius
        const { data: pageHtml } = await axios.get(geniusUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $page = cheerio.load(pageHtml);

        let lyrics = '';
        $page('div[class*="Lyrics__Container"]').each((i, el) => {
            $page(el).find('br').replaceWith('\n');
            lyrics += $page(el).text() + '\n';
        });

        return lyrics.trim() || null;
    } catch (err) {
        console.error('Error Genius Scrape:', err.message);
        return null;
    }
}

    // FITUR OTOMATIS: PENGINGAT JUM'ATAN (SETIAP JUMAT JAM 11:30 WIB)
    cron.schedule('30 11 * * 5', async () => {
        try {
            // Ambil semua daftar chat/grup yang tersimpan
            const chats = await sock.groupFetchAllParticipating();
            const groupIds = Object.keys(chats);

            const jumatanText = `Panggilan kepada member grup yang muslim\n` +
                `Jum'atan woy Jum'atan, yang ngerasa muslim Jum'atan \n` +
                `Yang ngerasa muslim tapi ngga Jum'atan=gay🗿`;

            for (let id of groupIds) {
                await sock.sendMessage(id, { text: jumatanText });
            }
            console.log('✅ Pengingat Jumatan berhasil dikirim ke semua grup.');
        } catch (err) {
            console.error('❌ Gagal mengirim pengingat Jumatan:', err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Jakarta" // Memastikan waktu sesuai WIB
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting' && !sock.authState.creds.registered) {
            setTimeout(async () => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                const question = (text) => new Promise((resolve) => rl.question(text, resolve));

                console.log('\n=======================================');
                const phoneNumber = await question('Masukkan Nomor WA Bot (Contoh: 6281234567890): ');
                try {
                    const code = await sock.requestPairingCode(phoneNumber.trim());
                    console.log(`\n👉 KODE PAIRING KAMU: ${code}`);
                    console.log('=======================================\n');
                } catch (err) {
                    console.log('Gagal mengambil kode pairing, coba jalankan ulang script.');
                }
                rl.close();
            }, 3000);
        }

        if (connection === 'open') {
            console.log('✅ Bot WhatsApp Berhasil Terhubung!');

            let lastClosedDate = '';
            let lastOpenedDate = '';

            setInterval(async () => {
                const now = new Date();
                const hours = now.getHours();
                const minutes = now.getMinutes();
                const currentDate = now.toDateString();

                if (hours === 22 && minutes === 10 && lastClosedDate !== currentDate) {
                    console.log('⏰ [22:10 WIB] Menjalankan Auto Close Grup...');
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        for (let groupId in groups) {
                            try {
                                await sock.groupSettingUpdate(groupId, 'announcement');
                                await sock.sendMessage(groupId, {
                                    text: `📥 *GRUP DITUTUP OTOMATIS*\n\n🌙 *Status:* Ditutup\n⏰ *Waktu:* 22:00 WIB\n🌅 *Buka Kembali:* 05:10 WIB\n\nℹ️ Hanya admin yang dapat mengirim pesan.`
                                });
                                console.log(`✅ Auto close berhasil di: ${groups[groupId].subject}`);
                            } catch (err) {
                                console.log(`❌ Gagal auto close di ${groupId} (Bot bukan admin/error)`);
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        lastClosedDate = currentDate;
                    } catch (e) {
                        console.error('Error auto close:', e.message || e);
                    }
                }

                if (hours === 5 && minutes === 10 && lastOpenedDate !== currentDate) {
                    console.log('⏰ [05:10 WIB] Menjalankan Auto Open Grup...');
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        for (let groupId in groups) {
                            try {
                                await sock.groupSettingUpdate(groupId, 'not_announcement');
                                await sock.sendMessage(groupId, {
                                    text: `🔓 *GRUP DIBUKA OTOMATIS*\n\n☀️ *Status:* Dibuka\n⏰ *Waktu:* 05:10 WIB\n\nℹ️ Semua anggota sekarang dapat mengirim pesan kembali.`
                                });
                                console.log(`✅ Auto open berhasil di: ${groups[groupId].subject}`);
                            } catch (err) {
                                console.log(`❌ Gagal auto open di ${groupId} (Bot bukan admin/error)`);
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        lastOpenedDate = currentDate;
                    } catch (e) {
                        console.error('Error auto open:', e.message || e);
                    }
                }
            }, 10000);

        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Koneksi terputus (Status: ${statusCode}). Mencoba menghubungkan ulang dalam 5 detik...`);

            if (shouldReconnect) {
                setTimeout(() => {
                    startBot();
                }, 5000);
            }
        }
    });

    sock.ev.on('group-participants.update', async (num) => {
        const { id, participants, action } = num;
        for (let p of participants) {
            const jid = typeof p === 'string' ? p : p.id;
            if (!jid) continue;

            try {
                let ppUser = null;
                try {
                    const ppUrl = await sock.profilePictureUrl(jid, 'image');
                    const res = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    ppUser = Buffer.from(res.data, 'binary');
                } catch {
                    ppUser = null;
                }

                if (action === 'add') {
                    const welcomeText = `👋 *HALO MEMBER BARU!*\n\nSelamat datang @${jid.split('@')[0]} di grup!\n\n📌 *Catatan:* Mampir dulu ke deskripsi grup dan aktif ngobrol ya!`;
                    if (ppUser) {
                        await sock.sendMessage(id, { image: ppUser, caption: welcomeText, mentions: [jid] });
                    } else {
                        await sock.sendMessage(id, { text: welcomeText, mentions: [jid] });
                    }
                } else if (action === 'remove') {
                    const goodbyeText = `👋 *SELAMAT TINGGAL!*\n\nMember @${jid.split('@')[0]} telah keluar/dikeluarkan dari grup. Sampai jumpa lagi!`;
                    if (ppUser) {
                        await sock.sendMessage(id, { image: ppUser, caption: goodbyeText, mentions: [jid] });
                    } else {
                        await sock.sendMessage(id, { text: goodbyeText, mentions: [jid] });
                    }
                }
            } catch (err) {
                console.error('Error welcome/goodbye:', err.message || err);
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const type = Object.keys(msg.message)[0];
            const body = (msg.message.conversation ||
                         msg.message.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption ||
                         msg.message.videoMessage?.caption || '').trim();
            const isGroup = from.endsWith('@g.us');
            const sender = msg.key.participant || msg.key.remoteJid;
if (!dbUsers[sender]) {
    dbUsers[sender] = { xp: 0, level: 1, coin: 0, inventory: [], equippedItem: null };
}

if (dbUsers[sender].level < 100) {
    let baseXP = 10;
    let bonusPercent = 0;

    // Tambahan Bonus XP jika memakai item Gacha
    if (dbUsers[sender].equippedItem) {
        const activeItem = GACHA_ITEMS.find(i => i.id === dbUsers[sender].equippedItem);
        if (activeItem) bonusPercent = GACHA_TIERS[activeItem.tier].bonusXp;
    }

    dbUsers[sender].xp += Math.round(baseXP * (1 + bonusPercent));
    
    // Logika Level Up: Butuh (Level * 1000) XP
    const xpRequired = dbUsers[sender].level * 1000;
    
    if (dbUsers[sender].xp >= xpRequired) {
        dbUsers[sender].level += 1;
        dbUsers[sender].xp -= xpRequired;
        dbUsers[sender].coin += 2000; // Bonus 2000 Koin tiap naik level
        saveUsers();

        const pangkatBaru = getPangkat(dbUsers[sender].level);
        const levelUpMsg = `🎉 *LEVEL UP!* 🎉\n\nSelamat @${sender.split('@')[0]}!\nKamu telah mencapai *Level ${dbUsers[sender].level}*\nPangkatmu kini: *${pangkatBaru}*\n🎁 *Bonus Naik Level:* +2.000 Koin`;
        await sock.sendMessage(from, { text: levelUpMsg, mentions: [sender] }, { quoted: msg });
    } else {
        saveUsers();
    }
}

        // CATAT AKTIVITAS ANGGOTA UNTUK FITUR .SIDER
        if (isGroup) {
            userActivity[from] = userActivity[from] || {};
            userActivity[from][sender] = Date.now();
            saveActivity();
        }
        // AUTO DELETE BADWORD (OPTIMIZED & NON-BLOCKING)
        if (isGroup && blacklistData[from]?.length > 0 && body && !body.startsWith('.') && !body.startsWith('!')) {
            const lowerBody = body.toLowerCase();
            const isForbidden = blacklistData[from].some(word => lowerBody.includes(word.toLowerCase()));

            if (isForbidden) {
                // Jalankan penghapusan secara asinkron tanpa menahan perintah lain
                (async () => {
                    try {
                        await sock.sendMessage(from, { delete: msg.key });
                        const cleanSender = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
                        
                        const warnMsg = await sock.sendMessage(from, { 
                            text: `⚠️ Pesan dari @${cleanSender} dihapus (kata terlarang)!`,
                            mentions: [sender]
                        });

                        setTimeout(() => {
                            sock.sendMessage(from, { delete: warnMsg.key }).catch(() => {});
                        }, 3000);
                    } catch (e) {
                        console.error('Gagal hapus badword spam:', e);
                    }
                })();

                return; // Langsung keluar dari handler agar pesan terlarang tidak diproses lebih jauh
            }
        }

        // AUTO DELETE UNTUK MEMBER YANG DI-MUTE
        if (isGroup && mutedUsers[from] && mutedUsers[from].length > 0) {
            const cleanSender = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
            
            const isMuted = mutedUsers[from].some(targetJid => {
                const cleanTarget = targetJid.split(':')[0].split('@')[0].replace(/\D/g, '');
                return cleanTarget === cleanSender;
            });

            if (isMuted) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                    return;
                } catch (e) {
                    console.error('Gagal hapus pesan muted user:', e);
                }
            }
        }

        // 1. COMMAND .AFK (<alasan>)
        if ((body.startsWith('.afk') || body.startsWith('!afk')) && isGroup) {
            const reason = body.replace(/^\.afk|^\!afk/i, '').trim() || 'Tanpa alasan';
            if (!afkData[from]) afkData[from] = {};

            afkData[from][sender] = {
                time: Date.now(),
                reason: reason
            };
            saveAfk();

            return await sock.sendMessage(from, {
                text: `💤 @${sender.split('@')[0]} sekarang *AFK*.\n📝 *Alasan:* ${reason}`,
                mentions: [sender]
            }, { quoted: msg });
        }

        // 2. DETEKSI OTOMATIS: KELUAR DARI AFK
        if (isGroup && afkData[from] && afkData[from][sender]) {
            const duration = formatDuration(Date.now() - afkData[from][sender].time);
            const reason = afkData[from][sender].reason;
            delete afkData[from][sender];
            saveAfk();

            await sock.sendMessage(from, {
                text: `✨ @${sender.split('@')[0]} telah kembali dari AFK di grup ini.\n\n📝 *Alasan:* ${reason}\n⏳ *Durasi:* ${duration}`,
                mentions: [sender]
            }, { quoted: msg });
        }

        // 3. DETEKSI OTOMATIS: MENTION / REPLY ORANG AFK
        if (isGroup) {
            let mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const quotedSender = msg.message.extendedTextMessage?.contextInfo?.participant;
            if (quotedSender) mentionedJids.push(quotedSender);

            if (mentionedJids.length > 0 && afkData[from]) {
                for (let jid of mentionedJids) {
                    if (afkData[from][jid]) {
                        const duration = formatDuration(Date.now() - afkData[from][jid].time);
                        const reason = afkData[from][jid].reason;
                        await sock.sendMessage(from, {
                            text: `⚠️ Jangan tag @${jid.split('@')[0]}, dia sedang *AFK* di grup ini!\n\n📝 *Alasan:* ${reason}\n⏳ *Selama:* ${duration}`,
                            mentions: [jid]
                        }, { quoted: msg });
                    }
                }
            }
        }

            if ((body.startsWith('.mute') || body.startsWith('!mute')) && isGroup) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);

                    if (!groupAdmins.includes(sender)) {
                        return await sock.sendMessage(from, { text: '❌ Fitur ini cuma bisa dipakai oleh Admin grup!' }, { quoted: msg });
                    }

                    let target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                                 msg.message.extendedTextMessage?.contextInfo?.participant;

                    if (!target) {
                        return await sock.sendMessage(from, { text: '❌ Tag atau reply member yang mau di-mute!\nContoh: *.mute @user*' }, { quoted: msg });
                    }

                    if (!mutedUsers[from]) mutedUsers[from] = [];

                    if (mutedUsers[from].includes(target)) {
                        return await sock.sendMessage(from, { text: `⚠️ Member @${target.split('@')[0]} sudah dalam status mute!`, mentions: [target] }, { quoted: msg });
                    }

                    mutedUsers[from].push(target);
                    await sock.sendMessage(from, { text: `🔇 Member @${target.split('@')[0]} berhasil di-mute! Setiap pesannya akan otomatis dihapus oleh bot.`, mentions: [target] }, { quoted: msg });
                } catch (err) {
                    console.error('Mute Error:', err);
                }
            }

            if ((body.startsWith('.unmute') || body.startsWith('!unmute')) && isGroup) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);

                    if (!groupAdmins.includes(sender)) {
                        return await sock.sendMessage(from, { text: '❌ Fitur ini cuma bisa dipakai oleh Admin grup!' }, { quoted: msg });
                    }

                    let target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                                 msg.message.extendedTextMessage?.contextInfo?.participant;

                    if (!target) {
                        return await sock.sendMessage(from, { text: '❌ Tag atau reply member yang mau di-unmute!\nContoh: *.unmute @user*' }, { quoted: msg });
                    }

                    if (!mutedUsers[from] || !mutedUsers[from].includes(target)) {
                        return await sock.sendMessage(from, { text: `⚠️ Member @${target.split('@')[0]} sedang tidak di-mute.`, mentions: [target] }, { quoted: msg });
                    }

                    mutedUsers[from] = mutedUsers[from].filter(u => u !== target);
                    await sock.sendMessage(from, { text: `🔊 Member @${target.split('@')[0]} berhasil di-unmute. Sekarang sudah bisa kirim pesan lagi!`, mentions: [target] }, { quoted: msg });
                } catch (err) {
                    console.error('Unmute Error:', err);
                }
            }

        // FITUR ADMIN: TAMBAH KATA BLACKLIST (.addbadword <kata>)
        if ((body.startsWith('.addbadword ') || body.startsWith('!addbadword ')) && isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);

                if (!groupAdmins.includes(sender)) {
                    return await sock.sendMessage(from, { text: '❌ Fitur ini cuma bisa dipakai oleh Admin grup!' }, { quoted: msg });
                }

                const wordToAdd = body.replace(/^\.addbadword |^\!addbadword /i, '').trim().toLowerCase();
                if (!wordToAdd) {
                    return await sock.sendMessage(from, { text: '❌ Masukkan kata/kalimat yang mau diblacklist!\nContoh: *.addbadword jancok*' }, { quoted: msg });
                }

                if (!blacklistData[from]) blacklistData[from] = [];

                if (blacklistData[from].includes(wordToAdd)) {
                    return await sock.sendMessage(from, { text: `⚠️ Kata/kalimat "*${wordToAdd}*" sudah ada di daftar blacklist!` }, { quoted: msg });
                }

                blacklistData[from].push(wordToAdd);
                saveBlacklist();

                return await sock.sendMessage(from, { text: `✅ Berhasil menambahkan "*${wordToAdd}*" ke daftar kata terlarang di grup ini!` }, { quoted: msg });
            } catch (err) {
                console.error('Add Badword Error:', err);
            }
        }

        // FITUR ADMIN: HAPUS KATA BLACKLIST (.delbadword <kata>)
        if ((body.startsWith('.delbadword ') || body.startsWith('!delbadword ')) && isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);

                if (!groupAdmins.includes(sender)) {
                    return await sock.sendMessage(from, { text: '❌ Fitur ini cuma bisa dipakai oleh Admin grup!' }, { quoted: msg });
                }

                const wordToDel = body.replace(/^\.delbadword |^\!delbadword /i, '').trim().toLowerCase();
                if (!wordToDel) {
                    return await sock.sendMessage(from, { text: '❌ Masukkan kata/kalimat yang mau dihapus dari blacklist!' }, { quoted: msg });
                }

                if (!blacklistData[from] || !blacklistData[from].includes(wordToDel)) {
                    return await sock.sendMessage(from, { text: `⚠️ Kata/kalimat "*${wordToDel}*" tidak ditemukan di daftar blacklist grup ini.` }, { quoted: msg });
                }

                blacklistData[from] = blacklistData[from].filter(w => w !== wordToDel);
                saveBlacklist();

                return await sock.sendMessage(from, { text: `✅ Berhasil menghapus "*${wordToDel}*" dari daftar kata terlarang!` }, { quoted: msg });
            } catch (err) {
                console.error('Del Badword Error:', err);
            }
        }

        // FITUR ADMIN: LIST KATA BLACKLIST (.listbadword)
        if ((body === '.listbadword' || body === '!listbadword') && isGroup) {
            try {
                const words = blacklistData[from] || [];
                if (words.length === 0) {
                    return await sock.sendMessage(from, { text: '📜 Belum ada kata/kalimat yang diblacklist di grup ini.' }, { quoted: msg });
                }

                let text = `📜 *DAFTAR KATA TERLARANG GRUP*\n\n`;
                words.forEach((w, i) => {
                    text += `${i + 1}. ${w}\n`;
                });
                text += `\n📌 *Catatan:* Setiap pesan member yang mengandung kata di atas akan otomatis dihapus oleh bot.`;

                return await sock.sendMessage(from, { text: text }, { quoted: msg });
            } catch (err) {
                console.error('List Badword Error:', err);
            }
        }

            if (from.endsWith('@g.us') && afkData[from] && afkData[from][sender]) {
                const duration = formatDuration(Date.now() - afkData[from][sender].time);
                const reason = afkData[from][sender].reason;
                delete afkData[from][sender];
                saveAfk();

                await sock.sendMessage(from, {
                    text: `✨ @${sender.split('@')[0]} telah kembali dari AFK di grup ini.\n\n📝 *Alasan:* ${reason}\n⏳ *Durasi:* ${duration}`,
                    mentions: [sender]
                }, { quoted: msg });
            }

            if (from.endsWith('@g.us')) {
                let mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const quotedSender = msg.message.extendedTextMessage?.contextInfo?.participant;
                if (quotedSender) mentionedJids.push(quotedSender);

                if (mentionedJids.length > 0 && afkData[from]) {
                    for (let jid of mentionedJids) {
                        if (afkData[from][jid]) {
                            const duration = formatDuration(Date.now() - afkData[from][jid].time);
                            const reason = afkData[from][jid].reason;
                            await sock.sendMessage(from, {
                                text: `⚠️ Jangan tag @${jid.split('@')[0]}, dia sedang *AFK* di grup ini!\n\n📝 *Alasan:* ${reason}\n⏳ *Selama:* ${duration}`,
                                mentions: [jid]
                            }, { quoted: msg });
                        }
                    }
                }
            }

        // FITUR UTAMA: Menu Bot (.menu / !menu)
        if (body === '.menu' || body === '!menu' || body === '/menu' || body === '.help' || body === '!help') {
            const menuText = `✨ *Daftar Menu Takamiya Bot* ✨

🛠 *MEDIA & TOOL*
  ├ *.sticker* / *.stiker*
  │  └ Kirim/reply gambar atau video pendek (max 10 detik) untuk dibikin stiker.
  ├ *.smeme <teks atas> | <teks bawah>*
  │  └ Reply gambar untuk buat stiker meme teks.
  ├ *.brat <teks>*
  │  └ Bikin stiker teks latar putih gaya Brat.
  ├ *.pin <kata kunci>*
  │  └ Cari dan unduh gambar presisi.
  ├ *.lagu <judul>*
  │  └ Unduh lagu mp3 otomatis dari YouTube.
  ├ *.play <judul>*
  │  └ Cari & pilih lagu dari 5 daftar hasil pencarian.
  ├ *.tt <link tiktok>*
  │  └ Download video TikTok tanpa watermark.
  └ *.intip*
     └ Reply foto/video "Sekali Lihat" (View Once).

👥 *FITUR GRUP*
  ├ *.afk <alasan>*
  │  └ Mengatur status AFK khusus di grup ini.
  ├ *.mute @user*
  │  └ Hapus otomatis setiap pesan member (Khusus Admin).
  ├ *.unmute @user*
  │  └ Kembalikan izin pesan member (Khusus Admin).
  ├ *.open* / *.close*
  │  └ Buka / Tutup grup (Khusus Admin).
  ├ *.roast @user*
  │  └ Nyindir/roast member (Khusus Grup).
  ├ *.sider*
  │  └ Cek member grup yang tidak aktif selama 3 hari.
  └ *.hidetag <pesan>*
     └ Tag seluruh member grup secara tersembunyi.

🚫 *MODERASI KATA (BLACKLIST)*
  ├ *.addbadword <kata>*
  │  └ Tambah kata terlarang yang bakal dihapus otomatis (Khusus Admin).
  ├ *.delbadword <kata>*
  │  └ Hapus kata dari daftar blacklist (Khusus Admin).
  └ *.listbadword*
     └ Lihat daftar kata terlarang di grup ini.

🎮 *MINI GAMES & POIN*
  ├ *.tebakkata* / *.susunkata*
  │  └ Kuis tebak kata dari clue/soal kocak.
  ├ *.tebakangka*
  │  └ Game tebak angka 1 - 10.
  ├ *.poin* / *.me*
  │  └ Cek total poin kamu di grup ini.
  ├ *.top* / *.leaderboard*
  │  └ Cek 5 pemain dengan poin tertinggi di grup ini.
  └ *.nyerah*
     └ Menyerah dan lihat jawaban game yang berjalan.

🎮 *RPG & GACHA SYSTEM*
├─ *.profil / .level*
│  └ Cek level, pangkat, koin, dan item aktif.
├─ *.daily*
│  └ Klaim gaji harian (cooldown 24 jam).
├─ *.tf @user <jumlah>*
│  └ Transfer koin ke member lain.
├─ *.gacha / .gacha 10*
│  └ Summon item gacha (1x / 10x pull).
├─ *.koleksi / .inventory*
│  └ Lihat daftar item gacha yang dimiliki.
├─ *.pakai <id_item>*
│  └ Pasang item gacha untuk bonus EXP.
└─ *.lepas*
   └ Lepas item gacha yang sedang dipakai.

📌 *Auto Close: 22:10 WIB | Auto Open: 05:10 WIB*`;

            return await sock.sendMessage(from, { text: menuText });
        }

            if (body.startsWith('.sticker') || body.startsWith('!sticker') || body.startsWith('.stiker') || body.startsWith('!stiker')) {
                const isImage = type === 'imageMessage';
                const isVideo = type === 'videoMessage';
                const isQuotedImage = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;
                const isQuotedVideo = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.videoMessage;

                if (isImage || isQuotedImage) {
                    await sock.sendMessage(from, { text: '⏳ Lagi bikin stiker gambar...' });

                    const targetMsg = isImage ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                    const stream = await downloadContentFromMessage(targetMsg, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const tempIn = `./temp_${Date.now()}.jpg`;
                    const tempOut = `./temp_${Date.now()}.webp`;
                    fs.writeFileSync(tempIn, buffer);

                    ffmpeg(tempIn)
                        .outputOptions(['-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512'])
                        .toFormat('webp')
                        .save(tempOut)
                        .on('end', async () => {
                            await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) }, { quoted: msg });
                            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                        })
                        .on('error', async (err) => {
                            console.error(err);
                            await sock.sendMessage(from, { text: '❌ Gagal membuat stiker gambar.' });
                        });
                } else if (isVideo || isQuotedVideo) {
                    const targetMsg = isVideo ? msg.message.videoMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage;

                    if (targetMsg.seconds > 10) {
                        return await sock.sendMessage(from, { text: '❌ Durasi video terlalu panjang! Maksimal 10 detik untuk stiker bergerak.' }, { quoted: msg });
                    }

                    await sock.sendMessage(from, { text: '⏳ Lagi bikin stiker bergerak (animasi)...' });

                    const stream = await downloadContentFromMessage(targetMsg, 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const tempIn = `./temp_vid_${Date.now()}.mp4`;
                    const tempOut = `./temp_vid_${Date.now()}.webp`;
                    fs.writeFileSync(tempIn, buffer);

                    ffmpeg(tempIn)
                        .outputOptions([
                            '-vcodec libwebp',
                            '-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15',
                            '-loop 0',
                            '-preset default',
                            '-an',
                            '-vsync 0'
                        ])
                        .toFormat('webp')
                        .save(tempOut)
                        .on('end', async () => {
                            await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) }, { quoted: msg });
                            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                        })
                        .on('error', async (err) => {
                            console.error(err);
                            await sock.sendMessage(from, { text: '❌ Gagal membuat stiker bergerak.' });
                        });
                } else {
                    await sock.sendMessage(from, { text: '❌ Kirim/reply gambar atau video pendek (<10 detik) dengan caption *.stiker*' }, { quoted: msg });
                }
            }
  // --- 3. COMMAND PERINTAH RPG & GACHA ---
        if (body === '.profil' || body === '.level') {
            const u = dbUsers[sender];
            const reqXp = u.level >= 100 ? 'MAX' : u.level * 1000;
            const pangkat = getPangkat(u.level);
            
            let activeItemText = 'Tidak ada';
            if (u.equippedItem) {
                const item = GACHA_ITEMS.find(i => i.id === u.equippedItem);
                if (item) activeItemText = `${item.name} (+${GACHA_TIERS[item.tier].bonusXp * 100}% EXP)`;
            }

            const textProfil = `📊 *PROFIL RPG USER*\n\n` +
                               `👤 Pangkat: *${pangkat}*\n` +
                               `🎖️ Level: *${u.level} / 100*\n` +
                               `✨ XP: *${u.xp} / ${reqXp}*\n` +
                               `💰 Koin: *${u.coin}*\n` +
                               `🎴 Item Dipakai: *${activeItemText}*\n\n` +
                               `💡 _Ketik *.gacha* untuk summon item atau *.daily* untuk gaji harian!_`;

            return await sock.sendMessage(from, { text: textProfil }, { quoted: msg });
        }

        if (body === '.daily') {
            const u = dbUsers[sender];
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            
            if (now - (u.lastDaily || 0) < cooldown) {
                const timeLeft = cooldown - (now - u.lastDaily);
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return await sock.sendMessage(from, { text: `⏳ Kamu sudah klaim hari ini! Tunggu *${hours} jam ${minutes} menit* lagi.` }, { quoted: msg });
            }

            const gotCoin = Math.floor(Math.random() * 2001) + 1000;
            u.coin += gotCoin;
            u.lastDaily = now;
            saveUsers();

            return await sock.sendMessage(from, { text: `✅ *GAJI HARIAN CAIR!*\n\n🎁 Kamu mendapatkan *+${gotCoin} Koin*!` }, { quoted: msg });
        }

        if (body.startsWith('.tf ') || body.startsWith('.transfer ')) {
            if (!msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                return await sock.sendMessage(from, { text: '⚠️ Tag orangnya! Contoh: *.tf @user 500*' }, { quoted: msg });
            }
            
            const target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            const amount = parseInt(body.split(' ').pop());

            if (isNaN(amount) || amount <= 0) return await sock.sendMessage(from, { text: '⚠️ Jumlah koin tidak valid!' }, { quoted: msg });
            if (dbUsers[sender].coin < amount) return await sock.sendMessage(from, { text: '❌ Koinmu tidak cukup!' }, { quoted: msg });

            if (!dbUsers[target]) dbUsers[target] = { xp: 0, level: 1, coin: 0, inventory: [], equippedItem: null };

            dbUsers[sender].coin -= amount;
            dbUsers[target].coin += amount;
            saveUsers();

            return await sock.sendMessage(from, { 
                text: `💸 *TRANSFER BERHASIL!*\n\nKamu berhasil mengirim *${amount} Koin* ke @${target.split('@')[0]}.`,
                mentions: [target]
            }, { quoted: msg });
        }

        if (body.startsWith('.gacha') || body.startsWith('.summon')) {
            const is10x = body.includes('10');
            const cost = is10x ? 9000 : 1000;
            const pulls = is10x ? 10 : 1;

            if (dbUsers[sender].coin < cost) {
                return await sock.sendMessage(from, { text: `❌ Koin tidak cukup! Gacha ${pulls}x butuh *${cost} Koin*.` }, { quoted: msg });
            }

            dbUsers[sender].coin -= cost;
            let pullsResult = [];

            // === PERULANGAN GACHA DENGAN SKALA 1000 ===
            for (let i = 0; i < pulls; i++) {
                const rng = Math.floor(Math.random() * 1000) + 1; // Dadu 1 - 1000
                
                let selectedTier = 'COMMON'; // Fallback 57.5%
                
                if (rng <= 5) selectedTier = 'MYTHIC';           // 0.5% Rate (Peluang 5/1000)
                else if (rng <= 25) selectedTier = 'LEGENDARY';  // 2.0% Rate (Peluang 20/1000)
                else if (rng <= 125) selectedTier = 'EPIC';      // 10% Rate  (Peluang 100/1000)
                else if (rng <= 425) selectedTier = 'RARE';      // 30% Rate  (Peluang 300/1000)

                // Filter & dapatkan item
                let pool = GACHA_ITEMS.filter(item => item && item.tier === selectedTier);
                if (pool.length === 0) pool = GACHA_ITEMS; // Safety check

                const gotItem = pool[Math.floor(Math.random() * pool.length)];

                if (gotItem && gotItem.id) {
                    pullsResult.push(gotItem);
                    if (!dbUsers[sender].inventory.includes(gotItem.id)) {
                        dbUsers[sender].inventory.push(gotItem.id);
                    }
                }
            }

            // === 2. SIMPAN HASIL KE users.json ===
            saveUsers();

            // === 3. KIRIM PESAN HASIL GACHA ===
            if (is10x) {
                let text10x = `🎰 *HASIL 10x GACHA SUMMON* 🎰\n\n`;
                pullsResult.forEach((item, idx) => {
                    text10x += `${idx + 1}. *${item.name}* [${item.tier}] (+${GACHA_TIERS[item.tier].bonusXp * 100}% EXP)\n`;
                });
                text10x += `\n💡 _Ketik *.koleksi* untuk melihat item yang didapat!_`;
                return await sock.sendMessage(from, { text: text10x }, { quoted: msg });
            } else {
                const item = pullsResult[0];
                const tierInfo = GACHA_TIERS[item.tier];
                const captionText = `🎰 *HASIL SUMMON GACHA* 🎰\n\n` +
                                    `✨ Item: *${item.name}*\n` +
                                    `🏷️ Rank: *${tierInfo.name}*\n` +
                                    `⚡ Bonus EXP: *+${tierInfo.bonusXp * 100}%*\n\n` +
                                    `💡 _Ketik *.pakai ${item.id}* untuk memasang item ini!_`;

                if (fs.existsSync(item.image)) {
                    return await sock.sendMessage(from, { image: fs.readFileSync(item.image), caption: captionText }, { quoted: msg });
                } else {
                    return await sock.sendMessage(from, { text: captionText }, { quoted: msg });
                }
            }
        }

        if (body === '.koleksi' || body === '.inventory') {
            const inv = dbUsers[sender].inventory || [];
            const equipped = dbUsers[sender].equippedItem;

            let textKoleksi = `🎴 *INVENTARIS & KOLEKSI GACHA* 🎴\n\n`;

            if (inv.length === 0) {
                textKoleksi += `_Belum punya koleksi. Ketik *.gacha* untuk summon!_`;
            } else {
                inv.forEach(id => {
                    const item = GACHA_ITEMS.find(i => i.id === id);
                    if (item) {
                        const isEquipped = equipped === item.id ? ' [DIPAKAI ✅]' : '';
                        textKoleksi += `• *${item.name}* (${item.tier}) - Bonus +${GACHA_TIERS[item.tier].bonusXp * 100}% EXP${isEquipped}\n  └ ID: \`.pakai ${item.id}\`\n`;
                    }
                });
            }

            return await sock.sendMessage(from, { text: textKoleksi }, { quoted: msg });
        }

        if (body.startsWith('.pakai ')) {
            const itemId = body.split(' ')[1]?.toLowerCase();
            if (!dbUsers[sender].inventory.includes(itemId)) {
                return await sock.sendMessage(from, { text: '❌ Kamu tidak punya item ini! Cek daftar di *.koleksi*' }, { quoted: msg });
            }

            const selected = GACHA_ITEMS.find(i => i.id === itemId);
            dbUsers[sender].equippedItem = itemId;
            saveUsers();

            return await sock.sendMessage(from, { 
                text: `✅ Berhasil memasang *${selected.name}*!\n⚡ *Bonus +${GACHA_TIERS[selected.tier].bonusXp * 100}% EXP* sekarang aktif!` 
            }, { quoted: msg });
        }

        // 1. Command .lepas
        if (body === '.lepas') {
            dbUsers[sender].equippedItem = null;
            saveUsers();
            return await sock.sendMessage(from, { text: '✅ Item dilepas. Bonus EXP kembali normal.' }, { quoted: msg });
        }

            if (body.startsWith('.pin ') || body.startsWith('!pin ') || body.startsWith('.pinterest ') || body.startsWith('!pinterest ')) {
                const cheerio = require('cheerio');

                const textSource = msg.message.conversation ||
                                   msg.message.extendedTextMessage?.text ||
                                   msg.message.imageMessage?.caption || '';

                const query = textSource.replace(/^\.pin|^\!pin|^\.pinterest|^\!pinterest/i, '').trim();

                if (!query) {
                    return await sock.sendMessage(from, { text: '❌ Masukkan kata kuncinya!\nContoh: *.pin Erick Thohir*' }, { quoted: msg });
                }

                await sock.sendMessage(from, { text: `🔍 Mencari gambar *${query}*...` }, { quoted: msg });

                try {
                    const searchUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(query + ' site:pinterest.com OR portrait')}&first=1&count=20`;

                    const response = await axios.get(searchUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    const $ = cheerio.load(response.data);
                    let images = [];

                    $('.iusc').each((i, el) => {
                        try {
                            const mData = $(el).attr('m');
                            if (mData) {
                                const parsed = JSON.parse(mData);
                                if (parsed.murl && parsed.murl.startsWith('http')) {
                                    images.push(parsed.murl);
                                }
                            }
                        } catch (e) {}
                    });

                    if (images.length > 0) {
                        const topResults = images.slice(0, 10);
                        const selectedImg = topResults[Math.floor(Math.random() * topResults.length)];

                        await sock.sendMessage(from, {
                            image: { url: selectedImg },
                            caption: `✨ *Hasil Pencarian Gambar*\n🔍 *Kata kunci:* ${query}`
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: '❌ Gambar tidak ditemukan. Coba kata kunci lain.' }, { quoted: msg });
                    }
                } catch (e) {
                    console.error('Scraper Error:', e.message || e);
                    await sock.sendMessage(from, { text: '❌ Gagal mengambil gambar.' }, { quoted: msg });
                }
            }

// =========================================================
// COMMAND .ADDCOIN / .ADDKOIN (KHUSUS OWNER)
// =========================================================
if (body.startsWith('.addcoin ') || body.startsWith('.addkoin ')) {
    
    // Cek nomor WA biasa ATAU ID @lid milikmu ATAU fromMe
    const isOwner = sender.includes('6285870706756') || sender.includes('206214399049904') || msg.key.fromMe;

    if (!isOwner) {
        console.log('⚠️ Akses owner ditolak untuk sender ID:', sender);
        return await sock.sendMessage(from, { text: '❌ Fitur ini khusus Owner bot!' }, { quoted: msg });
    }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const args = body.split(' ');
    const amount = parseInt(args[args.length - 1]);

    if (isNaN(amount) || amount <= 0) {
        return await sock.sendMessage(from, { text: '⚠️ Format salah! Contoh: *.addcoin @user 50000* atau *.addcoin 100000*' }, { quoted: msg });
    }

    const target = mentioned || sender;

    if (!dbUsers[target]) {
        dbUsers[target] = { xp: 0, level: 1, coin: 0, inventory: [], equippedItem: null };
    }

    dbUsers[target].coin += amount;
    saveUsers();

    return await sock.sendMessage(from, {
        text: `👑 *OWNER INJECTION SUCCESS!*\n\nBerhasil menambahkan *+${amount.toLocaleString('id-ID')} Koin* ke @${target.split('@')[0]}.`,
        mentions: [target]
    }, { quoted: msg });
}

// FITUR STIKER MEME LOKAL FFMPEG (.smeme teks)
        if (body.startsWith('.smeme') || body.startsWith('!smeme')) {
            const isImg = type === 'imageMessage';
            const isQImg = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;

            if (!isImg && !isQImg) {
                return await sock.sendMessage(from, { text: '❌ Kirim/reply gambar dengan caption *.smeme teks*' }, { quoted: msg });
            }

            const textSource = msg.message.conversation ||
                               msg.message.extendedTextMessage?.text ||
                               msg.message.imageMessage?.caption || '';

            const inputTeks = textSource.replace(/^\.smeme|^\!smeme/i, '').trim();
            if (!inputTeks) {
                return await sock.sendMessage(from, { text: '❌ Masukkan teksnya! Contoh: *.smeme aku raja | dan kamu*' }, { quoted: msg });
            }

            // Batasi maks 9 karakter per baris agar teks tebal tidak melebihi batas gambar
            const wrapToLines = (str, maxCharsPerLine = 9) => {
                const words = str.trim().toUpperCase().split(/\s+/);
                let lines = [];
                let currentLine = '';

                for (let word of words) {
                    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
                        currentLine = (currentLine + ' ' + word).trim();
                    } else {
                        if (currentLine) lines.push(currentLine);
                        currentLine = word;
                    }
                }
                if (currentLine) lines.push(currentLine);
                return lines;
            };

            const cleanText = (str) => {
                return (str || '')
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, '’')
                    .replace(/"/g, '')
                    .replace(/%/g, '%%')
                    .replace(/:/g, '\\:');
            };

            let topRaw = '';
            let bottomRaw = '';

            if (inputTeks.includes('|')) {
                const parts = inputTeks.split('|');
                topRaw = parts[0];
                bottomRaw = parts[1];
            } else {
                topRaw = inputTeks;
            }

            const topLines = wrapToLines(topRaw, 9);
            const bottomLines = wrapToLines(bottomRaw, 9);

            await sock.sendMessage(from, { text: '⏳ Memproses stiker meme...' });

            try {
                const targetMsg = isImg ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                const stream = await downloadContentFromMessage(targetMsg, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const tempIn = `./smeme_in_${Date.now()}.jpg`;
                const tempOut = `./smeme_out_${Date.now()}.webp`;
                fs.writeFileSync(tempIn, buffer);

                const fontPath = fs.existsSync('/system/fonts/Roboto-Bold.ttf')
                    ? '/system/fonts/Roboto-Bold.ttf'
                    : '/system/fonts/Roboto-Regular.ttf';

                let drawFilters = ['scale=512:512:force_original_aspect_ratio=increase', 'crop=512:512'];

                // Ukuran font presisi aman batas layar
                const topFontSize = topLines.length > 1 ? 'h/10' : 'h/7';
                const topSpacing = topLines.length > 1 ? 42 : 55;

                const bottomFontSize = bottomLines.length > 1 ? 'h/10' : 'h/7';
                const bottomSpacing = bottomLines.length > 1 ? 42 : 55;

                // Render baris teks atas
                topLines.forEach((line, index) => {
                    const safeLine = cleanText(line);
                    if (safeLine) {
                        const yPos = 20 + (index * topSpacing);
                        drawFilters.push(`drawtext=fontfile='${fontPath}':text='${safeLine}':x=(w-text_w)/2:y=${yPos}:fontcolor=white:fontsize=${topFontSize}:borderw=4:bordercolor=black`);
                    }
                });

                // Render baris teks bawah
                const totalBottom = bottomLines.length;
                bottomLines.forEach((line, index) => {
                    const safeLine = cleanText(line);
                    if (safeLine) {
                        const yPos = `h-text_h-20-${(totalBottom - 1 - index) * bottomSpacing}`;
                        drawFilters.push(`drawtext=fontfile='${fontPath}':text='${safeLine}':x=(w-text_w)/2:y=${yPos}:fontcolor=white:fontsize=${bottomFontSize}:borderw=4:bordercolor=black`);
                    }
                });

                ffmpeg(tempIn)
                    .videoFilters(drawFilters)
                    .outputOptions('-vcodec', 'libwebp')
                    .toFormat('webp')
                    .save(tempOut)
                    .on('end', async () => {
                        await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) }, { quoted: msg });
                        if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                    })
                    .on('error', async (err) => {
                        console.error('FFmpeg error:', err);
                        await sock.sendMessage(from, { text: '❌ Gagal membuat stiker meme.' });
                        if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                    });

            } catch (e) {
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses gambar.' });
            }
        }

            if (body.startsWith('.brat ') || body.startsWith('!brat ')) {
                const text = body.replace(/^\.brat |^\!brat /, '').trim();
                if (!text) return await sock.sendMessage(from, { text: '❌ Masukkan teksnya! Contoh: *.brat Takamiya*' });

                await sock.sendMessage(from, { text: '⏳ Bikin stiker Brat Putih...' });

                try {
                    const bratUrl = `https://api.vreden.web.id/api/brat?text=${encodeURIComponent(text)}&background=white`;
                    let res;
                    try {
                        res = await axios.get(bratUrl, { responseType: 'arraybuffer' });
                    } catch {
                        res = await axios.get(`https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}&color=white`, { responseType: 'arraybuffer' });
                    }

                    const tempIn = `./brat_${Date.now()}.png`;
                    const tempOut = `./brat_${Date.now()}.webp`;
                    fs.writeFileSync(tempIn, res.data);

                    ffmpeg(tempIn)
                        .outputOptions(['-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512'])
                        .toFormat('webp')
                        .save(tempOut)
                        .on('end', async () => {
                            await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) });
                            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                        })
                        .on('error', async (err) => {
                            console.error(err);
                            await sock.sendMessage(from, { text: '❌ Gagal mengonversi stiker Brat.' });
                        });

                } catch (e) {
                    console.error(e);
                    await sock.sendMessage(from, { text: '❌ Gagal membuat stiker Brat. Coba lagi nanti.' });
                }
            }



            if (body.startsWith('.roast') || body.startsWith('!roast')) {
                if (!from.endsWith('@g.us')) {
                    return await sock.sendMessage(from, { text: '❌ Perintah *.roast* hanya dapat digunakan di dalam grup!' }, { quoted: msg });
                }

                let targetJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                                msg.message.extendedTextMessage?.contextInfo?.participant;

                if (!targetJid) {
                    return await sock.sendMessage(from, { text: '❌ Tag atau reply member yang mau di-roast! Contoh: *.roast @user*' });
                }

                const randomRoast = ROAST_LIST[Math.floor(Math.random() * ROAST_LIST.length)];
                const text = `🔥 *ROASTING TIME!*\n\nHei @${targetJid.split('@')[0]},\n"${randomRoast}"`;

                return await sock.sendMessage(from, { text: text, mentions: [targetJid] }, { quoted: msg });
            }

        // FITUR GRUP: CEK SIDER (.sider / !cek-sider)
        if ((body === '.sider' || body === '!sider' || body === '!cek-sider' || body === '.cek-sider') && isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                // Ambil cuma member yang SAAT INI resmi terdaftar di grup ini
                const currentParticipants = groupMetadata.participants.map(p => p.id);
                const now = Date.now();
                const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                const botNumber = sock.user.id.split(':')[0];

                let siderList = [];

                for (let jid of currentParticipants) {
                    // 1. Abaikan jika ini nomor bot sendiri
                    if (jid.includes(botNumber)) continue;

                    // 2. Cek aktivitas khusus untuk grup ini (from)
                    const lastActive = userActivity[from]?.[jid];

                    if (!lastActive || (now - lastActive > threeDaysMs)) {
                        siderList.push({
                            jid: jid,
                            lastActive: lastActive
                        });
                    }
                }

                if (siderList.length === 0) {
                    return await sock.sendMessage(from, { text: '🎉 Luar biasa! Semua anggota di grup ini aktif dan sering nimbrung.' }, { quoted: msg });
                }

                let text = `⚠️ *Member Tidak Aktif di Grup Ini*\n\n`;
                let mentions = [];

                siderList.forEach((item, index) => {
                    mentions.push(item.jid);
                    if (!item.lastActive) {
                        text += `${index + 1}. @${item.jid.split('@')[0]} (belum pernah chat sejak bot aktif)\n`;
                    } else {
                        const days = Math.floor((now - item.lastActive) / (1000 * 60 * 60 * 24));
                        text += `${index + 1}. @${item.jid.split('@')[0]} (tidak aktif ${days} hari)\n`;
                    }
                });

                text += `\n🚨 *Peringatan:* Buat nama-nama yang ke-tag di atas, tolong diramaikan lagi ya grupnya! Jangan cuma baca doang atau jadi pajangan. Yuk aktif lagi! 🔥`;

                return await sock.sendMessage(from, { text: text, mentions: mentions }, { quoted: msg });
            } catch (err) {
                console.error('Sider Error:', err);
                return await sock.sendMessage(from, { text: '❌ Gagal mengambil daftar sider.' }, { quoted: msg });
            }
        }

            if ((body === '.close' || body === '!close') && from.endsWith('@g.us')) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const senderNum = sender.split('@')[0].split(':')[0];
                    const participant = groupMetadata.participants.find(p => p.id.includes(senderNum));
                    const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

                    if (!isSenderAdmin) {
                        return await sock.sendMessage(from, { text: '❌ Perintah ini hanya bisa digunakan oleh Admin Grup!' }, { quoted: msg });
                    }

                    await sock.groupSettingUpdate(from, 'announcement');
                    return await sock.sendMessage(from, {
                        text: `🚪 *GRUP DITUTUP*\n\n🌙 *Status:* Ditutup\n⚙️ *Keterangan:* Hanya admin yang dapat mengirim pesan.`
                    });
                } catch (err) {
                    return await sock.sendMessage(from, {
                        text: '❌ Gagal menutup grup! Pastikan **Bot sudah diangkat jadi Admin Grup** terlebih dahulu.'
                    }, { quoted: msg });
                }
            }

            if ((body === '.open' || body === '!open') && from.endsWith('@g.us')) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const senderNum = sender.split('@')[0].split(':')[0];
                    const participant = groupMetadata.participants.find(p => p.id.includes(senderNum));
                    const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

                    if (!isSenderAdmin) {
                        return await sock.sendMessage(from, { text: '❌ Perintah ini hanya bisa digunakan oleh Admin Grup!' }, { quoted: msg });
                    }

                    await sock.groupSettingUpdate(from, 'not_announcement');
                    return await sock.sendMessage(from, {
                        text: `🔓 *GRUP DIBUKA*\n\n☀️ *Status:* Dibuka\n⚙️ *Keterangan:* Semua anggota sekarang dapat mengirim pesan.`
                    });
                } catch (err) {
                    return await sock.sendMessage(from, {
                        text: '❌ Gagal membuka grup! Pastikan **Bot sudah diangkat jadi Admin Grup** terlebih dahulu.'
                    }, { quoted: msg });
                }
            }

            if (body === '.poin' || body === '!poin' || body === '.me' || body === '!me') {
                const myPoint = (userPoints[from] && userPoints[from][sender]) ? userPoints[from][sender] : 0;
                return await sock.sendMessage(from, {
                    text: `👤 @${sender.split('@')[0]}\n⭐ Total Poin Kamu di Grup Ini: *${myPoint} Poin*`,
                    mentions: [sender]
                });
            }

            if (body === '.top' || body === '!top' || body === '.leaderboard' || body === '!leaderboard') {
                try {
                    const groupPts = userPoints[from] || {};
                    const sorted = Object.entries(groupPts)
                        .filter(([, pts]) => typeof pts === 'number' && pts > 0)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5);

                    if (sorted.length === 0) {
                        return await sock.sendMessage(from, {
                            text: '🏆 Belum ada yang memiliki poin di grup ini.\n\nYuk mainkan *.tebakkata* atau *.tebakangka* untuk mengumpulkan poin pertama!'
                        });
                    }

                    let text = `🏆 *KLASEMEN TOP 5 PEMAIN GRUP* 🏆\n\n`;
                    let mentions = [];
                    sorted.forEach(([jid, pts], i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎗️';
                        text += `${medal} ${i + 1}. @${jid.split('@')[0]} - *${pts} Poin*\n`;
                        mentions.push(jid);
                    });

                    return await sock.sendMessage(from, { text: text, mentions: mentions });
                } catch (err) {
                    console.error('Error pada .top:', err);
                    return await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memuat leaderboard.' });
                }
            }

            if (body.startsWith('.lagu ') || body.startsWith('!lagu ')) {
                const query = body.replace(/^\.lagu |^\!lagu /, '').trim();
                if (!query) return await sock.sendMessage(from, { text: '❌ Masukkan judul lagu! Contoh: *.lagu solo*' });

                await sock.sendMessage(from, { text: `🔍 Mencari lagu: *${query}*...` });

                try {
                    const search = await yts(query);
                    if (!search.videos.length) {
                        return sock.sendMessage(from, { text: 'Lagu tidak ditemukan.' });
                    }

                    const video = search.videos[0];
                    if (video.seconds > 600) {
                        return sock.sendMessage(from, { text: '❌ Lagunya kepanjangan (lebih dari 10 menit)! File kebesaran dan bakal ditolak.' });
                    }

                    await sock.sendMessage(from, { text: `🎵 Memproses: *${video.title}*\nDurasi: ${video.timestamp}` });

                    const tempAudio = `./music_${Date.now()}.mp3`;

                    exec(`yt-dlp --no-check-certificates --extractor-args "youtube:player_client=android" -x --audio-format mp3 -o "${tempAudio}" "${video.url}"`, async (error) => {
                        if (error) {
                            console.error(error);
                            return sock.sendMessage(from, { text: '❌ Gagal mengunduh audio (kemungkinan pembatasan usia/hak cipta).' });
                        }

                        if (fs.existsSync(tempAudio)) {
                            await sock.sendMessage(from, {
                                audio: fs.readFileSync(tempAudio),
                                mimetype: 'audio/mpeg',
                                fileName: `${video.title}.mp3`
                            });
                            fs.unlinkSync(tempAudio);
                        }
                    });
                } catch (e) {
                    console.error(e);
                    await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mencari lagu.' });
                }
            }

// =========================================================
// FITUR PLAY LENGKAP: PENCARIAN + HANDLER ANGKA (1-5)
// =========================================================

// 1. COMMAND PENCARIAN (.play <judul>)
if (body.startsWith('.play ') || body.startsWith('!play ')) {
    const query = body.replace(/^(\.play |!play )/i, '').trim();
    if (!query) return await sock.sendMessage(from, { text: '❌ Masukkan judul lagu!\nContoh: *.play ordinary life*' }, { quoted: msg });

    await sock.sendMessage(from, { text: `🔍 Mencari 5 daftar lagu pilihan: *${query}*...` }, { quoted: msg });

    try {
        const search = await yts(query);
        const videos = search.videos.slice(0, 5);

        if (videos.length === 0) {
            return await sock.sendMessage(from, { text: '❌ Lagu tidak ditemukan.' }, { quoted: msg });
        }

        let text = `🎵 *HASIL PENCARIAN LAGU* 🎵\n\n`;
        videos.forEach((v, index) => {
            text += `${index + 1}. *${v.title}*\n⏱️ Durasi: ${v.timestamp} | 👤 Channel: ${v.author.name}\n\n`;
        });
        text += `👉 *Balas/Reply pesan ini dengan angka (1 - 5)* untuk mengunduh lagu pilihanmu.`;

        const sentMsg = await sock.sendMessage(from, { text: text }, { quoted: msg });

        // Simpan sesi pencarian ke playSession berdasarkan ID pesan bot
        playSession[sentMsg.key.id] = {
            sender: sender,
            results: videos
        };

    } catch (e) {
        console.error('Play Search Error:', e);
        await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mencari lagu.' }, { quoted: msg });
    }
}
// =========================================================
// HANDLER BALASAN ANGKA PLAY (FIX LYRICS NOT DEFINED)
// =========================================================
const isQuoted = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage;
if (isQuoted && !isNaN(body)) {
    const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
    if (playSession[quotedId]) {
        const session = playSession[quotedId];
        if (session.sender === sender) {
            const choice = parseInt(body);
            if (choice >= 1 && choice <= session.results.length) {
                const selectedVideo = session.results[choice - 1];
                delete playSession[quotedId]; // Hapus session

                let cleanTitle = selectedVideo.title
                    .replace(/\[.*?\]|\(.*?\)/g, '')
                    .replace(/official video|music video|lyric video|lyrics|audio/gi, '')
                    .trim();
                let artistName = selectedVideo.author?.name ? selectedVideo.author.name.replace('VEVO', '').replace('- Topic', '').trim() : '';

                // === 1. DEKLARASI & PROSES CARI LIRIK GENIUS ===
                let lyrics = ''; // Deklarasi variabel agar tidak ReferenceError
                try {
                    const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(cleanTitle + ' ' + artistName)}`;
                    const { data: searchData } = await axios.get(searchUrl);
                    const song = searchData?.response?.sections?.find(s => s.type === 'song')?.hits?.[0]?.result;

                    if (song && song.url) {
                        const { data: pageHtml } = await axios.get(song.url);
                        const $= cheerio.load(pageHtml);$('div[data-lyrics-container="true"]').each((i, el) => {
                            lyrics += $(el).html().replace(/<br>/g, '\n').replace(/<[^>]*>?/gm, '') + '\n\n';
                        });
                        lyrics = lyrics.trim();
                    }
                } catch (err) {
                    console.error('Genius Scrape Error:', err.message);
                }

                let displayLyrics = lyrics ? `📜 *LIRIK LAGU*\n───────────────\n${lyrics}` : '_(Lirik tidak ditemukan di Genius)_';

                // === 2. FORMAT INFO (Tanpa lirik agar caption tidak kena limit WA) ===
                let infoText = `🎧 *${cleanTitle}* 🎧\n\n` +
                               `*INFO:*\n` +
                               `• *Artis:* ${artistName || 'Tidak Diketahui'}\n` +
                               `• *Durasi:* ${selectedVideo.timestamp || selectedVideo.duration}`;

                // === 3. KIRIM PESAN BERURUTAN (Thumbnail -> Lirik) ===
                if (selectedVideo.image || selectedVideo.thumbnail) {
                    await sock.sendMessage(from, { 
                        image: { url: selectedVideo.image || selectedVideo.thumbnail },
                        caption: infoText 
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: infoText }, { quoted: msg });
                }

                // Kirim pesan lirik secara terpisah agar tidak delay/error
                await sock.sendMessage(from, { text: displayLyrics });

                // === 4. DOWNLOAD & KIRIM AUDIO (YT-DLP) ===
                const tempAudio = `./music_${Date.now()}.mp3`;
                const { exec } = require('child_process');
                const fs = require('fs');

                exec(`yt-dlp --no-check-certificates --extractor-args "youtube:player_client=android" -x --audio-format mp3 -o "${tempAudio}" "${selectedVideo.url}"`, async (error) => {
                    if (error) {
                        console.error('Error YT-DLP:', error.message);
                        return sock.sendMessage(from, { text: '❌ Gagal mengunduh audio lagu.' }, { quoted: msg });
                    }
                    if (fs.existsSync(tempAudio)) {
                        await sock.sendMessage(from, { 
                            audio: fs.readFileSync(tempAudio), 
                            mimetype: 'audio/mpeg',
                            fileName: `${cleanTitle}.mp3`
                        }, { quoted: msg });
                        fs.unlinkSync(tempAudio);
                    }
                });
                return;
            } else {
                return await sock.sendMessage(from, { text: '❌ Nomor pilihan tidak valid! Ketik angka 1 - 5.' }, { quoted: msg });
            }
        }
    }
}

// =========================================================
// HANDLER DOWNLOAD FACEBOOK & INSTAGRAM (VIA YT-DLP)
// =========================================================
if (body.startsWith('.fb') || body.startsWith('.ig') || body.startsWith('.instagram') || body.startsWith('.facebook')) {
    const args = body.split(' ');
    const videoUrl = args[1];

    if (!videoUrl) {
        return await sock.sendMessage(from, { 
            text: '❌ *Link tidak ditemukan!*\n\nContoh penggunaan:\n• `.ig https://www.instagram.com/reel/xxx/` \n• `.fb https://www.facebook.com/watch?v=xxx`' 
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { text: '⏳ Sedang mengunduh video, tunggu sebentar...' }, { quoted: msg });

    const tempVideo = `./video_${Date.now()}.mp4`;
    const { exec } = require('child_process');
    const fs = require('fs');

    // Filter format agar resolusi maksimal 720p & ukuran file di bawah limit WhatsApp (50MB)
const dlCommand = `yt-dlp --no-check-certificates -f "b/best" -o "${tempVideo}" "${videoUrl}"`;

    exec(dlCommand, async (error) => {
        if (error) {
            console.error('Error Download FB/IG:', error.message);
            return await sock.sendMessage(from, { 
                text: '❌ *Gagal mengunduh video!*\nPastikan link valid, akun/postingan bersifat publik, dan bukan postingan privat.' 
            }, { quoted: msg });
        }

        if (fs.existsSync(tempVideo)) {
            await sock.sendMessage(from, { 
                video: fs.readFileSync(tempVideo), 
                caption: '✅ *Video berhasil diunduh!*',
                mimetype: 'video/mp4'
            }, { quoted: msg });

            // Hapus file temporary setelah terkirim
            fs.unlinkSync(tempVideo);
        }
    });
}

            if (body.startsWith('.tt ') || body.startsWith('!tt ')) {
                const url = body.replace(/^\.tt |^\!tt /, '').trim();
                await sock.sendMessage(from, { text: '⏳ Mengunduh video TikTok...' });

                try {
                    const tempVideo = `./tt_${Date.now()}.mp4`;
                    exec(`yt-dlp -o "${tempVideo}" "${url}"`, async (error) => {
                        if (error) {
                            console.error(error);
                            return sock.sendMessage(from, { text: '❌ Gagal mengunduh video TikTok.' });
                        }
                        if (fs.existsSync(tempVideo)) {
                            await sock.sendMessage(from, { video: fs.readFileSync(tempVideo), caption: '✨ Nih videonya!' });
                            fs.unlinkSync(tempVideo);
                        }
                    });
                } catch (e) {
                    console.error(e);
                    await sock.sendMessage(from, { text: '❌ Terjadi kesalahan.' });
                }
            }

            if ((body.startsWith('.hidetag ') || body.startsWith('!hidetag ')) && from.endsWith('@g.us')) {
                const pesan = body.replace(/^\.hidetag |^\!hidetag /, '');
                const groupMetadata = await sock.groupMetadata(from);
                const members = groupMetadata.participants.map(m => m.id);

                await sock.sendMessage(from, { text: pesan, mentions: members });
            }

        if (body === '.intip' || body === '!intip') {
            const isQuoted = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage;
            
            if (isQuoted) {
                const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                
                let innerMsg = quotedMsg.viewOnceMessageV2?.message || 
                               quotedMsg.viewOnceMessageV2Extension?.message || 
                               quotedMsg.viewOnceMessage?.message;
                
                if (!innerMsg && (quotedMsg.imageMessage?.viewOnce || quotedMsg.videoMessage?.viewOnce)) {
                    innerMsg = quotedMsg;
                }

                if (innerMsg) {
                    await sock.sendMessage(from, { text: '⏳ Membuka media rahasia...' });
                    
                    const messageType = innerMsg.imageMessage ? 'imageMessage' : (innerMsg.videoMessage ? 'videoMessage' : null);
                    
                    if (messageType) {
                        try {
                            const stream = await downloadContentFromMessage(innerMsg[messageType], messageType === 'imageMessage' ? 'image' : 'video');
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                            const caption = innerMsg[messageType].caption || '';
                            
                            if (messageType === 'imageMessage') {
                                await sock.sendMessage(from, { image: buffer, caption: `📸 *Terciduk!*\n${caption}` });
                            } else {
                                await sock.sendMessage(from, { video: buffer, caption: `🎥 *Terciduk!*\n${caption}` });
                            }
                        } catch (err) {
                            await sock.sendMessage(from, { text: '❌ Gagal mendownload media. Cache mungkin sudah dihapus.' });
                        }
                    } else {
                        await sock.sendMessage(from, { text: '❌ Format media tidak didukung (bukan foto/video).' });
                    }
                } else {
                    await sock.sendMessage(from, { text: '❌ Pesan ini tidak terdeteksi sebagai "Sekali Lihat" oleh sistem.' });
                }
            } else {
                await sock.sendMessage(from, { text: '❌ Reply pesan "Sekali Lihat" dengan perintah *.intip*' });
            }
        }

            if (body === '.tebakangka' || body === '!tebakangka') {
                if (gameSession[from]) return await sock.sendMessage(from, { text: '❌ Masih ada game yang berjalan di chat/grup ini!' });

                const targetNumber = Math.floor(Math.random() * 10) + 1;
                gameSession[from] = {
                    type: 'tebakangka',
                    answer: targetNumber.toString(),
                    attempts: 3
                };

                return await sock.sendMessage(from, {
                    text: '🎮 *GAME TEBAK ANGKA*\nAku sudah memilih angka dari *1 sampai 10*.\nKamu punya 3 kali kesempatan! Ketik angkamu langsung di chat.'
                });
            }

            if (body === '.tebakkata' || body === '!tebakkata' || body === '.susunkata' || body === '!susunkata') {
                if (gameSession[from]) return await sock.sendMessage(from, { text: '❌ Masih ada game yang berjalan di chat/grup ini!' });

                if (!global.quizQueue[from] || global.quizQueue[from].length === 0) {
                    global.quizQueue[from] = getShuffledQuestions();
                }

                const selected = global.quizQueue[from].shift();

                gameSession[from] = {
                    type: 'tebakkata',
                    answer: selected.answer
                };

		const sisa = global.quizQueue[from].length;
return await sock.sendMessage(from, {
    text: `❓ *KUIS TEBAK KATA*\n\nPertanyaan: *${selected.question}*\n\nKetik jawabanmu langsung di chat!\n_(Sisa antrean soal unik: ${sisa}/150)_`
});
            }

            if (gameSession[from]) {
                const currentGame = gameSession[from];
                const userAnswer = body.trim().toUpperCase();

        if (currentGame.type === 'tebakangka') {
            if (/^\d+$/.test(userAnswer)) {
                if (userAnswer === currentGame.answer) {
                    delete gameSession[from];
                    const totalPts = addPoint(from, sender, 10);

                    // --- TAMBAHAN XP & KOIN GLOBAL ---
                    if (!dbUsers[sender]) {
                        dbUsers[sender] = { xp: 0, level: 1, coin: 0, inventory: [], equippedItem: null };
                    }
                    dbUsers[sender].xp += 15;    // Tambah 15 XP
                    dbUsers[sender].coin += 100; // Tambah 100 Koin
                    saveUsers();

                    return await sock.sendMessage(from, {
                        text: `🎉 *TEPAT BANGET!* @${sender.split('@')[0]} Jawabannya memang *${userAnswer}*!\n✨ Kamu mendapatkan *+10 Poin* (Total di grup ini: ${totalPts} Poin)\n🎁 Kamu juga mendapatkan *+100 Koin*!`,
                        mentions: [sender]
                    });
                } else {
                    // ... (biarkan bagian else di bawahnya tetap sama)
                            currentGame.attempts -= 1;
                            if (currentGame.attempts <= 0) {
                                const correct = currentGame.answer;
                                delete gameSession[from];
                                return await sock.sendMessage(from, { text: `💥 *GAME OVER!* Kesempatan habis. Jawabannya adalah *${correct}*.` });
                            } else {
                                return await sock.sendMessage(from, { text: `❌ Salah! Sisa kesempatan: ${currentGame.attempts} kali lagi.` });
                            }
                        }
                    }
                }

        if (currentGame.type === 'tebakkata') {
            if (userAnswer === currentGame.answer) {
                delete gameSession[from];
                const totalPts = addPoint(from, sender, 10);

                // --- TAMBAHAN XP & KOIN GLOBAL ---
                if (!dbUsers[sender]) {
                    dbUsers[sender] = { xp: 0, level: 1, coin: 0, inventory: [], equippedItem: null };
                }
                dbUsers[sender].xp += 15;    // Tambah 15 XP
                dbUsers[sender].coin += 100; // Tambah 100 Koin
                saveUsers();

                return await sock.sendMessage(from, {
                    text: `🎉 *BENAR!* @${sender.split('@')[0]} Jawabannya adalah *${userAnswer}*!\n✨ Kamu mendapatkan *+10 Poin* (Total di grup ini: ${totalPts} Poin)\n🎁 Kamu juga mendapatkan *+100 Koin*!`,
                    mentions: [sender]
                });
            }
        }
    }


            if ((body === '.nyerah' || body === '!nyerah') && gameSession[from]) {
                const ans = gameSession[from].answer;
                delete gameSession[from];
                return await sock.sendMessage(from, { text: `🏳️ Kamu menyerah! Jawabannya adalah: *${ans}*` });
            }

        } catch (err) {
            console.error('Error Upsert:', err);
        }
    });
}

startBot();
