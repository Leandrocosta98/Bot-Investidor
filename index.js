require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcrypt'); // Essencial para as senhas

const app = express();

// --- CONFIGURAÇÕES ---
app.use(express.json()); // Para aceitar JSON no corpo das requisições
app.use(express.urlencoded({ extended: true }));
 

app.use(session({
    name: 'sessao_bot', // Nome personalizado para o cookie
    secret: 'Previdencia-Garantida-2024',
    resave: true, // Força a gravar a sessão mesmo sem modificação
    saveUninitialized: true, // Força a criar uma sessão nova
    cookie: { 
        secure: false, // Obrigatório como false para localhost (sem HTTPS)
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

app.use(express.static('public')); // Serve os arquivos da pasta public (HTML, CSS, JS)

// --- FUNÇÕES AUXILIARES ---
async function openDb() {
    return open({
        filename: './database.db',
        driver: sqlite3.Database
    });
}

// Middleware para proteger as rotas
function verificarLogin(req, res, next) {
    if (req.session.usuarioId) {
        return next();
    }
    res.redirect('/login');
}

// --- ROTAS DE NAVEGAÇÃO ---
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/cadastro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro.html')));
app.get('/', verificarLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- API DE AUTENTICAÇÃO ---

// Rota de Cadastro
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

// Rota de Login
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


// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- API DE DADOS (DASHBOARD) ---

// Rota para o nome do usuário
app.get('/api/dados-usuario', (req, res) => {
    if (req.session && req.session.usuarioNome) {
        res.json({ nome: req.session.usuarioNome });
    } else {
        res.status(401).json({ erro: "Não logado" });
    }
});

// Rota para a lista de dados
app.get('/api/dados', async (req, res) => {
    try {
        const db = await openDb();
        const acoes = await db.all(`SELECT * FROM watchlist ORDER BY id DESC`);
        res.json(acoes); // Garante que SEMPRE envia um JSON, mesmo que seja []
    } catch (error) {
        console.error("Erro na rota /api/dados:", error);
        res.status(500).json({ erro: "Erro no banco de dados" });
    }
});
app.get('/api/historico/:ticker', verificarLogin, async (req, res) => {
    const { ticker } = req.params;
    try {
        const url = `https://brapi.dev/api/quote/${ticker}?range=7d&interval=1d&token=${process.env.BRAPI_TOKEN}`;
        const resposta = await axios.get(url);
        res.json(resposta.data);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar histórico." });
    }
});

app.delete('/api/deletar/:id', async (req, res) => {
    try {
        const db = await openDb();
        await db.run(`DELETE FROM watchlist WHERE id = ?`, [req.params.id]);
        res.json({ mensagem: "Removido!" });
    } catch (error) {
        res.status(500).json({ erro: "Erro ao deletar." });
    }
});

// --- BOT TELEGRAM E BANCO ---
const TOKEN = process.env.TELEGRAM_TOKEN;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

async function iniciarApp() {
    const db = await openDb();

    // Criando Tabelas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            email TEXT UNIQUE,
            senha TEXT
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

    console.log("✅ Banco e Tabelas prontos!");

    // Comando /monitorar detalhado
    bot.onText(/\/monitorar (.+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const ticker = match[1].toUpperCase();
        const quedaAlvo = parseFloat(match[2]);

        bot.sendMessage(chatId, `🔍 Buscando preço atual de ${ticker}...`);

        try {
            const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;
            const res = await axios.get(url);
            const precoBase = res.data.results[0].regularMarketPrice;
            const precoAlvo = precoBase * (1 - (quedaAlvo / 100));

            await db.run(
            `INSERT INTO watchlist (chatId, ticker, precoBase, limiteQueda) VALUES (?, ?, ?, ?)`,
            [chatId, ticker, precoBase, quedaAlvo / 100]
            );

            bot.sendMessage(chatId, `✅ Monitorando ${ticker}!\n💰 Preço base: R$ ${precoBase.toFixed(2)}\n📉 Alerta em: R$ ${precoAlvo.toFixed(2)} (-${quedaAlvo}%)`);

        } 
        catch (error) {
            bot.sendMessage(chatId, `❌ Erro: Não encontrei a ação ${ticker}.`);
        }
    });

    // Comando /lista detalhado
    bot.onText(/\/lista/, async (msg) => {
        const chatId = msg.chat.id;
        const acoes = await db.all(`SELECT * FROM watchlist WHERE chatId = ?`, [chatId]);

        if (acoes.length === 0) {
            bot.sendMessage(chatId, "📋 Sua lista de monitoramento está vazia.");
            return;
        }

        let resposta = "📋 *Ações em Vigilância:*\n\n";
        acoes.forEach((acao) => {
            const precoAlvo = acao.precoBase * (1 - acao.limiteQueda);
            resposta += `📈 *${acao.ticker}*\n`;
            resposta += `💰 Base: R$ ${acao.precoBase.toFixed(2)}\n`;
            resposta += `🚨 Alerta: R$ ${precoAlvo.toFixed(2)}\n\n`;
        });

     bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
    });

    // Verificação periódica
    setInterval(async () => {
        const acoes = await db.all(`SELECT * FROM watchlist`);
        for (const acao of acoes) {
            try {
                const url = `https://brapi.dev/api/quote/${acao.ticker}?token=${BRAPI_TOKEN}`;
                const res = await axios.get(url);
                const precoAtual = res.data.results[0].regularMarketPrice;
                const alvo = acao.precoBase * (1 - acao.limiteQueda);

                if (precoAtual <= alvo) {
                    bot.sendMessage(acao.chatId, `🚨 OPORTUNIDADE: ${acao.ticker} baixou para R$ ${precoAtual}`);
                    await db.run(`DELETE FROM watchlist WHERE id = ?`, [acao.id]);
                }
            } catch (e) { console.log("Erro rotina:", e.message); }
        }
    }, 300000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));

iniciarApp().catch(err => console.error(err));