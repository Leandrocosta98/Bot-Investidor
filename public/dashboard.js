// 1. Variáveis globais
let chartInstancia = null;
let periodoAtual = '7d'; // Padrão inicial
window.tickerAtivo = ''; // Para saber qual gráfico atualizar ao mudar o período

document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando Dashboard...");
    // Carrega os dados da tabela e cards
    carregarDados();

    // Busca o nome do usuário para o Boas-vindas
    fetch('/api/dados-usuario')
        .then(res => {
            if (!res.ok) throw new Error("Não logado");
            return res.json();
        })
        .then(data => {
            if (data.nome) {
                const el = document.getElementById('bem-vindo');
                if (el) el.innerText = `Olá, ${data.nome}! 👋`;
            }
        })
        .catch(err => {
            console.warn("Sessão não encontrada, redirecionando...");
            window.location.href = "/login";
        });
});

// --- FUNÇÕES DE LÓGICA ---

// Função chamada pelos botões do Menu (7d, 30d, 1y)
async function mudarPeriodo(range) {
    periodoAtual = range;
    console.log("Mudando período para:", range);
    
    // Se já tiver um ticker selecionado, atualiza o gráfico dele
    if (window.tickerAtivo) {
        carregarGrafico(window.tickerAtivo);
    }else {
        carregarDados()
    }
}

async function carregarGrafico(ticker) {
    window.tickerAtivo = ticker; // Salva o ticker atual
    console.log(`Buscando histórico de ${ticker} no período ${periodoAtual}`);
    
    const tituloGrafico = document.getElementById('titulo-grafico');
    if (tituloGrafico) tituloGrafico.innerText = `Histórico: ${ticker} (${periodoAtual})`;

    try {
        // Envia o período (range) para a API
        const res = await fetch(`/api/historico/${ticker}?range=${periodoAtual}`);
        const data = await res.json();
            
        if (!data.results || !data.results[0].historicalDataPrice) {
            console.error("Dados históricos não encontrados.");
            return;
        }

        const historico = data.results[0].historicalDataPrice;
        
        // Formata as datas: se for 1 dia mostra horas, se for mais mostra DD/MM
        const labels = historico.map(d => {
            const dataObj = new Date(d.date * 1000);
            return periodoAtual === '1d' 
                ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });

        const precos = historico.map(d => d.close);
        const ctx = document.getElementById('meuGrafico').getContext('2d');
            
        if (chartInstancia) { 
            chartInstancia.destroy(); 
        }

        chartInstancia = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Preço - ${ticker}`,
                    data: precos,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: false } }
            }
        });
    } catch (e) {
        console.error("Erro ao carregar gráfico:", e);
    }
}

async function carregarDados() {
    const tbody = document.getElementById('corpo-tabela');
    try {
        const resposta = await fetch('/api/dados');
        const dados = await resposta.json();

        // Atualiza Cards
        const totalAtivosEl = document.getElementById('total-ativos');
        const maiorQuedaEl = document.getElementById('maior-queda');
        const maiorAltaEl = document.getElementById('maior-alta');

        if (totalAtivosEl) totalAtivosEl.innerText = dados.length;

        if (dados.length > 0) {
            const acaoMaiorQueda = dados.reduce((prev, curr) => (prev.limiteQueda > curr.limiteQueda) ? prev : curr);
            if (maiorQuedaEl) {
                maiorQuedaEl.innerText = `${acaoMaiorQueda.ticker} (${(acaoMaiorQueda.limiteQueda * 100).toFixed(0)}%)`;
            }
            if (maiorAltaEl) maiorAltaEl.innerText = dados[0].ticker;
        }

        // Preenche Tabela
        if (!tbody) return;
        tbody.innerHTML = ""; 

        if (dados.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Nenhum ativo monitorado.</td></tr>";
            return;
        }

        dados.forEach(acao => {
            const precoAlvo = acao.precoBase * (1 - acao.limiteQueda);
            const row = `
                <tr>
                    <td>
                        <strong onclick="carregarGrafico('${acao.ticker}')" style="cursor:pointer; color:#3498db; text-decoration: underline;">
                            ${acao.ticker}
                        </strong>
                    </td>
                    <td>R$ ${acao.precoBase.toFixed(2)}</td>
                    <td>R$ ${precoAlvo.toFixed(2)} (${(acao.limiteQueda * 100).toFixed(0)}%)</td>
                    <td><button onclick="deletarAtivo(${acao.id})">🗑️</button></td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

        // Carrega o primeiro gráfico da lista automaticamente
        if (dados.length > 0 && !window.tickerAtivo) {
            carregarGrafico(dados[0].ticker);
        }
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
    }
}

async function deletarAtivo(id) {
    if (confirm("Deseja remover este ativo?")) {
        const res = await fetch(`/api/deletar/${id}`, { method: 'DELETE' });
        if (res.ok) carregarDados();
    }
}