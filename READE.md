# 🤖 Bot Investidor - Monitoramento de Ativos B3

Sistema inteligente de monitoramento de ativos financeiros via Telegram, focado em alertas de oportunidade (Preço Alvo) com arquitetura escalável.

## 🚀 Diferenciais Técnicos (Nível Sênior)
Este projeto não é apenas um bot; ele foi construído seguindo boas práticas de engenharia de software:
- **Arquitetura Layered (Camadas):** Separação clara entre Lógica de Negócio (`Services`), Acesso a Dados (`Repositories`) e Interface (`Bot Controllers`).
- **Testes Unitários:** Implementação de suíte de testes com **Jest** para garantir a integridade dos cálculos financeiros.
- **Segurança:** Isolamento de lógica sensível fora da camada pública e uso de variáveis de ambiente (`.env`).
- **Resiliência:** Tratamento de erros e logs para falhas de API e banco de dados.

## 🛠️ Tecnologias Utilizadas
- **Node.js** (Runtime)
- **Node-Telegram-Bot-API** (Interface)
- **SQLite** (Persistência de dados)
- **Jest** (Testes Automatizados)
- **Axios** (Consumo da API BRAPI)

## 📋 Como Funciona
1. O usuário vincula sua conta via e-mail.
2. O bot consome cotações em tempo real da B3.
3. O usuário define uma **% de queda alvo**.
4. O sistema calcula o preço alvo e armazena no banco de dados para monitoramento contínuo.

## 🔧 Como Executar
1. Clone o repositório.
2. Instale as dependências: `npm install`.
3. Configure o `.env` com seu `TELEGRAM_TOKEN` e `BRAPI_TOKEN`.
4. Execute os testes: `npm test`.
5. Inicie o bot: `node index.js`.

---
Desenvolvido por **Leandro** - Focado em Backend & Engenharia de Dados.