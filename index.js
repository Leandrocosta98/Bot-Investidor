require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcrypt');

const app = express();

// --- CONFIGURAÇÕES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: 'sessao_bot',
    secret: 'Previdencia-Garantida-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

app.use(express.static('public'));

// --- BANCO DE DADOS ---
async function openDb() {
    return open({
        filename: './database.db',
        driver: sqlite3.Database
    });
}

// Middleware de Proteção
function verificarLogin(req, res, next) {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    // Se for uma requisição de API, envia erro 401. Se for navegação, redireciona.
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ erro: "Não autorizado" });
    }
    res.redirect('/login');
}

// --- ROTAS DE NAVEGAÇÃO ---
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/cadastro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro.html')));
app.get('/', verificarLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- API DE AUTENTICAÇÃO ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    try {
        const db = await openDb();
        const senhaCripto = await bcrypt.hash(senha, 10);
        await db.run('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, senhaCripto]);
        res.status(201).json({ mensagem: "Usuário criado com sucesso!" });
    } catch (error) {
        res.status(500).json({ erro: "E-mail já cadastrado ou erro no banco." });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const db = await openDb();
        const usuario = await db.get('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (usuario && await bcrypt.compare(senha, usuario.senha)) {
            req.session.usuarioId = usuario.id;
            req.session.usuarioNome = usuario.nome;
            return res.json({ mensagem: "Login realizado!", nome: usuario.nome });
        }
        res.status(401).json({ erro: "E-mail ou senha incorretos." });
    } catch (error) {
        res.status(500).json({ erro: "Erro interno no servidor." });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- API DE DADOS (DASHBOARD) ---

app.get('/api/dados-usuario', (req, res) => {
    if (req.session.usuarioNome) {
        res.json({ nome: req.session.usuarioNome });
    } else {
        res.status(401).json({ erro: "Não logado" });
    }
});

// LISTAR APENAS OS ATIVOS DO USUÁRIO LOGADO
app.get('/api/dados', verificarLogin, async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.session.usuarioId;
        // Filtro essencial para privacidade entre usuários
        const acoes = await db.all(`SELECT * FROM watchlist WHERE usuario_id = ? ORDER BY id DESC`, [userId]);
        res.json(acoes);
    } catch (error) {
        res.status(500).json({ erro: "Erro no banco de dados" });
    }
});

// DELETAR APENAS SE FOR DONO DO ATIVO
app.delete('/api/deletar/:id', verificarLogin, async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.session.usuarioId;
        await db.run(`DELETE FROM watchlist WHERE id = ? AND usuario_id = ?`, [req.params.id, userId]);
        res.json({ mensagem: "Removido!" });
    } catch (error) {
        res.status(500).json({ erro: "Erro ao deletar." });
    }
});

app.get('/api/historico/:ticker', verificarLogin, async (req, res) => {
    const { ticker } = req.params;
    const range = req.query.range || '7d';
    try {
        const url = `https://brapi.dev/api/quote/${ticker}?range=${range}&token=${process.env.BRAPI_TOKEN}`;
        const resposta = await axios.get(url);
        res.json(resposta.data);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar histórico." });
    }
});

// --- BOT TELEGRAM E INICIALIZAÇÃO ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function iniciarApp() {
    const db = await openDb();

    // 1. Criar Tabelas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            email TEXT UNIQUE,
            senha TEXT,
            telegram_chat_id TEXT
        );
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId TEXT,
            ticker TEXT,
            precoBase REAL,
            limiteQueda REAL,
            usuario_id INTEGER,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );
    `);

    // 2. Garante que a coluna de vínculo existe
    try {
        await db.run("ALTER TABLE usuarios ADD COLUMN telegram_chat_id TEXT");
    } catch (e) {}

    console.log("✅ Banco de dados pronto!");

    // --- COMANDOS DO BOT ---

    // CONHECENDO O BOT
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const boasVindas = `👋 *Bem-vindo ao Bot de Monitoramento!*\n\n` +
            `Eu te ajudo a vigiar o mercado financeiro e te aviso quando uma ação cair até o teu preço alvo.\n\n` +
            `🚀 *Guia Rápido:* \n\n` +
            `1️⃣ **Criar sua conta:**\n` +
            `Primeiro, entre no site e faça o seu cadastro: https://bot-investidor.onrender.com \n\n` +
            `2️⃣**Vincular a tua conta:**\n` +
            `Usa o e-mail que usaste no site:\n` +
            `\`digite o comando /vincular + teu@email.com\`\n\n` +
            `3️⃣ **Começa a monitorar:**\n` +
            `Define o ticker e a % de queda:\n` +
            `\`EX: digite o comando/monitorar, junto com o codigo da ação em letras minusculas ex: petr5 depois digite quantos % o bot vai te avisar por ex: 5\`\n\n` +
            `\`Veja um ex completo: /monitorar petr5 5\`\n\n`+
            `3️⃣ **Vê a tua lista:**\n` +
            `Confere o que estou a vigiar:\n` +
            `\`/lista\`\n\n` +
            `💡 Precisas de mais detalhes? Digita \`/ajuda\``;

        bot.sendMessage(chatId, boasVindas, { parse_mode: 'Markdown' });
    });

    // COMANDO DE AJUDA
    bot.onText(/\/ajuda/, (msg) => {
        const chatId = msg.chat.id;
        const ajuda = `📖 *Manual de Comandos*\n\n` +
            `🔹 \`/vincular [email]\` \nConecta o Telegram à tua conta na plataforma web.\n\n` +
            `🔹 \`/monitorar [ticker] [queda]\` \nEx: \`/monitorar VALE3 3.5\`. O bot busca o preço atual e calcula o alerta.\n\n` +
            `🔹 \`/lista\` \nMostra todos os teus ativos monitorados e os preços alvo.\n\n` +
            `🔹 \`/limpar\` \nRemove todos os ativos da tua lista de monitorização.\n\n` +
            `⚠️ *Importante:* Os alertas são verificados a cada 5 minutos.`;

        bot.sendMessage(chatId, ajuda, { parse_mode: 'Markdown' });
    });

    // 1. MONITORAR (Individual e Tagarela)
    const {calcularPrecoAlvo} = require('./src/services/financeService');
    const {adicionarAtivo} = require('./src/repositories/watchlistRepository');

    bot.onText(/\/monitorar (.+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const ticker = match[1].toUpperCase();
        const quedaAlvo = parseFloat(match[2]);

        try {
            const db = await openDb();
            const usuario = await db.get("SELECT id, nome FROM usuarios WHERE telegram_chat_id = ?", [chatId]);

            if (!usuario) {
                return bot.sendMessage(chatId, `⚠️ *Atenção!*\n\nSeu Telegram não está vinculado.\n👉 Digite: \`/vincular seu@email.com\``, { parse_mode: 'Markdown' });
            }

            bot.sendMessage(chatId, `🔍 *Buscando cotação de ${ticker}...*`, { parse_mode: 'Markdown' });

            const url = `https://brapi.dev/api/quote/${ticker}?token=${process.env.BRAPI_TOKEN}`;
            const res = await axios.get(url);
            
            if (!res.data.results || res.data.results.length === 0) {
                return bot.sendMessage(chatId, `Ativo ${ticker} não encontrado.`);
            }

            const precoBase = res.data.results[0].regularMarketPrice;
            const precoAlvo = calcularPrecoAlvo(precoBase,quedaAlvo);

            await adicionarAtivo(db, {chatId, ticker, precoBase, quedaAlvo, usuarioId: usuario.id});

            bot.sendMessage(chatId, `✅ *Monitoramento Ativado para ${usuario.nome}!*\n\n📈 *Ativo:* ${ticker}\n💰 *Preço Atual:* R$ ${precoBase.toFixed(2)}\n🚨 *Alerta em:* R$ ${precoAlvo.toFixed(2)} (-${quedaAlvo}%)\n\n_Vou te avisar assim que cair!_ 🚀`, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("DEBUG ERROR:", error);
            bot.sendMessage(chatId, `❌ *Erro:* Não encontrei a ação *${ticker}*.`);
        }
    });

    // 2. LISTA
    bot.onText(/\/lista/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const db = await openDb();
            const usuario = await db.get("SELECT id, nome FROM usuarios WHERE telegram_chat_id = ?", [chatId]);

            if (!usuario) return bot.sendMessage(chatId, "⚠️ Vincule sua conta primeiro!");

            const acoes = await db.all(`SELECT * FROM watchlist WHERE usuario_id = ?`, [usuario.id]);

            if (acoes.length === 0) return bot.sendMessage(chatId, `📋 *${usuario.nome}*, sua lista está vazia.`, { parse_mode: 'Markdown' });

            let resposta = `📋 *Carteira de: ${usuario.nome}*\n━━━━━━━━━━━━━━━\n\n`;
            acoes.forEach(acao => {
                const alvo = acao.precoBase * (1 - acao.limiteQueda);
                resposta += `📈 *${acao.ticker}*\n💰 Base: R$ ${acao.precoBase.toFixed(2)}\n🚨 Alerta: R$ ${alvo.toFixed(2)}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
            });
            bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
        } catch (e) { bot.sendMessage(chatId, "❌ Erro ao carregar lista."); }
    });

    // 3. VINCULAR
    bot.onText(/\/vincular (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const email = match[1].toLowerCase().trim();
        try {
            const db = await openDb();
            const usuario = await db.get("SELECT id, nome FROM usuarios WHERE email = ?", [email]);
            if (usuario) {
                await db.run("UPDATE usuarios SET telegram_chat_id = ? WHERE id = ?", [chatId, usuario.id]);
                bot.sendMessage(chatId, `✅ *Conta Vinculada!* Olá *${usuario.nome}*!`, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, "❌ E-mail não encontrado no site.");
            }
        } catch (e) { bot.sendMessage(chatId, "❌ Erro ao vincular."); }
    });

    // 4. LIMPAR
    bot.onText(/\/limpar/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            await db.run(`DELETE FROM watchlist WHERE chatId = ?`, [chatId]);
            bot.sendMessage(chatId, "🗑️ *Lista limpa com sucesso!*", { parse_mode: 'Markdown' });
        } catch (e) { bot.sendMessage(chatId, "❌ Erro ao limpar."); }
    });

    // Verificação periódica de preços
    setInterval(async () => {
        const acoes = await db.all(`SELECT * FROM watchlist`);
        for (const acao of acoes) {
            try {
                const url = `https://brapi.dev/api/quote/${acao.ticker}?token=${process.env.BRAPI_TOKEN}`;
                const res = await axios.get(url);
                const precoAtual = res.data.results[0].regularMarketPrice;
                const alvo = acao.precoBase * (1 - acao.limiteQueda);

                if (precoAtual <= alvo && acao.chatId) {
                    bot.sendMessage(acao.chatId, `🚨 *OPORTUNIDADE:* ${acao.ticker} caiu para R$ ${precoAtual}!`, { parse_mode: 'Markdown' });
                    await db.run(`DELETE FROM watchlist WHERE id = ?`, [acao.id]);
                }
            } catch (e) { console.log("Erro rotina:", e.message); }
        }
    }, 300000); 
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));

iniciarApp().catch(err => console.error("Falha ao iniciar:", err));