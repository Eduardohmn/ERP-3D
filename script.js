// --- UTILITÁRIOS ---
const fmtDinheiro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNum = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --- ESTADO DO BANCO DE DADOS ---
let DB = {
    filamentos: [], extras: [], receitas: [],
    estoqueProntos: [], historicoProducao: [], historicoVendas: [], historicoPerdas: [],
    historicoGastos: []
};
let simulacaoAtual = null;
let editandoReceitaId = null;

// --- INTEGRAÇÃO COM GITHUB GISTS ---
let GITHUB_TOKEN = localStorage.getItem('github_token');
let GIST_ID = localStorage.getItem('gist_id');

async function iniciarNuvem() {
    if (!GITHUB_TOKEN || !GIST_ID) {
        const inputDados = prompt("☁️ Bem-vindo! Cole as chaves (Token + ID Gist):");
        if (inputDados) {
            const tokenMatch = inputDados.match(/(ghp_[a-zA-Z0-9]+)/);
            if (tokenMatch) {
                GITHUB_TOKEN = tokenMatch[1];
                GIST_ID = inputDados.replace(GITHUB_TOKEN, '').replace(/[^a-zA-Z0-9]/g, '').trim();
                localStorage.setItem('github_token', GITHUB_TOKEN);
                localStorage.setItem('gist_id', GIST_ID);
            }
        }
    }
    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!response.ok) throw new Error("Falha na conexão.");
        const data = await response.json();
        const cloudDB = JSON.parse(data.files['database.json'].content);
        Object.assign(DB, cloudDB);
        iniciarApp(); 
    } catch (e) { iniciarApp(); }
}

async function salvarDB() {
    if (GITHUB_TOKEN && GIST_ID) {
        try {
            await fetch(`https://api.github.com/gists/${GIST_ID}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'database.json': { content: JSON.stringify(DB) } } })
            });
        } catch (e) { console.error("Erro ao salvar:", e); }
    }
}

// --- NAVEGAÇÃO ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        e.target.classList.add('active');
        if(tabId === 'tab-calc') atualizarSelectsDinamicos();
        if(tabId === 'tab-catalogo') renderizarCatalogo();
        if(tabId === 'tab-fabrica') { atualizarSelectsDinamicos(); atualizarSelectProducao(); }
        if(tabId === 'tab-inv') renderizarInventario();
        if(tabId === 'tab-vendas') renderizarAbaVendas();
        if(tabId === 'tab-hist') renderizarHistoricos();
    });
});

// --- LÓGICA DE SIMULAÇÃO (Incluindo Rendimento) ---
document.getElementById('form-calc').addEventListener('submit', (e) => {
    e.preventDefault();
    const rende = parseInt(document.getElementById('calc-rende').value) || 1;
    // ... (o cálculo de custo permanece igual, mas agora dividimos pelo 'rende')
    const custoTotalFornada = ...; // (seu cálculo original)
    const custoUnitario = custoTotalFornada / rende;
    
    // Guarde 'custoUnitario' e 'rende' no objeto simulacaoAtual
    simulacaoAtual = { ..., custoUnitario, rende };
    // ...
});

function iniciarApp() { atualizarSelectsDinamicos(); }
document.addEventListener('DOMContentLoaded', iniciarNuvem);