require('dotenv').config();

const session = require('express-session');
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

app.use(express.urlencoded({ extended: true}));
app.use(session({
    secret: 'Previdencia-Garantida',
    resave: false,
    saveUninitialized: true
}));

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === 'admin' && senha === '1234') {
        req.session.logado = true;
        res.redirect('/'); 
    } else {
        res.send('<h1>❌ Acesso Negado!</h1><a href="/login.html">Tentar novamente</a>');
    }
});

function verificarLogin(req, res, next) {
    if (req.session.logado) {
        return next();
    } else {
        res.redirect('/login.html');
    }
};

app.get('/', verificarLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.use(express.static('public'));

const TOKEN = process.env.TELEGRAM_TOKEN;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;
console.log("Meu token carregado é:",BRAPI_TOKEN);

const bot = new TelegramBot(TOKEN, { polling: true });

async function iniciarApp() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId TEXT,
            ticker TEXT,
            precoBase REAL,
            limiteQueda REAL
        )
    `);

    console.log("✅ Banco de dados Pronto!");
    console.log("🚀 Seu parceiro de investimento foi iniciado!");

    
    bot.onText(/\/monitorar (.+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const ticker = match[1].toUpperCase();
        const quedaAlvo = parseFloat(match[2]);

        bot.sendMessage(chatId, `🔍 Buscando preço atual de ${ticker}...`);

        try {
            const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;
            const res = await axios.get(url);
            const precoBase = res.data.results[0].regularMarketPrice;

            await db.run(
                `INSERT INTO watchlist (chatId, ticker, precoBase, limiteQueda) VALUES (?, ?, ?, ?)`,
                [chatId, ticker, precoBase, quedaAlvo / 100]
            );

            bot.sendMessage(chatId, `✅ Monitorando ${ticker}!\n💰 Preço base: R$ ${precoBase}\n📉 Alerta em: -${quedaAlvo}%`);

        } catch (error) {
            console.log("Erro na API:", error.message);
            bot.sendMessage(chatId, `❌ Erro: Não encontrei a ação ${ticker}.`);
        }
    });

    
    bot.onText(/\/lista/, async (msg) => {
        const chatId = msg.chat.id;
        const acoes = await db.all(`SELECT * FROM watchlist WHERE chatId = ?`, [chatId]);

        if (acoes.length === 0) {
            bot.sendMessage(chatId, "📋 Sua lista no banco de dados está vazia.");
            return;
        }

        let resposta = "📋 *Ações sendo vigiadas pelo banco:*\n\n";
        acoes.forEach((acao, index) => {
            resposta += `${index + 1}. 📈 *${acao.ticker}*\n`;
            resposta += `💰 Preço Base: R$ ${acao.precoBase}\n`;

            const precoAlvo = acao.precoBase * (1 - acao.limiteQueda)

            resposta +=`✅ Alerta se cair para: R$ ${precoAlvo.toFixed(2)}\n\n`;
            
        });

        bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
    });

    
    bot.onText(/\/limpar/, async (msg) => {
        await db.run(`DELETE FROM watchlist WHERE chatId = ?`, [msg.chat.id]);
        bot.sendMessage(msg.chat.id, "🧹 Lista limpa no banco de dados com sucesso!");
    });

    
    async function verificarWatchlist() {
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Checando preços no banco...`);
        const acoes = await db.all(`SELECT * FROM watchlist`);

        for (const acao of acoes) {
            try {
                
                const url = `https://brapi.dev/api/quote/${acao.ticker}?token=${BRAPI_TOKEN}`;
                const res = await axios.get(url);
                const precoAtual = res.data.results[0].regularMarketPrice;

                const quedaReal = (acao.precoBase - precoAtual) / acao.precoBase;
                const alvo = acao.precoBase * (1 - acao.limiteQueda);

               if (precoAtual <= alvo) {
                const mensagem = `🚨 *ALERTA DE OPORTUNIDADE*: *${acao.ticker}*\n\nO preço caiu para *R$ ${precoAtual}*!\nLimite definido: R$ ${alvo.toFixed(2)}`;
                
                await bot.sendMessage(acao.chatId, mensagem, { parse_mode: 'Markdown' });
                
                await db.run(`DELETE FROM watchlist WHERE id = ?`, [acao.id]);
                console.log(`✅ Alerta enviado para ${acao.ticker}`);
            }
            } catch (e) {
                console.log(`❌ Erro ao checar ${acao.ticker}: ${e.message}`);
            }
        }
    }

    setInterval(verificarWatchlist, 300000);
};

app.get('/api/dados', verificarLogin, async (req, res) => {
    try {
        const db = await open({ filename: './database.db', driver: sqlite3.Database });
        const acoes = await db.all(`SELECT * FROM watchlist`);
        res.json(acoes);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao acessar o banco de dados" });
    }
});

async function deletarAtivo(id) {
    if (confirm("Deseja realmente parar de monitorar este ativo?")) {
        const resposta = await fetch (`/api/deletar${id}`, { method: 'DELETE'});
        if (resposta.ok) {
            carregarDados(); //Atualizar a tabela na hora!
        } else {
            alert("Erro ao deletar.");
        }
    }
}

const PORT = process.env.PORT || 3000;
app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;

    if (usuario === 'admin' && senha === '1234') {
        req.session.logado = true;
        res.redirect('/'); 
    } else {
        res.send('<h1>❌ Acesso Negado!</h1><a href="/login.html">Tentar novamente</a>');
    }
});

app.get('/api/dados', verificarLogin, async (req, res) => {
    const db = await open({ filename: './database.db', driver: sqlite3.Database });
    const acoes = await db.all(`SELECT * FROM watchlist`);
    res.json(acoes);
});

app.get('/api/historico/:ticker', verificarLogin, async (req, res) => {
    const { ticker } = req.params;
    try {
        // Usamos o seu token que já está salvo nas variáveis de ambiente do Render
        const url = `https://brapi.dev/api/quote/${ticker}?range=7d&interval=1d&token=${process.env.BRAPI_TOKEN}`;
        const resposta = await fetch(url);
        const dados = await resposta.json();
        res.json(dados);
    } catch (error) {
        console.error("Erro na BRAPI:", error);
        res.status(500).json({ erro: "Erro ao buscar histórico" });
    }
});

app.delete('/api/deletar/:id', verificarLogin, async (req, res) => {
    const { id } = req.params;
    try {
        const db = await open({ filename: './database.db', driver: sqlite3.Database });
        await db.run(`DELETE FROM watchlist WHERE id = ?`, [id]);
        res.json({ mensagem: "Ativo removido com sucesso!" });
    } catch (error) {
        res.status(500).json({ erro: "Erro ao deletar ativo" });
    }
});

let chartInstancia = null; // Para podermos destruir e recriar o gráfico

async function carregarGrafico(ticker) {
    console.logf("Iniciando Carregamento do gráfico para: "), ticker;
    try {
        // MUDANÇA AQUI: Chamamos a nossa rota interna /api/historico/
        const res = await fetch(`/api/historico/${ticker}`);
        const data = await res.json();
        
        // Verificação de segurança caso a API não retorne dados
        if (!data.results || !data.results[0].historicalDataPrice) {
            console.error("Dados históricos não encontrados para:", ticker);
            return;
        }

        const historico = data.results[0].historicalDataPrice;
        
        // Formata as datas para ficarem bonitas no gráfico (ex: 15/05)
        const labels = historico.map(d => {
            const dataObj = new Date(d.date * 1000);
            return dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        
        const precos = historico.map(d => d.close);

        const ctx = document.getElementById('meuGrafico').getContext('2d');
        
        // Se já existe um gráfico, a gente apaga para criar o novo (evita sobreposição)
        if (typeof chartInstancia !== 'undefined' && chartInstancia !== null) { 
            chartInstancia.destroy(); 
        }

        // Criando o gráfico usando Chart.js
        chartInstancia = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Preço de Fechamento - ${ticker}`,
                    data: precos,
                    borderColor: '#2ecc71', // Verde suave
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: true,
                    tension: 0.4 // Deixa a linha curvada e elegante
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    y: { beginAtZero: false } // Gráfico de ações não deve começar no zero
                }
            }
        });
    } catch (e) {
        console.error("Erro ao carregar gráfico:", e);
    }
}

app.listen(PORT,() => {
    console.log(`Site rodando na porta ${PORT}`);
});



iniciarApp().catch(err => console.error("Erro ao iniciar bot:", err));